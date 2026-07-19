export type WahbLinkIntent =
  | { type: 'content'; contentId: string }
  | { type: 'verify-email'; token: string }
  | { type: 'reset-password'; token: string };

const publicHost = 'wahb.salehspace.dev';

/** Parses public Universal Links and the private app fallback without logging URL secrets. */
export function parseWahbLink(urlValue: string): WahbLinkIntent | null {
  try {
    const url = new URL(urlValue);
    const isPublic = url.protocol === 'https:' && url.hostname === publicHost;
    const isPrivate = url.protocol === 'wahb:';
    if (!isPublic && !isPrivate) {
      return null;
    }
    const path = isPrivate ? `/${url.hostname}${url.pathname}` : url.pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'content' && parts[1]) {
      return { contentId: parts[1], type: 'content' };
    }
    const token = url.searchParams.get('token');
    if (parts[0] === 'verify-email' && token) {
      return { token, type: 'verify-email' };
    }
    if (parts[0] === 'reset-password' && token) {
      return { token, type: 'reset-password' };
    }
    return null;
  } catch {
    return null;
  }
}
