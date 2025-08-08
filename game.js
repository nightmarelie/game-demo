/* Sprite slicer with margins/spacing + live tuning
   Controls:
   [ / ]  marginX   |  ; / ' spacingX
   , / .  frameW    |  - / = frameH
   1 show sample frame boxes | 2 show hitboxes | 3 show attack boxes | 4 toggle grid
   K attack, Space jump, arrows move
*/

const CONFIG = {
    gravity: 1800,
    groundY: 420,
    canvas: {w: 960, h: 540},

    // ---- HERO ----
    hero: {
        url: "assets/hero.png",
        rows: 8, cols: 10,       // frame count *not* used for slicing; just for animations
        // Initial guesses — you will tune these live:
        frameW: 96, frameH: 96,  // width/height of each sprite rectangle
        marginX: 8, marginY: 8,  // left/top padding before the first sprite
        spacingX: 8, spacingY: 8,// horizontal/vertical gap between sprites
        rowHeight: 96,           // vertical pitch from row to row (usually frameH + spacingY)

        // animation: [rowIndex, startCol, endCol]
        fps: {idle: 8, run: 12, jump: 10, attack: 14, crouch: 8, hurt: 10, death: 10, victory: 8},
        anim: {
            idle: [0, 0, 5],
            run: [1, 0, 7],
            jump: [2, 0, 4],
            attack: [3, 0, 7],
            crouch: [4, 0, 3],
            hurt: [5, 0, 3],
            death: [6, 0, 7],
            victory: [7, 0, 5]
        },
        speed: 220, jumpV: 650,
        hitbox: {x: 14, y: 12, w: 30, h: 44},
        attackBox: {x: 38, y: 12, w: 44, h: 40},
        scale: 2
    },

    // ---- GOBLIN ----
    goblin: {
        url: "assets/goblin.png",
        rows: 6, cols: 8,
        frameW: 96, frameH: 96,
        marginX: 8, marginY: 8,
        spacingX: 8, spacingY: 12,
        rowHeight: 96,

        fps: {idle: 8, walk: 10, attack: 10, hurt: 10, death: 10},
        anim: {
            idle: [0, 0, 5],
            walk: [1, 0, 5],
            attack: [2, 0, 5],
            hurt: [3, 0, 3],
            death: [4, 0, 5]
        },
        speed: 120,
        hitbox: {x: 12, y: 10, w: 30, h: 44},
        attackBox: {x: 30, y: 10, w: 36, h: 40},
        scale: 2
    }
};

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = CONFIG.canvas.w;
canvas.height = CONFIG.canvas.h;

const keys = {};
addEventListener("keydown", e => keys[e.code] = true);
addEventListener("keyup", e => keys[e.code] = false);

function loadImage(src) {
    return new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = src;
    });
}

// Compute source rect for (row,col) using margin/spacing/frameW/H
function srcRect(sheet, row, col) {
    const sx = sheet.marginX + col * (sheet.frameW + sheet.spacingX);
    const sy = sheet.marginY + row * (sheet.rowHeight + sheet.spacingY);
    return {sx, sy, sw: sheet.frameW, sh: sheet.frameH};
}

class Sprite {
    constructor(img, sheet) {
        this.img = img;
        this.sheet = sheet;
    }

    draw(ctx, col, row, dx, dy, dw, dh, flip = false, debug = false) {
        const s = srcRect(this.sheet, row, col);
        ctx.save();
        if (flip) {
            ctx.translate(dx + dw, dy);
            ctx.scale(-1, 1);
            dx = 0;
            dy = 0;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.img, s.sx, s.sy, s.sw, s.sh, dx, dy, dw, dh);
        if (debug) {
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.lineWidth = 1;
            ctx.strokeRect(dx, dy, dw, dh);
        }
        ctx.restore();
    }
}

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

class Entity {
    constructor(img, cfg) {
        this.cfg = cfg;
        this.sprite = new Sprite(img, cfg);
        this.w = cfg.frameW;
        this.h = cfg.frameH;
        this.scale = cfg.scale || 2;
        this.x = 100;
        this.y = CONFIG.groundY - this.h * this.scale;
        this.vx = 0;
        this.vy = 0;
        this.dir = 1;
        this.hp = 3;
        this.state = "idle";
        this.anim = new Animator(cfg.anim, cfg.fps);
    }

    box(rect) {
        const s = this.scale;
        return {x: this.x + rect.x * s, y: this.y + rect.y * s, w: rect.w * s, h: rect.h * s};
    }

    set(name) {
        this.state = name;
        this.anim.set(name);
    }

    update(dt) {
        this.anim.update(dt);
    }

    draw(debug = false) {
        const dw = this.w * this.scale, dh = this.h * this.scale;
        this.sprite.draw(ctx, this.anim.col, this.anim.row, this.x, this.y, dw, dh, this.dir < 0, debug);
    }
}

