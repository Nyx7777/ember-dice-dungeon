import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {newRun,dispatch,serialize,deserialize} from '../dist/engine.js';
import {nextAction} from './helpers.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
const dir='test-results';await mkdir(dir,{recursive:true});
const results=[],errors=[];
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
const key='ember-dungeon-save-v1';
const read=async()=>JSON.parse(await page.evaluate(key=>localStorage.getItem(key),key));
const click=async(action)=>{const scope=await page.locator('#modal').isVisible()?page.locator('#modal'):page;await scope.locator(`[data-action="${action}"]:not(:disabled)`).first().click();};
try{
  await page.goto('http://localhost:4173');await page.locator('[data-action="new"]').waitFor();
  await page.screenshot({path:`${dir}/home-390.png`,fullPage:true});
  await click('new');await click('enter:0');await click('roll');await click('die:0');
  const before=await read();await page.reload();await page.locator('.dice-tray').waitFor();assert.deepEqual(await read(),before);
  results.push('Save / refresh preserves rolled dice, lock state and RNG.');
  for(const [width,height] of [[390,844],[360,640],[1280,900]]){
    await page.setViewportSize({width,height});
    const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollHeight,inner:innerHeight,width:document.documentElement.scrollWidth,screen:innerWidth,dice:[...document.querySelectorAll('.die')].map(d=>{const r=d.getBoundingClientRect();return {width:r.width,height:r.height,bottom:r.bottom};}),buttons:[...document.querySelectorAll('.battle-controls button,.battle-secondary button')].map(d=>{const r=d.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};})}));
    assert.ok(geometry.scroll<=height+1,`${width}: vertical overflow ${JSON.stringify(geometry)}`);assert.ok(geometry.width<=width,`${width}: horizontal overflow`);
    assert.ok(geometry.dice.every(d=>d.width>=44&&d.height>=44));assert.ok(geometry.buttons.every(d=>d.bottom<=height+1&&d.height>=44),JSON.stringify({width,height,geometry}));
    const hpVisible=await page.evaluate(()=>{const hp=document.querySelector('.hp-text').getBoundingClientRect(),area=document.querySelector('.encounter').getBoundingClientRect();return hp.top>=area.top&&hp.bottom<=area.bottom+1;});assert.ok(hpVisible,`${width}: enemy HP text clipped`);
    await page.screenshot({path:`${dir}/battle-${width}.png`});results.push(`Viewport ${width}×${height}: no page scroll, all six dice and bottom actions >=44px and on screen.`);
  }
  await page.setViewportSize({width:390,height:844});
  await click('allocate');await click('skill:cleave');const preCancel=await read();await click('close');assert.deepEqual(await read(),preCancel);results.push('Skill preview cancellation has no state or RNG effects.');
  // Reset to a known genuine run, then execute every action through actual UI controls.
  await page.evaluate(([key,raw])=>localStorage.setItem(key,raw),[key,serialize(newRun(1))]);await page.reload();
  let count=0;
  while(count++<1500){
    const s=await read();if(['won','lost'].includes(s.screen))break;const a=nextAction(s);
    if(a.type==='enter'||a.type==='reward'||a.type==='buy')await click(`${a.type}:${a.index}`);
    else if(a.type==='hold')await click(`die:${a.die}`);
    else if(a.type==='event')await click(`event:${a.choice}`);
    else if(a.type==='skill'){await click(`skill:${a.skill}`);await click('confirm-skill');}
    else if(a.type==='card'){await click(`card:${a.id}`);await click('confirm-card');}
    else await click(a.type);
    const after=await read();assert.equal(after.seq,s.seq+1,`UI action did not commit ${JSON.stringify(a)}`);
    deserialize(JSON.stringify(after));
  }
  assert.equal((await read()).screen,'won');await page.screenshot({path:`${dir}/victory-390.png`,fullPage:true});results.push(`Full seven-floor run completed through UI in ${count-1} actions; every intermediate save validated.`);
  // Invalid import never replaces the completed game.
  const final=await read();await click('menu');await page.locator('#import-file').setInputFiles({name:'bad-save.json',mimeType:'application/json',buffer:Buffer.from('{"version":999}')});
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('不兼容'));assert.deepEqual(await read(),final);await click('close');
  results.push('Invalid file import preserves existing save.');
  // Confirm exported bytes round-trip, then test an actual valid import confirmation.
  const downloadEvent=page.waitForEvent('download');await click('export');const download=await downloadEvent;
  assert.deepEqual(deserialize(await readFile(await download.path(),'utf8')),final);results.push('Downloaded save bytes round-trip to the exact completed run.');
  await click('menu');await page.locator('#import-file').setInputFiles({name:'good-save.json',mimeType:'application/json',buffer:Buffer.from(serialize(newRun(8)))});await page.locator('#confirm-import').click();assert.equal((await read()).runId,'ember-8');
  results.push('Valid import replaces state only after confirmation.');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload();await page.locator('[data-action="enter:0"]:not(:disabled)').waitFor();await click('enter:0');await click('roll');assert.equal((await read()).battle.rolls,1);await context.setOffline(false);
  results.push('PWA cached offline reload and battle action succeeded on localhost.');
  // A legitimate passive defeat is also displayed without bypassing health rules.
  let dead=dispatch(newRun(9),{type:'enter',index:0});while(dead.screen==='battle')dead=dispatch(dead,{type:'end'});
  await page.evaluate(([key,raw])=>localStorage.setItem(key,raw),[key,serialize(dead)]);await page.reload();assert.equal(await page.locator('.result h1').textContent(),'余烬，仍未散尽。');
  await click('restart');await click('confirm-new');assert.equal((await read()).floor,0);assert.equal((await read()).hp,60);results.push('Defeat screen and confirmed restart reset progress.');
  assert.deepEqual(errors,[]);results.push('No browser JavaScript errors.');
  const report={browser:await browser.version(),platform:process.platform,results,errors};await writeFile(`${dir}/browser-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(e){await page.screenshot({path:`${dir}/browser-failure.png`,fullPage:true});await writeFile(`${dir}/browser-failure.txt`,String(e.stack));throw e;}finally{await browser.close();}
