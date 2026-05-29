/**
 * GRAVITY NEON - 重力シフト・ネオンパズルエンジン
 * 
 * スマホ操作:
 *   - タップ: 空きマスに一時的な「ネオンブロック」を配置（配置制限数あり、超えると古いものから自動消去）
 *   - スワイプ: 盤面全体にその方向への重力を発生させ、すべてのボールを一斉に転がす
 */

// ===================================================
// グローバル状態 (GRAVITY NEON 固有)
// ===================================================
let gravityStageIndex = 0;
let gSize = 5;
let gBlockLimit = 1;
let gWalls = [];       // 二次元配列 [r, c] のリスト
let gBalls = [];       // { r, c, color, startR, startC } のリスト
let gGoals = [];       // { r, c, color } のリスト
let gPortals = [];     // { r1, c1, r2, c2, color } のリスト
let gArrows = [];      // { r, c, dir } のリスト
let gPlayerBlocks = []; // プレイヤーが配置した一時壁のリスト [{ r, c }]
let gMoveCount = 0;
let gCanvas, gCtx;
let gCellSize = 0;
let gIsMoving = false; // ボールが転がり中のフラグ
let gTrails = [];      // ボールの移動軌跡を保存するリスト [{ color, path: [[r, c], ...] }]

// スワイプ検出用変数
let gTouchStartX = 0;
let gTouchStartY = 0;
const SWIPE_THRESHOLD = 30; // スワイプと判定する最小ピクセル数

// 保存用データ
let completedGravityStages = {};

