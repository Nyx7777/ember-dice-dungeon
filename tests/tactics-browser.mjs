import assert from 'node:assert/strict';
import {newRun,dispatch,serialize,deserialize,RULES} from '../dist/engine.js';
import {battle,use} from './helpers.mjs';

export async function checkTactics(page,results){
  const key='ember-dungeon-save-v1';
  const all=['retry','retry','calibrate','armor','armor','momentum'].map((kind,id)=>({id,kind}));
  const cards=(s,ids)=>{s.battle.hand=ids.map(id=>all[id]);s.battle.deck=all.filter(c=>!ids.includes(c.id));s.battle.discard=[];s.battle.tp=3;return s;};
  const read=()=>page.evaluate(key=>localStorage.getItem(key),key);
  const load=async(s)=>{
    deserialize(serialize(s));await page.evaluate(([key,raw])=>{localStorage.setItem(key,raw);localStorage.setItem('ember-dungeon-settings-v1','{"quick":true}');},[key,serialize(s)]);
    await page.reload();await page.locator('.battle-view').waitFor();
  };
  const click=async(action)=>{
    await page.waitForFunction(()=>!document.querySelector('#app').inert);
    const scope=await page.locator('#modal').isVisible()?page.locator('#modal'):page;
    await scope.locator(`[data-action="${action}"]:not(:disabled)`).first().click();await page.waitForFunction(()=>!document.querySelector('#app').inert);
  };
  const open=async(id)=>{await click('tactics');await click(`card:${id}`);};
  for(const [width,height]of [[360,640],[390,844]]){
    await page.setViewportSize({width,height});
    let s=cards(dispatch(newRun(17),{type:'enter',index:0}),[0,3,5]);await load(s);
    await open(0);assert.equal(await page.locator('#card-status').textContent(),'请先掷骰。');assert.equal(await page.locator('[data-action^="target:"]:disabled').count(),6);await click('close');
    await open(3);assert.ok(await page.locator('[data-action="confirm-card"]').isEnabled());await click('confirm-card');assert.equal(JSON.parse(await read()).block,4);assert.equal(JSON.parse(await read()).battle.rolls,0);
    await load(s);await open(5);await click('confirm-card');assert.equal(JSON.parse(await read()).battle.boost,3);assert.equal(JSON.parse(await read()).battle.rolls,0);

    s=cards(use(battle(),'cleave'),[0,2,3]);await load(s);await click('skill:guard');const original=await read();
    await open(2);assert.ok(await page.locator('[data-action="confirm-card"]').isEnabled());assert.equal(await page.locator('[data-action^="target:"]:disabled').count(),4);
    assert.ok((await page.locator('[data-action="target:3"]').getAttribute('class')).includes('held'));
    await page.screenshot({path:`test-results/tactics-after-first-${width}.png`});
    await click('close');assert.equal(await read(),original);assert.ok(await page.locator('[data-action="cast"]').isEnabled());
    await open(2);await click('face:fire');await click('confirm-card');const changed=JSON.parse(await read());
    assert.equal(changed.dice[3].override,'fire');assert.deepEqual(changed.dice.filter(d=>d.spent),s.dice.filter(d=>d.spent));assert.deepEqual(changed.battle.used,['cleave']);assert.equal(changed.battle.hp,s.battle.hp);
    assert.equal(await page.locator('[data-action="cast"]').count(),0);assert.ok(await page.locator('[data-action="roll"]').isEnabled());
    await open(3);assert.equal(await page.locator('#card-status').textContent(),'本回合已用过战术。');assert.ok(await page.locator('[data-action="confirm-card"]').isDisabled());await click('close');
    const saved=await read();await page.reload();assert.equal(await read(),saved);

    await load(s);await open(0);await click('confirm-card');assert.equal(JSON.parse(await read()).battle.rolls,s.battle.rolls);assert.ok(await page.locator('[data-action="roll"]').isEnabled());
    await load(s);await open(3);await click('confirm-card');await click('skill:guard');await click('cast');assert.equal(JSON.parse(await read()).hp,60);assert.equal(JSON.parse(await read()).battle.turn,2);
    s=cards(use(battle(),'guard'),[5,3]);await load(s);await open(5);await click('confirm-card');await click('skill:cleave');assert.match(await page.locator('.allocation-status').textContent(),/敌 −16/);await click('cast');assert.equal(JSON.parse(await read()).battle.hp,4);

    s=cards(battle(),[2]);s.battle.tp=0;await load(s);await open(2);assert.match(await page.locator('#card-status').textContent(),/战术点不足：需要 2 点，当前 0 点/);await click('close');
  }
  results.push('T27 at 360×640 and 390×844: armor/momentum before rolling; all four tactics between skills; spent dice disabled and first free die selected; cancel preserves drafts/RNG; changing dice discards stale preview; single-card cap, exact rejection reasons, remaining ordinary rerolls and refresh all verified.');
  // Last local version also receives an explicit timing-change notice and import confirmation.
  const legacy=cards(use(battle(),'cleave'),[0,2,3]);legacy.rules='0.3.0';const raw=serialize(legacy);
  await page.evaluate(([key,raw])=>localStorage.setItem(key,raw),[key,raw]);await page.reload();await page.locator('#modal [data-action="upgrade-save"]').waitFor();
  assert.equal(await read(),raw);assert.match(await page.locator('#modal').innerText(),/两招之间/);await click('close');assert.equal(await read(),raw);
  await page.reload();await click('upgrade-save');assert.deepEqual(JSON.parse(await read()),{...legacy,rules:RULES});
  await click('menu');await page.locator('#import-file').setInputFiles({name:'v030.json',mimeType:'application/json',buffer:Buffer.from(raw)});await page.locator('#confirm-import').waitFor();assert.match(await page.locator('#modal').innerText(),/两招之间/);await page.locator('#confirm-import').click();assert.deepEqual(JSON.parse(await read()),{...legacy,rules:RULES});
  results.push('T27 v0.3.0 startup and imported saves require confirmation of the new timing rules and preserve first-skill results.');
  await page.evaluate(()=>localStorage.setItem('ember-dungeon-settings-v1','{"quick":false}'));
}
