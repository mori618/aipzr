/**
 * NEON FLOW - ゲームエンジン
 * タッチ操作でドット間をパイプで繋ぐパズルゲーム
 */

// ===================================================
// グローバル状態
// ===================================================
let currentStageIndex = 0;
let moveCount = 0;
let paths = [];         // paths[colorIdx] = [[r,c], ...]
let grid = [];          // grid[r][c] = { colorIdx: -1, dot: false }
let dots = [];          // ドット位置
let stageSize = 5;
let isDragging = false;
let dragColor = -1;
let canvas, ctx;
let cellSize = 0;
let clearData = null;   // クリア済みステージのデータ
let completedStages = {}; // { stageIndex: { stars, moves } }

// セル描画マージン
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

  buildStageSelectGrid();
  setupTouchEvents();
});

// ===================================================
// 画面遷移
// ===================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showSplash() {
  showScreen('splash-screen');
}

function showStageSelect() {
  hideClearOverlay();
  buildStageSelectGrid();
  showScreen('stage-select-screen');
}

function showGame(stageIndex) {
  currentStageIndex = stageIndex;
  loadStage(stageIndex);
  showScreen('game-screen');
}

// ===================================================
// ステージ選択グリッド生成
// ===================================================
function buildStageSelectGrid() {
  const grid = document.getElementById('stage-grid');
  grid.innerHTML = '';
  STAGE_DATA.forEach((stage, i) => {
    const btn = document.createElement('button');
    btn.className = 'stage-btn' + (completedStages[i] ? ' cleared' : '');
    btn.id = `stage-btn-${i+1}`;

    const stars = completedStages[i] ? completedStages[i].stars : 0;
    const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);

    btn.innerHTML = `
      <span class="stage-num-text">${i + 1}</span>
      <span class="stage-check">✓</span>
      <span class="stage-stars" style="color:${stars>0?'#ffe66d':'rgba(255,255,255,0.2)'}">${starStr}</span>
    `;
    btn.addEventListener('click', () => showGame(i));
    grid.appendChild(btn);
  });
}

// ===================================================
// ステージ読み込み
// ===================================================
function loadStage(index) {
  const stage = STAGE_DATA[index];
  stageSize = stage.size;
  moveCount = 0;
  paths = [];
  dots = [];

  // パス初期化
  const colorCount = Math.max(...stage.dots.map(d => d[2])) + 1;
  for (let i = 0; i < colorCount; i++) {
    paths.push([]);
  }

  // ドット設定
  stage.dots.forEach(d => {
    dots.push({ row: d[0], col: d[1], colorIdx: d[2] });
  });

  // グリッド初期化
  grid = [];
  for (let r = 0; r < stageSize; r++) {
    grid[r] = [];
    for (let c = 0; c < stageSize; c++) {
      grid[r][c] = { colorIdx: -1, isDot: false };
    }
  }

  // ドットをグリッドに配置
  dots.forEach(d => {
    grid[d.row][d.col].isDot = true;
    grid[d.row][d.col].colorIdx = -1;
  });

  // UI更新
  document.getElementById('current-stage-num').textContent = index + 1;
  document.getElementById('move-count').textContent = 0;
  document.getElementById('hint-text').textContent = 'ドットをスワイプして同じ色を繋ごう';

  updateProgressBar();
  resizeCanvas();
  drawAll();
}

// ===================================================
// Canvas リサイズ
// ===================================================
function resizeCanvas() {
  const area = document.querySelector('.game-area');
  const areaW = area.clientWidth - 32;
  const areaH = area.clientHeight - 32;
  const size = Math.min(areaW, areaH);

  canvas.width = size;
  canvas.height = size;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';

  cellSize = size / stageSize;
}

window.addEventListener('resize', () => {
  if (document.getElementById('game-screen').classList.contains('active')) {
    resizeCanvas();
    drawAll();
  }
});

// ===================================================
// 描画
// ===================================================
function drawAll() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid();
  drawPaths();
  drawDots();
}

