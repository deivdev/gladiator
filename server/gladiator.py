"""Gladiator data model — Python port of js/gladiator.js"""

import random

STAT_NAMES = ["strength", "agility", "endurance", "technique", "aggression", "defense"]

OPPONENT_NAMES = [
    "Brutus", "Maximus", "Thraex", "Cassius", "Decimus",
    "Varro", "Gaius", "Lucius", "Titus", "Nero",
    "Flavius", "Crixus", "Spartacus", "Commodus", "Retiarius",
    "Draco", "Ferox", "Magnus", "Primus", "Severus",
]


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def create_gladiator(name, stats):
    s = {}
    for n in STAT_NAMES:
        s[n] = clamp(stats.get(n, 10), 1, 20)

    max_hp = s["endurance"] * 5 + 50
    max_stamina = 100

    return {
        "name": name,
        "stats": s,
        "hp": max_hp,
        "maxHp": max_hp,
        "stamina": max_stamina,
        "maxStamina": max_stamina,
        "x": 0,
        "facing": 1,
        "action": "idle",
        "actionTimer": 0,
        "blockActive": False,
        "dodgeActive": False,
        "hitCooldown": 0,
        "staggerTimer": 0,
        "floatingTexts": [],
    }


def create_random_opponent():
    stats = {}
    for n in STAT_NAMES:
        stats[n] = 10 + random.randint(0, 6) - 3  # 7..13
    name = random.choice(OPPONENT_NAMES)
    return create_gladiator(name, stats)
