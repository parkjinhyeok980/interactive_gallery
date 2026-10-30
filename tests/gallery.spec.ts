import { expect, test, type Page } from '@playwright/test';
import { mockPosts } from '../src/lib/data/mock';
import { createLayout, clampCamera, fitScale, zoomAt, layoutMetrics, visibleTiles, TILE_SIZE, ROW_PITCH, EDGE_PADDING } from '../src/lib/gallery/geometry';

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
    if (box && box.x > 16 && box.x + box.width < screen.width - 16 && box.y > 80 && box.y + box.height < screen.height - 90) {
      // Retaining a detail pan changes which offscreen cells are mounted.
      // Follow this photo's identity instead of its index in the visible list.
      const key = await tiles.nth(i).getAttribute('data-cell');
      return page.locator(`.photo-tile[data-cell="${key}"]`);
    }
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

test('five fixed rows preserve every post and coordinates at every zoom', () => {
  for (const count of [1, 25, 48, 600, 608]) for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) for (const requested of [.45, .5, 1, 1.8]) {
    const world = createLayout(count);
    const scale = clampCamera({ x: 0, y: 0, scale: requested }, size, world).scale;
    const camera = clampCamera({ x: 0, y: -1e6, scale }, size, world);
    expect(world.rows).toBe(Math.min(5, count));
    expect(world.tiles).toEqual(createLayout(count).tiles);
    expect(camera.scale).toBeGreaterThanOrEqual(fitScale(size, world));
    expect(camera.y).toBeCloseTo(Math.min((size.height - world.height * scale) / 2, size.height - EDGE_PADDING - world.height * scale));
    expect(clampCamera({ ...camera, y: 1e6 }, size, world).y).toBeLessThanOrEqual(Math.max(EDGE_PADDING, (size.height - world.height * scale) / 2) + .001);
    expect(world.tiles).toHaveLength(count);
    const seen = new Set<number>();
    let allFit = true, bounded = true;
    for (let row = 0; row < world.rows; row++) for (let col = 0; col < world.columns; col += Math.max(1, Math.floor(size.width / (TILE_SIZE * scale)))) {
      const position = clampCamera({ ...camera, x: -col * TILE_SIZE * scale, y: -row * ROW_PITCH * scale }, size, world);
      const tiles = visibleTiles(count, position, size);
      bounded &&= tiles.length < 250;
      for (const tile of tiles) {
        allFit &&= tile.index >= 0 && tile.index < count;
        seen.add(tile.index);
      }
    }
    expect(allFit).toBe(true); expect(bounded).toBe(true); expect(seen.size).toBe(count);
  }
  expect(layoutMetrics(600, { width: 1440, height: 900 }, .5)).toMatchObject({ rows: 5, columns: 120 });
});

test('zoomed visibility excludes distant rows while retaining overscan and all visible tiles', () => {
  const viewport = { width: 844, height: 390 };
  const world = createLayout(600);
  for (const y of [0, -800, -2400]) for (const drift of [0, 400, 10000]) {
    const camera = clampCamera({ x: -300, y, scale: 1.8 }, viewport, world);
    const tiles = visibleTiles(600, camera, viewport, drift);
    expect(new Set(tiles.map(tile => tile.y)).size).toBeLessThan(5);
    for (let row = 0; row < world.rows; row++) {
      const top = row * ROW_PITCH * camera.scale + camera.y;
      if (top < viewport.height && top + TILE_SIZE * camera.scale > 0) {
        const rowTiles = tiles.filter(tile => tile.y === row * ROW_PITCH);
        const offset = (row % 2 === 0 ? 1 : -1) * drift;
        expect(rowTiles.length).toBeGreaterThan(0);
        expect((rowTiles[0].x + offset) * camera.scale + camera.x).toBeLessThanOrEqual(0);
        expect((rowTiles.at(-1)!.x + TILE_SIZE + offset) * camera.scale + camera.x).toBeGreaterThanOrEqual(viewport.width);
      }
    }
  }
});