// ===================================================
// 初期化
// ===================================================
window.addEventListener('DOMContentLoaded', () => {
  gCanvas = document.getElementById('gravity-canvas');
  if (gCanvas) {
    gCtx = gCanvas.getContext('2d');
    setupGravityEvents();
  }

  // ローカルストレージから進捗をロード
  try {
    const saved = localStorage.getItem('neonflow_gravity_progress');
    if (saved) {
      completedGravityStages = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load gravity progress:', e);
  }
});

// ===================================================
// ステージ開始
// ===================================================
function showGravityGame(index) {
  gravityStageIndex = index;
  loadGravityStage(index);
  showScreen('gravity-screen');
}

function loadGravityStage(index) {
  gravityStageIndex = index;
  const stage = GRAVITY_STAGES[index];
  if (!stage) return;

  gSize = stage.size;
  gBlockLimit = stage.blockLimit || 1;
  gWalls = JSON.parse(JSON.stringify(stage.walls || []));
  gGoals = JSON.parse(JSON.stringify(stage.goals || []));
  gPortals = JSON.parse(JSON.stringify(stage.portals || []));
  gArrows = JSON.parse(JSON.stringify(stage.arrows || []));
  
  // ボール初期位置
  gBalls = stage.balls.map(b => ({
    r: b.r,
    c: b.c,
    color: b.color,
    startX: b.c, // 描画アニメーション用の現在位置（小数）
    startY: b.r,
    x: b.c,
    y: b.r,
    isAnimating: false
  }));

  gPlayerBlocks = []; // 配置したブロックのリセット
  gMoveCount = 0;
  gIsMoving = false;
  gTrails = []; // 軌跡クリア

  // 初期軌跡の追加（各ボールの初期位置）
  gBalls.forEach(b => {
    gTrails.push({
      color: b.color,
      path: [[b.r, b.c]]
    });
  });

  // UI表示更新
  document.getElementById('gravity-stage-num').textContent = index + 1;
  document.getElementById('gravity-move-count').textContent = 0;
  updateBlockLimitUI();

  resizeGravityCanvas();
  drawGravity();
}

function updateBlockLimitUI() {
  const el = document.getElementById('block-limit-text');
  if (el) {
    el.textContent = `ブロック配置: ${gPlayerBlocks.length} / ${gBlockLimit}`;
  }
}

// ===================================================
// Canvas リサイズ
// ===================================================
function resizeGravityCanvas() {
  const area = document.querySelector('#gravity-screen .game-area');
  if (!area || !gCanvas) return;
  const areaW = area.clientWidth - 28;
  const areaH = area.clientHeight - 28;
  const size = Math.min(areaW, areaH);
  gCanvas.width = size;
  gCanvas.height = size;
  gCanvas.style.width = size + 'px';
  gCanvas.style.height = size + 'px';
  gCellSize = size / gSize;
}

window.addEventListener('resize', () => {
  if (document.getElementById('gravity-screen') && document.getElementById('gravity-screen').classList.contains('active')) {
    resizeGravityCanvas();
    drawGravity();
  }
});

// ===================================================
// ボールの物理＆シミュレーション (重力シフト)
// ===================================================
function shiftGravity(dir) {
  if (gIsMoving) return; // アニメーション中は操作不可

  let dr = 0, dc = 0;
  if (dir === 'up') dr = -1;
  else if (dir === 'down') dr = 1;
  else if (dir === 'left') dc = -1;
  else if (dir === 'right') dc = 1;

  if (dr === 0 && dc === 0) return;

  // ボールの初期状態を記憶
  gBalls.forEach(b => {
    b.startX = b.c;
    b.startY = b.r;
    b.x = b.c;
    b.y = b.r;
  });

  let movedTotal = false;
  let stepLimit = gSize * 2; // 無限ループ防止用の最大ステップ数
  let steps = 0;

  // 移動履歴の追跡用（軌跡追加のため）
  const ballPaths = gBalls.map(() => []);

  // 1ステップずつ全ボールを動かすシミュレーションループ
  while (steps < stepLimit) {
    let movedThisStep = false;
    
    // ボールが壁に近い順（重力の方向にある順）に処理することで、クッション（衝突）が正しく機能する
    const sortedIndices = gBalls.map((b, i) => i).sort((idxA, idxB) => {
      const bA = gBalls[idxA];
      const bB = gBalls[idxB];
      if (dir === 'up') return bA.r - bB.r;     // 上重力なら、上のボールから先に動かす
      if (dir === 'down') return bB.r - bA.r;   // 下重力なら、下のボールから
      if (dir === 'left') return bA.c - bB.c;   // 左重力なら、左のボールから
      if (dir === 'right') return bB.c - bA.c;  // 右重力なら、右のボールから
      return 0;
    });

    for (const idx of sortedIndices) {
      const b = gBalls[idx];
      const nextR = b.r + dr;
      const nextC = b.c + dc;

      // 進入可能か判定
      if (canMoveTo(b, nextR, nextC, dir)) {
        // ワープポータル判定
        const portal = getPortalAt(nextR, nextC);
        if (portal) {
          // 対のポータルへワープ
          let targetR, targetC;
          if (portal.r1 === nextR && portal.c1 === nextC) {
            targetR = portal.r2;
            targetC = portal.c2;
          } else {
            targetR = portal.r1;
            targetC = portal.c1;
          }

          // ワープ先からさらにもう1マス進めるか確認
          const afterWarpR = targetR + dr;
          const afterWarpC = targetC + dc;
          
          // ワープした瞬間は、対のポータルの座標にボールを瞬間移動
          b.r = targetR;
          b.c = targetC;
          ballPaths[idx].push([targetR, targetC]);
          movedThisStep = true;
          movedTotal = true;
        } else {
          // 通常移動
          b.r = nextR;
          b.c = nextC;
          ballPaths[idx].push([nextR, nextC]);
          movedThisStep = true;
          movedTotal = true;
        }
      }
    }

    if (!movedThisStep) break; // どのボールも動かなければ終了
    steps++;
  }

  if (movedTotal) {
    gMoveCount++;
    document.getElementById('gravity-move-count').textContent = gMoveCount;
    
    // 軌跡の追加
    gBalls.forEach((b, idx) => {
      if (ballPaths[idx].length > 0) {
        // このボールの軌跡を登録
        gTrails.push({
          color: b.color,
          path: [[b.startY, b.startX], ...ballPaths[idx]]
        });
      }
    });

    // 滑らかな移動アニメーション開始
    animateBallMovement();
  }
}

// 進入可能かどうかの判定
function canMoveTo(ball, r, c, dir) {
  // 1. 盤面外
  if (r < 0 || r >= gSize || c < 0 || c >= gSize) return false;

  // 2. 永久の壁
  if (gWalls.some(w => w[0] === r && w[1] === c)) return false;

  // 3. プレイヤーの一時ブロック
  if (gPlayerBlocks.some(pb => pb.r === r && pb.c === c)) return false;

  // 4. 他のボール（クッション衝突）
  // 既に移動を終えて停止したボール、またはまだ動けないボールがそこにあるか
  if (gBalls.some(b => b.r === r && b.c === c)) return false;

  // 5. 矢印パネル（一方向床）の判定
  // 移動先のセルに矢印パネルがある場合、進入方向のチェックが必要
  const arrow = gArrows.find(a => a.r === r && a.c === c);
  if (arrow) {
    // 矢印の方向と「重力の方向（ボールが進む方向）」が一致していないと入れない
    if (arrow.dir !== dir) {
      return false; // 壁のように跳ね返される
    }
  }

  return true;
}

function getPortalAt(r, c) {
  return gPortals.find(p => (p.r1 === r && p.c1 === c) || (p.r2 === r && p.c2 === c)) || null;
}

// ===================================================
// 移動アニメーション
// ===================================================
function animateBallMovement() {
  gIsMoving = true;
  const duration = 280; // アニメーション時間 (ms)
  const startTime = performance.now();

  function step(timestamp) {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // イージング (easeOutQuad)
    const t = progress * (2 - progress);

    gBalls.forEach(b => {
      b.x = b.startX + (b.c - b.startX) * t;
      b.y = b.startY + (b.r - b.startY) * t;
    });

    drawGravity();

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      // アニメーション完了
      gBalls.forEach(b => {
        b.x = b.c;
        b.y = b.r;
        b.startX = b.c;
        b.startY = b.r;
      });
      gIsMoving = false;
      drawGravity();
      
      // クリア判定
      setTimeout(checkGravityWin, 80);
    }
  }

  requestAnimationFrame(step);
}

