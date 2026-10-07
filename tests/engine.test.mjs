import test from 'node:test';
import assert from 'node:assert/strict';
import {newRun,dispatch,payment,preview,serialize,deserialize,rewardPool,rewardLegal,generateRewards,skillFor,price} from '../dist/engine.js';
import {SKILLS,RELICS,ENEMIES} from '../dist/data.js';
import {battle,use,simulate} from './helpers.mjs';
const reject=(s,a)=>{const before=serialize(s);assert.throws(()=>dispatch(s,a));assert.equal(serialize(s),before);};
test('V01/02 first roll, two rerolls, held dice and zero-dice rejection',()=>{
  let s=dispatch(newRun(1),{type:'enter',index:0});reject(s,{type:'hold',die:0});s=dispatch(s,{type:'roll'});
  s=dispatch(s,{type:'hold',die:0});const face=s.dice[0].faceIndex;
  s=dispatch(s,{type:'roll'});assert.equal(s.dice[0].faceIndex,face);s=dispatch(s,{type:'roll'});assert.equal(s.battle.rolls,3);reject(s,{type:'roll'});
  s.battle.rolls=1;s.dice.forEach(d=>d.held=true);reject(s,{type:'roll'});
});
test('V03 exact 4+2 payment and two skills automatically advance turn',()=>{
  let s=battle();s.battle.hp=70;assert.deepEqual(payment(s,'cleave'),[0,1,2,5]);s=use(s,'cleave');
  assert.equal(s.battle.hp,57);assert.deepEqual(s.dice.filter(d=>d.spent).map(d=>d.id),[0,1,2,5]);assert.deepEqual(payment(s,'guard'),[3,4]);
  s=use(s,'guard');assert.equal(s.hp,57);assert.equal(s.battle.turn,2);assert.equal(s.stats.double,1);assert.equal(s.block,0);
});
test('V04 reused dice, duplicated IDs, repeated name and stale third skill rejected',()=>{
  let s=battle(['sword','sword','sword','sword','shield','fire']);s.battle.hp=70;
  reject(s,{type:'skill',skill:'slash',dice:[0,0]});s=use(s,'slash');reject(s,{type:'skill',skill:'slash',dice:[2,3]});reject(s,{type:'skill',skill:'cleave',dice:[0,1,2,5]});
  s=battle();s.battle.hp=70;s=use(use(s,'cleave'),'guard');reject(s,{type:'skill',skill:'slash',dice:[0,1]});
});
test('V05 six shields, emergency and no-skill end remain possible',()=>{
  let s=battle(Array(6).fill('shield'));s=use(s,'guard');reject(s,{type:'skill',skill:'guard',dice:[2,3]});reject(s,{type:'emergency'});s=dispatch(s,{type:'end'});assert.equal(s.hp,57);
  s=dispatch(battle(),{type:'emergency'});assert.equal(s.hp,55);assert.equal(s.battle.turn,2);
});
test('V06 pure preview; return does not refund rolls; first skill locks dice and cards',()=>{
  let s=battle();const old=serialize(s);preview(s,'cleave');payment(s,'cleave');assert.equal(serialize(s),old);
  s=dispatch(s,{type:'back'});assert.equal(s.battle.rolls,1);s=dispatch(s,{type:'allocate'});s=use(s,'cleave');
  reject(s,{type:'back'});reject(s,{type:'roll'});reject(s,{type:'card',id:s.battle.hand[0].id});
});
test('V07 card targets are transactional; point costs and two-card cap',()=>{
  let s=battle();s.battle.hand=[{id:0,kind:'retry'},{id:2,kind:'calibrate'},{id:3,kind:'armor'}];s.battle.tp=3;
  reject(s,{type:'card',id:0});reject(s,{type:'card',id:2,die:0,face:'invalid'});
  s.dice[0].held=true;s=dispatch(s,{type:'card',id:0,die:0});assert.equal(s.dice[0].held,false);assert.equal(s.battle.rolls,1);assert.equal(s.battle.randomized,true);
  s=dispatch(s,{type:'card',id:2,die:0,face:'fire'});assert.equal(s.dice[0].override,'fire');assert.equal(s.battle.tp,0);s.battle.tp=3;reject(s,{type:'card',id:3});
});
test('V07 full hand preserves deck top, empty deck shuffles discard, empty both skips',()=>{
  let s=battle();s.battle.hand=[0,1,2,3].map(id=>({id,kind:'retry'}));s.battle.deck=[{id:4,kind:'armor'}];const top=structuredClone(s.battle.deck);
  s=dispatch(s,{type:'end'});assert.deepEqual(s.battle.deck,top);assert.equal(s.battle.hand.length,4);
  s.battle.hand=[];s.battle.deck=[];s.battle.discard=[{id:5,kind:'momentum'}];s=dispatch(s,{type:'end'});assert.equal(s.battle.hand[0].id,5);assert.equal(s.battle.discard.length,0);
  s.battle.hand=[];s=dispatch(s,{type:'end'});assert.equal(s.battle.hand.length,0);assert.equal(s.battle.tp,3);
});
test('V08 damage, penetration, first skill kill and immediate loss',()=>{
  let s=battle();s.battle.block=8;s=use(s,'cleave');assert.equal(s.battle.hp,15);assert.equal(s.battle.block,0);
  s=battle(['sword','fire','fire','shield','shield','sword']);s.battle.block=8;s=use(s,'burn');assert.equal(s.battle.hp,11);assert.equal(s.battle.block,8);
  s=battle();s.battle.hp=4;s=use(s,'slash');assert.equal(s.screen,'reward');assert.equal(s.hp,60);assert.equal(s.stats.wins,1);reject(s,{type:'end'});
  s=battle();s.hp=1;s=dispatch(s,{type:'end'});assert.equal(s.screen,'lost');assert.equal(s.hp,0);assert.equal(s.stats.turns,1);
});
test('V09 counter-ready only boosts following attacks, never carries to next turn',()=>{
  let s=battle();s.battle.hp=70;s.upgrades.guard=1;s=use(s,'guard');assert.equal(preview(s,'cleave').damage,15);s=use(s,'cleave');assert.equal(s.battle.hp,55);assert.equal(s.battle.boost,0);
  s=battle();s.battle.hp=70;s.upgrades.guard=1;s=use(use(s,'cleave'),'guard');assert.equal(s.battle.hp,57);assert.equal(s.battle.boost,0);
});
test('T14 all twelve upgrade branches affect the expected rule',()=>{
  const expected=[['slash',0,'cost',['any','any']],['slash',1,'damage',7],['guard',0,'block',8],['guard',1,'next',2],['bash',0,'block',8],['bash',1,'damage',8],['burn',0,'cost',['sword','sword','fire']],['burn',1,'damage',13],['cleave',0,'damage',17],['cleave',1,'pierce',true],['inferno',0,'cost',['fire','fire','fire','fire','sword']],['inferno',1,'damage',36]];
  for(const [id,branch,key,value]of expected){const s=battle();s.upgrades[id]=branch;assert.deepEqual(skillFor(s,id)[key],value);}
});
test('V10 legal rewards enforce one upgrade, one modification per die and three total',()=>{
  const s=newRun(2);s.upgrades.guard=0;s.relics=['steady'];s.dice[0].modified=true;s.dice[1].modified=true;s.dice[2].modified=true;
  const pool=rewardPool(s);assert.ok(!pool.some(r=>r.type==='modify'));assert.ok(!pool.some(r=>r.type==='upgrade'&&r.skill==='guard'));assert.ok(!pool.some(r=>r.type==='relic'&&r.id==='steady'));
  assert.equal(rewardLegal(s,{type:'modify',die:3,face:0,to:'sword'}),false);
  SKILLS.forEach(k=>s.upgrades[k.id]=0);s.relics=RELICS.map(r=>r.id);assert.deepEqual(generateRewards(s),[{type:'gold',amount:20}]);
  s.relics.pop();assert.equal(generateRewards(s).length,1);
});
test('V11 RNG and full authority state round-trip; invalid actions do not change save',()=>{
  let s=dispatch(newRun(812),{type:'enter',index:0});s=dispatch(s,{type:'roll'});s=dispatch(s,{type:'hold',die:2});
  const restored=deserialize(serialize(s));assert.deepEqual(restored,s);assert.deepEqual(dispatch(s,{type:'roll'}),dispatch(restored,{type:'roll'}));
  s=dispatch(s,{type:'end'});assert.deepEqual(deserialize(serialize(s)),s);
});
test('V13 warden armor survives player turn and expires at next enemy action',()=>{
  let s=newRun(3);s.floor=2;s=dispatch(s,{type:'enter',index:1});s=dispatch(s,{type:'end'});assert.equal(s.battle.block,8);assert.equal(s.battle.intent.attacks[0],10);
  s=dispatch(s,{type:'end'});assert.equal(s.battle.block,0);assert.equal(s.hp,50);
});
test('V13 boss half-health activation waits; multihit and lethal tax resolved atomically',()=>{
  let s=newRun(4);s.floor=6;s=dispatch(s,{type:'enter',index:0});s.battle.hp=35;s=dispatch(s,{type:'end'});
  assert.equal(s.battle.enhanced,true);assert.deepEqual(s.battle.intent.attacks,[6,6]);assert.equal(s.battle.intent.tax,2);
  s.block=8;s=dispatch(s,{type:'end'});assert.equal(s.hp,56);
  s=dispatch(s,{type:'roll'});s=dispatch(s,{type:'roll'});s.hp=2;s.block=100;s=dispatch(s,{type:'roll'});assert.equal(s.screen,'lost');assert.equal(s.hp,0);assert.match(s.cause,/重掷/);
});
test('V13 card reroll never incurs boss tax, enhanced intent does not change on reroll',()=>{
  let s=battle();s.battle.enhanced=true;s.battle.rolls=3;s.battle.hand=[{id:0,kind:'retry'}];const intent=structuredClone(s.battle.intent);
  s=dispatch(s,{type:'card',id:0,die:0});assert.equal(s.hp,60);assert.deepEqual(s.battle.intent,intent);
});
test('fourth enemy priest increases subsequent multihit damage',()=>{
  let s=newRun(10);s.floor=4;s=dispatch(s,{type:'enter',index:0});s=dispatch(s,{type:'end'});assert.deepEqual(s.battle.intent.attacks,[6,6]);s=dispatch(s,{type:'end'});s=dispatch(s,{type:'end'});assert.deepEqual(s.battle.intent.attacks,[7,7]);
});
test('T15 steady, wheel and gamble triggers have per-turn bounds',()=>{
  let s=battle();s.relics=['steady'];assert.equal(preview(s,'slash').block,3);s.battle.randomized=true;assert.equal(preview(s,'slash').block,0);
  s=battle();s.relics=['wheel'];s=dispatch(s,{type:'back'});s=dispatch(s,{type:'roll'});assert.equal(s.battle.boost,3);s=dispatch(s,{type:'roll'});assert.equal(s.battle.boost,3);
  s=battle();s.relics=['gamble'];s.battle.rolls=3;s.battle.hp=70;assert.equal(preview(s,'cleave').damage,17);s=use(s,'slash');assert.equal(preview(s,'cleave').damage,13);
});
test('T15 shield ring, anvil, coal, blade and second skill bonuses',()=>{
  let s=battle();s.relics=['ring','anvil'];assert.equal(preview(s,'guard').block,7);s=use(s,'guard');assert.equal(s.battle.hp,18);
  s=battle(['sword','fire','fire','shield','shield','sword']);s.relics=['coal'];assert.equal(preview(s,'burn').damage,12);
  s=battle();s.relics=['blade'];assert.equal(preview(s,'cleave').damage,16);
  s=battle();s.relics=['echo'];s=use(s,'guard');assert.equal(preview(s,'cleave').damage,15);
});
test('T15 ember and purse only trigger once at victory; compass and lantern at battle start',()=>{
  let s=newRun(10);s.relics=['compass','lantern'];s=dispatch(s,{type:'enter',index:0});assert.equal(s.battle.tp,3);assert.equal(s.block,6);s=dispatch(s,{type:'end'});assert.equal(s.block,0);
  s=battle();s.relics=['ember','coin'];s.hp=30;s.battle.hp=4;s=use(s,'slash');assert.equal(s.hp,34);assert.equal(s.gold,38);reject(s,{type:'skill',skill:'slash',dice:[0,1]});
});
test('V14 shop prices, purchases once, healing capped, camp mutually exclusive',()=>{
  let s=newRun(8);s.floor=1;s.gold=100;s=dispatch(s,{type:'enter',index:1});const p=price(s.stock[0]);s=dispatch(s,{type:'buy',index:0});assert.equal(s.gold,100-p);reject(s,{type:'buy',index:0});s.hp=59;s=dispatch(s,{type:'heal'});assert.equal(s.hp,60);
  s=newRun(8);s.floor=3;s.hp=50;s=dispatch(s,{type:'enter',index:0});s=dispatch(s,{type:'rest'});assert.equal(s.hp,60);assert.equal(s.floor,4);reject(s,{type:'train',skill:'slash',branch:0});
});
test('V14 reward claim once, event death guard and reset clears build',()=>{
  let s=battle();s.battle.hp=4;s=use(s,'slash');s=dispatch(s,{type:'reward',index:0});reject(s,{type:'reward',index:0});assert.equal(s.floor,1);
  s=dispatch(s,{type:'enter',index:0});s.hp=8;reject(s,{type:'event',choice:'offer'});s=dispatch(s,{type:'event',choice:'heal'});assert.equal(s.hp,16);
  s=newRun(10);assert.deepEqual(s.relics,[]);assert.deepEqual(s.upgrades,{});assert.equal(s.floor,0);assert.equal(s.hp,60);
});
test('V15 invalid and incompatible saves reject without mutating source',()=>{
  assert.throws(()=>deserialize('{'));for(const patch of [{version:999},{rng:-1},{hp:-1},{dice:[]},{screen:'battle'},{relics:['fake']},{rewards:[{type:'gold',amount:-1}]},{screen:'won'}]){
    const s=newRun(1);Object.assign(s,patch);assert.throws(()=>deserialize(serialize(s)),JSON.stringify(patch));
  }
  const s=battle();s.battle.hand.push(s.battle.hand[0]);assert.throws(()=>deserialize(serialize(s)));
});
test('V14 integration: 60 seeded real runs terminate, saves restore, wins and losses both reachable',()=>{
  let wins=0,losses=0;for(let seed=1;seed<=60;seed++){const result=simulate(seed);assert.ok(result.steps<2000);assert.ok(['won','lost'].includes(result.state.screen));assert.deepEqual(deserialize(serialize(result.state)),result.state);if(result.state.screen==='won')wins++;else losses++;}
  console.log(`Seeded simulation: ${wins} wins / ${losses} losses (scripted policy; not player balance evidence).`);assert.ok(wins>0);
  let passive=dispatch(newRun(1),{type:'enter',index:0});while(passive.screen==='battle')passive=dispatch(passive,{type:'end'});
  assert.equal(passive.screen,'lost');assert.deepEqual(deserialize(serialize(passive)),passive);
});
test('V03 second canonical 3+3 combination and five-fire ultimate consume exact dice',()=>{
  let s=battle(['sword','sword','shield','shield','fire','fire']);s.battle.hp=70;s=use(use(s,'bash'),'burn');assert.equal(s.battle.hp,56);assert.equal(s.stats.double,1);
  s=battle(['fire','fire','fire','fire','fire','sword']);s.battle.hp=70;s=use(s,'inferno');assert.equal(s.battle.hp,42);assert.equal(s.block,10);assert.equal(s.dice.filter(d=>d.spent).length,5);
});
test('V07 insufficient tactics, pre-roll play and additive momentum checked',()=>{
  let s=dispatch(newRun(1),{type:'enter',index:0});reject(s,{type:'card',id:s.battle.hand[0].id});
  s=battle();s.battle.hand=[{id:2,kind:'calibrate'}];s.battle.tp=1;reject(s,{type:'card',id:2,die:0,face:'sword'});
  s.battle.hand=[{id:5,kind:'momentum'}];s.battle.boost=3;s=dispatch(s,{type:'card',id:5});assert.equal(preview(s,'cleave').damage,19);s=use(s,'guard');assert.equal(s.battle.boost,6);s=use(s,'cleave');assert.equal(s.battle.boost,0);
});
test('V10 real modification grant persists next battle and blocks re-modifying same die',()=>{
  let s=battle();s.battle.hp=4;s=use(s,'slash');s.rewards=[{type:'modify',die:0,face:0,to:'fire'}];s=dispatch(s,{type:'reward',index:0});
  assert.deepEqual(s.dice[0].faces,['fire','sword','sword','shield','shield','fire']);assert.equal(s.dice[0].modified,true);
  assert.equal(rewardLegal(s,{type:'modify',die:0,face:1,to:'fire'}),false);s=dispatch(s,{type:'enter',index:0});s=dispatch(s,{type:'event',choice:'leave'});s=dispatch(s,{type:'enter',index:0});assert.equal(s.dice[0].faces[0],'fire');assert.deepEqual(deserialize(serialize(s)),s);
});
