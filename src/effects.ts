import { preview, type Action, type State } from './engine.js';

export interface Hit { target: 'enemy' | 'player'; loss: number; blocked: number; delay: number }
export interface Effects { dice: number[]; hits: Hit[] }

/** Read-only presentation plan. dispatch remains the only source of game outcomes. */
export function effectsFor(before: State, after: State, action: Action): Effects {
  const effects: Effects = { dice: [], hits: [] }, b = before.battle;
  if (before.screen !== 'battle' || !b || !after.battle) return effects;
  if (action.type === 'roll') effects.dice = before.dice.filter(d => !b.rolls || !d.held).map(d => d.id);
  if (action.type === 'card' && b.hand.find(c => c.id === action.id)?.kind === 'retry') effects.dice = [action.die!];
  const skill = action.type === 'skill' ? preview(before, action.skill, action.dice) : null;
  if (skill) {
    const absorbed = skill.pierce ? 0 : Math.min(b.block, skill.damage);
    const blocked = absorbed + Math.min(b.block - absorbed, skill.extra);
    const loss = Math.max(0, b.hp - after.battle.hp);
    if (loss || blocked) effects.hits.push({ target: 'enemy', loss, blocked, delay: 0 });
  }
  const enemyActs = action.type === 'end' || action.type === 'emergency' ||
    (action.type === 'skill' && b.used.length === 1 && after.battle.hp > 0);
  if (enemyActs) {
    let block = before.block + (skill?.block || 0) + (action.type === 'emergency' ? 3 : 0), hp = before.hp;
    for (const [i, amount] of b.intent.attacks.entries()) {
      const blocked = Math.min(block, amount), loss = Math.min(hp, amount - blocked);
      block -= blocked; hp -= loss;
      if (loss || blocked) effects.hits.push({ target: 'player', loss, blocked, delay: (effects.hits[0]?.target === 'enemy' ? 260 : 0) + i * 240 });
      if (!hp) break;
    }
  } else if (after.hp < before.hp) {
    effects.hits.push({ target: 'player', loss: before.hp - after.hp, blocked: 0, delay: 0 });
  }
  return effects;
}

const faceTransforms = ['rotateY(0deg)', 'rotateY(90deg)', 'rotateY(180deg)', 'rotateY(-90deg)', 'rotateX(90deg)', 'rotateX(-90deg)'];
const landing = [[0, 0], [0, -90], [0, -180], [0, 90], [-90, 0], [90, 0]];
const glyph = { sword: '⚔', shield: '⬟', fire: '♨' };

/** Cosmetic variation uses browser entropy, never the saved engine RNG. */
function variation() { return crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000; }

