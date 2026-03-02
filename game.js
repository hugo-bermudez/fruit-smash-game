// ─────────────────────────────────────────────
//  FRUIT SMASH – Body Movement Mini-Game
//  Uses p5.js + ml5.js HandPose
// ─────────────────────────────────────────────

// ── Configuration ───────────────────────────
const GAME_DURATION    = 60;
const CATCH_RATIO      = 0.055;
const EMOJI_RATIO      = 0.13;
const TRAIL_LEN        = 10;
const FRUIT_CHANCE     = 0.72;

const FRUITS = [
  '🍎','🍊','🍋','🍇','🍓','🍑','🍒','🍌','🍉','🥝','🍍','🥭','🫐','🍈'
];
const BADS = ['💣','💀','🧨','👾','🦠'];

// ── State ───────────────────────────────────
let video, handPose, detectedHands = [];
let emojis     = [];
let particles  = [];
let bgStars    = [];

let score        = 0;
let displayScore = 0;
let combo        = 0;
let bestCombo    = 0;
let highScore    = 0;

let gameState    = 'loading';
let timeLeft     = GAME_DURATION;
let lastTime     = 0;
let lastSpawn    = 0;
let screenShake  = 0;
let scorePulse   = 0;
let catchRadius, emojiSize;

let hands = [
  { x:-200, y:-200, sx:-200, sy:-200, trail:[], on:false },
  { x:-200, y:-200, sx:-200, sy:-200, trail:[], on:false }
];

// ── p5 lifecycle ────────────────────────────
function preload() {
  handPose = ml5.handPose({ flipped: true });
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  sizing();

  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();

  handPose.detectStart(video, r => { detectedHands = r; });

  textAlign(CENTER, CENTER);
  lastTime = millis();

  for (let i = 0; i < 70; i++) {
    bgStars.push({
      x: random(width), y: random(height),
      s: random(1, 2.8), sp: random(0.15, 0.65), a: random(25, 90)
    });
  }

  gameState = 'start';
  let loader = document.getElementById('loader');
  if (loader) loader.classList.add('hidden');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  sizing();
}

function sizing() {
  let m = min(width, height);
  catchRadius = m * CATCH_RATIO;
  emojiSize   = m * EMOJI_RATIO;
}

// ── Main draw loop ──────────────────────────
function draw() {
  let now = millis();
  let dt  = constrain((now - lastTime) / 1000, 0, 0.1);
  lastTime = now;

  background(8, 4, 22);

  push();
  if (screenShake > 0) {
    translate(random(-screenShake, screenShake), random(-screenShake, screenShake));
    screenShake *= 0.87;
    if (screenShake < 0.3) screenShake = 0;
  }

  mirrorVideo();
  drawStars();
  updateHands();

  switch (gameState) {
    case 'loading': drawLoading();   break;
    case 'start':   drawStart();     break;
    case 'playing': tick(dt); drawGame(); break;
    case 'gameover':
      updateParticles();
      drawEmojis();
      drawParticles();
      drawGameOver();
      break;
  }

  drawHands();
  vignette();
  pop();
}

// ── Video background (mirrored) ─────────────
function mirrorVideo() {
  push();
  translate(width, 0);
  scale(-1, 1);
  tint(255, 130);
  image(video, 0, 0, width, height);
  noTint();
  pop();

  noStroke();
  let c1 = color(8, 4, 22, 145);
  let c2 = color(8, 4, 22, 200);
  for (let y = 0; y < height; y += 3) {
    fill(lerpColor(c1, c2, y / height));
    rect(0, y, width, 3);
  }
}

function drawStars() {
  noStroke();
  for (let s of bgStars) {
    s.y -= s.sp;
    if (s.y < -4) { s.y = height + 4; s.x = random(width); }
    fill(160, 210, 255, s.a);
    circle(s.x, s.y, s.s);
  }
}

