# Gladiator Arena

Browser-based game where the player describes their gladiator's training in free text, then watches an automated fight play out on a canvas. Online mode features LLM-generated bot opponents that remember past fights and adapt their strategy.

## Running

```bash
pip install fastapi uvicorn
uvicorn server.server:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`.

## Modes

- **Solo**: Write training text, fight a random opponent
- **Online**: LLM bots generate training from memory, adapt after each fight

## Architecture

- **Server** (Python/FastAPI): Combat engine, training parser, WebSocket game streaming
- **Client** (Vanilla JS): Canvas renderer (640x400), stick-figure gladiators, health/stamina HUD
- **Bot Memory** (`bots/*.md`): Per-bot strategy notes rewritten by LLM after each fight

## Key Specs

- 20 ticks/sec, 30-second fights
- 6 stats: strength, agility, endurance, technique, aggression, defense (range 1-20)
- LLM: Claude Haiku via `claude -p` CLI
