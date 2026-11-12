import { test, expect } from '@playwright/test';

const ready = (page) => expect(page.locator('html')).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
const opened = (page) => expect(page.locator('html')).toHaveAttribute('data-state', 'detail');

test('original assets load, city enters, zoom precedes the card, and back restores the city', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await ready(page);
  await expect(page.locator('.layer')).toHaveCount(85);
  const geometry = await page.locator('.layer img').evaluateAll((images) => images.map((image) => ({
    loaded: image.complete && image.naturalWidth > 0,
    width: image.getBoundingClientRect().width,
    height: image.getBoundingClientRect().height,
  })));
  expect(geometry.every((image) => image.loaded && image.width > 0 && image.height > 0)).toBe(true);
  await page.screenshot({ path: 'test-results/fv-desktop.png' });
  await page.getByRole('button', { name: '内装工事について詳しく見る' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-state', 'opening');
  await expect(page.getByRole('dialog')).toBeHidden();
  await opened(page);
  await page.locator('#back').blur();
  await page.screenshot({ path: 'test-results/interior-desktop.png' });
  await expect(page.locator('#world')).toHaveCSS('transform', /matrix\(2\.9614, 0, 0, 2\.9614, -1174\.09, -643\.081\)/);
  await page.getByRole('button', { name: 'TOPへ戻る' }).click();
  await ready(page);
  await expect(page.locator('#detail')).toBeHidden();
  await expect(page.locator('#world')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  // Escape during a second zoom must not let a delayed card appear afterward.
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-state', 'opening');
  await page.keyboard.press('Escape');
  await ready(page);
  await expect(page.locator('#detail')).toBeHidden();
  expect(errors).toEqual([]);
});

test('an image failure offers a working retry, and never starts a partial city', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/assets/02interior5.png', (route) => route.fulfill({ status: 503, body: '' }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'もう一度読み込む' })).toBeVisible();
  await expect(page.locator('#viewport')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.hotspot')).toBeDisabled();
  await page.unroute('**/assets/02interior5.png');
  await page.getByRole('button', { name: 'もう一度読み込む' }).click();
  await ready(page);
  await expect(page.locator('#loading')).toBeHidden();
});

test('mobile and reduced motion keep the card readable and keyboard return functional', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ready(page);
  await page.screenshot({ path: 'test-results/fv-mobile.png' });
  await page.getByRole('button', { name: '内装工事について詳しく見る' }).click();
  await opened(page);
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await expect(page.getByRole('button', { name: 'TOPへ戻る' })).toBeInViewport();
  await page.locator('#back').blur();
  await page.screenshot({ path: 'test-results/interior-mobile.png' });
  await page.keyboard.press('Escape');
  await ready(page);
  await expect(page.locator('.hotspot')).toBeFocused();
});
