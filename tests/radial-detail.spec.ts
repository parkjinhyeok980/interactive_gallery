import { test, expect } from '@playwright/test';

test('cached photo visibly travels from its tile while the full-size request is delayed', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_next/image?**', async route => {
    if (Number(new URL(route.request().url()).searchParams.get('w')) > 384) await gate;
    await route.continue();
  });
  try {
    await page.goto('/');
    await expect.poll(() => page.locator('.photo-tile img').count(), { timeout: 20000 }).toBeGreaterThan(10);
    let key: string | null | undefined;
    await expect.poll(async () => {
      key = await page.locator('.photo-tile').evaluateAll(nodes => nodes.find(node => {
        const r = node.getBoundingClientRect(), img = node.querySelector('img');
        return r.left > 150 && r.right < 600 && r.top > 150 && r.bottom < 600 && !!img?.naturalWidth;
      })?.getAttribute('data-cell'));
      return key;
    }, { timeout: 15000 }).toBeTruthy();
    const tile = page.locator(`[data-cell="${key}"]`);
    const start = (await tile.boundingBox())!;
    await page.evaluate(() => {
      const state = { samples: [] as { x: number; y: number; preview: string; caption: number }[], done: false };
      (window as any).flight = state;
      const observer = new MutationObserver(() => {
        const photo = document.querySelector<HTMLElement>('.detail-image');
        if (!photo) return;
        observer.disconnect();
        const started = performance.now();
        const sample = () => {
          const r = photo.getBoundingClientRect(), img = photo.querySelector('img')!;
          state.samples.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, preview: getComputedStyle(img).backgroundImage,
            caption: Number(getComputedStyle(document.querySelector('.detail-copy')!).opacity) });
          if (performance.now() - started < 1400) requestAnimationFrame(sample); else state.done = true;
        };
        sample();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    await page.mouse.click(start.x + start.width / 2, start.y + start.height / 2);
    await expect.poll(() => page.evaluate(() => (window as any).flight.done)).toBe(true);
    const samples = await page.evaluate(() => (window as any).flight.samples) as { x: number; y: number; preview: string; caption: number }[];
    expect(Math.hypot(samples[0].x - start.x - start.width / 2, samples[0].y - start.y - start.height / 2)).toBeLessThan(25);
    expect(samples[0].preview).not.toBe('none');
    expect(samples[0].caption).toBeLessThan(.1);
    const last = samples.at(-1)!;
    expect(samples.some(sample => Math.hypot(sample.x - samples[0].x, sample.y - samples[0].y) > 30 && Math.hypot(sample.x - last.x, sample.y - last.y) > 30)).toBe(true);
    expect(last.caption).toBeCloseTo(1);
  } finally { release(); }
});

test('photos clear a circular space, caption sits below, and closing restores the gallery', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.locator('.photo-tile img').count()).toBeGreaterThan(10);
  const tile = page.locator('.photo-tile').filter({ has: page.locator('img') });
  const index = await tile.evaluateAll(nodes => nodes.findIndex(node => {
    const r = node.getBoundingClientRect();
    return r.left > 300 && r.right < innerWidth - 200 && r.top > 180 && r.bottom < innerHeight - 120;
  }));
  expect(index).toBeGreaterThanOrEqual(0);
  const selected = tile.nth(index);
  const key = await selected.getAttribute('data-cell');
  const cameraBefore = await page.locator('.gallery-plane').getAttribute('style');
  const hit = (await selected.boundingBox())!;
  await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2);
  await expect(page.getByRole('dialog')).toBeVisible();
  // Let the last automatic-flow culling update settle when the dialog pauses it.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const countBefore = await page.locator('.photo-tile').count();
  await expect.poll(() => page.locator('.detail-image img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.waitForTimeout(1100);
  const check = () => page.evaluate(key => {
    const content = document.querySelector('.detail-layout')!.getBoundingClientRect();
    const image = document.querySelector('.detail-image')!.getBoundingClientRect();
    const copy = document.querySelector('.detail-copy')!.getBoundingClientRect();
    const cx = content.left + content.width / 2, cy = content.top + content.height / 2;
    const radius = Math.hypot(content.width, content.height) / 2 + 24;
    const nodes = [...document.querySelectorAll<HTMLElement>('.photo-tile')].filter(tile => tile.dataset.cell !== key);
    return {
      clear: nodes.every(tile => {
        const r = tile.getBoundingClientRect();
        const x = Math.max(r.left, Math.min(cx, r.right)), y = Math.max(r.top, Math.min(cy, r.bottom));
        return Math.hypot(x - cx, y - cy) >= radius - 2;
      }),
      moved: nodes.filter(tile => { const m = new DOMMatrixReadOnly(getComputedStyle(tile).transform); return Math.abs(m.m41) + Math.abs(m.m42) > 10; }).length,
      captionBelow: copy.top >= image.bottom,
    };
  }, key);
  await expect.poll(async () => (await check()).clear).toBe(true);
  expect((await check()).moved).toBeGreaterThan(5);
  expect((await check()).captionBelow).toBe(true);
  expect(await page.locator('.photo-tile').count()).toBe(countBefore);
  await page.screenshot({ path: 'qa-artifacts/radial-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator(`[data-cell="${key}"]`)).toBeFocused();
  expect(await page.locator('.gallery-plane').getAttribute('style')).toBe(cameraBefore);
  expect(await page.locator('.photo-tile').evaluateAll(nodes => nodes.every(node => {
    const m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return Math.abs(m.m41) < .01 && Math.abs(m.m42) < .01 && Math.abs(m.a - 1) < .01 && getComputedStyle(node).opacity === '1';
  }))).toBe(true);
});
