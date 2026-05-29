/**
 * NEON PUZZLE - フローゲームエンジン & 共通UI管理
 */

// ===================================================
// グローバル状態
// ===================================================
let currentTab = 'flow';       // 現在のタブ ('flow' or 'picross')
let clearContext = 'flow';     // クリアオーバーレイのコンテキスト

// --- フロー固有 ---
let currentStageIndex = 0;
let moveCount = 0;
let paths = [];
let grid = [];
let dots = [];
let stageSize = 5;
let isDragging = false;
let dragColor = -1;
let canvas, ctx;
let cellSize = 0;
let completedStages = {};

// --- ピクロス固有（picross.jsで使用） ---
let completedPicrossStages = {};

// --- 重力固有（gravity.jsで使用） ---
let completedGravityStages = {};

const MARGIN_RATIO = 0.12;

// ===================================================
// 初期化
// ===================================================
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');

  // 保存データ読み込み
  try {
    const saved = localStorage.getItem('neonflow_progress');
    if (saved) completedStages = JSON.parse(saved);
  } catch(e) {}
  try {
    const savedP = localStorage.getItem('neonflow_picross_progress');
    if (savedP) completedPicrossStages = JSON.parse(savedP);
  } catch(e) {}
  try {
    const savedG = localStorage.getItem('neonflow_gravity_progress');
    if (savedG) completedGravityStages = JSON.parse(savedG);
  } catch(e) {}

  buildFlowSelectGrid();
  buildPicrossSelectGrid();
  buildGravitySelectGrid();
  setupTouchEvents();
  initPicross(); // picross.js で定義
});

// ===================================================
// 画面遷移
// ===================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showSplash() {
  hideClearOverlay();
  showScreen('splash-screen');
}

function showStageSelect(tab) {
  hideClearOverlay();
  if (tab) switchTab(tab);
  buildFlowSelectGrid();
  buildPicrossSelectGrid();
  buildGravitySelectGrid();
  showScreen('stage-select-screen');
}

function showGame(stageIndex) {
  currentStageIndex = stageIndex;
  loadStage(stageIndex);
  showScreen('game-screen');
}

// ===================================================
// タブ管理
// ===================================================
function switchTab(tab) {
  currentTab = tab;
  const flowGrid    = document.getElementById('flow-stage-grid');
  const picrossGrid = document.getElementById('picross-stage-grid');
  const gravityGrid = document.getElementById('gravity-stage-grid');
  const flowBtn     = document.getElementById('tab-flow-btn');
  const picrossBtn  = document.getElementById('tab-picross-btn');
  const gravityBtn  = document.getElementById('tab-gravity-btn');

  // 全て非表示・非アクティブにする
  flowGrid.style.display    = 'none';
  picrossGrid.style.display = 'none';
  if (gravityGrid) gravityGrid.style.display = 'none';
  flowBtn.classList.remove('active');
  picrossBtn.classList.remove('active');
  if (gravityBtn) gravityBtn.classList.remove('active');

  if (tab === 'flow') {
    flowGrid.style.display    = '';
    flowBtn.classList.add('active');
  } else if (tab === 'picross') {
    picrossGrid.style.display = '';
    picrossBtn.classList.add('active');
  } else if (tab === 'gravity') {
    if (gravityGrid) gravityGrid.style.display = '';
    if (gravityBtn) gravityBtn.classList.add('active');
  }
}

// ===================================================
// ステージ選択グリッド生成
// ===================================================
function buildFlowSelectGrid() {
  const container = document.getElementById('flow-stage-grid');
  container.innerHTML = '';
  STAGE_DATA.forEach((_, i) => {
    const btn = document.createElement('button');
    const cleared = completedStages[i];
    btn.className = 'stage-btn' + (cleared ? ' cleared-flow' : '');
    btn.id = `flow-stage-btn-${i + 1}`;

    const stars = cleared ? cleared.stars : 0;
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);

    btn.innerHTML = `
      <span class="stage-num-text">${i + 1}</span>
      <span class="stage-check" style="color:#4ecdc4">✓</span>
      <span class="stage-stars" style="color:${stars > 0 ? '#ffe66d' : 'rgba(255,255,255,0.15)'}">${starStr}</span>
    `;
    btn.addEventListener('click', () => showGame(i));
    container.appendChild(btn);
  });
}

