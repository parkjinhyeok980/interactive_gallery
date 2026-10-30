import { expect, test } from '@playwright/test';
import { mockPosts } from '../src/lib/data/mock';
import { layoutMetrics } from '../src/lib/gallery/geometry';

test('loads the entire 125-post collection before establishing a fixed repeat period', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const extra = Array.from({ length: 100 }, (_, i) => ({ ...mockPosts[i % mockPosts.length], id: `complete-${i}` }));
  let deliver!: () => Promise<void>;
  await page.route('**/api/instagram/posts?after=*', route => {
    const cursor = new URL(route.request().url()).searchParams.get('after');
    if (cursor === '25') return route.fulfill({ json: { posts: extra.slice(0, 50), nextCursor: '75' } });
    deliver = () => route.fulfill({ json: { posts: extra.slice(50), nextCursor: null } });
  });
  await page.goto('/');
  await expect.poll(() => typeof deliver).toBe('function');
  await expect(page.locator('.burger-loader')).toBeVisible();
  await expect(page.locator('.gallery-plane')).toHaveCount(0);
  await deliver();
  await expect(page.locator('.burger-loader')).toHaveCount(0);
  const plane = page.locator('.gallery-plane');
  await expect(plane).toHaveCSS('width', `${layoutMetrics(125).width}px`);
  const seen = new Set<number>();
  for (let i = 0; i < 10; i++) {
    const tiles = await page.locator('.photo-tile').evaluateAll(nodes => nodes.map(node => ({
      cell: node.getAttribute('data-cell')!, index: parseInt(node.getAttribute('aria-label')!) - 1,
    })));
    for (const tile of tiles) {
      const [column, row] = tile.cell.split(':').map(Number);
      expect(tile.index).toBe(row + ((column % 25 + 25) % 25) * 5);
      seen.add(tile.index);
    }
    const before = await plane.getAttribute('style');
    await page.mouse.wheel(650, 0);
    await expect.poll(() => plane.getAttribute('style')).not.toBe(before);
  }
  expect(seen.size).toBe(125);
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
