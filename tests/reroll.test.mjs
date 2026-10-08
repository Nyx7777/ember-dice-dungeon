import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,dispatch,serialize,deserialize,preview} from '../dist/engine.js';
import {effectsFor} from '../dist/effects.js';
import {battle,use} from './helpers.mjs';
const reject=(s,a)=>{const raw=serialize(s);assert.throws(()=>dispatch(s,a));assert.equal(serialize(s),raw);};

test('T28 between-skill reroll only advances RNG for unspent unlocked dice and animates the same IDs',()=>{
  let s=use(battle(),'cleave');s=dispatch(s,{type:'hold',die:3});const before=serialize(s);
  reject(s,{type:'hold',die:0});const after=dispatch(s,{type:'roll'});
  assert.equal(serialize(s),before);assert.equal(after.rng,(s.rng+0x6D2B79F5)>>>0);assert.equal(after.battle.rolls,2);
  for(const d of after.dice)if(d.id!==4)assert.deepEqual(d,s.dice[d.id]);
  assert.deepEqual(after.battle.used,['cleave']);assert.equal(after.battle.hp,s.battle.hp);assert.equal(after.block,s.block);assert.equal(after.battle.turn,s.battle.turn);assert.equal(after.battle.phase,'allocate');
  assert.deepEqual(effectsFor(s,after,{type:'roll'}).dice,[4]);assert.deepEqual(deserialize(serialize(after)),after);
});
test('T28 ordinary rerolls share one turn budget across the first skill',()=>{
  let s=battle();s=dispatch(s,{type:'roll'});s.dice.forEach((d,i)=>d.override=['sword','sword','sword','shield','shield','fire'][i]);
  s=use(s,'cleave');assert.equal(s.battle.rolls,2);s=dispatch(s,{type:'roll'});assert.equal(s.battle.rolls,3);reject(s,{type:'roll'});
});
test('T28 all remaining dice held rejects without consuming RNG or reroll count',()=>{
  let s=use(battle(),'cleave');for(const die of [3,4])s=dispatch(s,{type:'hold',die});
  reject(s,{type:'roll'});assert.equal(s.battle.rolls,1);
  s=dispatch(s,{type:'hold',die:4});assert.equal(dispatch(s,{type:'roll'}).battle.rolls,2);
});
test('T28 rerolls preserve independent payment and two distinct skills still end the turn',()=>{
  let s=battle();s.upgrades.slash=0;s=use(s,'cleave');s=dispatch(s,{type:'roll'});s=dispatch(s,{type:'roll'});
  reject(s,{type:'skill',skill:'cleave',dice:[0,1,2,5]});reject(s,{type:'skill',skill:'slash',dice:[0,3]});
  s=use(s,'slash');assert.equal(s.battle.turn,2);assert.equal(s.battle.rolls,0);assert.equal(s.stats.double,1);assert.equal(s.stats.skills.cleave,1);assert.equal(s.stats.skills.slash,1);assert.ok(s.dice.every(d=>!d.spent));
});
test('T28 enhanced Boss second reroll after a skill charges life and lethal cost commits once',()=>{
  let s=newRun(13);s.floor=6;s=dispatch(s,{type:'enter',index:0});s.battle.hp=35;s=dispatch(s,{type:'end'});s=dispatch(s,{type:'roll'});s=dispatch(s,{type:'roll'});
  s.dice[0].override=s.dice[1].override='sword';s=use(s,'slash');const alive=dispatch(s,{type:'roll'});
  assert.equal(alive.hp,s.hp-2);assert.equal(alive.battle.hp,s.battle.hp);assert.equal(alive.battle.turn,s.battle.turn);
  s.hp=2;const dead=dispatch(s,{type:'roll'});assert.equal(dead.screen,'lost');assert.equal(dead.hp,0);assert.match(dead.cause,/重掷/);assert.equal(dead.stats.turns,s.stats.turns+1);assert.deepEqual(deserialize(serialize(dead)),dead);reject(dead,{type:'roll'});
  assert.deepEqual(effectsFor(s,dead,{type:'roll'}).hits,[{target:'player',loss:2,blocked:0,delay:0}]);
});
test('T28 reroll relics count actual dice and never re-award first-attack bonuses',()=>{
  let s=battle();s.relics=['wheel','gamble'];s=use(s,'cleave');s=dispatch(s,{type:'roll'});s=dispatch(s,{type:'roll'});
  assert.equal(s.battle.wheel,false);assert.equal(s.battle.boost,0);assert.equal(preview(s,'slash').damage,4);
  s=battle();s.relics=['wheel','gamble'];s=use(s,'guard');s=dispatch(s,{type:'roll'});s=dispatch(s,{type:'roll'});
  assert.equal(s.battle.boost,3);assert.equal(preview(s,'cleave').damage,20);
});
