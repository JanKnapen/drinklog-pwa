import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchUsers, createUser, changePassword, deleteUser, getToken, ApiError } from '../api/client';
import type { AdminUser, Module, RawImportEntry, ImportSession } from '../types';

type Modal =
  | { kind: 'create' }
  | { kind: 'password'; user: AdminUser }
  | { kind: 'delete'; user: AdminUser }
  | { kind: 'upload'; user: AdminUser }
  | null;

const IMPORT_SESSION_KEY = 'drinklog-import-session';

const FORMAT_EXAMPLE = `[
  { "name": "Heineken", "date": "2024-01-15" },
  { "name": "Heineken", "timestamp": "2024-01-15T20:30:00" },
  { "name": "Espresso", "date": "2024-01-16", "count": 2 }
]

Fields:
  name      — drink name (required)
  date      — YYYY-MM-DD, sets time to 00:00 (required if no timestamp)
  timestamp — ISO datetime string (optional, takes precedence over date)
  count     — number of entries to create (optional, default 1)`;

function validateImportJson(raw: unknown): RawImportEntry[] {
  if (!Array.isArray(raw)) throw new Error('File must contain a JSON array.');
  if (raw.length > 10_000) throw new Error(`Too many entries (${raw.length}). Maximum is 10,000.`);
  return raw.map((item: unknown, i: number) => {
    if (typeof item !== 'object' || item === null) throw new Error(`Item ${i + 1} is not an object.`);
    const obj = item as Record<string, unknown>;
    if (typeof obj.name !== 'string' || !obj.name.trim()) throw new Error(`Item ${i + 1} is missing a valid "name".`);
    if (!obj.date && !obj.timestamp) throw new Error(`Item ${i + 1} must have "date" or "timestamp".`);
    if (obj.date && typeof obj.date !== 'string') throw new Error(`Item ${i + 1}: "date" must be a string.`);
    if (obj.timestamp && typeof obj.timestamp !== 'string') throw new Error(`Item ${i + 1}: "timestamp" must be a string.`);
    if (obj.count !== undefined && (typeof obj.count !== 'number' || obj.count < 1 || !Number.isInteger(obj.count))) {
      throw new Error(`Item ${i + 1}: "count" must be a positive integer.`);
    }
    return {
      name: (obj.name as string).trim(),
      date: obj.date as string | undefined,
      timestamp: obj.timestamp as string | undefined,
      count: obj.count as number | undefined,
    };
  });
}

