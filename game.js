// ─────────────────────────────────────────────
//  NUMBER ZAP – Body Movement Mini-Game
//  Uses p5.js + ml5.js FaceMesh (nose tracking)
// ─────────────────────────────────────────────

// ── Configuration ───────────────────────────
const GAME_DURATION = 60;
const CATCH_RATIO   = 0.06;
const EMOJI_RATIO   = 0.14;
const TRAIL_LEN     = 10;
const MAX_PARTICLES = 150;

const ALIENS  = ['6'];
const BADS    = ['💣', '🧨', '🦠'];
const BONUSES = ['7'];

const ALIEN_RATE = 0.58;
const BAD_RATE   = 0.27;

// ── Cartoon palette ─────────────────────────
const C_BG1    = [28, 12, 66];
const C_BG2    = [12, 4, 32];
const C_PINK   = [255, 70, 180];
const C_LIME   = [68, 255, 120];
const C_GOLD   = [255, 215, 0];
const C_CYAN   = [0, 220, 255];
const C_RED    = [255, 60, 70];
const C_PURPLE = [180, 100, 255];

// ── State ───────────────────────────────────
let video, faceMesh, detectedFaces = [];
let emojis = [], particles = [], bgStars = [];
let bgBuffer = null;

let score = 0, displayScore = 0;
let combo = 0, bestCombo = 0;
let highScore = parseInt(localStorage.getItem('alienZapHigh')) || 0;

let gameState   = 'loading';
let timeLeft    = GAME_DURATION;
let lastTime    = 0;
let lastSpawn   = 0;
let screenShake = 0;
let scorePulse  = 0;
let bonusFlash  = 0;
let catchRadius, emojiSize;

// 4:3 video rect (centered)
let vr = { x: 0, y: 0, w: 640, h: 480 };

let nose = { x: -200, y: -200, sx: -200, sy: -200, trail: [], on: false };

// ── p5 lifecycle ────────────────────────────
function preload() {
  faceMesh = ml5.faceMesh({ flipped: true });
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  computeVR();
  sizing();

  navigator.mediaDevices.getUserMedia({ video: true }).then(function(stream) {
    stream.getTracks().forEach(t => t.stop());
    video = createCapture(VIDEO);
    video.size(640, 480);
    video.hide();
    faceMesh.detectStart(video, r => { detectedFaces = r; });
  }).catch(function() {
    gameState = 'error';
  });

  textAlign(CENTER, CENTER);
  lastTime = millis();

  for (let i = 0; i < 90; i++) {
    bgStars.push({
      x: random(width), y: random(height),
      s: random(1.2, 4), sp: random(0.08, 0.45),
      a: random(50, 180),
      twinkle: random(0.02, 0.07),
      col: random() < 0.25 ? C_GOLD
         : random() < 0.4  ? C_CYAN
         : [255, 255, 255]
    });
  }

  gameState = 'start';
  let loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('hidden');
    loader.addEventListener('transitionend', () => loader.remove());
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeVR();
  sizing();
  buildBgBuffer();
}

function computeVR() {
  let a = 4 / 3;
  if (width / height > a) {
    vr.h = height;
    vr.w = vr.h * a;
  } else {
    vr.w = width;
    vr.h = vr.w / a;
  }
  vr.x = (width - vr.w) / 2;
  vr.y = (height - vr.h) / 2;
}

function sizing() {
  let m = min(vr.w, vr.h);
  catchRadius = m * CATCH_RATIO;
  emojiSize   = m * EMOJI_RATIO;
}

// ── Main draw ───────────────────────────────
function draw() {
  let now = millis();
  let dt  = constrain((now - lastTime) / 1000, 0, 0.1);
  lastTime = now;

  background(C_BG2[0], C_BG2[1], C_BG2[2]);
  drawSpaceBg();

  push();
  if (screenShake > 0) {
    translate(random(-screenShake, screenShake), random(-screenShake, screenShake));
    screenShake *= 0.85;
    if (screenShake < 0.3) screenShake = 0;
  }

  drawVideoArea();
  updateNose();

  switch (gameState) {
    case 'loading': drawLoading(); break;
    case 'start':   drawStart();   break;
    case 'playing': tick(dt); drawGame(); break;
    case 'gameover':
      updateParticles();
      drawEmojis();
      drawParticles();
      drawGameOver();
      break;
    case 'error': drawError(); break;
  }

  drawNose();

  if (bonusFlash > 0) {
    noStroke();
    fill(C_GOLD[0], C_GOLD[1], C_GOLD[2], bonusFlash * 55);
    rect(vr.x, vr.y, vr.w, vr.h);
    bonusFlash *= 0.87;
    if (bonusFlash < 0.01) bonusFlash = 0;
  }

  pop();
  drawVideoFrame();
}

