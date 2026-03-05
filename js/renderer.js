// renderer.js — 3/4 perspective canvas rendering

const W = 640;
const H = 400;

// World x (30–450) maps to screen x (80–560)
const WORLD_MIN = 30;
const WORLD_MAX = 450;
const SCREEN_MIN = 80;
const SCREEN_MAX = 560;

const LANE_Y = 260; // base lane for fighters
const DEPTH_OFFSET = 14; // fighter 0 below, fighter 1 above

// Arena ellipse
const ELLIPSE_CX = 320;
const ELLIPSE_CY = 240;
const ELLIPSE_RX = 260;
const ELLIPSE_RY = 130;

// Torch positions around the ellipse
const TORCHES = [];
for (let i = 0; i < 6; i++) {
  const angle = -Math.PI * 0.15 + (Math.PI * 1.3) * (i / 5);
  TORCHES.push({
    x: ELLIPSE_CX + Math.cos(angle) * (ELLIPSE_RX - 10),
    y: ELLIPSE_CY + Math.sin(angle) * (ELLIPSE_RY - 5),
  });
}

let canvas, ctx;

export function initRenderer(canvasEl) {
  canvas = canvasEl;
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext('2d');
}

export function renderFrame(state) {
  if (!ctx) return;
  const tick = state.tick || 0;
  drawBackground();
  drawBackWall(tick);
  drawArenaFloor(tick);
  drawTorches(tick);
  drawFightersSorted(state.fighters, tick);
  drawFloatingTexts(state.fighters);
  drawHUD(state);
}

// --- Background ---
function drawBackground() {
  ctx.fillStyle = '#08080e';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 400);
  grad.addColorStop(0, 'rgba(20,18,40,0.6)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// --- Back Wall with arches ---
function drawBackWall() {
  const wallTop = 0;
  const wallBottom = Math.round(H * 0.35);

  // Stone gradient
  const grad = ctx.createLinearGradient(0, wallTop, 0, wallBottom);
  grad.addColorStop(0, '#2a2018');
  grad.addColorStop(0.5, '#3d2e20');
  grad.addColorStop(1, '#4a3828');
  ctx.fillStyle = grad;
  ctx.fillRect(0, wallTop, W, wallBottom);

  // Stone texture lines
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  for (let y = 10; y < wallBottom; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let x = 20; x < W; x += 45) {
    const row = Math.floor(x / 45);
    const offset = (row % 2) * 22;
    ctx.beginPath();
    ctx.moveTo(x + offset, 0);
    ctx.lineTo(x + offset, wallBottom);
    ctx.stroke();
  }

  // Arched openings
  const archCount = 6;
  const archSpacing = W / (archCount + 1);
  for (let i = 1; i <= archCount; i++) {
    const ax = archSpacing * i;
    const ay = wallBottom - 40;
    const aw = 28;
    const ah = 38;

    ctx.fillStyle = '#0a0808';
    ctx.beginPath();
    ctx.moveTo(ax - aw / 2, ay + ah);
    ctx.lineTo(ax - aw / 2, ay + 10);
    ctx.arc(ax, ay + 10, aw / 2, Math.PI, 0);
    ctx.lineTo(ax + aw / 2, ay + ah);
    ctx.closePath();
    ctx.fill();

    // Arch border
    ctx.strokeStyle = '#5a4a38';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax - aw / 2, ay + ah);
    ctx.lineTo(ax - aw / 2, ay + 10);
    ctx.arc(ax, ay + 10, aw / 2, Math.PI, 0);
    ctx.lineTo(ax + aw / 2, ay + ah);
    ctx.stroke();
  }
}

