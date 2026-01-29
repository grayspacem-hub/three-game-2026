# 3D Tetris (Three.js + Vite)

A lightweight 3D Tetris prototype built with Three.js and vanilla JavaScript.

## Features

- Classic Tetris gameplay (default)
- **Arcade Mode toggle** (optional)
  - **Power-up pickups** that spawn rarely as special blocks and trigger when cleared in a line:
    - Bomb (clears a 3×3 area)
    - Slow Time (slows gravity for 10s)
    - Column Wipe (clears the column)
    - Bottom Clear (clears the bottom row)
  - **Combo meter** with an increasing score multiplier for quick successive line clears
  - **Fever mode**: clear enough lines quickly to enter a short scoring burst + visual glow
- **Ghost piece** (landing preview)
- **Hold piece** (press `C`)
- **Restart button** (no page refresh)
- **Best score** stored locally in the browser

## Controls

- ←/→: move
- ↓: soft drop
- Space: hard drop
- Z/X (or ↑): rotate
- C: hold
- P: pause

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

### Preview Notes

- `npm run preview` serves the production build from `dist`.
- To test on another device, use `npm run preview -- --host`.

## Deployment (Vercel)

This project is Vite-based.

### Option A: Import on Vercel (recommended)

1. Push the repo to GitHub/GitLab/Bitbucket
2. In Vercel: **Add New → Project → Import**
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel login
vercel
vercel --prod
```

## Tech

- [Three.js](https://threejs.org/)
- [Vite](https://vitejs.dev/)
- Vanilla JS
