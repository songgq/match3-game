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
    { color: '#f5576c', shadow: '#c62828' },
    { color: '#4facfe', shadow: '#0277bd' },
    { color: '#43e97b', shadow: '#2e7d32' },
    { color: '#fa709a', shadow: '#ad1457' },
    { color: '#fee440', shadow: '#f9a825' },
    { color: '#a18cd1', shadow: '#4527a0' },
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
  const muteBtn = document.getElementById('mute-btn');

  // ─── State ─────────────────────────────────────────
  let cellSize, padding, offsetX, offsetY;
  let board = [];
  let score = 0;
  let steps = TOTAL_STEPS;
  let combo = 0;
  let selected = null;
  let locked = false;
  let gameStarted = false;
  let muted = false;

  // Visual effects
  let particles = [];
  let floatingTexts = [];

  // ─── Audio Engine ──────────────────────────────────
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playTone(freq, duration, type, volume) {
    if (muted || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume || 0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function sfxSelect() {
    playTone(600, 0.08, 'sine', 0.1);
  }

  function sfxSwap() {
    playTone(400, 0.1, 'triangle', 0.12);
  }

  function sfxSwapBack() {
    playTone(250, 0.12, 'triangle', 0.1);
  }

  function sfxPop(count) {
    // ascending notes for each gem removed
    for (let i = 0; i < Math.min(count, 6); i++) {
      setTimeout(() => {
        playTone(500 + i * 120, 0.15, 'sine', 0.12);
      }, i * 40);
    }
  }

  function sfxCombo(level) {
    // bright fanfare for combos
    const notes = [523, 659, 784, 988, 1175];
    for (let i = 0; i < Math.min(level, notes.length); i++) {
      setTimeout(() => {
        playTone(notes[i], 0.2, 'square', 0.08);
      }, i * 60);
    }
  }

  function sfxGameOver() {
    const notes = [392, 349, 330, 262];
    notes.forEach((n, i) => {
      setTimeout(() => playTone(n, 0.3, 'sine', 0.12), i * 200);
    });
  }

  function sfxStart() {
    const notes = [262, 330, 392, 523];
    notes.forEach((n, i) => {
      setTimeout(() => playTone(n, 0.2, 'sine', 0.1), i * 100);
    });
  }

  // ─── Particle System ───────────────────────────────
  function spawnParticles(col, row, color, count) {
    const cx = offsetX + col * cellSize + cellSize / 2;
    const cy = offsetY + row * cellSize + cellSize / 2;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.015 + Math.random() * 0.02,
        size: 2 + Math.random() * 4,
        color: color,
      });
    }
  }

  function spawnComboBurst(count) {
    // big burst from board center for combos
    const boardSize = COLS * cellSize;
    const cx = offsetX + boardSize / 2;
    const cy = offsetY + boardSize / 2;
    const colors = ['#fff', '#ffd700', '#ff6b6b', '#48dbfb', '#ff9ff3'];
    for (let i = 0; i < count * 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.01 + Math.random() * 0.015,
        size: 3 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  function spawnFloatingText(col, row, text, color) {
    const cx = offsetX + col * cellSize + cellSize / 2;
    const cy = offsetY + row * cellSize + cellSize / 2;
    floatingTexts.push({
      x: cx,
      y: cy,
      text: text,
      color: color || '#fff',
      life: 1,
      decay: 0.018,
      vy: -1.5,
      size: 16 + Math.min(text.length, 5),
    });
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gravity
      p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.y += ft.vy;
      ft.life -= ft.decay;
      if (ft.life <= 0) floatingTexts.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawFloatingTexts() {
    for (const ft of floatingTexts) {
      ctx.save();
      ctx.globalAlpha = ft.life;
      ctx.fillStyle = ft.color;
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 4;
      ctx.font = `bold ${ft.size}px 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  // ─── Init ──────────────────────────────────────────
  function init() {
    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('pointerdown', onPointerDown);
    restartBtn.addEventListener('click', onRestartClick);
    muteBtn.addEventListener('click', onMuteClick);
    showWelcome();
  }

  function onMuteClick() {
    muted = !muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
  }

  function showWelcome() {
    overlayTitle.textContent = '消消乐';
    overlayMsg.textContent = '点击相邻宝石交换位置，3个相同即可消除！';
    restartBtn.textContent = '开始游戏';
    overlay.classList.add('show');
  }

  function onRestartClick() {
    ensureAudio();
    if (!gameStarted) {
      gameStarted = true;
      sfxStart();
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
    particles = [];
    floatingTexts = [];
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

    // Grid background
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

    // Gems
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (board[c][r] >= 0) {
          drawGem(c, r, board[c][r]);
        }
      }
    }

    // Selection highlight
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

    // Effects
    drawParticles();
    drawFloatingTexts();
  }

  function drawGem(col, row, type) {
    const gem = GEMS[type];
    const cx = offsetX + col * cellSize + cellSize / 2;
    const cy = offsetY + row * cellSize + cellSize / 2;
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
    ensureAudio();
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - offsetX;
    const y = e.clientY - rect.top - offsetY;
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    if (!selected) {
      selected = { col, row };
      sfxSelect();
      draw();
    } else {
      const dc = Math.abs(selected.col - col);
      const dr = Math.abs(selected.row - row);
      if ((dc === 1 && dr === 0) || (dc === 0 && dr === 1)) {
        trySwap(selected.col, selected.row, col, row);
      } else {
        selected = { col, row };
        sfxSelect();
        draw();
      }
    }
  }

  async function trySwap(c1, r1, c2, r2) {
    locked = true;
    selected = null;

    swap(c1, r1, c2, r2);
    sfxSwap();
    await animate(ANIM_DURATION);

    const matches = findMatches();
    if (matches.length === 0) {
      swap(c1, r1, c2, r2);
      sfxSwapBack();
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
      sfxGameOver();
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

      // Sound effects
      sfxPop(matches.length);
      if (combo >= 2) {
        setTimeout(() => sfxCombo(combo), 100);
      }

      // Particles + floating score for each matched gem
      for (const m of matches) {
        spawnParticles(m.col, m.row, GEMS[m.type].color, 12);
        board[m.col][m.row] = -1;
      }

      // Floating score text at center of matches
      const midCol = matches.reduce((s, m) => s + m.col, 0) / matches.length;
      const midRow = matches.reduce((s, m) => s + m.row, 0) / matches.length;
      const comboLabel = combo > 1 ? `x${combo}` : '';
      spawnFloatingText(
        Math.round(midCol),
        Math.round(midRow),
        `+${pts} ${comboLabel}`,
        combo >= 3 ? '#ffd700' : combo >= 2 ? '#48dbfb' : '#fff'
      );

      if (combo >= 3) {
        spawnComboBurst(combo);
      }

      // Animation loop while particles are alive
      await animateWithParticles(400);

      // Gravity
      applyGravity();
      await animateWithParticles(ANIM_DURATION);

      // Fill
      fillEmpty();
      await animateWithParticles(ANIM_DURATION);

      draw();
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

  // ─── Animation helpers ─────────────────────────────
  function animate(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function animateWithParticles(ms) {
    return new Promise(resolve => {
      const start = performance.now();
      function tick(now) {
        updateParticles();
        draw();
        if (now - start < ms) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
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
    restartBtn.textContent = '重新开始';
    overlay.classList.add('show');
  }

  // ─── Polyfill: roundRect ───────────────────────────
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === 'number') r = [r];
      const rad = (r[0] || 0);
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
