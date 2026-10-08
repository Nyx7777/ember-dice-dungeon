import { TACTICS_PER_TURN, SKILLS, UPGRADES, CARDS, ENEMIES, RELICS, ROUTE, FACE_NAME, type Face, type SkillId } from './data.js';
import { newRun, dispatch, serialize, deserialize, symbol, skillFor, payment, preview, canSkill, cardUnavailable, incoming, price, rewardLegal, RULES, type State, type Action, type Reward } from './engine.js';
import { effectsFor, playEffects } from './effects.js';

const app=document.querySelector<HTMLElement>('#app')!;
const modal=document.querySelector<HTMLDialogElement>('#modal')!;
const KEY='ember-dungeon-save-v1', PREF='ember-dungeon-settings-v1';
let state:State|null=null, corrupt:string|null=null, saveWarning='', offlineReady=false;
let settings={sound:false,quick:false};
let selection: {kind:'card';id:number;die:number;face:Face}|null=null;
let toastTimer:ReturnType<typeof setTimeout>;
let presenting=false;
// Allocation is presentation state: dragging, selecting and cancelling never touch a save.
let draft:{id:SkillId;dice:number[]}|null=null, picked:number|null=null;
let upgradeCandidate:State|null=null;
const escape=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon=(face:Face|'any')=>({sword:'⚔',shield:'⬟',fire:'♨',any:'✧'}[face]);
const symbolHTML=(face:Face|'any')=>`<span class="symbol ${face}" aria-label="${FACE_NAME[face]}">${icon(face)}</span>`;
const button=(text:string,action:string,cls='',disabled=false,extra='')=>`<button class="${cls}" data-action="${action}" ${disabled?'disabled':''} ${extra}>${text}</button>`;
const faceRow=(faces:(Face|'any')[])=>faces.map(symbolHTML).join('');
const skillText=(skill:ReturnType<typeof skillFor>)=>`${skill.damage?`${skill.damage} ${skill.pierce?'穿透伤害':'伤害'}`:''}${skill.damage&&skill.block?' · ':''}${skill.block?`${skill.block} 格挡`:''}${skill.next?` · 下次攻击 +${skill.next}`:''}`;
const boardSkillText=(skill:ReturnType<typeof skillFor>)=>[skill.damage?`${skill.damage}${skill.pierce?'穿透':'伤害'}`:'',skill.block?`${skill.block}格挡`:'',skill.next?`下击+${skill.next}`:''].filter(Boolean).join(' · ');
try {const raw=localStorage.getItem(KEY);if(raw){try{state=deserialize(raw);}catch{corrupt=raw;try{upgradeCandidate=deserialize(raw,true);}catch{/* Keep the original file. */}}}const pref=JSON.parse(localStorage.getItem(PREF)||'{}');settings={sound:pref.sound===true,quick:pref.quick===true};} catch {saveWarning='浏览器未允许本地存储，请及时导出进度。';}
function notify(text:string){const el=document.querySelector<HTMLElement>('#toast')!;el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);}
function persist(next:State){try{localStorage.setItem(KEY,serialize(next));saveWarning='';}catch{saveWarning='进度仅在本次打开中保留，请从菜单导出存档。';}state=next;}
let audio:AudioContext|null=null;
function sound(){if(!settings.sound)return;try{audio ||=new AudioContext();void audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.type='sine';o.frequency.setValueAtTime(440,audio.currentTime);o.frequency.exponentialRampToValueAtTime(220,audio.currentTime+.09);g.gain.setValueAtTime(.035,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.13);o.start();o.stop(audio.currentTime+.14);}catch{/* Sound is optional. */}}
async function act(a:Action){
  if(!state||presenting)return;
  try{
    const before=state,next=dispatch(before,a);
    persist(next);draft=null;picked=null;close();sound();
    const effects=effectsFor(before,next,a);
    // Keep the encounter visible for the finishing blow; the terminal save is already committed.
    const terminal=before.screen==='battle'&&next.screen!=='battle'&&effects.hits.length>0;
    render(terminal?{...next,screen:'battle',floor:before.floor}:undefined);
    presenting=true;app.inert=true;app.setAttribute('aria-busy','true');
    try{await playEffects(app,next,effects,settings.quick);}
    finally{presenting=false;app.inert=false;app.removeAttribute('aria-busy');if(terminal)render();}
  }catch(e){notify(e instanceof Error?e.message:'操作未完成。');}
}
function close(){modal.close();selection=null;}
function open(content:string){modal.innerHTML=`<div class="modal-top"><span class="eyebrow">余烬手记</span>${button('×','close','icon-btn',false,'aria-label="关闭详情"')}</div>${content}`;if(!modal.open)modal.showModal();}
function header(){return `<header class="topbar"><div class="wordmark"><span>⟐</span> 骰子地下城 <small>DEMO</small></div>${button('☰','menu','icon-btn',false,'aria-label="打开菜单"')}</header>`;}
function stats(s=state!){return `<div class="resources"><span class="health">♥ <b>${s.hp}</b><small> / ${s.maxHp}</small></span><span class="gold">◉ ${s.gold}</span>${button(`◈ 构筑 ${s.relics.length+Object.keys(s.upgrades).length+s.dice.filter(d=>d.modified).length}`,'build','text-btn')}<span class="floor">${Math.min(7,s.floor+1)} / 7 层</span></div>`;}
function portrait(enemy='boss'){
  const flame=enemy==='priest'||enemy==='boss', horns=enemy==='hunter'||enemy==='elite';
  return `<svg class="portrait" viewBox="0 0 220 170" aria-hidden="true"><defs><radialGradient id="aura"><stop stop-color="${flame?'#b1693b':'#567c69'}" stop-opacity=".5"/><stop offset="1" stop-color="#17211e" stop-opacity="0"/></radialGradient><linearGradient id="armor" x2="1" y2="1"><stop stop-color="#658071"/><stop offset=".5" stop-color="#2f4940"/><stop offset="1" stop-color="#182a26"/></linearGradient></defs><circle cx="110" cy="88" r="83" fill="url(#aura)"/><circle cx="110" cy="85" r="63" fill="none" stroke="#b59865" stroke-opacity=".18"/><path d="M25 162 58 121 84 109h53l26 12 31 41" fill="#111b19" stroke="#5a7261"/><path d="m61 124 19-13 31 21 30-21 20 13-19 39H77Z" fill="url(#armor)" stroke="#7c8970"/><path d="m110 133-11 15 11 16 11-16Z" fill="#deac6b"/><path d="m73 53 37-21 37 21-5 51-32 29-32-29Z" fill="url(#armor)" stroke="#99a489" stroke-width="1.7"/><path d="m76 72 34 13 34-13-5 31-29 22-29-22Z" fill="#101d19"/><path d="m84 82 18 6-1 5-16-5m50-6-18 6 1 5 16-5" fill="#ffc77e"/><path d="m110 36-8 38 8 11 8-11Z" fill="#b6b28a"/><path d="m109 95-7 23 8 6 8-6-7-23" fill="#556e5b"/>${horns?'<path d="M78 57 50 25 55 67 79 78m63-21 28-32-5 42-24 11" fill="#526c59" stroke="#a4a785"/>':''}${flame?'<path d="m96 36 1-25 13 12 9-21 8 34-17-4Z" fill="#d0a169"/><path d="m161 122 11-21 5 17 12-10-5 26" fill="#be793e"/>':''}<path d="M43 158 62 94 69 92 59 162" fill="#8a9478"/><path d="m54 130 23 5" stroke="#c3ae7c" stroke-width="4"/><g fill="#d1a468" opacity=".6"><circle cx="45" cy="73" r="1.8"/><circle cx="171" cy="58" r="1.2"/><circle cx="150" cy="25" r="1.5"/><circle cx="62" cy="102" r="1"/></g></svg>`;
}
function home(){return `${header()}<section class="home"><div class="chapter">第一幕 / THE EMBER DESCENT</div><h1>六枚命骰<br>一线<span>余烬</span></h1><p class="lead">深入地城。保留希望。<br>让每一次收手，都成为你的选择。</p><div class="hero-art">${portrait()}<div class="hero-seal">Ⅰ</div></div><div class="hero-name">余烬骑士 <span>60 生命 · 六骰 · 双技能</span></div><div class="home-rules"><span><b>01</b> 掷骰与保留</span><span><b>02</b> 分配两招</span><span><b>03</b> 构筑与深入</span></div>${corrupt?'<div class="warning">发现不兼容或损坏的旧存档。可在菜单导出原文件；不会自动覆盖。</div>':''}${upgradeCandidate?button('保留旧进度并接受新规则','upgrade-save','secondary wide'):''}${button('点燃余烬，开始旅途 <span>→</span>','new','primary wide')}${button('第一次来？看看玩法','help','text-btn wide')}<small class="footnote">单人 PVE · 约 10–20 分钟试玩 · 自动保存<br>当前为开发 Demo，时长与平衡待实测</small></section>`;}
function mapView(){return `<section class="map-view"><div class="section-heading"><span class="eyebrow">CHAPTER 01 · 灰烬地城</span><h1>向火而行<span>已通过 ${state!.floor} 层</span></h1><p>生命会带入下一场战斗。每一步，都留下痕迹。</p></div><div class="route">${ROUTE.map((nodes,i)=>`<div class="route-row ${i===state!.floor?'current':i<state!.floor?'complete':'future'}"><div class="route-number">${i<state!.floor?'✓':String(i+1).padStart(2,'0')}</div><div class="route-options">${nodes.map((n,j)=>button(`<span class="node-symbol">${n.id==='boss'?'♜':n.type==='camp'?'♨':n.type==='shop'?'◉':n.type==='event'?'✧':n.id==='elite'?'♛':'⚔'}</span><span><b>${n.name}</b><small>${n.text}</small></span>${i===state!.floor?'<span class="arrow">→</span>':''}`,`enter:${j}`,`route-node ${state!.path[i]===n.id?'chosen':''}`,i!==state!.floor)).join('')}</div></div>`).join('')}</div><div class="boss-note"><span>♜</span><div><b>前方：铸命者</b><p>半血强化后，第二次普通重掷失去 2 生命。${button('查看机制','boss-info','inline-btn')}</p></div></div></section>`;}
function missing(id:SkillId){const sk=skillFor(state!,id),pool=state!.dice.filter(d=>!d.spent).map(symbol),miss:string[]=[];for(const f of sk.cost){const i=f==='any'?(pool.length?0:-1):pool.indexOf(f);if(i>=0)pool.splice(i,1);else miss.push(FACE_NAME[f]);}return miss.join('');}

