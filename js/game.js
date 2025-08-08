// Pixel Hero Side Scroller — uses Canvas
// Controls: Left/Right arrows to move, Space to jump, Z to attack

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- CONFIG ---
// Sprite sheet assumed 4 columns x 6 rows, 32x32px frames, matching the generated sheet layout.
// If your sheet differs, tweak FRAME_W/H, COLS, ROWS and row assignments below.
const FRAME_W = 32;
const FRAME_H = 32;
const SCALE = 3; // render scale
const COLS = 4;
const ROWS = 6;

// Animation rows (by observation of the generated sheet)
// 0: idle (4 frames)
// 1: walk/run (4 frames)
// 2: jump / air (4 frames)
// 3: attack (slash) (4 frames)
// 4: crouch / low attack (4 frames)
// 5: death (4 frames)
const ROW_IDLE = 0;
const ROW_WALK = 1;
const ROW_JUMP = 2;
const ROW_ATTACK = 3;
const ROW_CROUCH = 4;
const ROW_DEATH = 5;

// World/physics
const GRAVITY = 1600;
const MOVE_SPEED = 220;
const JUMP_VY = -520;
const GROUND_Y = 380; // baseline ground
const FRICTION = 0.85;

// Gameplay
let keys = {};
let lastTime = 0;

// Load assets
const heroImg = new Image();
heroImg.src = 'assets/hero.png';

// Hero entity
const hero = {
  x: 120,
  y: GROUND_Y,
  vx: 0,
  vy: 0,
  w: FRAME_W * SCALE,
  h: FRAME_H * SCALE,
  face: 1, // 1 right, -1 left
  hp: 5,
  maxHp: 5,
  onGround: true,
  attacking: false,
  attackTimer: 0,
  dead: false,
  state: 'idle', // idle, walk, jump, attack, death
  frame: 0,
  frameTimer: 0,
  frameDelay: 0.12,
};

// Simple platform list (rects)
const platforms = [
  {x: 0, y: GROUND_Y + hero.h, w: canvas.width, h: 100}, // ground
  {x: 260, y: 320, w: 140, h: 20},
  {x: 520, y: 280, w: 160, h: 20},
  {x: 760, y: 350, w: 120, h: 20},
];

// Enemy definition — simple "slime" that patrols a range
function makeSlime(x1, x2, y) {
  return {
    type: 'slime',
    x: (x1 + x2) / 2,
    y,
    vx: 60,
    dir: 1,
    patrolMin: x1,
    patrolMax: x2,
    w: 28 * SCALE/2, // simple body size
    h: 18 * SCALE/2,
    hp: 3,
    alive: true,
    hurtTimer: 0,
  };
}

const enemies = [
  makeSlime(300, 460, GROUND_Y + hero.h - 12),
  makeSlime(520, 680, 280 + 20 - 12),
  makeSlime(760, 860, 350 + 20 - 12),
];

// Input
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup',   (e) => { keys[e.code] = false; });

// Helpers
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rectAt(entity) {
  return {x: entity.x, y: entity.y, w: entity.w, h: entity.h};
}

function applyPlatforms(entity) {
  // very simple vertical collision only
  entity.onGround = false;
  let nextY = entity.y + entity.vy * dt;
  let rect = {x: entity.x, y: nextY, w: entity.w, h: entity.h};
  for (const p of platforms) {
    if (aabb(rect, p)) {
      // coming from above?
      if (entity.vy > 0 && entity.y + entity.h <= p.y + 10) {
        nextY = p.y - entity.h;
        entity.vy = 0;
        entity.onGround = true;
      }
    }
  }
  entity.y = nextY;
}

// Attack hitbox in front of hero
function getHeroAttackHitbox() {
  const reach = 26 * SCALE;
  const w = 30;
  const h = 26;
  const x = hero.face === 1 ? (hero.x + hero.w - 20) : (hero.x - reach);
  const y = hero.y + hero.h/2 - h/2;
  return {x, y, w: reach, h};
}

