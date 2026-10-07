export type Face = 'sword' | 'shield' | 'fire';
export type SkillId = 'slash' | 'guard' | 'bash' | 'burn' | 'cleave' | 'inferno';
export type CardId = 'retry' | 'calibrate' | 'armor' | 'momentum';
export type EnemyId = 'hunter' | 'giant' | 'warden' | 'priest' | 'elite' | 'boss';
export interface Skill { id: SkillId; name: string; cost: (Face | 'any')[]; damage: number; block: number; pierce?: boolean; next?: number; flavor: string }
export const FACE_NAME = { sword: '剑', shield: '盾', fire: '焰', any: '任意' };
export const FACES: Face[] = ['sword', 'sword', 'sword', 'shield', 'shield', 'fire'];
export const SKILLS: Skill[] = [
  { id: 'slash', name: '斩击', cost: ['sword','sword'], damage: 4, block: 0, flavor: '短刃出鞘，稳稳收下这一击。' },
  { id: 'guard', name: '架盾', cost: ['shield','shield'], damage: 0, block: 5, flavor: '站稳。深渊会先眨眼。' },
  { id: 'bash', name: '盾击', cost: ['sword','shield','shield'], damage: 5, block: 5, flavor: '让盾成为你的另一把剑。' },
  { id: 'burn', name: '焚击', cost: ['sword','fire','fire'], damage: 9, block: 0, pierce: true, flavor: '火焰穿过铁甲，直抵核心。' },
  { id: 'cleave', name: '重斩', cost: ['sword','sword','sword','fire'], damage: 13, block: 0, flavor: '将余烬压进剑锋。' },
  { id: 'inferno', name: '终焉烈焰', cost: ['fire','fire','fire','fire','fire'], damage: 28, block: 10, flavor: '以五簇火种，点燃整个长夜。' },
];
export const UPGRADES: Record<SkillId, [Partial<Skill>, Partial<Skill>]> = {
  slash: [{ name: '快斩', cost: ['any','any'] }, { name: '深斩', damage: 7 }],
  guard: [{ name: '厚盾', block: 8 }, { name: '反击准备', next: 2 }],
  bash: [{ name: '守势', block: 8 }, { name: '进势', damage: 8 }],
  burn: [{ name: '稳焰', cost: ['sword','sword','fire'] }, { name: '烈焰', damage: 13 }],
  cleave: [{ name: '猛击', damage: 17 }, { name: '灼刃', pierce: true }],
  inferno: [{ name: '引火', cost: ['fire','fire','fire','fire','sword'] }, { name: '终焉', damage: 36 }],
};
export const CARDS: Record<CardId, { name: string; cost: number; text: string; target?: boolean }> = {
  retry: { name: '再试一次', cost: 1, text: '重掷指定的一枚骰子，解除其保留。不占普通重掷次数。', target: true },
  calibrate: { name: '定向校准', cost: 2, text: '将指定骰子本回合的符号改为剑、盾或焰。', target: true },
  armor: { name: '应急护甲', cost: 1, text: '立即获得 4 格挡。本回合最多使用两张战术牌。' },
  momentum: { name: '借势一击', cost: 1, text: '本回合下一次攻击主技能伤害 +3。多个加成相加。' },
};
export interface Intent { name: string; attacks: number[]; block: number; tax?: number }
export const ENEMIES: Record<EnemyId, { name: string; hp: number; subtitle: string; lore: string; cycle: Intent[] }> = {
  hunter: { name: '地窟猎手', hp: 20, subtitle: '潜伏于灰烬中的掠食者', lore: '每回合攻击 8。兼顾进攻与格挡，能少受很多伤。', cycle: [{name:'扑袭',attacks:[8],block:0}] },
  giant: { name: '蓄力巨人', hp: 30, subtitle: '岩层深处的沉重心跳', lore: '蓄力与 16 点重击交替。利用蓄力回合倾泻火力。', cycle: [{name:'蓄力',attacks:[],block:0},{name:'碎岩重击',attacks:[16],block:0}] },
  warden: { name: '铁甲守卫', hp: 26, subtitle: '早已忘记誓言的守门人', lore: '交替获得 8 格挡、攻击 10。焚击可以穿透格挡。', cycle: [{name:'筑甲',attacks:[],block:8},{name:'铁刃',attacks:[10],block:0}] },
  priest: { name: '狂热祭司', hp: 28, subtitle: '以伤口敬奉永不熄灭的火', lore: '祷火后连续两段攻击。祷火永久提高后续每段伤害 1。', cycle: [{name:'祷火',attacks:[],block:0},{name:'双焰',attacks:[5,5],block:0}] },
  elite: { name: '熔炉督军', hp: 42, subtitle: '精英 · 深渊的铁腕', lore: '锻甲 10 → 连击 7×2 → 重击 18。高风险换取更多金币和稀有奖励。', cycle: [{name:'锻甲',attacks:[],block:10},{name:'连斩',attacks:[7,7],block:0},{name:'裂地',attacks:[18],block:0}] },
  boss: { name: '铸命者', hp: 70, subtitle: '幕末首领 · 命运也能被重铸', lore: '锻甲 10 → 连击 6×2 → 蓄力 → 重击 20。半血后的下一回合起，第二次普通重掷失去 2 生命。', cycle: [{name:'锻甲',attacks:[],block:10},{name:'连击',attacks:[6,6],block:0},{name:'蓄力',attacks:[],block:0},{name:'熔炉重击',attacks:[20],block:0}] },
};
export const RELICS = [
  {id:'steady',name:'沉稳徽记',icon:'◈',route:'稳健',text:'本回合没有额外随机重掷时，首次主技能获得 3 格挡。每回合一次。'},
  {id:'wheel',name:'余烬轮轴',icon:'✺',route:'重掷',text:'首次同时普通重掷至少 3 骰后，下一次攻击 +3。每回合一次。'},
  {id:'ring',name:'守誓铁环',icon:'◎',route:'守护',text:'含盾条件的主技能结算后，追加 2 普通伤害。每次主技能一次。'},
  {id:'gamble',name:'孤注护符',icon:'◇',route:'重掷',text:'用完两次普通重掷后，本回合第一次攻击主技能伤害 +4。'},
  {id:'coal',name:'炽热煤芯',icon:'◆',route:'烈焰',text:'投入至少 2 焰的主技能伤害 +3。每次主技能一次。'},
  {id:'anvil',name:'袖珍铁砧',icon:'▰',route:'守护',text:'带格挡的主技能额外获得 2 格挡。每次主技能一次。'},
  {id:'blade',name:'磨刀石',icon:'⟐',route:'剑锋',text:'投入至少 3 剑的主技能伤害 +3。每次主技能一次。'},
  {id:'echo',name:'双生火花',icon:'✧',route:'连招',text:'每回合第二个主技能伤害 +2、格挡 +2，仅增加其已有的效果。'},
  {id:'ember',name:'不灭余烬',icon:'✦',route:'续航',text:'每场战斗胜利后恢复 4 生命，不超过生命上限。'},
  {id:'coin',name:'拾荒者的钱袋',icon:'◉',route:'经济',text:'每场非 Boss 战斗胜利额外获得 8 金币。'},
  {id:'compass',name:'战术罗盘',icon:'⌖',route:'战术',text:'每场战斗以 3 战术点开始，仍受 3 点上限限制。'},
  {id:'lantern',name:'守夜灯',icon:'❖',route:'守护',text:'每场战斗第一回合开始获得 6 格挡。'},
] as const;
export type RelicId = typeof RELICS[number]['id'];
export const ROUTE = [
  [{id:'hunter',name:'灰烬入口',type:'battle',enemy:'hunter',text:'地窟猎手 · 初次交锋'}],
  [{id:'event',name:'余火祭坛',type:'event',text:'献上生命，换取力量'}, {id:'shop',name:'行脚商人',type:'shop',text:'花费金币，备战深渊'}],
  [{id:'giant',name:'回声石窟',type:'battle',enemy:'giant',text:'蓄力巨人 · 把握空隙'}, {id:'warden',name:'旧誓之门',type:'battle',enemy:'warden',text:'铁甲守卫 · 穿透防线'}],
  [{id:'camp',name:'最后的篝火',type:'camp',text:'恢复生命或升级技能'}],
  [{id:'priest',name:'焦土礼堂',type:'battle',enemy:'priest',text:'狂热祭司 · 危险递增'}, {id:'elite',name:'熔炉哨所',type:'battle',enemy:'elite',text:'精英督军 · 丰厚战利品'}],
  [{id:'warden',name:'深渊闸门',type:'battle',enemy:'warden',text:'铁甲守卫 · 最后的防线'}],
  [{id:'boss',name:'铸命熔炉',type:'battle',enemy:'boss',text:'铸命者 · 击败它，走出深渊'}],
] as const;
