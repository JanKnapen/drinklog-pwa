import { useState, useEffect, useCallback } from 'react';
import { fetchUsers, createUser, changePassword, deleteUser, ApiError } from '../api/client';
import type { AdminUser } from '../types';

type Modal =
  | { kind: 'create' }
  | { kind: 'password'; user: AdminUser }
  | { kind: 'delete'; user: AdminUser }
  | null;

export default function UsersView() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

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

  if (loading) return <p className="text-gray-500 dark:text-gray-400">Loading…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400">{error}</p>;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Users</h2>
        <button onClick={openCreate} className="bg-blue-600 text-white text-sm rounded-md px-4 py-2 hover:bg-blue-700">
          Add user
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-400">Username</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Alcohol entries</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Caffeine entries</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {users.map(user => (
              <tr key={user.id}>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{user.username}</td>
                <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{user.alcohol_entries}</td>
                <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">{user.caffeine_entries}</td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => openPassword(user)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">Change password</button>
                  <button onClick={() => openDelete(user)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300">Delete</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 dark:text-gray-600">No users yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {users.map(user => (
          <div key={user.id} className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="font-medium text-gray-900 dark:text-gray-100 mb-1">{user.username}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{user.alcohol_entries} alcohol · {user.caffeine_entries} caffeine</p>
            <div className="flex gap-3">
              <button onClick={() => openPassword(user)} className="text-sm text-blue-600 dark:text-blue-400">Change password</button>
              <button onClick={() => openDelete(user)} className="text-sm text-red-600 dark:text-red-400">Delete</button>
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="text-center text-gray-400 dark:text-gray-600 py-6">No users yet</p>}
      </div>

      {/* Create User Modal */}
      {modal?.kind === 'create' && (
        <ModalOverlay onClose={closeModal}>
          <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Add user</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <LabeledInput label="Username" value={newUsername} onChange={setNewUsername} type="text" />
            <LabeledInput label="Password" value={newPassword} onChange={setNewPassword} type="password" />
            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <ModalActions onCancel={closeModal} submitLabel="Create" submitting={submitting} />
          </form>
        </ModalOverlay>
      )}

      {/* Change Password Modal */}
      {modal?.kind === 'password' && (
        <ModalOverlay onClose={closeModal}>
          <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-gray-100">Change password</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{modal.user.username}</p>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <LabeledInput label="New password" value={newPassword} onChange={setNewPassword} type="password" />
            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <ModalActions onCancel={closeModal} submitLabel="Update" submitting={submitting} />
          </form>
        </ModalOverlay>
      )}

      {/* Delete Confirmation */}
      {modal?.kind === 'delete' && (
        <ModalOverlay onClose={closeModal}>
          <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Delete user?</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            This will permanently delete <strong>{modal.user.username}</strong> and all their entries and templates. This cannot be undone.
          </p>
          {formError && <p className="text-sm text-red-600 dark:text-red-400 mb-2">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={closeModal} className="text-sm text-gray-600 dark:text-gray-400 px-4 py-2">Cancel</button>
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
    </>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
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
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required
        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function ModalActions({ onCancel, submitLabel, submitting }: {
  onCancel: () => void; submitLabel: string; submitting: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="text-sm text-gray-600 dark:text-gray-400 px-4 py-2">Cancel</button>
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
