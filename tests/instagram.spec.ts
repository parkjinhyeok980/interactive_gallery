import { expect, test } from '@playwright/test';
import { InstagramClient, normalizePost, requestJson } from '../src/lib/instagram/api';
import { PageCache } from '../src/lib/data/pageCache';
import { createLayout } from '../src/lib/gallery/geometry';

const image = { id: '1', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/photo.jpg', timestamp: '2026-10-01T12:00:00+0000', permalink: 'https://www.instagram.com/p/example/' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test('media conversion preserves real captions, carousel order, video and missing media', () => {
  const post = normalizePost({ ...image, media_type: 'CAROUSEL_ALBUM', caption: '<script>caption</script>\n본문' }, [
    image, { id: '2', media_type: 'VIDEO', media_url: 'https://video.fbcdn.net/clip.mp4' },
    { id: '3', media_type: 'IMAGE' },
  ])!;
  expect(post.caption).toBe('<script>caption</script>\n본문');
  expect(post.media.map(item => item.type)).toEqual(['IMAGE', 'VIDEO']);
  expect(post.media[1].thumbnailUrl).toBeUndefined();
  expect(post.timestamp).toBe('2026-10-01T12:00:00.000Z');
  expect(post.isMock).toBe(false);
  expect(normalizePost({ ...image, media_url: 'http://127.0.0.1/private' })).toBeNull();
  expect(normalizePost({ ...image, media_url: 'https://cdninstagram.com.evil.test/x' })).toBeNull();
  expect(normalizePost({ ...image, timestamp: 'invalid' })).toBeNull();
  expect(normalizePost({ ...image, permalink: 'javascript:alert(1)' })?.permalink).toBeNull();
});

test('fetches all cursors and carousel children without following API next URLs or leaking tokens', async () => {
  const urls: URL[] = [];
  const client = new InstagramClient('private-token', 'v25.0', async (input, init) => {
    const url = new URL(String(input)); urls.push(url);
    expect(url.searchParams.has('access_token')).toBe(false);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-token');
    if (url.pathname.endsWith('/me')) return json({ user_id: '99', username: 'hyeoki_foodie' });
    if (url.pathname.endsWith('/children')) return json({ data: [image, { ...image, id: '3', media_type: 'VIDEO', media_url: 'https://video.fbcdn.net/video.mp4' }] });
    if (url.searchParams.has('after')) return json({ data: [{ ...image, id: '2', media_type: 'CAROUSEL_ALBUM' }, image] });
    return json({ data: [image], paging: { next: 'https://evil.test/?access_token=private-token', cursors: { after: 'next-page' } } });
  });
  const posts = await client.posts('hyeoki_foodie');
  expect(posts).toHaveLength(2);
  expect(posts[1].media).toHaveLength(2);
  expect(urls.every(url => url.hostname === 'graph.instagram.com')).toBe(true);
  expect(urls.some(url => url.searchParams.get('after') === 'next-page')).toBe(true);
  expect(JSON.stringify(posts)).not.toContain('private-token');
});

test('wrong account, cursor cycles and page limits fail explicitly', async () => {
  const wrong = new InstagramClient('token', 'v25.0', async () => json({ user_id: '99', username: 'other' }));
  await expect(wrong.posts('hyeoki_foodie')).rejects.toMatchObject({ code: 'authentication' });
  const loop = new InstagramClient('token', 'v25.0', async () => json({ data: [], paging: { next: 'next', cursors: { after: 'same' } } }));
  await expect(loop.collection('99/media', 'id')).rejects.toMatchObject({ code: 'pagination' });
  await expect(loop.collection('99/media', 'id', 1)).rejects.toMatchObject({ code: 'pagination' });
});

test('API errors distinguish expiry and throttling; raw upstream errors stay private', async () => {
  const url = new URL('https://graph.instagram.com/me');
  await expect(requestJson(url, {}, async () => json({ error: { code: 190, message: 'secret-token' } }, 400))).rejects.toMatchObject({ code: 'authentication', status: 401 });
  await expect(requestJson(url, {}, async () => json({ error: { code: 4 } }, 400))).rejects.toMatchObject({ code: 'rate_limit', status: 429 });
  await expect(requestJson(url, {}, async () => { throw new Error('secret-token'); })).rejects.toThrow('Instagram: upstream');
  await expect(requestJson(url, {}, async () => new Response('not json'))).rejects.toThrow('Instagram: upstream');
});

test('public posts API returns only gallery data and disables caching', async ({ request }) => {
  const response = await request.get('/api/instagram/posts');
  expect(response.ok()).toBe(true);
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.json();
  expect(body.posts).toHaveLength(25);
  expect(body.nextCursor).toBe('25');
  const next = await request.get('/api/instagram/posts?after=25');
  expect((await next.json()).posts).toHaveLength(23);
  expect(JSON.stringify(body)).not.toMatch(/access_token|app_secret|session_key/i);
});

