import assert from 'node:assert/strict';
import {newRun,dispatch,serialize,deserialize,symbol} from '../dist/engine.js';
import {battle} from './helpers.mjs';

export async function checkEffects(page,results){
  const key='ember-dungeon-save-v1',pref='ember-dungeon-settings-v1';
  const idle=()=>page.waitForFunction(()=>!document.querySelector('#app').inert);
  const read=()=>page.evaluate(key=>localStorage.getItem(key),key);
  const load=async(s,quick=false)=>{
    deserialize(serialize(s));
    await page.evaluate(([key,pref,raw,quick])=>{localStorage.setItem(key,raw);localStorage.setItem(pref,JSON.stringify({quick}));},[key,pref,serialize(s),quick]);
    await page.reload();await page.locator('.dice-tray').waitFor();
  };
  const click=async(action)=>{await idle();const scope=await page.locator('#modal').isVisible()?page.locator('#modal'):page;await scope.locator(`[data-action="${action}"]:not(:disabled)`).first().click();};
  let s=dispatch(newRun(42),{type:'enter',index:0});
  for(const [width,height] of [[360,640],[390,844]]){
    await page.setViewportSize({width,height});await load(s);await click('roll');
    await page.locator('.dice-cube').first().waitFor();assert.equal(await page.locator('.dice-cube').count(),6);
    const committed=await read();assert.equal(committed,serialize(dispatch(s,{type:'roll'})));
    // Inspect actual six-face geometry midflight and prevent duplicate commits during playback.
    const faces=await page.locator('.cube-face').count();assert.equal(faces,36);
    await page.evaluate(()=>document.querySelector('[data-action="roll"]').click());assert.equal(await read(),committed);
    await page.screenshot({path:`test-results/dice-flight-${width}.png`});
    assert.ok(await page.evaluate(()=>{
      for(const animation of document.getAnimations())if(animation.effect.target?.classList.contains('dice-cube')){
        animation.pause();animation.currentTime=animation.effect.getComputedTiming().endTime;
      }
      return [...document.querySelectorAll('.dice-cube')].every(cube=>{
        const face=cube.children[Number(cube.dataset.faceIndex)];
        const normal=new DOMMatrix(getComputedStyle(cube).transform).multiply(new DOMMatrix(getComputedStyle(face).transform));
        return Math.abs(normal.m33-1)<.001&&Math.abs(normal.m31)<.001&&Math.abs(normal.m32)<.001;
      });
    }),'saved face must face the viewer at the final 3D orientation');
    await idle();assert.equal(await page.locator('.dice-cube').count(),0);assert.equal(await read(),committed);
    const settled=JSON.parse(committed);
    for(const d of settled.dice)assert.ok((await page.locator(`[data-action="die:${d.id}"] > .symbol`).getAttribute('class')).includes(symbol(d)));
    await click('hold:0');await click('roll');await page.locator('.dice-cube').first().waitFor();
    assert.equal(await page.locator('[data-action="die:0"] .dice-cube').count(),0);assert.equal(await page.locator('.dice-cube').count(),5);
    const savedDuringFlight=await read();await page.reload();await page.locator('.dice-tray').waitFor();assert.equal(await read(),savedDuringFlight);
    assert.equal(await page.locator('.dice-cube').count(),0);
  }
  results.push('3D dice: 360×640 and 390×844; six cubes / 36 faces, held die stays still, final symbols match authority, rapid repeat ignored, refresh during flight preserves RNG.');

  s=dispatch(s,{type:'roll'});s.dice[0].held=true;s.dice[0].modified=true;s.dice[0].faces[0]='fire';
  await load(s);const retry=s.battle.hand.find(c=>c.kind==='retry');assert.ok(retry);
  await click('tactics');await click(`card:${retry.id}`);await click('confirm-card');await page.locator('.dice-cube').waitFor();
  assert.equal(await page.locator('.dice-cube').count(),1);assert.equal(await page.locator('.cube-face.fire').count(),s.dice[0].faces.filter(f=>f==='fire').length);
  await idle();results.push('Targeted card retry animates only its target and uses the modified six-face distribution.');

  s=battle();s.battle.block=8;await load(s);await click('skill:cleave');await click('cast');
  await page.locator('.hit-number.enemy').waitFor();assert.equal(await page.locator('.hit-number.enemy').textContent(),'−5 · 格挡 8');
  await page.waitForTimeout(130);
  await page.screenshot({path:'test-results/enemy-hit-390.png'});await idle();
  s=battle();s.block=8;s.battle.intent.attacks=[6,6];await load(s);await click('end');
  await page.waitForFunction(()=>document.querySelector('.hit-number.player')?.textContent==='格挡 6');
  await page.waitForFunction(()=>document.querySelector('.hit-number.player')?.textContent==='−4 · 格挡 2');
  await page.waitForTimeout(130);
  await page.screenshot({path:'test-results/player-hit-390.png'});await idle();assert.equal(JSON.parse(await read()).hp,56);
  s=battle();s.battle.hp=2;await load(s);await click('skill:cleave');await click('cast');
  await page.locator('.hit-number.enemy').waitFor();assert.equal(JSON.parse(await read()).screen,'reward');assert.equal(await page.locator('.battle-view').count(),1);
  await idle();assert.equal(await page.locator('.reward-card').count(),3);
  s=battle();s.hp=2;await load(s);await click('end');await page.locator('.hit-number.player').waitFor();
  const dead=await read();assert.equal(JSON.parse(dead).screen,'lost');await page.reload();await page.locator('.result').waitFor();assert.equal(await read(),dead);
  results.push('Damage feedback: enemy HP / block, player sequential multihits, finishing-blow presentation before reward, and reload during lethal hit without repeated damage.');

  for(const mode of ['quick','reduce']){
    await page.emulateMedia({reducedMotion:mode==='reduce'?'reduce':'no-preference'});
    s=dispatch(newRun(21),{type:'enter',index:0});await load(s,mode==='quick');await click('roll');await idle();
    assert.equal(await page.locator('.dice-cube').count(),0);assert.equal(await read(),serialize(dispatch(s,{type:'roll'})));
    await click('end');await page.locator('.hit-number.player').waitFor();
    assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length),0);await idle();
  }
  await page.emulateMedia({reducedMotion:'no-preference'});
  results.push('Quick mode and OS reduced motion suppress rotation, shake and flashes while retaining a static damage result.');
  // Restore normal settings for the rest of the existing integration suite.
  await page.evaluate(pref=>localStorage.setItem(pref,JSON.stringify({quick:false})),pref);
}
