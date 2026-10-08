import assert from 'node:assert/strict';
import {newRun,dispatch,serialize,deserialize,RULES} from '../dist/engine.js';
import {battle,use} from './helpers.mjs';

export async function checkRerolls(page,results){
  const key='ember-dungeon-save-v1',read=()=>page.evaluate(key=>localStorage.getItem(key),key);
  const idle=()=>page.waitForFunction(()=>!document.querySelector('#app').inert);
  const load=async(s,quick=false)=>{deserialize(serialize(s));await page.evaluate(([key,raw,quick])=>{localStorage.setItem(key,raw);localStorage.setItem('ember-dungeon-settings-v1',JSON.stringify({quick}));},[key,serialize(s),quick]);await page.reload();await page.locator('.battle-view').waitFor();};
  const click=async(action,wait=true)=>{await idle();const scope=await page.locator('#modal').isVisible()?page.locator('#modal'):page;await scope.locator(`[data-action="${action}"]:not(:disabled)`).first().click();if(wait)await idle();};
  for(const [width,height]of [[360,640],[390,844]]){
    await page.setViewportSize({width,height});let s=battle();s.upgrades.slash=0;s=use(s,'cleave');await load(s);
    assert.equal(await page.locator('.hold-btn:disabled').count(),4);assert.match(await page.locator('[data-action="roll"]').textContent(),/剩 2 次/);
    await click('hold:3');const before=JSON.parse(await read());assert.equal(before.rng,s.rng);
    await page.screenshot({path:`test-results/reroll-after-first-${width}.png`});
    await click('roll',false);await page.locator('.dice-cube').waitFor();
    assert.equal(await page.locator('.dice-cube').count(),1);assert.equal(await page.locator('[data-action="die:4"] .dice-cube').count(),1);assert.equal(await page.locator('.die.spent .dice-cube').count(),0);
    const expected=serialize(dispatch(before,{type:'roll'}));assert.equal(await read(),expected);
    await page.reload();await page.locator('.battle-view').waitFor();assert.equal(await read(),expected);assert.match(await page.locator('[data-action="roll"]').textContent(),/剩 1 次/);
    await click('hold:4');assert.ok(await page.locator('[data-action="roll"]').isDisabled());await click('hold:4');await click('roll');
    const final=JSON.parse(await read());assert.equal(final.battle.rolls,3);assert.deepEqual(final.battle.used,['cleave']);assert.equal(final.battle.hp,s.battle.hp);
    assert.deepEqual(final.dice.filter(d=>d.spent),s.dice.filter(d=>d.spent));assert.ok(await page.locator('[data-action="roll"]').isDisabled());
    await click('skill:slash');await click('cast');assert.equal(JSON.parse(await read()).battle.turn,2);assert.equal(JSON.parse(await read()).stats.double,1);
  }
  results.push('T28 at 360×640 and 390×844: after first cast only unspent dice can be held/rerolled; held and spent dice do not animate; reload during one-die flight preserves exact result/RNG; all-held disables rolling; shared two-reroll cap and second skill verified.');
  let boss=newRun(13);boss.floor=6;boss=dispatch(boss,{type:'enter',index:0});boss.battle.hp=35;boss=dispatch(boss,{type:'end'});boss=dispatch(boss,{type:'roll'});boss=dispatch(boss,{type:'roll'});boss.dice[0].override=boss.dice[1].override='sword';boss=use(boss,'slash');
  await load(boss,true);assert.match(await page.locator('.allocation-status').textContent(),/本次代价：失去 2 生命/);await click('roll');assert.equal(JSON.parse(await read()).hp,boss.hp-2);
  boss.hp=2;await load(boss,true);await click('roll',false);const dead=await read();assert.equal(JSON.parse(dead).screen,'lost');await page.reload();await page.locator('.result').waitFor();assert.equal(await read(),dead);
  results.push('T28 Boss tax remains visible after first cast; second ordinary reroll charges 2 life and lethal reload cannot duplicate the payment.');
  const old=use(battle(),'cleave');old.rules='0.3.1';old.battle.rolls=2;const raw=serialize(old);
  await page.evaluate(([key,raw])=>localStorage.setItem(key,raw),[key,raw]);await page.reload();await page.locator('#modal [data-action="upgrade-save"]').waitFor();
  assert.equal(await read(),raw);assert.match(await page.locator('#modal').textContent(),/重掷未消耗骰子，次数不重置/);await click('close');assert.equal(await read(),raw);await page.reload();await click('upgrade-save');
  assert.deepEqual(JSON.parse(await read()),{...old,rules:RULES});assert.match(await page.locator('[data-action="roll"]').textContent(),/剩 1 次/);await click('roll');assert.equal(JSON.parse(await read()).battle.rolls,3);
  await click('menu');await page.locator('#import-file').setInputFiles({name:'v031.json',mimeType:'application/json',buffer:Buffer.from(raw)});await page.locator('#confirm-import').waitFor();assert.match(await page.locator('#modal').textContent(),/重掷未消耗骰子，次数不重置/);await page.locator('#confirm-import').click();assert.deepEqual(JSON.parse(await read()),{...old,rules:RULES});
  results.push('T28 v0.3.1 startup/import require timing-rule confirmation; first-skill results, spent dice and the one remaining reroll are preserved.');
  await page.evaluate(()=>localStorage.setItem('ember-dungeon-settings-v1','{"quick":false}'));
}
