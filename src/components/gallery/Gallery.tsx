'use client';
import { useCallback, useMemo, useState } from 'react';
import type { GalleryPost } from '@/types/gallery';
import { createLayout, isVisible } from '@/lib/gallery/geometry';
import { useCamera } from './useCamera';
import { Detail, Selection } from './Detail';
import { Photo } from './Photo';

export function Gallery({ posts }: { posts: GalleryPost[] }) {
  const layout = useMemo(() => createLayout(posts.length), [posts.length]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const { viewportRef, planeRef, view, dragged } = useCamera(layout, !!selection);
  const close = useCallback(() => setSelection(null), []);
  return <main className="gallery-shell">
    <div className="gallery-ui" inert={!!selection}>
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Hyeoki 갤러리 처음으로">hyeoki</a>
      </header>
    </div>
    <div ref={viewportRef} className="gallery-viewport" tabIndex={0} role="region" aria-label="음식 사진 갤러리" aria-describedby="keyboard-help" inert={!!selection}>
      <p id="keyboard-help" className="sr-only">방향키로 이동, 더하기와 빼기로 확대와 축소, Home으로 처음 위치로 돌아갑니다. Tab으로 사진을 선택하고 Enter로 엽니다. 모바일에서는 드래그와 두 손가락 확대를 사용할 수 있습니다.</p>
      <div className="gallery-plane" ref={planeRef} style={{ width: layout.width, height: layout.height }}>
        {layout.tiles.filter(tile => isVisible(tile, view.camera, view.size) || selection?.post.id === posts[tile.index].id).map(tile => {
          const post = posts[tile.index];
          return <button className="photo-tile" key={post.id} style={{ left: tile.x, top: tile.y, width: tile.width, height: tile.height }} aria-label={`${tile.index + 1}번 ${post.media[0].alt}${post.media.length > 1 ? ', 여러 사진' : ''} 상세 보기`} onClick={e => {
            if (dragged.current && e.detail !== 0) return;
            const r = e.currentTarget.getBoundingClientRect();
            setSelection({ post, trigger: e.currentTarget, rect: { left: r.left, top: r.top, width: r.width, height: r.height } });
          }}><Photo media={post.media[0]} sizes="(max-width: 700px) 200px, 360px" /></button>;
        })}
      </div>
      {!posts.length && <p className="empty-gallery">아직 표시할 사진이 없습니다.</p>}
    </div>
    {selection && <Detail selection={selection} onClose={close} />}
  </main>;
}
