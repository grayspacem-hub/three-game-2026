import * as THREE from 'three';

// --- Tetris constants ---
const COLS = 10;
const ROWS = 20;
const CELL = 1;

const COLORS = {
  I: 0x4dd7ff,
  O: 0xffd54d,
  T: 0xc47bff,
  S: 0x55f27a,
  Z: 0xff5a7a,
  J: 0x4d6bff,
  L: 0xffa04d,
};

// Matrices are [row][col], with 1 = filled.
const SHAPES = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

// Arcade Mode: powerups that occupy a cell and trigger when cleared in a completed line.
const POWERUPS = {
  BOMB: { label: 'Bomb', color: 0xff4c66 },
  SLOW: { label: 'Slow', color: 0x55e6ff },
  COLUMN_WIPE: { label: 'Column', color: 0xb36bff },
  BOTTOM_CLEAR: { label: 'Bottom', color: 0x5dffd3 },
};
const POWERUP_TYPES = Object.keys(POWERUPS);

function cloneMatrix(m) {
  return m.map((r) => r.slice());
}

function rotateMatrixCW(m) {
  // CW rotation: transpose + reverse rows
  const h = m.length;
  const w = m[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[x][h - 1 - y] = m[y][x];
    }
  }
  return out;
}

function rotateMatrixCCW(m) {
  // CCW rotation: transpose + reverse columns
  const h = m.length;
  const w = m[0].length;
  const out = Array.from({ length: w }, () => Array(h).fill(0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[w - 1 - x][y] = m[y][x];
    }
  }
  return out;
}

// --- UI ---
const elScore = document.getElementById('score');
const elLines = document.getElementById('lines');
const elLevel = document.getElementById('level');
const elNextType = document.getElementById('nextType');
const elNextPiece = document.getElementById('nextPiece');
const elHoldType = document.getElementById('holdType');
const elHoldPiece = document.getElementById('holdPiece');
const elBanner = document.getElementById('banner');
const elArcadeToggle = document.getElementById('arcadeToggle');
const elRestartBtn = document.getElementById('restartBtn');
const elComboText = document.getElementById('comboText');
const elComboFill = document.getElementById('comboFill');
const elFeverPill = document.getElementById('feverPill');

function setBanner(text) {
  if (!text) {
    elBanner.style.display = 'none';
    elBanner.textContent = '';
    return;
  }
  elBanner.style.display = 'flex';
  elBanner.textContent = text;
}

function renderPiecePreview(elType, elPre, piece) {
  if (!piece) {
    elType.textContent = '—';
    elPre.textContent = '';
    return;
  }
  elType.textContent = piece.type;
  const m = piece.matrix;
  const lines = m.map((row) => row.map((v) => (v ? '██' : '  ')).join(''));
  elPre.textContent = lines.join('\n');
}

function renderNextPreview(next) {
  renderPiecePreview(elNextType, elNextPiece, next);
}

function renderHoldPreview(hold) {
  renderPiecePreview(elHoldType, elHoldPiece, hold);
}

function setComboUI(multiplier, remaining01) {
  elComboText.textContent = `x${multiplier.toFixed(2)}`;
  const w = Math.max(0, Math.min(1, remaining01)) * 100;
  elComboFill.style.width = `${w}%`;
}

function setFeverUI(on) {
  elFeverPill.style.display = on ? 'flex' : 'none';
  document.body.classList.toggle('fever', on);
}

// --- Three.js scene ---
let scene, camera, renderer;
let root;
let wellGroup, fixedGroup, activeGroup, ghostGroup;

const cubeGeo = new THREE.BoxGeometry(0.94, 0.94, 0.94);
const matCache = new Map();
const ghostMatCache = new Map();

function getMat(color, { emissive = 0x000000, emissiveIntensity = 0.0 } = {}) {
  const key = `${String(color)}|e:${String(emissive)}|i:${String(emissiveIntensity)}`;
  if (!matCache.has(key)) {
    matCache.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.05,
        emissive,
        emissiveIntensity,
      })
    );
  }
  return matCache.get(key);
}

function getGhostMat(color) {
  const key = String(color);
  if (!ghostMatCache.has(key)) {
    ghostMatCache.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.0,
        transparent: true,
        opacity: 0.18,
      })
    );
  }
  return ghostMatCache.get(key);
}