// ===================================================
// クリア判定
// ===================================================
function checkGravityWin() {
  if (gIsMoving) return;

  // 全てのボールが、対応する色のゴールの上に載っているか
  const allCorrect = gBalls.every(b => {
    // 同じカラーインデックスのゴールが、ボールの現在地と一致しているか
    return gGoals.some(goal => goal.r === b.r && goal.c === b.c && goal.color === b.color);
  });

  if (allCorrect) {
    onGravityClear();
  }
}

function onGravityClear() {
  // 手数による星評価
  // ステージごとの標準手数を想定し、星を設定
  // 今回は「ブロックを置いた状態で、スワイプ回数」を基本とする
  let stars = 3;
  const baseMoves = Math.ceil(gSize * 1.2);
  if (gMoveCount > baseMoves * 2.0) stars = 1;
  else if (gMoveCount > baseMoves * 1.3) stars = 2;

  // クリア進捗の保存
  const prev = completedGravityStages[gravityStageIndex];
  if (!prev || prev.stars < stars) {
    completedGravityStages[gravityStageIndex] = { stars, moves: gMoveCount };
    localStorage.setItem('neonflow_gravity_progress', JSON.stringify(completedGravityStages));
  }

  buildGravitySelectGrid(); // game.js 内で定義する関数

  // 共通のクリアオーバーレイ表示
  setTimeout(() => {
    showClearOverlay('gravity', stars);
  }, 200);
}

