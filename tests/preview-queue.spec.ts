import { expect, test } from '@playwright/test';
import { loadPreview } from '../src/components/gallery/previewQueue';

test('offscreen pending previews are cancelled and repeated tiles share downloads', async () => {
  const downloaded: string[] = [];
  const images: FakeImage[] = [];
  class FakeImage {
    decoding = ''; onload: (() => Promise<void>) | null = null; onerror: (() => void) | null = null;
    private url = '';
    constructor() { images.push(this); }
    set src(url: string) { this.url = url; downloaded.push(url); }
    get src() { return this.url; }
    async decode() {}
  }
  (globalThis as any).window = { Image: FakeImage };
  try {
    const subscriptions = Array.from({ length: 20 }, (_, i) => loadPreview(`preview-${i}`, `preview-${i}`));
    const results = subscriptions.map(subscription => subscription.promise.catch(() => 'cancelled'));
    const shared = loadPreview('preview-19', 'preview-19');
    subscriptions.forEach(subscription => subscription.release());
    expect(downloaded).toHaveLength(4);
    await images[0].onload!();
    expect(downloaded).toEqual(['preview-0', 'preview-1', 'preview-2', 'preview-3', 'preview-19']);
    for (const image of images.slice(1)) await image.onload!();
    expect(await shared.promise).toBe('preview-19');
    expect((await Promise.all(results)).filter(value => value === 'cancelled')).toHaveLength(15);
    shared.release();
  } finally { delete (globalThis as any).window; }
});
