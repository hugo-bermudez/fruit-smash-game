# 🍎 Fruit Smash

A body-movement mini-game that uses your webcam and AI pose detection to let you catch falling fruits with your hands.

## How to Play

1. Open the game in a browser (HTTPS required for webcam access)
2. Allow camera access when prompted
3. Click **Start** to begin
4. Move your hands to catch falling fruit emojis — avoid bombs!
5. Build combos for bonus points

## Tech Stack

- **p5.js** — Canvas rendering and game loop
- **ml5.js** — BodyPose (MoveNet) for real-time body tracking
- Vanilla HTML/CSS/JS — no build step required

## Features

- Real-time body pose detection via webcam
- Mirrored video feed for intuitive gameplay
- 14 fruit types + hazard emojis
- Combo system with escalating point multipliers
- Particle effects, screen shake, and neon glow visuals
- 60-second timed rounds with progressive difficulty
- Responsive full-screen layout
- High score tracking (per session)

## Run Locally

Serve the files over HTTPS (required for webcam). For quick local dev:

```bash
npx serve .
```

Then open `https://localhost:3000` in your browser.
