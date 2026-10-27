export type Camera = { x: number; y: number; scale: number };
export type Size = { width: number; height: number };
export type Tile = { index: number; x: number; y: number; width: number; height: number };
export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 1.8;
export const TILE_SIZE = 280;
export const COLUMNS = 8;
export const WORLD_WIDTH = TILE_SIZE * COLUMNS;
export function createLayout(count: number): { tiles: Tile[]; width: number; height: number } {
  const rows = Math.max(1, Math.ceil(count / COLUMNS));
  const tiles = Array.from({ length: count ? rows * COLUMNS : 0 }, (_, cell) => ({
    index: cell % count, x: (cell % COLUMNS) * TILE_SIZE, y: Math.floor(cell / COLUMNS) * TILE_SIZE,
    width: TILE_SIZE, height: TILE_SIZE,
  }));
  return { tiles, width: WORLD_WIDTH, height: rows * TILE_SIZE };
}
export function clampCamera(camera: Camera, _viewport?: Size, _world?: Size): Camera {
  const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.scale));
  return { ...camera, scale };
}
export type RepeatedTile = Tile & { key: string };
const modulo = (value: number, period: number) => ((value % period) + period) % period;
export function visibleTiles(count: number, camera: Camera, viewport: Size): RepeatedTile[] {
  if (!count || !viewport.width || !viewport.height) return [];
  const rows = Math.ceil(count / COLUMNS), margin = TILE_SIZE;
  const left = Math.floor((-camera.x / camera.scale - margin) / TILE_SIZE);
  const right = Math.ceil(((viewport.width - camera.x) / camera.scale + margin) / TILE_SIZE);
  const top = Math.floor((-camera.y / camera.scale - margin) / TILE_SIZE);
  const bottom = Math.ceil(((viewport.height - camera.y) / camera.scale + margin) / TILE_SIZE);
  const tiles: RepeatedTile[] = [];
  for (let row = top; row < bottom; row++) for (let col = left; col < right; col++) {
    tiles.push({ key: `${col}:${row}`, index: (modulo(row, rows) * COLUMNS + modulo(col, COLUMNS)) % count,
      x: col * TILE_SIZE, y: row * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE });
  }
  return tiles;
}
export function zoomAt(camera: Camera, scale: number, x: number, y: number): Camera {
  const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
  return { x: x - (x - camera.x) * s / camera.scale, y: y - (y - camera.y) * s / camera.scale, scale: s };
}
export function isVisible(tile: Tile, camera: Camera, viewport: Size) {
  const margin = 180;
  return (tile.x + tile.width) * camera.scale + camera.x > -margin && tile.x * camera.scale + camera.x < viewport.width + margin && (tile.y + tile.height) * camera.scale + camera.y > -margin && tile.y * camera.scale + camera.y < viewport.height + margin;
}
