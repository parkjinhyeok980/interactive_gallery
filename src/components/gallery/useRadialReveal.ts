'use client';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { gsap } from 'gsap';

// Only the already mounted tiles move. Their row/camera transforms stay intact.
export function useRadialReveal(planeRef: RefObject<HTMLDivElement | null>, contentRef: RefObject<HTMLDivElement | null>, trigger: HTMLButtonElement) {
  const restore = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const plane = planeRef.current, content = contentRef.current;
    if (!plane || !content) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0, closing = false;
    const moved = new Set<HTMLElement>();
    const ctx = gsap.context(() => {}, plane);
    const arrange = () => {
      frame = 0;
      if (closing) return;
      const bounds = content.getBoundingClientRect();
      const center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
      const radius = Math.hypot(bounds.width, bounds.height) / 2 + 24;
      const cameraScale = new DOMMatrixReadOnly(getComputedStyle(plane).transform).a || 1;
      // Read all geometry before writing transforms to avoid per-tile layout work.
      const targets = [...plane.querySelectorAll<HTMLElement>('.photo-tile')].filter(tile => tile !== trigger).map((tile, i) => {
        const rect = tile.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - Number(gsap.getProperty(tile, 'x')) * cameraScale - center.x;
        const dy = rect.top + rect.height / 2 - Number(gsap.getProperty(tile, 'y')) * cameraScale - center.y;
        const distance = Math.hypot(dx, dy);
        const angle = distance > 1 ? Math.atan2(dy, dx) : i * 2.399963;
        const halfDiagonal = Math.hypot(tile.offsetWidth, tile.offsetHeight) * cameraScale / 2;
        const affected = distance < radius + halfDiagonal;
        const scale = affected ? .78 : 1;
        const push = Math.max(0, radius + halfDiagonal * scale - distance);
        return { tile, x: Math.cos(angle) * push / cameraScale, y: Math.sin(angle) * push / cameraScale, scale };
      });
      ctx.add(() => {
        gsap.set(trigger, { opacity: 0 });
        for (const { tile, ...position } of targets) {
          moved.add(tile);
          gsap.to(tile, { ...position, transformOrigin: 'center center', duration: reduced ? 0 : .7, ease: 'power3.inOut', overwrite: true });
        }
      });
    };
    const schedule = () => { if (!frame && !closing) frame = requestAnimationFrame(arrange); };
    arrange();
    const resize = new ResizeObserver(schedule);
    resize.observe(content);
    window.addEventListener('resize', schedule);
    const additions = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node instanceof HTMLElement && (node.matches('.photo-tile, .gallery-row'))))) schedule();
    });
    additions.observe(plane, { childList: true, subtree: true });
    restore.current = () => {
      closing = true; cancelAnimationFrame(frame);
      ctx.add(() => gsap.to([...moved], { x: 0, y: 0, scale: 1, duration: reduced ? 0 : .5, ease: 'power3.inOut', overwrite: true }));
    };
    return () => {
      closing = true; cancelAnimationFrame(frame); resize.disconnect(); additions.disconnect();
      window.removeEventListener('resize', schedule);
      gsap.killTweensOf([...moved, trigger]);
      ctx.revert();
      // Resize/media-load retargeting can leave intermediate tween snapshots.
      // These properties belong solely to this reveal; reset GSAP's cache too.
      gsap.set([...moved, trigger], { clearProps: 'transform,transformOrigin,opacity' });
      restore.current = () => {};
    };
  }, [planeRef, contentRef, trigger]);
  return restore;
}
