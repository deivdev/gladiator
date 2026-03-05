"""FastAPI WebSocket server — matchmaking + server-side combat + bot memory."""

import asyncio
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .training_parser import train_gladiator
from .combat_engine import create_combat_state, tick_combat

app = FastAPI()

# --- Config ---
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BOTS_DIR = PROJECT_ROOT / "bots"

# LLM command: list of [executable, ...flags] that accepts a prompt as the last arg.
# Swap this to use a different CLI (e.g. ["ollama", "run", "llama3"]).
LLM_CMD = ["claude", "-p", "--model", "claude-haiku-4-5-20251001"]
LLM_TIMEOUT = 60

# --- Static file serving ---

@app.get("/")
async def index():
    return FileResponse(PROJECT_ROOT / "index.html")

app.mount("/js", StaticFiles(directory=PROJECT_ROOT / "js"), name="js")

# --- Bot memory management ---

BOTS_DIR.mkdir(exist_ok=True)


def sanitize_nickname(name: str) -> str:
    """Sanitize nickname to a safe filename component."""
    name = name.strip()[:20]
    # Keep only alphanumeric, dash, underscore
    name = re.sub(r"[^a-zA-Z0-9_-]", "", name)
    return name.lower() or "unnamed"


def load_bot_memory(nickname: str) -> str:
    """Read bot's memory file, or return empty string if it doesn't exist."""
    path = BOTS_DIR / f"{nickname}.md"
    if path.exists():
        return path.read_text()
    return ""


def save_fight_result(nickname: str, result_data: dict):
    """Append a fight result to the bot's memory file."""
    path = BOTS_DIR / f"{nickname}.md"

    # Count existing fights to get fight number
    fight_num = 1
    if path.exists():
        content = path.read_text()
        fight_num = content.count("### Fight ") + 1
    else:
        # Create new bot file
        content = f"# {nickname}\n\nCreated: {datetime.now(timezone.utc).strftime('%Y-%m-%d')}\n\n## Strategy Notes\n\nNo fights yet.\n\n## Fight Log\n"

    outcome = result_data["outcome"]  # WIN, LOSS, DRAW
    opponent = result_data["opponent"]
    training = result_data["training_text"]
    my_hp = result_data["my_hp"]
    my_max_hp = result_data["my_max_hp"]
    their_hp = result_data["their_hp"]
    their_max_hp = result_data["their_max_hp"]
    my_stats = result_data["my_stats"]
    their_stats = result_data["their_stats"]

    entry = (
        f"\n### Fight {fight_num} — vs {opponent} — {outcome}\n"
        f"- Training: \"{training}\"\n"
        f"- My HP: {my_hp}/{my_max_hp} | Their HP: {their_hp}/{their_max_hp}\n"
        f"- My hits: {my_stats['hits']} | Crits: {my_stats['crits']} | Heavy: {my_stats['heavyHits']}\n"
        f"- Their dodges: {their_stats['dodges']} | Their blocks: {their_stats['blocks']}\n"
    )

    content += entry
    path.write_text(content)


def parse_bot_record(nickname: str) -> dict:
    """Parse a bot file and return win/loss/draw counts."""
    path = BOTS_DIR / f"{nickname}.md"
    wins = losses = draws = 0
    if path.exists():
        content = path.read_text()
        wins = content.count(" — WIN\n")
        losses = content.count(" — LOSS\n")
        draws = content.count(" — DRAW\n")
    return {"nickname": nickname, "wins": wins, "losses": losses, "draws": draws}


# --- GET /api/bots ---

@app.get("/api/bots")
async def list_bots():
    bots = []
    if BOTS_DIR.exists():
        for f in sorted(BOTS_DIR.glob("*.md")):
            nickname = f.stem
            bots.append(parse_bot_record(nickname))
    return JSONResponse(bots)


# --- LLM spawning ---

BOT_PROMPT = """You are a gladiator bot named "{nickname}" in the Gladiator Arena game.

Your training text (max 200 characters) gets parsed for keywords that boost your stats.
Keywords: sword→technique+3, axe→strength+3, spear→agility+2/technique+2,
dagger→agility+3, shield→defense+3, mace→strength+3, hammer→strength+3,
aggressive→aggression+3, defensive→defense+3, berserker→aggression+3/strength+2/defense-2,
swift→agility+3, brutal→strength+3/aggression+2, cunning→technique+3,
run→agility+3, strong→strength+3, endurance→endurance+3, tough→endurance+3/defense+1,
dodge→agility+3/defense+1, block→defense+3, parry→technique+3/defense+1,
muscle→strength+3/endurance+1, fight→aggression+2/strength+1

Base stats are all 10. Higher aggression = more attacks. Higher defense = more blocking.
Higher agility = more dodging. Higher strength = more damage. Higher endurance = more HP.
Repeating a keyword does NOT stack — each keyword only counts once. Pack as many DIFFERENT keywords as possible.

Here is your full memory (strategy notes + fight history):
---
{memory_contents}
---

{user_prompt}

Use your strategy notes and fight history to pick the best training. Adapt based on past results.
Output ONLY the training text (max 200 chars). No explanation, no quotes, no markdown."""


