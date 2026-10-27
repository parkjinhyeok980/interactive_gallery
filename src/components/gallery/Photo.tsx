'use client';
import Image from 'next/image';
import { memo, useState } from 'react';
import type { GalleryMedia } from '@/types/gallery';
export const Photo = memo(function Photo({ media, sizes, priority = false }: { media: GalleryMedia; sizes: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const source = media.type === 'VIDEO' ? media.thumbnailUrl : media.url;
  return failed || !source ? <span className="image-fallback">{media.type === 'VIDEO' ? '영상 보기' : '이미지를 불러올 수 없습니다'}</span> : <Image src={source} alt={media.alt} fill sizes={sizes} draggable={false} priority={priority} onError={() => setFailed(true)} />;
});