test('zoom stops at five-row fit and allows vertical dragging only within five rows', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/instagram/posts?after=25', route => route.fulfill({ json: {
    posts: Array.from({ length: 575 }, (_, i) => ({ ...mockPosts[i % mockPosts.length], id: `bounds-${i}` })), nextCursor: null,
  } }));
  await page.goto('/');
  await expect(page.locator('.gallery-plane')).toHaveCSS('width', `${layoutMetrics(600).width}px`);
  const before = await transform(page);
  const minimum = await scale(page);
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => scale(page)).toBeCloseTo(minimum);
  for (const [from, to] of [[780, 120], [120, 780]]) {
    await page.mouse.move(700, from); await page.mouse.down();
    await page.mouse.move(700, to, { steps: 5 }); await page.mouse.up();
    expect(await transform(page)).toBe(before);
  }
  const fits = () => page.locator('.gallery-row').evaluateAll(rows => rows.every(row => {
    const rect = row.getBoundingClientRect(); return rect.top >= 15.9 && rect.bottom <= innerHeight - 15.9;
  }));
  await expect.poll(fits).toBe(true);
  const rowPositions = await page.locator('.gallery-row').evaluateAll(rows => rows.map(row => (row as HTMLElement).style.top));
  for (const delta of [-150, -150, 150]) {
    const previous = await scale(page); await page.mouse.wheel(0, delta);
    await expect.poll(() => scale(page)).not.toBe(previous);
    expect(await page.locator('.gallery-row').evaluateAll(rows => rows.map(row => (row as HTMLElement).style.top))).toEqual(rowPositions);
  }
  const zoomed = await transform(page);
  await page.mouse.move(700, 700); await page.mouse.down();
  await page.mouse.move(700, 100, { steps: 5 }); await page.mouse.up();
  await expect.poll(() => transform(page)).not.toBe(zoomed);
  await expect.poll(() => page.locator('.gallery-row').last().evaluate(row => row.getBoundingClientRect().bottom)).toBeCloseTo(900 - EDGE_PADDING, 1);
  const bottom = await transform(page);
  await page.mouse.move(700, 700); await page.mouse.down();
  await page.mouse.move(700, 100, { steps: 5 }); await page.mouse.up();
  expect(await transform(page)).toBe(bottom);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.gallery-row')).toHaveCount(5);
  const beforePan = await transform(page);
  await page.mouse.move(400, 200);
  await page.mouse.wheel(200, 0);
  await expect.poll(() => transform(page)).not.toBe(beforePan);
  await expect(page.locator('.gallery-row')).toHaveCount(5);
});