// ===================================================
// タッチ＆マウス操作
// ===================================================
function setupGravityEvents() {
  // タップ & スワイプ両対応のタッチイベント
  gCanvas.addEventListener('touchstart', onGravityTouchStart, { passive: false });
  gCanvas.addEventListener('touchmove',  onGravityTouchMove,  { passive: false });
  gCanvas.addEventListener('touchend',   onGravityTouchEnd,   { passive: false });
  
  // PC用マウスイベント
  gCanvas.addEventListener('mousedown',  onGravityMouseDown);
  gCanvas.addEventListener('mouseup',    onGravityMouseUp);
}

function getGravityCell(clientX, clientY) {
  const rect = gCanvas.getBoundingClientRect();
  const scaleX = gCanvas.width / rect.width;
  const scaleY = gCanvas.height / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  
  const col = Math.floor(x / gCellSize);
  const row = Math.floor(y / gCellSize);
  
  if (row < 0 || row >= gSize || col < 0 || col >= gSize) return null;
  return { row, col };
}

// タッチイベントハンドラー
function onGravityTouchStart(e) {
  e.preventDefault();
  if (gIsMoving) return;

  const t = e.touches[0];
  gTouchStartX = t.clientX;
  gTouchStartY = t.clientY;
}

function onGravityTouchMove(e) {
  e.preventDefault();
}

function onGravityTouchEnd(e) {
  e.preventDefault();
  if (gIsMoving) return;

  const t = e.changedTouches[0];
  const dx = t.clientX - gTouchStartX;
  const dy = t.clientY - gTouchStartY;

  // スワイプ判定
  if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
    if (Math.abs(dx) > Math.abs(dy)) {
      // 左右スワイプ
      if (dx > 0) shiftGravity('right');
      else shiftGravity('left');
    } else {
      // 上下スワイプ
      if (dy > 0) shiftGravity('down');
      else shiftGravity('up');
    }
  } else {
    // タップ判定 (一時ブロックの配置)
    const cell = getGravityCell(gTouchStartX, gTouchStartY);
    if (cell) {
      handleGravityTap(cell.row, cell.col);
    }
  }
}

// PC用マウスイベントハンドラー
function onGravityMouseDown(e) {
  if (gIsMoving) return;
  gTouchStartX = e.clientX;
  gTouchStartY = e.clientY;
}

function onGravityMouseUp(e) {
  if (gIsMoving) return;
  const dx = e.clientX - gTouchStartX;
  const dy = e.clientY - gTouchStartY;

  if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) shiftGravity('right');
      else shiftGravity('left');
    } else {
      if (dy > 0) shiftGravity('down');
      else shiftGravity('up');
    }
  } else {
    const cell = getGravityCell(e.clientX, e.clientY);
    if (cell) {
      handleGravityTap(cell.row, cell.col);
    }
  }
}

// セルタップ時の処理 (ブロックの配置/削除)
function handleGravityTap(r, c) {
  // すでに壁がある場所、ボールがある場所、ゴールがある場所には置けない
  if (gWalls.some(w => w[0] === r && w[1] === c)) return;
  if (gBalls.some(b => b.r === r && b.c === c)) return;
  
  // ポータルの座標、矢印の座標には置けない
  if (getPortalAt(r, c)) return;
  if (gArrows.some(a => a.r === r && a.c === c)) return;

  const existIdx = gPlayerBlocks.findIndex(pb => pb.r === r && pb.c === c);

  if (existIdx >= 0) {
    // すでに配置されている場合は、撤去する
    gPlayerBlocks.splice(existIdx, 1);
  } else {
    // 新しく配置する
    if (gPlayerBlocks.length >= gBlockLimit) {
      // 制限数を超えたら、一番古いものを消す
      gPlayerBlocks.shift();
    }
    gPlayerBlocks.push({ r, c });
  }

  updateBlockLimitUI();
  drawGravity();
}

