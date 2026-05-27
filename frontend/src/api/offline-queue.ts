const DB_NAME = 'drinklog-offline'
const STORE = 'pending-mutations'
const DB_VERSION = 1
const MAX_PENDING = 1000

export interface PendingMutation {
  id: string
  url: string
  method: string
  body: string
  createdAt: number
  /**
   * Username of the session that enqueued this mutation. Stamped at enqueue
   * time so the drain path can refuse to replay a previous user's writes
   * under a new user's credentials on a shared device. Items without a
   * username (legacy / corrupted) are treated as foreign and deleted on
   * sight by the drain.
   */
  username: string
}

export const queueEvents = new EventTarget()

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  }))
}

export async function enqueueMutation(
  mutation: Omit<PendingMutation, 'id' | 'createdAt'>,
): Promise<PendingMutation> {
  if (!mutation.username) throw new Error('Cannot enqueue without an authenticated username')
  const count = await run<number>('readonly', s => s.count())
  if (count >= MAX_PENDING) throw new Error('Offline queue is full')
  const entry: PendingMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  await run<IDBValidKey>('readwrite', s => s.add(entry))
  queueEvents.dispatchEvent(new Event('change'))
  return entry
}

export async function listMutations(): Promise<PendingMutation[]> {
  const all = await run<PendingMutation[]>('readonly', s => s.getAll())
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function removeMutation(id: string): Promise<void> {
  await run<undefined>('readwrite', s => s.delete(id))
  queueEvents.dispatchEvent(new Event('change'))
}

export async function countMutations(): Promise<number> {
  try {
    return await run<number>('readonly', s => s.count())
  } catch {
    return 0
  }
}

export async function clearMutations(): Promise<void> {
  await run<undefined>('readwrite', s => s.clear())
  queueEvents.dispatchEvent(new Event('change'))
}
