import {newRun,dispatch,payment,canSkill,preview,symbol,skillFor} from '../dist/engine.js';
import {SKILLS,CARDS} from '../dist/data.js';
export function battle(faces=['sword','sword','sword','shield','shield','fire'],enemy='hunter') {
  let s=dispatch(newRun(42),{type:'enter',index:0});
  s=dispatch(s,{type:'roll'});s=dispatch(s,{type:'allocate'});
  s.dice.forEach((d,i)=>{d.override=faces[i];});
  if(enemy!=='hunter'){s.battle.enemy=enemy;s.battle.hp=70;s.battle.maxHp=70;}
  return s;
}
export function use(s,id){return dispatch(s,{type:'skill',skill:id,dice:payment(s,id)});}
function scoreSkill(s,id){const p=preview(s,id);const attack=s.battle.intent.attacks.reduce((a,b)=>a+b,0);return Math.min(p.loss,s.battle.hp)+1.3*Math.min(p.block,Math.max(0,attack-s.block))+(p.loss>=s.battle.hp?50:0);}
export function nextAction(s){
  if(s.screen==='map')return {type:'enter',index:0};
  if(s.screen==='reward'){
    const scores=s.rewards.map(r=>r.type==='upgrade'?(r.skill==='cleave'?20:r.skill==='guard'?14:r.skill==='slash'?9:3):r.type==='relic'?10:0);
    return {type:'reward',index:scores.indexOf(Math.max(...scores))};
  }
  if(s.screen==='node')return s.node==='camp'?{type:'rest'}:s.node==='event'?{type:'event',choice:s.hp<45?'heal':'offer'}:{type:'leave'};
  if(s.screen!=='battle')return null;
  const b=s.battle;
  if(!b.rolls)return {type:'roll'};
  if(b.phase==='roll'){
    // Aim for a sustainable cleave + guard; adapt fire requirement to upgraded skills.
    const quota={sword:3,shield:2,fire:1},keep=[];
    for(const d of s.dice){const f=symbol(d);if(quota[f]>0){keep.push(d.id);quota[f]--;}}
    if(b.rolls<3 && keep.length<6 && !(b.enhanced&&s.hp<=2&&b.rolls===2)){
      const change=s.dice.find(d=>d.held!==keep.includes(d.id));if(change)return {type:'hold',die:change.id};
      return {type:'roll'};
    }
    return {type:'allocate'};
  }
  if(!b.used.length&&b.cardsUsed<2){
    const c=b.hand.find(c=>b.tp>=CARDS[c.kind].cost&&(c.kind==='armor'&&b.intent.attacks.length||c.kind==='momentum'));
    if(c)return {type:'card',id:c.id};
  }
  const allowed=SKILLS.filter(k=>canSkill(s,k.id));
  if(!allowed.length)return {type:b.used.length?'end':'emergency'};
  const scores=allowed.map(k=>{
    let score=scoreSkill(s,k.id);const next=dispatch(s,{type:'skill',skill:k.id,dice:payment(s,k.id)});
    if(next.screen==='battle'&&next.battle.turn===b.turn){const second=SKILLS.filter(x=>canSkill(next,x.id));score+=Math.max(0,...second.map(x=>scoreSkill(next,x.id)));}
    return score;
  });
  const skill=allowed[scores.indexOf(Math.max(...scores))].id;
  return {type:'skill',skill,dice:payment(s,skill)};
}
export function simulate(seed){let s=newRun(seed),steps=0;const actions=[];while(!['won','lost'].includes(s.screen)&&steps++<2000){const a=nextAction(s);actions.push(a);s=dispatch(s,a);}return {state:s,steps,actions};}
