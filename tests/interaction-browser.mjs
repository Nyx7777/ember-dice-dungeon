import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RULES,newRun,dispatch,serialize,deserialize} from '../dist/engine.js';
import {battle} from './helpers.mjs';

export async function checkInteraction(page,results){
  const key='ember-dungeon-save-v1',pref='ember-dungeon-settings-v1';
  const read=()=>page.evaluate(key=>localStorage.getItem(key),key);
  const idle=()=>page.waitForFunction(()=>!document.querySelector('#app').inert);
  const load=async(s,legacy=false)=>{
    if(!legacy)deserialize(serialize(s));
    await page.evaluate(([key,pref,raw])=>{localStorage.setItem(key,raw);localStorage.setItem(pref,JSON.stringify({quick:true}));},[key,pref,serialize(s)]);
    await page.reload();await page.locator(legacy?'#modal[open]':'.battle-view').waitFor();
  };
  const click=async(action)=>{await idle();const scope=await page.locator('#modal').isVisible()?page.locator('#modal'):page;await scope.locator(`[data-action="${action}"]:not(:disabled)`).first().click();await idle();};
  const bounds=async(sel)=>{const b=await page.locator(sel).boundingBox();assert.ok(b,sel);return {x:b.x+b.width/2,y:b.y+b.height/2};};
  const cdp=await page.context().newCDPSession(page);
  const touchDrag=async(die,skill,cancel=false)=>{
    const from=await bounds(`[data-action="die:${die}"]`),to=await bounds(`[data-skill="${skill}"]`);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
    for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*step/8,y:from.y+(to.y-from.y)*step/8,id:1}]});
    assert.equal(await page.locator('.drag-ghost').count(),1);
    await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
    await page.waitForTimeout(370);
    assert.equal(await page.locator('.drag-ghost').count(),0);
  };
  let s=dispatch(battle(),{type:'back'});
  for(const [width,height]of [[360,640],[390,844]]){
    await page.setViewportSize({width,height});await load(s);const original=await read();
    const layout=await page.evaluate(()=>{
      const board=document.querySelector('.battle-board').getBoundingClientRect();
      return {scroll:document.documentElement.scrollHeight,height:innerHeight,cards:[...document.querySelectorAll('.skill-card')].map(c=>{const r=c.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}),board:{top:board.top,bottom:board.bottom}};
    });
    assert.ok(layout.scroll<=height+1,JSON.stringify(layout));
    assert.ok(layout.cards.every(c=>c.top>=layout.board.top&&c.bottom<=layout.board.bottom+1),`all six skills visible at ${width}: ${JSON.stringify(layout)}`);
    await page.screenshot({path:`test-results/ui-v03-${width}.png`});
    await touchDrag(3,'slash');assert.equal(await page.locator('[data-action="cast"]').count(),0);assert.equal(await read(),original);
    await touchDrag(0,'slash',true);assert.equal(await page.locator('[data-action="cast"]').count(),0);assert.equal(await read(),original);
    await touchDrag(0,'slash');assert.equal(await page.locator('.socket.occupied').count(),1);assert.ok(await page.locator('[data-action="cast"]').isDisabled());assert.equal(await read(),original);
    await click('die:1');assert.equal(await page.locator('.socket.occupied').count(),2);assert.ok(await page.locator('[data-action="cast"]').isEnabled());assert.equal(await read(),original);
    await page.screenshot({path:`test-results/ui-v03-lit-${width}.png`});
    await click('die:1');assert.ok(await page.locator('[data-action="cast"]').isDisabled());await click('clear-draft');assert.equal(await read(),original);
    // Mouse/pointer drag uses the same allocation path, including release outside a target.
    const from=await bounds('[data-action="die:0"]'),to=await bounds('[data-skill="slash"]');
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();await page.waitForTimeout(370);
    assert.equal(await page.locator('.socket.occupied').count(),1);await click('clear-draft');assert.equal(await read(),original);
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(3,85,{steps:8});await page.mouse.up();await page.waitForTimeout(370);
    assert.equal(await page.locator('[data-action="cast"]').count(),0);assert.equal(await read(),original);
  }
  results.push('UI v0.3: all six skills visible at 360×640 and 390×844; real touch and mouse dragging, invalid drop, cancellation, take-back and outside drop never change authority/RNG; confirmation only lights for exact payment.');
  await load(s);await click('die:0');await click('skill:guard');assert.equal(await page.locator('[data-action="cast"]').count(),0);
  await click('skill:cleave');for(const id of [1,2,5])await click(`die:${id}`);
  const before=JSON.parse(await read());await click('cast');const first=JSON.parse(await read());
  assert.equal(first.seq,before.seq+1);assert.equal(first.rng,before.rng);assert.deepEqual(first.dice.filter(d=>d.spent).map(d=>d.id),[0,1,2,5]);
  assert.equal(first.battle.hp,7);assert.equal(await page.locator('.hold-btn:disabled').count(),4);assert.ok(await page.locator('[data-action="roll"]').isEnabled());
  await click('tactics');await click(`card:${first.battle.hand[0].id}`);assert.ok(await page.locator('[data-action="confirm-card"]').isEnabled());await click('close');
  await click('skill:guard');const saved=await read();await page.reload();assert.equal(await read(),saved);assert.equal(await page.locator('[data-action="cast"]').count(),0);
  await click('skill:guard');await click('cast');assert.equal(JSON.parse(await read()).battle.turn,2);
  results.push('Point selection commits exact independent dice once; first skill preserves spent dice while allowing remaining rerolls/holds/tactics; refreshing a second-skill draft preserves the first result; second cast advances the enemy turn.');

  s=dispatch(battle(),{type:'back'});s.battle.hand=[{id:3,kind:'armor'},{id:4,kind:'armor'},{id:2,kind:'calibrate'}];s.battle.deck=[{id:0,kind:'retry'},{id:1,kind:'retry'},{id:5,kind:'momentum'}];s.battle.discard=[];
  await load(s);await click('tactics');await click('card:3');await click('confirm-card');assert.equal(JSON.parse(await read()).battle.cardsUsed,1);
  await click('tactics');await click('card:4');assert.ok(await page.locator('[data-action="confirm-card"]').isDisabled());await click('close');await click('end');await click('roll');await click('tactics');await click('card:4');assert.ok(await page.locator('[data-action="confirm-card"]').isEnabled());await click('close');
  results.push('Tactics UI permits one card per turn, blocks the second, then restores availability next turn.');

  s=newRun(20);s.floor=6;s=dispatch(s,{type:'enter',index:0});s.battle.hp=35;s=dispatch(s,{type:'end'});s=dispatch(s,{type:'roll'});s=dispatch(s,{type:'roll'});
  await load(s);assert.match(await page.locator('.allocation-status').innerText(),/本次代价：失去 2 生命/);await click('roll');assert.equal(JSON.parse(await read()).hp,s.hp-2);
  results.push('Second normal reroll and exact enhanced-Boss life cost are visible before payment.');

  const legacy=battle();legacy.rules='0.2.0';legacy.battle.cardsUsed=2;const legacyRaw=serialize(legacy);
  await load(legacy,true);assert.equal(await read(),legacyRaw);
  const download=page.waitForEvent('download');await click('export');assert.equal(await readFile(await (await download).path(),'utf8'),legacyRaw);
  await click('close');assert.equal(await read(),legacyRaw);await page.reload();await click('upgrade-save');
  assert.deepEqual(JSON.parse(await read()),{...legacy,rules:RULES});await page.reload();assert.equal(await page.locator('#modal[open]').count(),0);
  await click('tactics');await click(`card:${legacy.battle.hand[0].id}`);assert.ok(await page.locator('[data-action="confirm-card"]').isDisabled());await click('close');await click('end');assert.equal(JSON.parse(await read()).battle.cardsUsed,0);
  const migrated=await read();await click('menu');
  await page.locator('#import-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(legacyRaw)});await page.locator('#confirm-import').waitFor();assert.match(await page.locator('#modal').innerText(),/战术每回合一次/);await click('close');assert.equal(await read(),migrated);
  await click('menu');await page.locator('#import-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(legacyRaw)});await page.locator('#confirm-import').click();assert.deepEqual(JSON.parse(await read()),{...legacy,rules:RULES});
  await click('menu');const bad=serialize({...legacy,rng:-1});await page.locator('#import-file').setInputFiles({name:'bad-legacy.json',mimeType:'application/json',buffer:Buffer.from(bad)});
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('无效'));assert.deepEqual(JSON.parse(await read()),{...legacy,rules:RULES});await click('close');
  results.push('Legacy v0.2 saves: startup and file import require visible confirmation; export preserves original bytes; cancel leaves old save intact; accepted migration retains RNG, results and two already-used tactics; invalid legacy data cannot overwrite.');
  await cdp.detach();await page.evaluate(pref=>localStorage.setItem(pref,JSON.stringify({quick:false})),pref);
}
