// Fetch wrapper for our backend: adds the trial access code, remembered in this browser.

const KEY = 'tutor.accessCode';

export function getAccessCode(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setAccessCode(code: string): void {
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable (private mode): the code just won't be remembered.
  }
}

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const code = getAccessCode();
  if (code) headers.set('x-access-code', code);
  return fetch(path, { ...init, headers });
}
