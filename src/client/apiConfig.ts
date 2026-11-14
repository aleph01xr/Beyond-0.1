/**
 * Centralized API & WebSocket backend connection configuration.
 * Supports:
 * - Unified Render deployment (relative URL fallback)
 * - Decoupled Vercel / Itch.io frontend pointing to Render backend via VITE_SERVER_URL or automatic fallback
 */

export const BACKEND_URL = (
  (import.meta.env.VITE_SERVER_URL as string | undefined) ||
  (typeof window !== 'undefined' &&
  (window.location.hostname.includes('itch.io') || window.location.hostname.includes('vercel.app'))
    ? 'https://beyond-game-sg.onrender.com'
    : '')
).replace(/\/+$/, '');

export function getApiEndpoint(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${normalizedPath}`;
}

export function getWsUrl(): string {
  if (BACKEND_URL) {
    const isSecure = BACKEND_URL.startsWith('https:');
    const host = BACKEND_URL.replace(/^https?:\/\//, '');
    const proto = isSecure ? 'wss:' : 'ws:';
    return `${proto}//${host}/ws`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}
