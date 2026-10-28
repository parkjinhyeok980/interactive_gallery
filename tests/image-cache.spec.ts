import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ImageCache, allowedImageSource } from '../src/lib/media/imageCache';

const source = 'https://scontent.cdninstagram.com/photo.jpg?signature=first';
const fixture = () => readFile(path.join(process.cwd(), 'public/images/food-1.jpg'));
async function removeFixture(root: string) {
  expect(path.resolve(path.dirname(root))).toBe(path.resolve(tmpdir()));
  expect(path.basename(root)).toMatch(/^gallery-cache-test-/);
  await rm(root, { recursive: true, force: true });
}

test('image identity survives signed URL changes and process restarts; simultaneous sizes share a download', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gallery-cache-test-'));
  try {
    const bytes = await fixture();
    let calls = 0;
    const fetcher: typeof fetch = async (_url, init) => {
      calls++;
      expect(init?.redirect).toBe('error');
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg' } });
    };
    const cache = new ImageCache(root, fetcher);
    const key = await cache.register('account', '123:IMAGE', source);
    const [preview, detail] = await Promise.all([cache.get(key), cache.get(key)]);
    expect(calls).toBe(1);
    expect(preview.data.equals(detail.data)).toBe(true);
    const restarted = new ImageCache(root, fetcher);
    const rotated = await restarted.register('ACCOUNT', '123:IMAGE', source.replace('first', 'second'));
    expect(rotated).toBe(key);
    expect((await restarted.get(rotated)).hit).toBe(true);
    expect(calls).toBe(1);
    expect(await restarted.register('other-account', '123:IMAGE', source)).not.toBe(key);
  } finally { await removeFixture(root); }
});

test('only registered CDN images are fetched and failures do not poison the cache', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gallery-cache-test-'));
  try {
    for (const url of ['http://127.0.0.1/a', 'https://cdninstagram.com.evil.test/a', 'https://user:pass@cdninstagram.com/a', 'https://cdninstagram.com:8443/a']) expect(allowedImageSource(url)).toBe(false);
    let fail = true, calls = 0;
    const bytes = await fixture();
    const cache = new ImageCache(root, async () => {
      calls++;
      if (fail) throw new Error('private-cdn-signature');
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg' } });
    });
    expect(() => cache.get('../escape')).toThrow('Invalid image key');
    await expect(cache.get('a'.repeat(64))).rejects.toThrow();
    expect(calls).toBe(0);
    const key = await cache.register('account', '123', source);
    await expect(cache.get(key)).rejects.toThrow('Image unavailable');
    fail = false;
    expect((await cache.get(key)).data.equals(bytes)).toBe(true);
    expect(calls).toBe(2);
  } finally { await removeFixture(root); }
});

test('source downloads are bounded across different images', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'gallery-cache-test-'));
  try {
    const bytes = await fixture();
    let active = 0, peak = 0;
    const cache = new ImageCache(root, async () => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, 30));
      active--;
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg' } });
    });
    const keys = await Promise.all(Array.from({ length: 12 }, (_, id) => cache.register('account', String(id), source)));
    await Promise.all(keys.map(key => cache.get(key)));
    expect(peak).toBe(4);
  } finally { await removeFixture(root); }
});

test('persistent originals feed both Next preview and detail optimization without contacting Instagram', async ({ request }) => {
  const bytes = await fixture();
  const cache = new ImageCache(path.join(process.cwd(), 'qa-artifacts/image-cache-tests'), async () =>
    new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/jpeg' } }));
  const key = await cache.register('route-fixture', '1', source);
  await cache.get(key);
  const url = `/api/instagram/image/${key}`;
  const original = await request.get(url);
  expect(original.ok()).toBe(true);
  expect(original.headers()['x-image-cache']).toBe('HIT');
  expect(original.headers()['cache-control']).toContain('max-age=86400');
  expect((await original.body()).equals(bytes)).toBe(true);
  for (const width of [384, 1080]) {
    const resized = await request.get(`/_next/image?${new URLSearchParams({ url, w: String(width), q: '75' })}`);
    expect(resized.ok()).toBe(true);
    expect(resized.headers()['content-type']).toMatch(/^image\//);
    if (width === 384) expect((await resized.body()).length).toBeLessThan(bytes.length);
  }
  expect((await request.get('/api/instagram/image/invalid')).status()).toBe(404);
});
