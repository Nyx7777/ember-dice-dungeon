import { FACES, SKILLS, UPGRADES, CARDS, ENEMIES, RELICS, ROUTE, type Face, type SkillId, type Skill, type CardId, type EnemyId, type Intent, type RelicId } from './data.js';

export const VERSION = 1;
export const RULES = '0.2.0';
export interface Die { id: number; faces: Face[]; faceIndex: number; override: Face | null; held: boolean; spent: boolean; modified: boolean }
export interface Card { id: number; kind: CardId }
export type Reward = { type: 'upgrade'; skill: SkillId; branch: 0 | 1 } | { type: 'relic'; id: RelicId } | { type: 'modify'; die: number; face: number; to: Face } | { type: 'gold'; amount: number };
export interface Battle {
  enemy: EnemyId; hp: number; maxHp: number; block: number; intent: Intent; cycle: number; rage: number; enhanced: boolean;
  turn: number; phase: 'roll' | 'allocate'; rolls: number; used: SkillId[]; cardsUsed: number; tp: number;
  deck: Card[]; hand: Card[]; discard: Card[]; boost: number; randomized: boolean; wheel: boolean; attacked: boolean;
}
export interface State {
  version: number; rules: string; runId: string; rng: number; seq: number;
  screen: 'map' | 'battle' | 'reward' | 'node' | 'won' | 'lost';
  hp: number; maxHp: number; block: number; gold: number; floor: number; path: string[];
  dice: Die[]; upgrades: Partial<Record<SkillId, 0 | 1>>; relics: RelicId[];
  battle: Battle | null; rewards: Reward[]; stock: Reward[]; bought: number[]; node: string;
  log: string[]; cause: string;
  stats: { turns: number; rerolls: number; single: number; double: number; zero: number; wins: number; skills: Record<SkillId, number> };
}
export type Action =
  | { type: 'enter'; index: number } | { type: 'roll' } | { type: 'hold'; die: number }
  | { type: 'allocate' } | { type: 'back' } | { type: 'skill'; skill: SkillId; dice: number[] }
  | { type: 'card'; id: number; die?: number; face?: Face } | { type: 'end' } | { type: 'emergency' }
  | { type: 'reward'; index: number } | { type: 'leave' } | { type: 'rest' }
  | { type: 'train'; skill: SkillId; branch: 0 | 1 } | { type: 'event'; choice: 'offer' | 'heal' | 'leave' }
  | { type: 'buy'; index: number } | { type: 'heal' };
