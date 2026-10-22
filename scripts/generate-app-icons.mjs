import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {BookOpenIcon} from '@phosphor-icons/react';
import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';

// Reuse the application's Phosphor book mark. No generated artwork or external
// service is needed. A solid square background and centered padding support
// Android's adaptive masks without clipping the book.
await fs.mkdir('public/icons',{recursive:true});
const browser=await chromium.launch();
try{
  for(const [name,size,ratio] of [
    ['memex-180.png',180,.65],
    ['memex-192.png',192,.65],
    ['memex-512.png',512,.65],
    ['memex-maskable-512.png',512,.56],
  ]){
    const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
    const icon=renderToStaticMarkup(React.createElement(BookOpenIcon,{size:Math.round(size*ratio),weight:'duotone',color:'#31594a'}));
    await page.setContent('<html><body style="margin:0;width:100vw;height:100vh;background:#f7f5ef;display:flex;align-items:center;justify-content:center">'+icon+'</body></html>');
    await page.screenshot({path:'public/icons/'+name,omitBackground:false});
    await page.close();
  }
}finally{await browser.close();}
console.log('Generated four install icons from the existing Phosphor book mark.');
