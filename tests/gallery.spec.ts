import { expect, test, type Page } from '@playwright/test';
import { createLayout, clampCamera, zoomAt, visibleTiles, TILE_SIZE } from '../src/lib/gallery/geometry';

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
    // A narrow viewport can clip tile edges; the click/focus target must be visible.
    if (box && box.x + box.width / 2 > 0 && box.x + box.width / 2 < screen.width && box.y > 80 && box.y + box.height < screen.height - 90) return tiles.nth(i);
  }
  throw new Error('No tile with a visible center');
}

test('uniform tiles do not overlap; zoom anchors hold and movement is unbounded', () => {
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
  expect(clampCamera({ x: 99999, y: -99999, scale: 10 })).toEqual({ x: 99999, y: -99999, scale: 1.8 });
  expect(world.tiles.every(tile => tile.width === TILE_SIZE && tile.height === TILE_SIZE)).toBe(true);
});

test('infinite grid fills every direction with bounded DOM work, including partial rows', () => {
  for (const count of [1, 25, 48, 608]) for (const x of [-1000000, 0, 1000000]) for (const y of [-1000000, 0, 1000000]) {
    const camera = { x, y, scale: 0.45 }, size = { width: 1440, height: 900 };
    const tiles = visibleTiles(count, camera, size);
    expect(tiles.length).toBeLessThan(250);
    expect(new Set(tiles.map(tile => tile.key)).size).toBe(tiles.length);
    expect(tiles.every(tile => tile.index >= 0 && tile.index < count)).toBe(true);
    for (const sx of [0, 400, 800, 1439]) for (const sy of [0, 300, 600, 899]) {
      const wx = (sx - x) / camera.scale, wy = (sy - y) / camera.scale;
      expect(tiles.filter(tile => wx >= tile.x && wx < tile.x + tile.width && wy >= tile.y && wy < tile.y + tile.height)).toHaveLength(1);
    }
  }
  expect(visibleTiles(0, { x: 0, y: 0, scale: 1 }, { width: 1440, height: 900 })).toEqual([]);
});

test('desktop exploration, details, carousel and restored camera', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect.poll(() => page.locator('.gallery-plane').evaluate(el => parseFloat(getComputedStyle(el).height))).toBeCloseTo(createLayout(48).height, 1);
  await expect(page.locator('.wordmark')).toHaveText('hyeoki');
  await expect(page.locator('.gallery-ui')).toHaveText('hyeoki');
  await expect(page.locator('.photo-tile').first()).toBeAttached();
  await expect.poll(() => scale(page)).toBeCloseTo(0.8);
  expect(await page.locator('.photo-tile').count()).toBeLessThan(160);
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
  await expect.poll(() => transform(page)).not.toBe(before);
  await expect.poll(() => scale(page)).toBeCloseTo(0.8);
  await resetCamera(page);
  await expect.poll(() => transform(page)).toBe(before);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -150);
  await page.keyboard.up('Control');
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

test('wheel can traverse far beyond all four edges without frames or gaps', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect.poll(() => page.locator('.gallery-plane').evaluate(el => parseFloat(getComputedStyle(el).height))).toBe(createLayout(48).height);
  await page.mouse.move(700, 450);
  for (const [dx, dy] of [[100000, 0], [-200000, 0], [0, 100000], [0, -200000]]) {
    const before = await transform(page);
    await page.mouse.wheel(dx, dy);
    await expect.poll(() => transform(page)).not.toBe(before);
    await expect.poll(() => page.evaluate(() => {
      return [[10, 150], [innerWidth - 10, 150], [10, innerHeight - 10], [innerWidth - 10, innerHeight - 10], [innerWidth / 2, innerHeight / 2]]
        .every(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.photo-tile'));
    })).toBe(true);
    expect(await page.locator('.photo-tile').count()).toBeLessThan(160);
  }
  await expect(page.locator('.photo-tile img').first()).toHaveCSS('object-fit', 'cover');
  await expect(page.locator('.photo-tile').first()).toHaveCSS('border-width', '0px');
  await expect(page.locator('.photo-tile').first()).toHaveCSS('padding', '0px');
  await resetCamera(page);
  const tile = await visibleTile(page);
  await tile.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tile).toBeFocused();
});

test('mobile touch drag, pinch, reduced motion and keyboard details', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3100');
  await expect.poll(() => page.locator('.gallery-plane').evaluate(el => parseFloat(getComputedStyle(el).height))).toBeCloseTo(createLayout(48).height, 1);
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