test('first page uses expanded carousel media and does not wait for later pages', async () => {
  let calls = 0;
  const client = new InstagramClient('token', 'v25.0', async input => {
    calls++;
    const url = new URL(String(input));
    if (url.pathname.endsWith('/me')) return json({ user_id: '99', username: 'hyeoki_foodie' });
    expect(url.searchParams.get('fields')).toContain('children.limit(100)');
    expect(url.searchParams.has('after')).toBe(false);
    return json({ data: [{ ...image, media_type: 'CAROUSEL_ALBUM', children: { data: [image, { ...image, id: '2' }] } }],
      paging: { next: 'https://graph.instagram.com/next?access_token=private', cursors: { after: 'next-page' } } });
  });
  const page = await client.postsPage('hyeoki_foodie');
  expect(calls).toBe(2);
  expect(page.posts[0].media).toHaveLength(2);
  expect(page.nextCursor).toBe('next-page');
  expect(JSON.stringify(page)).not.toContain('private');
});

test('page cache shares pending work, expires, isolates keys and retries failures', async () => {
  let now = 0, calls = 0;
  const cache = new PageCache<number>(100, 2, () => now);
  const load = async () => ++calls;
  expect(await Promise.all([cache.get('a', load), cache.get('a', load)])).toEqual([1, 1]);
  expect(await cache.get('b', load)).toBe(2);
  expect(await cache.get('a', load)).toBe(1);
  now = 101;
  expect(await cache.get('a', load)).toBe(3);
  await expect(cache.get('bad', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
  expect(await cache.get('bad', load)).toBe(4);
});

test('first photos remain usable while older photos are delayed; retry preserves horizontal camera', async ({ page }) => {
  let fail = true;
  await page.route('**/api/instagram/posts?after=25', async route => {
    if (fail) await route.fulfill({ status: 503, body: '{}' });
    else await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.photo-tile').first()).toBeAttached();
  await expect.poll(() => page.locator('.gallery-plane').evaluate(el => parseFloat(getComputedStyle(el).height))).toBeCloseTo(createLayout(25).height, 1);
  await expect(page.getByRole('status')).toContainText('이전 사진');
  await expect.poll(() => page.locator('.photo-tile img').evaluateAll(images => images.some(img => (img as HTMLImageElement).naturalWidth > 0))).toBeTruthy();
  const camera = await page.locator('.gallery-plane').evaluate(el => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { x: matrix.m41, scale: matrix.a };
  });
  fail = false;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect.poll(() => page.locator('.gallery-plane').evaluate(el => parseFloat(getComputedStyle(el).height))).toBeCloseTo(createLayout(48).height, 1);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect.poll(() => page.locator('.gallery-plane').evaluate(el => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { x: matrix.m41, y: matrix.m42, scale: matrix.a };
  })).toEqual({ ...camera, y: (900 - createLayout(48).height * camera.scale) / 2 });
});

test('OAuth rejects cross-origin requests and invalid admin keys', async ({ request }) => {
  const denied = await request.post('/api/instagram/connect', { headers: { origin: 'https://evil.test' }, form: { key: 'test-connect-key-for-local-tests-only' } });
  expect(denied.status()).toBe(403);
  const invalid = await request.post('/api/instagram/connect', { headers: { origin: 'http://127.0.0.1:3100' }, form: { key: 'wrong' } });
  expect(invalid.status()).toBe(403);
});

test('OAuth uses minimal scope and HttpOnly state; rejects tampering and denial', async ({ request }) => {
  const response = await request.post('/api/instagram/connect', { headers: { origin: 'http://127.0.0.1:3100' }, form: { key: 'test-connect-key-for-local-tests-only' }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const url = new URL(response.headers().location);
  expect(url.origin).toBe('https://www.instagram.com');
  expect(url.searchParams.get('scope')).toBe('instagram_business_basic');
  expect(response.headers()['set-cookie']).toContain('HttpOnly');
  expect(response.headers().location).not.toContain('test-secret');
  const tampered = await request.get('/api/instagram/callback?state=wrong&code=fake');
  expect(tampered.status()).toBe(400);
  expect(tampered.headers()['set-cookie']).toContain('Max-Age=0');
  const denied = await request.get(`/api/instagram/callback?state=${url.searchParams.get('state')}&error=access_denied`);
  expect(denied.status()).toBe(400);
});


test('pagination reuses account verification and isolates different usernames', async () => {
  let profiles = 0;
  const client = new InstagramClient('token', 'v25.0', async input => {
    if (new URL(String(input)).pathname.endsWith('/me')) {
      profiles++;
      return json({ user_id: '99', username: 'hyeoki_foodie' });
    }
    return json({ data: [image] });
  });
  await Promise.all([client.postsPage('hyeoki_foodie'), client.postsPage('hyeoki_foodie', 'next')]);
  expect(profiles).toBe(1);
  await expect(client.postsPage('another_account')).rejects.toMatchObject({ code: 'authentication' });
});
