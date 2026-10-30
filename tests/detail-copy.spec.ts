import { expect, test } from '@playwright/test';
import { mockPosts } from '../src/lib/data/mock';

test('long captions wrap without truncation and clicking the photo closes it', async ({ page }) => {
  const caption = '맛있는 음식을 기록하는 공간입니다. 긴 설명도 자연스럽게 줄을 바꾸어 읽을 수 있습니다.\n'.repeat(12) + '#아주긴태그'.repeat(25);
  await page.route('**/api/instagram/posts?after=25', route => route.fulfill({ json: {
    posts: mockPosts.slice(25).map(post => ({ ...post, caption })), nextCursor: null,
  } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect.poll(() => page.locator('.photo-tile img').count()).toBeGreaterThan(10);
    const key = await page.locator('.photo-tile').evaluateAll(nodes => nodes.find(node => {
      const r = node.getBoundingClientRect();
      return parseInt(node.getAttribute('aria-label')!) > 25 && r.left > 0 && r.right < innerWidth && r.top > 90 && r.bottom < innerHeight - 50;
    })?.getAttribute('data-cell'));
    expect(key).toBeTruthy();
    await page.locator(`[data-cell="${key}"]`).click();
    await expect(page.locator('.detail-caption')).toHaveText(caption);
    await expect(page.locator('.detail-close')).toHaveCount(0);
    const typography = await page.locator('.detail-caption').evaluate(node => {
      const style = getComputedStyle(node);
      return { font: style.fontFamily, wordmark: getComputedStyle(document.querySelector('.wordmark')!).fontFamily,
        weight: style.fontWeight, clamp: style.webkitLineClamp, fits: node.scrollWidth <= node.clientWidth + 1,
        scrolls: node.scrollHeight > node.clientHeight };
    });
    expect(typography.font).toBe(typography.wordmark);
    expect(typography.weight).toBe('300');
    expect(typography.clamp).toBe('none');
    expect(typography.fits).toBe(true);
    expect(typography.scrolls).toBe(true);
    await page.screenshot({ path: `qa-artifacts/caption-${viewport.width}.png` });
    const before = await page.locator('.gallery-focus').getAttribute('style');
    await page.getByRole('button', { name: '사진 닫기' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.locator('.gallery-focus').getAttribute('style')).toBe(before);
  }
});

test('hamburger outlines draw while later pages are pending', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/instagram/posts?after=25', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/');
    const fill = page.locator('.burger-loader-fill path').first();
    await expect(fill).toBeVisible();
    const before = await fill.evaluate(node => getComputedStyle(node).strokeDashoffset);
    await expect.poll(() => fill.evaluate(node => getComputedStyle(node).strokeDashoffset)).not.toBe(before);
    await page.screenshot({ path: 'qa-artifacts/burger-loading.png' });
  } finally { release(); }
  await expect(page.locator('.gallery-plane')).toBeAttached();
  await expect(page.locator('.burger-loader')).toHaveCount(0);
});
