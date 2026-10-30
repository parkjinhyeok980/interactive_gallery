import { expect, test, type Frame, type Page } from '@playwright/test';

async function openPhoto(surface: Page | Frame) {
  await expect.poll(() => surface.locator('.photo-tile img').evaluateAll(nodes => nodes.filter(node => (node as HTMLImageElement).naturalWidth > 0).length)).toBeGreaterThan(5);
  const key = await surface.locator('.photo-tile').evaluateAll(nodes => nodes.find(node => {
    const r = node.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top > 90 && r.bottom < innerHeight - 80;
  })?.getAttribute('data-cell'));
  expect(key).toBeTruthy();
  await surface.locator(`[data-cell="${key}"]`).click();
  await expect(surface.getByRole('dialog')).toBeVisible();
  await expect.poll(() => surface.locator('.detail-image img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  return key;
}

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) {
  test(`centered photo and circular clearing at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await openPhoto(page);
    await expect.poll(() => page.locator('.detail-image').evaluate(node => {
      const r = node.getBoundingClientRect();
      return Math.abs(r.top + r.height / 2 - innerHeight / 2);
    })).toBeLessThan(1);
    await expect.poll(() => page.locator('.photo-tile').evaluateAll(nodes => {
      const photo = document.querySelector('.detail-image')!.getBoundingClientRect();
      const cx = photo.left + photo.width / 2, cy = photo.top + photo.height / 2;
      if (Math.abs(cx - innerWidth / 2) > 1) return false;
      return nodes.every(node => {
        if (Number(getComputedStyle(node).opacity) === 0) return true;
        const r = node.getBoundingClientRect();
        const distance = Math.hypot(Math.max(r.left - cx, cx - r.right, 0), Math.max(r.top - cy, cy - r.bottom, 0));
        return distance >= Math.hypot(photo.width, photo.height) / 2 + 75;
      });
    })).toBe(true);
    await page.screenshot({ path: `qa-artifacts/detail-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test('standalone Chrome and an embedded preview use identical viewport geometry', async ({ page, context, baseURL }) => {
  const viewport = { width: 650, height: 780 };
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const key = await openPhoto(page);
  const measure = () => {
    const selectors = ['.gallery-shell', '.gallery-plane', '.detail-image', '.detail-copy'];
    return selectors.map(selector => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map(value => Math.round(value));
    });
  };
  const standalone = await page.evaluate(measure);
  const embedded = await context.newPage();
  await embedded.emulateMedia({ reducedMotion: 'reduce' });
  await embedded.setViewportSize({ width: 1000, height: 900 });
  await embedded.setContent(`<iframe src="${baseURL}" style="width:650px;height:780px;border:0"></iframe>`);
  await expect.poll(() => embedded.frames().length).toBe(2);
  const frame = embedded.frames()[1];
  await expect.poll(() => frame.locator(`[data-cell="${key}"] img`).evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await frame.locator(`[data-cell="${key}"]`).click();
  await expect.poll(() => frame.locator('.detail-image img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => frame.evaluate(measure)).toEqual(standalone);
});