let hero, goblin, heroImg, gobImg;
let debug = {frame: false, hit: false, atk: false, grid: false};

async function boot() {
    [heroImg, gobImg] = await Promise.all([loadImage(CONFIG.hero.url), loadImage(CONFIG.goblin.url)]);

    hero = new Entity(heroImg, CONFIG.hero);
    hero.x = 80;
    goblin = new Entity(gobImg, CONFIG.goblin);
    goblin.x = 640;
    goblin.set("walk");

    requestAnimationFrame(loop);
}

function handleHero(dt) {
    const H = CONFIG.hero;
    let moving = false;
    let onGround = false;
    if (keys["ArrowLeft"]) {
        hero.vx = -H.speed;
        hero.dir = -1;
        moving = true;
    }
    if (keys["ArrowRight"]) {
        hero.vx = H.speed;
        hero.dir = 1;
        moving = true;
    }
    if (!moving) hero.vx = 0;
    if (keys["Space"] && hero._canJump) {
        hero.vy = -H.jumpV;
        hero._canJump = false;
        hero.set("jump");
    }
    hero.vy += CONFIG.gravity * dt;
    hero.x += hero.vx * dt;
    hero.y += hero.vy * dt;

    const groundY = CONFIG.groundY - hero.h * hero.scale;
    if (hero.y >= groundY) {
        hero.y = groundY;
        hero.vy = 0;
        onGround = true;
        hero._canJump = true;
    }
    if (onGround) {
        if (moving && hero.state !== "attack") hero.set("run");
        if (!moving && hero.state !== "attack") hero.set("idle");
    } else if (hero.state !== "attack") {
        hero.set("jump");
    }

    if (keys["KeyK"] && hero._atkCooldown <= 0 && hero.state !== "death") {
        hero._atkCooldown = 0.5;
        hero.set("attack");
    }
    if (hero._atkCooldown > 0) hero._atkCooldown -= dt;
}

function handleGoblin(dt) {
    if (goblin.state === "death") return;
    const dx = hero.x - goblin.x, dist = Math.abs(dx), dir = Math.sign(dx) || 1;
    goblin.dir = dir;
    if (dist < 260) goblin.x += CONFIG.goblin.speed * dir * dt, goblin.set("walk"); else goblin.set("idle");
}

function drawBG() {
    ctx.fillStyle = "#7bc8f6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#a8e0ff";
    for (let i = 0; i < 10; i++) {
        ctx.fillRect(i * 120, 100 + Math.sin(i) * 12, 80, 16);
    }
    ctx.fillStyle = "#3a2a16";
    ctx.fillRect(0, CONFIG.groundY + 64, canvas.width, canvas.height - (CONFIG.groundY + 64));
}

let last = 0;

function loop(t) {
    const dt = Math.min(1 / 30, (t - last) / 1000 || 0);
    last = t;
    handleHero(dt);
    handleGoblin(dt);
    hero.update(dt);
    goblin.update(dt);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBG();

    if (debug.grid) {
        ctx.strokeStyle = "rgba(0,0,0,.2)";
        for (let x = 0; x < canvas.width; x += 16) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 16) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }

    goblin.draw(debug.frame);
    hero.draw(debug.frame);

    requestAnimationFrame(loop);
}

// ---- Live tuning controls ----
addEventListener("keydown", e => {
    let changed = false;
    const step = (e.shiftKey ? 4 : 1);
    const heroSheet = CONFIG.hero;
    const gobSheet = CONFIG.goblin;
    const sheets = [heroSheet, gobSheet];
    switch (e.key) {
        case '[':
            sheets.forEach(s => s.marginX -= step);
            changed = true;
            break;
        case ']':
            sheets.forEach(s => s.marginX += step);
            changed = true;
            break;
        case ';':
            sheets.forEach(s => s.spacingX -= step);
            changed = true;
            break;
        case "'":
            sheets.forEach(s => s.spacingX += step);
            changed = true;
            break;
        case ',':
            sheets.forEach(s => s.frameW -= step);
            changed = true;
            break;
        case '.':
            sheets.forEach(s => s.frameW += step);
            changed = true;
            break;
        case '-':
            sheets.forEach(s => s.frameH -= step);
            changed = true;
            break;
        case '=':
            sheets.forEach(s => s.frameH += step);
            changed = true;
            break;
        case '1':
            debug.frame = !debug.frame;
            console.log('debug frame:', debug.frame);
            break;
        case '2':
            debug.hit = !debug.hit;
            break;
        case '3':
            debug.atk = !debug.atk;
            break;
        case '4':
            debug.grid = !debug.grid;
            break;
    }
    if (changed) {
        console.log('Tuned:', {
            marginX: heroSheet.marginX, marginY: heroSheet.marginY,
            spacingX: heroSheet.spacingX, spacingY: heroSheet.spacingY,
            frameW: heroSheet.frameW, frameH: heroSheet.frameH
        });
    }
});

window.addEventListener("load", boot);
