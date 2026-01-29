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
  // Apple-ish palette (readable, not neon)
  BOMB: { label: 'Bomb', color: 0xff3b30 },
  SLOW: { label: 'Slow', color: 0x0a84ff },
  COLUMN_WIPE: { label: 'Column', color: 0xaf52de },
  BOTTOM_CLEAR: { label: 'Bottom', color: 0x30d158 },
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
const elBest = document.getElementById('best');
const elLines = document.getElementById('lines');
const elLevel = document.getElementById('level');
const elNextType = document.getElementById('nextType');
const elNextPiece = document.getElementById('nextPiece');
const elHoldType = document.getElementById('holdType');
const elHoldPiece = document.getElementById('holdPiece');
const elComboText = document.getElementById('comboText');
const elComboFill = document.getElementById('comboFill');
const elFeverPill = document.getElementById('feverPill');
const elArcadeToggle = document.getElementById('arcadeToggle');
const elArcadeToggleHud = document.getElementById('arcadeToggleHud');
const elStartBtn = document.getElementById('startBtn');
const elResumeBtn = document.getElementById('resumeBtn');
const elRestartBtn = document.getElementById('restartBtn');
const elOverlay = document.getElementById('overlay');
const elOverlayTitle = document.getElementById('overlayTitle');
const elOverlaySubtitle = document.getElementById('overlaySubtitle');
const elArcadePill = document.getElementById('arcadePill');
const elArcadeStatus = document.getElementById('arcadeStatus');
const elPowerupProgress = document.getElementById('powerupProgress');
const elArcadeMeta = document.getElementById('arcadeMeta');
const elComboWrap = document.getElementById('comboWrap');
const elPowerLegend = document.getElementById('powerLegend');
const elToasts = document.getElementById('toasts');

// Legend dots get their colors from the POWERUPS table.
for (const dot of document.querySelectorAll('.legendDot')) {
  const p = dot.getAttribute('data-ptype');
  const c = POWERUPS?.[p]?.color;
  if (typeof c === 'number') dot.style.background = `#${c.toString(16).padStart(6, '0')}`;
}

function setOverlay(show, { title = '', subtitle = '', mode = 'start' } = {}) {
  // mode: start | pause | gameover
  elOverlay.style.display = show ? 'flex' : 'none';
  if (!show) return;

  elOverlayTitle.textContent = title || '3D Tetris';
  elOverlaySubtitle.textContent = subtitle || '';

  // Button visibility
  const inStart = mode === 'start';
  const inPause = mode === 'pause';
  const inOver = mode === 'gameover';

  elStartBtn.style.display = inStart ? 'inline-flex' : 'none';
  elResumeBtn.style.display = inPause ? 'inline-flex' : 'none';
  elRestartBtn.style.display = inOver ? 'inline-flex' : 'none';
}

function setArcadeUI(on) {
  elArcadePill?.classList.toggle('on', on);
  if (elArcadeStatus) elArcadeStatus.textContent = on ? 'Arcade On' : 'Arcade Off';

  // Expose arcade-only UI
  if (elArcadeMeta) elArcadeMeta.style.display = on ? 'grid' : 'none';
  if (elComboWrap) elComboWrap.style.display = on ? 'grid' : 'none';
  if (elPowerLegend) elPowerLegend.style.display = on ? 'block' : 'none';
}

function setPowerupProgressText(text) {
  if (!elPowerupProgress) return;
  elPowerupProgress.textContent = text;
}

function toast({ title, body = '', color = null, ttlMs = 1800 } = {}) {
  if (!elToasts) return;
  const node = document.createElement('div');
  node.className = 'toast';

  const t = document.createElement('div');
  t.className = 'toastTitle';
  t.textContent = title || '';

  const b = document.createElement('div');
  b.className = 'toastBody';
  b.textContent = body || '';

  node.appendChild(t);
  if (body) node.appendChild(b);

  if (color) {
    node.style.borderColor = `rgba(${color.r * 255}, ${color.g * 255}, ${color.b * 255}, 0.35)`;
  }

  elToasts.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));

  window.setTimeout(() => {
    node.classList.remove('show');
    window.setTimeout(() => node.remove(), 200);
  }, ttlMs);
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
const powerGemGeo = new THREE.OctahedronGeometry(0.32);
const powerRingGeo = new THREE.TorusGeometry(0.32, 0.06, 8, 16);
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
let bgGroup, starField, nebulaGroup;
let rimLightA, rimLightB;
let vfxGroup;