function assignedSlots(s:State,id:SkillId,ids:number[]){
  const pool=[...ids];return skillFor(s,id).cost.map(face=>{const index=pool.findIndex(n=>face==='any'||symbol(s.dice[n])===face);return index<0?null:pool.splice(index,1)[0];});
}
function acceptsDie(id:SkillId,die:number){
  const s=state!,b=s.battle!;
  if(!b.rolls||b.used.includes(id)||s.dice[die].spent)return false;
  const ids=draft?.id===id?draft.dice:[];
  if(ids.includes(die))return false;
  return assignedSlots(s,id,[...ids,die]).filter(n=>n!==null).length===ids.length+1;
}
function placeDie(id:SkillId,die:number){
  if(!acceptsDie(id,die)){notify('这枚骰子不符合剩余槽位；已放入的骰子可点骰面取回。');return;}
  if(draft?.id!==id)draft={id,dice:[]};
  draft.dice.push(die);picked=null;render();
}
function readyDraft(){return !!draft&&canSkill(state!,draft.id)&&draft.dice.length===skillFor(state!,draft.id).cost.length&&assignedSlots(state!,draft.id,draft.dice).every(n=>n!==null);}
function battleView(s=state!){
  const b=s.battle!,enemy=ENEMIES[b.enemy],locked=b.used.length>0,remaining=Math.max(0,3-b.rolls);
  const complete=readyDraft(),effect=complete?preview(s,draft!.id,draft!.dice):null;
  const tacticReason=b.cardsUsed>=TACTICS_PER_TURN?'本回合已用完':b.hand.some(c=>!cardUnavailable(s,c.id))?'有可用战术':'暂无可用战术';
  return '<section class="battle-view"><div class="battle-board" aria-label="敌人意图与技能，可上下滚动">'+
  '<div class="encounter"><div class="enemy-label"><span class="eyebrow">'+(b.enemy==='boss'?'幕末首领':b.enemy==='elite'?'精英遭遇':'地城遭遇')+' · 回合 '+b.turn+'</span><h1>'+enemy.name+button('ⓘ','enemy-info','info-btn',false,'aria-label="查看敌人机制"')+'</h1><div class="enemy-hp"><span style="width:'+b.hp/b.maxHp*100+'%"></span></div><div class="hp-text">♥ '+b.hp+' / '+b.maxHp+(b.block?' · ⬟ '+b.block:'')+'</div></div>'+portrait(b.enemy)+'</div>'+
  '<div class="intent"><span class="intent-icon">'+(b.intent.attacks.length?'⚔':'⬟')+'</span><div><b>'+b.intent.name+'</b><small>'+(b.intent.attacks.length?b.intent.attacks.join(' + ')+' 伤害 · 你行动后攻击':b.intent.block?'获得 '+b.intent.block+' 格挡':'本回合不攻击')+'</small></div><div class="forecast"><b>'+incoming(s)+'</b><small>预计受伤</small></div></div>'+
  '<div class="board-heading"><b>骑士技艺</b><span class="slots">'+b.used.length+' / 2 招 <span class="scroll-cue">· 上滑看更多</span></span></div>'+
  '<div class="skill-grid">'+SKILLS.map(base=>{
    const sk=skillFor(s,base.id),paid=b.used.includes(base.id),active=draft?.id===sk.id,possible=!!b.rolls&&payment(s,sk.id)!==null;
    const slots=assignedSlots(s,sk.id,active?draft!.dice:[]),full=active&&complete;
    const status=paid?'本回合已施放':!b.rolls?'掷骰后配入':active?(full?'已点亮 · 待施放':'已放 '+draft!.dice.length+' / '+sk.cost.length+' 骰'):picked!==null?(acceptsDie(sk.id,picked)?'点击放入':'无法放入'):possible?'点选 / 拖入':'缺 '+missing(sk.id);
    return '<article class="skill-card '+(paid?'spent ':'')+(active?'active ':'')+(picked!==null&&acceptsDie(sk.id,picked)?'drop-ok ':'')+(full?'lit ':'')+(possible?'available ':'')+(sk.block&&!sk.damage?'defense':'attack')+'" data-skill="'+sk.id+'">'+
      button('<span class="skill-top"><b>'+sk.name+'</b><span class="skill-mark">'+(paid?'✓':sk.pierce?'↗':sk.block&&!sk.damage?'⬟':'⚔')+'</span></span><span class="skill-effect">'+boardSkillText(sk)+'</span><span class="cost">'+sk.cost.map((face,i)=>'<span class="socket '+(slots[i]!==null?'occupied':'')+'">'+symbolHTML(face)+'</span>').join('')+'</span><small>'+status+'</small>','skill:'+sk.id,'skill',paid,'aria-label="'+sk.name+'，'+sk.cost.map(f=>FACE_NAME[f]).join('、')+'；'+skillText(sk)+'；'+status+'"')+'</article>';
  }).join('')+'</div></div><div class="battle-dock">'+
  '<div class="dice-heading"><b>'+(!b.rolls?'① 先投掷六骰':picked!==null?'点亮的技艺可接收这枚骰子':draft?'点已配入骰子可取回':'② 拖骰入技艺，或点技艺配骰')+'</b><span>⬟ '+s.block+' 格挡</span></div>'+
  '<div class="dice-tray">'+s.dice.map(d=>{
    const assigned=!!draft?.dice.includes(d.id);
    return '<div class="die-cell">'+button((b.rolls?symbolHTML(symbol(d)):'<span class="unrolled">?</span>')+'<small>'+(d.spent?'已消耗':assigned?'已配入':picked===d.id?'选中':d.modified?'刻印 '+(d.id+1):'骰 '+(d.id+1))+'</small>','die:'+d.id,'die '+(d.held?'held ':'')+(d.spent?'spent ':'')+(assigned?'assigned ':'')+(picked===d.id?'picked ':'')+(d.modified?'modified':''),!b.rolls||d.spent,'aria-label="骰 '+(d.id+1)+(b.rolls?' '+FACE_NAME[symbol(d)]:'')+(assigned?' 已配入':'')+(d.spent?' 已消耗':'')+'" aria-pressed="'+(picked===d.id)+'"')+
    button(d.spent?'已用':d.held?'◆ 已锁':'◇ 锁定','hold:'+d.id,'hold-btn '+(d.held?'is-held':''),!b.rolls||d.spent,'aria-label="'+(d.held?'解锁':'锁定')+'骰 '+(d.id+1)+'" aria-pressed="'+d.held+'"')+'</div>';
  }).join('')+'</div>'+
  '<div class="allocation-status" aria-live="polite">'+(effect?'<strong>'+skillFor(s,draft!.id).name+'</strong><span>敌 −'+Math.min(b.hp,effect.loss)+'♥ · 自己 +'+effect.block+'⬟<br>结束回合预计受伤 '+incoming(s,effect.block)+(effect.next?' · 下次攻击 +'+effect.next:'')+'</span>':draft?'<strong>'+skillFor(s,draft.id).name+'</strong><span>配入 '+draft.dice.length+' / '+skillFor(s,draft.id).cost.length+' 骰 · 拖入或点选补齐</span>':!b.rolls?'<span>锁定的骰子不会重掷；每回合最多施放两种技艺。</span>':'<span>'+(locked?'已出 1 招 · ':'')+'还可重掷 <b>'+remaining+'</b> 次 · '+(b.enhanced&&b.rolls===2?'本次代价：失去 2 生命':b.enhanced&&b.rolls===1?'本次无代价；第二次失去 2 生命':remaining?'本次无生命代价':'次数已用完')+'</span>')+'</div>'+
  '<div class="battle-controls">'+(draft?button('取回全部骰子','clear-draft','secondary')+button('施放 · '+skillFor(s,draft.id).name,'cast','primary',!complete):button(!b.rolls?'投掷六骰':remaining?'重掷 · 剩 '+remaining+' 次':'重掷已用完','roll','primary',b.rolls>=3||(b.rolls>0&&s.dice.filter(d=>!d.spent).every(d=>d.held)))+button(locked?'选择第二招':'收手 · 选技能','allocate','secondary',!b.rolls))+'</div>'+
  '<div class="battle-secondary">'+button('<b>✦ 战术</b><small>剩 '+Math.max(0,TACTICS_PER_TURN-b.cardsUsed)+' 次 · '+b.tp+' 点</small>','tactics','tactics-button',false,'aria-label="战术，'+tacticReason+'，剩 '+Math.max(0,TACTICS_PER_TURN-b.cardsUsed)+' 次，'+b.tp+' 战术点"')+button('防守 +3<small>并结束回合</small>','emergency','text-btn',locked)+button('结束回合 →','end','end-btn')+'</div></div></section>';
}
function showTactics(){
  const b=state!.battle!;
  open('<h2>战术 · 每回合一次</h2><p class="muted">剩 '+Math.max(0,TACTICS_PER_TURN-b.cardsUsed)+' 次 · '+b.tp+' 战术点。每回合恢复 1 点，最多 3 点。两招之间也可用；第二招后敌人自动行动。</p><div class="hand">'+b.hand.map(c=>button('<b>'+CARDS[c.kind].name+'</b><span>'+CARDS[c.kind].text+'</span><small>消耗 '+CARDS[c.kind].cost+' 战术点</small>','card:'+c.id,'card')).join('')+'</div><p class="muted">牌库 '+b.deck.length+' · 弃牌 '+b.discard.length+' · 下回合抽一张，手牌上限四张。</p>');
}
function rewardInfo(r:Reward):{name:string;tag:string;icon:string;text:string;detail:string}{const s=state!;
  if(r.type==='relic'){const relic=RELICS.find(x=>x.id===r.id)!;return {name:relic.name,tag:`遗物 · ${relic.route}`,icon:relic.icon,text:relic.text,detail:'获得后整局生效，无需装备。'};}
  if(r.type==='upgrade'){const base=SKILLS.find(k=>k.id===r.skill)!,sk={...base,...UPGRADES[r.skill][r.branch]};return {name:sk.name,tag:`技能分支 · ${base.name}`,icon:'⚔',text:`${sk.cost.map(f=>FACE_NAME[f]).join(' + ')} → ${skillText(sk)}`,detail:'替换原技能；每个技能每局只能选择一个分支。'};}
  if(r.type==='modify'){const d=s.dice[r.die],faces=[...d.faces];faces[r.face]=r.to;return {name:`骰 ${r.die+1} · ${FACE_NAME[r.to]}之刻印`,tag:'骰面改造',icon:'⟐',text:`第 ${r.face+1} 面：${FACE_NAME[d.faces[r.face]]} → ${FACE_NAME[r.to]}。${FACE_NAME[d.faces[r.face]]}概率 −1/6，${FACE_NAME[r.to]}概率 +1/6。`,detail:`原：${d.faces.map(f=>FACE_NAME[f]).join(' ')}\n新：${faces.map(f=>FACE_NAME[f]).join(' ')}。下一场生效。`};}
  return {name:`${r.amount} 金币`,tag:'旅途补给',icon:'◉',text:'已无可用构筑奖励，收下盘缠继续前进。',detail:'直接加入本局金币。'};
}
function rewardCard(r:Reward,i:number,shop=false){const info=rewardInfo(r),sold=shop&&state!.bought.includes(i),invalid=!rewardLegal(state!,r);return `<article class="reward-card"><div class="reward-icon">${info.icon}</div><div><span class="eyebrow">${info.tag}</span><h2>${info.name}</h2><p>${info.text}</p><small>${escape(info.detail)}</small>${button(shop?sold?'已售出':`${price(r)} ◉ · 购买`:'选择这份力量 →',`${shop?'buy':'reward'}:${i}`,'secondary wide',sold||invalid||(shop&&state!.gold<price(r)))}</div></article>`;}
function rewardsView(){return `<section class="content-view"><span class="eyebrow">VICTORY · 战利品</span><h1>火种，更亮了一些。</h1><p class="muted">击败${ENEMIES[state!.battle!.enemy].name}。从下面选择一项，塑造你的下一场战斗。</p><div class="rewards">${state!.rewards.map((r,i)=>rewardCard(r,i)).join('')}</div><div class="flavor">「命运没有偏爱。只有你留下的骰子。」</div></section>`;}
function nodeView(){const s=state!;if(s.node==='shop')return `<section class="content-view"><span class="eyebrow">THE WANDERER · 行脚商人</span><h1>旅人，来挑点东西。</h1><p class="muted">「比起运气，我更相信准备。」持有 ${s.gold} 金币。</p>${s.stock.map((r,i)=>rewardCard(r,i,true)).join('')}<div class="offer"><b>暖身药剂</b><p>20 金币，恢复 12 生命。</p>${button('购买治疗 · 20 ◉','heal','secondary',s.gold<20||s.hp===s.maxHp)}</div>${button('离开商店 →','leave','primary wide')}</section>`;
  if(s.node==='camp')return `<section class="content-view camp"><span class="eyebrow">A MOMENT OF REST · 营地</span><div class="camp-art">♨</div><h1>火，还没有熄灭。</h1><p class="muted">在这里停留片刻。休息与磨炼，只能选择其一。</p><div class="offer"><b>靠近篝火</b><p>恢复 15 生命，当前 ${s.hp} / ${s.maxHp}。</p>${button('休息 · 恢复生命','rest','primary wide',s.hp===s.maxHp)}</div><div class="offer"><b>磨炼技艺</b><p>选择一个尚未升级的技能，获得永久分支。</p>${button('选择技能分支','train-menu','secondary wide',SKILLS.every(k=>s.upgrades[k.id]!==undefined))}</div>${button('继续赶路 →','leave','text-btn wide')}</section>`;
  return `<section class="content-view camp"><span class="eyebrow">THE EMBER ALTAR · 事件</span><div class="camp-art">✧</div><h1>灰烬中，有人在低语。</h1><p class="story">一座被遗忘的祭坛，仍在索取温热的血。石台的裂隙里，沉睡着不属于这个时代的力量。</p><div class="offer"><b>以血唤醒</b><p>失去 8 生命，获得一个尚未拥有的随机遗物。</p>${button('献上 8 生命 →','event:offer','primary wide',s.hp<=8||s.relics.length===12)}</div><div class="offer"><b>借一缕余温</b><p>恢复 8 生命，不获得遗物。</p>${button('温暖双手','event:heal','secondary wide')}</div>${button('转身离开','event:leave','text-btn wide')}</section>`;
}
function resultView(){const s=state!,won=s.screen==='won';return `<section class="content-view result"><span class="eyebrow">${won?'DEMO COMPLETE':'THE EMBER REMAINS'}</span><div class="result-emblem">${won?'♜':'⟐'}</div><h1>${won?'你重铸了命运。':'余烬，仍未散尽。'}</h1><p class="muted">${won?'铸命者倒下，地城终于迎来了一束光。':`倒在${escape(s.cause)}。带上这一局的经验，再试一次。`}</p><div class="result-grid"><div><b>${s.floor}/7</b><span>通过节点</span></div><div><b>${s.stats.turns}</b><span>战斗回合</span></div><div><b>${s.stats.double}</b><span>双技能回合</span></div><div><b>${s.stats.rerolls}</b><span>随机重掷</span></div></div><div class="summary"><h2>这次旅途的印记</h2><p>单招 ${s.stats.single} 回合 · 零招 ${s.stats.zero} 回合</p>${SKILLS.map(k=>`<div><span>${skillFor(s,k.id).name}</span><b>${s.stats.skills[k.id]} 次</b></div>`).join('')}</div>${button('查看本局构筑','build','secondary wide')}${button('再燃一次 · 开始新局','restart','primary wide')}${button('导出这次旅途','export','text-btn wide')}</section>`;}
function render(view=state){const scroll=app.querySelector('.battle-board')?.scrollTop||0;document.body.classList.toggle('quick',settings.quick);app.className=view?.screen==='battle'?'in-battle':'';app.innerHTML=view?`${header()}${stats(view)}${saveWarning?`<div class="warning compact">${saveWarning}</div>`:''}${view.screen==='map'?mapView():view.screen==='battle'?battleView(view):view.screen==='reward'?rewardsView():view.screen==='node'?nodeView():resultView()}`:home();const board=app.querySelector('.battle-board');if(board)board.scrollTop=scroll;}
function help(){open(`<h2>六骰，两招，一次抉择。</h2><ol class="help"><li><b>首次投掷六枚骰子。</b>点骰子下的「锁定」保留，未锁定的可重掷，最多两次。</li><li><b>拖骰入技艺，点亮后施放。</b>也可点技艺自动配骰，或先点骰子再点技艺。确认前可取回骰子，每个技能消耗指定组合。一回合最多两招，同名技能只能一次。</li><li><b>先看意图，再做选择。</b>敌人在你之后行动。格挡抵消伤害，下回合清空。</li><li><b>战术每回合一次，两招之间也能打。</b>护甲和加伤可在投骰前使用；重掷、改骰牌需先投骰，只作用于未消耗的骰子。首招后还可用剩余次数重掷未消耗骰子，第二招后敌人自动行动。</li><li><b>没有好组合也能过。</b>应急防守获得 3 格挡并结束回合；发动主技能后不能使用。</li></ol><div class="example"><b>剑剑剑盾盾焰</b><p>重斩用掉「剑剑剑焰」，架盾用掉剩下的「盾盾」。两招各用各的骰子。</p></div><p class="muted">起始祝福：15 金币旅途盘缠。生命跨战斗保留；战术牌与战术点每场重置。</p>${button('明白了','close','primary wide')}`);}
function menu(){open(`<h2>旅途手记</h2><div class="menu-list">${button('玩法与规则','help','secondary wide')}${state?.screen==='battle'?button('战斗记录','log','secondary wide'):''}${button(settings.sound?'声音：开':'声音：关','sound','secondary wide')}${button(settings.quick?'快速模式：开':'快速模式：关','quick','secondary wide')}${button('导出存档'+(corrupt?'（原文件）':''),'export','secondary wide',!state&&!corrupt)}${button('导入存档','import','secondary wide')}${state?button('结束当前旅途，重新开始','restart','secondary wide'):''}</div><p class="muted">v${RULES} · 单幕 Demo<br>${offlineReady?'离线资源已缓存':'离线缓存等待首次成功加载（需 localhost 或 HTTPS）'}<br>${saveWarning||'有效动作自动保存在此浏览器。'}<br>导入进度会替换当前旅途，请先导出需要保留的存档。</p>`);}
function buildView(){if(!state)return;open(`<h2>余烬骑士 · 本局构筑</h2><h3>遗物 ${state.relics.length} / 12</h3>${state.relics.map(id=>{const r=RELICS.find(r=>r.id===id)!;return `<div class="build-item"><b>${r.icon} ${r.name}</b><p>${r.text}</p></div>`;}).join('')||'<p class="muted">尚未获得遗物。战后奖励、祭坛与商店都可能带来新的力量。</p>'}<h3>技能分支</h3>${SKILLS.filter(k=>state!.upgrades[k.id]!==undefined).map(k=>`<div class="build-item"><b>${k.name} → ${skillFor(state!,k.id).name}</b><p>${skillText(skillFor(state!,k.id))}</p></div>`).join('')||'<p class="muted">还未升级技能。</p>'}<h3>骰面改造 ${state.dice.filter(d=>d.modified).length} / 3</h3>${state.dice.map(d=>`<div class="die-inspect"><b>骰 ${d.id+1}${d.modified?' ◈':''}</b><span>${faceRow(d.faces)}</span></div>`).join('')}<p class="muted">每个面概率均为 1/6。每枚骰子最多改造一次，每局最多三枚。</p>`);}
function showCard(id:number){
  const s=state!,b=s.battle!,c=b.hand.find(c=>c.id===id);if(!c)return;
  const cfg=CARDS[c.kind];
  selection={kind:'card',id,die:s.dice.find(d=>!d.spent)?.id??-1,face:'sword'};
  open('<span class="eyebrow">战术牌 · '+cfg.cost+' 战术点</span><h2>'+cfg.name+'</h2><p>'+cfg.text+'</p><p class="muted">'+(cfg.target?'投骰后可用；首招后仍可作用于剩余骰子。':c.kind==='momentum'?'投骰前或两招之间可用；加成在本回合下一次攻击生效，回合结束清空。':'自己回合内可用，包括投骰前和两招之间。')+'</p>'+(cfg.target?'<p>选择尚未消耗的骰子</p><div id="card-dice"></div>':'')+(c.kind==='calibrate'?'<div id="card-faces"></div>':'')+'<p id="card-status" class="warning" role="status" hidden></p>'+button('确认使用','confirm-card','primary wide',true)+button('取消','close','text-btn wide'));
  updateCard();
}
function updateCard(){
  if(selection?.kind!=='card')return;
  const sel=selection,s=state!,c=s.battle!.hand.find(c=>c.id===sel.id);if(!c)return;
  const dice=document.querySelector('#card-dice');
  if(dice)dice.innerHTML='<div class="dice-tray mini">'+s.dice.map(d=>button((s.battle!.rolls?symbolHTML(symbol(d)):'<span class="unrolled">?</span>')+'<small>'+(d.spent?'已消耗':'骰 '+(d.id+1))+'</small>','target:'+d.id,'die '+(sel.die===d.id&&!d.spent&&s.battle!.rolls?'held ':'')+(d.spent?'spent':''),d.spent||!s.battle!.rolls)).join('')+'</div>';
  const faces=document.querySelector('#card-faces');
  if(faces)faces.innerHTML='<p>改为哪个符号？</p><div class="face-choices">'+(['sword','shield','fire'] as Face[]).map(f=>button(symbolHTML(f)+' '+FACE_NAME[f],'face:'+f,'secondary '+(sel.face===f?'selected':''))).join('')+'</div>';
  const reason=cardUnavailable(s,sel.id)||(CARDS[c.kind].target&&(!s.dice[sel.die]||s.dice[sel.die].spent)?'请选择一枚尚未消耗的骰子。':'');
  const status=document.querySelector<HTMLElement>('#card-status')!;status.textContent=reason;status.hidden=!reason;
  document.querySelector<HTMLButtonElement>('[data-action="confirm-card"]')!.disabled=!!reason;
}
function exportSave(){const text=corrupt||(state?serialize(state):null);if(!text)return;const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`余烬之旅-${state?.runId||'原始存档'}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function handle(action:string){if(presenting)return;const [kind,arg]=action.split(':');
  if(kind==='close'){close();return;}if(kind==='noop')return;
  if(kind==='menu'){menu();return;}if(kind==='help'){help();return;}
  if(kind==='sound'||kind==='quick'){settings[kind]=!settings[kind];try{localStorage.setItem(PREF,JSON.stringify(settings));}catch{/* Settings remain for this session. */}render();menu();return;}
  if(kind==='export'){exportSave();return;}if(kind==='import'){document.querySelector<HTMLInputElement>('#import-file')!.click();return;}
  if(kind==='restart'||(kind==='new'&&corrupt)){open(`<h2>开始新的旅途？</h2><p>当前的局内进度将被替换。需要保留时，请先导出存档。</p>${button('先导出存档','export','secondary wide')}${button('确认开始新局','confirm-new','primary wide')}${button('继续当前旅途','close','text-btn wide')}`);return;}
  if(kind==='new'||kind==='confirm-new'){corrupt=null;upgradeCandidate=null;draft=null;picked=null;persist(newRun());close();render();return;}
  if(kind==='upgrade-save'&&upgradeCandidate){persist(upgradeCandidate);corrupt=null;upgradeCandidate=null;close();render();notify('进度已保留，首招后可用剩余重掷次数。');return;}
  if(!state)return;
  if(kind==='build'){buildView();return;}
  if(kind==='boss-info'||kind==='enemy-info'){const e=ENEMIES[kind==='boss-info'?'boss':state.battle!.enemy];open(`<span class="eyebrow">敌人图鉴</span><h2>${e.name}</h2><p>${e.lore}</p><ol class="help">${e.cycle.map(i=>`<li><b>${i.name}</b>：${i.attacks.length?i.attacks.join(' + ')+' 普通伤害':i.block?`获得 ${i.block} 格挡`:'不造成伤害'}</li>`).join('')}</ol><p class="muted">按上述顺序循环，意图在每个玩家回合开始时固定。</p>`);return;}
  if(kind==='log'){open(`<h2>战斗记录</h2><ol class="help">${state.log.map(t=>`<li>${escape(t)}</li>`).join('')}</ol>`);return;}
  if(kind==='skill'){
    const id=arg as SkillId;
    if(!state.battle!.rolls){notify('先投掷六骰，再把骰子配入技艺。');return;}
    if(picked!==null){placeDie(id,picked);return;}
    draft={id,dice:payment(state,id)||[]};render();return;
  }
  if(kind==='tactics'){showTactics();return;}
  if(kind==='clear-draft'){draft=null;picked=null;render();return;}
  if(kind==='cast'){if(readyDraft())void act({type:'skill',skill:draft!.id,dice:[...draft!.dice]});return;}
  if(kind==='card'){showCard(Number(arg));return;}
  if(kind==='target'&&selection?.kind==='card'){selection.die=Number(arg);updateCard();return;}
  if(kind==='face'&&selection?.kind==='card'){selection.face=arg as Face;updateCard();return;}
  if(kind==='confirm-card'&&selection?.kind==='card'){act({type:'card',id:selection.id,die:selection.die,face:selection.face});return;}
  if(kind==='train-menu'){open(`<h2>选择一项技能分支</h2>${SKILLS.filter(k=>state!.upgrades[k.id]===undefined).map(k=>`<h3>${k.name}</h3>${UPGRADES[k.id].map((u,i)=>button(`<b>${u.name}</b><small>${skillText({...k,...u})} · ${({...k,...u}).cost.map(f=>FACE_NAME[f]).join('')}</small>`,`train:${k.id}:${i}`,'upgrade-option secondary wide')).join('')}`).join('')}`);return;}
  if(kind==='train'){act({type:'train',skill:arg as SkillId,branch:Number(action.split(':')[2]) as 0|1});return;}
  if(['enter','reward','buy'].includes(kind)){act({type:kind as 'enter'|'reward'|'buy',index:Number(arg)});return;}
  if(kind==='die'){
    const id=Number(arg);
    if(!state.battle?.rolls||state.dice[id].spent)return;
    if(draft?.dice.includes(id)){draft.dice=draft.dice.filter(n=>n!==id);picked=null;}
    else if(draft&&acceptsDie(draft.id,id)){placeDie(draft.id,id);return;}
    else picked=picked===id?null:id;
    render();return;
  }
  if(kind==='hold'){
    act({type:'hold',die:Number(arg)});return;
  }
  if(kind==='event'){act({type:'event',choice:arg as 'offer'|'heal'|'leave'});return;}
  if(kind==='allocate'){if(state.battle?.phase==='roll')void act({type:'allocate'});app.querySelector('.skill-grid')?.scrollIntoView({block:'start',behavior:settings.quick?'instant':'smooth'});notify('点技艺自动配骰，或把骰子拖入槽位。');return;}
  if(['roll','back','end','emergency','rest','leave','heal'].includes(kind))act({type:kind} as Action);
}

let drag:{pointer:number;die:number;x:number;y:number;active:boolean;host:HTMLElement;ghost:HTMLElement|null}|null=null;
let suppressClickUntil=0;
function finishDrag(){
  const previous=drag;drag=null;if(previous){previous.ghost?.remove();try{previous.host.releasePointerCapture(previous.pointer);}catch{/* Already released. */}}
  app.querySelectorAll('.drop-ok,.drop-over').forEach(el=>el.classList.remove('drop-ok','drop-over'));
}
app.addEventListener('pointerdown',e=>{
  const host=(e.target as Element).closest<HTMLButtonElement>('.battle-dock .die');
  if(!host||host.disabled||presenting||modal.open||e.button!==0||drag)return;
  const die=Number(host.dataset.action!.split(':')[1]);
  if(draft?.dice.includes(die))return;
  drag={pointer:e.pointerId,die,x:e.clientX,y:e.clientY,active:false,host,ghost:null};host.setPointerCapture(e.pointerId);
});
app.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;
  if(!drag.active&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<7)return;
  e.preventDefault();
  if(!drag.active){
    drag.active=true;drag.ghost=drag.host.cloneNode(true) as HTMLElement;
    drag.ghost.removeAttribute('data-action');drag.ghost.className='die drag-ghost';drag.ghost.setAttribute('aria-hidden','true');document.body.append(drag.ghost);
    app.querySelectorAll<HTMLElement>('[data-skill]').forEach(el=>el.classList.toggle('drop-ok',acceptsDie(el.dataset.skill as SkillId,drag!.die)));
  }
  drag.ghost!.style.left=e.clientX+'px';drag.ghost!.style.top=e.clientY+'px';
  const over=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-skill]');
  app.querySelectorAll('.drop-over').forEach(el=>el.classList.remove('drop-over'));
  if(over&&acceptsDie(over.dataset.skill as SkillId,drag.die))over.classList.add('drop-over');
  const board=app.querySelector<HTMLElement>('.battle-board')!,rect=board.getBoundingClientRect();
  if(e.clientY<rect.top+36)board.scrollTop-=12;else if(e.clientY>rect.bottom-36&&e.clientY<rect.bottom)board.scrollTop+=12;
});
app.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.pointer)return;
  const {active,die}=drag,target=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('[data-skill]');
  finishDrag();
  if(active){suppressClickUntil=performance.now()+350;if(target)placeDie(target.dataset.skill as SkillId,die);}
});
app.addEventListener('pointercancel',()=>{if(drag?.active)suppressClickUntil=performance.now()+350;finishDrag();});
app.addEventListener('lostpointercapture',()=>{if(drag){suppressClickUntil=performance.now()+350;finishDrag();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){finishDrag();if(draft||picked!==null){draft=null;picked=null;render();}}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)finishDrag();});

document.addEventListener('click',e=>{if(performance.now()<suppressClickUntil)return;const button=(e.target as Element).closest<HTMLButtonElement>('button[data-action]');if(button&&!button.disabled)handle(button.dataset.action!);});
modal.addEventListener('cancel',()=>{selection=null;});
document.querySelector<HTMLInputElement>('#import-file')!.addEventListener('change',async e=>{
  const input=e.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;
  try{if(file.size>200000)throw new Error('存档文件过大。');const raw=await file.text();const legacy=['0.2.0','0.3.0','0.3.1'].includes(JSON.parse(raw)?.rules);const candidate=deserialize(raw,legacy);open(`<h2>导入旅途？</h2>${legacy?'<p class="warning">旧版进度将迁移到 v0.3.2：首招后可用剩余次数重掷未消耗骰子，次数不重置。战术每回合一次，两招之间也能使用；护甲和加伤可在投骰前使用。保留已使用次数、战果与随机状态；请先保留原文件。</p>':''}<p>第 ${Math.min(candidate.floor+1,7)} 层 · ${candidate.hp} 生命 · ${candidate.gold} 金币。导入后会替换当前进度。</p>${button('先导出当前存档','export','secondary wide',!state&&!corrupt)}<button id="confirm-import" class="primary wide">确认导入</button>${button('取消','close','text-btn wide')}`);document.querySelector('#confirm-import')!.addEventListener('click',()=>{persist(candidate);corrupt=null;upgradeCandidate=null;draft=null;picked=null;close();render();notify('存档已恢复。');},{once:true});}catch(error){notify(error instanceof Error?error.message:'导入失败，当前进度没有改变。');}
});
render();
if(upgradeCandidate)open('<h2>保留旅途，更新规则</h2><p>新版允许首招后用剩余次数重掷未消耗骰子，次数不重置。战术每回合一次，两招之间也能使用；护甲和加伤可在投骰前使用。你的生命、骰子、战果和随机状态都会保留；本回合已经用过战术，就不能再用。</p><p class="muted">确认前不会覆盖旧存档。可以先导出备份，再继续旅途。</p>'+button('导出旧存档','export','secondary wide')+button('接受新规则，继续旅途','upgrade-save','primary wide')+button('暂不迁移','close','text-btn wide'));
if('serviceWorker' in navigator){
  const checkCache=async()=>{try{offlineReady=await caches.has('ember-demo-0.3.2-reroll1');}catch{offlineReady=false;}};
  navigator.serviceWorker.addEventListener('controllerchange',()=>{void checkCache();});
  navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(checkCache).catch(()=>{/* LAN HTTP cannot register a service worker; online play remains available. */});
}