function drawGrid() {
  // 背景
  ctx.fillStyle = '#0d0d1f';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 12);
  ctx.fill();

  // グリッド線
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;

  for (let r = 0; r <= stageSize; r++) {
    const y = r * cellSize;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  for (let c = 0; c <= stageSize; c++) {
    const x = c * cellSize;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // 埋まったセルのハイライト
  for (let r = 0; r < stageSize; r++) {
    for (let c = 0; c < stageSize; c++) {
      const colorIdx = getCellColor(r, c);
      if (colorIdx >= 0) {
        const color = COLORS[colorIdx];
        const x = c * cellSize;
        const y = r * cellSize;
        ctx.fillStyle = color.main + '18';
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
      }
    }
  }
}

function drawPaths() {
  const margin = cellSize * MARGIN_RATIO;
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
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
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

    // グロー効果
    ctx.save();
    ctx.shadowColor = color.glow;
    ctx.shadowBlur = 18;

    // 外円（リング）
    ctx.beginPath();
    ctx.arc(x, y, dotR, 0, Math.PI * 2);
    ctx.fillStyle = color.main;
    ctx.fill();

    // 内側ハイライト
    ctx.beginPath();
    ctx.arc(x, y, dotR * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    ctx.restore();

    // 接続済みドットの縁取り
    const isConnected = paths[d.colorIdx] && paths[d.colorIdx].some(
      pt => pt[0] === d.row && pt[1] === d.col
    );
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
// セルの色を取得（パスから）
// ===================================================
function getCellColor(r, c) {
  for (let colorIdx = 0; colorIdx < paths.length; colorIdx++) {
    const path = paths[colorIdx];
    for (let i = 0; i < path.length; i++) {
      if (path[i][0] === r && path[i][1] === c) return colorIdx;
    }
  }
  return -1;
}

// ===================================================
// タッチイベント設定
// ===================================================
function setupTouchEvents() {
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
}

function getCell(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  if (row < 0 || row >= stageSize || col < 0 || col >= stageSize) return null;
  return { row, col };
}

function onTouchStart(e) {
  e.preventDefault();
  const t = e.touches[0];
  startDrag(t.clientX, t.clientY);
}

function onTouchMove(e) {
  e.preventDefault();
  const t = e.touches[0];
  continueDrag(t.clientX, t.clientY);
}

function onTouchEnd(e) {
  e.preventDefault();
  endDrag();
}

function onMouseDown(e) { startDrag(e.clientX, e.clientY); }
function onMouseMove(e) { if (isDragging) continueDrag(e.clientX, e.clientY); }
function onMouseUp(e) { endDrag(); }

// ===================================================
// ドラッグ操作
// ===================================================
function startDrag(clientX, clientY) {
  const cell = getCell(clientX, clientY);
  if (!cell) return;

  // ドット上か確認
  const dot = getDotAt(cell.row, cell.col);
  if (dot) {
    isDragging = true;
    dragColor = dot.colorIdx;

    // 既存パスをクリア（そのドットから）
    clearPathFrom(dragColor, cell.row, cell.col);

    // パスを開始
    paths[dragColor] = [[cell.row, cell.col]];
    moveCount++;
    document.getElementById('move-count').textContent = moveCount;
    drawAll();
    updateProgressBar();
    return;
  }

  // パス上のセルか確認（パスを途中から再描画）
  const existingColor = getCellColor(cell.row, cell.col);
  if (existingColor >= 0) {
    isDragging = true;
    dragColor = existingColor;
    truncatePathAt(dragColor, cell.row, cell.col);
    moveCount++;
    document.getElementById('move-count').textContent = moveCount;
    drawAll();
    updateProgressBar();
  }
}

function continueDrag(clientX, clientY) {
  if (!isDragging || dragColor < 0) return;
  const cell = getCell(clientX, clientY);
  if (!cell) return;

  const path = paths[dragColor];
  if (path.length === 0) return;

  const last = path[path.length - 1];

  // 同じセル
  if (last[0] === cell.row && last[1] === cell.col) return;

  // 隣接チェック
  const dr = Math.abs(cell.row - last[0]);
  const dc = Math.abs(cell.col - last[1]);
  if (dr + dc !== 1) return;

  // パスを戻る（縮める）場合
  if (path.length >= 2) {
    const prev = path[path.length - 2];
    if (prev[0] === cell.row && prev[1] === cell.col) {
      path.pop();
      drawAll();
      updateProgressBar();
      return;
    }
  }

  // 自色のドット（ゴール）に到達
  const targetDot = getDotAt(cell.row, cell.col);
  if (targetDot && targetDot.colorIdx === dragColor) {
    // スタートと同じセルは戻るだけ
    if (isSameStart(dragColor, cell.row, cell.col)) {
      // 何もしない（折り返し禁止）
      return;
    }
    // ゴールに到達
    path.push([cell.row, cell.col]);
    drawAll();
    updateProgressBar();
    // 少し遅延してクリア判定（描画完了後）
    setTimeout(checkClear, 50);
    endDrag();
    return;
  }

  // 他のドットには進めない
  if (getDotAt(cell.row, cell.col)) return;

  // 他の色のパスがあれば消す
  clearOtherPathAt(dragColor, cell.row, cell.col);

  path.push([cell.row, cell.col]);
  drawAll();
  updateProgressBar();
}

function endDrag() {
  isDragging = false;
  dragColor = -1;
}

// ===================================================
// パス操作ユーティリティ
// ===================================================
function getDotAt(row, col) {
  return dots.find(d => d.row === row && d.col === col) || null;
}

function isSameStart(colorIdx, row, col) {
  const path = paths[colorIdx];
  if (path.length === 0) return false;
  const start = path[0];
  return start[0] === row && start[1] === col;
}

function clearPathFrom(colorIdx, row, col) {
  // そのカラーのパスをクリア
  paths[colorIdx] = [];
}

function truncatePathAt(colorIdx, row, col) {
  const path = paths[colorIdx];
  const idx = path.findIndex(pt => pt[0] === row && pt[1] === col);
  if (idx >= 0) {
    paths[colorIdx] = path.slice(0, idx + 1);
  }
}

function clearOtherPathAt(myColor, row, col) {
  for (let colorIdx = 0; colorIdx < paths.length; colorIdx++) {
    if (colorIdx === myColor) continue;
    const path = paths[colorIdx];
    const idx = path.findIndex(pt => pt[0] === row && pt[1] === col);
    if (idx >= 0) {
      paths[colorIdx] = path.slice(0, idx);
    }
  }
}

// ===================================================
// プログレスバー更新
// ===================================================
function updateProgressBar() {
  let filledCells = 0;
  const total = stageSize * stageSize;

  // パスが通っているセルを数える
  const counted = new Set();
  paths.forEach(path => {
    path.forEach(pt => {
      const key = pt[0] * 100 + pt[1];
      if (!counted.has(key)) {
        counted.add(key);
        filledCells++;
      }
    });
  });

  const pct = Math.round((filledCells / total) * 100);
  document.getElementById('fill-bar').style.width = pct + '%';
  document.getElementById('fill-label').textContent = pct + '%';
}

// ===================================================
// クリア判定
// ===================================================
function isPathComplete(colorIdx) {
  const path = paths[colorIdx];
  if (path.length < 2) return false;

  const start = path[0];
  const end = path[path.length - 1];

  // 両端がドットか
  const startDot = getDotAt(start[0], start[1]);
  const endDot = getDotAt(end[0], end[1]);

  return startDot && endDot &&
         startDot.colorIdx === colorIdx &&
         endDot.colorIdx === colorIdx &&
         (start[0] !== end[0] || start[1] !== end[1]);
}

function checkClear() {
  // 全色がつながっているか
  const allConnected = paths.every((_, i) => isPathComplete(i));
  if (!allConnected) return;

  // 全マスが埋まっているか
  const total = stageSize * stageSize;
  const counted = new Set();
  paths.forEach(path => {
    path.forEach(pt => counted.add(pt[0] * 100 + pt[1]));
  });

  if (counted.size < total) return;

  // クリア！
  onStageClear();
}

function onStageClear() {
  // 評価（手数ベース）
  const perfectMoves = Math.ceil(stageSize * stageSize * 0.5);
  let stars = 1;
  if (moveCount <= perfectMoves) stars = 3;
  else if (moveCount <= perfectMoves * 1.8) stars = 2;

  // 保存
  const prev = completedStages[currentStageIndex];
  if (!prev || prev.stars < stars) {
    completedStages[currentStageIndex] = { stars, moves: moveCount };
    localStorage.setItem('neonflow_progress', JSON.stringify(completedStages));
  }

  // クリア演出
  setTimeout(() => showClearOverlay(stars), 300);
}

// ===================================================
// クリアオーバーレイ
// ===================================================
function showClearOverlay(stars) {
  const overlay = document.getElementById('clear-overlay');
  overlay.classList.remove('hidden');

  document.getElementById('clear-stage-num').textContent = `STAGE ${currentStageIndex + 1}`;
  document.getElementById('clear-moves').textContent = moveCount;

  const starStr = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  document.getElementById('clear-rating').textContent = starStr;

  // 星アニメーションリセット
  ['star1','star2','star3'].forEach((id, i) => {
    const el = document.getElementById(id);
    el.style.opacity = '0';
    el.style.transform = 'scale(0)';
    el.style.animation = 'none';
    void el.offsetHeight;

    const show = i < stars;
    el.textContent = show ? '⭐' : '☆';
    el.style.color = show ? '#ffe66d' : 'rgba(255,255,255,0.2)';
    el.style.animation = `star-appear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.3 + i * 0.2}s forwards`;
  });

  // 次ステージボタン
  const btnNext = document.getElementById('btn-next');
  if (currentStageIndex >= STAGE_DATA.length - 1) {
    btnNext.textContent = '🎉 全クリア！';
    btnNext.onclick = () => showSplash();
  } else {
    btnNext.innerHTML = `次のステージ <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    btnNext.onclick = nextStage;
  }
}

function hideClearOverlay() {
  document.getElementById('clear-overlay').classList.add('hidden');
}

// ===================================================
// アクション
// ===================================================
function resetStage() {
  hideClearOverlay();
  loadStage(currentStageIndex);
}

function nextStage() {
  hideClearOverlay();
  if (currentStageIndex < STAGE_DATA.length - 1) {
    showGame(currentStageIndex + 1);
  }
}