// ===================================================
// HTML5 Canvas 描画処理 (ネオンスタイル)
// ===================================================
function drawGravity() {
  if (!gCtx || !gCanvas) return;
  gCtx.clearRect(0, 0, gCanvas.width, gCanvas.height);

  drawGravityBackground();
  drawGravityTrails();
  drawGravityGridLines();
  drawGravityArrows();
  drawGravityPortals();
  drawGravityWalls();
  drawGravityPlayerBlocks();
  drawGravityGoals();
  drawGravityBalls();
}

// 1. 背景の描画
function drawGravityBackground() {
  gCtx.fillStyle = '#0a0a18';
  gCtx.fillRect(0, 0, gCanvas.width, gCanvas.height);
}

// 2. 移動軌跡 (Trails) の描画
function drawGravityTrails() {
  gCtx.save();
  gTrails.forEach(trail => {
    if (trail.path.length < 2) return;
    const color = COLORS[trail.color];
    
    gCtx.strokeStyle = color.main + '44'; // 薄めのネオンカラー
    gCtx.lineWidth = gCellSize * 0.12;
    gCtx.lineCap = 'round';
    gCtx.lineJoin = 'round';
    
    // ネオングロウ効果
    gCtx.shadowColor = color.glow;
    gCtx.shadowBlur = 8;

    gCtx.beginPath();
    trail.path.forEach((pt, idx) => {
      const cx = pt[1] * gCellSize + gCellSize / 2;
      const cy = pt[0] * gCellSize + gCellSize / 2;
      if (idx === 0) gCtx.moveTo(cx, cy);
      else gCtx.lineTo(cx, cy);
    });
    gCtx.stroke();
  });
  gCtx.restore();
}

// 3. グリッド線
function drawGravityGridLines() {
  gCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  gCtx.lineWidth = 1;
  
  for (let r = 0; r <= gSize; r++) {
    const y = r * gCellSize;
    gCtx.beginPath();
    gCtx.moveTo(0, y);
    gCtx.lineTo(gCanvas.width, y);
    gCtx.stroke();
  }
  for (let c = 0; c <= gSize; c++) {
    const x = c * gCellSize;
    gCtx.beginPath();
    gCtx.moveTo(x, 0);
    gCtx.lineTo(x, gCanvas.height);
    gCtx.stroke();
  }
}

// 4. 一方向矢印床の描画
function drawGravityArrows() {
  gCtx.save();
  gArrows.forEach(arr => {
    const x = arr.c * gCellSize;
    const y = arr.r * gCellSize;
    const cx = x + gCellSize / 2;
    const cy = y + gCellSize / 2;
    const size = gCellSize * 0.4;

    // パネルのうっすら背景
    gCtx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    gCtx.fillRect(x + 2, y + 2, gCellSize - 4, gCellSize - 4);

    // 矢印のネオンカラー（白＋青のグロウ）
    gCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    gCtx.lineWidth = gCellSize * 0.08;
    gCtx.lineCap = 'round';
    gCtx.lineJoin = 'round';
    gCtx.shadowColor = 'rgba(116, 185, 255, 0.5)';
    gCtx.shadowBlur = 6;

    gCtx.beginPath();
    if (arr.dir === 'up') {
      gCtx.moveTo(cx, cy + size / 2);
      gCtx.lineTo(cx, cy - size / 2);
      gCtx.lineTo(cx - size / 3, cy - size / 6);
      gCtx.moveTo(cx, cy - size / 2);
      gCtx.lineTo(cx + size / 3, cy - size / 6);
    } else if (arr.dir === 'down') {
      gCtx.moveTo(cx, cy - size / 2);
      gCtx.lineTo(cx, cy + size / 2);
      gCtx.lineTo(cx - size / 3, cy + size / 6);
      gCtx.moveTo(cx, cy + size / 2);
      gCtx.lineTo(cx + size / 3, cy + size / 6);
    } else if (arr.dir === 'left') {
      gCtx.moveTo(cx + size / 2, cy);
      gCtx.lineTo(cx - size / 2, cy);
      gCtx.lineTo(cx - size / 6, cy - size / 3);
      gCtx.moveTo(cx - size / 2, cy);
      gCtx.lineTo(cx - size / 6, cy + size / 3);
    } else if (arr.dir === 'right') {
      gCtx.moveTo(cx - size / 2, cy);
      gCtx.lineTo(cx + size / 2, cy);
      gCtx.lineTo(cx + size / 6, cy - size / 3);
      gCtx.moveTo(cx + size / 2, cy);
      gCtx.lineTo(cx + size / 6, cy + size / 3);
    }
    gCtx.stroke();
  });
  gCtx.restore();
}

