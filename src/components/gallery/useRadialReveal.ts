'use client';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { gsap } from 'gsap';
import type { Selection } from './Detail';

// One progress value moves the photo, its circular clearing, and the camera.
// Measurements always use layout dimensions, never the animated photo bounds.
export function useRadialReveal(planeRef: RefObject<HTMLDivElement | null>, contentRef: RefObject<HTMLDivElement | null>, selection: Selection, focusRef: RefObject<HTMLDivElement | null>) {
  const restore = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const plane = planeRef.current, content = contentRef.current, focus = focusRef.current;
    const image = content?.querySelector<HTMLElement>('.detail-image');
    if (!plane || !content || !focus || !image) return;
    const { trigger, rect } = selection;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const progress = { value: 0 };
    const start = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const panStart = Number(gsap.getProperty(focus, 'x'));
    let frame = 0, closing = false;
    let centerX = 0, centerY = 0, width = 1, height = 1, radius = 0, panEnd = panStart, cameraScale = 1;
    let tiles: { node: HTMLElement; x: number; y: number; halfDiagonal: number }[] = [];
    const moved = new Set<HTMLElement>();

    const render = () => {
      const p = progress.value;
      const pan = panStart + (panEnd - panStart) * p;
      const x = start.x + (centerX - start.x) * p;
      const y = start.y + (centerY - start.y) * p;
      const clearing = radius * p;
      gsap.set(focus, { x: pan });
      gsap.set(image, {
        x: x - centerX, y: y - centerY,
        scaleX: rect.width / width + (1 - rect.width / width) * p,
        scaleY: rect.height / height + (1 - rect.height / height) * p,
        transformOrigin: 'center center',
      });
      for (const tile of tiles) {
        const dx = tile.x + pan - x, dy = tile.y - y;
        const distance = Math.hypot(dx, dy);
        const angle = distance > .01 ? Math.atan2(dy, dx) : -Math.PI / 2;
        // Small tiles near the center form the curved rim seen in the reference.
        const influence = Math.max(0, 1 - distance / (radius + tile.halfDiagonal));
        const scale = 1 - .62 * influence * p;
        const displacement = Math.max(0, clearing + tile.halfDiagonal * scale - distance);
        if (!displacement && scale === 1 && !moved.has(tile.node)) continue;
        moved.add(tile.node);
        gsap.set(tile.node, {
          x: Math.cos(angle) * displacement / cameraScale,
          y: Math.sin(angle) * displacement / cameraScale,
          scale, transformOrigin: 'center center',
        });
      }
    };
    const measure = () => {
      frame = 0;
      if (closing) return;
      // The layout wrapper has no animation transform. Resize/image decoding
      // therefore cannot move the clearing to an in-flight photo position.
      const layout = content.getBoundingClientRect();
      const viewport = focus.parentElement!.getBoundingClientRect();
      centerX = layout.left + layout.width / 2;
      centerY = layout.top + layout.height / 2;
      width = image.offsetWidth || 1;
      height = image.offsetHeight || 1;
      radius = Math.max(Math.hypot(width, height) / 2 + 90, Math.min(viewport.width, viewport.height) * .42);
      const pan = Number(gsap.getProperty(focus, 'x'));
      cameraScale = new DOMMatrixReadOnly(getComputedStyle(plane).transform).a || 1;
      const selected = trigger.getBoundingClientRect();
      panEnd = centerX - (selected.left + selected.width / 2 - pan);
      tiles = [...plane.querySelectorAll<HTMLElement>('.photo-tile')].filter(node => node !== trigger).map(node => {
        const bounds = node.getBoundingClientRect();
        return {
          node,
          x: bounds.left + bounds.width / 2 - Number(gsap.getProperty(node, 'x')) * cameraScale - pan,
          y: bounds.top + bounds.height / 2 - Number(gsap.getProperty(node, 'y')) * cameraScale,
          halfDiagonal: Math.hypot(node.offsetWidth, node.offsetHeight) * cameraScale / 2,
        };
      });
      gsap.set(trigger, { opacity: 0, pointerEvents: 'none' });
      render();
    };
    const schedule = () => { if (!frame && !closing) frame = requestAnimationFrame(measure); };
    measure();
    gsap.to(progress, { value: 1, duration: reduced ? 0 : .95, ease: 'power2.inOut', onUpdate: render });
    const resize = new ResizeObserver(schedule);
    resize.observe(content);
    resize.observe(image);
    window.addEventListener('resize', schedule);
    const additions = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes].some(node => node instanceof HTMLElement && node.matches('.photo-tile, .gallery-row')))) schedule();
    });
    additions.observe(plane, { childList: true, subtree: true });
    restore.current = () => {
      closing = true;
      cancelAnimationFrame(frame);
      gsap.killTweensOf(progress);
      gsap.to([...moved], { x: 0, y: 0, scale: 1, duration: reduced ? 0 : .5, ease: 'power3.inOut', overwrite: true });
    };
    return () => {
      closing = true;
      cancelAnimationFrame(frame);
      resize.disconnect(); additions.disconnect();
      window.removeEventListener('resize', schedule);
      gsap.killTweensOf(progress);
      gsap.killTweensOf([...moved, trigger]);
      gsap.set([...moved, trigger], { clearProps: 'transform,transformOrigin,opacity,pointerEvents' });
      // The horizontal camera position deliberately survives closing/switching.
      restore.current = () => {};
    };
  }, [planeRef, contentRef, selection, focusRef]);
  return restore;
}
