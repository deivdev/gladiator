// training.js — Text parser → hidden stat generation

import { createGladiator } from './gladiator.js';

// keyword → stat boosts (primary +3, secondary +1..+2)
const KEYWORDS = {
  // Weapons
  sword:    { technique: 3, strength: 1 },
  axe:      { strength: 3, aggression: 1 },
  spear:    { agility: 2, technique: 2 },
  dagger:   { agility: 3, technique: 1 },
  shield:   { defense: 3, endurance: 1 },
  trident:  { technique: 2, agility: 2 },
  mace:     { strength: 3, endurance: 1 },
  hammer:   { strength: 3, aggression: 1 },
  bow:      { agility: 2, technique: 2 },
  net:      { technique: 3, agility: 1 },

  // Training styles
  aggressive: { aggression: 3, strength: 1 },
  defensive:  { defense: 3, endurance: 1 },
  patient:    { defense: 2, technique: 2 },
  berserker:  { aggression: 3, strength: 2, defense: -2 },
  balanced:   { technique: 2, defense: 1, agility: 1 },
  brutal:     { strength: 3, aggression: 2, technique: -1 },
  cunning:    { technique: 3, agility: 1 },
  reckless:   { aggression: 3, strength: 1, defense: -1 },
  cautious:   { defense: 2, endurance: 2 },
  swift:      { agility: 3, technique: 1 },

  // Physical
  run:       { agility: 3, endurance: 1 },
  sprint:    { agility: 3 },
  strong:    { strength: 3 },
  strength:  { strength: 3 },
  endure:    { endurance: 3 },
  endurance: { endurance: 3 },
  flexible:  { agility: 2, technique: 1 },
  tough:     { endurance: 3, defense: 1 },
  fast:      { agility: 3 },
  quick:     { agility: 2, technique: 1 },
  muscle:    { strength: 3, endurance: 1 },
  power:     { strength: 2, aggression: 1 },
  dodge:     { agility: 3, defense: 1 },
  block:     { defense: 3 },
  parry:     { technique: 3, defense: 1 },
  train:     { endurance: 1, strength: 1 },
  fight:     { aggression: 2, strength: 1 },
  wrestle:   { strength: 2, endurance: 2 },

  // Easter eggs
  spartacus: { strength: 2, aggression: 2, endurance: 2 },
  achilles:  { agility: 3, technique: 2, defense: -1 },
  turtle:    { defense: 4, agility: -2 },
  tiger:     { aggression: 3, agility: 2 },
  arena:     { aggression: 1, endurance: 1 },
  gladiator: { strength: 1, technique: 1, aggression: 1 },
  death:     { aggression: 3, technique: 1 },
  glory:     { aggression: 2, endurance: 1 },
  blood:     { aggression: 2, strength: 1 },
  rage:      { aggression: 3, strength: 1, technique: -1 },
};

export function parseTrainingText(text) {
  const stats = { strength: 10, agility: 10, endurance: 10, technique: 10, aggression: 10, defense: 10 };

  const lower = text.toLowerCase();
  const words = lower.split(/\W+/).filter(Boolean);
  let matchCount = 0;

  // Scan for keywords
  for (const word of words) {
    const boosts = KEYWORDS[word];
    if (!boosts) continue;
    matchCount++;
    for (const [stat, delta] of Object.entries(boosts)) {
      stats[stat] += delta;
    }
  }

  // Stochastic noise
  const STAT_NAMES = Object.keys(stats);
  if (matchCount === 0) {
    // No keywords → bigger chaos
    for (const s of STAT_NAMES) {
      stats[s] += Math.floor(Math.random() * 9) - 3; // -3 to +5
    }
  } else {
    // Normal noise
    for (const s of STAT_NAMES) {
      stats[s] += Math.floor(Math.random() * 5) - 2; // -2 to +2
    }
  }

  // Longer text = small bonus to random stats
  const lengthBonus = Math.floor(text.length / 50);
  for (let i = 0; i < lengthBonus; i++) {
    const rs = STAT_NAMES[Math.floor(Math.random() * STAT_NAMES.length)];
    stats[rs] += 1;
  }

  // Clamp all stats 1-20
  for (const s of STAT_NAMES) {
    stats[s] = Math.max(1, Math.min(20, stats[s]));
  }

  return stats;
}

export function trainGladiator(name, text) {
  const stats = parseTrainingText(text);
  return createGladiator(name, stats);
}
