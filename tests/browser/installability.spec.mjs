import {test,expect} from '@playwright/test';

test('public install manifest, standalone metadata and sized icons are available before sign-in',async({page})=>{
  await page.goto('/');
  const link=page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute('href','/manifest.webmanifest');
  const response=await page.request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/manifest+json');
  const manifest=await response.json();
  expect(manifest.id).toBe('/');
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.prefer_related_applications).toBe(false);
  for(const icon of manifest.icons){
    const result=await page.request.get(icon.src);
    expect(result.status()).toBe(200);
    expect(result.headers()['content-type']).toContain('image/png');
    const buffer=await result.body();
    const size=Number(icon.sizes.split('x')[0]);
    expect(buffer.readUInt32BE(16)).toBe(size);
    expect(buffer.readUInt32BE(20)).toBe(size);
  }
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  const parsed=await cdp.send('Page.getAppManifest');
  expect(parsed.errors).toEqual([]);
  expect(JSON.parse(parsed.data).name).toBe('Memex');
  const installability=await cdp.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors).toEqual([]);
  // Installing is public metadata only: it must not grant access to the vault.
  expect((await page.request.get('/api/stats')).status()).toBe(401);
});