function buildPicrossSelectGrid() {
  const container = document.getElementById('picross-stage-grid');
  container.innerHTML = '';
  PICROSS_STAGES.forEach((_, i) => {
    const btn = document.createElement('button');
    const cleared = completedPicrossStages[i];
    btn.className = 'stage-btn' + (cleared ? ' cleared-picross' : '');
    btn.id = `picross-stage-btn-${i + 1}`;

    const stars = cleared ? cleared.stars : 0;
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);

    btn.innerHTML = `
      <span class="stage-num-text">${i + 1}</span>
      <span class="stage-check" style="color:#a29bfe">✓</span>
      <span class="stage-stars" style="color:${stars > 0 ? '#ffe66d' : 'rgba(255,255,255,0.15)'}">${starStr}</span>
    `;
    btn.addEventListener('click', () => showPicrossGame(i));
    container.appendChild(btn);
  });
}

function buildGravitySelectGrid() {
  const container = document.getElementById('gravity-stage-grid');
  if (!container) return;
  container.innerHTML = '';
  GRAVITY_STAGES.forEach((_, i) => {
    const btn = document.createElement('button');
    const cleared = completedGravityStages[i];
    btn.className = 'stage-btn' + (cleared ? ' cleared-gravity' : '');
    btn.id = `gravity-stage-btn-${i + 1}`;

    const stars = cleared ? cleared.stars : 0;
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);

    btn.innerHTML = `
      <span class="stage-num-text">${i + 1}</span>
      <span class="stage-check" style="color:#ff9f43">✓</span>
      <span class="stage-stars" style="color:${stars > 0 ? '#ffe66d' : 'rgba(255,255,255,0.15)'}">${starStr}</span>
    `;
    btn.addEventListener('click', () => showGravityGame(i));
    container.appendChild(btn);
  });
}

// ===================================================
// ステージ読み込み（フロー）
// ===================================================
function loadStage(index) {
  const stage = STAGE_DATA[index];
  stageSize = stage.size;
  moveCount = 0;
  paths = [];
  dots = [];

  const colorCount = Math.max(...stage.dots.map(d => d[2])) + 1;
  for (let i = 0; i < colorCount; i++) paths.push([]);

  stage.dots.forEach(d => {
    dots.push({ row: d[0], col: d[1], colorIdx: d[2] });
  });

  grid = [];
  for (let r = 0; r < stageSize; r++) {
    grid[r] = [];
    for (let c = 0; c < stageSize; c++) {
      grid[r][c] = { colorIdx: -1, isDot: false };
    }
  }
  dots.forEach(d => {
    grid[d.row][d.col].isDot = true;
  });

  document.getElementById('current-stage-num').textContent = index + 1;
  document.getElementById('move-count').textContent = 0;
  document.getElementById('hint-text').textContent = 'ドットをスワイプして同じ色を繋ごう';

  updateProgressBar();
  resizeCanvas();
  drawAll();
}

// ===================================================
// Canvas リサイズ（フロー）
// ===================================================
function resizeCanvas() {
  const area = document.querySelector('#game-screen .game-area');
  const areaW = area.clientWidth - 28;
  const areaH = area.clientHeight - 28;
  const size = Math.min(areaW, areaH);
  canvas.width = size;
  canvas.height = size;
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';
  cellSize = size / stageSize;
}

window.addEventListener('resize', () => {
  if (document.getElementById('game-screen').classList.contains('active')) {
    resizeCanvas(); drawAll();
  }
  if (document.getElementById('picross-screen').classList.contains('active')) {
    resizePicross(); drawPicross();
  }
});

