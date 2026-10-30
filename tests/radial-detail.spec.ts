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

// Measure the rendered tile displacement against the rendered photo center.
// This catches a stale circle center even when the final photo is centered.
async function measureReveal(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const image = document.querySelector('.detail-image')!.getBoundingClientRect();
    const cx = image.left + image.width / 2, cy = image.top + image.height / 2;
    const cameraScale = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.gallery-plane')!).transform).a;
    let error = 0, moved = 0, clearance = Infinity;
    for (const tile of document.querySelectorAll('.photo-tile')) {
      if (Number(getComputedStyle(tile).opacity) === 0) continue;
      const r = tile.getBoundingClientRect();
      const m = new DOMMatrixReadOnly(getComputedStyle(tile).transform);
      const dx = m.m41 * cameraScale, dy = m.m42 * cameraScale;
      const displacement = Math.hypot(dx, dy);
      if (displacement > 5) {
        moved++;
        error = Math.max(error, Math.abs((r.left + r.width / 2 - cx) * dy - (r.top + r.height / 2 - cy) * dx) / displacement);
      }
      clearance = Math.min(clearance, Math.hypot(Math.max(r.left - cx, cx - r.right, 0), Math.max(r.top - cy, cy - r.bottom, 0)));
    }
    return { error, moved, clearance, diagonal: Math.hypot(image.width, image.height), centerError: Math.hypot(cx - innerWidth / 2, cy - innerHeight / 2) };
  });
}

async function clickSurroundingPhoto(page: import('@playwright/test').Page) {
  const candidate = await page.locator('.photo-tile').evaluateAll(nodes => {
    const current = document.querySelector<HTMLImageElement>('.detail-image img')?.alt;
    for (const node of nodes) {
      const r = node.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x < 30 || x > innerWidth - 30 || y < 90 || y > innerHeight - 30 || Number(getComputedStyle(node).opacity) === 0) continue;
      if (node.querySelector('img')?.alt === current || !node.querySelector('img')?.naturalWidth) continue;
      if (document.elementFromPoint(x, y)?.closest('.photo-tile') === node) return { x, y, key: node.getAttribute('data-cell'), alt: node.querySelector('img')!.alt };
    }
  });
  expect(candidate).toBeTruthy();
  await page.mouse.click(candidate!.x, candidate!.y);
  return candidate!;
}

test('the enlarged circular clearing follows the photo throughout its journey to the center', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.locator('.photo-tile img').count()).toBeGreaterThan(10);
  await clickSurroundingPhoto(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  let movingSamples = 0;
  for (let i = 0; i < 12; i++) {
    const state = await measureReveal(page);
    if (state.moved > 3) {
      expect(state.error).toBeLessThan(2);
      if (state.centerError > 10) movingSamples++;
    }
    await page.waitForTimeout(70);
  }
  expect(movingSamples).toBeGreaterThan(0);
  await expect.poll(async () => (await measureReveal(page)).centerError).toBeLessThan(1);
  const state = await measureReveal(page);
  expect(state.moved).toBeGreaterThan(5);
  expect(state.clearance).toBeGreaterThan(state.diagonal / 2 + 75);
  await page.screenshot({ path: 'qa-artifacts/radial-desktop.png' });
  // A viewport resize must use the new layout center, not the animated bounds.
  await page.setViewportSize({ width: 1100, height: 760 });
  await expect.poll(async () => (await measureReveal(page)).centerError).toBeLessThan(1);
  await expect.poll(async () => (await measureReveal(page)).error).toBeLessThan(2);
});

test('surrounding photos switch directly and closing preserves the latest horizontal position', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.locator('.photo-tile img').count()).toBeGreaterThan(10);
  let selected = await clickSurroundingPhoto(page);
  for (let i = 0; i < 3; i++) {
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('.detail-image img')).toHaveAttribute('alt', selected.alt);
    await expect.poll(async () => (await measureReveal(page)).centerError).toBeLessThan(1);
    await expect.poll(async () => (await measureReveal(page)).error).toBeLessThan(2);
    if (i < 2) selected = await clickSurroundingPhoto(page);
  }
  const pan = () => page.locator('.gallery-focus').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41);
  const beforeClose = await pan();
  await page.getByRole('button', { name: '사진 닫기' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await pan()).toBeCloseTo(beforeClose, 1);
  await expect(page.locator(`[data-cell="${selected.key}"]`)).toBeFocused();
  expect(await page.locator('.photo-tile').evaluateAll(nodes => nodes.every(node => {
    const m = new DOMMatrixReadOnly(getComputedStyle(node).transform);
    return Math.abs(m.m41) < .01 && Math.abs(m.m42) < .01 && Math.abs(m.a - 1) < .01 && getComputedStyle(node).opacity === '1';
  }))).toBe(true);
  // Retained camera offsets also participate in tile culling after closing.
  await expect.poll(() => page.evaluate(() => [30, innerWidth - 30].every(x =>
    !!document.elementFromPoint(x, innerHeight / 2)?.closest('.photo-tile')
  ))).toBe(true);
});