async def spawn_llm(nickname: str, memory: str, user_prompt: str = "") -> str:
    """Run LLM_CMD to generate training text for a bot."""
    memory_contents = memory or "This is your first fight. You have no memory yet."
    user_section = f"Your owner says: {user_prompt}" if user_prompt else ""
    prompt = BOT_PROMPT.format(
        nickname=nickname,
        memory_contents=memory_contents,
        user_prompt=user_section,
    )

    proc = await asyncio.create_subprocess_exec(
        *LLM_CMD, prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=LLM_TIMEOUT)
        text = stdout.decode().strip()[:200]
        # Strip wrapping quotes the model might add
        if len(text) >= 2 and text[0] in "\"'" and text[-1] == text[0]:
            text = text[1:-1]
        return text if text else "fight with strength and courage"
    except asyncio.TimeoutError:
        proc.kill()
        return "train hard fight harder"


# --- Post-fight reflection ---

REFLECTION_PROMPT = """You are a gladiator bot named "{nickname}". You just finished a fight.

Here is your current memory:
---
{memory_contents}
---

Fight result:
- Outcome: {outcome} vs {opponent}
- Training used: "{training_text}"
- My HP: {my_hp}/{my_max_hp} | Their HP: {their_hp}/{their_max_hp}
- My hits: {my_hits} | Crits: {my_crits} | Heavy hits: {my_heavy}
- Their dodges: {their_dodges} | Their blocks: {their_blocks}

Analyze what happened and write updated Strategy Notes. Consider:
- What keywords/stats worked well or poorly?
- What should you try differently next time?
- Any patterns across multiple fights?

Output ONLY the new Strategy Notes section content (2-5 short bullet points). No heading, no markdown headers, just the bullet points."""


async def reflect_on_fight(nickname: str, result_data: dict):
    """Call LLM once after a fight to update the bot's Strategy Notes."""
    memory = load_bot_memory(nickname)
    if not memory:
        return

    outcome = result_data["outcome"]
    prompt = REFLECTION_PROMPT.format(
        nickname=nickname,
        memory_contents=memory,
        outcome=outcome,
        opponent=result_data["opponent"],
        training_text=result_data["training_text"],
        my_hp=result_data["my_hp"],
        my_max_hp=result_data["my_max_hp"],
        their_hp=result_data["their_hp"],
        their_max_hp=result_data["their_max_hp"],
        my_hits=result_data["my_stats"]["hits"],
        my_crits=result_data["my_stats"]["crits"],
        my_heavy=result_data["my_stats"]["heavyHits"],
        their_dodges=result_data["their_stats"]["dodges"],
        their_blocks=result_data["their_stats"]["blocks"],
    )

    proc = await asyncio.create_subprocess_exec(
        *LLM_CMD, prompt,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=LLM_TIMEOUT)
        notes = stdout.decode().strip()
        if notes:
            update_strategy_notes(nickname, notes)
    except asyncio.TimeoutError:
        proc.kill()


def update_strategy_notes(nickname: str, new_notes: str):
    """Replace the Strategy Notes section in the bot's memory file."""
    path = BOTS_DIR / f"{nickname}.md"
    if not path.exists():
        return

    content = path.read_text()
    # Find and replace the Strategy Notes section
    marker_start = "## Strategy Notes\n"
    marker_end = "\n## Fight Log\n"

    start_idx = content.find(marker_start)
    end_idx = content.find(marker_end)

    if start_idx == -1 or end_idx == -1:
        return

    new_content = (
        content[:start_idx + len(marker_start)]
        + "\n" + new_notes + "\n"
        + content[end_idx:]
    )
    path.write_text(new_content)


# --- Matchmaking ---

queue: list[tuple[WebSocket, dict]] = []  # (ws, join_data)
fights: dict[WebSocket, asyncio.Task] = {}  # ws -> fight task


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        raw = await ws.receive_text()
        msg = json.loads(raw)
        if msg.get("type") != "join":
            await ws.close()
            return

        nickname = sanitize_nickname(str(msg.get("nickname", "")))
        user_prompt = str(msg.get("prompt", ""))[:500]
        if not nickname:
            await ws.close()
            return

        # Tell client we're thinking
        await ws.send_text(json.dumps({"type": "thinking"}))

        # Spawn LLM to generate training text
        memory = load_bot_memory(nickname)
        training_text = await spawn_llm(nickname, memory, user_prompt)

        # Tell client what LLM chose
        await ws.send_text(json.dumps({"type": "trained", "text": training_text}))

        # Check if there's someone waiting
        if queue:
            other_ws, other_data = queue.pop(0)
            await start_match(
                ws, nickname, training_text,
                other_ws, other_data["nickname"], other_data["text"],
            )
        else:
            queue.append((ws, {"nickname": nickname, "text": training_text}))
            await ws.send_text(json.dumps({"type": "queued"}))

        # Keep the handler alive until the fight finishes so Starlette
        # doesn't close the WebSocket when the coroutine returns.
        while True:
            await asyncio.sleep(0.5)
            if ws in fights:
                await fights[ws]
                return
    except WebSocketDisconnect:
        handle_disconnect(ws)
    except Exception:
        handle_disconnect(ws)


