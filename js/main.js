// main.js — Game flow controller

import { trainGladiator } from './training.js';
import { createRandomOpponent } from './gladiator.js';
import { createCombatState, tickCombat } from './combat.js';
import { initRenderer, renderFrame } from './renderer.js';
let net = null; // loaded on demand

let currentScreen = 'training';
let combatState = null;
let combatInterval = null;
let playerGladiator = null;
let mode = 'solo'; // 'solo' or 'online'
let onlinePlayerIdx = null; // 0 or 1 — which fighter is "you" in online mode
let dotInterval = null;
let botTrainingText = null; // Claude-generated training text for reveal

const screens = {};
const $ = id => document.getElementById(id);

export function init() {
  screens.training = $('screen-training');
  screens.matchmaking = $('screen-matchmaking');
  screens.fight = $('screen-fight');
  screens.result = $('screen-result');

  $('btn-fight').addEventListener('click', onFight);
  $('btn-again').addEventListener('click', onTrainAgain);

  $('mode-solo').addEventListener('click', () => setMode('solo'));
  $('mode-online').addEventListener('click', () => setMode('online'));

  // Fetch bot record when nickname changes
  let debounceTimer = null;
  $('nickname-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchBotStatus, 400);
  });

  initRenderer($('arena-canvas'));
  showScreen('training');
}

function setMode(m) {
  mode = m;
  $('mode-solo').classList.toggle('active', m === 'solo');
  $('mode-online').classList.toggle('active', m === 'online');

  // Toggle visibility of solo vs online controls
  $('solo-controls').style.display = m === 'solo' ? '' : 'none';
  const onlineEl = $('online-controls');
  if (m === 'online') {
    onlineEl.style.display = '';
    onlineEl.classList.add('visible');
  } else {
    onlineEl.style.display = 'none';
    onlineEl.classList.remove('visible');
  }
}

async function fetchBotStatus() {
  const nickname = $('nickname-input').value.trim();
  const statusEl = $('bot-status');
  if (!nickname) {
    statusEl.textContent = 'New bot';
    statusEl.classList.remove('has-record');
    return;
  }
  try {
    const resp = await fetch('/api/bots');
    const bots = await resp.json();
    const bot = bots.find(b => b.nickname.toLowerCase() === nickname.toLowerCase());
    if (bot && (bot.wins > 0 || bot.losses > 0 || bot.draws > 0)) {
      statusEl.textContent = `${bot.wins}W ${bot.losses}L${bot.draws ? ' ' + bot.draws + 'D' : ''}`;
      statusEl.classList.add('has-record');
    } else {
      statusEl.textContent = 'New bot';
      statusEl.classList.remove('has-record');
    }
  } catch {
    statusEl.textContent = 'New bot';
    statusEl.classList.remove('has-record');
  }
}

function showScreen(name) {
  for (const [k, el] of Object.entries(screens)) {
    el.classList.toggle('active', k === name);
  }
  currentScreen = name;
}

function onFight() {
  if (mode === 'solo') {
    const text = $('training-text').value.trim();
    onFightSolo(text);
  } else {
    const nickname = $('nickname-input').value.trim();
    if (!nickname) {
      $('nickname-input').focus();
      return;
    }
    const prompt = $('bot-prompt').value.trim();
    onFightOnline(nickname, prompt);
  }
}

// --- Solo path (unchanged logic) ---

function onFightSolo(text) {
  playerGladiator = trainGladiator('Champion', text);

  showScreen('matchmaking');

  const opponent = createRandomOpponent();
  $('opponent-match-name').textContent = opponent.name;

  const matchText = $('match-status');
  matchText.textContent = 'FINDING OPPONENT';
  let dots = 0;
  dotInterval = setInterval(() => {
    dots = (dots + 1) % 4;
    matchText.textContent = 'FINDING OPPONENT' + '.'.repeat(dots);
  }, 400);

  setTimeout(() => {
    clearInterval(dotInterval);
    dotInterval = null;
    matchText.textContent = 'VS';
    $('matchup-names').classList.add('visible');
    $('player-match-name').textContent = playerGladiator.name;
    $('opponent-match-name').textContent = opponent.name;

    setTimeout(() => {
      $('matchup-names').classList.remove('visible');
      startFightSolo(playerGladiator, opponent);
    }, 1500);
  }, 2000);
}

function startFightSolo(player, opponent) {
  showScreen('fight');
  combatState = createCombatState(player, opponent);

  const tickMs = 1000 / combatState.ticksPerSec;
  combatInterval = setInterval(() => {
    tickCombat(combatState);
    renderFrame(combatState);

    if (combatState.finished) {
      clearInterval(combatInterval);
      combatInterval = null;
      setTimeout(() => showResult(combatState, 0), 1200);
    }
  }, tickMs);
}

// --- Online path ---

