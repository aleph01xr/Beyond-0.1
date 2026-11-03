/**
 * Centralized API & WebSocket backend connection configuration.
 * Supports:
 * - Unified Render deployment (relative URL fallback)
 * - Decoupled Vercel frontend pointing to Render Singapore via VITE_SERVER_URL
 */

export const BACKEND_URL = (
  (import.meta.env.VITE_SERVER_URL as string | undefined) || ''
).replace(/\/+$/, '');

export function getApiEndpoint(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${normalizedPath}`;
}

export function getWsUrl(token: string): string {
  if (BACKEND_URL) {
    const isSecure = BACKEND_URL.startsWith('https:');
    const host = BACKEND_URL.replace(/^https?:\/\//, '');
    const proto = isSecure ? 'wss:' : 'ws:';
    return `${proto}//${host}/ws?token=${encodeURIComponent(token)}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}