let ambientLight, keyLight;

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070814);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 16, 22);
  camera.lookAt(0, 8.5, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.getElementById('gameContainer').appendChild(renderer.domElement);

  root = new THREE.Group();
  scene.add(root);

  // Lights
  ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambientLight);

  keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(12, 20, 14);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 100;
  keyLight.shadow.camera.left = -20;
  keyLight.shadow.camera.right = 20;
  keyLight.shadow.camera.top = 30;
  keyLight.shadow.camera.bottom = -10;
  scene.add(keyLight);

  const fill = new THREE.PointLight(0x7aa7ff, 0.55, 80);
  fill.position.set(-10, 12, 10);
  scene.add(fill);

  // Ground
  const groundGeo = new THREE.PlaneGeometry(80, 80);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0b0d22, roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // Well + helpers
  wellGroup = new THREE.Group();
  fixedGroup = new THREE.Group();
  activeGroup = new THREE.Group();
  ghostGroup = new THREE.Group();
  root.add(wellGroup, fixedGroup, ghostGroup, activeGroup);

  const wellW = COLS * CELL;
  const wellH = ROWS * CELL;

  // A subtle grid behind the playfield
  const grid = new THREE.GridHelper(wellW + 4, COLS + 4, 0x2a2c55, 0x1a1c38);
  grid.position.set(0, ROWS / 2 - 0.5, -2.8);
  wellGroup.add(grid);

  // Transparent walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2a2c55,
    transparent: true,
    opacity: 0.18,
    roughness: 1,
    metalness: 0,
  });
  const thickness = 0.4;
  const depth = 2.2;

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(thickness, wellH + 0.5, depth), wallMat);
  leftWall.position.set(-wellW / 2 - thickness / 2, wellH / 2 - 0.5, 0);
  wellGroup.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(thickness, wellH + 0.5, depth), wallMat);
  rightWall.position.set(wellW / 2 + thickness / 2, wellH / 2 - 0.5, 0);
  wellGroup.add(rightWall);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(wellW + thickness * 2, wellH + 0.5, thickness), wallMat);
  backWall.position.set(0, wellH / 2 - 0.5, -depth / 2);
  wellGroup.add(backWall);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(wellW + thickness * 2, thickness, depth), wallMat);
  floor.position.set(0, -0.5 - thickness / 2, 0);
  wellGroup.add(floor);

  // Title-ish frame
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1f2150, roughness: 0.75, metalness: 0 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(wellW + 2.4, wellH + 2.0, 0.25), frameMat);
  frame.position.set(0, wellH / 2 - 0.5, -3.2);
  wellGroup.add(frame);

  window.addEventListener('resize', onResize);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Game state ---
// Each cell is either:
// - null
// - number (a color for a normal fixed block)
// - { kind: 'power', ptype: string }
let grid;
let score = 0;
let lines = 0;
let level = 1;
let baseDropIntervalMs = 800;
let isPaused = false;
let isGameOver = false;

let arcadeEnabled = false;

let active = null;
let next = null;

// Nice-to-have: hold
let hold = null;
let holdUsed = false;

// Arcade: combo + fever + powerups
const comboWindowMs = 1400;
let lastClearAt = -Infinity;
let comboCount = 0;
let comboMultiplier = 1.0;

const feverWindowMs = 4500;
const feverLinesNeeded = 6;
const feverDurationMs = 8000;
let feverUntil = 0;
let recentLineEvents = []; // {t, lines}

let slowUntil = 0;

let lastTime = 0;
let dropAccum = 0;
let bag = [];

function nowMs() {
  return performance.now();
}

function newGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function refillBag() {
  bag = Object.keys(SHAPES);
  // Fisher-Yates
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
}

function makePiece(type) {
  return {
    type,
    matrix: cloneMatrix(SHAPES[type]),
    color: COLORS[type],
  };
}

function drawFromBag() {
  if (bag.length === 0) refillBag();
  const type = bag.pop();
  return makePiece(type);
}

function spawnPowerUpRarely() {
  if (!arcadeEnabled) return;

  // Very low chance per spawn.
  const roll = Math.random();
  if (roll > 0.07) return;

  // Pick a random empty cell near the top so it can be cleared.
  for (let tries = 0; tries < 40; tries++) {
    const x = Math.floor(Math.random() * COLS);
    const y = ROWS - 1 - Math.floor(Math.random() * 6);
    if (y < 0 || y >= ROWS) continue;
    if (grid[y][x] !== null) continue;

    const ptype = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    grid[y][x] = { kind: 'power', ptype };
    rebuildFixedMeshes();
    return;
  }
}

function spawnPiece() {
  active = next || drawFromBag();
  next = drawFromBag();

  // Spawn near top
  const w = active.matrix[0].length;
  const h = active.matrix.length;

  active.x = Math.floor((COLS - w) / 2);
  active.y = ROWS - h; // y=0 bottom; spawn high

  holdUsed = false;

  renderNextPreview(next);

  // Arcade: occasionally place a powerup block in the field.
  spawnPowerUpRarely();

  if (collides(active, active.x, active.y, active.matrix)) {
    isGameOver = true;
    setBanner('Game Over — press Restart');
  }
}