export class RuleError extends Error {}
function need(ok: unknown, message: string): asserts ok { if (!ok) throw new RuleError(message); }
const has = (s: State, id: RelicId) => s.relics.includes(id);
export const symbol = (d: Die): Face => d.override || d.faces[d.faceIndex];
function note(s: State, text: string) { s.log = [...s.log.slice(-29), text]; }
function random(s: State) {
  s.rng = (s.rng + 0x6D2B79F5) >>> 0;
  let t = s.rng; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function shuffle<T>(s: State, values: T[]): T[] {
  const a = [...values]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a;
}
export function newRun(seed = Date.now() >>> 0): State {
  return {
    version: VERSION, rules: RULES, runId: `ember-${seed >>> 0}`, rng: seed >>> 0, seq: 0, screen: 'map',
    hp: 60, maxHp: 60, block: 0, gold: 15, floor: 0, path: [],
    dice: Array.from({length:6}, (_,id) => ({id,faces:[...FACES],faceIndex:0,override:null,held:false,spent:false,modified:false})),
    upgrades: {}, relics: [], battle: null, rewards: [], stock: [], bought: [], node: '', cause:'',
    log:['你收下 15 金币的旅途盘缠，踏入灰烬入口。'],
    stats: {turns:0,rerolls:0,single:0,double:0,zero:0,wins:0,skills:{slash:0,guard:0,bash:0,burn:0,cleave:0,inferno:0}},
  };
}
export function skillFor(s: State, id: SkillId): Skill {
  const base = SKILLS.find(x => x.id === id)!;
  return {...base,...(s.upgrades[id] === undefined ? {} : UPGRADES[id][s.upgrades[id]!])};
}
export function payment(s: State, id: SkillId): number[] | null {
  const pool = s.dice.filter(d=>!d.spent), selected: number[] = [];
  for (const face of skillFor(s,id).cost) {
    const d = pool.find(d => !selected.includes(d.id) && (face === 'any' || symbol(d) === face));
    if (!d) return null; selected.push(d.id);
  }
  return selected;
}
function validPayment(s: State, skill: Skill, ids: number[]) {
  if (ids.length !== skill.cost.length || new Set(ids).size !== ids.length) return false;
  const dice = ids.map(id=>s.dice.find(d=>d.id === id));
  if (dice.some(d=>!d || d.spent)) return false;
  const faces = dice.map(d=>symbol(d!));
  for (const face of skill.cost) {
    const i = face === 'any' ? 0 : faces.indexOf(face); if (i < 0) return false; faces.splice(i,1);
  }
  return true;
}
export function canSkill(s: State, id: SkillId) {
  return s.screen === 'battle' && s.battle!.phase === 'allocate' && s.battle!.used.length < 2 && !s.battle!.used.includes(id) && payment(s,id) !== null;
}
export function preview(s: State, id: SkillId, ids = payment(s,id) || []) {
  const skill = skillFor(s,id), b = s.battle!;
  const faces = ids.map(i=>symbol(s.dice[i]));
  let damage = skill.damage, block = skill.block;
  if (damage) {
    damage += b.boost;
    if (has(s,'gamble') && b.rolls === 3 && !b.attacked) damage += 4;
    if (has(s,'coal') && faces.filter(f=>f==='fire').length >= 2) damage += 3;
    if (has(s,'blade') && faces.filter(f=>f==='sword').length >= 3) damage += 3;
    if (has(s,'echo') && b.used.length === 1) damage += 2;
  }
  if (block && has(s,'anvil')) block += 2;
  if (block && has(s,'echo') && b.used.length === 1) block += 2;
  if (!b.used.length && !b.randomized && has(s,'steady')) block += 3;
  const extra = has(s,'ring') && skill.cost.includes('shield') ? 2 : 0;
  const directLoss = skill.pierce ? damage : Math.max(0,damage-b.block);
  const remainingBlock = skill.pierce ? b.block : Math.max(0,b.block-damage);
  return {damage,block,extra,loss:directLoss+Math.max(0,extra-remainingBlock),pierce:!!skill.pierce,next:skill.next || 0};
}
export function incoming(s: State, extraBlock = 0) {
  return Math.max(0,s.battle!.intent.attacks.reduce((a,b)=>a+b,0)-s.block-extraBlock);
}
function draw(s: State) {
  const b = s.battle!; if (b.hand.length >= 4) return;
  if (!b.deck.length) { b.deck = shuffle(s,b.discard); b.discard = []; }
  if (b.deck.length) b.hand.push(b.deck.shift()!);
}
function setIntent(s: State) {
  const b=s.battle!, original=ENEMIES[b.enemy].cycle[b.cycle % ENEMIES[b.enemy].cycle.length];
  b.intent={...original,attacks:original.attacks.map(n=>n+b.rage),tax:b.enhanced ? 2 : 0};
}
function startTurn(s: State) {
  const b=s.battle!; b.turn++; s.block=0;
  b.phase='roll'; b.rolls=0; b.used=[]; b.cardsUsed=0; b.boost=0; b.randomized=false; b.wheel=false; b.attacked=false;
  s.dice.forEach(d=>{d.spent=false;d.held=false;d.override=null;});
  if (b.turn > 1) { b.tp=Math.min(3,b.tp+1); draw(s); }
  if (b.turn===1 && has(s,'lantern')) s.block+=6;
  setIntent(s);
}
function startBattle(s: State, enemy: EnemyId) {
  const kinds: CardId[]=['retry','retry','calibrate','armor','armor','momentum'];
  s.battle={enemy,hp:ENEMIES[enemy].hp,maxHp:ENEMIES[enemy].hp,block:0,intent:{name:'',attacks:[],block:0},cycle:0,rage:0,enhanced:false,
    turn:0,phase:'roll',rolls:0,used:[],cardsUsed:0,tp:has(s,'compass')?3:2,deck:shuffle(s,kinds.map((kind,id)=>({id,kind}))),hand:[],discard:[],boost:0,randomized:false,wheel:false,attacked:false};
  s.screen='battle'; for(let i=0;i<3;i++)draw(s); startTurn(s); note(s,`遭遇${ENEMIES[enemy].name}。`);
}
function damageEnemy(s: State, amount: number, pierce=false) {
  const b=s.battle!, absorbed=pierce?0:Math.min(b.block,amount); b.block-=absorbed; b.hp=Math.max(0,b.hp-amount+absorbed);
}
function damagePlayer(s: State, amount: number, pierce=false) {
  const absorbed=pierce?0:Math.min(s.block,amount); s.block-=absorbed; s.hp=Math.max(0,s.hp-amount+absorbed);
}
function countTurn(s: State) {
  s.stats.turns++; const n=s.battle!.used.length; if(n===2)s.stats.double++; else if(n===1)s.stats.single++; else s.stats.zero++;
}
function lose(s: State, source: string) { countTurn(s); s.screen='lost'; s.cause=source; note(s,`倒在了${source}之下。余烬尚存，来日再战。`); }
function victory(s: State) {
  countTurn(s); s.stats.wins++; if(has(s,'ember'))s.hp=Math.min(s.maxHp,s.hp+4);
  const b=s.battle!; s.floor++; s.block=0;
  note(s,`击败${ENEMIES[b.enemy].name}！`);
  if(b.enemy==='boss'){s.screen='won';return;}
  s.gold+=(b.enemy==='elite'?25:15)+(has(s,'coin')?8:0);
  s.rewards=generateRewards(s,b.enemy==='elite'); s.screen='reward';
}
function endTurn(s: State) {
  const b=s.battle!; countTurn(s); b.block=0;
  for(const amount of b.intent.attacks){damagePlayer(s,amount); if(s.hp===0){s.screen='lost';s.cause=ENEMIES[b.enemy].name+' · '+b.intent.name;note(s,`你倒在${b.intent.name}之下。`);return;}}
  b.block=b.intent.block;
  if(b.enemy==='priest' && b.cycle % 2 === 0)b.rage++;
  if(b.enemy==='boss' && b.hp<=35 && !b.enhanced){b.enhanced=true;note(s,'铸命者进入强化：从下回合起，第二次普通重掷失去 2 生命。');}
  note(s,b.intent.attacks.length?`${b.intent.name}：${b.intent.attacks.join(' + ')} 点伤害。`:`${b.intent.name}${b.intent.block?`：获得 ${b.intent.block} 格挡`:'：敌人蓄势待发'}。`);
  b.cycle++; startTurn(s);
}
export function rewardLegal(s: State, r: Reward) {
  if(r.type==='relic')return RELICS.some(x=>x.id===r.id)&&!has(s,r.id);
  if(r.type==='upgrade')return !!SKILLS.find(x=>x.id===r.skill)&&s.upgrades[r.skill]===undefined&&(r.branch===0||r.branch===1);
  if(r.type==='modify'){const d=s.dice[r.die];return s.dice.filter(d=>d.modified).length<3&&!!d&&!d.modified&&Number.isInteger(r.face)&&r.face>=0&&r.face<6&&['sword','shield','fire'].includes(r.to)&&d.faces[r.face]!==r.to;}
  return r.type==='gold'&&Number.isInteger(r.amount)&&r.amount>0&&r.amount<=100;
}
export function rewardPool(s: State): Reward[] {
  const pool: Reward[]=[];
  for(const skill of SKILLS)if(s.upgrades[skill.id]===undefined)for(const branch of [0,1] as const)pool.push({type:'upgrade',skill:skill.id,branch});
  for(const r of RELICS)if(!has(s,r.id))pool.push({type:'relic',id:r.id});
  for(const d of s.dice)if(!d.modified)for(const to of ['sword','shield','fire'] as Face[]){
    const face=d.faces.findIndex(f=>f!==to); const r:Reward={type:'modify',die:d.id,face,to}; if(rewardLegal(s,r))pool.push(r);
  }
  return pool;
}
export function generateRewards(s: State, elite=false): Reward[] {
  const pool=shuffle(s,rewardPool(s)), result: Reward[]=[];
  // Diverse candidate types, then fill from remaining valid choices.
  for(const type of (elite?['relic','upgrade','modify']:['upgrade','modify','relic'])){
    const r=pool.find(r=>r.type===type); if(r)result.push(r);
  }
  for(const r of pool)if(result.length<3&&!result.includes(r))result.push(r);
  return result.length?result:[{type:'gold',amount:20}];
}
function grant(s: State, r: Reward) {
  need(rewardLegal(s,r),'这个奖励已不再适用。');
  if(r.type==='upgrade')s.upgrades[r.skill]=r.branch;
  else if(r.type==='relic')s.relics.push(r.id);
  else if(r.type==='modify'){s.dice[r.die].faces[r.face]=r.to;s.dice[r.die].modified=true;}
  else s.gold+=r.amount;
}
export function price(r: Reward) { return r.type==='relic'?35:r.type==='modify'?25:30; }
function completeNode(s: State) { s.floor++;s.screen='map';s.node='';s.stock=[];s.bought=[]; }
export function dispatch(state: State, a: Action): State {
  const s=structuredClone(state), b=s.battle;
  if(a.type==='enter') {
    need(s.screen==='map'&&s.floor<7,'当前不能进入路线。');
    const node=ROUTE[s.floor][a.index]; need(node,'请选择可达节点。');s.path.push(node.id);s.node=node.id;
    if(node.type==='battle')startBattle(s,node.enemy);
    else {s.screen='node';s.stock=node.type==='shop'?generateRewards(s):[];s.bought=[];}
  } else if(['roll','hold','allocate','back','skill','card','end','emergency'].includes(a.type)) {
    need(s.screen==='battle'&&b,'不在战斗中。');
    if(a.type==='roll') {
      need(b.phase==='roll'&&b.used.length===0&&b.rolls<3,'本回合不能继续普通投掷。');
      const dice=s.dice.filter(d=>b.rolls===0||!d.held);need(dice.length,'请先解除至少一枚骰子的保留。');
      if(b.rolls>0){b.randomized=true;s.stats.rerolls++;if(has(s,'wheel')&&!b.wheel&&dice.length>=3){b.boost+=3;b.wheel=true;}}
      for(const d of dice){d.faceIndex=Math.floor(random(s)*6);d.override=null;}
      b.rolls++;note(s,b.rolls===1?'六骰落定。点击骰子保留，或收手分配技能。':`重掷 ${dice.length} 枚骰子。`);
      if(b.enhanced&&b.rolls===3){damagePlayer(s,2,true);note(s,'铸命税：失去 2 生命。');if(!s.hp)lose(s,'铸命者 · 重掷代价');}
    } else if(a.type==='hold') {
      need(b.phase==='roll'&&b.rolls>0&&!b.used.length,'当前不能保留骰子。');const d=s.dice.find(d=>d.id===a.die);need(d&&!d.spent,'骰子不可用。');d.held=!d.held;
    } else if(a.type==='allocate') {need(b.phase==='roll'&&b.rolls>0,'请先投掷六骰。');b.phase='allocate';}
    else if(a.type==='back') {need(b.phase==='allocate'&&!b.used.length,'首招后不能返回投掷。');b.phase='roll';}
    else if(a.type==='skill') {
      need(SKILLS.some(x=>x.id===a.skill)&&canSkill(s,a.skill),'技能不可用，或本回合已经使用。');
      const skill=skillFor(s,a.skill);need(validPayment(s,skill,a.dice),'投入的骰子不满足技能条件。');
      const effect=preview(s,a.skill,a.dice);
      for(const id of a.dice)s.dice[id].spent=true;
      damageEnemy(s,effect.damage,effect.pierce);s.block+=effect.block;
      if(skill.damage){b.boost=0;b.attacked=true;}
      if(skill.next)b.boost+=skill.next;
      if(effect.extra)damageEnemy(s,effect.extra);
      b.used.push(a.skill);s.stats.skills[a.skill]++;
      note(s,`${skill.name}：${effect.damage?`${effect.damage}${effect.pierce?' 穿透':' 伤害'}`:''}${effect.block?` +${effect.block} 格挡`:''}${effect.extra?`，铁环追击 ${effect.extra}`:''}。`);
      if(!b.hp)victory(s);else if(b.used.length===2)endTurn(s);
    } else if(a.type==='card') {
      need(b.rolls>0&&!b.used.length&&b.cardsUsed<2,'只能在首招前使用战术牌，每回合最多两张。');
      const c=b.hand.find(c=>c.id===a.id);need(c,'手中没有这张牌。');const config=CARDS[c.kind];need(b.tp>=config.cost,'战术点不足。');
      let d: Die | undefined;
      if(config.target){d=s.dice.find(d=>d.id===a.die);need(d&&!d.spent,'请选择一枚可用骰子。');}
      if(c.kind==='calibrate')need(a.face&&['sword','shield','fire'].includes(a.face),'请选择目标符号。');
      b.tp-=config.cost;b.cardsUsed++;b.hand=b.hand.filter(x=>x.id!==c.id);b.discard.push(c);
      if(c.kind==='armor')s.block+=4;
      if(c.kind==='momentum')b.boost+=3;
      if(c.kind==='retry'){d!.faceIndex=Math.floor(random(s)*6);d!.override=null;d!.held=false;b.randomized=true;s.stats.rerolls++;}
      if(c.kind==='calibrate')d!.override=a.face!;
      note(s,`使用${config.name}。`);
    } else if(a.type==='end')endTurn(s);
    else if(a.type==='emergency'){need(!b.used.length,'发动主技能后不能应急防守。');s.block+=3;note(s,'应急防守：获得 3 格挡并结束回合。');endTurn(s);}
  } else if(a.type==='reward') {
    need(s.screen==='reward','当前没有待领取奖励。');const r=s.rewards[a.index];need(r,'请选择现有奖励。');grant(s,r);s.rewards=[];s.screen='map';
  } else {
    need(s.screen==='node','当前不在休整节点。');
    if(a.type==='leave')completeNode(s);
    else if(a.type==='rest'){need(s.node==='camp','这里不是营地。');s.hp=Math.min(s.maxHp,s.hp+15);note(s,'篝火休息：恢复 15 生命。');completeNode(s);}
    else if(a.type==='train'){need(s.node==='camp','这里不能免费升级。');grant(s,{type:'upgrade',skill:a.skill,branch:a.branch});note(s,'篝火旁，你磨炼了一项技艺。');completeNode(s);}
    else if(a.type==='event'){
      need(s.node==='event','这里没有祭坛。');
      if(a.choice==='offer'){
        const pool=RELICS.filter(r=>!has(s,r.id));need(s.hp>8&&pool.length,'献祭需要至少 9 生命且仍有可获得遗物。');s.hp-=8;
        const r=pool[Math.floor(random(s)*pool.length)];s.relics.push(r.id);note(s,`向祭坛献出 8 生命，获得${r.name}。`);
      } else if(a.choice==='heal'){s.hp=Math.min(s.maxHp,s.hp+8);note(s,'余火抚平伤口：恢复 8 生命。');}
      else need(a.choice==='leave','未知的事件选择。');
      completeNode(s);
    } else if(a.type==='buy'){
      need(s.node==='shop','这里不是商店。');const r=s.stock[a.index];need(r&&!s.bought.includes(a.index),'商品已经售出。');need(s.gold>=price(r),'金币不足。');grant(s,r);s.gold-=price(r);s.bought.push(a.index);
    } else if(a.type==='heal'){
      need(s.node==='shop'&&s.gold>=20&&s.hp<s.maxHp,'治疗需要 20 金币，且生命尚未全满。');s.gold-=20;s.hp=Math.min(s.maxHp,s.hp+12);
    } else throw new RuleError('未知操作。');
  }
  s.seq++;return s;
}

export function serialize(s: State) { return JSON.stringify(s); }
/** Validate all fields used by rendering and transitions before replacing a live save. */
export function deserialize(raw: string): State {
  need(raw.length<200000,'存档文件过大。');
  let s: State; try {s=JSON.parse(raw);} catch {throw new RuleError('文件不是有效的 JSON 存档。');}
  need(s&&typeof s==='object'&&s.version===VERSION&&s.rules===RULES,'存档格式或规则版本不兼容，请保留原文件。');
  const int=(n:unknown,min=0,max=1e9)=>typeof n==='number'&&Number.isInteger(n)&&n>=min&&n<=max;
  const str=(v:unknown)=>typeof v==='string'&&v.length<=250;
  const arr=(v:unknown,max:number)=>Array.isArray(v)&&v.length<=max;
  need(str(s.runId)&&int(s.rng,0,0xffffffff)&&int(s.seq)&&int(s.hp,0,60)&&s.maxHp===60&&int(s.block)&&int(s.gold)&&int(s.floor,0,7),'存档资源字段无效。');
  need(['map','battle','reward','node','won','lost'].includes(s.screen)&&str(s.node)&&str(s.cause),'存档阶段无效。');
  need(arr(s.path,7)&&s.path.every(str)&&arr(s.log,30)&&s.log.every(str),'存档路线或日志无效。');
  const faces=['sword','shield','fire'];
  need(arr(s.dice,6)&&s.dice.length===6&&s.dice.every((d,i)=>d&&d.id===i&&arr(d.faces,6)&&d.faces.length===6&&d.faces.every(f=>faces.includes(f))&&int(d.faceIndex,0,5)&&(d.override===null||faces.includes(d.override))&&typeof d.held==='boolean'&&typeof d.spent==='boolean'&&typeof d.modified==='boolean')&&s.dice.filter(d=>d.modified).length<=3,'骰子数据无效。');
  need(s.upgrades&&typeof s.upgrades==='object'&&!Array.isArray(s.upgrades)&&Object.entries(s.upgrades).every(([id,branch])=>SKILLS.some(k=>k.id===id)&&(branch===0||branch===1)),'技能升级无效。');
  need(arr(s.relics,12)&&new Set(s.relics).size===s.relics.length&&s.relics.every(id=>RELICS.some(r=>r.id===id)),'遗物数据无效。');
  const validReward=(r:Reward)=>r&&typeof r==='object'&&(
    r.type==='gold'?int(r.amount,1,100):r.type==='relic'?RELICS.some(x=>x.id===r.id):r.type==='upgrade'?SKILLS.some(x=>x.id===r.skill)&&(r.branch===0||r.branch===1):r.type==='modify'&&int(r.die,0,5)&&int(r.face,0,5)&&faces.includes(r.to));
  need(arr(s.rewards,3)&&s.rewards.every(validReward)&&arr(s.stock,3)&&s.stock.every(validReward)&&arr(s.bought,3)&&new Set(s.bought).size===s.bought.length&&s.bought.every(i=>int(i,0,s.stock.length-1)),'奖励数据无效。');
  need(s.stats&&['turns','rerolls','single','double','zero','wins'].every(k=>int(s.stats[k as keyof Omit<State['stats'],'skills'>]))&&s.stats.skills&&Object.keys(s.stats.skills).length===6&&SKILLS.every(k=>int(s.stats.skills[k.id])),'统计数据无效。');
  if(s.battle!==null){
    const b=s.battle;need(b&&Object.hasOwn(ENEMIES,b.enemy)&&b.maxHp===ENEMIES[b.enemy].hp&&int(b.hp,0,b.maxHp)&&int(b.block)&&int(b.cycle)&&int(b.rage)&&typeof b.enhanced==='boolean','敌人数据无效。');
    need(int(b.turn,1)&&['roll','allocate'].includes(b.phase)&&int(b.rolls,0,3)&&int(b.tp,0,3)&&int(b.cardsUsed,0,2)&&int(b.boost)&&typeof b.randomized==='boolean'&&typeof b.wheel==='boolean'&&typeof b.attacked==='boolean','回合数据无效。');
    need(arr(b.used,2)&&new Set(b.used).size===b.used.length&&b.used.every(id=>SKILLS.some(k=>k.id===id)),'技能次数无效。');
    need(arr(b.deck,6)&&arr(b.hand,4)&&arr(b.discard,6),'卡牌区域无效。');
    const cards=[...b.deck,...b.hand,...b.discard],kinds=['retry','retry','calibrate','armor','armor','momentum'];
    need(cards.length===6&&new Set(cards.map(c=>c?.id)).size===6&&cards.every(c=>c&&int(c.id,0,5)&&c.kind===kinds[c.id]),'卡牌实例数据无效。');
    need(b.intent&&str(b.intent.name)&&arr(b.intent.attacks,2)&&b.intent.attacks.every(n=>int(n))&&int(b.intent.block)&&int(b.intent.tax,0,2),'意图数据无效。');
  }
  if(s.screen==='battle')need(s.battle&&s.hp>0&&s.battle.hp>0&&s.floor<7&&s.battle.used.length<2&&(s.battle.phase==='allocate'?s.battle.rolls>0:s.battle.used.length===0),'战斗阶段不一致。');
  if(s.screen==='map')need(s.floor<7&&s.hp>0,'地图状态无效。');
  if(s.screen==='node')need(s.hp>0&&((s.floor===1&&['event','shop'].includes(s.node))||(s.floor===3&&s.node==='camp')),'节点状态无效。');
  if(s.screen==='reward')need(s.rewards.length>0&&s.rewards.every(r=>rewardLegal(s,r))&&s.battle&&s.battle.hp===0&&s.hp>0&&s.floor<7,'奖励状态无效。');
  if(s.screen==='lost')need(s.hp===0,'失败状态无效。');
  if(s.screen==='won')need(s.floor===7&&s.hp>0&&s.battle?.enemy==='boss'&&s.battle.hp===0,'通关状态无效。');
  return s;
}
