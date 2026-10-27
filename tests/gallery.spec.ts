import { expect, test, type Page } from '@playwright/test';
import { createLayout, clampCamera, zoomAt } from '../src/lib/gallery/geometry';

const transform = (page: Page) => page.locator('.gallery-plane').evaluate(el => (el as HTMLElement).style.transform);
const scale = (page: Page) => page.locator('.gallery-plane').evaluate(el => Number((el as HTMLElement).style.transform.match(/scale\(([^)]+)\)/)?.[1]));
async function resetCamera(page: Page) {
  await page.getByRole('region', { name: '음식 사진 갤러리' }).focus();
  await page.keyboard.press('Home');
}
async function visibleTile(page: Page, carousel = false) {
  const tiles = page.locator(carousel ? '.photo-tile[aria-label*="여러 사진"]' : '.photo-tile');
  for (let i = 0; i < await tiles.count(); i++) {
    const box = await tiles.nth(i).boundingBox();
    const screen = page.viewportSize()!;
    if (box && box.x >= 0 && box.y > 80 && box.x + box.width < screen.width && box.y + box.height < screen.height - 90) return tiles.nth(i);
  }
  throw new Error('No fully visible tile');
}

test('500 tiles do not overlap; zoom anchors and camera bounds hold', () => {
  const world = createLayout(500);
  let overlaps = 0;
  for (const [i, a] of world.tiles.entries()) {
    for (const b of world.tiles.slice(i + 1)) {
      if (!(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)) overlaps++;
    }
  }
  expect(overlaps).toBe(0);
  const camera = { x: -200, y: -300, scale: 0.8 };
  const next = zoomAt(camera, 1.2, 400, 300);
  expect((400 - next.x) / next.scale).toBeCloseTo((400 - camera.x) / camera.scale);
  expect((300 - next.y) / next.scale).toBeCloseTo((300 - camera.y) / camera.scale);
  expect(clampCamera({ x: 99999, y: 99999, scale: 10 }, { width: 390, height: 844 }, world)).toEqual({ x: 60, y: 60, scale: 1.8 });
});

test('desktop exploration, details, carousel and restored camera', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.wordmark')).toHaveText('hyeoki');
  await expect(page.locator('.gallery-ui')).toHaveText('hyeoki');
  await expect(page.locator('.photo-tile').first()).toBeAttached();
  await expect.poll(() => scale(page)).toBeCloseTo(0.8);
  expect(await page.locator('.photo-tile').count()).toBeLessThan(48);
  await expect.poll(() => page.locator('.photo-tile img').evaluateAll(images => images.some(img => (img as HTMLImageElement).naturalWidth > 0))).toBeTruthy();
  await page.screenshot({ path: 'qa-artifacts/desktop.png' });
  const before = await transform(page);
  await page.mouse.move(760, 460);
  await page.mouse.down();
  await page.mouse.move(950, 550, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => transform(page)).not.toBe(before);
  await resetCamera(page);
  await expect.poll(() => transform(page)).toBe(before);
  await page.keyboard.press('+');
  await expect.poll(() => scale(page)).toBeCloseTo(0.92);
  await resetCamera(page);
  await expect.poll(() => transform(page)).toBe(before);
  await page.mouse.move(760, 460);
  await page.mouse.wheel(0, -150);
  await expect.poll(() => scale(page)).toBeGreaterThan(0.8);
  await page.getByRole('region', { name: '음식 사진 갤러리' }).focus();
  await page.keyboard.press('Home');
  await expect.poll(() => transform(page)).toBe(before);
  const tile = await visibleTile(page, true);
  await tile.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('time')).toBeVisible();
  await expect(dialog.locator('.detail-caption')).toContainText('실제 Instagram 게시물이나 캡션이 아닙니다');
  await page.getByRole('button', { name: '다음 사진' }).click();
  await expect(page.locator('.carousel-controls')).toContainText('02 / 03');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.carousel-controls')).toContainText('01 / 03');
  await page.getByRole('button', { name: '상세 보기 닫기' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '다음 사진' })).toBeFocused();
  await expect.poll(() => page.locator('.detail-image img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: 'qa-artifacts/detail.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(tile).toBeFocused();
  await expect.poll(() => transform(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('mobile touch drag, pinch, reduced motion and keyboard details', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3100');
  await expect.poll(() => scale(page)).toBeCloseTo(0.64);
  const before = await transform(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 430 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 260, y: 480 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => transform(page)).not.toBe(before);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 140, y: 430 }, { x: 240, y: 430 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 430 }, { x: 280, y: 430 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => scale(page)).toBeGreaterThan(0.64);
  await resetCamera(page);
  await expect.poll(() => transform(page)).toBe(before);
  await page.screenshot({ path: 'qa-artifacts/mobile.png' });
  const tile = await visibleTile(page);
  await tile.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => page.locator('.detail-image img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: 'qa-artifacts/mobile-detail.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => transform(page)).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await context.close();
});
