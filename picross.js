/**
 * NEON PUZZLE - ピクロスエンジン
 * 数字ヒントに従ってグリッドを塗りつぶすパズル
 *
 * 操作:
 *   塗るモード: タップでON/OFF、ドラッグで連続塗り
 *   メモモード: タップでXマーク/解除、長押しでXマーク
 */

// ===================================================
// グローバル状態
// ===================================================
let picrossStageIndex = 0;
let pGrid       = [];      // 0=空, 1=塗り, 2=Xマーク
let pSolution   = [];
let pSize       = 5;
let pRowHints   = [];
let pColHints   = [];
let pMoveCount  = 0;
let pCanvas, pCtx;
let pCellSize   = 0;
let pHintRowCnt = 1;       // 行ヒントエリアの幅（セル数）
let pHintColCnt = 1;       // 列ヒントエリアの高さ（セル数）
let pMode       = 'fill';  // 'fill' | 'x'

// タッチ状態
let pTouchStartX    = 0;
let pTouchStartY    = 0;
let pTouchStartCell = null;
let pTouchStartTime = 0;
let pLongPressTimer = null;
let pIsDragging     = false;
let pDragMode       = null; // 'fill'|'unfill'|'x'|'unx'
let pMouseDown      = false;

// ===================================================
// 初期化
// ===================================================
function initPicross() {
  pCanvas = document.getElementById('picross-canvas');
  pCtx    = pCanvas.getContext('2d');
  setupPicrossEvents();
}

// ===================================================
// ステージ読み込み
// ===================================================
function showPicrossGame(index) {
  picrossStageIndex = index;
  loadPicross(index);
  showScreen('picross-screen');
}

function loadPicross(index) {
  picrossStageIndex = index;
  const stage = PICROSS_STAGES[index];
  pSize     = stage.size;
  pSolution = stage.solution;
  pMoveCount = 0;
  pMode     = 'fill';

  // グリッド初期化
  pGrid = Array.from({ length: pSize }, () => new Array(pSize).fill(0));

  // ヒント計算
  pRowHints = [];
  pColHints = [];
  for (let r = 0; r < pSize; r++) pRowHints.push(calcHints(pSolution[r]));
  for (let c = 0; c < pSize; c++) {
    pColHints.push(calcHints(pSolution.map(row => row[c])));
  }

  // ヒントエリアのセル数
  pHintRowCnt = Math.max(...pRowHints.map(h => h.length), 1);
  pHintColCnt = Math.max(...pColHints.map(h => h.length), 1);

  document.getElementById('picross-stage-num').textContent   = index + 1;
  document.getElementById('picross-move-count').textContent  = 0;
  updateModeButtons();
  resizePicross();
  drawPicross();
}

// ===================================================
// ヒント計算ユーティリティ
// ===================================================
function calcHints(line) {
  const hints = [];
  let count = 0;
  for (const v of line) {
    if (v === 1) { count++; }
    else if (count > 0) { hints.push(count); count = 0; }
  }
  if (count > 0) hints.push(count);
  return hints.length ? hints : [0];
}

function hintsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

// ===================================================
// Canvas リサイズ
// ===================================================
function resizePicross() {
  const area   = document.querySelector('#picross-screen .game-area');
  const areaW  = area.clientWidth  - 28;
  const areaH  = area.clientHeight - 28;
  const totC   = pHintRowCnt + pSize;
  const totR   = pHintColCnt + pSize;
  pCellSize    = Math.floor(Math.min(areaW / totC, areaH / totR));

  const cW = totC * pCellSize;
  const cH = totR * pCellSize;
  pCanvas.width  = cW;
  pCanvas.height = cH;
  pCanvas.style.width  = cW + 'px';
  pCanvas.style.height = cH + 'px';
}

// ===================================================
// 描画
// ===================================================
function drawPicross() {
  if (!pCtx) return;
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  drawPicrossBackground();
  drawPicrossHints();
  drawPicrossGrid();
}

function pOffsets() {
  return { ox: pHintRowCnt * pCellSize, oy: pHintColCnt * pCellSize };
}

function drawPicrossBackground() {
  pCtx.fillStyle = '#0d0d1f';
  pRoundRect(pCtx, 0, 0, pCanvas.width, pCanvas.height, 12);
  pCtx.fill();
}