// --- Arena Floor (sand ellipse) ---
function drawArenaFloor() {
  // Main sand ellipse
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(ELLIPSE_CX, ELLIPSE_CY, ELLIPSE_RX, ELLIPSE_RY, 0, 0, Math.PI * 2);

  const sandGrad = ctx.createRadialGradient(
    ELLIPSE_CX, ELLIPSE_CY - 20, 20,
    ELLIPSE_CX, ELLIPSE_CY, ELLIPSE_RX
  );
  sandGrad.addColorStop(0, '#c8a868');
  sandGrad.addColorStop(0.6, '#b89858');
  sandGrad.addColorStop(1, '#8a7040');
  ctx.fillStyle = sandGrad;
  ctx.fill();

  // Edge outline
  ctx.strokeStyle = '#6a5530';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Sand texture marks (deterministic)
  ctx.fillStyle = 'rgba(160,128,80,0.4)';
  for (let i = 0; i < 60; i++) {
    const a = i * 1.37;
    const r = 30 + (i * 47) % 200;
    const sx = ELLIPSE_CX + Math.cos(a) * r * (ELLIPSE_RX / 260);
    const sy = ELLIPSE_CY + Math.sin(a) * r * (ELLIPSE_RY / 260);
    // Only draw inside ellipse
    const nx = (sx - ELLIPSE_CX) / ELLIPSE_RX;
    const ny = (sy - ELLIPSE_CY) / ELLIPSE_RY;
    if (nx * nx + ny * ny < 0.85) {
      ctx.fillRect(sx, sy, 3, 1);
    }
  }

  // Center cross marking
  ctx.strokeStyle = 'rgba(100,80,50,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ELLIPSE_CX - 20, ELLIPSE_CY);
  ctx.lineTo(ELLIPSE_CX + 20, ELLIPSE_CY);
  ctx.moveTo(ELLIPSE_CX, ELLIPSE_CY - 12);
  ctx.lineTo(ELLIPSE_CX, ELLIPSE_CY + 12);
  ctx.stroke();
}