async function onFightOnline(nickname, prompt) {
  botTrainingText = null;

  showScreen('matchmaking');
  const matchText = $('match-status');
  matchText.textContent = 'CONNECTING';

  $('btn-fight').disabled = true;

  try {
    if (!net) net = await import('./net.js');
    await net.connect(onServerMessage);
    net.send({ type: 'join', nickname, prompt });
  } catch {
    matchText.textContent = 'CONNECTION FAILED';
    $('btn-fight').disabled = false;
    setTimeout(() => showScreen('training'), 2000);
    return;
  }

  matchText.textContent = 'SUMMONING BOT';
  let dots = 0;
  dotInterval = setInterval(() => {
    dots = (dots + 1) % 4;
    matchText.textContent = 'SUMMONING BOT' + '.'.repeat(dots);
  }, 400);
}

function onServerMessage(msg) {
  switch (msg.type) {
    case 'thinking':
      // Already showing "SUMMONING BOT..."
      break;

    case 'trained':
      // Claude generated training text — store for reveal
      botTrainingText = msg.text;
      if (dotInterval) { clearInterval(dotInterval); dotInterval = null; }
      $('match-status').textContent = 'WAITING FOR OPPONENT';
      let dots = 0;
      dotInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        $('match-status').textContent = 'WAITING FOR OPPONENT' + '.'.repeat(dots);
      }, 400);
      break;

    case 'queued':
      // Already showing "WAITING FOR OPPONENT..."
      break;

    case 'matched':
      onlinePlayerIdx = msg.you;
      if (dotInterval) { clearInterval(dotInterval); dotInterval = null; }

      $('match-status').textContent = 'VS';
      $('matchup-names').classList.add('visible');
      $('player-match-name').textContent = msg.player_name;
      $('opponent-match-name').textContent = msg.opponent_name;

      setTimeout(() => {
        $('matchup-names').classList.remove('visible');
        showScreen('fight');
        $('btn-fight').disabled = false;
      }, 1500);
      break;

    case 'tick':
      // Server sends full state each tick — just render it
      renderFrame(msg);
      break;

    case 'result':
      net.disconnect();
      // Build a state-like object for showResult
      showResult({
        fighters: msg.fighters,
        winner: msg.winner,
        stats: msg.stats,
      }, onlinePlayerIdx);
      break;
  }
}

// --- Shared result screen ---

function showResult(state, myIdx) {
  showScreen('result');

  const [a, b] = state.fighters;
  const resultEl = $('result-text');
  const summaryEl = $('fight-summary');
  const hintEl = $('fight-hint');

  if (state.winner === null) {
    resultEl.textContent = 'DRAW';
    resultEl.className = 'result-title draw';
  } else if (state.winner === myIdx) {
    resultEl.textContent = 'VICTORY';
    resultEl.className = 'result-title win';
  } else {
    resultEl.textContent = 'DEFEAT';
    resultEl.className = 'result-title lose';
  }

  const ps = state.stats[myIdx];
  const os = state.stats[1 - myIdx];
  const me = state.fighters[myIdx];
  const them = state.fighters[1 - myIdx];

  summaryEl.innerHTML =
    `<div class="summary-row">Your hits: ${ps.hits} | Crits: ${ps.crits} | Heavy: ${ps.heavyHits}</div>` +
    `<div class="summary-row">Dodges: ${os.dodges} | Blocks: ${os.blocks}</div>` +
    `<div class="summary-row">${me.name} HP: ${Math.max(0, Math.floor(me.hp))}/${me.maxHp}</div>` +
    `<div class="summary-row">${them.name} HP: ${Math.max(0, Math.floor(them.hp))}/${them.maxHp}</div>`;

  hintEl.textContent = generateHint(state, myIdx);

  // Show training reveal in online mode
  const revealEl = $('training-reveal');
  if (mode === 'online' && botTrainingText) {
    $('reveal-text').textContent = `"${botTrainingText}"`;
    revealEl.style.display = '';
  } else {
    revealEl.style.display = 'none';
  }
}

function generateHint(state, myIdx) {
  const ps = state.stats[myIdx];
  const os = state.stats[1 - myIdx];
  const player = state.fighters[myIdx];

  const hints = [];

  if (ps.hits < 5) hints.push('Your gladiator struggled to land blows. Maybe train for aggression?');
  if (os.dodges > 3) hints.push('The opponent dodged a lot. Speed might help you keep up.');
  if (os.blocks > 4) hints.push('Many of your attacks were blocked. Raw power could break through.');
  if (ps.crits === 0) hints.push('No critical hits landed. Technique might sharpen your edge.');
  if (player.hp / player.maxHp < 0.3 && state.winner !== myIdx) hints.push('You took heavy damage. Endurance or defense could help you last longer.');
  if (ps.hits > 10 && state.winner === myIdx) hints.push('An aggressive approach served you well!');
  if (ps.heavyHits > 3) hints.push('Heavy attacks did work! Strength is paying off.');

  if (hints.length === 0) hints.push('Every fight teaches something. Try different words next time.');

  return hints[Math.floor(Math.random() * hints.length)];
}

function onTrainAgain() {
  $('training-text').value = '';
  if (net) net.disconnect();
  onlinePlayerIdx = null;
  botTrainingText = null;
  $('training-reveal').style.display = 'none';
  showScreen('training');
}

// Boot
document.addEventListener('DOMContentLoaded', init);