function cellOccupied(cell) {
  return cell !== null;
}

function collides(piece, x, y, matrix) {
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!matrix[r][c]) continue;
      const gx = x + c;
      const gy = y + (matrix.length - 1 - r); // flip matrix so top row maps higher y

      if (gx < 0 || gx >= COLS) return true;
      if (gy < 0) return true;
      if (gy >= ROWS) continue; // allow above top during spawn/rotation

      if (cellOccupied(grid[gy][gx])) return true;
    }
  }
  return false;
}

function mergeActive() {
  const m = active.matrix;
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const gx = active.x + c;
      const gy = active.y + (m.length - 1 - r);
      if (gy >= ROWS) continue;
      if (gy < 0) continue;
      grid[gy][gx] = active.color;
    }
  }
}

function applyPowerUp(ptype, x, y) {
  if (!arcadeEnabled) return;

  const t = nowMs();
  switch (ptype) {
    case 'BOMB': {
      for (let yy = y - 1; yy <= y + 1; yy++) {
        for (let xx = x - 1; xx <= x + 1; xx++) {
          if (xx < 0 || xx >= COLS || yy < 0 || yy >= ROWS) continue;
          grid[yy][xx] = null;
        }
      }
      break;
    }
    case 'SLOW': {
      slowUntil = Math.max(slowUntil, t + 10_000);
      break;
    }
    case 'COLUMN_WIPE': {
      for (let yy = 0; yy < ROWS; yy++) grid[yy][x] = null;
      break;
    }
    case 'BOTTOM_CLEAR': {
      for (let xx = 0; xx < COLS; xx++) grid[0][xx] = null;
      break;
    }
    default:
      break;
  }
}

function totalScoreMultiplier() {
  let mult = 1.0;
  if (arcadeEnabled) mult *= comboMultiplier;
  if (arcadeEnabled && nowMs() < feverUntil) mult *= 1.75;
  return mult;
}

function onLinesCleared(cleared) {
  if (!arcadeEnabled || cleared <= 0) return;

  const t = nowMs();

  // Combo
  if (t - lastClearAt <= comboWindowMs) comboCount += 1;
  else comboCount = 1;
  lastClearAt = t;

  comboMultiplier = 1 + Math.min(6, (comboCount - 1) * 0.25);

  // Fever
  recentLineEvents.push({ t, lines: cleared });
  recentLineEvents = recentLineEvents.filter((e) => t - e.t <= feverWindowMs);
  const sum = recentLineEvents.reduce((acc, e) => acc + e.lines, 0);
  if (sum >= feverLinesNeeded) {
    feverUntil = Math.max(feverUntil, t + feverDurationMs);
    // clear history so it doesn't instantly re-trigger
    recentLineEvents = [];
  }
}

function clearLines() {
  let cleared = 0;

  for (let y = 0; y < ROWS; y++) {
    const full = grid[y].every((cell) => cell !== null);
    if (!full) continue;

    // Trigger any powerups in this cleared row BEFORE removing it.
    if (arcadeEnabled) {
      for (let x = 0; x < COLS; x++) {
        const cell = grid[y][x];
        if (cell && typeof cell === 'object' && cell.kind === 'power') {
          applyPowerUp(cell.ptype, x, y);
        }
      }
    }

    grid.splice(y, 1);
    grid.push(Array(COLS).fill(null));
    y--;
    cleared++;
  }

  if (cleared > 0) {
    lines += cleared;

    // Scoring: classic-ish
    const base = [0, 40, 100, 300, 1200][cleared] || 0;
    const mult = totalScoreMultiplier();
    score += Math.round(base * level * mult);

    onLinesCleared(cleared);

    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel !== level) {
      level = newLevel;
      baseDropIntervalMs = Math.max(90, 800 - (level - 1) * 55);
    }

    updateHud();
  }
}

function tryMove(dx, dy) {
  if (!active || isPaused || isGameOver) return false;
  const nx = active.x + dx;
  const ny = active.y + dy;
  if (!collides(active, nx, ny, active.matrix)) {
    active.x = nx;
    active.y = ny;
    return true;
  }
  return false;
}

