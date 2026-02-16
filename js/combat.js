// combat.js — Tick-based fight engine

import { chooseAction } from './ai.js';

const TICKS_PER_SEC = 20;
const FIGHT_DURATION = 30;
const TOTAL_TICKS = TICKS_PER_SEC * FIGHT_DURATION;

const ARENA_LEFT = 30;
const ARENA_RIGHT = 450;

// Action durations in ticks
const ACTION_DURATION = {
  idle: 1,
  advance: 6,
  retreat: 6,
  light_attack: 8,
  heavy_attack: 16,
  block: 12,
  dodge: 10,
  recover: 15,
};

// Stamina costs
const STAMINA_COST = {
  advance: 2,
  retreat: 2,
  light_attack: 8,
  heavy_attack: 18,
  block: 5,
  dodge: 10,
  recover: -25,
};

export function createCombatState(gladiatorA, gladiatorB) {
  gladiatorA.x = ARENA_LEFT + 60;
  gladiatorB.x = ARENA_RIGHT - 60;
  gladiatorA.facing = 1;
  gladiatorB.facing = -1;

  return {
    tick: 0,
    totalTicks: TOTAL_TICKS,
    ticksPerSec: TICKS_PER_SEC,
    fighters: [gladiatorA, gladiatorB],
    log: [],
    finished: false,
    winner: null,        // null = draw, 0 or 1
    stats: [
      { hits: 0, crits: 0, dodges: 0, blocks: 0, heavyHits: 0 },
      { hits: 0, crits: 0, dodges: 0, blocks: 0, heavyHits: 0 },
    ],
  };
}

export function tickCombat(state) {
  if (state.finished) return;

  const [a, b] = state.fighters;

  // Decide new actions
  for (let i = 0; i < 2; i++) {
    const fighter = state.fighters[i];
    const opponent = state.fighters[1 - i];
    if (fighter.actionTimer <= 0 && fighter.staggerTimer <= 0) {
      const dist = Math.abs(a.x - b.x);
      const action = chooseAction(fighter, opponent, dist);

      // Check stamina
      const cost = STAMINA_COST[action] || 0;
      if (cost > 0 && fighter.stamina < cost) {
        fighter.action = 'recover';
        fighter.actionTimer = ACTION_DURATION.recover;
      } else {
        fighter.action = action;
        fighter.actionTimer = ACTION_DURATION[action] || 6;
        if (cost > 0) fighter.stamina -= cost;
        else if (cost < 0) fighter.stamina = Math.min(fighter.maxStamina, fighter.stamina - cost);
      }

      fighter.blockActive = action === 'block';
      fighter.dodgeActive = action === 'dodge';
    }
  }

  // Process actions
  for (let i = 0; i < 2; i++) {
    const fighter = state.fighters[i];
    const opponent = state.fighters[1 - i];

    if (fighter.staggerTimer > 0) {
      fighter.staggerTimer--;
      continue;
    }

    if (fighter.actionTimer <= 0) continue;

    const progress = ACTION_DURATION[fighter.action] - fighter.actionTimer;

    switch (fighter.action) {
      case 'advance':
        fighter.x += fighter.facing * 3;
        break;
      case 'retreat':
        fighter.x -= fighter.facing * 2.5;
        break;
      case 'light_attack':
        if (progress === 3) resolveAttack(state, i, 'light');
        break;
      case 'heavy_attack':
        if (progress === 8) resolveAttack(state, i, 'heavy');
        break;
      case 'dodge':
        if (progress < 6) fighter.x -= fighter.facing * 2;
        break;
      case 'recover':
        fighter.stamina = Math.min(fighter.maxStamina, fighter.stamina + 1.5);
        break;
    }

    fighter.actionTimer--;
  }

  // Clamp positions
  for (const f of state.fighters) {
    f.x = Math.max(ARENA_LEFT, Math.min(ARENA_RIGHT, f.x));
  }

  // Passive stamina regen
  for (const f of state.fighters) {
    if (f.action !== 'recover') {
      f.stamina = Math.min(f.maxStamina, f.stamina + 0.15);
    }
  }

  // Hit cooldowns
  for (const f of state.fighters) {
    if (f.hitCooldown > 0) f.hitCooldown--;
  }

  // Floating text decay
  for (const f of state.fighters) {
    f.floatingTexts = f.floatingTexts
      .map(t => ({ ...t, life: t.life - 1, y: t.y - 0.5 }))
      .filter(t => t.life > 0);
  }

  state.tick++;

  // Win conditions
  const [fa, fb] = state.fighters;
  if (fa.hp <= 0 || fb.hp <= 0 || state.tick >= TOTAL_TICKS) {
    state.finished = true;
    if (fa.hp <= 0 && fb.hp <= 0) {
      state.winner = null;
    } else if (fa.hp <= 0) {
      state.winner = 1;
    } else if (fb.hp <= 0) {
      state.winner = 0;
    } else {
      // Timeout — compare HP%
      const pctA = fa.hp / fa.maxHp;
      const pctB = fb.hp / fb.maxHp;
      if (Math.abs(pctA - pctB) < 0.02) state.winner = null;
      else state.winner = pctA > pctB ? 0 : 1;
    }
  }
}

function resolveAttack(state, attackerIdx, type) {
  const attacker = state.fighters[attackerIdx];
  const defender = state.fighters[1 - attackerIdx];
  const dist = Math.abs(attacker.x - defender.x);

  const reach = type === 'heavy' ? 65 : 55;
  if (dist > reach) return;

  const aStats = state.stats[attackerIdx];
  const dStats = state.stats[1 - attackerIdx];

  // Dodge check
  if (defender.dodgeActive) {
    const dodgeChance = 0.3 + defender.stats.agility * 0.025;
    if (Math.random() < dodgeChance) {
      dStats.dodges++;
      addFloatingText(defender, 'DODGE!', '#44ff44');
      return;
    }
  }

  // Block check
  if (defender.blockActive) {
    const blockChance = 0.4 + defender.stats.defense * 0.02;
    if (Math.random() < blockChance) {
      // Partial damage on heavy attack through block
      if (type === 'heavy') {
        const chip = Math.floor(attacker.stats.strength * 0.3);
        defender.hp -= chip;
        addFloatingText(defender, `${chip}`, '#ffaa44');
      }
      dStats.blocks++;
      addFloatingText(defender, 'BLOCK!', '#4488ff');
      defender.staggerTimer = 3;
      return;
    }
  }

  // Calculate damage
  let dmg;
  if (type === 'light') {
    dmg = 5 + attacker.stats.strength * 0.8 + Math.random() * 4;
  } else {
    dmg = 12 + attacker.stats.strength * 1.5 + Math.random() * 6;
    aStats.heavyHits++;
  }

  // Crit check
  const critChance = 0.05 + attacker.stats.technique * 0.02;
  let crit = false;
  if (Math.random() < critChance) {
    dmg *= 1.8;
    crit = true;
    aStats.crits++;
  }

  dmg = Math.floor(dmg);
  defender.hp = Math.max(0, defender.hp - dmg);
  aStats.hits++;

  if (crit) {
    addFloatingText(defender, `CRIT ${dmg}!`, '#ff4444');
    defender.staggerTimer = 6;
  } else {
    addFloatingText(defender, `${dmg}`, '#ffffff');
    defender.staggerTimer = 3;
  }
}

function addFloatingText(fighter, text, color) {
  fighter.floatingTexts.push({
    text,
    color,
    y: -30,
    life: 30,
    offsetX: (Math.random() - 0.5) * 20,
  });
}
