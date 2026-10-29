'use client';
import { useLayoutEffect, useRef, type RefObject } from 'react';

const SPEED = 10;
const DURATION = 1_000_000_000;

// The compositor owns motion. React only adds/removes offscreen tiles;
// neither React nor the camera ticker writes a row's animated transform.
export function useRowFlow(planeRef: RefObject<HTMLDivElement | null>, viewportRef: RefObject<HTMLDivElement | null>, paused: boolean) {
  const drift = useRef(0);
  useLayoutEffect(() => {
    const plane = planeRef.current, viewport = viewportRef.current;
    if (!plane || !viewport) return;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    // A targetless Animation used as a clock cannot be composited and wakes
    // style calculation every frame. Use a plain timeline timestamp instead.
    let elapsed = drift.current / SPEED * 1000;
    let startedAt: number | null = null;
    const time = () => elapsed + (startedAt === null ? 0 : Number(document.timeline.currentTime) - startedAt);
    const animations = new Map<Element, Animation>();
    const pointers = new Set<number>();
    let timer: ReturnType<typeof setInterval> | undefined;
    const sample = () => { drift.current = time() / 1000 * SPEED; };
    const sync = () => {
      const running = !paused && !preference.matches && !document.hidden && pointers.size === 0 && !document.activeElement?.matches('.photo-tile:focus-visible');
      if (running && startedAt === null) startedAt = Number(document.timeline.currentTime);
      else if (!running && startedAt !== null) { elapsed = time(); startedAt = null; }
      // Paused/hidden/reduced-motion views have no changing drift to sample.
      if (running && timer === undefined) timer = setInterval(sample, 200);
      else if (!running && timer !== undefined) { clearInterval(timer); timer = undefined; }
      for (const [row, animation] of animations) {
        if (!row.isConnected) { animation.cancel(); animations.delete(row); }
      }
      for (const row of plane.children) {
        const direction = Number((row as HTMLElement).dataset.direction);
        if (!direction) continue;
        let animation = animations.get(row);
        if (!animation) {
          animation = row.animate([
            { transform: 'translate3d(0,0,0)' },
            { transform: `translate3d(${direction * SPEED * DURATION / 1000}px,0,0)` },
          ], { duration: DURATION, fill: 'both', easing: 'linear' });
          animations.set(row, animation);
        }
        if (running) {
          animation.play();
          animation.startTime = startedAt! - elapsed;
        } else { animation.pause(); animation.currentTime = elapsed; }
      }
      sample();
    };
    const down = (event: PointerEvent) => { if (event.pointerType === 'mouse' && event.button !== 0) return; pointers.add(event.pointerId); sync(); };
    const up = (event: PointerEvent) => { pointers.delete(event.pointerId); sync(); };
    const observer = new MutationObserver(sync);
    observer.observe(plane, { childList: true });
    viewport.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    viewport.addEventListener('focusin', sync);
    viewport.addEventListener('focusout', sync);
    document.addEventListener('visibilitychange', sync);
    preference.addEventListener('change', sync);
    sync();
    return () => {
      sample();
      clearInterval(timer); observer.disconnect();
      animations.forEach(animation => animation.cancel());
      viewport.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      viewport.removeEventListener('focusin', sync);
      viewport.removeEventListener('focusout', sync);
      document.removeEventListener('visibilitychange', sync);
      preference.removeEventListener('change', sync);
    };
  }, [planeRef, viewportRef, paused]);
  return drift;
}