// Update
let dt = 0;
function update(timestamp) {
  dt = (timestamp - lastTime) / 1000;
  if (!isFinite(dt) || dt > 0.05) dt = 0.016;
  lastTime = timestamp;

  if (hero.dead) {
    hero.state = 'death';
  } else {
    // Horizontal input
    let moving = false;
    if (keys['ArrowLeft']) {
      hero.vx = -MOVE_SPEED;
      hero.face = -1;
      moving = true;
    } else if (keys['ArrowRight']) {
      hero.vx = MOVE_SPEED;
      hero.face = 1;
      moving = true;
    } else {
      hero.vx *= FRICTION;
      if (Math.abs(hero.vx) < 2) hero.vx = 0;
    }

    // Jump
    if (keys['Space'] && hero.onGround) {
      hero.vy = JUMP_VY;
      hero.onGround = false;
    }

    // Attack
    if (keys['KeyZ'] && !hero.attacking && !hero.dead) {
      hero.attacking = true;
      hero.attackTimer = 0.28; // attack window
      hero.state = 'attack';
    }

    // Physics
    hero.x += hero.vx * dt;
    hero.vy += GRAVITY * dt;
    applyPlatforms(hero);

    // Clamp to world bounds
    hero.x = Math.max(0, Math.min(canvas.width - hero.w, hero.x));

    // State machine
    if (!hero.attacking) {
      if (!hero.onGround) hero.state = 'jump';
      else if (moving) hero.state = 'walk';
      else hero.state = 'idle';
    } else {
      hero.attackTimer -= dt;
      if (hero.attackTimer <= 0) {
        hero.attacking = false;
      }
    }
  }

  // Enemies update
  for (const e of enemies) {
    if (!e.alive) continue;
    // Patrol
    e.x += e.vx * e.dir * dt;
    if (e.x < e.patrolMin) { e.x = e.patrolMin; e.dir = 1; }
    if (e.x + e.w > e.patrolMax) { e.x = e.patrolMax - e.w; e.dir = -1; }

    // Simple gravity to keep them on their platform baseline
    // (they're anchored to given y)
    if (e.hurtTimer > 0) e.hurtTimer -= dt;

    // Touch damage
    const heroRect = rectAt(hero);
    const eRect = rectAt(e);
    if (!hero.dead && aabb(heroRect, eRect)) {
      // knockback hero
      hero.vx = (hero.x < e.x) ? -220 : 220;
      hero.vy = -280;
      hero.hp -= 1;
      if (hero.hp <= 0) { hero.hp = 0; hero.dead = true; }
    }

    // Hero attack hit
    if (hero.attacking && hero.state === 'attack' && e.hurtTimer <= 0) {
      const hb = getHeroAttackHitbox();
      if (aabb(hb, eRect)) {
        e.hp -= 1;
        e.hurtTimer = 0.25;
        // small knockback
        e.x += (hero.face === 1 ? 18 : -18);
        if (e.hp <= 0) { e.alive = false; }
      }
    }
  }

  // Animation frame control
  hero.frameTimer += dt;
  const frameCount = COLS; // each row has COLS frames
  const delay = hero.state === 'walk' ? 0.10 :
                hero.state === 'attack' ? 0.08 :
                hero.state === 'jump' ? 0.12 :
                hero.state === 'death' ? 0.18 : 0.16;

  if (hero.frameTimer >= delay) {
    hero.frameTimer = 0;
    if (hero.state === 'death') {
      hero.frame = Math.min(hero.frame + 1, frameCount - 1);
    } else {
      hero.frame = (hero.frame + 1) % frameCount;
    }
  }
}

function drawBackground() {
  // simple parallax sky + hills
  ctx.fillStyle = '#78c8ff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  // ground gradient is in CSS, we add a distant hill
  ctx.fillStyle = '#6bb070';
  ctx.fillRect(0, canvas.height-120, canvas.width, 120);

  // Platforms
  ctx.fillStyle = '#4e3a2a';
  for (const p of platforms) {
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#6a4c38';
    ctx.fillRect(p.x, p.y, p.w, 6);
    ctx.fillStyle = '#4e3a2a';
  }
}

function drawHero() {
  let row = ROW_IDLE;
  if (hero.state === 'walk') row = ROW_WALK;
  else if (hero.state === 'jump') row = ROW_JUMP;
  else if (hero.state === 'attack') row = ROW_ATTACK;
  else if (hero.state === 'death') row = ROW_DEATH;

  const sx = hero.frame * FRAME_W;
  const sy = row * FRAME_H;
  const dx = hero.face === 1 ? hero.x : hero.x + hero.w;
  const dw = hero.face === 1 ? hero.w : -hero.w;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(heroImg, sx, sy, FRAME_W, FRAME_H, dx, hero.y, dw, hero.h);
  ctx.restore();

  // Debug: show attack hitbox during attack
  // if (hero.attacking) {
  //   const hb = getHeroAttackHitbox();
  //   ctx.strokeStyle = '#fff';
  //   ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
  // }
}

function drawEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;
    // Draw simple slime as a blob
    ctx.save();
    ctx.fillStyle = e.hurtTimer > 0 ? '#ffaaaa' : '#66aa66';
    ctx.fillRect(e.x, e.y, e.w, e.h);
    // eyes
    ctx.fillStyle = '#000000';
    ctx.fillRect(e.x + e.w*0.25, e.y + e.h*0.3, 4, 6);
    ctx.fillRect(e.x + e.w*0.60, e.y + e.h*0.3, 4, 6);
    ctx.restore();
  }
}

function drawHUD() {
  // HP hearts
  const heartSize = 14;
  for (let i=0;i<hero.maxHp;i++) {
    ctx.fillStyle = i < hero.hp ? '#ff4d6d' : '#333';
    ctx.fillRect(12 + i*(heartSize+6), 12, heartSize, heartSize);
  }
}

function render() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawBackground();
  drawEnemies();
  drawHero();
  drawHUD();
}

// Main loop
function loop(ts) {
  update(ts);
  render();
  requestAnimationFrame(loop);
}

heroImg.onload = () => {
  // Optionally: verify sprite dimensions
  requestAnimationFrame((ts)=>{ lastTime = ts; requestAnimationFrame(loop); });
};