const powerLabelTex = new Map(); // ptype -> CanvasTexture
const powerLabelMat = new Map(); // ptype -> SpriteMaterial

const baseCamPos = new THREE.Vector3(0, 16, 22);
const baseCamLook = new THREE.Vector3(0, 8.5, 0);
let shakeUntil = 0;
let shakeMag = 0;

const bursts = []; // { points, vel:Float32Array, life, maxLife }
const powerVfx = []; // power-up meshes for cheap animation

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070814);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 240);
  camera.position.copy(baseCamPos);
  camera.lookAt(baseCamLook);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.getElementById('gameContainer').appendChild(renderer.domElement);

  root = new THREE.Group();
  scene.add(root);

  // Background (procedural starfield + nebula cards)
  bgGroup = new THREE.Group();
  scene.add(bgGroup);

  // Stars
  {
    const starCount = 2400;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const tmp = new THREE.Color();

    for (let i = 0; i < starCount; i++) {
      // A wide "bowl" behind the board
      const r = 60 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() * 0.62 + 0.12) * Math.PI; // avoid directly below

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi) + 4;
      const z = -Math.abs(r * Math.sin(phi) * Math.sin(theta)) - 22;

      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // bluish-white palette
      const tint = Math.random();
      tmp.setHSL(0.62 + tint * 0.09, 0.45, 0.75 + Math.random() * 0.2);
      colors[i * 3 + 0] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    starField = new THREE.Points(geo, mat);
    starField.frustumCulled = false;
    bgGroup.add(starField);
  }

  // Nebula sprites (canvas texture)
  nebulaGroup = new THREE.Group();
  bgGroup.add(nebulaGroup);
  {
    const makeNebulaTexture = (cA, cB) => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
      g.addColorStop(0, cA);
      g.addColorStop(0.45, cB);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearMipMapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };

    // Subtle, tasteful gradients (avoid synthwave)
    const tex1 = makeNebulaTexture('rgba(120,140,255,0.40)', 'rgba(255,255,255,0.08)');
    const tex2 = makeNebulaTexture('rgba(160,120,255,0.30)', 'rgba(255,255,255,0.06)');

    const mat1 = new THREE.SpriteMaterial({ map: tex1, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    const mat2 = new THREE.SpriteMaterial({ map: tex2, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });

    const s1 = new THREE.Sprite(mat1);
    s1.position.set(-10, 18, -55);
    s1.scale.set(80, 50, 1);

    const s2 = new THREE.Sprite(mat2);
    s2.position.set(18, 9, -48);
    s2.scale.set(70, 42, 1);

    const s3 = new THREE.Sprite(mat1);
    s3.position.set(5, 28, -70);
    s3.scale.set(110, 70, 1);
    s3.material.opacity = 0.26;

    nebulaGroup.add(s1, s2, s3);
  }

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

  // Subtle animated rim lights for depth
  rimLightA = new THREE.PointLight(0x8a8dff, 0.40, 85);
  rimLightA.position.set(16, 10, -8);
  scene.add(rimLightA);

  rimLightB = new THREE.PointLight(0x9ad7ff, 0.32, 85);
  rimLightB.position.set(-16, 14, -6);
  scene.add(rimLightB);

  vfxGroup = new THREE.Group();
  scene.add(vfxGroup);

  // Ground
  const groundGeo = new THREE.PlaneGeometry(80, 80);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0b0d22, roughness: 0.95, metalness: 0.0 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);

  // Minimal props: pillars around the arena (cheap geometry, nice parallax)
  {
    const pillarGeo = new THREE.CylinderGeometry(0.35, 0.55, 6.5, 10, 1);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x13163a, roughness: 0.85, metalness: 0.05, emissive: 0x060816, emissiveIntensity: 0.35 });

    const coords = [
      [-14, 1.7, -10],
      [14, 1.7, -10],
      [-18, 1.7, -26],
      [18, 1.7, -26],
      [-10, 1.7, -34],
      [10, 1.7, -34],
    ];

    for (const [x, y, z] of coords) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(x, y, z);
      p.castShadow = true;
      p.receiveShadow = true;
      scene.add(p);
    }
  }

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
// Grid holds only fixed blocks:
// - null
// - number (a color for a normal fixed block)
// Arcade power-ups are stored separately (so they can be collected/covered without blocking).
let grid;
let powerMap; // Map<"x,y", ptype>
let score = 0;
let bestScore = 0;
let lines = 0;
let level = 1;
let baseDropIntervalMs = 800;
let isPaused = false;
let isGameOver = false;
let bestToastShown = false;

