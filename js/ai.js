// ai.js — Weighted random action selection

// Actions: advance, retreat, light_attack, heavy_attack, block, dodge, recover

export function chooseAction(gladiator, opponent, distance) {
  const s = gladiator.stats;
  const staminaPct = gladiator.stamina / gladiator.maxStamina;
  const hpPct = gladiator.hp / gladiator.maxHp;
  const inRange = distance < 60;
  const closeRange = distance < 40;

  const weights = {
    advance: 10,
    retreat: 5,
    light_attack: 0,
    heavy_attack: 0,
    block: 5,
    dodge: 5,
    recover: 5,
  };

  // Movement
  if (!inRange) {
    weights.advance += 15 + s.aggression;
    weights.retreat -= 3;
  } else {
    weights.advance += s.aggression * 0.5;
    weights.retreat += s.defense * 0.5;
  }

  // Attacks — only if in range
  if (inRange) {
    weights.light_attack = 10 + s.agility + s.aggression * 0.5;
    weights.heavy_attack = 5 + s.strength + s.aggression * 0.5;

    if (closeRange) {
      weights.light_attack += 5;
      weights.heavy_attack += 3;
    }
  }

  // Defensive
  if (inRange) {
    weights.block += s.defense;
    weights.dodge += s.agility * 0.8;
  }

  // Stamina awareness
  if (staminaPct < 0.3) {
    weights.recover += 20;
    weights.heavy_attack *= 0.3;
    weights.light_attack *= 0.5;
    weights.advance *= 0.5;
  } else if (staminaPct < 0.5) {
    weights.recover += 8;
  }

  // Low HP = more desperate
  if (hpPct < 0.3) {
    weights.heavy_attack *= 1.5;
    weights.aggression > 12 ? (weights.advance += 5) : (weights.retreat += 8);
  }

  // React to opponent action
  if (opponent.action === 'heavy_attack' && inRange) {
    weights.dodge += 10;
    weights.block += 8;
    weights.retreat += 5;
  }
  if (opponent.action === 'recover') {
    weights.advance += 8;
    weights.light_attack += 5;
    weights.heavy_attack += 5;
  }

  // Clamp negatives
  for (const k in weights) {
    if (weights[k] < 0) weights[k] = 0;
  }

  return weightedRandom(weights);
}

function weightedRandom(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  if (total === 0) return 'advance';

  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return 'advance';
}
