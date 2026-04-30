(function () {
  'use strict';

  // ─── Config ───────────────────────────────────────
  const COLS = 8;
  const ROWS = 8;
  const GEM_TYPES = 6;
  const TOTAL_STEPS = 30;
  const ANIM_DURATION = 200; // ms for slide / pop

  // Gem visuals
  const GEMS = [
    { color: '#f5576c', shadow: '#c62828', shape: 'circle' },  // red
    { color: '#4facfe', shadow: '#0277bd', shape: 'circle' },  // blue
    { color: '#43e97b', shadow: '#2e7d32', shape: 'circle' },  // green
    { color: '#fa709a', shadow: '#ad1457', shape: 'circle' },  // pink
    { color: '#fee440', shadow: '#f9a825', shape: 'circle' },  // yellow
    { color: '#a18cd1', shadow: '#4527a0', shape: 'circle' },  // purple
  ];

  // ─── DOM refs ──────────────────────────────────────
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const stepsEl = document.getElementById('steps');
  const comboEl = document.getElementById('combo');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const restartBtn = document.getElementById('restart-btn');

  // ─── State ─────────────────────────────────────────
  let cellSize, padding, offsetX, offsetY;
  let board = [];         // board[col][row]
  let score = 0;
  let steps = TOTAL_STEPS;
  let combo = 0;
  let selected = null;    // {col, row}
  let locked = false;      // block input during animation
  let gameStarted = false; // welcome overlay state

  // Animation queues
  let anims = [];

  // ─── Init ──────────────────────────────────────────
  function init() {
    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onPointerDown);
    restartBtn.addEventListener('click', onRestartClick);
    showWelcome();
  }

  function showWelcome() {
    overlayTitle.textContent = '消消乐';
    overlayMsg.textContent = '点击相邻宝石交换位置，3个相同即可消除！';
    restartBtn.textContent = '开始游戏';
    overlay.classList.add('show');
  }

  function onRestartClick() {
    if (!gameStarted) {
      gameStarted = true;
    }
    restart();
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width || 320;
    const h = rect.height || 320;
    const size = Math.floor(Math.min(w, h));
    if (size <= 0) return;
    canvas.width = size * (window.devicePixelRatio || 1);
    canvas.height = size * (window.devicePixelRatio || 1);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);

    cellSize = Math.floor(size / COLS);
    padding = Math.floor(cellSize * 0.1);
    offsetX = (size - COLS * cellSize) / 2;
    offsetY = (size - ROWS * cellSize) / 2;
    if (board.length) draw();
  }

  function restart() {
    overlay.classList.remove('show');
    score = 0;
    steps = TOTAL_STEPS;
    combo = 0;
    selected = null;
    locked = false;
    anims = [];
    updateUI();
    generateBoard();
    draw();
  }

  // ─── Board generation ─────────────────────────────
  function generateBoard() {
    board = [];
    for (let c = 0; c < COLS; c++) {
      board[c] = [];
      for (let r = 0; r < ROWS; r++) {
        let type;
        do {
          type = randType();
        } while (
          (c >= 2 && board[c - 1][r] === type && board[c - 2][r] === type) ||
          (r >= 2 && board[c][r - 1] === type && board[c][r - 2] === type)
        );
        board[c][r] = type;
      }
    }
  }

  function randType() {
    return Math.floor(Math.random() * GEM_TYPES);
  }

  // ─── Drawing ───────────────────────────────────────
  function draw() {
    const size = canvas.width / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, size, size);

    // Draw grid background
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if ((c + r) % 2 === 0) {
          ctx.fillRect(
            offsetX + c * cellSize,
            offsetY + r * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }

    // Draw gems
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (board[c][r] >= 0) {
          drawGem(c, r, board[c][r]);
        }
      }
    }

    // Draw selection highlight
    if (selected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(255,255,255,0.6)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(
        offsetX + selected.col * cellSize + 2,
        offsetY + selected.row * cellSize + 2,
        cellSize - 4,
        cellSize - 4,
        8
      );
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawGem(col, row, type, animOffsetX, animOffsetY) {
    const gem = GEMS[type];
    const cx = offsetX + col * cellSize + cellSize / 2 + (animOffsetX || 0);
    const cy = offsetY + row * cellSize + cellSize / 2 + (animOffsetY || 0);
    const radius = cellSize / 2 - padding;

    ctx.save();
    ctx.shadowColor = gem.shadow;
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = gem.color;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Highlight
    ctx.beginPath();
    ctx.arc(cx - radius * 0.25, cy - radius * 0.25, radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    ctx.restore();
  }

  // ─── Interaction ───────────────────────────────────
  function onPointerDown(e) {
    if (locked) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - offsetX;
    const y = e.clientY - rect.top - offsetY;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    if (!selected) {
      selected = { col, row };
      draw();
    } else {
      const dc = Math.abs(selected.col - col);
      const dr = Math.abs(selected.row - row);
      if ((dc === 1 && dr === 0) || (dc === 0 && dr === 1)) {
        trySwap(selected.col, selected.row, col, row);
      } else {
        selected = { col, row };
        draw();
      }
    }
  }

  async function trySwap(c1, r1, c2, r2) {
    locked = true;
    selected = null;

    // Swap
    swap(c1, r1, c2, r2);
    await animate(ANIM_DURATION);

    const matches = findMatches();
    if (matches.length === 0) {
      // Swap back
      swap(c1, r1, c2, r2);
      await animate(ANIM_DURATION);
      locked = false;
      draw();
      return;
    }

    steps--;
    combo = 0;
    updateUI();

    await processMatches();

    if (steps <= 0) {
      showEnd();
    }
    locked = false;
    draw();
  }

  function swap(c1, r1, c2, r2) {
    const tmp = board[c1][r1];
    board[c1][r1] = board[c2][r2];
    board[c2][r2] = tmp;
  }

  // ─── Match logic ───────────────────────────────────
  function findMatches() {
    const matched = new Set();

    // Horizontal
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS - 2; c++) {
        const t = board[c][r];
        if (t < 0) continue;
        if (board[c + 1][r] === t && board[c + 2][r] === t) {
          let end = c + 2;
          while (end + 1 < COLS && board[end + 1][r] === t) end++;
          for (let i = c; i <= end; i++) matched.add(i + ',' + r);
          c = end;
        }
      }
    }

    // Vertical
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS - 2; r++) {
        const t = board[c][r];
        if (t < 0) continue;
        if (board[c][r + 1] === t && board[c][r + 2] === t) {
          let end = r + 2;
          while (end + 1 < ROWS && board[c][end + 1] === t) end++;
          for (let i = r; i <= end; i++) matched.add(c + ',' + i);
          r = end;
        }
      }
    }

    return [...matched].map(s => {
      const [c, r] = s.split(',').map(Number);
      return { col: c, row: r, type: board[c][r] };
    });
  }

  async function processMatches() {
    let matches = findMatches();
    while (matches.length > 0) {
      combo++;
      const pts = matches.length * 10 * combo;
      score += pts;
      updateUI();

      // Pop animation
      for (const m of matches) {
        board[m.col][m.row] = -1;
      }
      draw();
      await animate(250);

      // Gravity
      applyGravity();
      draw();
      await animate(ANIM_DURATION);

      // Fill
      fillEmpty();
      draw();
      await animate(ANIM_DURATION);

      matches = findMatches();
    }
  }

  function applyGravity() {
    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[c][r] >= 0) {
          if (writeRow !== r) {
            board[c][writeRow] = board[c][r];
            board[c][r] = -1;
          }
          writeRow--;
        }
      }
    }
  }

  function fillEmpty() {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (board[c][r] < 0) {
          board[c][r] = randType();
        }
      }
    }
  }

  // ─── Animation helper ──────────────────────────────
  function animate(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─── UI ────────────────────────────────────────────
  function updateUI() {
    scoreEl.textContent = score;
    stepsEl.textContent = steps;
    comboEl.textContent = combo;
  }

  function showEnd() {
    overlayTitle.textContent = '游戏结束';
    overlayMsg.textContent = `最终得分: ${score}`;
    overlay.classList.add('show');
  }

  // ─── Polyfill: roundRect for older browsers ─────────
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === 'number') r = [r];
      const radii = r.map(v => Math.min(v, w / 2, h / 2));
      const rad = radii[0] || 0;
      this.moveTo(x + rad, y);
      this.arcTo(x + w, y, x + w, y + h, rad);
      this.arcTo(x + w, y + h, x, y + h, rad);
      this.arcTo(x, y + h, x, y, rad);
      this.arcTo(x, y, x + w, y, rad);
      this.closePath();
    };
  }

  // ─── Boot ──────────────────────────────────────────
  init();
})();