// ── Space background ────────────────────────
function buildBgBuffer() {
  if (bgBuffer) bgBuffer.remove();
  bgBuffer = createGraphics(width, height);
  bgBuffer.noStroke();
  for (let y = 0; y < height; y += 3) {
    let t = y / height;
    bgBuffer.fill(
      lerp(C_BG1[0], C_BG2[0], t),
      lerp(C_BG1[1], C_BG2[1], t),
      lerp(C_BG1[2], C_BG2[2], t)
    );
    bgBuffer.rect(0, y, width, 3);
  }
}

function drawSpaceBg() {
  if (!bgBuffer) buildBgBuffer();
  image(bgBuffer, 0, 0);

  noStroke();
  for (let s of bgStars) {
    s.y -= s.sp;
    if (s.y < -5) { s.y = height + 5; s.x = random(width); }
    let ta = s.a + sin(frameCount * s.twinkle) * 50;
    ta = max(20, ta);
    fill(s.col[0], s.col[1], s.col[2], ta);
    circle(s.x, s.y, s.s);
    if (s.s > 3) {
      fill(s.col[0], s.col[1], s.col[2], ta * 0.25);
      rect(s.x - s.s * 1.6, s.y - 0.5, s.s * 3.2, 1);
      rect(s.x - 0.5, s.y - s.s * 1.6, 1, s.s * 3.2);
    }
  }
}

// ── Video area (4:3 centered, mirrored) ─────
function drawVideoArea() {
  if (!video) return;
  push();
  translate(vr.x + vr.w, vr.y);
  scale(-1, 1);
  tint(255, 220);
  image(video, 0, 0, vr.w, vr.h);
  noTint();
  pop();

  noStroke();
  fill(C_BG2[0], C_BG2[1], C_BG2[2], 60);
  rect(vr.x, vr.y, vr.w, vr.h);
}

function drawVideoFrame() {
  push();
  noFill();
  let ctx = drawingContext;

  ctx.shadowBlur  = 22;
  ctx.shadowColor = `rgba(${C_PURPLE[0]},${C_PURPLE[1]},${C_PURPLE[2]},0.45)`;
  stroke(C_PURPLE[0], C_PURPLE[1], C_PURPLE[2], 100);
  strokeWeight(3);
  rect(vr.x, vr.y, vr.w, vr.h, 10);
  ctx.shadowBlur = 0;

  stroke(C_PINK[0], C_PINK[1], C_PINK[2], 40);
  strokeWeight(1);
  rect(vr.x - 4, vr.y - 4, vr.w + 8, vr.h + 8, 13);
  pop();
}

// ── Nose tracking (FaceMesh) ─────────────────
function updateNose() {
  nose.on = false;

  let sx = vr.w / 640, sy = vr.h / 480;
  if (detectedFaces.length > 0) {
    let face = detectedFaces[0];
    let tip  = face.keypoints[1]; // nose tip
    if (tip) {
      nose.x  = tip.x * sx + vr.x;
      nose.y  = tip.y * sy + vr.y;
      nose.on = true;
    }
  }

  nose.sx = lerp(nose.sx, nose.x, 0.42);
  nose.sy = lerp(nose.sy, nose.y, 0.42);
  if (nose.on) {
    nose.trail.push({ x: nose.sx, y: nose.sy });
    if (nose.trail.length > TRAIL_LEN) nose.trail.shift();
  }
}

