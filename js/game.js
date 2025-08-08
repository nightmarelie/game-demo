/* Pixel Scroller — drop-in game using sprite sheets.
 * Place your images at ./assets/hero.png and ./assets/goblin.png
 * Tweak the CONFIG at the top to match your exact sheet layouts.
 * Works best when served via file:// or a simple http server.
*/

const CONFIG = {
    canvas: {w: 960, h: 540, scale: 2},
    gravity: 1800,
    groundY: 420,
    // --- HERO SPRITE SHEET ---
    hero: {
        url: "assets/hero.png",
        cols: 8, rows: 8,          // 1024 / 8 = 128px cells ✅
        frameW: null, frameH: null,
        fps: {idle: 8, run: 12, jump: 8, attack: 14, crouch: 8, hurt: 10, death: 10, victory: 8},
        anim: {
            // adjust if your sheet differs, but this works with the one you sent
            idle: [0, 0, 7],
            run: [1, 0, 7],
            jump: [2, 0, 5],
            attack: [3, 0, 7],
            crouch: [4, 0, 3],
            hurt: [5, 0, 3],
            death: [6, 0, 7],
            victory: [7, 0, 5]
        },
        speed: 220, jumpV: 650,
        hitbox: {x: 12, y: 10, w: 28, h: 44},
        attackBox: {x: 30, y: 10, w: 34, h: 40}
    },

// --- GOBLIN ENEMY SHEET ---
    goblin: {
        url: "assets/goblin.png",
        cols: 8, rows: 8,          // also 128px cells ✅
        frameW: null, frameH: null,
        fps: {idle: 8, walk: 10, attack: 10, hurt: 10, death: 10},
        anim: {
            // based on your goblin sheet rows
            idle: [0, 0, 5],
            walk: [1, 0, 5],
            attack: [2, 0, 5],
            hurt: [3, 0, 3],
            death: [4, 0, 5]        // if your death is lower, try row 5 instead
        },
        speed: 120,
        hitbox: {x: 12, y: 8, w: 28, h: 40},
        attackBox: {x: 24, y: 8, w: 30, h: 36}
    }
};

// ---------- Simple loader ----------
function loadImage(src) {
    return new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
    });
}

// ---------- Sprite helper ----------
class Sprite {
    constructor(img, opts) {
        this.img = img;
        const {cols = null, rows = null, frameW = null, frameH = null} = opts || {};
        if (frameW && frameH) {
            this.frameW = frameW;
            this.frameH = frameH;
            this.cols = Math.floor(img.width / frameW);
            this.rows = Math.floor(img.height / frameH);
        } else {
            this.cols = cols;
            this.rows = rows;
            this.frameW = Math.floor(img.width / cols);
            this.frameH = Math.floor(img.height / rows);
        }
    }

    draw(ctx, col, row, dx, dy, dw, dh, flip = false) {
        const sx = this.frameW * col;
        const sy = this.frameH * row;
        ctx.save();
        if (flip) {
            ctx.translate(dx + dw, dy);
            ctx.scale(-1, 1);
            dx = 0;
            dy = 0;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.img, sx, sy, this.frameW, this.frameH, dx, dy, dw, dh);
        ctx.restore();
    }
}

// ---------- Animator ----------
class Animator {
    constructor(def, fps) {
        this.def = def;
        this.fps = fps;
        this.set("idle");
    }

    set(name) {
        if (this.name === name) return;
        this.name = name;
        const [row, start, end] = this.def[name];
        this.row = row;
        this.start = start;
        this.end = end;
        this.col = start;
        this.timer = 0;
        this.rate = 1 / Math.max(1, (this.fps[name] || 8));
        this.done = false;
    }

    update(dt) {
        this.timer += dt;
        const loop = !(this.name === "death" || this.name === "hurt" || this.name === "attack");
        while (this.timer >= this.rate) {
            this.timer -= this.rate;
            if (this.col < this.end) this.col++;
            else {
                this.done = !loop;
                this.col = loop ? this.start : this.end;
            }
        }
    }
}

// ---------- Entities ----------
class Entity {
    constructor(sprite, cfg) {
        this.sprite = sprite;
        this.cfg = cfg;
        this.w = sprite.frameW;
        this.h = sprite.frameH;
        this.scale = 2; // can tweak
        this.x = 100;
        this.y = CONFIG.groundY - this.h * this.scale;
        this.vx = 0;
        this.vy = 0;
        this.dir = 1;
        this.anim = new Animator(cfg.anim, cfg.fps);
        this.state = "idle";
        this.hp = 3;
    }