function vignette() {
  let ctx = drawingContext;
  let g = ctx.createRadialGradient(
    width / 2, height / 2, min(width, height) * 0.28,
    width / 2, height / 2, max(width, height) * 0.78
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

// ── Hand tracking (index finger tips) ───────
function updateHands() {
  // Reset both hands, then fill from detected results
  hands[0].on = false;
  hands[1].on = false;

  let sx = width / 640, sy = height / 480;
  for (let i = 0; i < min(detectedHands.length, 2); i++) {
    let hand = detectedHands[i];
    // keypoint 8 = index_finger_tip
    let tip = hand.keypoints[8];
    if (tip && (tip.confidence === undefined || tip.confidence > 0.2)) {
      hands[i].x  = tip.x * sx;
      hands[i].y  = tip.y * sy;
      hands[i].on = true;
    }
  }

  for (let h of hands) {
    h.sx = lerp(h.sx, h.x, 0.42);
    h.sy = lerp(h.sy, h.y, 0.42);
    if (h.on) {
      h.trail.push({ x: h.sx, y: h.sy });
      if (h.trail.length > TRAIL_LEN) h.trail.shift();
    }
  }
}

function drawHands() {
  for (let h of hands) {
    if (!h.on || h.sx < -100) continue;

    // trail
    for (let i = 0; i < h.trail.length; i++) {
      let t  = h.trail[i];
      let a  = map(i, 0, h.trail.length, 6, 45);
      let sz = map(i, 0, h.trail.length, 6, catchRadius * 1.4);
      noStroke(); fill(0, 255, 200, a);
      circle(t.x, t.y, sz);
    }

    // glow rings
    noStroke();
    for (let r = catchRadius * 2; r > 8; r -= 7) {
      fill(0, 255, 200, map(r, catchRadius * 2, 8, 5, 40));
      circle(h.sx, h.sy, r);
    }

    // dashed reach circle
    push();
    noFill();
    stroke(0, 255, 200, 55);
    strokeWeight(1.5);
    drawingContext.setLineDash([6, 8]);
    circle(h.sx, h.sy, catchRadius * 2);
    drawingContext.setLineDash([]);
    pop();

    // core
    let ctx = drawingContext;
    ctx.shadowBlur  = 24;
    ctx.shadowColor = 'rgba(0,255,200,0.75)';
    noStroke(); fill(0, 255, 210, 220);
    circle(h.sx, h.sy, 18);
    ctx.shadowBlur = 0;

    fill(255, 255, 255, 245);
    circle(h.sx, h.sy, 7);
  }
}

// ── Emoji system ────────────────────────────
function spawnEmoji() {
  let fruit = random() < FRUIT_CHANCE;
  let e     = fruit ? random(FRUITS) : random(BADS);
  let sz    = emojiSize * random(0.88, 1.25);
  let m     = min(width, height) / 800;

  emojis.push({
    emoji: e, fruit: fruit,
    x: random(sz + 30, width - sz - 30),
    y: height + sz,
    spd: random(1.3, 3.2) * m,
    wPhase: random(TWO_PI),
    wFreq:  random(0.012, 0.035),
    wAmp:   random(12, 38),
    size: sz, rot: 0,
    rotSpd: random(-0.028, 0.028),
    opacity: 255, scale: 1, caught: false
  });
}

function updateEmojis(dt) {
  for (let i = emojis.length - 1; i >= 0; i--) {
    let e = emojis[i];

    if (e.caught) {
      e.opacity -= 20;
      e.scale   += 0.1;
      if (e.opacity <= 0) { emojis.splice(i, 1); }
      continue;
    }

    e.y   -= e.spd;
    e.x   += sin(frameCount * e.wFreq + e.wPhase) * e.wAmp * 0.014;
    e.rot += e.rotSpd;

    for (let h of hands) {
      if (!h.on) continue;
      if (dist(h.sx, h.sy, e.x, e.y) < catchRadius + e.size * 0.38) {
        e.caught = true;
        if (e.fruit) {
          combo++;
          if (combo > bestCombo) bestCombo = combo;
          let pts = 10 + floor(combo / 3) * 5;
          score += pts;
          scorePulse = 1;
          burstParticles(e.x, e.y, true, pts);
        } else {
          combo = 0;
          score = max(0, score - 15);
          screenShake = 14;
          scorePulse  = 1;
          burstParticles(e.x, e.y, false, -15);
        }
        break;
      }
    }

    if (e.y < -e.size - 10) {
      if (e.fruit) combo = 0;
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
    if (e.caught) {
      ctx.globalAlpha = e.opacity / 255;
      ctx.shadowBlur  = 35;
      ctx.shadowColor = e.fruit
        ? 'rgba(0,255,140,0.85)' : 'rgba(255,50,60,0.85)';
    }

    textFont('sans-serif');
    textSize(e.size * e.scale);
    text(e.emoji, 0, 0);

    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
    pop();
  }
}

// ── Particles ───────────────────────────────
function burstParticles(x, y, good, pts) {
  let col   = good ? [0, 255, 160] : [255, 60, 80];
  let count = good ? 28 : 14;

  for (let i = 0; i < count; i++) {
    let a = random(TWO_PI), s = random(2.5, 9);
    particles.push({
      x, y, vx: cos(a) * s, vy: sin(a) * s,
      life: 1, decay: random(0.013, 0.032),
      size: random(3, 11), color: col, type: 'dot'
    });
  }

  // shockwave ring
  particles.push({
    x, y, vx: 0, vy: 0,
    life: 1, decay: 0.045,
    size: 10, color: col, type: 'ring'
  });

  // score popup
  particles.push({
    x, y: y - 18, vx: 0, vy: -2,
    life: 1, decay: 0.016,
    size: min(width, height) * 0.034,
    label: (pts > 0 ? '+' : '') + pts,
    color: col, type: 'text'
  });
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.life -= p.decay;
    if (p.type === 'dot') p.vy += 0.13;
    if (p.type === 'ring') p.size += 6;
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
      ctx.shadowBlur  = 12;
      ctx.shadowColor = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},0.6)`;
      fill(p.color[0], p.color[1], p.color[2], a);
      text(p.label, p.x, p.y);
      ctx.shadowBlur = 0;
    } else if (p.type === 'ring') {
      noFill();
      stroke(p.color[0], p.color[1], p.color[2], a * 0.6);
      strokeWeight(2);
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
    if (score > highScore) highScore = score;
    return;
  }

  let elapsed  = GAME_DURATION - timeLeft;
  let interval = max(320, 1100 - elapsed * 13);
  if (millis() - lastSpawn > interval) { spawnEmoji(); lastSpawn = millis(); }

  updateEmojis(dt);
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

  let pw = min(360, width * 0.42);
  let ph = 95;
  let px = width / 2, py = 58;

  // panel bg
  noStroke(); fill(0, 0, 0, 110);
  rectMode(CENTER);
  rect(px, py, pw, ph, 22);

  // score
  let sc = 1 + scorePulse * 0.14;
  let ctx = drawingContext;
  ctx.shadowBlur  = 22 + scorePulse * 35;
  ctx.shadowColor = 'rgba(0,255,200,0.45)';
  textSize(min(54, width * 0.065) * sc);
  textStyle(BOLD); fill(255);
  text(round(displayScore), px, py - 10);
  ctx.shadowBlur = 0;

  // timer
  let tc = timeLeft < 10 ? color(255, 75, 85) : color(175, 195, 215);
  fill(tc); textSize(min(17, width * 0.022)); textStyle(NORMAL);
  text(ceil(timeLeft) + 's', px, py + 30);

  // combo
  if (combo >= 3) {
    let cy = py + ph / 2 + 28;
    ctx.shadowBlur  = 14;
    ctx.shadowColor = 'rgba(255,215,0,0.65)';
    textSize(min(26, width * 0.033)); textStyle(BOLD);
    let cs = 1 + sin(frameCount * 0.1) * 0.04;
    push(); translate(px, cy); scale(cs);
    fill(255, 215, 0);
    text('🔥 COMBO x' + combo, 0, 0);
    pop();
    ctx.shadowBlur = 0;
  }
  pop();
}

// ── Screens ─────────────────────────────────
function drawLoading() {
  fill(0, 0, 20, 200); noStroke(); rect(0, 0, width, height);
  push(); textFont('Outfit'); textAlign(CENTER, CENTER);
  textSize(min(26, width * 0.035)); fill(0, 255, 200);
  let d = '.'.repeat(floor(frameCount / 20) % 4);
  text('Loading hand tracking model' + d, width / 2, height / 2);
  pop();
}

function drawStart() {
  fill(0, 0, 20, 185); noStroke(); rect(0, 0, width, height);

  push(); textFont('Outfit'); textAlign(CENTER, CENTER);
  let ctx = drawingContext;
  let cy  = height / 2;

  // floating emojis decoration
  textFont('sans-serif');
  textSize(min(50, width * 0.06));
  for (let i = 0; i < 5; i++) {
    let ex = width / 2 + (i - 2) * min(70, width * 0.08);
    let ey = cy - 160 + sin(frameCount * 0.04 + i * 1.2) * 12;
    text(FRUITS[i], ex, ey);
  }

  // title
  textFont('Outfit');
  ctx.shadowBlur  = 35;
  ctx.shadowColor = 'rgba(0,255,200,0.55)';
  textSize(min(78, width * 0.095)); textStyle(BOLD); fill(255);
  text('FRUIT', width / 2, cy - 90);

  ctx.shadowColor = 'rgba(255,200,0,0.55)';
  textSize(min(86, width * 0.105));
  text('SMASH', width / 2, cy - 15);
  ctx.shadowBlur = 0;

  // instructions
  textSize(min(18, width * 0.024)); textStyle(NORMAL);
  fill(180, 200, 220);
  text('Point your fingers to catch the falling fruits!', width / 2, cy + 65);
  fill(160, 175, 195);
  text('Avoid the bombs 💣 — they cost you points', width / 2, cy + 95);

  // button
  let by = cy + 175, bw = min(290, width * 0.32), bh = 58;
  ctx.shadowBlur  = 22;
  ctx.shadowColor = 'rgba(0,255,200,0.4)';
  fill(0, 220, 170); rectMode(CENTER);
  rect(width / 2, by, bw, bh, 16);
  ctx.shadowBlur = 0;

  fill(8, 4, 22);
  textSize(min(22, width * 0.028)); textStyle(BOLD);
  text('CLICK TO START', width / 2, by);

  if (highScore > 0) {
    textStyle(NORMAL); textSize(min(15, width * 0.019)); fill(140);
    text('High Score: ' + highScore, width / 2, by + 48);
  }
  pop();
}

function drawGameOver() {
  fill(0, 0, 20, 210); noStroke(); rect(0, 0, width, height);

  push(); textFont('Outfit'); textAlign(CENTER, CENTER);
  let ctx = drawingContext;
  let cy  = height / 2;

  // title
  ctx.shadowBlur  = 28;
  ctx.shadowColor = 'rgba(255,80,100,0.5)';
  textSize(min(62, width * 0.08)); textStyle(BOLD); fill(255);
  text('GAME OVER', width / 2, cy - 115);
  ctx.shadowBlur = 0;

  // big score
  ctx.shadowBlur  = 35;
  ctx.shadowColor = 'rgba(0,255,200,0.65)';
  textSize(min(96, width * 0.125)); fill(0, 255, 200);
  text(score, width / 2, cy - 10);
  ctx.shadowBlur = 0;

  textSize(min(16, width * 0.02)); fill(140); textStyle(NORMAL);
  text('POINTS', width / 2, cy + 40);

  // stats
  textSize(min(19, width * 0.024)); fill(180, 200, 220);
  text('Best Combo: ' + bestCombo + 'x', width / 2, cy + 80);

  if (score >= highScore && score > 0) {
    ctx.shadowBlur  = 12;
    ctx.shadowColor = 'rgba(255,215,0,0.65)';
    fill(255, 215, 0); textStyle(BOLD);
    textSize(min(22, width * 0.028));
    text('🏆 NEW HIGH SCORE! 🏆', width / 2, cy + 115);
    ctx.shadowBlur = 0;
  }

  // button
  let by = cy + 180, bw = min(290, width * 0.32), bh = 58;
  ctx.shadowBlur  = 22;
  ctx.shadowColor = 'rgba(0,255,200,0.4)';
  fill(0, 220, 170); rectMode(CENTER);
  rect(width / 2, by, bw, bh, 16);
  ctx.shadowBlur = 0;

  fill(8, 4, 22);
  textSize(min(22, width * 0.028)); textStyle(BOLD);
  text('PLAY AGAIN', width / 2, by);
  pop();
}

// ── Input ───────────────────────────────────
function mousePressed()  { handleStart(); }
function touchStarted()  { handleStart(); return false; }

function handleStart() {
  if (gameState === 'start' || gameState === 'gameover') {
    gameState     = 'playing';
    score         = 0;
    displayScore  = 0;
    combo         = 0;
    bestCombo     = 0;
    timeLeft      = GAME_DURATION;
    emojis        = [];
    particles     = [];
    screenShake   = 0;
    scorePulse    = 0;
    lastSpawn     = millis();
  }
}
