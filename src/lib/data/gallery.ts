import 'server-only';
import { createHash } from 'node:crypto';
import type { GalleryPage, GalleryRepository } from '@/types/gallery';
import { mockPosts } from './mock';
import { InstagramClient, InstagramError } from '../instagram/api';
import { accessToken, required } from '../instagram/session';
import { PageCache } from './pageCache';
import { cacheImageSources } from '../media/serverCache';

const processState = globalThis as typeof globalThis & { instagramPages?: PageCache<GalleryPage>; instagramClients?: PageCache<InstagramClient> };
const pages = processState.instagramPages ??= new PageCache<GalleryPage>();
const clients = processState.instagramClients ??= new PageCache<InstagramClient>(300_000, 10);
export async function getGalleryPage(after?: string): Promise<GalleryPage> {
  const source = process.env.GALLERY_SOURCE || 'mock';
  if (source === 'mock') {
    if (after !== undefined && after !== '25') throw new InstagramError('pagination', 400);
    return { posts: after ? mockPosts.slice(25) : mockPosts.slice(0, 25), nextCursor: after ? null : '25' };
  }
  if (source !== 'instagram') throw new InstagramError('configuration', 503);
  const token = await accessToken(), version = required('INSTAGRAM_API_VERSION'), username = required('INSTAGRAM_USERNAME');
  // Credential/account changes cannot reuse another connection's cached pages.
  const key = createHash('sha256').update(JSON.stringify([token, version, username, after || null])).digest('hex');
  const clientKey = createHash('sha256').update(JSON.stringify([token, version, username])).digest('hex');
  const client = await clients.get(clientKey, async () => new InstagramClient(token, version));
  return pages.get(key, async () => cacheImageSources(await client.postsPage(username, after), username));
}

const repository: GalleryRepository = { async getPosts() {
  const source = process.env.GALLERY_SOURCE || 'mock';
  if (source === 'mock') return mockPosts;
  if (source !== 'instagram') throw new InstagramError('configuration', 503);
  const client = new InstagramClient(await accessToken(), required('INSTAGRAM_API_VERSION'));
  return client.posts(required('INSTAGRAM_USERNAME'));
} };
export const getGalleryPosts = () => repository.getPosts();
