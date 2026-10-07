import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,dispatch,payment,serialize} from '../dist/engine.js';
import {effectsFor} from '../dist/effects.js';
import {battle,use} from './helpers.mjs';

const plan=(s,a)=>{
  const after=dispatch(s,a), beforeRaw=serialize(s), afterRaw=serialize(after);
  const effects=effectsFor(s,after,a);
  assert.equal(serialize(s),beforeRaw);assert.equal(serialize(after),afterRaw);
  return effects;
};
test('FX roll selects only thrown dice, including targeted retry, without mutating RNG',()=>{
  let s=dispatch(newRun(42),{type:'enter',index:0});
  assert.deepEqual(plan(s,{type:'roll'}).dice,[0,1,2,3,4,5]);
  s=dispatch(s,{type:'roll'});s=dispatch(s,{type:'hold',die:0});
  assert.deepEqual(plan(s,{type:'roll'}).dice,[1,2,3,4,5]);
  const c=s.battle.hand.find(c=>c.kind==='retry');assert.ok(c);
  assert.deepEqual(plan(s,{type:'card',id:c.id,die:0}).dice,[0]);
  assert.deepEqual(plan(s,{type:'allocate'}),{dice:[],hits:[]});
});
test('FX distinguishes absorbed damage, piercing, and capped lethal HP loss',()=>{
  const s=battle();s.battle.block=8;
  assert.deepEqual(plan(s,{type:'skill',skill:'cleave',dice:payment(s,'cleave')}).hits,[{target:'enemy',loss:5,blocked:8,delay:0}]);
  const fire=battle(['sword','fire','fire','shield','shield','sword']);fire.battle.block=8;
  assert.equal(plan(fire,{type:'skill',skill:'burn',dice:payment(fire,'burn')}).hits[0].blocked,0);
  s.battle.hp=2;s.battle.block=0;s.hp=40;s.relics=['ember'];
  assert.deepEqual(plan(s,{type:'skill',skill:'cleave',dice:payment(s,'cleave')}).hits,[{target:'enemy',loss:2,blocked:0,delay:0}]);
});
test('FX second skill uses newly gained block before presenting enemy damage',()=>{
  const s=use(battle(),'cleave');
  assert.deepEqual(plan(s,{type:'skill',skill:'guard',dice:payment(s,'guard')}).hits,[{target:'player',loss:3,blocked:5,delay:0}]);
  const shield=use(battle(['sword','sword','sword','shield','shield','fire']),'slash');
  const hits=plan(shield,{type:'skill',skill:'bash',dice:payment(shield,'bash')}).hits;
  assert.equal(hits[0].target,'enemy');assert.deepEqual(hits[1],{target:'player',loss:3,blocked:5,delay:260});
});
test('FX multihits consume block sequentially and stop immediately on death',()=>{
  const s=battle();s.battle.intent.attacks=[6,6];s.block=8;
  assert.deepEqual(plan(s,{type:'end'}).hits,[{target:'player',loss:0,blocked:6,delay:0},{target:'player',loss:4,blocked:2,delay:240}]);
  s.block=0;s.hp=2;
  assert.deepEqual(plan(s,{type:'end'}).hits,[{target:'player',loss:2,blocked:0,delay:0}]);
});
test('FX emergency block and lethal boss tax reflect committed outcomes',()=>{
  assert.deepEqual(plan(battle(),{type:'emergency'}).hits,[{target:'player',loss:5,blocked:3,delay:0}]);
  const s=battle();s.battle.phase='roll';s.battle.rolls=2;s.battle.enhanced=true;s.hp=1;s.block=20;
  assert.deepEqual(plan(s,{type:'roll'}).hits,[{target:'player',loss:1,blocked:0,delay:0}]);
});