export function playEffects(app: HTMLElement, state: State, effects: Effects, quick: boolean): Promise<void> {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const moving = !quick && !reduced;
  if (!effects.hits.length && (!moving || !effects.dice.length)) return Promise.resolve();
  return new Promise(resolve => {
    const nodes: HTMLElement[] = [], animations: Animation[] = [], timers: ReturnType<typeof setTimeout>[] = [];
    const tossing: HTMLElement[] = [];
    let done = false, duration = 0;
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout); animations.forEach(a => a.cancel()); nodes.forEach(n => n.remove());
      tossing.forEach(n => n.classList.remove('is-tossing'));
      document.removeEventListener('visibilitychange', onVisibility);
      resolve();
    };
    const onVisibility = () => { if (document.hidden) finish(); };
    const animate = (el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => animations.push(el.animate(frames, options));
    try {
      if (moving) for (const [index, id] of effects.dice.entries()) {
        const host = app.querySelector<HTMLElement>(`[data-action="die:${id}"]`);
        if (!host) continue;
        const die = state.dice[id], [x, y] = landing[die.faceIndex];
        const flight = document.createElement('span'); flight.className = 'dice-flight'; flight.setAttribute('aria-hidden', 'true');
        const cube = document.createElement('span'); cube.className = 'dice-cube'; cube.dataset.faceIndex = String(die.faceIndex);
        die.faces.forEach((face, i) => {
          const side = document.createElement('span'); side.className = `cube-face ${face}`;
          side.style.transform = `${faceTransforms[i]} translateZ(18px)`; side.textContent = glyph[face]; cube.append(side);
        });
        flight.append(cube); host.append(flight); nodes.push(flight); tossing.push(host); host.classList.add('is-tossing');
        const delay = index * 32, length = 670 + variation() * 100;
        const spinX = (variation() > .5 ? 1 : -1) * 360 * (1 + Math.floor(variation() * 2));
        const spinY = (variation() > .5 ? 1 : -1) * 360 * (1 + Math.floor(variation() * 2));
        const tilt = (variation() - .5) * 70, drift = (variation() - .5) * 22;
        animate(cube, [
          { transform: `rotateX(${x + spinX}deg) rotateY(${y + spinY}deg) rotateZ(${tilt}deg)`, offset: 0 },
          { transform: `rotateX(${x + 22}deg) rotateY(${y - 16}deg) rotateZ(-8deg)`, offset: .7 },
          { transform: `rotateX(${x - 8}deg) rotateY(${y + 6}deg)`, offset: .88 },
          { transform: `rotateX(${x}deg) rotateY(${y}deg)`, offset: 1 }
        ], { duration: length, delay, fill: 'both', easing: 'cubic-bezier(.2,.6,.3,1)' });
        animate(flight, [
          { transform: `translate(${drift}px,-64px) scale(.85)`, offset: 0 },
          { transform: 'translate(0,0) scale(1.04,.94)', offset: .58 },
          { transform: 'translate(0,-13px) scale(.98,1.02)', offset: .73 },
          { transform: 'translate(0,0) scale(1.02,.98)', offset: .88 },
          { transform: 'translate(0,0) scale(1)', offset: 1 }
        ], { duration: length, delay, fill: 'both', easing: 'ease-out' });
        duration = Math.max(duration, length + delay + 60);
      }
      // Without motion, combine multihits into one readable static result per target.
      const hits = moving ? effects.hits : effects.hits.reduce<Hit[]>((all, hit) => {
        const prior = all.find(h => h.target === hit.target);
        if (prior) { prior.loss += hit.loss; prior.blocked += hit.blocked; }
        else all.push({ ...hit });
        return all;
      }, []);
      for (const hit of hits) {
        const delay = moving ? hit.delay : 0, lifetime = quick ? 180 : moving ? 650 : 420;
        duration = Math.max(duration, delay + lifetime);
        timers.push(setTimeout(() => {
          const target = app.querySelector<HTMLElement>(hit.target === 'enemy' ? '.encounter' : '.health');
          if (!target) return;
          target.querySelector('.hit-number')?.remove();
          const number = document.createElement('span'); number.className = `hit-number ${hit.target} ${hit.loss ? 'damage' : 'blocked'}`;
          number.dataset.loss = String(hit.loss); number.dataset.blocked = String(hit.blocked);
          number.textContent = `${hit.loss ? `−${hit.loss}` : ''}${hit.blocked ? `${hit.loss ? ' · ' : ''}格挡 ${hit.blocked}` : ''}`;
          number.setAttribute('aria-hidden', 'true'); target.append(number); nodes.push(number);
          if (moving) {
            animate(number, [{ opacity: 0, transform: 'translateY(7px) scale(.85)' }, { opacity: 1, transform: 'translateY(0) scale(1.08)', offset: .18 }, { opacity: 1, offset: .65 }, { opacity: 0, transform: 'translateY(-18px) scale(1)' }], { duration: lifetime, fill: 'both' });
            const subject = hit.target === 'enemy' ? target.querySelector('.portrait')! : target;
            animate(subject, [{ transform: 'translateX(0)', filter: 'brightness(1)' }, { transform: 'translateX(-6px)', filter: hit.loss ? 'sepia(1) saturate(4) hue-rotate(-35deg) brightness(1.6)' : 'brightness(1.6)', offset: .2 }, { transform: 'translateX(5px)', offset: .4 }, { transform: 'translateX(-2px)', offset: .65 }, { transform: 'translateX(0)', filter: 'brightness(1)' }], { duration: 300 });
            if (hit.target === 'player' && hit.loss) {
              const flash = document.createElement('div'); flash.className = 'player-hit-flash'; flash.setAttribute('aria-hidden', 'true'); app.append(flash); nodes.push(flash);
              animate(flash, [{ opacity: 0 }, { opacity: 1, offset: .18 }, { opacity: 0 }], { duration: 380, fill: 'both' });
            }
          }
        }, delay));
      }
      document.addEventListener('visibilitychange', onVisibility);
      timers.push(setTimeout(finish, duration));
      if (document.hidden) finish();
    } catch { finish(); } // A presentation failure must never lock the saved game.
  });
}