test('desktop exploration, details, carousel and restored camera', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect.poll(() => page.locator('.gallery-plane').evaluate(el => parseFloat(getComputedStyle(el).height))).toBeCloseTo(createLayout(48).height, 1);
  await expect(page.locator('.wordmark')).toHaveText('hyeoki_foodie');
  await expect(page.locator('.gallery-ui')).toHaveText('hyeoki_foodie');
  await expect(page.locator('.photo-tile').first()).toBeAttached();
  await expect.poll(() => scale(page)).toBeCloseTo(fitScale({ width: 1440, height: 900 }, createLayout(48)));
  expect(await page.locator('.photo-tile').count()).toBeLessThan(250);
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
  await expect.poll(() => scale(page)).toBeCloseTo(fitScale({ width: 1440, height: 900 }, createLayout(48)) * 1.15);
  await resetCamera(page);
  await expect.poll(() => transform(page)).toBe(before);
  await page.mouse.move(760, 460);
  await page.mouse.wheel(0, -150);
  await expect.poll(() => scale(page)).toBeGreaterThan(fitScale({ width: 1440, height: 900 }, createLayout(48)));
  await page.mouse.wheel(0, 150);
  await expect.poll(() => scale(page)).toBeCloseTo(fitScale({ width: 1440, height: 900 }, createLayout(48)));
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => transform(page)).toBe(before);
  await resetCamera(page);
  await expect.poll(() => transform(page)).toBe(before);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -150);
  await page.keyboard.up('Control');
  await expect.poll(() => scale(page)).toBeGreaterThan(fitScale({ width: 1440, height: 900 }, createLayout(48)));
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
  await page.getByRole('button', { name: '사진 닫기' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '다음 사진' })).toBeFocused();
  await expect.poll(() => page.locator('.detail-image img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.detail-image')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const dimensions = await page.locator('.detail-image img').evaluate(node => {
    const img = node as HTMLImageElement, rect = img.getBoundingClientRect(), parent = img.parentElement!.getBoundingClientRect();
    return { actual: rect.width / rect.height, natural: img.naturalWidth / img.naturalHeight, height: rect.height, frame: parent.height };
  });
  expect(dimensions.actual).toBeCloseTo(1, 2);
  await expect(page.locator('.detail-image img')).toHaveCSS('object-fit', 'cover');
  expect(dimensions.height).toBeCloseTo(dimensions.frame, 1);
  await page.screenshot({ path: 'qa-artifacts/detail.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(tile).toBeFocused();
  await expect.poll(() => transform(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('portrait, landscape and square photos use identical frames on desktop and mobile', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let source = { width: 400, height: 800 };
  await page.route('**/_next/image?**', async route => {
    if (Number(new URL(route.request().url()).searchParams.get('w')) >= 384) {
      await route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${source.width}" height="${source.height}"><rect width="100%" height="100%" fill="tan"/></svg>` });
    } else await route.continue();
  });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    let expectedSide: number | undefined;
    for (const dimensions of [{ width: 400, height: 800 }, { width: 800, height: 400 }, { width: 400, height: 400 }]) {
    source = dimensions;
    await page.setViewportSize(viewport); await page.goto('/');
    await expect(page.locator('.gallery-row')).toHaveCount(5);
    await (await visibleTile(page)).click();
    const img = page.locator('.detail-image img');
    await expect.poll(() => img.evaluate(node => {
      const image = node as HTMLImageElement;
      return image.naturalWidth / image.naturalHeight;
    })).toBeCloseTo(source.width / source.height, 2);
    const box = await img.boundingBox();
    expect(box!.width / box!.height).toBeCloseTo(1, 2);
    await expect(img).toHaveCSS('object-fit', 'cover');
    expectedSide ??= box!.width;
    expect(box!.width).toBeCloseTo(expectedSide, 1);
    expect(box!.height).toBeLessThan(viewport.height);
    await expect(page.locator('.detail-image')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const frame = await page.locator('.detail-image').boundingBox();
    expect(frame!.width).toBeCloseTo(box!.width, 1);
    expect(frame!.height).toBeCloseTo(box!.height, 1);
    await page.keyboard.press('Escape');
    }
  }
});

test('mouse dragging traverses all directions with bounded rendering', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect.poll(() => page.locator('.gallery-plane').evaluate(el => parseFloat(getComputedStyle(el).height))).toBe(createLayout(48).height);
  await page.mouse.move(700, 450);
  for (const [dx, dy] of [[500, 0], [-500, 0], [0, 350], [0, -350]]) {
    const before = await page.locator('.gallery-plane').evaluate(el => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { x: matrix.m41, y: matrix.m42, scale: matrix.a };
    });
    await page.mouse.move(700, 450);
    await page.mouse.down();
    await page.mouse.move(700 + dx, 450 + dy, { steps: 8 });
    await page.mouse.up();
    const expected = clampCamera({ ...before, x: before.x + dx, y: before.y + dy }, page.viewportSize()!, createLayout(48));
    await expect.poll(() => page.locator('.gallery-plane').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)).toBeCloseTo(expected.x, 2);
    await expect.poll(() => page.locator('.gallery-plane').evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBeCloseTo(expected.y, 2);
    await expect.poll(() => page.evaluate(() => {
      return [[10, innerHeight / 2], [innerWidth - 10, innerHeight / 2], [innerWidth / 2, innerHeight / 2]]
        .every(([x, y]) => [0, -24, 24].some(offset => !!document.elementFromPoint(x, y + offset)?.closest('.photo-tile')));
    })).toBe(true);
    expect(await page.locator('.photo-tile').count()).toBeLessThan(250);
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
  await expect.poll(() => page.locator('.gallery-plane').evaluate(el => parseFloat(getComputedStyle(el).height))).toBeCloseTo(createLayout(48, { width: 390, height: 844 }, .45).height, 1);
  await expect.poll(() => scale(page)).toBeCloseTo(fitScale({ width: 390, height: 844 }, createLayout(48)));
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
  await expect.poll(() => scale(page)).toBeGreaterThan(fitScale({ width: 390, height: 844 }, createLayout(48)));
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


test('rows drift gently in opposite directions and stop while a photo is caught', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.photo-tile').first()).toBeAttached();
  const sample = () => page.locator('.photo-tile').evaluateAll(tiles => tiles.slice(0, 30).map(tile => ({
    key: tile.getAttribute('data-cell'), x: tile.getBoundingClientRect().x,
  })));
  const before = await sample();
  await page.waitForTimeout(1200);
  const after = await sample();
  const movements = before.flatMap(a => {
    const b = after.find(b => b.key === a.key);
    return b ? [b.x - a.x] : [];
  });
  expect(movements.some(dx => dx > 3 && dx < 16)).toBe(true);
  expect(movements.some(dx => dx < -3 && dx > -16)).toBe(true);
  const tile = await visibleTile(page);
  const box = (await tile.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('dialog')).toBeVisible();
  const offset = () => page.locator('.gallery-row').first().evaluate(el => getComputedStyle(el).transform);
  const frozen = await offset();
  await page.waitForTimeout(400);
  expect(await offset()).toBe(frozen);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await offset();
  await page.waitForTimeout(400);
  expect(await offset()).toBe(reduced);
});

test('thumbnail optimizer failure never downloads full originals', async ({ page }) => {
  const originals: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/images/')) originals.push(request.url()); });
  await page.route('**/_next/image?**', route => route.fulfill({ status: 504, body: '' }));
  await page.goto('/');
  await expect(page.locator('.image-fallback').first()).toBeAttached();
  expect(originals).toEqual([]);
});


test('gallery bounds preview requests and uses small images', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  await page.route('**/_next/image?**', async route => {
    requests.push(route.request().url());
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/');
    await expect.poll(() => requests.length).toBe(4);
    await page.waitForTimeout(500);
    expect(requests).toHaveLength(4);
    expect(requests.every(url => Number(new URL(url).searchParams.get('w')) <= 384)).toBe(true);
    expect(await page.locator('.gallery-row').count()).toBeLessThan(12);
    expect(await page.locator('.photo-tile').count()).toBeGreaterThan(20);
  } finally { release(); }
  await expect.poll(() => page.locator('.photo-tile img').count()).toBeGreaterThan(4);
});
