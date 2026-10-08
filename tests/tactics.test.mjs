import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,dispatch,serialize,deserialize,preview,cardUnavailable,RULES} from '../dist/engine.js';
import {battle,use} from './helpers.mjs';
const reject=(s,a)=>{const raw=serialize(s);assert.throws(()=>dispatch(s,a));assert.equal(serialize(s),raw);};
const hand=(s,c)=>{s.battle.hand=[c];s.battle.deck=['retry','retry','calibrate','armor','armor','momentum'].map((kind,id)=>({id,kind})).filter(x=>x.id!==c.id);s.battle.discard=[];return s;};

test('T27 armor is usable before rolling and between skills, without changing RNG or rolling',()=>{
  let s=hand(dispatch(newRun(17),{type:'enter',index:0}),{id:3,kind:'armor'});const rng=s.rng;
  s=dispatch(s,{type:'card',id:3});assert.equal(s.block,4);assert.equal(s.rng,rng);assert.equal(s.battle.rolls,0);assert.equal(s.battle.tp,1);
  s=dispatch(s,{type:'roll'});assert.equal(s.block,4);
  s=hand(use(battle(),'cleave'),{id:3,kind:'armor'});s=dispatch(s,{type:'card',id:3});s=use(s,'guard');
  assert.equal(s.battle.turn,2);assert.equal(s.hp,60);assert.equal(s.block,0);assert.equal(s.battle.cardsUsed,0);
});
test('T27 momentum can precede rolling or follow a skill, applies once and expires at turn end',()=>{
  let s=hand(dispatch(newRun(17),{type:'enter',index:0}),{id:5,kind:'momentum'});
  s=dispatch(s,{type:'card',id:5});s=dispatch(s,{type:'roll'});assert.equal(s.battle.boost,3);
  s=dispatch(s,{type:'end'});assert.equal(s.battle.boost,0);
  s=hand(use(battle(),'guard'),{id:5,kind:'momentum'});s=dispatch(s,{type:'card',id:5});
  assert.equal(preview(s,'cleave').damage,16);s=use(s,'cleave');assert.equal(s.battle.hp,4);assert.equal(s.battle.boost,0);assert.equal(s.battle.turn,2);
});
test('T27 calibration between skills only changes an unspent die and preserves first-skill results',()=>{
  let s=hand(use(battle(),'cleave'),{id:2,kind:'calibrate'});const original=structuredClone(s);
  reject(s,{type:'card',id:2,die:0,face:'fire'});reject(s,{type:'card',id:2,die:3,face:'invalid'});
  s=dispatch(s,{type:'card',id:2,die:3,face:'fire'});assert.equal(s.dice[3].override,'fire');assert.equal(s.battle.tp,0);
  assert.equal(s.rng,original.rng);assert.deepEqual(s.battle.used,['cleave']);assert.equal(s.battle.hp,original.battle.hp);assert.equal(s.battle.rolls,original.battle.rolls);
  assert.deepEqual(s.dice.filter(d=>d.spent),original.dice.filter(d=>d.spent));assert.equal(dispatch(s,{type:'roll'}).battle.rolls,original.battle.rolls+1);reject(s,{type:'back'});
});
test('T27 retry between skills does not restore exhausted ordinary rerolls, ignores Boss tax and restores deterministically',()=>{
  let s=hand(use(battle(),'cleave'),{id:0,kind:'retry'});s.battle.enhanced=true;s.battle.rolls=3;s.dice[3].held=true;
  const before=structuredClone(s);reject(s,{type:'card',id:0,die:0});
  const restored=deserialize(serialize(s));s=dispatch(s,{type:'card',id:0,die:3});
  assert.deepEqual(s,dispatch(restored,{type:'card',id:0,die:3}));assert.notEqual(s.rng,before.rng);assert.equal(s.hp,before.hp);assert.equal(s.battle.rolls,3);assert.equal(s.battle.phase,'allocate');assert.equal(s.dice[3].held,false);
  for(const d of s.dice)if(d.id!==3)assert.deepEqual(d,before.dice[d.id]);
  assert.deepEqual(s.battle.intent,before.battle.intent);reject(s,{type:'roll'});
});
test('T27 per-card prerequisites and one-card cap produce specific reasons without consuming resources',()=>{
  let s=hand(dispatch(newRun(17),{type:'enter',index:0}),{id:0,kind:'retry'});
  assert.equal(cardUnavailable(s,0),'请先掷骰。');reject(s,{type:'card',id:0,die:0});
  s=hand(battle(),{id:3,kind:'armor'});s.battle.tp=0;assert.match(cardUnavailable(s,3),/战术点不足/);reject(s,{type:'card',id:3});
  s.battle.tp=3;s.battle.cardsUsed=1;assert.equal(cardUnavailable(s,3),'本回合已用过战术。');reject(s,{type:'card',id:3});
  s=hand(battle(),{id:0,kind:'retry'});s.dice.forEach(d=>d.spent=true);assert.match(cardUnavailable(s,0),/没有尚未消耗/);reject(s,{type:'card',id:0,die:0});
  s=hand(battle(),{id:5,kind:'momentum'});s.battle.used=['slash','guard'];assert.match(cardUnavailable(s,5),/机会已用完/);reject(s,{type:'card',id:5});
});
test('T27 all previous rule versions require opt-in migration and retain exact progress',()=>{
  for(const rules of ['0.2.0','0.3.0','0.3.1']){
    const old=use(battle(),'cleave');old.rules=rules;const raw=serialize(old);
    assert.throws(()=>deserialize(raw));assert.deepEqual(deserialize(raw,true),{...old,rules:RULES});assert.equal(serialize(old),raw);
  }
});
