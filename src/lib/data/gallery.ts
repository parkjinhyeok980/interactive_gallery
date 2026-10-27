import 'server-only';
import type { GalleryRepository } from '@/types/gallery';
import { mockPosts } from './mock';

// Swap this repository for a server-side Instagram adapter in Phase 2.
const repository: GalleryRepository = { async getPosts() { return mockPosts; } };
export const getGalleryPosts = () => repository.getPosts();