const BEST_SCORE_KEY = 'three-game-2026-best-score';

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
let activeDirty = true;
let ghostDirty = true;
let fixedDirty = true;

// Horizontal movement repeat (DAS/ARR)
const MOVE_DAS_MS = 120;
const MOVE_ARR_MS = 35;
let moveHoldDir = 0; // -1 left, 1 right
let moveHeldMs = 0;
let moveRepeatMs = 0;
let lastHorizKey = null; // last pressed horizontal key to resolve conflicts

const MAX_FRAME_DT_MS = 50;

// Arcade: reliable power-up spawning (knobs)
const POWERUP_MIN_PIECES_BEFORE_CHANCE = 6;
const POWERUP_GUARANTEE_EVERY_PIECES = 12; // guaranteed spawn at or before this many placed pieces
const POWERUP_GUARANTEE_EVERY_LINES = 6; // guaranteed spawn if you clear this many lines without seeing a spawn
const POWERUP_BASE_CHANCE_PER_PIECE = 0.12; // after min pieces, per-piece chance

let piecesPlaced = 0;
let piecesSincePowerup = 0;
let linesSincePowerup = 0;

function nowMs() {
  return performance.now();
}

function newGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function loadBestScore() {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) bestScore = parsed;
  } catch (err) {
    bestScore = 0;
  }
}

function saveBestScore() {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  } catch (err) {
    // Ignore storage errors (e.g., privacy mode).
  }
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

function pickPowerupSpawnCell() {
  // Try mid/high rows so it's visible and realistically collectible.
  // y=0 bottom; y=ROWS-1 top.
  const yMin = Math.floor(ROWS * 0.45);
  const yMax = ROWS - 1;

  for (let tries = 0; tries < 90; tries++) {
    const x = Math.floor(Math.random() * COLS);
    const y = yMin + Math.floor(Math.random() * (yMax - yMin + 1));
    if (grid[y][x] !== null) continue;
    if (powerMap?.has(`${x},${y}`)) continue;
    return { x, y };
  }

  return null;
}