// 5. ワープポータル (渦巻きネオン)
function drawGravityPortals() {
  gCtx.save();
  const time = performance.now() * 0.003; // 回転アニメーション用
  
  gPortals.forEach(p => {
    const color = COLORS[p.color] || COLORS[3]; // 指定なしなら紫
    
    // 両方のポータルを描画
    const draws = [
      { r: p.r1, c: p.c1 },
      { r: p.r2, c: p.c2 }
    ];

    draws.forEach(pos => {
      const cx = pos.c * gCellSize + gCellSize / 2;
      const cy = pos.r * gCellSize + gCellSize / 2;
      const radius = gCellSize * 0.35;

      gCtx.shadowColor = color.glow;
      gCtx.shadowBlur = 10;
      gCtx.strokeStyle = color.main;
      gCtx.lineWidth = 2;

      // 渦巻きアニメーションの描画
      gCtx.beginPath();
      for (let angle = 0; angle < Math.PI * 4; angle += 0.1) {
        const rFactor = angle / (Math.PI * 4);
        const curRadius = radius * rFactor;
        const x = cx + Math.cos(angle + time) * curRadius;
        const y = cy + Math.sin(angle + time) * curRadius;
        if (angle === 0) gCtx.moveTo(x, y);
        else gCtx.lineTo(x, y);
      }
      gCtx.stroke();

      // 中央のコア
      gCtx.beginPath();
      gCtx.arc(cx, cy, radius * 0.25, 0, Math.PI * 2);
      gCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      gCtx.fill();
    });
  });
  gCtx.restore();
}

// 6. 永久の壁 (Walls)
function drawGravityWalls() {
  gCtx.save();
  gWalls.forEach(w => {
    const x = w[1] * gCellSize;
    const y = w[0] * gCellSize;
    const pad = 4;
    const size = gCellSize - pad * 2;

    // 壁の内側（メタリックダーク）
    gCtx.fillStyle = '#1e1e38';
    pRoundRect(gCtx, x + pad, y + pad, size, size, 8);
    gCtx.fill();

    // 壁のネオンフレーム（オレンジ寄りの落ち着いた赤で、永久性を表現）
    gCtx.strokeStyle = '#34495e';
    gCtx.lineWidth = 2;
    gCtx.stroke();

    // 内側の金属的な十字マーク
    gCtx.strokeStyle = '#2c3e50';
    gCtx.lineWidth = 1.5;
    gCtx.beginPath();
    gCtx.moveTo(x + pad + 6, y + pad + 6);
    gCtx.lineTo(x + pad + size - 6, y + pad + size - 6);
    gCtx.moveTo(x + pad + size - 6, y + pad + 6);
    gCtx.lineTo(x + pad + 6, y + pad + size - 6);
    gCtx.stroke();
  });
  gCtx.restore();
}