// --- Torches ---
function drawTorches(tick) {
  for (let i = 0; i < TORCHES.length; i++) {
    const t = TORCHES[i];
    const flicker = Math.sin(tick * 0.15 + i * 2.1) * 2;
    const flicker2 = Math.cos(tick * 0.23 + i * 1.7) * 1.5;

    // Glow
    const glow = ctx.createRadialGradient(t.x, t.y - 14, 2, t.x, t.y - 14, 35);
    glow.addColorStop(0, 'rgba(255,160,40,0.2)');
    glow.addColorStop(0.5, 'rgba(255,100,20,0.08)');
    glow.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(t.x - 40, t.y - 55, 80, 80);

    // Bracket
    ctx.fillStyle = '#5a3a20';
    ctx.fillRect(t.x - 2, t.y - 6, 4, 10);

    // Flame core
    ctx.fillStyle = '#ff9922';
    ctx.beginPath();
    ctx.ellipse(t.x + flicker2 * 0.5, t.y - 12 + flicker * 0.3, 4 + flicker * 0.3, 7 + flicker * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner flame
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath();
    ctx.ellipse(t.x + flicker2 * 0.3, t.y - 13 + flicker * 0.2, 2, 4 + flicker * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- World to screen mapping ---
function worldToScreenX(wx) {
  return SCREEN_MIN + ((wx - WORLD_MIN) / (WORLD_MAX - WORLD_MIN)) * (SCREEN_MAX - SCREEN_MIN);
}

function fighterScreenY(index) {
  return index === 0 ? LANE_Y + DEPTH_OFFSET : LANE_Y - DEPTH_OFFSET;
}

function depthScale(index) {
  return index === 0 ? 1.05 : 0.95;
}

// --- Fighters (sorted by depth) ---
function drawFightersSorted(fighters, tick) {
  // Farther fighter (higher on screen = smaller y) drawn first
  const order = fighterScreenY(0) > fighterScreenY(1) ? [1, 0] : [0, 1];
  for (const i of order) {
    drawGladiator(fighters[i], i, tick);
  }
}

function drawGladiator(g, index, tick) {
  const sx = worldToScreenX(g.x);
  const sy = fighterScreenY(index);
  const scale = depthScale(index);
  const facing = g.facing;

  const colors = index === 0
    ? { body: '#cc3333', bodyLight: '#dd5555', head: '#e8a088', weapon: '#cccccc', legs: '#992222', shoulder: '#dd4444' }
    : { body: '#3366cc', bodyLight: '#5588dd', head: '#e8a088', weapon: '#cccccc', legs: '#224499', shoulder: '#4488dd' };

  const staggering = g.staggerTimer > 0;
  const jitterX = staggering ? (Math.random() * 4 - 2) : 0;
  const jitterY = staggering ? (Math.random() * 2 - 1) : 0;

  const bx = sx + jitterX;
  const by = sy + jitterY;

  // Action-specific offsets
  let bodyOffsetX = 0;
  let bodyOffsetY = 0;
  let weaponLen = 10 * scale;
  let weaponThick = 2 * scale;
  let weaponAngle = 0; // relative to facing direction
  let showShield = false;
  let showSlash = false;
  let showImpact = false;
  let isDodging = false;
  let isRecovering = false;
  let walkCycle = 0;

  const progress = g.actionTimer > 0
    ? (ACTION_DURATIONS[g.action] || 6) - g.actionTimer
    : 0;

  switch (g.action) {
    case 'advance':
      bodyOffsetX = facing * 2;
      walkCycle = Math.sin(tick * 0.8) * 2;
      break;
    case 'retreat':
      bodyOffsetX = -facing * 2;
      weaponLen = 7 * scale;
      break;
    case 'light_attack': {
      if (progress < 3) {
        // Wind-up: pull weapon back
        weaponLen = 6 * scale;
        weaponAngle = -0.3;
      } else if (progress === 3) {
        // Strike frame
        weaponLen = 16 * scale;
        showSlash = true;
      } else if (progress < 6) {
        // Extended
        weaponLen = 14 * scale;
      } else {
        // Recovery
        weaponLen = 8 * scale;
      }
      break;
    }
    case 'heavy_attack': {
      if (progress < 8) {
        // Raise overhead
        weaponAngle = -Math.PI / 3 + progress * 0.05;
        weaponLen = 12 * scale;
        weaponThick = 3 * scale;
      } else if (progress === 8) {
        // Slam down
        weaponLen = 20 * scale;
        weaponThick = 4 * scale;
        showImpact = true;
      } else {
        // Slow recovery
        weaponLen = 14 * scale;
        weaponThick = 3 * scale;
      }
      break;
    }
    case 'block':
      showShield = true;
      bodyOffsetY = 2;
      weaponLen = 6 * scale;
      break;
    case 'dodge':
      isDodging = true;
      break;
    case 'recover':
      isRecovering = true;
      bodyOffsetY = 2;
      weaponLen = 5 * scale;
      weaponAngle = 0.4;
      break;
  }

  const dx = bx + bodyOffsetX;
  const dy = by + bodyOffsetY;

  // Dodge: afterimage at old position
  if (isDodging && g.actionTimer > 4) {
    ctx.globalAlpha = 0.2;
    drawFighterBody(dx + facing * 12, dy, scale, colors, facing, 0, 0, 8 * scale, 2 * scale, 0);
    ctx.globalAlpha = 1;
  }

  // Main fighter
  if (isDodging) ctx.globalAlpha = 0.5;
  drawFighterBody(dx, dy, scale, colors, facing, walkCycle, weaponAngle, weaponLen, weaponThick, progress);

  // Shield
  if (showShield) {
    ctx.fillStyle = '#887744';
    const shieldX = dx + facing * 8 * scale;
    const shieldY = dy - 18 * scale;
    ctx.fillRect(shieldX - 4 * scale, shieldY, 8 * scale, 12 * scale);
    ctx.strokeStyle = '#aa9955';
    ctx.lineWidth = 1;
    ctx.strokeRect(shieldX - 4 * scale, shieldY, 8 * scale, 12 * scale);
  }

  // Slash arc effect
  if (showSlash) {
    ctx.strokeStyle = 'rgba(255,255,200,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const slashX = dx + facing * 18 * scale;
    const slashY = dy - 15 * scale;
    ctx.arc(slashX, slashY, 10 * scale, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
  }

  // Impact flash
  if (showImpact) {
    ctx.fillStyle = 'rgba(255,200,100,0.6)';
    ctx.beginPath();
    ctx.arc(dx + facing * 14 * scale, dy - 5 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Recovery particles
  if (isRecovering) {
    ctx.fillStyle = '#44ff88';
    for (let p = 0; p < 4; p++) {
      const px = dx + Math.sin(tick * 0.3 + p * 1.5) * 6;
      const py = dy - 10 - ((tick * 0.8 + p * 7) % 20);
      const alpha = 1 - ((tick * 0.8 + p * 7) % 20) / 20;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }

  ctx.globalAlpha = 1;
}

function drawFighterBody(x, y, scale, colors, facing, walkCycle, weaponAngle, weaponLen, weaponThick, progress) {
  const s = scale;

  // Shadow ellipse on ground
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, 10 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Feet
  ctx.fillStyle = '#1a1a1a';
  const footSpread = 3 * s;
  ctx.fillRect(x - footSpread - 2 * s, y - 3 * s + walkCycle * 0.3, 3 * s, 3 * s);
  ctx.fillRect(x + footSpread - 1 * s, y - 3 * s - walkCycle * 0.3, 3 * s, 3 * s);

  // Body/torso (oval, wide for shoulders, compressed vertically)
  ctx.fillStyle = colors.body;
  ctx.beginPath();
  ctx.ellipse(x, y - 14 * s, 7 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Torso detail
  ctx.fillStyle = colors.bodyLight;
  ctx.beginPath();
  ctx.ellipse(x, y - 15 * s, 4 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shoulder pads
  ctx.fillStyle = colors.shoulder;
  ctx.fillRect(x - 8 * s, y - 18 * s, 4 * s, 4 * s);
  ctx.fillRect(x + 4 * s, y - 18 * s, 4 * s, 4 * s);

  // Head
  ctx.fillStyle = colors.head;
  ctx.beginPath();
  ctx.arc(x, y - 22 * s, 4 * s, 0, Math.PI * 2);
  ctx.fill();

  // Helmet visor (small mark toward enemy)
  ctx.fillStyle = '#333333';
  ctx.fillRect(x + facing * 2 * s, y - 23 * s, 2 * s, 2 * s);

  // Weapon arm
  ctx.fillStyle = colors.weapon;
  const armX = x + facing * 6 * s;
  const armY = y - 16 * s;
  ctx.save();
  ctx.translate(armX, armY);
  ctx.rotate(weaponAngle * facing);
  ctx.fillRect(0, -weaponThick / 2, facing * weaponLen, weaponThick);
  // Weapon pommel
  ctx.fillStyle = '#997744';
  ctx.fillRect(-facing * 2 * s, -weaponThick, facing * 3 * s, weaponThick * 2);
  ctx.restore();
}

const ACTION_DURATIONS = {
  idle: 1,
  advance: 6,
  retreat: 6,
  light_attack: 8,
  heavy_attack: 16,
  block: 12,
  dodge: 10,
  recover: 15,
};

// --- Floating Texts ---
function drawFloatingTexts(fighters) {
  ctx.textAlign = 'center';
  for (let i = 0; i < fighters.length; i++) {
    const f = fighters[i];
    const sx = worldToScreenX(f.x);
    const sy = fighterScreenY(i);
    for (const t of f.floatingTexts) {
      const alpha = Math.min(1, t.life / 10);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 13px monospace';
      // Stroke outline for readability on sand
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, sx + t.offsetX, sy + t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, sx + t.offsetX, sy + t.y);
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.textAlign = 'start';
}

// --- HUD ---
function drawHUD(state) {
  const [a, b] = state.fighters;

  // Health bars
  drawHealthBar(40, 12, 220, 16, a.hp, a.maxHp, '#cc3333', '#ff4444', a.name);
  drawHealthBar(380, 12, 220, 16, b.hp, b.maxHp, '#3366cc', '#5588ee', b.name);

  // Stamina bars
  drawStaminaBar(40, 32, 220, 5, a.stamina, a.maxStamina);
  drawStaminaBar(380, 32, 220, 5, b.stamina, b.maxStamina);

  // Timer
  const secsLeft = Math.ceil((state.totalTicks - state.tick) / state.ticksPerSec);
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 3;
  ctx.strokeText(secsLeft.toString(), W / 2, 26);
  ctx.fillStyle = '#c8a050';
  ctx.fillText(secsLeft.toString(), W / 2, 26);
  ctx.textAlign = 'start';
  ctx.lineWidth = 1;

  // KO overlay
  if (state.finished) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    const text = state.winner === null ? 'DRAW' : 'K.O.!';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 4;
    ctx.strokeText(text, W / 2, H / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, W / 2, H / 2);
    ctx.textAlign = 'start';
    ctx.lineWidth = 1;
  }
}

function drawHealthBar(x, y, w, h, hp, maxHp, color, lowColor, name) {
  // Background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x, y, w, h);

  // Health fill with gradient
  const pct = Math.max(0, hp / maxHp);
  const fillW = (w - 2) * pct;
  if (fillW > 0) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    const barColor = pct > 0.3 ? color : lowColor;
    grad.addColorStop(0, barColor);
    grad.addColorStop(1, shadeColor(barColor, -30));
    ctx.fillStyle = grad;
    ctx.fillRect(x + 1, y + 1, fillW, h - 2);
  }

  // Border
  ctx.strokeStyle = '#555555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeText(name, x + 4, y + h - 4);
  ctx.fillText(name, x + 4, y + h - 4);
  ctx.lineWidth = 1;
}

function drawStaminaBar(x, y, w, h, stamina, maxStamina) {
  ctx.fillStyle = '#111111';
  ctx.fillRect(x, y, w, h);
  const pct = Math.max(0, stamina / maxStamina);
  ctx.fillStyle = pct > 0.3 ? '#44aa44' : '#aaaa22';
  ctx.fillRect(x + 1, y + 1, (w - 2) * pct, h - 2);
}

// --- Utility ---
function shadeColor(hex, amount) {
  let r = parseInt(hex.slice(1, 3), 16) + amount;
  let g = parseInt(hex.slice(3, 5), 16) + amount;
  let b = parseInt(hex.slice(5, 7), 16) + amount;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}