function drawNose() {
  if (!nose.on || nose.sx < -100) return;

  for (let i = 0; i < nose.trail.length; i++) {
    let t  = nose.trail[i];
    let a  = map(i, 0, nose.trail.length, 5, 50);
    let sz = map(i, 0, nose.trail.length, 4, catchRadius * 1.3);
    noStroke();
    fill(C_PINK[0], C_PINK[1], C_PINK[2], a);
    circle(t.x, t.y, sz);
  }

  noStroke();
  for (let r = catchRadius * 2; r > 6; r -= 6) {
    fill(C_PINK[0], C_PINK[1], C_PINK[2], map(r, catchRadius * 2, 6, 4, 35));
    circle(nose.sx, nose.sy, r);
  }

  push();
  noFill();
  stroke(C_PINK[0], C_PINK[1], C_PINK[2], 55);
  strokeWeight(1.5);
  drawingContext.setLineDash([5, 7]);
  circle(nose.sx, nose.sy, catchRadius * 2);
  drawingContext.setLineDash([]);
  pop();

  let ctx = drawingContext;
  ctx.shadowBlur  = 22;
  ctx.shadowColor = `rgba(${C_PINK[0]},${C_PINK[1]},${C_PINK[2]},0.75)`;
  noStroke();
  fill(C_PINK[0], C_PINK[1], C_PINK[2], 225);
  circle(nose.sx, nose.sy, 16);
  ctx.shadowBlur = 0;

  fill(255, 255, 255, 245);
  circle(nose.sx, nose.sy, 6);
}

// ── Emoji system ────────────────────────────
function spawnEmoji() {
  let r = random();
  let type, emoji;
  if (r < ALIEN_RATE) {
    type = 'alien'; emoji = random(ALIENS);
  } else if (r < ALIEN_RATE + BAD_RATE) {
    type = 'bad'; emoji = random(BADS);
  } else {
    type = 'bonus'; emoji = random(BONUSES);
  }

  let sz = emojiSize * random(0.9, 1.2);
  let m  = vr.h / 800;

  emojis.push({
    emoji, type,
    x: random(vr.x + sz + 20, vr.x + vr.w - sz - 20),
    y: vr.y + vr.h + sz,
    spd: random(2.0, 4.5) * m,
    wPhase: random(TWO_PI),
    wFreq:  random(0.012, 0.032),
    wAmp:   random(10, 32),
    size: sz, rot: 0,
    rotSpd: random(-0.022, 0.022),
    opacity: 255, scale: 1, caught: false
  });
}

function updateEmojis() {
  for (let i = emojis.length - 1; i >= 0; i--) {
    let e = emojis[i];

    if (e.caught) {
      e.opacity -= 22;
      e.scale   += 0.12;
      if (e.opacity <= 0) emojis.splice(i, 1);
      continue;
    }

    e.y   -= e.spd;
    e.x   += sin(frameCount * e.wFreq + e.wPhase) * e.wAmp * 0.013;
    e.rot += e.rotSpd;
    e.x    = constrain(e.x, vr.x + e.size * 0.5, vr.x + vr.w - e.size * 0.5);

    if (nose.on && dist(nose.sx, nose.sy, e.x, e.y) < catchRadius + e.size * 0.4) {
      e.caught = true;
      if (e.type === 'alien' || e.type === 'bonus') {
        combo++;
        if (combo > bestCombo) bestCombo = combo;
        let base = e.type === 'bonus' ? 25 : 10;
        let pts  = base + floor(combo / 3) * 5;
        score += pts;
        scorePulse = 1;
        let col = e.type === 'bonus' ? C_GOLD : C_LIME;
        burstParticles(e.x, e.y, col, pts);
        if (e.type === 'bonus') bonusFlash = 1;
      } else {
        combo = 0;
        score = max(0, score - 15);
        screenShake = 14;
        scorePulse  = 1;
        burstParticles(e.x, e.y, C_RED, -15);
      }
    }

    if (e.y < vr.y - e.size - 10) {
      if (e.type === 'alien') combo = 0;
      emojis.splice(i, 1);
    }
  }
}

function drawEmojis() {
  for (let e of emojis) {
    if (e.opacity <= 0) continue;
    push();
    translate(e.x, e.y);
    rotate(e.rot);

    let ctx = drawingContext;

    if (e.type === 'bonus' && !e.caught) {
      ctx.shadowBlur  = 16 + sin(frameCount * 0.12) * 8;
      ctx.shadowColor = 'rgba(255,215,0,0.55)';
    }

    if (e.caught) {
      ctx.globalAlpha = e.opacity / 255;
      ctx.shadowBlur  = 40;
      if (e.type === 'bonus')     ctx.shadowColor = 'rgba(255,215,0,0.9)';
      else if (e.type === 'alien') ctx.shadowColor = `rgba(${C_LIME[0]},${C_LIME[1]},${C_LIME[2]},0.9)`;
      else                         ctx.shadowColor = `rgba(${C_RED[0]},${C_RED[1]},${C_RED[2]},0.9)`;
    }

    noStroke();
    if (e.type === 'alien' || e.type === 'bonus') {
      textFont('Outfit');
      textStyle(BOLD);
      fill(e.type === 'bonus' ? C_GOLD[0] : C_LIME[0],
           e.type === 'bonus' ? C_GOLD[1] : C_LIME[1],
           e.type === 'bonus' ? C_GOLD[2] : C_LIME[2]);
    } else {
      textFont('sans-serif');
      textStyle(NORMAL);
      fill(255);
    }
    textSize(e.size * e.scale);
    text(e.emoji, 0, 0);

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
    pop();
  }
}