function drawPicrossHints() {
  const { ox, oy } = pOffsets();
  const fs = Math.max(Math.floor(pCellSize * 0.44), 8);
  pCtx.font = `bold ${fs}px 'Orbitron', monospace`;

  // 列ヒント（上）
  for (let c = 0; c < pSize; c++) {
    const hints    = pColHints[c];
    const complete = isColComplete(c);
    pCtx.fillStyle = complete ? '#4ecdc4' : 'rgba(255,255,255,0.6)';
    pCtx.textAlign    = 'center';
    pCtx.textBaseline = 'bottom';
    hints.forEach((h, i) => {
      const idx = pHintColCnt - hints.length + i;
      const cx  = ox + (c + 0.5) * pCellSize;
      const cy  = (idx + 1) * pCellSize - Math.floor(pCellSize * 0.08);
      if (complete) {
        pCtx.save();
        pCtx.shadowColor = 'rgba(78,205,196,0.9)';
        pCtx.shadowBlur  = 8;
        pCtx.fillText(h, cx, cy);
        pCtx.restore();
      } else {
        pCtx.fillText(h, cx, cy);
      }
    });
  }

  // 行ヒント（左）
  for (let r = 0; r < pSize; r++) {
    const hints    = pRowHints[r];
    const complete = isRowComplete(r);
    pCtx.fillStyle = complete ? '#4ecdc4' : 'rgba(255,255,255,0.6)';
    pCtx.textAlign    = 'right';
    pCtx.textBaseline = 'middle';
    hints.forEach((h, i) => {
      const idx = pHintRowCnt - hints.length + i;
      const cx  = (idx + 1) * pCellSize - Math.floor(pCellSize * 0.1);
      const cy  = oy + (r + 0.5) * pCellSize;
      if (complete) {
        pCtx.save();
        pCtx.shadowColor = 'rgba(78,205,196,0.9)';
        pCtx.shadowBlur  = 8;
        pCtx.fillText(h, cx, cy);
        pCtx.restore();
      } else {
        pCtx.fillText(h, cx, cy);
      }
    });
  }

  // 区切り線
  pCtx.strokeStyle = 'rgba(255,255,255,0.22)';
  pCtx.lineWidth   = 2;
  pCtx.beginPath(); pCtx.moveTo(ox, 0); pCtx.lineTo(ox, pCanvas.height); pCtx.stroke();
  pCtx.beginPath(); pCtx.moveTo(0, oy); pCtx.lineTo(pCanvas.width, oy);  pCtx.stroke();
}

function drawPicrossGrid() {
  const { ox, oy } = pOffsets();

  for (let r = 0; r < pSize; r++) {
    const rowOk = isRowComplete(r);
    for (let c = 0; c < pSize; c++) {
      const colOk = isColComplete(c);
      const x     = ox + c * pCellSize;
      const y     = oy + r * pCellSize;
      const state = pGrid[r][c];

      if (state === 1) {
        // 塗り
        pCtx.save();
        pCtx.shadowColor = 'rgba(162,155,254,0.5)';
        pCtx.shadowBlur  = 8;
        pCtx.fillStyle   = '#a29bfe';
        pCtx.fillRect(x + 1, y + 1, pCellSize - 2, pCellSize - 2);
        pCtx.restore();
      } else if (state === 2) {
        // Xマーク
        pCtx.fillStyle = 'rgba(255,107,107,0.08)';
        pCtx.fillRect(x + 1, y + 1, pCellSize - 2, pCellSize - 2);
        const pad = pCellSize * 0.26;
        pCtx.strokeStyle = 'rgba(255,107,107,0.55)';
        pCtx.lineWidth   = Math.max(1.5, pCellSize * 0.09);
        pCtx.lineCap     = 'round';
        pCtx.beginPath();
        pCtx.moveTo(x + pad, y + pad);
        pCtx.lineTo(x + pCellSize - pad, y + pCellSize - pad);
        pCtx.moveTo(x + pCellSize - pad, y + pad);
        pCtx.lineTo(x + pad, y + pCellSize - pad);
        pCtx.stroke();
      } else {
        // 空
        const a = rowOk && colOk ? 0.08 : rowOk || colOk ? 0.05 : 0.02;
        pCtx.fillStyle = `rgba(162,155,254,${a})`;
        pCtx.fillRect(x + 1, y + 1, pCellSize - 2, pCellSize - 2);
      }
    }
  }

  // グリッド線（細）
  pCtx.strokeStyle = 'rgba(255,255,255,0.07)';
  pCtx.lineWidth   = 1;
  for (let r = 0; r <= pSize; r++) {
    pCtx.beginPath();
    pCtx.moveTo(ox, oy + r * pCellSize);
    pCtx.lineTo(ox + pSize * pCellSize, oy + r * pCellSize);
    pCtx.stroke();
  }
  for (let c = 0; c <= pSize; c++) {
    pCtx.beginPath();
    pCtx.moveTo(ox + c * pCellSize, oy);
    pCtx.lineTo(ox + c * pCellSize, oy + pSize * pCellSize);
    pCtx.stroke();
  }

  // 5セルごとに太い線（10x10）
  if (pSize >= 10) {
    pCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    pCtx.lineWidth   = 2;
    for (let i = 0; i <= pSize; i += 5) {
      pCtx.beginPath();
      pCtx.moveTo(ox + i * pCellSize, oy);
      pCtx.lineTo(ox + i * pCellSize, oy + pSize * pCellSize);
      pCtx.stroke();
      pCtx.beginPath();
      pCtx.moveTo(ox, oy + i * pCellSize);
      pCtx.lineTo(ox + pSize * pCellSize, oy + i * pCellSize);
      pCtx.stroke();
    }
  }
}

