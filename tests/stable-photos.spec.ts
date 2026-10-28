import { expect, test } from '@playwright/test';

test('appending pages keeps left-hand mounted photos and image nodes unchanged', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let fail = true;
  await page.route('**/api/instagram/posts?after=25', route => fail ? route.fulfill({ status: 503, body: '{}' }) : route.continue());
  await page.goto('/');
  await expect(page.getByRole('status')).toBeVisible();
  await expect.poll(() => page.locator('.photo-tile').evaluateAll(tiles => tiles.every(tile => !!tile.querySelector('img')))).toBe(true);
  const count = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll<HTMLElement>('.photo-tile')].filter(tile => Number(tile.dataset.cell!.split(':')[0]) < 0);
    (window as any).leftPhotos = tiles.map(tile => ({ tile, img: tile.querySelector('img'), label: tile.getAttribute('aria-label') }));
    return tiles.length;
  });
  expect(count).toBeGreaterThan(0);
  fail = false;
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).leftPhotos.every(({ tile, img, label }: any) => tile.isConnected && tile.querySelector('img') === img && tile.getAttribute('aria-label') === label))).toBe(true);
});

test('recycled cached thumbnails mount without an empty placeholder', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect.poll(() => page.locator('.photo-tile').evaluateAll(tiles => tiles.length > 0 && tiles.every(tile => !!tile.querySelector('img')))).toBe(true);
  await page.evaluate(() => {
    (window as any).recycled = { total: 0, empty: 0 };
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof HTMLElement && node.matches('.photo-tile')) {
          (window as any).recycled.total++;
          if (!node.querySelector('img')) (window as any).recycled.empty++;
        }
      }
    }).observe(document.querySelector('.gallery-plane')!, { childList: true, subtree: true });
  });
  await page.mouse.move(200, 450); await page.mouse.down();
  await page.mouse.move(1300, 450, { steps: 15 }); await page.mouse.up();
  expect(await page.evaluate(() => (window as any).recycled.total)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).recycled.empty)).toBe(0);
});
