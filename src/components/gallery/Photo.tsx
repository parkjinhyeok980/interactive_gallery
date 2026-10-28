'use client';
import Image, { getImageProps } from 'next/image';
import { memo, useEffect, useState } from 'react';
import type { GalleryMedia } from '@/types/gallery';
import { loadPreview } from './previewQueue';
export const Photo = memo(function Photo({ media, sizes, priority = false, enabled = true }: { media: GalleryMedia; sizes: string; priority?: boolean; enabled?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [direct, setDirect] = useState(false);
  const [preview, setPreview] = useState<string>();
  const original = media.type === 'VIDEO' ? media.thumbnailUrl : media.url;
  const source = media.cachedImageUrl || original;
  useEffect(() => {
    if (priority || !source || !enabled) return;
    let cancelled = false;
    const { props } = getImageProps({ src: source, alt: '', width: 192, height: 192 });
    const fallback = getImageProps({ src: original || source, alt: '', width: 192, height: 192 }).props.src;
    setFailed(false);
    const subscription = loadPreview(props.src, fallback);
    subscription.promise.then(url => { if (!cancelled) setPreview(url); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; subscription.release(); };
  }, [source, original, priority, enabled]);
  if (failed || !source) return <span className="image-fallback">{media.type === 'VIDEO' ? '영상 보기' : '이미지를 불러올 수 없습니다'}</span>;
  // Full resolution is requested only for the selected photo.
  if (priority) return <Image src={direct ? original || source : source} alt={media.alt} fill unoptimized={direct} sizes={sizes} draggable={false} priority onError={() => { if (!direct) setDirect(true); else setFailed(true); }} />;
  return <span className="photo-placeholder">{preview && <img src={preview} alt={media.alt} loading="lazy" decoding="async" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>;
});
