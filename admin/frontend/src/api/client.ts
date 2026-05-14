import type { AdminUser, TemplateOption, ImportRequest, Module } from '../types';

const TOKEN_KEY = 'admin_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new ApiError(401, 'Session expired');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text);
  }
  return res.json() as Promise<T>;
}

export async function login(password: string): Promise<void> {
  const data = await apiFetch<{ access_token: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
  setToken(data.access_token);
}

export async function fetchUsers(): Promise<AdminUser[]> {
  return apiFetch('/api/admin/users');
}

export async function createUser(username: string, password: string): Promise<void> {
  await apiFetch('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function changePassword(userId: number, newPassword: string): Promise<void> {
  await apiFetch(`/api/admin/users/${userId}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export async function deleteUser(userId: number): Promise<void> {
  await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
}

export async function fetchUserTemplates(userId: number, module: Module): Promise<TemplateOption[]> {
  return apiFetch(`/api/admin/users/${userId}/templates?module=${module}`);
}

export async function postImport(userId: number, body: ImportRequest): Promise<{ inserted: number }> {
  return apiFetch(`/api/admin/users/${userId}/import`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