// 7. プレイヤー配置の一時ブロック
function drawGravityPlayerBlocks() {
  gCtx.save();
  const time = performance.now() * 0.005;
  const pulse = 0.8 + Math.sin(time) * 0.2; // 明滅アニメーション

  gPlayerBlocks.forEach(pb => {
    const x = pb.c * gCellSize;
    const y = pb.r * gCellSize;
    const pad = 5;
    const size = gCellSize - pad * 2;

    // 半透明背景
    gCtx.fillStyle = 'rgba(255, 159, 67, 0.15)';
    pRoundRect(gCtx, x + pad, y + pad, size, size, 6);
    gCtx.fill();

    // 激しく輝くオレンジネオン枠
    gCtx.strokeStyle = `rgba(255, 159, 67, ${pulse})`;
    gCtx.lineWidth = 3;
    gCtx.shadowColor = 'rgba(255, 159, 67, 0.8)';
    gCtx.shadowBlur = 12;
    pRoundRect(gCtx, x + pad, y + pad, size, size, 6);
    gCtx.stroke();

    // 通電中のネオンフェンス的な斜線デザイン
    gCtx.strokeStyle = 'rgba(255, 159, 67, 0.4)';
    gCtx.lineWidth = 2;
    gCtx.beginPath();
    gCtx.moveTo(x + pad + 4, y + pad + size / 2);
    gCtx.lineTo(x + pad + size / 2, y + pad + 4);
    gCtx.moveTo(x + pad + size / 2, y + pad + size - 4);
    gCtx.lineTo(x + pad + size - 4, y + pad + size / 2);
    gCtx.stroke();
  });
  gCtx.restore();
}

// 8. ゴール (Star)
function drawGravityGoals() {
  gCtx.save();
  const time = performance.now() * 0.002;

  gGoals.forEach(g => {
    const color = COLORS[g.color];
    const cx = g.c * gCellSize + gCellSize / 2;
    const cy = g.r * gCellSize + gCellSize / 2;
    const r = gCellSize * 0.28;

    // 回転する二重ネオンリング
    gCtx.strokeStyle = color.main;
    gCtx.lineWidth = 1.5;
    gCtx.shadowColor = color.glow;
    gCtx.shadowBlur = 8;
    
    gCtx.beginPath();
    gCtx.arc(cx, cy, r, 0, Math.PI * 2);
    gCtx.stroke();

    // 内側の明滅する光るターゲット星型
    const scale = 0.7 + Math.sin(time) * 0.12;
    drawNeonStar(gCtx, cx, cy, 5, r * 0.65 * scale, r * 0.3 * scale, color.main);
  });
  gCtx.restore();
}

// 星型を描くユーティリティ
function drawNeonStar(ctx, cx, cy, spikes, outerRadius, innerRadius, colorStr) {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  let step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fillStyle = colorStr + '44'; // うっすら色埋め
  ctx.fill();
  ctx.stroke();
}

// 9. ボール (球体 3Dグラデーション)
function drawGravityBalls() {
  gCtx.save();
  gBalls.forEach(b => {
    const color = COLORS[b.color];
    const cx = b.x * gCellSize + gCellSize / 2;
    const cy = b.y * gCellSize + gCellSize / 2;
    const r = gCellSize * 0.3;

    // 強い3D風ネオングロウ
    gCtx.shadowColor = color.glow;
    gCtx.shadowBlur = 18;

    // 放射状グラデーションで3D球体感を演出
    const grad = gCtx.createRadialGradient(
      cx - r * 0.3, cy - r * 0.3, r * 0.1, // 光源（左上）
      cx, cy, r
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, color.main);
    grad.addColorStop(1, color.dark || '#000000');

    gCtx.beginPath();
    gCtx.arc(cx, cy, r, 0, Math.PI * 2);
    gCtx.fillStyle = grad;
    gCtx.fill();

    // 外枠の細い光輪
    gCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    gCtx.lineWidth = 1;
    gCtx.beginPath();
    gCtx.arc(cx, cy, r, 0, Math.PI * 2);
    gCtx.stroke();
  });
  gCtx.restore();
}

// 角丸四角形を描くユーティリティ
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
// アクション制御 (共通UIから呼び出し可能)
// ===================================================
function resetGravityStage() {
  if (gIsMoving) return;
  hideClearOverlay();
  loadGravityStage(gravityStageIndex);
}

function nextGravityStage() {
  if (gIsMoving) return;
  if (gravityStageIndex < GRAVITY_STAGES.length - 1) {
    showGravityGame(gravityStageIndex + 1);
  }
}
