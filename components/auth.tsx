// components/auth.tsx
export const API_BASE =
    (import.meta as any)?.env?.VITE_API_URL || 'http://localhost:3001';

export function getAccessToken(): string | null {
    // prefer a direct key
    const t = localStorage.getItem('accessToken');
    if (t) return t;

    // bridge: some code stores {accessToken} in a JSON "auth" blob
    try {
        const legacy = JSON.parse(localStorage.getItem('auth') || '{}');
        if (legacy?.accessToken) return legacy.accessToken;
    } catch { }

    // bridge: some code uses "token" key
    return localStorage.getItem('token');
}

/** Minimal fetch that attaches the token; throws on 401 */
export async function authFetch(path: string, options: RequestInit = {}) {
    const url = `${API_BASE}${path}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {})
    };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) throw new Error('SESSION_EXPIRED');
    return res;
}
