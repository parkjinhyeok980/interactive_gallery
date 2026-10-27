export type Camera = { x: number; y: number; scale: number };
export type Size = { width: number; height: number };
export type Tile = { index: number; x: number; y: number; width: number; height: number };
export const MIN_ZOOM = 0.45;
export const MAX_ZOOM = 1.8;
export const WORLD_WIDTH = 3040;
export function createLayout(count: number): { tiles: Tile[]; width: number; height: number } {
  const columns = 8;
  const heights = Array(columns).fill(100) as number[];
  const tiles = Array.from({ length: count }, (_, index) => {
    const col = index % columns;
    const width = [260, 310, 280, 240, 300][index % 5];
    const height = width * [0.75, 1.12, 0.85, 1, 0.7][(index * 3) % 5];
    const y = heights[col] + ((col * 73) % 150);
    heights[col] = y + height + 70;
    return { index, x: 60 + col * 370 + (index * 17 % 35), y, width, height };
  });
  return { tiles, width: WORLD_WIDTH, height: Math.max(...heights) + 80 };
}
export function clampCamera(camera: Camera, viewport: Size, world: Size): Camera {
  const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.scale));
  const clamp = (p: number, v: number, w: number) => w * scale <= v ? (v - w * scale) / 2 : Math.max(v - w * scale - 60, Math.min(60, p));
  return { x: clamp(camera.x, viewport.width, world.width), y: clamp(camera.y, viewport.height, world.height), scale };
}
export function zoomAt(camera: Camera, scale: number, x: number, y: number): Camera {
  const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
  return { x: x - (x - camera.x) * s / camera.scale, y: y - (y - camera.y) * s / camera.scale, scale: s };
}
export function isVisible(tile: Tile, camera: Camera, viewport: Size) {
  const margin = 180;
  return (tile.x + tile.width) * camera.scale + camera.x > -margin && tile.x * camera.scale + camera.x < viewport.width + margin && (tile.y + tile.height) * camera.scale + camera.y > -margin && tile.y * camera.scale + camera.y < viewport.height + margin;
}