export default function UsersView() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Upload dialog state
  const [uploadModule, setUploadModule] = useState<Module>('alcohol');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [showFormatInfo, setShowFormatInfo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await fetchUsers());
      setError('');
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setNewUsername(''); setNewPassword(''); setFormError('');
    setModal({ kind: 'create' });
  }
  function openPassword(user: AdminUser) {
    setNewPassword(''); setFormError('');
    setModal({ kind: 'password', user });
  }
  function openDelete(user: AdminUser) {
    setFormError('');
    setModal({ kind: 'delete', user });
  }
  function openUpload(user: AdminUser) {
    setUploadModule('alcohol');
    setUploadFile(null);
    setUploadFileName('');
    setUploadError('');
    setShowFormatInfo(false);
    setModal({ kind: 'upload', user });
  }
  function closeModal() { setModal(null); setFormError(''); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setFormError('');
    try {
      await createUser(newUsername, newPassword);
      await load();
      closeModal();
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 409 ? 'Username already exists.' : 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.kind !== 'password') return;
    setSubmitting(true); setFormError('');
    try {
      await changePassword(modal.user.id, newPassword);
      closeModal();
    } catch {
      setFormError('Failed to change password.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (modal?.kind !== 'delete') return;
    setSubmitting(true); setFormError('');
    try {
      await deleteUser(modal.user.id);
      await load();
      closeModal();
    } catch {
      setFormError('Failed to delete user.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
    setUploadFileName(file?.name ?? '');
    setUploadError('');
  }

  async function handleOpenReview() {
    if (modal?.kind !== 'upload' || !uploadFile) return;
    setUploadError('');
    let entries: RawImportEntry[];
    try {
      const text = await uploadFile.text();
      const parsed = JSON.parse(text);
      entries = validateImportJson(parsed);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Invalid JSON file.');
      return;
    }
    if (entries.length === 0) {
      setUploadError('File contains no entries.');
      return;
    }
    const token = getToken();
    if (!token) return;
    const session: ImportSession = {
      token,
      userId: modal.user.id,
      username: modal.user.username,
      module: uploadModule,
      rawEntries: entries,
    };
    localStorage.setItem(IMPORT_SESSION_KEY, JSON.stringify(session));
    window.location.href = '/import-review';
    closeModal();
  }

  if (loading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Users</h2>
        <button onClick={openCreate} className="bg-blue-600 text-white text-sm rounded-md px-4 py-2 hover:bg-blue-700">
          Add user
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Username</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Alcohol entries</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Caffeine entries</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {users.map(user => (
              <tr key={user.id}>
                <td className="px-4 py-3 font-medium text-gray-900">{user.username}</td>
                <td className="px-4 py-3 text-right text-gray-600">{user.alcohol_entries}</td>
                <td className="px-4 py-3 text-right text-gray-600">{user.caffeine_entries}</td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => openUpload(user)} className="text-green-600 hover:text-green-800">Upload</button>
                  <button onClick={() => openPassword(user)} className="text-blue-600 hover:text-blue-800">Change password</button>
                  <button onClick={() => openDelete(user)} className="text-red-600 hover:text-red-800">Delete</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No users yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {users.map(user => (
          <div key={user.id} className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="font-medium text-gray-900 mb-1">{user.username}</p>
            <p className="text-xs text-gray-500 mb-3">{user.alcohol_entries} alcohol · {user.caffeine_entries} caffeine</p>
            <div className="flex gap-3">
              <button onClick={() => openUpload(user)} className="text-sm text-green-600">Upload</button>
              <button onClick={() => openPassword(user)} className="text-sm text-blue-600">Change password</button>
              <button onClick={() => openDelete(user)} className="text-sm text-red-600">Delete</button>
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="text-center text-gray-400 py-6">No users yet</p>}
      </div>

      {/* Create User Modal */}
      {modal?.kind === 'create' && (
        <ModalOverlay onClose={closeModal}>
          <h3 className="text-lg font-semibold mb-4">Add user</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <LabeledInput label="Username" value={newUsername} onChange={setNewUsername} type="text" />
            <LabeledInput label="Password" value={newPassword} onChange={setNewPassword} type="password" />
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <ModalActions onCancel={closeModal} submitLabel="Create" submitting={submitting} />
          </form>
        </ModalOverlay>
      )}

      {/* Change Password Modal */}
      {modal?.kind === 'password' && (
        <ModalOverlay onClose={closeModal}>
          <h3 className="text-lg font-semibold mb-1">Change password</h3>
          <p className="text-sm text-gray-500 mb-4">{modal.user.username}</p>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <LabeledInput label="New password" value={newPassword} onChange={setNewPassword} type="password" />
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <ModalActions onCancel={closeModal} submitLabel="Update" submitting={submitting} />
          </form>
        </ModalOverlay>
      )}

      {/* Delete Confirmation */}
      {modal?.kind === 'delete' && (
        <ModalOverlay onClose={closeModal}>
          <h3 className="text-lg font-semibold mb-2">Delete user?</h3>
          <p className="text-sm text-gray-600 mb-4">
            This will permanently delete <strong>{modal.user.username}</strong> and all their entries and templates. This cannot be undone.
          </p>
          {formError && <p className="text-sm text-red-600 mb-2">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={closeModal} className="text-sm text-gray-600 px-4 py-2">Cancel</button>
            <button
              onClick={handleDelete}
              disabled={submitting}
              className="text-sm bg-red-600 text-white rounded-md px-4 py-2 hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Upload / Import Modal */}
      {modal?.kind === 'upload' && (
        <ModalOverlay onClose={closeModal}>
          <h3 className="text-lg font-semibold mb-1">Import data</h3>
          <p className="text-sm text-gray-500 mb-4">{modal.user.username}</p>

          {/* Module toggle */}
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Data type</p>
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setUploadModule('alcohol')}
                className={`px-4 py-2 text-sm ${uploadModule === 'alcohol' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Alcohol
              </button>
              <button
                type="button"
                onClick={() => setUploadModule('caffeine')}
                className={`px-4 py-2 text-sm border-l border-gray-300 ${uploadModule === 'caffeine' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                Caffeine
              </button>
            </div>
          </div>

          {/* File picker */}
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">JSON file</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm border border-gray-300 rounded-md px-3 py-2 hover:bg-gray-50"
              >
                Choose file
              </button>
              <span className="text-sm text-gray-500 truncate max-w-[180px]">
                {uploadFileName || 'No file chosen'}
              </span>
              <button
                type="button"
                onClick={() => setShowFormatInfo(v => !v)}
                title="Show expected file format"
                className="ml-auto text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Format info panel */}
          {showFormatInfo && (
            <div className="mb-4 rounded-md bg-gray-50 border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-700 mb-2">Expected file format</p>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono">{FORMAT_EXAMPLE}</pre>
            </div>
          )}

          {uploadError && <p className="text-sm text-red-600 mb-3">{uploadError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeModal} className="text-sm text-gray-600 px-4 py-2">Cancel</button>
            <button
              type="button"
              onClick={handleOpenReview}
              disabled={!uploadFile}
              className="text-sm bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
            >
              Open review
            </button>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, type }: {
  label: string; value: string; onChange: (v: string) => void; type: 'text' | 'password';
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function ModalActions({ onCancel, submitLabel, submitting }: {
  onCancel: () => void; submitLabel: string; submitting: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="text-sm text-gray-600 px-4 py-2">Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        className="text-sm bg-blue-600 text-white rounded-md px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? `${submitLabel}…` : submitLabel}
      </button>
    </div>
  );
}