function maybeSpawnPowerup({ force = false } = {}) {
  if (!arcadeEnabled) return false;

  const shouldGuarantee =
    piecesSincePowerup >= POWERUP_GUARANTEE_EVERY_PIECES || linesSincePowerup >= POWERUP_GUARANTEE_EVERY_LINES;

  const chanceEligible = piecesSincePowerup >= POWERUP_MIN_PIECES_BEFORE_CHANCE;
  const chanceHit = chanceEligible && Math.random() < POWERUP_BASE_CHANCE_PER_PIECE;

  if (!force && !shouldGuarantee && !chanceHit) return false;

  const cell = pickPowerupSpawnCell();
  if (!cell) return false;

  const ptype = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  powerMap.set(`${cell.x},${cell.y}`, ptype);
  piecesSincePowerup = 0;
  linesSincePowerup = 0;

  fixedDirty = true;

  const colorHex = POWERUPS?.[ptype]?.color ?? 0xffffff;
  const c = new THREE.Color(colorHex);
  toast({ title: 'Arcade • Power-up spawned', body: `${POWERUPS[ptype].label} is on the field`, color: c, ttlMs: 1500 });

  // Subtle spawn sparkle (no shake)
  spawnBurst(cell.x, cell.y, colorHex);

  return true;
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
  activeDirty = true;
  ghostDirty = true;

  if (collides(active, active.x, active.y, active.matrix)) {
    isGameOver = true;
    setOverlay(true, {
      title: 'Game Over',
      subtitle: 'Press Restart to try again. (Tip: use Hold with C.)',
      mode: 'gameover',
    });
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

function triggerPowerUp(ptype, x, y, reason = 'TRIGGER') {
  if (!arcadeEnabled) return;

  const def = POWERUPS[ptype];
  const colorHex = def?.color ?? 0xffffff;
  const c = new THREE.Color(colorHex);

  const title = reason === 'COLLECT' ? 'Arcade • Power-up collected' : 'Arcade • Power-up triggered';
  const body = `${def?.label ?? ptype}`;
  toast({ title, body, color: c, ttlMs: 1900 });

  // A bit of punch
  shakeMag = Math.max(shakeMag, reason === 'COLLECT' ? 0.18 : 0.14);
  shakeUntil = Math.max(shakeUntil, nowMs() + (reason === 'COLLECT' ? 240 : 180));
  spawnBurst(x, y, colorHex);

  applyPowerUp(ptype, x, y);
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

      const key = `${gx},${gy}`;
      const ptype = powerMap?.get(key);
      if (ptype) {
        // Arcade: collecting a power-up by landing on it.
        triggerPowerUp(ptype, gx, gy, 'COLLECT');
        powerMap.delete(key);
      }

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
    if (arcadeEnabled && powerMap) {
      for (let x = 0; x < COLS; x++) {
        const key = `${x},${y}`;
        const ptype = powerMap.get(key);
        if (ptype) {
          triggerPowerUp(ptype, x, y, 'TRIGGER');
          powerMap.delete(key);
        }
      }
    }

    // Remove the line from block grid
    grid.splice(y, 1);
    grid.push(Array(COLS).fill(null));

    // Shift any powerups above this line down by 1 (since the grid shifted)
    if (arcadeEnabled && powerMap && powerMap.size) {
      const nextMap = new Map();
      for (const [k, ptype] of powerMap.entries()) {
        const [sx, sy] = k.split(',');
        const px = Number(sx);
        const py = Number(sy);
        if (Number.isNaN(px) || Number.isNaN(py)) continue;
        if (py > y) nextMap.set(`${px},${py - 1}`, ptype);
        else if (py < y) nextMap.set(k, ptype);
      }
      powerMap = nextMap;
    }

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

  return cleared;
}

function tryMove(dx, dy) {
  if (!active || isPaused || isGameOver) return false;
  const nx = active.x + dx;
  const ny = active.y + dy;
  if (!collides(active, nx, ny, active.matrix)) {
    active.x = nx;
    active.y = ny;
    activeDirty = true;
    ghostDirty = true;
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
      activeDirty = true;
      ghostDirty = true;
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
  updateHud();
  lockPiece();
}

function updatePowerupHud() {
  if (!arcadeEnabled) {
    setPowerupProgressText('—');
    return;
  }
  const remaining = Math.max(0, POWERUP_GUARANTEE_EVERY_PIECES - piecesSincePowerup);
  setPowerupProgressText(remaining <= 0 ? 'Now' : `${remaining}`);
}

function lockPiece() {
  mergeActive();

  // Counters for Arcade reliability
  piecesPlaced += 1;
  piecesSincePowerup += 1;

  const cleared = clearLines();
  if (arcadeEnabled && cleared > 0) linesSincePowerup += cleared;

  if (arcadeEnabled) {
    // Spawn powerups regularly so Arcade feels obviously alive.
    maybeSpawnPowerup();
  }

  spawnPiece();
  fixedDirty = true;

  updatePowerupHud();
}

function updateHud() {
  elScore.textContent = String(score);
  if (score > bestScore) {
    bestScore = score;
    saveBestScore();
    if (!bestToastShown) {
      toast({ title: 'New Best Score', body: `${bestScore}`, ttlMs: 1600 });
      bestToastShown = true;
    }
  }
  if (elBest) elBest.textContent = String(bestScore);
  elLines.textContent = String(lines);
  elLevel.textContent = String(level);
  updatePowerupHud();
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
      setOverlay(true, {
        title: 'Game Over',
        subtitle: 'Press Restart to try again.',
        mode: 'gameover',
      });
    }
  }

  holdUsed = true;
  activeDirty = true;
  ghostDirty = true;
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

function spawnBurst(cellX, cellY, colorHex) {
  if (!vfxGroup) return;

  const origin = cellToWorld(cellX, cellY);
  const count = 44;

  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(colorHex);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = origin.x + (Math.random() - 0.5) * 0.35;
    positions[i * 3 + 1] = origin.y + 0.2 + (Math.random() - 0.5) * 0.35;
    positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.55;

    const vx = (Math.random() - 0.5) * 1.8;
    const vy = 1.0 + Math.random() * 2.2;
    const vz = (Math.random() - 0.5) * 1.2;
    velocities[i * 3 + 0] = vx;
    velocities[i * 3 + 1] = vy;
    velocities[i * 3 + 2] = vz;

    const t = 0.75 + Math.random() * 0.35;
    colors[i * 3 + 0] = base.r * t;
    colors[i * 3 + 1] = base.g * t;
    colors[i * 3 + 2] = base.b * t;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.14,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  vfxGroup.add(pts);

  bursts.push({ points: pts, vel: velocities, life: 0, maxLife: 520 });
}

function updateBursts(dtMs) {
  if (bursts.length === 0) return;
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life += dtMs;

    const geo = b.points.geometry;
    const pos = geo.getAttribute('position');

    // integrate
    for (let j = 0; j < pos.count; j++) {
      const ix = j * 3;
      pos.array[ix + 0] += (b.vel[ix + 0] * dtMs) / 1000;
      pos.array[ix + 1] += (b.vel[ix + 1] * dtMs) / 1000;
      pos.array[ix + 2] += (b.vel[ix + 2] * dtMs) / 1000;
      b.vel[ix + 1] -= 5.0 * (dtMs / 1000); // gravity
    }
    pos.needsUpdate = true;

    const t = Math.max(0, 1 - b.life / b.maxLife);
    b.points.material.opacity = 0.95 * t;

    if (b.life >= b.maxLife) {
      vfxGroup.remove(b.points);
      b.points.geometry.dispose();
      b.points.material.dispose();
      bursts.splice(i, 1);
    }
  }
}

function clearGroup(g) {
  for (let i = g.children.length - 1; i >= 0; i--) {
    const child = g.children[i];
    g.remove(child);
    // Shared geometries/materials are reused; avoid disposing here.
  }
}

function powerAt(x, y) {
  if (!powerMap) return null;
  return powerMap.get(`${x},${y}`) || null;
}

function getPowerLabelTexture(ptype, colorHex) {
  if (powerLabelTex.has(ptype)) return powerLabelTex.get(ptype);

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Clean pill label with subtle gradient
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const r = 34;
  const x = 16;
  const y = 30;
  const w = 224;
  const h = 68;

  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, 'rgba(255,255,255,0.90)');
  grad.addColorStop(1, 'rgba(255,255,255,0.60)');

  // Rounded rect path
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();

  ctx.fillStyle = grad;
  ctx.fill();

  // Border tint
  const c = new THREE.Color(colorHex);
  ctx.strokeStyle = `rgba(${Math.floor(c.r * 255)}, ${Math.floor(c.g * 255)}, ${Math.floor(c.b * 255)}, 0.55)`;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Text (crisp)
  const label = POWERUPS?.[ptype]?.label ?? ptype;
  ctx.font = '900 44px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillText(label.toUpperCase(), canvas.width / 2, y + h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  powerLabelTex.set(ptype, tex);
  return tex;
}