function tryRotate(dir) {
  if (!active || isPaused || isGameOver) return false;

  const rotated = dir === 'CW' ? rotateMatrixCW(active.matrix) : rotateMatrixCCW(active.matrix);

  // Simple wall kicks (small offsets)
  const kicks = [
    { x: 0, y: 0 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -2, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 1 },
  ];

  for (const k of kicks) {
    const nx = active.x + k.x;
    const ny = active.y + k.y;
    if (!collides(active, nx, ny, rotated)) {
      active.matrix = rotated;
      active.x = nx;
      active.y = ny;
      return true;
    }
  }

  return false;
}

function hardDrop() {
  if (!active || isPaused || isGameOver) return;
  let dropped = 0;
  while (tryMove(0, -1)) dropped++;
  // A little reward for hard drop
  score += Math.round(dropped * 2 * totalScoreMultiplier());
  lockPiece();
}

function lockPiece() {
  mergeActive();
  clearLines();
  spawnPiece();
  rebuildFixedMeshes();
}

function updateHud() {
  elScore.textContent = String(score);
  elLines.textContent = String(lines);
  elLevel.textContent = String(level);
}

function holdPiece() {
  if (!active || isPaused || isGameOver) return;
  if (holdUsed) return;

  const current = makePiece(active.type);

  if (!hold) {
    hold = current;
    renderHoldPreview(hold);
    spawnPiece();
  } else {
    const tmp = hold;
    hold = current;
    renderHoldPreview(hold);

    active = makePiece(tmp.type);
    // reset spawn position
    const w = active.matrix[0].length;
    const h = active.matrix.length;
    active.x = Math.floor((COLS - w) / 2);
    active.y = ROWS - h;

    if (collides(active, active.x, active.y, active.matrix)) {
      isGameOver = true;
      setBanner('Game Over — press Restart');
    }
  }

  holdUsed = true;
}

// --- Rendering helpers ---
function cellToWorld(x, y) {
  const wellW = COLS * CELL;
  return {
    x: x * CELL - wellW / 2 + CELL / 2,
    y: y * CELL,
    z: 0,
  };
}

function clearGroup(g) {
  for (let i = g.children.length - 1; i >= 0; i--) {
    const child = g.children[i];
    g.remove(child);
    child.geometry?.dispose?.();
    // materials are cached; do not dispose
  }
}

function cellRenderInfo(cell) {
  if (cell === null) return null;
  if (typeof cell === 'number') return { color: cell, power: false, ptype: null };
  if (typeof cell === 'object' && cell.kind === 'power') {
    return { color: POWERUPS[cell.ptype]?.color ?? 0xffffff, power: true, ptype: cell.ptype };
  }
  return null;
}

function rebuildFixedMeshes() {
  clearGroup(fixedGroup);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const info = cellRenderInfo(grid[y][x]);
      if (!info) continue;

      const mat = info.power
        ? getMat(info.color, { emissive: info.color, emissiveIntensity: 0.65 })
        : getMat(info.color);

      const mesh = new THREE.Mesh(cubeGeo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const p = cellToWorld(x, y);
      mesh.position.set(p.x, p.y, p.z);
      fixedGroup.add(mesh);
    }
  }
}

function computeGhostY() {
  if (!active) return null;
  let y = active.y;
  while (!collides(active, active.x, y - 1, active.matrix)) y--;
  return y;
}

function rebuildGhostMeshes() {
  clearGroup(ghostGroup);
  if (!active || isGameOver) return;

  const gy = computeGhostY();
  if (gy === null) return;
  if (gy === active.y) return; // sitting already

  const m = active.matrix;
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const gx = active.x + c;
      const yy = gy + (m.length - 1 - r);
      if (yy < 0 || gx < 0 || gx >= COLS) continue;
      if (yy >= ROWS) continue;

      const mesh = new THREE.Mesh(cubeGeo, getGhostMat(active.color));
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const p = cellToWorld(gx, yy);
      mesh.position.set(p.x, p.y, p.z);
      ghostGroup.add(mesh);
    }
  }
}

function rebuildActiveMeshes() {
  clearGroup(activeGroup);
  if (!active) return;
  const m = active.matrix;
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const gx = active.x + c;
      const gy = active.y + (m.length - 1 - r);
      if (gy < 0 || gx < 0 || gx >= COLS) continue;
      if (gy >= ROWS) continue;

      const mesh = new THREE.Mesh(cubeGeo, getMat(active.color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const p = cellToWorld(gx, gy);
      mesh.position.set(p.x, p.y, p.z);
      activeGroup.add(mesh);
    }
  }
}

// --- Input ---
const keys = new Set();