    box(rect) {
        const s = this.scale;
        return {x: this.x + rect.x * s, y: this.y + rect.y * s, w: rect.w * s, h: rect.h * s};
    }

    draw(ctx) {
        const dw = this.w * this.scale, dh = this.h * this.scale;
        this.sprite.draw(ctx, this.anim.col, this.anim.row, this.x, this.y, dw, dh, this.dir < 0);
    }

    update(dt) {
        this.anim.update(dt);
    }
}

// ---------- Game state ----------
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const heartsEl = document.getElementById("hearts");
const msgEl = document.getElementById("msg");
const restartBtn = document.getElementById("restart");
let keys = {};
window.addEventListener("keydown", e => keys[e.code] = true);
window.addEventListener("keyup", e => keys[e.code] = false);

let hero, goblin, heroSprite, goblinSprite;
let platforms = [
    {x: 0, y: CONFIG.groundY + 64, w: canvas.width, h: 100, color: "#3a2a16"}, // ground block
    {x: 180, y: 340, w: 160, h: 20, color: "#5d3b1a"},
    {x: 420, y: 300, w: 140, h: 20, color: "#5d3b1a"},
    {x: 680, y: 260, w: 160, h: 20, color: "#5d3b1a"}
];

function AABB(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

async function boot() {
    msgEl.textContent = "Loading...";
    const heroImg = await loadImage(CONFIG.hero.url);
    const gobImg = await loadImage(CONFIG.goblin.url);

    heroSprite = new Sprite(heroImg, {frameW: 128, frameH: 128});
    goblinSprite = new Sprite(gobImg, {frameW: 128, frameH: 128});


    // expose actual sizes
    CONFIG.hero.frameW = heroSprite.frameW;
    CONFIG.hero.frameH = heroSprite.frameH;
    CONFIG.goblin.frameW = goblinSprite.frameW;
    CONFIG.goblin.frameH = goblinSprite.frameH;

    hero = new Entity(heroSprite, CONFIG.hero);
    hero.scale = 2;
    hero.x = 80;

    goblin = new Entity(goblinSprite, CONFIG.goblin);
    goblin.scale = 2;
    goblin.x = 640;
    goblin.hp = 3;
    goblin.state = "walk";
    goblin.anim.set("walk");

    msgEl.textContent = "Arrow keys to move, Space to jump, K to attack";
    restartBtn.classList.add("hidden");
    heartsEl.textContent = "❤❤❤";
    requestAnimationFrame(loop);
}

function setHeroState(name) {
    hero.state = name;
    hero.anim.set(name);
}

function setGoblinState(name) {
    goblin.state = name;
    goblin.anim.set(name);
}

function handleHero(dt) {
    const H = CONFIG.hero;
    const speed = H.speed;
    let onGround = false;

    // Inputs
    let moving = false;
    if (keys["ArrowLeft"]) {
        hero.vx = -speed;
        hero.dir = -1;
        moving = true;
    }
    if (keys["ArrowRight"]) {
        hero.vx = speed;
        hero.dir = 1;
        moving = true;
    }
    if (!moving) hero.vx = 0;

    // Jump
    if (keys["Space"] && hero._canJump) {
        hero.vy = -H.jumpV;
        hero._canJump = false;
        setHeroState("jump");
    }

    // Apply gravity & move
    hero.vy += CONFIG.gravity * dt;
    hero.x += hero.vx * dt;
    hero.y += hero.vy * dt;

    // Platform collisions (simple AABB, resolve Y)
    const feet = {x: hero.x + 10, y: hero.y + hero.h * hero.scale - 1, w: hero.w * hero.scale - 20, h: 2};
    for (const p of platforms) {
        // fall onto platform
        if (feet.y < p.y && feet.y + hero.vy * dt >= p.y && feet.x < p.x + p.w && feet.x + feet.w > p.x) {
            // Land
            hero.y = p.y - hero.h * hero.scale;
            hero.vy = 0;
            onGround = true;
        }
    }
    if (onGround) {
        hero._canJump = true;
        if (moving && hero.state !== "attack") setHeroState("run");
        if (!moving && hero.state !== "attack") setHeroState("idle");
    } else {
        if (hero.state !== "attack") setHeroState("jump");
    }

    // Attack
    if (keys["KeyK"] && hero._atkCooldown <= 0 && hero.state !== "death") {
        hero._atkCooldown = 0.5;
        setHeroState("attack");
    }
    if (hero._atkCooldown > 0) {
        hero._atkCooldown -= dt;
    }

    // During attack frames, apply damage if overlapping attack box
    if (hero.state === "attack") {
        // mid-window: use middle third of animation
        const [row, s, e] = H.anim.attack;
        const progress = (hero.anim.col - s) / Math.max(1, (e - s));
        if (progress > 0.3 && progress < 0.8) {
            const atk = hero.box(H.attackBox);
            const gHit = goblin.box(CONFIG.goblin.hitbox);
            if (!goblin._iframes && AABB(atk, gHit) && goblin.state !== "death") {
                goblin.hp -= 1;
                goblin._iframes = 0.4;
                if (goblin.hp <= 0) {
                    setGoblinState("death");
                } else setGoblinState("hurt");
            }
        }
        if (hero.anim.done) {
            setHeroState(onGround ? (moving ? "run" : "idle") : "jump");
        }
    }
}

function handleGoblin(dt) {
    if (goblin.state === "death") {
        if (goblin.anim.done) msgEl.textContent = "You win!";
        return;
    }

    const dx = hero.x - goblin.x;
    const dist = Math.abs(dx);
    const dir = Math.sign(dx) || 1;
    goblin.dir = dir;

    if (goblin._iframes > 0) goblin._iframes -= dt;

    // Simple AI: chase when close, otherwise patrol
    if (dist < 260 && hero.state !== "death") {
        // Attack when touching
        const reach = goblin.box(CONFIG.goblin.attackBox);
        const hbox = hero.box(CONFIG.hero.hitbox);
        if (AABB(reach, hbox)) {
            if (!goblin._atkTimer || goblin._atkTimer <= 0) {
                setGoblinState("attack");
                goblin._atkTimer = 0.8;
                // damage hero at mid swing
            }
        } else {
            // Walk toward
            goblin.x += CONFIG.goblin.speed * dir * dt;
            if (goblin.state !== "walk") setGoblinState("walk");
        }
    } else {
        // idle
        if (goblin.state !== "idle") setGoblinState("idle");
    }

    // Resolve attack timing & hero damage
    if (goblin._atkTimer > 0) {
        goblin._atkTimer -= dt;
        if (goblin._atkTimer < 0.4 && !goblin._didHit) { // strike moment
            const reach = goblin.box(CONFIG.goblin.attackBox);
            const hbox = hero.box(CONFIG.hero.hitbox);
            if (AABB(reach, hbox) && hero.state !== "death") {
                damageHero();
                goblin._didHit = true;
            }
        }
        if (goblin._atkTimer <= 0) {
            goblin._didHit = false;
            setGoblinState("idle");
        }
    }
}

function damageHero() {
    if (hero._iframes > 0) return;
    hero._iframes = 0.8;
    hero.hp -= 1;
    heartsEl.textContent = "❤".repeat(Math.max(0, hero.hp));
    setHeroState("hurt");
    if (hero.hp <= 0) {
        setHeroState("death");
        msgEl.textContent = "You were defeated...";
        restartBtn.classList.remove("hidden");
    } else {
        setTimeout(() => {
            setHeroState("idle");
        }, 350);
    }
}

function drawBG() {
    // parallax blobs
    ctx.fillStyle = "#7bc8f6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#a8e0ff";
    for (let i = 0; i < 10; i++) {
        ctx.fillRect(i * 120, 100 + Math.sin(i) * 12, 80, 16);
    }
    // platforms
    for (const p of platforms) {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.w, p.h);
    }
}

let last = 0;

function loop(t) {
    const dt = Math.min(1 / 30, (t - last) / 1000 || 0);
    last = t;
    // update
    handleHero(dt);
    handleGoblin(dt);
    hero.update(dt);
    goblin.update(dt);

    // draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBG();
    goblin.draw(ctx);
    hero.draw(ctx);

    requestAnimationFrame(loop);
}

restartBtn.addEventListener("click", () => {
    setHeroState("idle");
    hero.hp = 3;
    heartsEl.textContent = "❤❤❤";
    msgEl.textContent = "";
    hero.x = 80;
    hero.y = CONFIG.groundY - hero.h * hero.scale;
    hero.vx = hero.vy = 0;
    hero._iframes = 0;
    goblin.hp = 3;
    setGoblinState("walk");
    goblin.x = 640;
    goblin._iframes = 0;
    goblin._atkTimer = 0;
    goblin._didHit = false;
    restartBtn.classList.add("hidden");
});

window.addEventListener("load", boot);