def handle_disconnect(ws: WebSocket):
    # Remove from queue if waiting
    for i, (qws, _) in enumerate(queue):
        if qws is ws:
            queue.pop(i)
            return

    # Cancel fight if in progress
    task = fights.pop(ws, None)
    if task and not task.done():
        task.cancel()


async def start_match(ws_a, name_a, text_a, ws_b, name_b, text_b):
    glad_a = train_gladiator(name_a, text_a)
    glad_b = train_gladiator(name_b, text_b)

    # Tell both clients they're matched
    # ws_b joined first (was in queue), ws_a joined second
    # ws_b = player 0, ws_a = player 1
    try:
        await ws_b.send_text(json.dumps({
            "type": "matched", "you": 0,
            "player_name": name_b, "opponent_name": name_a,
        }))
    except Exception:
        pass
    try:
        await ws_a.send_text(json.dumps({
            "type": "matched", "you": 1,
            "player_name": name_a, "opponent_name": name_b,
        }))
    except Exception:
        pass

    state = create_combat_state(glad_a, glad_b)

    # Store metadata for result saving
    state["_meta"] = {
        "names": [name_b, name_a],      # index 0 = ws_b, index 1 = ws_a
        "texts": [text_b, text_a],
    }

    task = asyncio.create_task(run_fight(state, ws_b, ws_a))
    fights[ws_a] = task
    fights[ws_b] = task


async def run_fight(state, ws_0, ws_1):
    """Tick loop: built-in AI selects actions, server ticks combat."""
    sockets = [ws_0, ws_1]
    tick_interval = 1.0 / state["ticksPerSec"]

    try:
        while not state["finished"]:
            await asyncio.sleep(tick_interval)
            tick_combat(state)
            snapshot = build_snapshot(state)
            await broadcast(sockets, json.dumps(snapshot))

        # Send final result
        result = {
            "type": "result",
            "winner": state["winner"],
            "stats": state["stats"],
            "fighters": serialize_fighters(state["fighters"]),
        }
        await broadcast(sockets, json.dumps(result))

        # Save fight results and run post-fight reflection
        result_data_list = save_fight_results(state)
        # Run reflections in parallel for both bots
        await asyncio.gather(*[
            reflect_on_fight(rd["nickname"], rd) for rd in result_data_list
        ])
    except asyncio.CancelledError:
        for ws in sockets:
            try:
                await ws.send_text(json.dumps({
                    "type": "result",
                    "winner": 0,
                    "stats": state["stats"],
                    "fighters": serialize_fighters(state["fighters"]),
                    "disconnect": True,
                }))
            except Exception:
                pass
    finally:
        fights.pop(ws_0, None)
        fights.pop(ws_1, None)


def save_fight_results(state):
    """Save fight outcome to both bots' memory files. Returns result data for reflection."""
    meta = state.get("_meta")
    if not meta:
        return []

    names = meta["names"]
    texts = meta["texts"]
    winner = state["winner"]
    fighters = state["fighters"]
    stats = state["stats"]

    result_data_list = []
    for i in range(2):
        j = 1 - i
        if winner is None:
            outcome = "DRAW"
        elif winner == i:
            outcome = "WIN"
        else:
            outcome = "LOSS"

        rd = {
            "nickname": names[i],
            "outcome": outcome,
            "opponent": names[j],
            "training_text": texts[i],
            "my_hp": max(0, math.floor(fighters[i]["hp"])),
            "my_max_hp": fighters[i]["maxHp"],
            "their_hp": max(0, math.floor(fighters[j]["hp"])),
            "their_max_hp": fighters[j]["maxHp"],
            "my_stats": stats[i],
            "their_stats": stats[j],
        }
        save_fight_result(names[i], rd)
        result_data_list.append(rd)

    return result_data_list


def build_snapshot(state):
    return {
        "type": "tick",
        "tick": state["tick"],
        "totalTicks": state["totalTicks"],
        "ticksPerSec": state["ticksPerSec"],
        "finished": state["finished"],
        "winner": state["winner"],
        "fighters": serialize_fighters(state["fighters"]),
    }


def serialize_fighters(fighters):
    result = []
    for f in fighters:
        result.append({
            "name": f["name"],
            "hp": f["hp"],
            "maxHp": f["maxHp"],
            "stamina": f["stamina"],
            "maxStamina": f["maxStamina"],
            "x": f["x"],
            "facing": f["facing"],
            "action": f["action"],
            "actionTimer": f["actionTimer"],
            "blockActive": f["blockActive"],
            "dodgeActive": f["dodgeActive"],
            "staggerTimer": f["staggerTimer"],
            "floatingTexts": f["floatingTexts"],
        })
    return result


async def broadcast(sockets, payload):
    for ws in sockets:
        try:
            await ws.send_text(payload)
        except Exception:
            pass
