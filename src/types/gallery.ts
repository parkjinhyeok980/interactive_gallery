export type GalleryMedia = {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  alt: string;
};
export type GalleryPost = {
  id: string;
  type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  caption: string;
  timestamp: string;
  permalink: string | null;
  media: GalleryMedia[];
  isMock: boolean;
};
export type GalleryRepository = { getPosts: () => Promise<GalleryPost[]> };
export type GalleryPage = { posts: GalleryPost[]; nextCursor: string | null };
