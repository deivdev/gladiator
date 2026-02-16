# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Gladiator Arena — a browser-based game where the player describes their gladiator's training in free text, which is parsed into hidden stats via keyword matching, then watches an automated fight play out on a canvas.

## Running

No build step. Open `index.html` directly in a browser or serve with any static server (e.g. `python3 -m http.server`). Uses vanilla JS with ES modules (`type="module"`), so a file:// origin may not work in all browsers — use a local server.

No tests, no linter, no bundler, no dependencies.

## Architecture

All game code is in `js/` as ES modules. `index.html` contains all markup, CSS, and the entry point (`<script type="module" src="js/main.js">`).

**Game flow** (`main.js`): Screen controller that cycles through training → matchmaking → fight → result. Manages the combat loop interval and wires up DOM events.

**Gladiator model** (`gladiator.js`): Creates gladiator objects with 6 stats (`strength`, `agility`, `endurance`, `technique`, `aggression`, `defense`), all clamped 1–20. HP derived from endurance. Also generates random opponents from a name pool with stats in the 7–13 range.

**Training parser** (`training.js`): Converts free-text input into stat boosts by matching keywords (weapons, styles, physical traits, easter eggs) from a hardcoded dictionary. Adds stochastic noise; no keywords = more randomness. Longer text gives small random bonuses.

**AI** (`ai.js`): Both fighters (player and opponent) use the same weighted-random action selection. Weights depend on stats, distance, stamina, HP, and opponent's current action. Actions: `advance`, `retreat`, `light_attack`, `heavy_attack`, `block`, `dodge`, `recover`.

**Combat engine** (`combat.js`): Tick-based at 20 ticks/sec, 30-second fights. Each tick: choose actions when timer expires, process movement/attacks, resolve hits (dodge → block → damage with crit chance), decay floating text, check win conditions (KO or timeout HP comparison).

**Renderer** (`renderer.js`): Canvas 480×270, pixel-art style with `imageSmoothingEnabled = false`. Draws arena background, stick-figure gladiators with action-based poses, health/stamina HUD bars, floating damage text, and KO overlay.

## Key Constants

- Arena bounds: x 30–450, floor y 210, canvas 480×270
- Fight: 20 ticks/sec, 30 seconds (600 total ticks)
- Stats range: 1–20, base 10
- Training text max: 200 chars
