'use client';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { gsap } from 'gsap';
import type { GalleryPost } from '@/types/gallery';
import { Photo } from './Photo';
import { useRadialReveal } from './useRadialReveal';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeZone: 'Asia/Seoul' });

export type Selection = { post: GalleryPost; rect: { left: number; top: number; width: number; height: number }; trigger: HTMLButtonElement; preview?: { url: string; width: number; height: number } };
export function Detail({ selection, onClose, planeRef }: { selection: Selection; onClose: () => void; planeRef: RefObject<HTMLDivElement | null> }) {
  const { post, rect, trigger } = selection;
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLDivElement>(null);
  const info = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);
  const closeAction = useRef<() => void>(() => {});
  const content = useRef<HTMLDivElement>(null);
  const restoreTiles = useRadialReveal(planeRef, content, trigger);
  useLayoutEffect(() => {
    const root = dialog.current!, image = photo.current!, copy = info.current!;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    closeButton.current?.focus();
    const destination = image.getBoundingClientRect();
    const offset = { x: rect.left - destination.left, y: rect.top - destination.top, scaleX: rect.width / destination.width, scaleY: rect.height / destination.height };
    const ctx = gsap.context(() => {
      gsap.from(root, { backgroundColor: 'rgba(8,9,8,0)', duration: reduced ? 0 : 0.45 });
      gsap.fromTo(image, { ...offset, transformOrigin: 'top left' }, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: reduced ? 0 : .95, ease: 'power2.inOut' });
      gsap.from(copy, { opacity: 0, y: reduced ? 0 : 16, duration: reduced ? 0 : .3, delay: reduced ? 0 : .9 });
    }, root);
    closeAction.current = () => {
      if (closing.current) return;
      closing.current = true;
      restoreTiles.current();
      gsap.killTweensOf([root, image, copy]);
      // Carousel media and decoded image dimensions can differ from the opening photo.
      const destination = image.getBoundingClientRect();
      const bounds = trigger.isConnected ? trigger.getBoundingClientRect() : rect;
      const restore = () => { onClose(); requestAnimationFrame(() => trigger.isConnected && trigger.focus({ preventScroll: true })); };
      if (reduced) { restore(); return; }
      gsap.to(copy, { opacity: 0, duration: 0.15 });
      gsap.to(root, { backgroundColor: 'rgba(8,9,8,0)', duration: 0.4 });
      gsap.to(image, { x: bounds.left - destination.left, y: bounds.top - destination.top, scaleX: bounds.width / destination.width, scaleY: bounds.height / destination.height, duration: 0.5, ease: 'power3.inOut', onComplete: restore });
    };
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeAction.current(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setIndex(i => (i + 1) % post.media.length); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex(i => (i - 1 + post.media.length) % post.media.length); }
      if (e.key === 'Tab') {
        const focusable = [...root.querySelectorAll<HTMLElement>('button, a[href], video[controls]')];
        const first = focusable[0], last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    root.addEventListener('keydown', keyboard);
    return () => { ctx.revert(); gsap.killTweensOf([root, image, copy]); root.removeEventListener('keydown', keyboard); };
  }, [post, rect, trigger, onClose, restoreTiles]);

  const media = post.media[index];
  const initialPreview = index === 0 ? selection.preview : undefined;
  return <div className="detail-backdrop" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={e => { if (e.target === e.currentTarget) closeAction.current(); }}>
    <button className="detail-close" ref={closeButton} onClick={() => closeAction.current()} aria-label="상세 보기 닫기">닫기 <span>×</span></button>
    <div className="detail-layout" ref={content}>
      <div className={`detail-image${initialPreview ? ' has-preview' : ''}`} ref={photo} style={initialPreview ? { width: `min(100%, calc(var(--detail-photo-height, 46svh) * ${initialPreview.width / initialPreview.height}))`, aspectRatio: `${initialPreview.width} / ${initialPreview.height}` } : undefined}>
        {media.type === 'VIDEO' ? <video key={media.id} src={media.url} poster={initialPreview?.url || media.thumbnailUrl} controls playsInline aria-label={media.alt} /> : <Photo key={media.id} media={media} initialPreview={initialPreview} sizes="(max-width: 700px) 82vw, 480px" priority />}
      </div>
      <div className="detail-copy" ref={info}>
        <h2 id="detail-title" className="sr-only">사진 상세</h2>
        <p className="detail-caption">{post.caption}</p>
        <div className="detail-meta"><time dateTime={post.timestamp}>{dateFormatter.format(new Date(post.timestamp))}</time>
        {post.permalink && <a className="original-link" href={post.permalink} target="_blank" rel="noopener noreferrer">Instagram ↗</a>}</div>
        {post.media.length > 1 && <div className="carousel-controls"><button aria-label="이전 사진" onClick={() => setIndex(i => (i - 1 + post.media.length) % post.media.length)}>←</button><span aria-live="polite">{String(index + 1).padStart(2, '0')} / {String(post.media.length).padStart(2, '0')}</span><button aria-label="다음 사진" onClick={() => setIndex(i => (i + 1) % post.media.length)}>→</button></div>}
      </div>
    </div>
  </div>;
}
