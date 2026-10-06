import { expect, test } from '@playwright/test';
import type {} from '../../src/debug/api';
import { ASSETS, type AssetKey } from '../../src/systems/asset-manifest';

interface LoadedTexture {
  key: AssetKey;
  loaded: boolean;
  width: number;
  height: number;
  frames: number;
}

test('every manifest asset loads, sprite sheets cut into whole frames', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  await page.evaluate(() => window.__game?.startScene('asset-gallery'));
  await page.waitForFunction(
    () => window.__game?.activeScenes().includes('asset-gallery') ?? false,
  );

  const info = await page.evaluate(() => window.__game?.inspect('asset-gallery'));
  const keys = Object.keys(ASSETS) as AssetKey[];
  const textures = info?.textures as LoadedTexture[];
  const sounds = info?.sounds as { key: AssetKey; loaded: boolean }[];
  expect(textures.map((texture) => texture.key)).toEqual(
    keys.filter((key) => ASSETS[key].type !== 'audio'),
  );
  // Sounds are decoded and ready to play.
  expect(sounds).toEqual(
    keys.filter((key) => ASSETS[key].type === 'audio').map((key) => ({ key, loaded: true })),
  );
  for (const { key, loaded, width, height, frames } of textures) {
    const entry = ASSETS[key];
    expect(loaded, key).toBe(true);
    // A plain image has no frames besides the whole picture.
    const expected =
      entry.type === 'spritesheet' ? (width / entry.frameWidth) * (height / entry.frameHeight) : 0;
    expect(frames, key).toBe(expected);
  }

  await page.screenshot({ path: 'test-results/screenshots/asset-gallery.png' });
  // Down scrolls a row at a time to the rest, the portraits, as far as there's more to see.
  const scroll = async () =>
    (await page.evaluate(() => window.__game?.inspect('asset-gallery'))) as {
      scroll: number;
      maxScroll: number;
    };
  expect((await scroll()).maxScroll).toBeGreaterThan(0);
  while ((await scroll()).scroll < (await scroll()).maxScroll) {
    const before = (await scroll()).scroll;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(
      (from) => window.__game?.inspect('asset-gallery')?.scroll !== from,
      before,
    );
  }
  await page.screenshot({ path: 'test-results/screenshots/asset-gallery-portraits.png' });

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game?.activeScenes().includes('title') ?? false);
  expect(errors).toEqual([]);
});
