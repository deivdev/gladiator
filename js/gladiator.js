// gladiator.js — Data model

const STAT_NAMES = ['strength', 'agility', 'endurance', 'technique', 'aggression', 'defense'];

export function createGladiator(name, stats) {
  const s = {};
  for (const n of STAT_NAMES) s[n] = clamp(stats[n] ?? 10, 1, 20);

  const maxHp = s.endurance * 5 + 50;
  const maxStamina = 100;

  return {
    name,
    stats: s,
    hp: maxHp,
    maxHp,
    stamina: maxStamina,
    maxStamina,
    x: 0,
    facing: 1,          // 1 = right, -1 = left
    action: 'idle',
    actionTimer: 0,     // ticks remaining in current action
    blockActive: false,
    dodgeActive: false,
    hitCooldown: 0,
    staggerTimer: 0,
    floatingTexts: [],
  };
}

const OPPONENT_NAMES = [
  'Brutus', 'Maximus', 'Thraex', 'Cassius', 'Decimus',
  'Varro', 'Gaius', 'Lucius', 'Titus', 'Nero',
  'Flavius', 'Crixus', 'Spartacus', 'Commodus', 'Retiarius',
  'Draco', 'Ferox', 'Magnus', 'Primus', 'Severus',
];

export function createRandomOpponent() {
  const stats = {};
  for (const n of STAT_NAMES) {
    stats[n] = 10 + Math.floor(Math.random() * 7) - 3; // 7..13
  }
  const name = OPPONENT_NAMES[Math.floor(Math.random() * OPPONENT_NAMES.length)];
  return createGladiator(name, stats);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
