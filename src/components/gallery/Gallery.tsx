'use client';
import { memo, useCallback, useMemo, useState, type RefObject } from 'react';
import type { GalleryPost } from '@/types/gallery';
import { layoutMetrics, ROW_PITCH, TILE_SIZE, type RepeatedTile } from '@/lib/gallery/geometry';
import { useCamera } from './useCamera';
import { Detail, Selection } from './Detail';
import { Photo } from './Photo';

const GalleryTile = memo(function GalleryTile({ tile, post, dragged, onSelect }: {
  tile: RepeatedTile; post: GalleryPost; dragged: RefObject<boolean>;
  onSelect: (tile: RepeatedTile, selection: Selection) => void;
}) {
  return <button className="photo-tile" data-cell={tile.key} style={{ left: tile.x, top: 0, width: tile.width, height: tile.height }} aria-label={`${tile.index + 1}번 ${post.media[0].alt}${post.media.length > 1 ? ', 여러 사진' : ''} 상세 보기`} onClick={e => {
    if (dragged.current && e.detail !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const preview = e.currentTarget.querySelector('img');
    onSelect(tile, { post, trigger: e.currentTarget, rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      preview: preview?.naturalWidth ? { url: preview.currentSrc, width: preview.naturalWidth, height: preview.naturalHeight } : undefined });
  }}><Photo key={post.media[0].id} media={post.media[0]} sizes="192px" /></button>;
});

export const Gallery = memo(function Gallery({ posts }: { posts: GalleryPost[] }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedTile, setSelectedTile] = useState<RepeatedTile | null>(null);
  const { viewportRef, planeRef, tiles: visible, dragged } = useCamera(posts.length, !!selection);
  const close = useCallback(() => { setSelection(null); setSelectedTile(null); }, []);
  const select = useCallback((tile: RepeatedTile, next: Selection) => {
    setSelectedTile(tile); setSelection(next);
  }, []);
  const rowCount = layoutMetrics(posts.length).rows;
  const rows = useMemo(() => {
    // Keep row animations alive even when their tiles are vertically culled.
    const grouped = Array.from({ length: rowCount }, () => [] as RepeatedTile[]);
    for (const tile of visible) grouped[Math.round(tile.y / ROW_PITCH)].push(tile);
    if (selectedTile && !visible.some(tile => tile.key === selectedTile.key)) {
      grouped[Math.round(selectedTile.y / ROW_PITCH)].push(selectedTile);
    }
    return grouped;
  }, [visible, selectedTile, rowCount]);
  return <main className="gallery-shell">
    <div className="gallery-ui" inert={!!selection}>
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="hyeoki_foodie 갤러리 처음으로">hyeoki_foodie</a>
      </header>
    </div>
    <div ref={viewportRef} className="gallery-viewport" tabIndex={0} role="region" aria-label="음식 사진 갤러리" aria-describedby="keyboard-help" inert={!!selection}>
      <p id="keyboard-help" className="sr-only">마우스로 드래그하여 이동하고 휠로 확대·축소합니다. 더하기와 빼기로도 확대·축소하고 Home으로 처음 위치로 돌아갑니다. Tab으로 사진을 선택하고 Enter로 엽니다. 모바일에서는 드래그와 두 손가락 확대를 사용할 수 있습니다.</p>
      <div className="gallery-plane" ref={planeRef}>
        {rows.map((rowTiles, row) => <div className="gallery-row" key={row} data-direction={row % 2 === 0 ? 1 : -1} style={{ top: row * ROW_PITCH, height: TILE_SIZE }}>
        {rowTiles.map(tile => {
          const post = selectedTile?.key === tile.key && selection ? selection.post : posts[tile.index];
          return <GalleryTile key={tile.key} tile={tile} post={post} dragged={dragged} onSelect={select} />;
        })}</div>)}
      </div>
      {!posts.length && <p className="empty-gallery">아직 표시할 사진이 없습니다.</p>}
    </div>
    {selection && <Detail selection={selection} onClose={close} planeRef={planeRef} />}
  </main>;
});