function pRoundRect(ctx, x, y, w, h, r) {
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
// 行・列の完成判定
// ===================================================
function isRowComplete(r) {
  const state = pGrid[r].map(v => v === 1 ? 1 : 0);
  return hintsEqual(calcHints(state), pRowHints[r]);
}

function isColComplete(c) {
  const state = pGrid.map(row => row[c] === 1 ? 1 : 0);
  return hintsEqual(calcHints(state), pColHints[c]);
}

// ===================================================
// セル座標変換
// ===================================================
function getPicrossCell(clientX, clientY) {
  const rect   = pCanvas.getBoundingClientRect();
  const scaleX = pCanvas.width  / rect.width;
  const scaleY = pCanvas.height / rect.height;
  const x      = (clientX - rect.left) * scaleX;
  const y      = (clientY - rect.top)  * scaleY;
  const { ox, oy } = pOffsets();
  if (x < ox || y < oy) return null;
  const col = Math.floor((x - ox) / pCellSize);
  const row = Math.floor((y - oy) / pCellSize);
  if (row < 0 || row >= pSize || col < 0 || col >= pSize) return null;
  return { row, col };
}

// ===================================================
// タッチ & マウスイベント
// ===================================================
function setupPicrossEvents() {
  pCanvas.addEventListener('touchstart', onPicrossTouchStart, { passive: false });
  pCanvas.addEventListener('touchmove',  onPicrossTouchMove,  { passive: false });
  pCanvas.addEventListener('touchend',   onPicrossTouchEnd,   { passive: false });
  pCanvas.addEventListener('mousedown',  onPicrossMouseDown);
  pCanvas.addEventListener('mousemove',  onPicrossMouseMove);
  pCanvas.addEventListener('mouseup',    onPicrossMouseUp);
}

function onPicrossTouchStart(e) {
  e.preventDefault();
  const t    = e.touches[0];
  const cell = getPicrossCell(t.clientX, t.clientY);
  if (!cell) return;

  pTouchStartX    = t.clientX;
  pTouchStartY    = t.clientY;
  pTouchStartCell = cell;
  pTouchStartTime = Date.now();
  pIsDragging     = false;

  // 長押し → Xマーク
  pLongPressTimer = setTimeout(() => {
    if (!pIsDragging && pTouchStartCell) {
      applyPicrossX(pTouchStartCell.row, pTouchStartCell.col);
      pTouchStartCell = null;
    }
  }, 480);
}

function onPicrossTouchMove(e) {
  e.preventDefault();
  if (!pTouchStartCell) return;
  const t    = e.touches[0];
  const dx   = Math.abs(t.clientX - pTouchStartX);
  const dy   = Math.abs(t.clientY - pTouchStartY);

  if (!pIsDragging && (dx > 6 || dy > 6)) {
    pIsDragging = true;
    clearTimeout(pLongPressTimer);
    const initState = pGrid[pTouchStartCell.row][pTouchStartCell.col];
    if (pMode === 'fill') {
      pDragMode = initState !== 1 ? 'fill' : 'unfill';
    } else {
      pDragMode = initState !== 2 ? 'x' : 'unx';
    }
  }

  if (pIsDragging) {
    const cell = getPicrossCell(t.clientX, t.clientY);
    if (cell) applyPicrossDrag(cell.row, cell.col);
  }
}

function onPicrossTouchEnd(e) {
  e.preventDefault();
  clearTimeout(pLongPressTimer);

  if (!pIsDragging && pTouchStartCell && Date.now() - pTouchStartTime < 480) {
    applyPicrossTap(pTouchStartCell.row, pTouchStartCell.col);
    checkPicrossWin();
  }

  if (pIsDragging) checkPicrossWin();

  pTouchStartCell = null;
  pIsDragging     = false;
  pDragMode       = null;
}

function onPicrossMouseDown(e) {
  pMouseDown = true;
  const cell = getPicrossCell(e.clientX, e.clientY);
  if (!cell) return;

  const initState = pGrid[cell.row][cell.col];
  if (pMode === 'fill') {
    pDragMode = initState !== 1 ? 'fill' : 'unfill';
  } else {
    pDragMode = initState !== 2 ? 'x' : 'unx';
  }
  applyPicrossTap(cell.row, cell.col);
}

function onPicrossMouseMove(e) {
  if (!pMouseDown) return;
  const cell = getPicrossCell(e.clientX, e.clientY);
  if (cell) applyPicrossDrag(cell.row, cell.col);
}

function onPicrossMouseUp(e) {
  pMouseDown = false;
  pDragMode  = null;
  checkPicrossWin();
}

// ===================================================
// セル操作
// ===================================================
function applyPicrossTap(r, c) {
  if (pMode === 'fill') {
    // 空 → 塗り → 空（Xは無視）
    if      (pGrid[r][c] === 0) pGrid[r][c] = 1;
    else if (pGrid[r][c] === 1) pGrid[r][c] = 0;
  } else {
    // 空 → X → 空（塗りは無視）
    if      (pGrid[r][c] === 0) pGrid[r][c] = 2;
    else if (pGrid[r][c] === 2) pGrid[r][c] = 0;
  }
  pMoveCount++;
  document.getElementById('picross-move-count').textContent = pMoveCount;
  drawPicross();
}

function applyPicrossX(r, c) {
  // 長押し専用：常にXトグル
  if      (pGrid[r][c] === 0) pGrid[r][c] = 2;
  else if (pGrid[r][c] === 2) pGrid[r][c] = 0;
  else if (pGrid[r][c] === 1) pGrid[r][c] = 0; // 塗りをクリア
  pMoveCount++;
  document.getElementById('picross-move-count').textContent = pMoveCount;
  drawPicross();
}

function applyPicrossDrag(r, c) {
  if (!pDragMode) return;
  let changed = false;
  if      (pDragMode === 'fill'   && pGrid[r][c] !== 1) { pGrid[r][c] = 1; changed = true; }
  else if (pDragMode === 'unfill' && pGrid[r][c] === 1) { pGrid[r][c] = 0; changed = true; }
  else if (pDragMode === 'x'      && pGrid[r][c] === 0) { pGrid[r][c] = 2; changed = true; }
  else if (pDragMode === 'unx'    && pGrid[r][c] === 2) { pGrid[r][c] = 0; changed = true; }
  if (changed) {
    pMoveCount++;
    document.getElementById('picross-move-count').textContent = pMoveCount;
    drawPicross();
  }
}

// ===================================================
// モード切替
// ===================================================
function setPicrossMode(mode) {
  pMode = mode;
  updateModeButtons();
}

function updateModeButtons() {
  document.getElementById('picross-fill-btn').classList.toggle('active', pMode === 'fill');
  document.getElementById('picross-x-btn').classList.toggle('active',    pMode === 'x');
}

// ===================================================
// クリア判定
// ===================================================
function checkPicrossWin() {
  for (let r = 0; r < pSize; r++) { if (!isRowComplete(r)) return; }
  for (let c = 0; c < pSize; c++) { if (!isColComplete(c)) return; }
  onPicrossClear();
}

function onPicrossClear() {
  const perfect = Math.ceil(pSize * pSize * 0.65);
  let stars = 1;
  if      (pMoveCount <= perfect)       stars = 3;
  else if (pMoveCount <= perfect * 1.6) stars = 2;

  const prev = completedPicrossStages[picrossStageIndex];
  if (!prev || prev.stars < stars) {
    completedPicrossStages[picrossStageIndex] = { stars, moves: pMoveCount };
    localStorage.setItem('neonflow_picross_progress', JSON.stringify(completedPicrossStages));
  }
  buildPicrossSelectGrid();
  setTimeout(() => showClearOverlay('picross', stars), 300);
}

// ===================================================
// アクション
// ===================================================
function resetPicross() {
  hideClearOverlay();
  loadPicross(picrossStageIndex);
}

function nextPicross() {
  if (picrossStageIndex < PICROSS_STAGES.length - 1) showPicrossGame(picrossStageIndex + 1);
}