window.addEventListener('keydown', (e) => {
  // Prevent page scrolling
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();

  if (e.repeat) {
    // Allow held soft drop; ignore other repeats to keep controls crisp
    if (e.key !== 'ArrowDown') return;
  }

  keys.add(e.key);

  if (e.key === 'p' || e.key === 'P') {
    togglePause();
    return;
  }

  if (e.key === 'c' || e.key === 'C') {
    holdPiece();
    rebuildActiveMeshes();
    rebuildGhostMeshes();
    return;
  }

  if (isPaused || isGameOver) return;

  switch (e.key) {
    case 'ArrowLeft':
      tryMove(-1, 0);
      break;
    case 'ArrowRight':
      tryMove(1, 0);
      break;
    case 'ArrowDown':
      if (tryMove(0, -1)) {
        score += Math.round(1 * totalScoreMultiplier());
        updateHud();
      } else {
        lockPiece();
      }
      break;
    case ' ': // Space
      hardDrop();
      break;
    case 'ArrowUp':
    case 'x':
    case 'X':
      tryRotate('CW');
      break;
    case 'z':
    case 'Z':
      tryRotate('CCW');
      break;
    default:
      break;
  }

  rebuildActiveMeshes();
  rebuildGhostMeshes();
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key);
});

function togglePause() {
  if (isGameOver) return;
  isPaused = !isPaused;
  setBanner(isPaused ? 'Paused' : '');
}

// --- Main loop ---
function effectiveDropIntervalMs() {
  let interval = baseDropIntervalMs;

  // Arcade: slow-time powerup
  if (arcadeEnabled && nowMs() < slowUntil) interval *= 1.65;

  // Arcade: fever slightly speeds up play (but increases scoring even more)
  if (arcadeEnabled && nowMs() < feverUntil) interval *= 0.92;

  return Math.max(40, interval);
}

function step(dtMs) {
  if (isPaused || isGameOver) return;

  dropAccum += dtMs;

  // Soft drop when holding ArrowDown
  const soft = keys.has('ArrowDown');
  const interval = soft ? Math.max(30, effectiveDropIntervalMs() / 14) : effectiveDropIntervalMs();

  while (dropAccum >= interval) {
    dropAccum -= interval;

    if (!tryMove(0, -1)) {
      lockPiece();
      break;
    }
  }
}

function updateArcadeVfx() {
  const feverOn = arcadeEnabled && nowMs() < feverUntil;
  setFeverUI(feverOn);

  if (feverOn) {
    ambientLight.intensity = 0.48;
    keyLight.intensity = 1.12;
  } else {
    ambientLight.intensity = 0.35;
    keyLight.intensity = 0.9;
  }

  // Combo bar decay
  if (!arcadeEnabled) {
    setComboUI(1.0, 0);
    return;
  }

  const t = nowMs();
  const dt = t - lastClearAt;
  const remaining = 1 - dt / comboWindowMs;
  const still = remaining > 0;

  if (!still) {
    comboCount = 0;
    comboMultiplier = 1.0;
    setComboUI(1.0, 0);
  } else {
    setComboUI(comboMultiplier, remaining);
  }
}

function animate(t) {
  const dt = t - lastTime;
  lastTime = t;

  step(dt);

  rebuildActiveMeshes();
  rebuildGhostMeshes();
  updateArcadeVfx();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function resetArcadeState() {
  comboCount = 0;
  comboMultiplier = 1.0;
  lastClearAt = -Infinity;
  feverUntil = 0;
  recentLineEvents = [];
  slowUntil = 0;
  setComboUI(1.0, 0);
  setFeverUI(false);
}

function clearAllPowerUps() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = grid[y][x];
      if (cell && typeof cell === 'object' && cell.kind === 'power') grid[y][x] = null;
    }
  }
}

function restartGame() {
  grid = newGrid();
  score = 0;
  lines = 0;
  level = 1;
  baseDropIntervalMs = 800;
  isPaused = false;
  isGameOver = false;
  setBanner('');

  hold = null;
  holdUsed = false;
  renderHoldPreview(hold);

  resetArcadeState();

  refillBag();
  next = drawFromBag();
  renderNextPreview(next);
  spawnPiece();

  rebuildFixedMeshes();
  rebuildActiveMeshes();
  rebuildGhostMeshes();
  updateHud();
}

// UI hooks
elArcadeToggle?.addEventListener('change', (e) => {
  arcadeEnabled = Boolean(e.target.checked);
  resetArcadeState();
  if (!arcadeEnabled) {
    clearAllPowerUps();
    rebuildFixedMeshes();
  }
});

elRestartBtn?.addEventListener('click', () => {
  restartGame();
});

function startGame() {
  restartGame();
  lastTime = performance.now();
  requestAnimationFrame(animate);
}

// Boot
initThree();
startGame();