// ── Particles ───────────────────────────────
function burstParticles(x, y, col, pts) {
  if (particles.length >= MAX_PARTICLES) return;
  let count = pts > 0 ? 30 : 14;
  count = min(count, MAX_PARTICLES - particles.length - 2);

  for (let i = 0; i < count; i++) {
    let a = random(TWO_PI), s = random(2.5, 10);
    particles.push({
      x, y, vx: cos(a) * s, vy: sin(a) * s,
      life: 1, decay: random(0.012, 0.03),
      size: random(3, 13), color: col, type: 'dot'
    });
  }

  particles.push({
    x, y, vx: 0, vy: 0,
    life: 1, decay: 0.04,
    size: 12, color: col, type: 'ring'
  });

  particles.push({
    x, y: y - 20, vx: 0, vy: -2.2,
    life: 1, decay: 0.015,
    size: min(vr.w, vr.h) * 0.04,
    label: (pts > 0 ? '+' : '') + pts,
    color: col, type: 'text'
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.life -= p.decay;
    if (p.type === 'dot')  p.vy += 0.13;
    if (p.type === 'ring') p.size += 7;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (let p of particles) {
    push(); noStroke();
    let a = p.life * 255;

    if (p.type === 'text') {
      textFont('Outfit'); textSize(p.size); textStyle(BOLD);
      let ctx = drawingContext;
      ctx.shadowBlur  = 14;
      ctx.shadowColor = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},0.6)`;
      fill(p.color[0], p.color[1], p.color[2], a);
      text(p.label, p.x, p.y);
      ctx.shadowBlur = 0;
    } else if (p.type === 'ring') {
      noFill();
      stroke(p.color[0], p.color[1], p.color[2], a * 0.55);
      strokeWeight(2.5);
      circle(p.x, p.y, p.size);
    } else {
      fill(p.color[0], p.color[1], p.color[2], a);
      circle(p.x, p.y, p.size * p.life);
    }
    pop();
  }
}

// ── Game tick ────────────────────────────────
function tick(dt) {
  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    gameState = 'gameover';
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('alienZapHigh', highScore);
    }
    return;
  }

  let elapsed  = GAME_DURATION - timeLeft;
  let interval = max(320, 1100 - elapsed * 13);
  if (millis() - lastSpawn > interval) { spawnEmoji(); lastSpawn = millis(); }

  updateEmojis();
  displayScore = lerp(displayScore, score, 0.18);
  scorePulse  *= 0.91;
  updateParticles();
}

function drawGame() {
  drawEmojis();
  drawParticles();
  drawHUD();
}

// ── HUD ─────────────────────────────────────
function drawHUD() {
  push();
  textFont('Outfit'); textAlign(CENTER, CENTER);

  let pw = min(vr.w * 0.55, 340);
  let ph = 100;
  let px = vr.x + vr.w / 2;
  let py = vr.y + 60;

  // panel with cartoon glass effect
  noStroke();
  fill(255, 255, 255, 18);
  rectMode(CENTER);
  rect(px, py, pw, ph, 24);

  stroke(C_PURPLE[0], C_PURPLE[1], C_PURPLE[2], 60);
  strokeWeight(2);
  noFill();
  rect(px, py, pw, ph, 24);

  // score
  let sc  = 1 + scorePulse * 0.16;
  let ctx = drawingContext;
  ctx.shadowBlur  = 24 + scorePulse * 40;
  ctx.shadowColor = `rgba(${C_PURPLE[0]},${C_PURPLE[1]},${C_PURPLE[2]},0.5)`;
  noStroke();
  textSize(min(58, vr.w * 0.085) * sc);
  textStyle(BOLD);
  fill(255);
  text(round(displayScore), px, py - 10);
  ctx.shadowBlur = 0;

  // timer
  let tc = timeLeft < 10 ? color(C_RED[0], C_RED[1], C_RED[2]) : color(190, 200, 225);
  fill(tc);
  textSize(min(17, vr.w * 0.028));
  textStyle(NORMAL);
  text(ceil(timeLeft) + 's', px, py + 32);

  // combo
  if (combo >= 3) {
    let cy = py + ph / 2 + 30;
    ctx.shadowBlur  = 16;
    ctx.shadowColor = `rgba(${C_GOLD[0]},${C_GOLD[1]},${C_GOLD[2]},0.7)`;
    textSize(min(28, vr.w * 0.04));
    textStyle(BOLD);
    let cs = 1 + sin(frameCount * 0.1) * 0.05;
    push(); translate(px, cy); scale(cs);
    fill(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
    text('🔥 COMBO x' + combo, 0, 0);
    pop();
    ctx.shadowBlur = 0;
  }
  pop();
}

// ── Screens ─────────────────────────────────
function drawLoading() {
  fill(0, 0, 15, 200); noStroke();
  rect(vr.x, vr.y, vr.w, vr.h);
  push(); textFont('Outfit'); textAlign(CENTER, CENTER);
  textSize(min(24, vr.w * 0.04));
  fill(C_PURPLE[0], C_PURPLE[1], C_PURPLE[2]);
  let d = '.'.repeat(floor(frameCount / 20) % 4);
  text('Loading face tracking' + d, vr.x + vr.w / 2, vr.y + vr.h / 2);
  pop();
}

function drawError() {
  fill(C_BG2[0], C_BG2[1], C_BG2[2], 220);
  noStroke();
  rect(vr.x, vr.y, vr.w, vr.h);
  push(); textFont('Outfit'); textAlign(CENTER, CENTER);
  let cx = vr.x + vr.w / 2;
  let cy = vr.y + vr.h / 2;
  textSize(min(48, vr.w * 0.07));
  fill(C_RED[0], C_RED[1], C_RED[2]);
  textStyle(BOLD);
  text('📷 Camera Required', cx, cy - 30);
  textSize(min(17, vr.w * 0.028));
  textStyle(NORMAL);
  fill(190, 200, 220);
  text('Please allow camera access and reload.', cx, cy + 20);
  pop();
}

function drawStart() {
  fill(C_BG2[0], C_BG2[1], C_BG2[2], 185);
  noStroke();
  rect(vr.x, vr.y, vr.w, vr.h);

  push();
  textFont('Outfit'); textAlign(CENTER, CENTER);
  let ctx = drawingContext;
  let cx  = vr.x + vr.w / 2;
  let cy  = vr.y + vr.h / 2;

  // bouncing emojis
  textFont('sans-serif');
  let decoSize = min(55, vr.w * 0.07);
  textSize(decoSize);
  let decos = ['6','7','6','7','6'];
  for (let i = 0; i < decos.length; i++) {
    let ex = cx + (i - 2) * min(75, vr.w * 0.09);
    let ey = cy - vr.h * 0.28 + sin(frameCount * 0.045 + i * 1.3) * 14;
    text(decos[i], ex, ey);
  }

  // title
  textFont('Outfit');
  ctx.shadowBlur  = 40;
  ctx.shadowColor = `rgba(${C_PURPLE[0]},${C_PURPLE[1]},${C_PURPLE[2]},0.6)`;
  textSize(min(82, vr.w * 0.12));
  textStyle(BOLD);
  fill(255);
  text('NUMBER', cx, cy - vr.h * 0.14);

  ctx.shadowColor = `rgba(${C_GOLD[0]},${C_GOLD[1]},${C_GOLD[2]},0.6)`;
  textSize(min(90, vr.w * 0.13));
  fill(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
  text('ZAP', cx, cy - vr.h * 0.03);
  ctx.shadowBlur = 0;

  // instructions
  textSize(min(17, vr.w * 0.028));
  textStyle(NORMAL);
  fill(200, 210, 230);
  text('Zap the 6s with your nose!', cx, cy + vr.h * 0.12);
  fill(170, 180, 200);
  text('Catch 7 for bonus · Avoid 💣🧨🦠', cx, cy + vr.h * 0.17);

  // button
  let by = cy + vr.h * 0.3;
  let bw = min(280, vr.w * 0.38);
  let bh = 56;
  ctx.shadowBlur  = 24;
  ctx.shadowColor = `rgba(${C_PURPLE[0]},${C_PURPLE[1]},${C_PURPLE[2]},0.5)`;
  fill(C_PURPLE[0], C_PURPLE[1], C_PURPLE[2]);
  rectMode(CENTER);
  rect(cx, by, bw, bh, 18);
  ctx.shadowBlur = 0;

  fill(255);
  textSize(min(22, vr.w * 0.032));
  textStyle(BOLD);
  text('START GAME', cx, by);

  if (highScore > 0) {
    textStyle(NORMAL);
    textSize(min(14, vr.w * 0.022));
    fill(150);
    text('High Score: ' + highScore, cx, by + 44);
  }
  pop();
}

function drawGameOver() {
  fill(C_BG2[0], C_BG2[1], C_BG2[2], 210);
  noStroke();
  rect(vr.x, vr.y, vr.w, vr.h);

  push();
  textFont('Outfit'); textAlign(CENTER, CENTER);
  let ctx = drawingContext;
  let cx  = vr.x + vr.w / 2;
  let cy  = vr.y + vr.h / 2;

  // title
  ctx.shadowBlur  = 30;
  ctx.shadowColor = `rgba(${C_RED[0]},${C_RED[1]},${C_RED[2]},0.5)`;
  textSize(min(58, vr.w * 0.085));
  textStyle(BOLD);
  fill(255);
  text('GAME OVER', cx, cy - vr.h * 0.2);
  ctx.shadowBlur = 0;

  // big score
  ctx.shadowBlur  = 40;
  ctx.shadowColor = `rgba(${C_PURPLE[0]},${C_PURPLE[1]},${C_PURPLE[2]},0.7)`;
  textSize(min(100, vr.w * 0.15));
  fill(C_PURPLE[0], C_PURPLE[1], C_PURPLE[2]);
  text(score, cx, cy - vr.h * 0.02);
  ctx.shadowBlur = 0;

  textSize(min(15, vr.w * 0.022));
  fill(150);
  textStyle(NORMAL);
  text('POINTS', cx, cy + vr.h * 0.07);

  textSize(min(18, vr.w * 0.028));
  fill(190, 200, 220);
  text('Best Combo: ' + bestCombo + 'x', cx, cy + vr.h * 0.13);

  if (score >= highScore && score > 0) {
    ctx.shadowBlur  = 14;
    ctx.shadowColor = `rgba(${C_GOLD[0]},${C_GOLD[1]},${C_GOLD[2]},0.7)`;
    fill(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
    textStyle(BOLD);
    textSize(min(22, vr.w * 0.032));
    text('🏆 NEW HIGH SCORE! 🏆', cx, cy + vr.h * 0.2);
    ctx.shadowBlur = 0;
  }

  // button
  let by = cy + vr.h * 0.32;
  let bw = min(280, vr.w * 0.38);
  let bh = 56;
  ctx.shadowBlur  = 24;
  ctx.shadowColor = `rgba(${C_PURPLE[0]},${C_PURPLE[1]},${C_PURPLE[2]},0.5)`;
  fill(C_PURPLE[0], C_PURPLE[1], C_PURPLE[2]);
  rectMode(CENTER);
  rect(cx, by, bw, bh, 18);
  ctx.shadowBlur = 0;

  fill(255);
  textSize(min(22, vr.w * 0.032));
  textStyle(BOLD);
  text('PLAY AGAIN', cx, by);
  pop();
}

// ── Input ───────────────────────────────────
function mousePressed()  { handleStart(mouseX, mouseY); }
function touchStarted()  { handleStart(touches[0]?.x ?? mouseX, touches[0]?.y ?? mouseY); return false; }

function isInsideButton(px, py) {
  let cx = vr.x + vr.w / 2;
  let cy = vr.y + vr.h / 2;
  let by = cy + vr.h * (gameState === 'gameover' ? 0.32 : 0.3);
  let bw = min(280, vr.w * 0.38);
  let bh = 56;
  return px > cx - bw / 2 && px < cx + bw / 2 && py > by - bh / 2 && py < by + bh / 2;
}

function handleStart(px, py) {
  if ((gameState === 'start' || gameState === 'gameover') && isInsideButton(px, py)) {
    gameState    = 'playing';
    score        = 0;
    displayScore = 0;
    combo        = 0;
    bestCombo    = 0;
    timeLeft     = GAME_DURATION;
    emojis       = [];
    particles    = [];
    screenShake  = 0;
    scorePulse   = 0;
    bonusFlash   = 0;
    lastSpawn    = millis();
  }
}
