import 'server-only';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { GalleryPage } from '@/types/gallery';
import { ImageCache } from './imageCache';

const state = globalThis as typeof globalThis & { galleryImages?: ImageCache };
export const imageCache = state.galleryImages ??= new ImageCache(process.env.GALLERY_IMAGE_CACHE_DIR ||
  path.join(process.env.VERCEL ? tmpdir() : process.cwd(), '.gallery-image-cache'));

export async function cacheImageSources(page: GalleryPage, account: string): Promise<GalleryPage> {
  return { ...page, posts: await Promise.all(page.posts.map(async post => ({ ...post,
    media: await Promise.all(post.media.map(async media => {
      const source = media.type === 'VIDEO' ? media.thumbnailUrl : media.url;
      if (!source) return media;
      try {
        const key = await imageCache.register(account, `${media.id}:${media.type}`, source);
        return { ...media, cachedImageUrl: `/api/instagram/image/${key}` };
      } catch { return media; } // Read-only storage keeps the existing CDN path usable.
    })),
  }))) };
}
