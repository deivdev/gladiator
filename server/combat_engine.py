"""Tick-based combat engine + AI."""

import math
import random

TICKS_PER_SEC = 20
FIGHT_DURATION = 30
TOTAL_TICKS = TICKS_PER_SEC * FIGHT_DURATION

ARENA_LEFT = 30
ARENA_RIGHT = 450

ACTION_DURATION = {
    "idle": 1,
    "advance": 6,
    "retreat": 6,
    "light_attack": 8,
    "heavy_attack": 16,
    "block": 12,
    "dodge": 10,
    "recover": 15,
}

STAMINA_COST = {
    "advance": 2,
    "retreat": 2,
    "light_attack": 8,
    "heavy_attack": 18,
    "block": 5,
    "dodge": 10,
    "recover": -25,
}


def create_combat_state(gladiator_a, gladiator_b):
    gladiator_a["x"] = ARENA_LEFT + 60
    gladiator_b["x"] = ARENA_RIGHT - 60
    gladiator_a["facing"] = 1
    gladiator_b["facing"] = -1

    return {
        "tick": 0,
        "totalTicks": TOTAL_TICKS,
        "ticksPerSec": TICKS_PER_SEC,
        "fighters": [gladiator_a, gladiator_b],
        "finished": False,
        "winner": None,
        "stats": [
            {"hits": 0, "crits": 0, "dodges": 0, "blocks": 0, "heavyHits": 0},
            {"hits": 0, "crits": 0, "dodges": 0, "blocks": 0, "heavyHits": 0},
        ],
    }


def apply_action(state, fighter_idx, action):
    """Apply a chosen action to a fighter (stamina, timers, flags)."""
    fighter = state["fighters"][fighter_idx]

    cost = STAMINA_COST.get(action, 0)
    if cost > 0 and fighter["stamina"] < cost:
        fighter["action"] = "recover"
        fighter["actionTimer"] = ACTION_DURATION["recover"]
    else:
        fighter["action"] = action
        fighter["actionTimer"] = ACTION_DURATION.get(action, 6)
        if cost > 0:
            fighter["stamina"] -= cost
        elif cost < 0:
            fighter["stamina"] = min(fighter["maxStamina"], fighter["stamina"] - cost)

    fighter["blockActive"] = action == "block"
    fighter["dodgeActive"] = action == "dodge"


def tick_combat(state):
    if state["finished"]:
        return

    fighters = state["fighters"]
    a, b = fighters

    # Auto-select actions via weighted-random AI
    for i in range(2):
        if fighters[i]["actionTimer"] <= 0 and fighters[i]["staggerTimer"] <= 0:
            dist = abs(a["x"] - b["x"])
            action = choose_action(fighters[i], fighters[1 - i], dist)
            apply_action(state, i, action)

    # Process actions
    for i in range(2):
        fighter = fighters[i]

        if fighter["staggerTimer"] > 0:
            fighter["staggerTimer"] -= 1
            continue

        if fighter["actionTimer"] <= 0:
            continue

        progress = ACTION_DURATION.get(fighter["action"], 6) - fighter["actionTimer"]

        if fighter["action"] == "advance":
            fighter["x"] += fighter["facing"] * 3
        elif fighter["action"] == "retreat":
            fighter["x"] -= fighter["facing"] * 2.5
        elif fighter["action"] == "light_attack":
            if progress == 3:
                resolve_attack(state, i, "light")
        elif fighter["action"] == "heavy_attack":
            if progress == 8:
                resolve_attack(state, i, "heavy")
        elif fighter["action"] == "dodge":
            if progress < 6:
                fighter["x"] -= fighter["facing"] * 2
        elif fighter["action"] == "recover":
            fighter["stamina"] = min(fighter["maxStamina"], fighter["stamina"] + 1.5)

        fighter["actionTimer"] -= 1

    # Clamp positions
    for f in fighters:
        f["x"] = max(ARENA_LEFT, min(ARENA_RIGHT, f["x"]))

    # Passive stamina regen
    for f in fighters:
        if f["action"] != "recover":
            f["stamina"] = min(f["maxStamina"], f["stamina"] + 0.15)

    # Floating text decay
    for f in fighters:
        new_texts = []
        for t in f["floatingTexts"]:
            t["life"] -= 1
            t["y"] -= 0.5
            if t["life"] > 0:
                new_texts.append(t)
        f["floatingTexts"] = new_texts

    state["tick"] += 1

    # Win conditions
    fa, fb = fighters
    if fa["hp"] <= 0 or fb["hp"] <= 0 or state["tick"] >= TOTAL_TICKS:
        state["finished"] = True
        if fa["hp"] <= 0 and fb["hp"] <= 0:
            state["winner"] = None
        elif fa["hp"] <= 0:
            state["winner"] = 1
        elif fb["hp"] <= 0:
            state["winner"] = 0
        else:
            pct_a = fa["hp"] / fa["maxHp"]
            pct_b = fb["hp"] / fb["maxHp"]
            if abs(pct_a - pct_b) < 0.02:
                state["winner"] = None
            else:
                state["winner"] = 0 if pct_a > pct_b else 1


