'use client';
import Image from 'next/image';
import { memo, useState } from 'react';
import type { GalleryMedia } from '@/types/gallery';
export const Photo = memo(function Photo({ media, sizes, priority = false }: { media: GalleryMedia; sizes: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="image-fallback">이미지를 불러올 수 없습니다</span> : <Image src={media.type === 'VIDEO' ? media.thumbnailUrl || media.url : media.url} alt={media.alt} fill sizes={sizes} draggable={false} priority={priority} onError={() => setFailed(true)} />;
});