function getPowerLabelMat(ptype, colorHex) {
  if (powerLabelMat.has(ptype)) return powerLabelMat.get(ptype);
  const mat = new THREE.SpriteMaterial({
    map: getPowerLabelTexture(ptype, colorHex),
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  powerLabelMat.set(ptype, mat);
  return mat;
}

function rebuildFixedMeshes() {
  clearGroup(fixedGroup);
  powerVfx.length = 0;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const p = cellToWorld(x, y);

      // Fixed blocks
      const cell = grid[y][x];
      if (typeof cell === 'number') {
        const mesh = new THREE.Mesh(cubeGeo, getMat(cell));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(p.x, p.y, p.z);
        fixedGroup.add(mesh);
      }

      // Arcade power-up overlay (collectible)
      const ptype = powerAt(x, y);
      if (ptype) {
        const colorHex = POWERUPS?.[ptype]?.color ?? 0xffffff;

        const g = new THREE.Group();

        const gem = new THREE.Mesh(powerGemGeo, getMat(0xffffff, { emissive: colorHex, emissiveIntensity: 0.95 }));
        gem.position.y = 0.58;
        g.add(gem);

        const ring = new THREE.Mesh(powerRingGeo, getMat(colorHex, { emissive: colorHex, emissiveIntensity: 0.78 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.32;
        g.add(ring);

        // Clear, readable label (billboard)
        const label = new THREE.Sprite(getPowerLabelMat(ptype, colorHex));
        label.position.set(0, 1.15, 0.12);
        label.scale.set(1.9, 0.95, 1);
        g.add(label);

        // Float slightly forward so it's clearly "not a normal block"
        g.position.set(p.x, p.y, p.z + 0.34);
        g.userData.isPower = true;
        g.userData.gem = gem;
        g.userData.ring = ring;
        g.userData.label = label;
        fixedGroup.add(g);
        powerVfx.push(g);
      }
    }
  }
  fixedDirty = false;
  ghostDirty = true;
}

function computeGhostY() {
  if (!active) return null;
  let y = active.y;
  while (!collides(active, active.x, y - 1, active.matrix)) y--;
  return y;
}

function rebuildGhostMeshes() {
  clearGroup(ghostGroup);
  ghostDirty = false;
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
  activeDirty = false;
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

function getHorizDir() {
  const left = keys.has('ArrowLeft');
  const right = keys.has('ArrowRight');
  if (left && right) {
    if (lastHorizKey === 'ArrowLeft') return -1;
    if (lastHorizKey === 'ArrowRight') return 1;
    return 0;
  }
  return left ? -1 : right ? 1 : 0;
}

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
    return;
  }

  if (isPaused || isGameOver) return;

  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowRight': {
      lastHorizKey = e.key;
      const dir = getHorizDir();
      if (dir !== 0) tryMove(dir, 0);
      moveHoldDir = dir;
      moveHeldMs = 0;
      moveRepeatMs = 0;
      break;
    }
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
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key);
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const left = keys.has('ArrowLeft');
    const right = keys.has('ArrowRight');
    if (left) lastHorizKey = 'ArrowLeft';
    else if (right) lastHorizKey = 'ArrowRight';
    else lastHorizKey = null;

    const dir = getHorizDir();
    moveHoldDir = dir;
    moveHeldMs = 0;
    moveRepeatMs = 0;
  }
});