def resolve_attack(state, attacker_idx, attack_type):
    attacker = state["fighters"][attacker_idx]
    defender = state["fighters"][1 - attacker_idx]
    dist = abs(attacker["x"] - defender["x"])

    reach = 65 if attack_type == "heavy" else 55
    if dist > reach:
        return

    a_stats = state["stats"][attacker_idx]
    d_stats = state["stats"][1 - attacker_idx]

    # Dodge check
    if defender["dodgeActive"]:
        dodge_chance = 0.3 + defender["stats"]["agility"] * 0.025
        if random.random() < dodge_chance:
            d_stats["dodges"] += 1
            add_floating_text(defender, "DODGE!", "#44ff44")
            return

    # Block check
    if defender["blockActive"]:
        block_chance = 0.4 + defender["stats"]["defense"] * 0.02
        if random.random() < block_chance:
            if attack_type == "heavy":
                chip = math.floor(attacker["stats"]["strength"] * 0.3)
                defender["hp"] -= chip
                add_floating_text(defender, str(chip), "#ffaa44")
            d_stats["blocks"] += 1
            add_floating_text(defender, "BLOCK!", "#4488ff")
            defender["staggerTimer"] = 3
            return

    # Calculate damage
    if attack_type == "light":
        dmg = 5 + attacker["stats"]["strength"] * 0.8 + random.random() * 4
    else:
        dmg = 12 + attacker["stats"]["strength"] * 1.5 + random.random() * 6
        a_stats["heavyHits"] += 1

    # Crit check
    crit_chance = 0.05 + attacker["stats"]["technique"] * 0.02
    crit = False
    if random.random() < crit_chance:
        dmg *= 1.8
        crit = True
        a_stats["crits"] += 1

    dmg = math.floor(dmg)
    defender["hp"] = max(0, defender["hp"] - dmg)
    a_stats["hits"] += 1

    if crit:
        add_floating_text(defender, f"CRIT {dmg}!", "#ff4444")
        defender["staggerTimer"] = 6
    else:
        add_floating_text(defender, str(dmg), "#ffffff")
        defender["staggerTimer"] = 3


def add_floating_text(fighter, text, color):
    fighter["floatingTexts"].append({
        "text": text,
        "color": color,
        "y": -30,
        "life": 30,
        "offsetX": (random.random() - 0.5) * 20,
    })


# --- AI: weighted random action selection ---

def choose_action(gladiator, opponent, distance):
    s = gladiator["stats"]
    stamina_pct = gladiator["stamina"] / gladiator["maxStamina"]
    hp_pct = gladiator["hp"] / gladiator["maxHp"]
    in_range = distance < 60
    close_range = distance < 40

    weights = {
        "advance": 10,
        "retreat": 5,
        "light_attack": 0,
        "heavy_attack": 0,
        "block": 5,
        "dodge": 5,
        "recover": 5,
    }

    if not in_range:
        weights["advance"] += 15 + s["aggression"]
        weights["retreat"] -= 3
    else:
        weights["advance"] += s["aggression"] * 0.5
        weights["retreat"] += s["defense"] * 0.5

    if in_range:
        weights["light_attack"] = 10 + s["agility"] + s["aggression"] * 0.5
        weights["heavy_attack"] = 5 + s["strength"] + s["aggression"] * 0.5
        if close_range:
            weights["light_attack"] += 5
            weights["heavy_attack"] += 3

    if in_range:
        weights["block"] += s["defense"]
        weights["dodge"] += s["agility"] * 0.8

    if stamina_pct < 0.3:
        weights["recover"] += 20
        weights["heavy_attack"] *= 0.3
        weights["light_attack"] *= 0.5
        weights["advance"] *= 0.5
    elif stamina_pct < 0.5:
        weights["recover"] += 8

    if hp_pct < 0.3:
        weights["heavy_attack"] *= 1.5
        if s["aggression"] > 12:
            weights["advance"] += 5
        else:
            weights["retreat"] += 8

    if opponent["action"] == "heavy_attack" and in_range:
        weights["dodge"] += 10
        weights["block"] += 8
        weights["retreat"] += 5
    if opponent["action"] == "recover":
        weights["advance"] += 8
        weights["light_attack"] += 5
        weights["heavy_attack"] += 5

    for k in weights:
        if weights[k] < 0:
            weights[k] = 0

    return weighted_random(weights)


def weighted_random(weights):
    total = sum(weights.values())
    if total == 0:
        return "advance"

    r = random.random() * total
    for k, v in weights.items():
        r -= v
        if r <= 0:
            return k
    return "advance"
