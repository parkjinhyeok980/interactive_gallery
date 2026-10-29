'use client';
import { useEffect, useRef, useState } from 'react';
import { useRowFlow } from './useRowFlow';
import { Camera, Size, clampCamera, fitScale, zoomWithinBounds, visibleTiles, layoutMetrics, type RepeatedTile } from '@/lib/gallery/geometry';

export function useCamera(count: number, paused: boolean) {
  const postCount = useRef(count);
  postCount.current = count;
  const world = useRef(layoutMetrics(count));
  world.current = layoutMetrics(count);
  const refresh = useRef(() => {});
  const initialCount = useRef(count);
  const viewportRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 0.5 });
  const target = useRef<Camera>({ ...camera.current });
  const size = useRef<Size>({ width: 0, height: 0 });
  const dragged = useRef(false);
  const drift = useRowFlow(planeRef, viewportRef, paused);
  const [tiles, setTiles] = useState<RepeatedTile[]>([]);
  const mountedTiles = useRef(new Map<string, RepeatedTile>());
  const reduced = useRef(false);
  const initialized = useRef(false);
  const controls = useRef({ zoom: (_factor: number) => {}, reset: () => {} });

  useEffect(() => {
    const el = viewportRef.current;
    const plane = planeRef.current;
    if (!el || !plane) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const preference = () => { reduced.current = media.matches; };
    preference(); media.addEventListener('change', preference);
    const pointers = new Map<number, { x: number; y: number }>();
    let velocity = { x: 0, y: 0 }, lastTime = 0, lastMove = 0, distance = 0, travel = 0;
    const worldAt = (_scale: number) => world.current;
    const fit = (value: Camera) => clampCamera(value, size.current, worldAt(value.scale));
    const center = () => {
      const scale = fitScale(size.current, worldAt(1));
      return fit({ x: (size.current.width - layoutMetrics(initialCount.current, size.current, scale).width * scale) / 2, y: 0, scale });
    };
    let frame = 0, lastTick = performance.now();
    const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };
    const resize = new ResizeObserver(() => {
      wake();
      size.current = { width: el.clientWidth, height: el.clientHeight };
      target.current = !initialized.current ? center() : fit(target.current);
      if (!initialized.current) { camera.current = { ...target.current }; initialized.current = true; }
    });
    resize.observe(el);
    let publishedTiles: RepeatedTile[] = [];
    const publish = () => {
      // A detail camera pan can expose up to half a viewport on either side.
      // Cover the complete journey without changing the exploration camera.
      const view = paused ? { ...size.current, width: size.current.width * 2 } : size.current;
      const position = paused ? { ...camera.current, x: camera.current.x + size.current.width / 2 } : camera.current;
      const next = visibleTiles(postCount.current, position, view, drift.current).map(tile => {
        // Appending pages changes the negative-column modulo first (left edge).
        // Keep mounted cells attached to their photo until they leave the buffer.
        const previous = mountedTiles.current.get(tile.key);
        return previous && previous.index < postCount.current ? previous : tile;
      });
      if (next.length !== publishedTiles.length || next.some((tile, index) => tile !== publishedTiles[index])) {
        mountedTiles.current = new Map(next.map(tile => [tile.key, tile]));
        publishedTiles = next;
        setTiles(next);
      }
    };
    let publishedRows = 0;
    let publishedDrift = -Infinity;
    let published = { x: Infinity, y: Infinity, scale: 0, width: 0, height: 0 };
    const tick = (now: number) => {
      frame = 0;
      const delta = now - lastTick; lastTick = now;
      const dt = Math.min(delta, 32) / 16.667;
      if (reduced.current) velocity = { x: 0, y: 0 };
      if (!paused && pointers.size === 0 && !reduced.current) {
        target.current.x += velocity.x * dt; target.current.y += velocity.y * dt;
        velocity.x *= Math.pow(0.9, dt); velocity.y *= Math.pow(0.9, dt);
      }
      target.current = fit(target.current);
      const k = reduced.current || paused ? 1 : 1 - Math.pow(0.78, dt);
      const c = camera.current, t = target.current;
      c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; c.scale += (t.scale - c.scale) * k;
      Object.assign(c, fit(c));
      const settled = Math.abs(c.x - t.x) < 0.05 && Math.abs(c.y - t.y) < 0.05 && Math.abs(c.scale - t.scale) < 0.0001 && Math.abs(velocity.x) + Math.abs(velocity.y) < 0.05;
      if (settled) { Object.assign(c, t); velocity = { x: 0, y: 0 }; }
      const metrics = worldAt(c.scale);
      const width = `${metrics.width}px`, height = `${metrics.height}px`;
      if (plane.style.width !== width) plane.style.width = width;
      if (plane.style.height !== height) plane.style.height = height;
      const transform = `translate3d(${c.x}px,${c.y}px,0) scale(${c.scale})`;
      if (plane.style.transform !== transform) plane.style.transform = transform;
      const finalChange = settled && (c.x !== published.x || c.y !== published.y || c.scale !== published.scale);
      if (metrics.rows !== publishedRows || Math.abs(drift.current - publishedDrift) > 35 || finalChange || Math.abs(c.x - published.x) > 35 || Math.abs(c.y - published.y) > 35 || Math.abs(c.scale - published.scale) > 0.012 || size.current.width !== published.width || size.current.height !== published.height) {
        publish(); publishedRows = metrics.rows; published = { ...c, ...size.current }; publishedDrift = drift.current;
      }
      if (!settled && !paused) wake();
    };
    // The viewport is fixed to the window; pointer moves require no layout read.
    const local = (e: PointerEvent | WheelEvent) => ({ x: e.clientX, y: e.clientY });
    const down = (e: PointerEvent) => {
      if (paused || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (pointers.size === 0) { dragged.current = false; travel = 0; }
      pointers.set(e.pointerId, local(e)); velocity = { x: 0, y: 0 }; lastTime = performance.now();
      // Capture only once a drag starts, preserving normal button click targets.
      distance = pointers.size === 2 ? Math.hypot(...getDelta()) : 0;
      el.classList.add('is-dragging');
    };
    function getDelta(): [number, number] { const [a, b] = [...pointers.values()]; return [a.x - b.x, a.y - b.y]; }
    const move = (e: PointerEvent) => {
      const old = pointers.get(e.pointerId); if (!old || paused) return;
      wake();
      const p = local(e), dx = p.x - old.x, dy = p.y - old.y;
      travel += Math.hypot(dx, dy);
      if (travel > 6) { dragged.current = true; el.setPointerCapture(e.pointerId); }
      const now = performance.now(), dt = Math.max(8, now - lastTime); lastTime = now; lastMove = now;
      if (pointers.size === 2) {
        const before = [...pointers.values()]; const cx = (before[0].x + before[1].x) / 2, cy = (before[0].y + before[1].y) / 2;
        pointers.set(e.pointerId, p);
        const nextDistance = Math.hypot(...getDelta());
        target.current = zoomWithinBounds(target.current, target.current.scale * nextDistance / Math.max(distance, 1), cx, cy, size.current, worldAt(target.current.scale));
        target.current.x += dx / 2; target.current.y += dy / 2; distance = nextDistance; dragged.current = true;
      } else {
        pointers.set(e.pointerId, p); target.current.x += dx; target.current.y += dy;
        velocity = { x: dx * 16.667 / dt, y: dy * 16.667 / dt };
      }
    };
    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (!pointers.size) { el.classList.remove('is-dragging'); if (performance.now() - lastMove > 100 || e.type === 'pointercancel') velocity = { x: 0, y: 0 }; }
      distance = pointers.size === 2 ? Math.hypot(...getDelta()) : 0;
    };
    const zoom = (factor: number) => { wake(); velocity = { x: 0, y: 0 }; target.current = zoomWithinBounds(target.current, target.current.scale * factor, size.current.width / 2, size.current.height / 2, size.current, worldAt(target.current.scale)); };
    const reset = () => { wake(); velocity = { x: 0, y: 0 }; target.current = center(); };
    controls.current = { zoom, reset };
    const wheel = (e: WheelEvent) => {
      e.preventDefault(); if (paused) return;
      wake();
      velocity = { x: 0, y: 0 }; const p = local(e);
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.current.height : 1;
      if (!e.ctrlKey && (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey)) {
        target.current.x -= (e.deltaX || e.deltaY) * unit; return;
      }
      const dy = e.deltaY * unit;
      target.current = zoomWithinBounds(target.current, target.current.scale * Math.exp(-Math.max(-150, Math.min(150, dy)) * 0.002), p.x, p.y, size.current, worldAt(target.current.scale));
    };
    const key = (e: KeyboardEvent) => {
      if (paused || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1.15); }
      if (e.key === '-') { e.preventDefault(); zoom(1 / 1.15); }
      if (e.key === 'Home') { e.preventDefault(); reset(); }
    };
    refresh.current = () => { publish(); wake(); };
    wake();
    // Idle flow stays on the compositor. Wake JS only to recycle offscreen
    // tiles, or while a user gesture/inertia is changing the camera.
    const housekeeping = setInterval(() => {
      if (Math.abs(drift.current - publishedDrift) > 35) wake();
    }, 500);
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('keydown', key);
    return () => {
      refresh.current = () => {};
      target.current = { ...camera.current };
      cancelAnimationFrame(frame); clearInterval(housekeeping); resize.disconnect(); media.removeEventListener('change', preference);
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel); el.removeEventListener('keydown', key);
    };
  }, [paused]);
  // Appending a page updates visibility without resetting gesture state,
  // inertia, event listeners, or the ResizeObserver.
  useEffect(() => { refresh.current(); }, [count]);
  return { viewportRef, planeRef, camera, tiles, dragged, controls };
}
