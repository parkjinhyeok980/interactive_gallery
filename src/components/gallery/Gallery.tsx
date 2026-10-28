'use client';
import { useCallback, useState } from 'react';
import type { GalleryPost } from '@/types/gallery';
import { ROW_PITCH, type RepeatedTile } from '@/lib/gallery/geometry';
import { useCamera } from './useCamera';
import { Detail, Selection } from './Detail';
import { Photo } from './Photo';

export function Gallery({ posts }: { posts: GalleryPost[] }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedTile, setSelectedTile] = useState<RepeatedTile | null>(null);
  const { viewportRef, planeRef, tiles: visible, dragged } = useCamera(posts.length, !!selection);
  const close = useCallback(() => { setSelection(null); setSelectedTile(null); }, []);
  const tiles = [...visible];
  if (selectedTile && !tiles.some(tile => tile.key === selectedTile.key)) tiles.push(selectedTile);
  const rows = new Map<number, RepeatedTile[]>();
  for (const tile of tiles) {
    const row = Math.round(tile.y / ROW_PITCH);
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(tile);
  }
  return <main className="gallery-shell">
    <div className="gallery-ui" inert={!!selection}>
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="hyeoki_foodie 갤러리 처음으로">hyeoki_foodie</a>
      </header>
    </div>
    <div ref={viewportRef} className="gallery-viewport" tabIndex={0} role="region" aria-label="음식 사진 갤러리" aria-describedby="keyboard-help" inert={!!selection}>
      <p id="keyboard-help" className="sr-only">마우스로 드래그하여 이동하고 휠로 확대·축소합니다. 더하기와 빼기로도 확대·축소하고 Home으로 처음 위치로 돌아갑니다. Tab으로 사진을 선택하고 Enter로 엽니다. 모바일에서는 드래그와 두 손가락 확대를 사용할 수 있습니다.</p>
      <div className="gallery-plane" ref={planeRef}>
        {[...rows].map(([row, rowTiles]) => <div className="gallery-row" key={row} data-direction={row % 2 === 0 ? 1 : -1} style={{ top: row * ROW_PITCH, height: rowTiles[0].height }}>
        {rowTiles.map(tile => {
          const post = selectedTile?.key === tile.key && selection ? selection.post : posts[tile.index];
          return <button className="photo-tile" key={tile.key} data-cell={tile.key} style={{ left: tile.x, top: 0, width: tile.width, height: tile.height }} aria-label={`${tile.index + 1}번 ${post.media[0].alt}${post.media.length > 1 ? ', 여러 사진' : ''} 상세 보기`} onClick={e => {
            if (dragged.current && e.detail !== 0) return;
            const r = e.currentTarget.getBoundingClientRect();
            const preview = e.currentTarget.querySelector('img');
            setSelectedTile(tile);
            setSelection({ post, trigger: e.currentTarget, rect: { left: r.left, top: r.top, width: r.width, height: r.height },
              preview: preview?.naturalWidth ? { url: preview.currentSrc, width: preview.naturalWidth, height: preview.naturalHeight } : undefined });
          }}><Photo key={post.media[0].id} media={post.media[0]} sizes="192px" /></button>;
        })}</div>)}
      </div>
      {!posts.length && <p className="empty-gallery">아직 표시할 사진이 없습니다.</p>}
    </div>
    {selection && <Detail selection={selection} onClose={close} planeRef={planeRef} />}
  </main>;
}
