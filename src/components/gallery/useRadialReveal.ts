'use client';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { gsap } from 'gsap';
import { EDGE_PADDING, ROW_PITCH } from '@/lib/gallery/geometry';

// Only the already mounted tiles move. Their row/camera transforms stay intact.
export function useRadialReveal(planeRef: RefObject<HTMLDivElement | null>, contentRef: RefObject<HTMLDivElement | null>, trigger: HTMLButtonElement, focusRef: RefObject<HTMLDivElement | null>) {
  const restore = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const plane = planeRef.current, content = contentRef.current, focus = focusRef.current;
    if (!plane || !content || !focus) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0, closing = false;
    let focusDestination = NaN;
    const moved = new Set<HTMLElement>();
    const ctx = gsap.context(() => {}, plane);
    const arrange = () => {
      frame = 0;
      if (closing) return;
      const contentBounds = content.getBoundingClientRect();
      const caption = content.querySelector('.detail-copy')?.getBoundingClientRect();
      const bounds = { left: contentBounds.left, right: contentBounds.right, top: contentBounds.top,
        bottom: Math.max(contentBounds.bottom, caption?.bottom ?? contentBounds.bottom),
        height: Math.max(contentBounds.bottom, caption?.bottom ?? contentBounds.bottom) - contentBounds.top };
      const viewport = focus.parentElement!.getBoundingClientRect();
      const pan = Number(gsap.getProperty(focus, 'x'));
      const selected = trigger.getBoundingClientRect();
      const panTarget = viewport.left + viewport.width / 2 - (selected.left + selected.width / 2 - pan);
      const cameraScale = new DOMMatrixReadOnly(getComputedStyle(plane).transform).a || 1;
      const planeBounds = plane.getBoundingClientRect();
      const top = Math.max(viewport.top + EDGE_PADDING, planeBounds.top);
      const bottom = Math.min(viewport.bottom - EDGE_PADDING, planeBounds.bottom);
      const rowCount = plane.children.length;
      // Read all geometry before writing transforms to avoid per-tile layout work.
      const targets = [...plane.querySelectorAll<HTMLElement>('.photo-tile')].filter(tile => tile !== trigger).map(tile => {
        const rect = tile.getBoundingClientRect();
        const width = tile.offsetWidth * cameraScale, height = tile.offsetHeight * cameraScale;
        const cx = rect.left + rect.width / 2 - pan + panTarget;
        const cy = rect.top + rect.height / 2 - Number(gsap.getProperty(tile, 'y')) * cameraScale;
        const affected = cx + width / 2 > bounds.left - 20 && cx - width / 2 < bounds.right + 20;
        if (!affected) return { tile, x: 0, y: 0, scale: 1 };
        const upper = cy < bounds.top + bounds.height / 2;
        const start = upper ? top : Math.min(bottom, bounds.bottom + 20);
        const end = upper ? Math.max(top, bounds.top - 20) : bottom;
        const available = Math.max(0, end - start);
        const scale = Math.min(.72, available / height);
        const row = Math.round((tile.parentElement as HTMLElement).offsetTop / ROW_PITCH);
        // Preserve row order in a bounded stack; adjacent layers remain visible.
        const fraction = row / Math.max(1, rowCount - 1);
        const targetY = start + height * scale / 2 + (available - height * scale) * fraction;
        return { tile, x: 0, y: (targetY - cy) / cameraScale, scale };
      });
      ctx.add(() => {
        gsap.set(trigger, { opacity: 0 });
        if (Math.abs(panTarget - focusDestination) > .1 || !Number.isFinite(focusDestination)) {
          focusDestination = panTarget;
          gsap.to(focus, { x: panTarget, duration: reduced ? 0 : .95, ease: 'power2.inOut', overwrite: 'auto' });
        }
        for (const { tile, ...position } of targets) {
          // Unaffected tiles need no tween or GSAP style bookkeeping.
          if (!position.x && !position.y && position.scale === 1 && !moved.has(tile)) continue;
          moved.add(tile);
          gsap.to(tile, { ...position, transformOrigin: 'center center', duration: reduced ? 0 : .7, ease: 'power3.inOut', overwrite: true });
        }
      });
    };
    const schedule = () => { if (!frame && !closing) frame = requestAnimationFrame(arrange); };
    arrange();
    const resize = new ResizeObserver(schedule);
    resize.observe(content);
    const caption = content.querySelector('.detail-copy');
    if (caption) resize.observe(caption);
    window.addEventListener('resize', schedule);
    const additions = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node instanceof HTMLElement && (node.matches('.photo-tile, .gallery-row'))))) schedule();
    });
    additions.observe(plane, { childList: true, subtree: true });
    restore.current = () => {
      closing = true; cancelAnimationFrame(frame);
      gsap.to(focus, { x: 0, duration: reduced ? 0 : .5, ease: 'power3.inOut', overwrite: true });
      ctx.add(() => gsap.to([...moved], { x: 0, y: 0, scale: 1, duration: reduced ? 0 : .5, ease: 'power3.inOut', overwrite: true }));
    };
    return () => {
      closing = true; cancelAnimationFrame(frame); resize.disconnect(); additions.disconnect();
      window.removeEventListener('resize', schedule);
      gsap.killTweensOf([...moved, trigger, focus]);
      ctx.revert();
      // Resize/media-load retargeting can leave intermediate tween snapshots.
      // These properties belong solely to this reveal; reset GSAP's cache too.
      gsap.set([...moved, trigger], { clearProps: 'transform,transformOrigin,opacity' });
      gsap.set(focus, { clearProps: 'transform' });
      restore.current = () => {};
    };
  }, [planeRef, contentRef, trigger, focusRef]);
  return restore;
}
