import { test, expect } from '@playwright/test';
import { mockPosts } from '../src/lib/data/mock';

test('600 posts: production Chrome loading and gesture metrics', async ({ page }, info) => {
  await page.addInitScript(() => {
    const state = { commits: 0, frames: [] as number[], measuring: false };
    Object.assign(window, { galleryBenchmark: state, __REACT_DEVTOOLS_GLOBAL_HOOK__: {
      supportsFiber: true, inject: () => 1, onCommitFiberRoot: () => state.commits++,
      onCommitFiberUnmount: () => {},
    } });
    const frame = (time: number) => { if (state.measuring) state.frames.push(time); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  await page.route('**/api/instagram/posts?after=25', route => route.fulfill({ json: {
    posts: Array.from({ length: 575 }, (_, i) => ({ ...mockPosts[i % mockPosts.length], id: `benchmark-${i}` })), nextCursor: null,
  } }));
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  let images = 0;
  page.on('request', request => { if (request.resourceType() === 'image') images++; });
  await page.goto('/');
  await expect.poll(() => page.locator('.photo-tile img').evaluateAll(nodes => nodes.some(node => (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
  const firstImageMs = await page.evaluate(() => performance.now());
  await page.waitForTimeout(2000);
  const initial = { firstImageMs, imageRequests: images, tiles: await page.locator('.photo-tile').count(), images: await page.locator('.photo-tile img').count() };
  const before = await client.send('Performance.getMetrics');
  const commitsBefore = await page.evaluate(() => {
    const state = (window as any).galleryBenchmark; state.measuring = true; return state.commits;
  });
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(300, 450); await page.mouse.down();
    await page.mouse.move(1200, 450, { steps: 30 }); await page.mouse.up();
    await page.mouse.wheel(0, i % 2 ? 150 : -150);
    await page.waitForTimeout(300);
  }
  const gesture = await page.evaluate(commitsBefore => {
    const state = (window as any).galleryBenchmark; state.measuring = false;
    const times: number[] = state.frames;
    const intervals = times.slice(1).map((time, i) => time - times[i]).sort((a, b) => a - b);
    return { reactRootCommits: state.commits - commitsBefore,
      fps: (times.length - 1) * 1000 / (times.at(-1)! - times[0]), frameP95Ms: intervals[Math.floor(intervals.length * .95)] };
  }, commitsBefore);
  const after = await client.send('Performance.getMetrics');
  const value = (name: string, metrics = after.metrics) => metrics.find(m => m.name === name)!.value;
  const result = { fixture: '600 posts, 12 shared local JPEGs, 1440x900, production Chrome', initial, gesture,
    jsHeapBytes: value('JSHeapUsedSize'), layouts: value('LayoutCount') - value('LayoutCount', before.metrics),
    mainThreadMs: (value('TaskDuration') - value('TaskDuration', before.metrics)) * 1000,
    finalTiles: await page.locator('.photo-tile').count() };
  console.log(JSON.stringify(result));
  await info.attach('benchmark.json', { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.finalTiles).toBeLessThan(250);
});
