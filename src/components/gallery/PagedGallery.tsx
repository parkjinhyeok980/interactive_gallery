'use client';
import { useEffect, useRef, useState } from 'react';
import type { GalleryPage } from '@/types/gallery';
import { Gallery } from './Gallery';

export function PagedGallery({ initialPage }: { initialPage: GalleryPage }) {
  const [posts, setPosts] = useState(initialPage.posts);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cursor = useRef(initialPage.nextCursor);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      while (cursor.current && !controller.signal.aborted) {
        const after = cursor.current;
        if (seen.current.has(after) || seen.current.size >= 39) throw new Error('pagination');
        const response = await fetch(`/api/instagram/posts?${new URLSearchParams({ after })}`, { signal: controller.signal });
        if (!response.ok) throw new Error('load failed');
        const page: GalleryPage = await response.json();
        if (controller.signal.aborted) return;
        if (!Array.isArray(page.posts) || (page.nextCursor !== null && typeof page.nextCursor !== 'string') || page.nextCursor === after) throw new Error('invalid page');
        seen.current.add(after);
        cursor.current = page.nextCursor;
        setPosts(current => {
          const ids = new Set(current.map(post => post.id));
          const added = page.posts.filter(post => {
            if (ids.has(post.id)) return false;
            ids.add(post.id);
            return true;
          });
          return added.length ? [...current, ...added] : current;
        });
      }
    };
    load().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [attempt]);
  return <>
    <Gallery posts={posts} />
    {failed && <div className="gallery-load-error" role="status">이전 사진을 더 불러오지 못했습니다. <button onClick={() => { setFailed(false); setAttempt(value => value + 1); }}>다시 시도</button></div>}
  </>;
}