// ===================================================
// 描画（フロー）
// ===================================================
function drawAll() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawPaths();
  drawDots();
}

function drawGrid() {
  ctx.fillStyle = '#0d0d1f';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 12);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= stageSize; r++) {
    const y = r * cellSize;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  for (let c = 0; c <= stageSize; c++) {
    const x = c * cellSize;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }

  for (let r = 0; r < stageSize; r++) {
    for (let c = 0; c < stageSize; c++) {
      const colorIdx = getCellColor(r, c);
      if (colorIdx >= 0) {
        const x = c * cellSize, y = r * cellSize;
        ctx.fillStyle = COLORS[colorIdx].main + '18';
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }
    }
  }
}

function drawPaths() {
  const lineW = cellSize * (1 - MARGIN_RATIO * 2) * 0.65;
  paths.forEach((path, colorIdx) => {
    if (path.length < 2) return;
    const color = COLORS[colorIdx];
    ctx.save();
    ctx.shadowColor = color.glow;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = color.main;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    path.forEach((pt, i) => {
      const x = pt[1] * cellSize + cellSize / 2;
      const y = pt[0] * cellSize + cellSize / 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  });
}

function drawDots() {
  const dotR = cellSize * 0.32;
  dots.forEach(d => {
    const color = COLORS[d.colorIdx];
    const x = d.col * cellSize + cellSize / 2;
    const y = d.row * cellSize + cellSize / 2;
    ctx.save();
    ctx.shadowColor = color.glow;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = color.main;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, dotR * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.restore();

    const isConnected = paths[d.colorIdx] &&
      paths[d.colorIdx].some(pt => pt[0] === d.row && pt[1] === d.col);
    if (isConnected) {
      ctx.beginPath();
      ctx.arc(x, y, dotR + 2.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ===================================================
// セルの色を取得
// ===================================================
function getCellColor(r, c) {
  for (let colorIdx = 0; colorIdx < paths.length; colorIdx++) {
    if (paths[colorIdx].some(pt => pt[0] === r && pt[1] === c)) return colorIdx;
  }
  return -1;
}

// ===================================================
// タッチ操作（フロー）
// ===================================================
function setupTouchEvents() {
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
  canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });
  canvas.addEventListener('mousedown',  onMouseDown);
  canvas.addEventListener('mousemove',  onMouseMove);
  canvas.addEventListener('mouseup',    onMouseUp);
}

function getCell(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left, y = clientY - rect.top;
  const col = Math.floor(x / cellSize), row = Math.floor(y / cellSize);
  if (row < 0 || row >= stageSize || col < 0 || col >= stageSize) return null;
  return { row, col };
}

function onTouchStart(e) { e.preventDefault(); const t = e.touches[0]; startDrag(t.clientX, t.clientY); }
function onTouchMove(e)  { e.preventDefault(); const t = e.touches[0]; continueDrag(t.clientX, t.clientY); }
function onTouchEnd(e)   { e.preventDefault(); endDrag(); }
function onMouseDown(e)  { startDrag(e.clientX, e.clientY); }
function onMouseMove(e)  { if (isDragging) continueDrag(e.clientX, e.clientY); }
function onMouseUp(e)    { endDrag(); }

function startDrag(clientX, clientY) {
  const cell = getCell(clientX, clientY);
  if (!cell) return;
  const dot = getDotAt(cell.row, cell.col);
  if (dot) {
    isDragging = true;
    dragColor = dot.colorIdx;
    paths[dragColor] = [[cell.row, cell.col]];
    moveCount++;
    document.getElementById('move-count').textContent = moveCount;
    drawAll(); updateProgressBar();
    return;
  }
  const existingColor = getCellColor(cell.row, cell.col);
  if (existingColor >= 0) {
    isDragging = true;
    dragColor = existingColor;
    truncatePathAt(dragColor, cell.row, cell.col);
    moveCount++;
    document.getElementById('move-count').textContent = moveCount;
    drawAll(); updateProgressBar();
  }
}

function continueDrag(clientX, clientY) {
  if (!isDragging || dragColor < 0) return;
  const cell = getCell(clientX, clientY);
  if (!cell) return;
  const path = paths[dragColor];
  if (path.length === 0) return;
  const last = path[path.length - 1];
  if (last[0] === cell.row && last[1] === cell.col) return;
  const dr = Math.abs(cell.row - last[0]), dc = Math.abs(cell.col - last[1]);
  if (dr + dc !== 1) return;

  // 戻る
  if (path.length >= 2) {
    const prev = path[path.length - 2];
    if (prev[0] === cell.row && prev[1] === cell.col) {
      path.pop(); drawAll(); updateProgressBar(); return;
    }
  }

  // ゴールドットに到達
  const targetDot = getDotAt(cell.row, cell.col);
  if (targetDot && targetDot.colorIdx === dragColor) {
    if (isSameStart(dragColor, cell.row, cell.col)) return;
    path.push([cell.row, cell.col]);
    drawAll(); updateProgressBar();
    setTimeout(checkClear, 50);
    endDrag(); return;
  }

  // 他のドットには進めない
  if (getDotAt(cell.row, cell.col)) return;

  clearOtherPathAt(dragColor, cell.row, cell.col);
  path.push([cell.row, cell.col]);
  drawAll(); updateProgressBar();
}

function endDrag() { isDragging = false; dragColor = -1; }

// ===================================================
// パス操作ユーティリティ
// ===================================================
function getDotAt(row, col) {
  return dots.find(d => d.row === row && d.col === col) || null;
}
function isSameStart(colorIdx, row, col) {
  const path = paths[colorIdx];
  if (!path.length) return false;
  return path[0][0] === row && path[0][1] === col;
}
function truncatePathAt(colorIdx, row, col) {
  const path = paths[colorIdx];
  const idx = path.findIndex(pt => pt[0] === row && pt[1] === col);
  if (idx >= 0) paths[colorIdx] = path.slice(0, idx + 1);
}
function clearOtherPathAt(myColor, row, col) {
  for (let colorIdx = 0; colorIdx < paths.length; colorIdx++) {
    if (colorIdx === myColor) continue;
    const idx = paths[colorIdx].findIndex(pt => pt[0] === row && pt[1] === col);
    if (idx >= 0) paths[colorIdx] = paths[colorIdx].slice(0, idx);
  }
}

// ===================================================
// プログレスバー
// ===================================================
function updateProgressBar() {
  const total = stageSize * stageSize;
  const counted = new Set();
  paths.forEach(path => path.forEach(pt => counted.add(pt[0] * 100 + pt[1])));
  const pct = Math.round((counted.size / total) * 100);
  document.getElementById('fill-bar').style.width = pct + '%';
  document.getElementById('fill-label').textContent = pct + '%';
}

// ===================================================
// クリア判定（フロー）
// ===================================================
function isPathComplete(colorIdx) {
  const path = paths[colorIdx];
  if (path.length < 2) return false;
  const start = path[0], end = path[path.length - 1];
  const startDot = getDotAt(start[0], start[1]);
  const endDot   = getDotAt(end[0],   end[1]);
  return startDot && endDot &&
         startDot.colorIdx === colorIdx &&
         endDot.colorIdx   === colorIdx &&
         (start[0] !== end[0] || start[1] !== end[1]);
}

function checkClear() {
  if (!paths.every((_, i) => isPathComplete(i))) return;
  const total = stageSize * stageSize;
  const counted = new Set();
  paths.forEach(path => path.forEach(pt => counted.add(pt[0] * 100 + pt[1])));
  if (counted.size < total) return;
  onStageClear();
}

function onStageClear() {
  const perfectMoves = Math.ceil(stageSize * stageSize * 0.5);
  let stars = 1;
  if (moveCount <= perfectMoves) stars = 3;
  else if (moveCount <= perfectMoves * 1.8) stars = 2;

  const prev = completedStages[currentStageIndex];
  if (!prev || prev.stars < stars) {
    completedStages[currentStageIndex] = { stars, moves: moveCount };
    localStorage.setItem('neonflow_progress', JSON.stringify(completedStages));
  }
  buildFlowSelectGrid();
  setTimeout(() => showClearOverlay('flow', stars), 300);
}

// ===================================================
// クリアオーバーレイ（共通）
// ===================================================
function showClearOverlay(gameType, stars) {
  clearContext = gameType;
  const overlay = document.getElementById('clear-overlay');
  overlay.classList.remove('hidden');

  let stageNum = 1;
  let moves = 0;
  let label = 'STAGE';

  if (gameType === 'flow') {
    stageNum = currentStageIndex + 1;
    moves = moveCount;
    label = 'STAGE';
  } else if (gameType === 'picross') {
    stageNum = picrossStageIndex + 1;
    moves = pMoveCount;
    label = 'PICROSS';
  } else if (gameType === 'gravity') {
    stageNum = gravityStageIndex + 1;
    moves = gMoveCount;
    label = 'GRAVITY';
  }

  document.getElementById('clear-stage-num').textContent = `${label} ${stageNum}`;
  document.getElementById('clear-moves').textContent = moves;
  document.getElementById('clear-rating').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);

  ['star1','star2','star3'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.style.animation = 'none';
    void el.offsetHeight;
    const show = i < stars;
    el.textContent = show ? '⭐' : '☆';
    el.style.color = show ? '#ffe66d' : 'rgba(255,255,255,0.2)';
    el.style.animation = `star-appear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.3 + i * 0.2}s forwards`;
  });

  // ボタン設定
  const btnRetry = document.getElementById('btn-retry');
  const btnNext  = document.getElementById('btn-next');

  if (gameType === 'flow') {
    btnRetry.onclick = () => { hideClearOverlay(); resetStage(); };
    const isLast = currentStageIndex >= STAGE_DATA.length - 1;
    if (isLast) {
      btnNext.innerHTML = '🎉 全クリア！';
      btnNext.onclick = () => showSplash();
    } else {
      btnNext.innerHTML = `次のステージ <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      btnNext.onclick = () => { hideClearOverlay(); nextStage(); };
    }
  } else if (gameType === 'picross') {
    btnRetry.onclick = () => { hideClearOverlay(); resetPicross(); };
    const isLast = picrossStageIndex >= PICROSS_STAGES.length - 1;
    if (isLast) {
      btnNext.innerHTML = '🎉 全クリア！';
      btnNext.onclick = () => showSplash();
    } else {
      btnNext.innerHTML = `次のステージ <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      btnNext.onclick = () => { hideClearOverlay(); nextPicross(); };
    }
  } else if (gameType === 'gravity') {
    btnRetry.onclick = () => { hideClearOverlay(); resetGravityStage(); };
    const isLast = gravityStageIndex >= GRAVITY_STAGES.length - 1;
    if (isLast) {
      btnNext.innerHTML = '🎉 全クリア！';
      btnNext.onclick = () => showSplash();
    } else {
      btnNext.innerHTML = `次のステージ <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
      btnNext.onclick = () => { hideClearOverlay(); nextGravityStage(); };
    }
  }
}

function hideClearOverlay() {
  document.getElementById('clear-overlay').classList.add('hidden');
}

// ===================================================
// アクション（フロー）
// ===================================================
function resetStage() {
  hideClearOverlay();
  loadStage(currentStageIndex);
}

function nextStage() {
  if (currentStageIndex < STAGE_DATA.length - 1) showGame(currentStageIndex + 1);
}
