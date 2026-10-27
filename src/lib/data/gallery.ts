import 'server-only';
import type { GalleryRepository } from '@/types/gallery';
import { mockPosts } from './mock';
import { InstagramClient, InstagramError } from '../instagram/api';
import { accessToken, required } from '../instagram/session';

const repository: GalleryRepository = { async getPosts() {
  const source = process.env.GALLERY_SOURCE || 'mock';
  if (source === 'mock') return mockPosts;
  if (source !== 'instagram') throw new InstagramError('configuration', 503);
  const client = new InstagramClient(await accessToken(), required('INSTAGRAM_API_VERSION'));
  return client.posts(required('INSTAGRAM_USERNAME'));
} };
export const getGalleryPosts = () => repository.getPosts();
