import {test,expect} from '@playwright/test';
import {fixturePassword} from '../fixtures.mjs';
async function signIn(page){
  await page.goto('/?q=memory');
  await page.getByLabel('Password',{exact:true}).fill(fixturePassword);
  await page.getByRole('button',{name:'Open your library'}).click();
  await expect(page.locator('.results-meta')).toContainText('17 matches');
  await page.evaluate(()=>document.fonts.ready);
}
for(const [name,width,height]of [['desktop',1440,1024],['mobile',390,844],['narrow',320,780],['tablet',768,1024],['reference-desktop',1112,963],['reference-mobile',332,963]]){
  test(`${name}: grouped highlights, expand, reader navigation and responsive layout`,async({page})=>{
    await page.setViewportSize({width,height});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await signIn(page);
    await expect(page.locator('.result-row')).toHaveCount(4);
    await expect(page.locator('.result-row').first().locator('mark')).toHaveCount(3);
    const first=page.locator('.result-row').first();
    await first.getByRole('button',{name:/Show all .* passages/}).click();
    await expect(first.locator('.passage')).toHaveCount(5);
    await first.getByRole('button',{name:'Show fewer passages'}).click();
    await expect(first.locator('.passage')).toHaveCount(2);
    await page.screenshot({path:`qa/implementation-${name}-search.png`,fullPage:false});
    await first.locator('.passage').first().click();
    await expect(page.locator('.note-title')).toContainText('How memory becomes knowledge');
    await expect(page.locator('.markdown mark[data-search-match]').first()).toBeAttached();
    await page.getByRole('button',{name:'Next match',exact:true}).click();
    await expect(page.locator('.markdown .active-match')).toHaveCount(1);
    await expect(page.locator('.connections').first()).toContainText('Linked from');
    await page.screenshot({path:`qa/implementation-${name}-reader.png`,fullPage:false});
    await page.locator('.markdown').getByRole('link',{name:'A practical reading workflow',exact:true}).click();
    await expect(page.locator('.note-title')).toContainText('A practical reading workflow');
    await page.getByRole('button',{name:'Back to results'}).click();
    await expect(page.getByRole('searchbox',{name:'Search notes'})).toHaveValue('memory');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    expect(overflow).toBe(false);expect(errors).toEqual([]);
  });
}
test('filters, literal queries, empty state and browse work',async({page})=>{
  await page.setViewportSize({width:1440,height:1024});await signIn(page);
  await page.getByRole('group',{name:'Filter by area'}).getByRole('button',{name:'Engineering',exact:true}).click();
  await expect(page.locator('.result-row')).toHaveCount(1);
  await page.getByRole('group',{name:'Filter by area'}).getByRole('button',{name:'All areas'}).click();
  await page.getByRole('searchbox',{name:'Search notes'}).fill('memory (.+)');
  await expect(page.getByRole('heading',{name:'No threads found yet.'})).toBeVisible();
  await page.getByRole('button',{name:'Browse all notes'}).click();
  await expect(page.locator('.result-row')).toHaveCount(4);
  await page.locator('.sidebar').getByRole('button',{name:'Browse',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A place for every idea.'})).toBeVisible();
  await page.getByLabel('Sort notes').selectOption('title');
  await expect(page.locator('.result-title').first()).toContainText('A practical reading workflow');
});
test('mobile drawer, keyboard focus, account and sign out',async({page})=>{
  await page.setViewportSize({width:390,height:844});await signIn(page);
  await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('dialog',{name:'Navigation'})).toBeVisible();
  await page.locator('.drawer').getByRole('button',{name:'Account'}).click();
  await expect(page.getByRole('dialog',{name:'Your account'})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
});
test('rendering treats raw HTML and script-like search text as text',async({page})=>{
  await signIn(page);await page.locator('.result-title').first().click();
  await expect(page.locator('.note-title')).toBeVisible();
  await expect(page.locator('.markdown img')).toHaveCount(0);
  expect(await page.evaluate(()=>globalThis.__reader_unsafe)).toBeUndefined();
  await page.getByRole('button',{name:'Back to results'}).click();
  await page.getByRole('searchbox',{name:'Search notes'}).fill('<img src=x onerror=alert(1)>');
  await expect(page.getByRole('heading',{name:'No threads found yet.'})).toBeVisible();
  await expect(page.locator('.results img')).toHaveCount(0);
});
