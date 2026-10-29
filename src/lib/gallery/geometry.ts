export type Camera = { x: number; y: number; scale: number };
export type Size = { width: number; height: number };
export type Tile = { index: number; x: number; y: number; width: number; height: number };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 1.8;
export const TILE_SIZE = 280;
export const ROW_GAP = 24;
export const ROW_PITCH = TILE_SIZE + ROW_GAP;
export const EDGE_PADDING = 16;
export function fitScale(viewport: Size, world: Size) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (viewport.height - EDGE_PADDING * 2) / world.height));
}
export function layoutMetrics(count: number, _viewport?: Size, _scale?: number) {
  const rows = Math.max(1, Math.min(count || 1, 5));
  const columns = Math.max(1, Math.ceil(count / rows));
  return { rows, columns, width: columns * TILE_SIZE, height: rows * ROW_PITCH - ROW_GAP };
}
export function createLayout(count: number, viewport?: Size, scale = 0.5) {
  const metrics = layoutMetrics(count, viewport, scale);
  const tiles = Array.from({ length: count }, (_, cell) => ({
    index: cell, x: Math.floor(cell / metrics.rows) * TILE_SIZE, y: (cell % metrics.rows) * ROW_PITCH,
    width: TILE_SIZE, height: TILE_SIZE,
  }));
  return { tiles, ...metrics };
}
export function clampCamera(camera: Camera, viewport?: Size, world?: Size): Camera {
  const minimum = viewport?.height && world ? fitScale(viewport, world) : MIN_ZOOM;
  const scale = Math.max(minimum, Math.min(MAX_ZOOM, camera.scale));
  const height = world ? world.height * scale : 0;
  const y = viewport && world && viewport.height
    ? height <= viewport.height - EDGE_PADDING * 2 + .001 ? (viewport.height - height) / 2
      : Math.max(viewport.height - EDGE_PADDING - height, Math.min(EDGE_PADDING, camera.y))
    : camera.y;
  return { ...camera, y, scale };
}
export type RepeatedTile = Tile & { key: string };
const modulo = (value: number, period: number) => ((value % period) + period) % period;
export function visibleTiles(count: number, camera: Camera, viewport: Size, drift = 0): RepeatedTile[] {
  if (!count || !viewport.width || !viewport.height) return [];
  const { rows } = layoutMetrics(count, viewport, camera.scale), margin = TILE_SIZE;
  const tiles: RepeatedTile[] = [];
  for (let row = 0; row < rows; row++) {
    const top = row * ROW_PITCH;
    // Keep one tile of overscan, but do not mount distant rows when zoomed in.
    if ((top + TILE_SIZE + margin) * camera.scale + camera.y < 0 ||
        (top - margin) * camera.scale + camera.y > viewport.height) continue;
    const columns = Math.ceil((count - row) / rows);
    const offset = (row % 2 === 0 ? 1 : -1) * drift;
    const left = Math.floor((-camera.x / camera.scale - margin - offset) / TILE_SIZE);
    const right = Math.ceil(((viewport.width - camera.x) / camera.scale + margin - offset) / TILE_SIZE);
    for (let col = left; col < right; col++) {
    tiles.push({ key: `${col}:${row}`, index: row + modulo(col, columns) * rows,
      x: col * TILE_SIZE, y: row * ROW_PITCH, width: TILE_SIZE, height: TILE_SIZE });
    }
  }
  return tiles;
}
export function zoomAt(camera: Camera, scale: number, x: number, y: number): Camera {
  const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
  return { x: x - (x - camera.x) * s / camera.scale, y: y - (y - camera.y) * s / camera.scale, scale: s };
}
// Horizontal pointer anchor is preserved; the camera hook fits rows vertically.
export function zoomWithinBounds(camera: Camera, scale: number, x: number, y: number, viewport: Size, world: Size): Camera {
  const bounded = clampCamera(camera, viewport, world);
  const nextScale = clampCamera({ ...bounded, scale }, viewport, world).scale;
  const next = zoomAt(bounded, nextScale, x, y);
  return clampCamera(next, viewport, world);
}
export function isVisible(tile: Tile, camera: Camera, viewport: Size) {
  const margin = 180;
  return (tile.x + tile.width) * camera.scale + camera.x > -margin && tile.x * camera.scale + camera.x < viewport.width + margin && (tile.y + tile.height) * camera.scale + camera.y > -margin && tile.y * camera.scale + camera.y < viewport.height + margin;
}
