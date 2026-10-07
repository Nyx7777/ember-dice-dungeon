import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {newRun,serialize} from '../dist/engine.js';

// Serve both worker versions from the same origin and Pages-style subdirectory.
export async function checkCacheUpdate(browser,results){
  const current=await readFile('dist/sw.js','utf8');
  let worker=current.replace('ember-demo-0.2.0-fx1','ember-demo-0.2.0').replace("'./effects.js',",'');
  const prefix='/ember-dice-dungeon/', base=path.resolve('dist');
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
      const name=url.pathname.slice(prefix.length)||'index.html',file=path.resolve(base,name);
      if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return;}
      const body=name==='sw.js'?worker:await readFile(file);
      const type={'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store'}).end(body);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}${prefix}`);
    await expect.poll(()=>page.evaluate(async()=>!!navigator.serviceWorker.controller&&await caches.has('ember-demo-0.2.0')),{timeout:15000}).toBe(true);
    const raw=serialize(newRun(37));
    await page.evaluate(raw=>localStorage.setItem('ember-dungeon-save-v1',raw),raw);
    worker=current;
    await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
    await expect.poll(()=>page.evaluate(async()=>{
      const registration=await navigator.serviceWorker.getRegistration();
      const ready=await caches.has('ember-demo-0.2.0-fx1'), old=await caches.has('ember-demo-0.2.0');
      if(!ready||old||registration?.installing||registration?.waiting)return false;
      return (await (await caches.open('ember-demo-0.2.0-fx1')).keys()).length===9;
    }),{timeout:15000}).toBe(true);
    const cached=await page.evaluate(async()=>({url:location.href,assets:(await (await caches.open('ember-demo-0.2.0-fx1')).keys()).map(r=>r.url)}));
    assert.ok(cached.assets.includes(new URL('effects.js',cached.url).href),JSON.stringify(cached));
    await context.setOffline(true);await page.reload();await page.locator('[data-action="enter:0"]:not(:disabled)').waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('ember-dungeon-save-v1')),raw);
    await page.locator('[data-action="enter:0"]:not(:disabled)').click();await page.locator('[data-action="roll"]').click();
    await page.waitForFunction(()=>!document.querySelector('#app').inert);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ember-dungeon-save-v1')).battle.rolls),1);
    assert.deepEqual(errors,[]);
    results.push('Service Worker upgrade: old 0.2.0 cache replaced by fx1; effects.js cached; existing save retained; offline roll works under /ember-dice-dungeon/.');
  }finally{await context.close();await new Promise(resolve=>server.close(resolve));}
}
