"""Training text parser — Python port of js/training.js"""

import random
import re
from .gladiator import create_gladiator

KEYWORDS = {
    # Weapons
    "sword":    {"technique": 3, "strength": 1},
    "axe":      {"strength": 3, "aggression": 1},
    "spear":    {"agility": 2, "technique": 2},
    "dagger":   {"agility": 3, "technique": 1},
    "shield":   {"defense": 3, "endurance": 1},
    "trident":  {"technique": 2, "agility": 2},
    "mace":     {"strength": 3, "endurance": 1},
    "hammer":   {"strength": 3, "aggression": 1},
    "bow":      {"agility": 2, "technique": 2},
    "net":      {"technique": 3, "agility": 1},
    # Training styles
    "aggressive": {"aggression": 3, "strength": 1},
    "defensive":  {"defense": 3, "endurance": 1},
    "patient":    {"defense": 2, "technique": 2},
    "berserker":  {"aggression": 3, "strength": 2, "defense": -2},
    "balanced":   {"technique": 2, "defense": 1, "agility": 1},
    "brutal":     {"strength": 3, "aggression": 2, "technique": -1},
    "cunning":    {"technique": 3, "agility": 1},
    "reckless":   {"aggression": 3, "strength": 1, "defense": -1},
    "cautious":   {"defense": 2, "endurance": 2},
    "swift":      {"agility": 3, "technique": 1},
    # Physical
    "run":       {"agility": 3, "endurance": 1},
    "sprint":    {"agility": 3},
    "strong":    {"strength": 3},
    "strength":  {"strength": 3},
    "endure":    {"endurance": 3},
    "endurance": {"endurance": 3},
    "flexible":  {"agility": 2, "technique": 1},
    "tough":     {"endurance": 3, "defense": 1},
    "fast":      {"agility": 3},
    "quick":     {"agility": 2, "technique": 1},
    "muscle":    {"strength": 3, "endurance": 1},
    "power":     {"strength": 2, "aggression": 1},
    "dodge":     {"agility": 3, "defense": 1},
    "block":     {"defense": 3},
    "parry":     {"technique": 3, "defense": 1},
    "train":     {"endurance": 1, "strength": 1},
    "fight":     {"aggression": 2, "strength": 1},
    "wrestle":   {"strength": 2, "endurance": 2},
    # Easter eggs
    "spartacus": {"strength": 2, "aggression": 2, "endurance": 2},
    "achilles":  {"agility": 3, "technique": 2, "defense": -1},
    "turtle":    {"defense": 4, "agility": -2},
    "tiger":     {"aggression": 3, "agility": 2},
    "arena":     {"aggression": 1, "endurance": 1},
    "gladiator": {"strength": 1, "technique": 1, "aggression": 1},
    "death":     {"aggression": 3, "technique": 1},
    "glory":     {"aggression": 2, "endurance": 1},
    "blood":     {"aggression": 2, "strength": 1},
    "rage":      {"aggression": 3, "strength": 1, "technique": -1},
}

STAT_NAMES = ["strength", "agility", "endurance", "technique", "aggression", "defense"]


def parse_training_text(text):
    stats = {s: 10 for s in STAT_NAMES}

    lower = text.lower()
    words = [w for w in re.split(r"\W+", lower) if w]
    match_count = 0

    for word in words:
        boosts = KEYWORDS.get(word)
        if not boosts:
            continue
        match_count += 1
        for stat, delta in boosts.items():
            stats[stat] += delta

    # Stochastic noise
    if match_count == 0:
        for s in STAT_NAMES:
            stats[s] += random.randint(0, 8) - 3  # -3 to +5
    else:
        for s in STAT_NAMES:
            stats[s] += random.randint(0, 4) - 2  # -2 to +2

    # Longer text = small bonus to random stats
    length_bonus = len(text) // 50
    for _ in range(length_bonus):
        rs = random.choice(STAT_NAMES)
        stats[rs] += 1

    # Clamp all stats 1-20
    for s in STAT_NAMES:
        stats[s] = max(1, min(20, stats[s]))

    return stats


def train_gladiator(name, text):
    stats = parse_training_text(text)
    return create_gladiator(name, stats)
