// Server callers only: do not return raw API responses or errors to the browser.
import type { GalleryMedia, GalleryPage, GalleryPost } from '../../types/gallery';

export class InstagramError extends Error {
  constructor(public readonly code: 'configuration' | 'authentication' | 'rate_limit' | 'upstream' | 'pagination', public readonly status = 502) {
    super(`Instagram: ${code}`);
  }
}

type Media = { id: string; media_type: string; media_url?: string; thumbnail_url?: string; caption?: string; timestamp?: string; permalink?: string; children?: Page<Media> };
type Page<T> = { data: T[]; paging?: { next?: string; cursors?: { after?: string } } };
type Fetcher = typeof fetch;
const mediaFields = 'id,media_type,media_url,thumbnail_url,caption,timestamp,permalink,children.limit(100){id,media_type,media_url,thumbnail_url}';

export async function requestJson<T>(url: URL, init: RequestInit = {}, fetcher: Fetcher = fetch): Promise<T> {
  try {
    const response = await fetcher(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const body = await response.json();
    if (!response.ok || body.error || body.error_type) {
      const code = body.error?.code;
      if (response.status === 401 || code === 190 || code === 102) throw new InstagramError('authentication', 401);
      if (response.status === 429 || [4, 17, 32, 613].includes(code)) throw new InstagramError('rate_limit', 429);
      throw new InstagramError('upstream');
    }
    return body as T;
  } catch (error) {
    if (error instanceof InstagramError) throw error;
    // Fetch errors can contain token-bearing URLs. Never propagate them.
    throw new InstagramError('upstream');
  }
}

function mediaUrl(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password &&
      ['cdninstagram.com', 'fbcdn.net'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return url.href;
  } catch { /* unavailable media */ }
}

export function normalizePost(post: Media, children: Media[] = []): GalleryPost | null {
  if (!post.id || !['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM'].includes(post.media_type)) return null;
  const timestamp = post.timestamp?.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return null;
  const media = (post.media_type === 'CAROUSEL_ALBUM' ? children : [post]).flatMap((item, index): GalleryMedia[] => {
    const url = mediaUrl(item.media_url);
    if (!item.id || !url || !['IMAGE', 'VIDEO'].includes(item.media_type)) return [];
    return [{ id: item.id, type: item.media_type as 'IMAGE' | 'VIDEO', url,
      thumbnailUrl: mediaUrl(item.thumbnail_url), width: 1080, height: 1080,
      alt: post.caption?.trim().slice(0, 160) || `Instagram 게시물 ${index + 1}` }];
  });
  if (!media.length) return null;
  let permalink: string | null = null;
  try {
    const url = new URL(post.permalink || '');
    if (url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) && !url.username && !url.password) permalink = url.href;
  } catch { /* no original link */ }
  return { id: post.id, type: post.media_type as GalleryPost['type'], caption: post.caption || '',
    timestamp: new Date(timestamp).toISOString(), permalink, media, isMock: false };
}

export class InstagramClient {
  constructor(private token: string, private version: string, private fetcher: Fetcher = fetch) {
    if (!token || !/^v\d+\.\d+$/.test(version)) throw new InstagramError('configuration', 503);
  }
  async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`https://graph.instagram.com/${this.version}/${path}`);
    url.search = new URLSearchParams(params).toString();
    return requestJson<T>(url, { headers: { Authorization: `Bearer ${this.token}` } }, this.fetcher);
  }
  async profile(expectedUsername: string) {
    const profile = await this.get<{ user_id: string; username: string }>('me', { fields: 'user_id,username' });
    if (!/^\d+$/.test(profile.user_id) || profile.username?.toLowerCase() !== expectedUsername.toLowerCase()) throw new InstagramError('authentication', 401);
    return profile;
  }
  async collection<T>(path: string, fields: string, maxPages = 40): Promise<T[]> {
    const items: T[] = [], seen = new Set<string>();
    let after: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const result = await this.get<Page<T>>(path, { fields, limit: '25', ...(after ? { after } : {}) });
      if (!Array.isArray(result.data)) throw new InstagramError('upstream');
      items.push(...result.data);
      if (!result.paging?.next) return items;
      // Rebuild requests from cursors. Never follow a returned URL containing tokens.
      after = result.paging.cursors?.after;
      if (!after || seen.has(after)) throw new InstagramError('pagination');
      seen.add(after);
    }
    throw new InstagramError('pagination');
  }
  async posts(expectedUsername: string): Promise<GalleryPost[]> {
    const profile = await this.profile(expectedUsername);
    const raw = await this.collection<Media>(`${profile.user_id}/media`, mediaFields);
    return this.normalizeBatch(raw);
  }
  async postsPage(expectedUsername: string, after?: string): Promise<GalleryPage> {
    if (after !== undefined && (!after || after.length > 4096)) throw new InstagramError('pagination', 400);
    const profile = await this.profile(expectedUsername);
    const result = await this.get<Page<Media>>(`${profile.user_id}/media`, {
      fields: mediaFields, limit: '25', ...(after ? { after } : {}),
    });
    if (!Array.isArray(result.data)) throw new InstagramError('upstream');
    const nextCursor = result.paging?.next ? result.paging.cursors?.after : null;
    if (result.paging?.next && (typeof nextCursor !== 'string' || !nextCursor || nextCursor.length > 4096 || nextCursor === after)) throw new InstagramError('pagination');
    return { posts: await this.normalizeBatch(result.data), nextCursor: nextCursor || null };
  }
  private async normalizeBatch(raw: Media[]): Promise<GalleryPost[]> {
    const result = new Map<string, GalleryPost>();
    // Bounded concurrency for carousel requests to avoid a burst of API calls.
    for (let offset = 0; offset < raw.length; offset += 4) {
      const batch = await Promise.all(raw.slice(offset, offset + 4).map(async post => {
        if (!/^\d+$/.test(post.id)) throw new InstagramError('upstream');
        const children = post.media_type !== 'CAROUSEL_ALBUM' ? []
          : Array.isArray(post.children?.data) && !post.children.paging?.next ? post.children.data
          : await this.collection<Media>(`${post.id}/children`, 'id,media_type,media_url,thumbnail_url', 4);
        return normalizePost(post, children);
      }));
      for (const post of batch) if (post) result.set(post.id, post);
    }
    return [...result.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  }
}