function togglePause() {
  if (isGameOver) return;
  isPaused = !isPaused;

  if (isPaused) {
    keys.clear();
    moveHoldDir = 0;
    moveHeldMs = 0;
    moveRepeatMs = 0;
    lastHorizKey = null;
    setOverlay(true, {
      title: 'Paused',
      subtitle: 'Press P to resume, or use the buttons below.',
      mode: 'pause',
    });
  } else {
    setOverlay(false);
  }
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

  // Horizontal DAS/ARR
  const dir = getHorizDir();

  if (dir !== moveHoldDir) {
    moveHoldDir = dir;
    moveHeldMs = 0;
    moveRepeatMs = 0;
  } else if (dir !== 0) {
    moveHeldMs += dtMs;
    if (moveHeldMs >= MOVE_DAS_MS) {
      moveRepeatMs += dtMs;
      while (moveRepeatMs >= MOVE_ARR_MS) {
        moveRepeatMs -= MOVE_ARR_MS;
        tryMove(dir, 0);
      }
    }
  }

  while (dropAccum >= interval) {
    dropAccum -= interval;

    if (!tryMove(0, -1)) {
      lockPiece();
      break;
    } else if (soft) {
      score += Math.round(1 * totalScoreMultiplier());
      updateHud();
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
  const dt = Math.min(t - lastTime, MAX_FRAME_DT_MS);
  lastTime = t;

  // Background motion
  if (starField) starField.rotation.y = t * 0.00002;
  if (nebulaGroup) nebulaGroup.rotation.z = -0.08 + t * 0.000015;

  // Animated rim lights
  if (rimLightA) {
    rimLightA.position.x = 16 + Math.sin(t * 0.0009) * 4.5;
    rimLightA.position.z = -10 + Math.cos(t * 0.0007) * 6.5;
  }
  if (rimLightB) {
    rimLightB.position.x = -16 + Math.cos(t * 0.0008) * 4.8;
    rimLightB.position.z = -8 + Math.sin(t * 0.0006) * 6.0;
  }

  step(dt);

  // Subtle rotation on power-ups (only when meshes exist)
  if (powerVfx.length) {
    for (const child of powerVfx) {
      child.userData.gem.rotation.y = t * 0.003;
      child.userData.ring.rotation.z = t * 0.003;

      // Very restrained "breathing" so it's unmistakable but not flashy
      const pulse = 1 + Math.sin(t * 0.0032) * 0.04;
      if (child.userData.label) child.userData.label.scale.set(1.9 * pulse, 0.95 * pulse, 1);
    }
  }

  updateBursts(dt);

  if (fixedDirty) rebuildFixedMeshes();
  if (activeDirty) rebuildActiveMeshes();
  if (ghostDirty) rebuildGhostMeshes();
  updateArcadeVfx();

  // Camera shake (very small)
  if (nowMs() < shakeUntil) {
    const k = shakeMag * (0.35 + Math.random() * 0.65);
    camera.position.set(baseCamPos.x + (Math.random() - 0.5) * k, baseCamPos.y + (Math.random() - 0.5) * k, baseCamPos.z);
    camera.lookAt(baseCamLook);
  } else {
    camera.position.copy(baseCamPos);
    camera.lookAt(baseCamLook);
    shakeMag = 0;
  }

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
  updatePowerupHud();
}

function clearAllPowerUps() {
  powerMap = new Map();
  fixedDirty = true;
}

function restartGame() {
  grid = newGrid();
  powerMap = new Map();
  score = 0;
  lines = 0;
  level = 1;
  baseDropIntervalMs = 800;
  isPaused = false;
  isGameOver = false;
  bestToastShown = false;
  keys.clear();
  moveHoldDir = 0;
  moveHeldMs = 0;
  moveRepeatMs = 0;
  lastHorizKey = null;

  hold = null;
  holdUsed = false;
  renderHoldPreview(hold);

  // Arcade counters
  piecesPlaced = 0;
  piecesSincePowerup = 0;
  linesSincePowerup = 0;

  resetArcadeState();

  refillBag();
  next = drawFromBag();
  renderNextPreview(next);
  spawnPiece();

  fixedDirty = true;
  activeDirty = true;
  ghostDirty = true;
  updateHud();
}

// UI hooks
function setArcadeEnabled(on) {
  arcadeEnabled = Boolean(on);
  if (elArcadeToggle) elArcadeToggle.checked = arcadeEnabled;
  if (elArcadeToggleHud) elArcadeToggleHud.checked = arcadeEnabled;
  setArcadeUI(arcadeEnabled);

  resetArcadeState();
  piecesSincePowerup = 0;
  linesSincePowerup = 0;

  if (!arcadeEnabled) {
    if (grid) {
      clearAllPowerUps();
      fixedDirty = true;
    }
  }

  updateHud();
}

elArcadeToggle?.addEventListener('change', (e) => {
  setArcadeEnabled(Boolean(e.target.checked));
});

elArcadeToggleHud?.addEventListener('change', (e) => {
  setArcadeEnabled(Boolean(e.target.checked));
});

elStartBtn?.addEventListener('click', () => {
  if (!active) restartGame();
  isPaused = false;
  isGameOver = false;
  setOverlay(false);
});

elResumeBtn?.addEventListener('click', () => {
  if (!isGameOver) {
    isPaused = false;
    setOverlay(false);
  }
});

elRestartBtn?.addEventListener('click', () => {
  restartGame();
  isPaused = false;
  setOverlay(false);
});

function startGame() {
  loadBestScore();
  setArcadeEnabled(false);
  restartGame();

  // Start on overlay, paused.
  isPaused = true;
  setOverlay(true, {
    title: '3D Tetris',
    subtitle: 'Press Start to play. Toggle Arcade Mode for power-ups + combos + Fever.',
    mode: 'start',
  });

  lastTime = performance.now();
  requestAnimationFrame(animate);
}

// Boot
initThree();
startGame();
