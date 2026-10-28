import { test, expect } from '@playwright/test';
import { mockPosts } from '../src/lib/data/mock';

test('idle flow performance with a large archive', async ({ page }) => {
  await page.route('**/api/instagram/posts?after=25', async route => {
    const posts = Array.from({ length: 1000 }, (_, i) => ({ ...mockPosts[i % mockPosts.length], id: `perf-${i}` }));
    await route.fulfill({ json: { posts, nextCursor: null } });
  });
  const client = await page.context().newCDPSession(page);
  await page.goto('/');
  await expect(page.locator('.photo-tile img').first()).toBeAttached({ timeout: 20000 });
  await page.waitForTimeout(3000);
  await client.send('Performance.enable');
  const before = await client.send('Performance.getMetrics');
  await page.waitForTimeout(2000);
  const after = await client.send('Performance.getMetrics');
  const delta = (name: string) => after.metrics.find(m => m.name === name)!.value - before.metrics.find(m => m.name === name)!.value;
  const dimensions = await page.locator('.gallery-row').evaluateAll(rows => rows.map(row => ({width: (row as HTMLElement).offsetWidth, height: (row as HTMLElement).offsetHeight})));
  console.log(JSON.stringify({ styleRecalculations: delta('RecalcStyleCount'), layouts: delta('LayoutCount'), mainThreadMs: delta('TaskDuration') * 1000, dimensions }));
  expect(await page.locator('.photo-tile').count()).toBeLessThan(250);
  expect(dimensions.every(row => row.height === 280)).toBe(true);
  expect(delta('RecalcStyleCount')).toBeLessThan(40);
  expect(await page.locator('.gallery-row').first().evaluate(row => row.getAnimations().some(animation => animation.playState === 'running'))).toBe(true);
});
