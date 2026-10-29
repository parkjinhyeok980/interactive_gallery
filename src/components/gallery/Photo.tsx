'use client';
import Image, { getImageProps } from 'next/image';
import { memo, useEffect, useMemo, useState } from 'react';
import type { GalleryMedia } from '@/types/gallery';
import { cachedPreview, loadPreview } from './previewQueue';
export const Photo = memo(function Photo({ media, sizes, priority = false, enabled = true, initialPreview }: { media: GalleryMedia; sizes: string; priority?: boolean; enabled?: boolean; initialPreview?: { url: string; width: number; height: number } }) {
  const [failed, setFailed] = useState(false);
  const [direct, setDirect] = useState(false);
  const [fullLoaded, setFullLoaded] = useState(false);
  const original = media.type === 'VIDEO' ? media.thumbnailUrl : media.url;
  const source = media.cachedImageUrl || original;
  const previewUrl = useMemo(() => !priority && source ? getImageProps({ src: source, alt: '', width: 192, height: 192 }).props.src : '', [source, priority]);
  const [preview, setPreview] = useState<string | undefined>(() => cachedPreview(previewUrl));
  useEffect(() => {
    if (priority || !source || !enabled) return;
    let cancelled = false;
    const fallback = original && original !== source
      ? getImageProps({ src: original, alt: '', width: 192, height: 192 }).props.src
      : previewUrl;
    setFailed(false);
    const subscription = loadPreview(previewUrl, fallback);
    subscription.promise.then(url => { if (!cancelled) setPreview(url); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; subscription.release(); };
  }, [source, original, previewUrl, priority, enabled]);
  if (failed || !source) return <span className="image-fallback">{media.type === 'VIDEO' ? '영상 보기' : '이미지를 불러올 수 없습니다'}</span>;
  // Full resolution is requested only for the selected photo.
  if (priority) return <Image src={direct ? original || source : source} alt={media.alt} width={initialPreview?.width || media.width} height={initialPreview?.height || media.height}
    style={initialPreview && !fullLoaded ? { backgroundImage: `url(${JSON.stringify(initialPreview.url)})`, backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } : undefined}
    unoptimized={direct} sizes={sizes} draggable={false} priority onLoad={() => setFullLoaded(true)} onError={() => { if (!direct) setDirect(true); else setFailed(true); }} />;
  return <span className="photo-placeholder">{preview && <img src={preview} alt={media.alt} loading="lazy" decoding="async" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</span>;
});
