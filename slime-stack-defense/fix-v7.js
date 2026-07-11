(() => {
  'use strict';

  const install = () => {
    const game = window.__game;
    if (!game || game.__campaignControlsFixV7) return false;
    game.__campaignControlsFixV7 = true;

    const { Body, Sleeping } = window.Matter;
    const HALF_PI = Math.PI / 2;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const STORAGE_KEY = 'slime-stack-defense-progress-v2';

    const loadProgress = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return {
          current: clamp(Number(saved.current) || 1, 1, 50),
          unlocked: clamp(Number(saved.unlocked) || 1, 1, 50)
        };
      } catch (_) {
        return { current: 1, unlocked: 1 };
      }
    };

    const saveProgress = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          current: game.currentLevel,
          unlocked: game.unlockedLevel
        }));
      } catch (_) {}
    };

    const progress = loadProgress();
    game.currentLevel = progress.current;
    game.unlockedLevel = progress.unlocked;
    game.levelPlan = [];
    game.levelSpawnInterval = 0.9;
    game.airPiece = null;
    game.airHoldDirection = 0;
    game.airHoldPointer = null;

    const makeLevelPlan = (level) => {
      const waveCount = level < 10 ? 4 : level < 25 ? 5 : 6;
      const plan = [];
      const pool = ['grunt'];
      if (level >= 3) pool.push('runner');
      if (level >= 7) pool.push('tank');
      if (level >= 13) pool.push('elite');

      const weightedType = (wave, index) => {
        const roll = (level * 37 + wave * 17 + index * 29) % 100;
        if (level >= 22 && roll > 82) return 'elite';
        if (level >= 11 && roll > 64) return 'tank';
        if (level >= 4 && roll > 42) return 'runner';
        return pool[(level + wave + index) % pool.length];
      };

      for (let wave = 0; wave < waveCount - 1; wave++) {
        const count = clamp(5 + Math.floor(level * 0.24) + wave * 2, 5, 18);
        const queue = [];
        for (let i = 0; i < count; i++) queue.push(weightedType(wave, i));
        plan.push(queue);
      }

      const finalCount = clamp(5 + Math.floor(level * 0.18), 5, 14);
      const finalWave = [];
      for (let i = 0; i < finalCount; i++) finalWave.push(weightedType(waveCount, i));
      finalWave.splice(Math.max(2, Math.floor(finalWave.length * 0.55)), 0, 'boss');
      plan.push(finalWave);
      return plan;
    };

    const levelName = (level) => {
      if (level <= 10) return '草原防线';
      if (level <= 20) return '迷雾峡谷';
      if (level <= 30) return '晶石高地';
      if (level <= 40) return '熔火边境';
      return '深渊王庭';
    };

    // ---------- Level/settings UI ----------
    const hud = document.getElementById('hud');
    const soundBtn = document.getElementById('soundBtn');
    const hudActions = document.createElement('div');
    hudActions.className = 'hud-actions-v7';

    const levelBtn = document.createElement('button');
    levelBtn.id = 'levelBtnV7';
    levelBtn.className = 'level-btn-v7';
    levelBtn.type = 'button';

    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'settingsBtnV7';
    settingsBtn.className = 'icon-btn settings-btn-v7';
    settingsBtn.type = 'button';
    settingsBtn.textContent = '⚙';
    settingsBtn.setAttribute('aria-label', '关卡设置');

    if (soundBtn && soundBtn.parentElement === hud) hud.removeChild(soundBtn);
    hudActions.append(levelBtn, settingsBtn);
    if (soundBtn) hudActions.appendChild(soundBtn);
    hud.appendChild(hudActions);

    const settingsOverlay = document.createElement('section');
    settingsOverlay.id = 'levelOverlayV7';
    settingsOverlay.className = 'overlay level-overlay-v7';
    settingsOverlay.innerHTML = `
      <div class="modal level-modal-v7">
        <div class="level-modal-head-v7">
          <div><small>关卡设置</small><h2>选择防线</h2></div>
          <button id="closeLevelV7" type="button" aria-label="关闭">×</button>
        </div>
        <p class="level-progress-v7" id="levelProgressV7"></p>
        <div class="level-grid-v7" id="levelGridV7"></div>
        <div class="level-note-v7">通关后自动解锁下一关，当前关卡会保存在浏览器中。</div>
      </div>`;
    document.getElementById('app').appendChild(settingsOverlay);

    const levelGrid = settingsOverlay.querySelector('#levelGridV7');
    const levelProgress = settingsOverlay.querySelector('#levelProgressV7');

    const refreshLevelUI = () => {
      levelBtn.innerHTML = `<b>第 ${game.currentLevel} 关</b><small>${levelName(game.currentLevel)}</small>`;
      levelProgress.textContent = `当前第 ${game.currentLevel} 关 · 已解锁 ${game.unlockedLevel}/50`;
      levelGrid.innerHTML = '';
      for (let level = 1; level <= 50; level++) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'level-cell-v7';
        button.textContent = level;
        button.dataset.level = level;
        const unlocked = level <= game.unlockedLevel;
        button.disabled = !unlocked;
        if (level === game.currentLevel) button.classList.add('current');
        if (level < game.unlockedLevel) button.classList.add('cleared');
        if (!unlocked) button.innerHTML = `<span>🔒</span><small>${level}</small>`;
        levelGrid.appendChild(button);
      }
      const startBtn = document.getElementById('startBtn');
      if (startBtn && document.getElementById('startOverlay')?.classList.contains('visible')) {
        startBtn.textContent = `开始第 ${game.currentLevel} 关`;
      }
    };

    const openSettings = () => {
      refreshLevelUI();
      settingsOverlay.classList.add('visible');
    };
    const closeSettings = () => settingsOverlay.classList.remove('visible');

    settingsBtn.addEventListener('click', openSettings);
    levelBtn.addEventListener('click', openSettings);
    settingsOverlay.querySelector('#closeLevelV7').addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('pointerdown', (event) => {
      if (event.target === settingsOverlay) closeSettings();
    });
    levelGrid.addEventListener('click', (event) => {
      const button = event.target.closest('.level-cell-v7');
      if (!button || button.disabled) return;
      game.currentLevel = clamp(Number(button.dataset.level), 1, game.unlockedLevel);
      saveProgress();
      refreshLevelUI();
      closeSettings();
      if (game.running && !game.ended) {
        game.start();
        game.toast(`已切换到第 ${game.currentLevel} 关`);
      }
    });

    // ---------- Campaign rules ----------
    const originalStart = game.start;
    game.start = function () {
      originalStart.call(this);
      this.levelPlan = makeLevelPlan(this.currentLevel);
      this.waveIndex = -1;
      this.waveQueue = [];
      this.spawnTimer = 0;
      this.waveDelay = 2.2;
      this.waveBanner = 0;
      this.levelSpawnInterval = clamp(1.03 - this.currentLevel * 0.007, 0.58, 1.0);
      this.airPiece = null;
      this.airHoldDirection = 0;
      saveProgress();
      refreshLevelUI();
      const waveText = document.getElementById('waveText');
      if (waveText) waveText.textContent = `第 ${this.currentLevel} 关`;
      this.toast(`${levelName(this.currentLevel)} · 第 ${this.currentLevel} 关`);
    };

    game.nextLevelWaveV7 = function () {
      this.waveIndex += 1;
      if (this.waveIndex >= this.levelPlan.length) return;
      this.waveQueue = [...this.levelPlan[this.waveIndex]];
      this.spawnTimer = 0.22;
      this.waveBanner = 2.0;
      const isBossWave = this.waveIndex === this.levelPlan.length - 1;
      const waveText = document.getElementById('waveText');
      if (waveText) {
        waveText.textContent = isBossWave
          ? `第 ${this.currentLevel} 关 · Boss`
          : `第 ${this.currentLevel} 关 · ${this.waveIndex + 1}/${this.levelPlan.length}`;
      }
      this.toast(isBossWave ? '⚠ Boss 波来袭！' : `第 ${this.waveIndex + 1} 波开始`);
    };

    game.updateWaves = function (dt) {
      if (this.waveIndex < 0) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) this.nextLevelWaveV7();
        return;
      }

      if (this.waveQueue.length) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const type = this.waveQueue.shift();
          this.spawnEnemy(type);
          const wavePressure = this.waveIndex * 0.045;
          this.spawnTimer = clamp(this.levelSpawnInterval - wavePressure, 0.46, 1.0);
        }
        return;
      }

      if (this.enemies.every(enemy => enemy.dead)) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) {
          if (this.waveIndex >= this.levelPlan.length - 1) this.finish(true);
          else {
            this.waveDelay = 2.0;
            this.nextLevelWaveV7();
          }
        }
      } else {
        this.waveDelay = 1.8;
      }
    };

    const originalSpawnEnemy = game.spawnEnemy;
    game.spawnEnemy = function (type) {
      const before = this.enemies.length;
      originalSpawnEnemy.call(this, type);
      const enemy = this.enemies[this.enemies.length - 1];
      if (!enemy || this.enemies.length === before) return;
      const level = this.currentLevel;
      const hpFactor = 1 + (level - 1) * 0.042 + (type === 'boss' ? Math.floor((level - 1) / 10) * 0.18 : 0);
      const damageFactor = 1 + (level - 1) * 0.022;
      const speedFactor = 1 + Math.min(0.30, (level - 1) * 0.006);
      enemy.hp *= hpFactor;
      enemy.maxHp *= hpFactor;
      enemy.damage *= damageFactor;
      enemy.speed *= speedFactor;
      enemy.reward = Math.round(enemy.reward * (1 + Math.min(0.45, level * 0.009)));
      enemy.level = level;
    };

    const originalFinish = game.finish;
    game.finish = function (won) {
      const completedLevel = this.currentLevel;
      if (won) {
        this.unlockedLevel = Math.max(this.unlockedLevel, Math.min(50, completedLevel + 1));
        if (completedLevel < 50) this.currentLevel = completedLevel + 1;
        saveProgress();
      }
      originalFinish.call(this, won);
      const resultDesc = document.getElementById('resultDesc');
      const restartBtn = document.getElementById('restartBtn');
      if (won) {
        if (completedLevel < 50) {
          if (resultDesc) resultDesc.textContent = `第 ${completedLevel} 关完成，已解锁第 ${completedLevel + 1} 关。`;
          if (restartBtn) restartBtn.textContent = '挑战下一关';
        } else {
          if (resultDesc) resultDesc.textContent = '前 50 关全部通关，深渊防线守住了！';
          if (restartBtn) restartBtn.textContent = '重玩第 50 关';
          this.currentLevel = 50;
        }
      } else {
        if (restartBtn) restartBtn.textContent = `重试第 ${completedLevel} 关`;
      }
      refreshLevelUI();
    };

    // ---------- Air rotation and long-press steering ----------
    const currentAirPiece = () => {
      const direct = game.airPiece;
      if (direct && game.pieces.includes(direct) && direct.airControl && !direct.airLanded) return direct;
      for (let i = game.pieces.length - 1; i >= 0; i--) {
        const piece = game.pieces[i];
        if (piece.released && piece.airControl && !piece.airLanded) return piece;
      }
      return null;
    };

    const previousEndDrag = game.endDrag;
    game.endDrag = function (event) {
      const gesture = this.__gesture;
      if (this.drag && gesture && event.pointerId === gesture.pointerId &&
          gesture.distance < 9 && performance.now() - gesture.startedAt < 420) {
        event.preventDefault();
        this.cancelDrag(event);
        this.__gesture = null;
        this.toast('请拖动方块到顶部投放');
        return;
      }
      const piece = this.drag?.piece;
      previousEndDrag.call(this, event);
      if (piece && piece.released) {
        piece.airControl = true;
        piece.airLanded = false;
        piece.airRotateCount = 0;
        this.airPiece = piece;
      }
    };

    // Remove V6 preview rotation and badges: rotation now happens after release.
    const previousRenderChoices = game.renderChoices;
    game.renderChoices = function () {
      this.choiceRotations = [0, 0, 0];
      previousRenderChoices.call(this);
      document.querySelectorAll('.piece-card').forEach(card => {
        const canvas = card.querySelector('canvas');
        if (canvas) canvas.style.transform = 'none';
        card.querySelectorAll('.rotation-badge').forEach(badge => badge.remove());
      });
    };

    game.rotateDrag = function () {
      const piece = currentAirPiece();
      if (!piece) {
        this.toast('方块落地后不能旋转');
        return;
      }
      const body = piece.body;
      const nextAngle = body.angle + HALF_PI;
      Body.setAngle(body, nextAngle);
      Body.setAngularVelocity(body, 0);
      Body.setVelocity(body, {
        x: clamp(body.velocity.x, -0.5, 0.5),
        y: Math.max(0.12, body.velocity.y)
      });
      Sleeping.set(body, false);
      piece.airRotateCount = (piece.airRotateCount + 1) % 4;
      this.audio.tone(500, 0.06, 'triangle', 0.025);
      this.toast(`空中旋转 ${piece.airRotateCount * 90}°`);
    };

    const guideLeft = document.createElement('div');
    guideLeft.className = 'air-guide-v7 left';
    guideLeft.innerHTML = '<span>‹</span><small>长按左移</small>';
    const guideRight = document.createElement('div');
    guideRight.className = 'air-guide-v7 right';
    guideRight.innerHTML = '<span>›</span><small>长按右移</small>';
    document.getElementById('app').append(guideLeft, guideRight);

    const startHold = (event) => {
      if (event.target.closest?.('button,.piece-dock,.overlay,.glass-panel')) return;
      const piece = currentAirPiece();
      if (!piece) return;
      const rect = game.canvas.getBoundingClientRect();
      if (event.clientY < rect.top + 120 || event.clientY > rect.bottom - 120) return;
      const relativeX = (event.clientX - rect.left) / rect.width;
      if (relativeX <= 1 / 3) game.airHoldDirection = -1;
      else if (relativeX >= 2 / 3) game.airHoldDirection = 1;
      else return;
      game.airHoldPointer = event.pointerId;
      event.preventDefault();
    };
    const stopHold = (event) => {
      if (game.airHoldPointer === event.pointerId) {
        game.airHoldPointer = null;
        game.airHoldDirection = 0;
      }
    };
    document.addEventListener('pointerdown', startHold, { capture: true, passive: false });
    document.addEventListener('pointerup', stopHold, { capture: true, passive: false });
    document.addEventListener('pointercancel', stopHold, { capture: true, passive: false });

    // ---------- Stable L/J pieces without disabling real toppling ----------
    const previousCreatePiece = game.createPiece;
    game.createPiece = function (...args) {
      const piece = previousCreatePiece.apply(this, args);
      piece.body.restitution = 0;
      piece.body.friction = 1;
      piece.body.frictionStatic = 1.25;
      piece.body.frictionAir = piece.type === 'L' || piece.type === 'J' ? 0.042 : 0.025;
      for (const part of piece.body.parts.slice(1)) {
        part.restitution = 0;
        part.friction = 1;
        part.frictionStatic = 1.25;
      }
      return piece;
    };

    const previousUpdatePhysics = game.updatePhysics;
    game.updatePhysics = function (dt) {
      previousUpdatePhysics.call(this, dt);

      const air = currentAirPiece();
      const activeAir = Boolean(air);
      guideLeft.classList.toggle('active', activeAir);
      guideRight.classList.toggle('active', activeAir);

      if (air) {
        const body = air.body;
        const touchedSupport = Boolean(air.supportInfo?.touching) && body.position.y > this.pathTop + 100;
        if (touchedSupport) {
          air.airLanded = true;
          air.airControl = false;
          if (this.airPiece === air) this.airPiece = null;
          this.airHoldDirection = 0;
          this.airHoldPointer = null;
        } else if (this.airHoldDirection) {
          const targetVX = this.airHoldDirection * 0.62;
          const nextVX = body.velocity.x + (targetVX - body.velocity.x) * Math.min(1, dt * 3.8);
          Body.setVelocity(body, {
            x: clamp(nextVX, -0.62, 0.62),
            y: body.velocity.y
          });
          Sleeping.set(body, false);
        }
      }

      for (const piece of this.pieces) {
        if (piece.type !== 'L' && piece.type !== 'J') continue;
        if (!piece.released || piece === this.drag?.piece) continue;
        const body = piece.body;
        const info = piece.supportInfo;
        if (!info?.stable || !piece.connected) continue;

        // Damp only micro-motion on a balanced support. Unbalanced L/J pieces remain
        // fully dynamic and can still tip or fall under the physics engine.
        const nearest = Math.round(body.angle / HALF_PI) * HALF_PI;
        const delta = Math.atan2(Math.sin(nearest - body.angle), Math.cos(nearest - body.angle));
        if (Math.abs(delta) < 0.10 && body.speed < 0.65 && body.angularSpeed < 0.09) {
          Body.setVelocity(body, { x: body.velocity.x * 0.36, y: body.velocity.y * 0.48 });
          Body.setAngularVelocity(body, body.angularVelocity * 0.22);
          Body.setAngle(body, body.angle + delta * Math.min(1, dt * 7));
          piece.lCalmTimer = (piece.lCalmTimer || 0) + dt;
          if (piece.lCalmTimer > 0.28 && body.speed < 0.22 && body.angularSpeed < 0.018) {
            Body.setVelocity(body, { x: 0, y: 0 });
            Body.setAngularVelocity(body, 0);
            Body.setAngle(body, nearest);
            Sleeping.set(body, true);
          }
        } else {
          piece.lCalmTimer = 0;
        }
      }
    };

    // ---------- More detailed boss overlay ----------
    const drawRefinedBoss = (ctx, enemy) => {
      const life = enemy.dead ? clamp(enemy.deathTimer / 0.45, 0, 1) : 1;
      const bob = 1.5 * Math.sin(enemy.bob || 0);
      const s = enemy.size || 30;
      ctx.save();
      ctx.translate(enemy.x, enemy.y + bob);
      ctx.globalAlpha *= life;
      if (enemy.dead) ctx.scale(life, life);

      // aura and shadow
      const aura = ctx.createRadialGradient(0, 0, 8, 0, 0, s * 1.8);
      aura.addColorStop(0, 'rgba(172,112,255,.34)');
      aura.addColorStop(1, 'rgba(88,43,125,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(38,22,51,.24)';
      ctx.beginPath();
      ctx.ellipse(0, s * 0.78, s * 1.08, s * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();

      // horns behind body
      ctx.fillStyle = '#2e203e';
      ctx.strokeStyle = 'rgba(255,255,255,.72)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.72, -s * 0.48);
      ctx.quadraticCurveTo(-s * 1.25, -s * 1.24, -s * 0.22, -s * 1.02);
      ctx.quadraticCurveTo(-s * 0.68, -s * 0.82, -s * 0.72, -s * 0.48);
      ctx.moveTo(s * 0.72, -s * 0.48);
      ctx.quadraticCurveTo(s * 1.25, -s * 1.24, s * 0.22, -s * 1.02);
      ctx.quadraticCurveTo(s * 0.68, -s * 0.82, s * 0.72, -s * 0.48);
      ctx.fill();
      ctx.stroke();

      // body
      const bodyGradient = ctx.createLinearGradient(0, -s, 0, s);
      bodyGradient.addColorStop(0, enemy.flash > 0 ? '#fff0ff' : '#7c4ba5');
      bodyGradient.addColorStop(0.55, '#56346f');
      bodyGradient.addColorStop(1, '#342242');
      ctx.fillStyle = bodyGradient;
      ctx.strokeStyle = '#f2d8ff';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-s * 0.93, s * 0.32);
      ctx.quadraticCurveTo(-s * 1.02, -s * 0.45, -s * 0.48, -s * 0.83);
      ctx.quadraticCurveTo(0, -s * 1.08, s * 0.48, -s * 0.83);
      ctx.quadraticCurveTo(s * 1.02, -s * 0.45, s * 0.93, s * 0.32);
      ctx.quadraticCurveTo(s * 0.7, s * 0.98, 0, s * 0.91);
      ctx.quadraticCurveTo(-s * 0.7, s * 0.98, -s * 0.93, s * 0.32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // armor plates
      ctx.fillStyle = 'rgba(225,194,255,.20)';
      ctx.beginPath();
      ctx.moveTo(-s * 0.72, s * 0.15);
      ctx.lineTo(-s * 0.15, s * 0.02);
      ctx.lineTo(-s * 0.08, s * 0.72);
      ctx.lineTo(-s * 0.62, s * 0.64);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.72, s * 0.15);
      ctx.lineTo(s * 0.15, s * 0.02);
      ctx.lineTo(s * 0.08, s * 0.72);
      ctx.lineTo(s * 0.62, s * 0.64);
      ctx.closePath();
      ctx.fill();

      // crown
      ctx.fillStyle = '#ffd866';
      ctx.strokeStyle = '#fff1b6';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(-s * 0.55, -s * 0.78);
      ctx.lineTo(-s * 0.4, -s * 1.28);
      ctx.lineTo(-s * 0.08, -s * 0.93);
      ctx.lineTo(s * 0.18, -s * 1.34);
      ctx.lineTo(s * 0.38, -s * 0.91);
      ctx.lineTo(s * 0.62, -s * 1.2);
      ctx.lineTo(s * 0.55, -s * 0.72);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e85f86';
      ctx.beginPath();
      ctx.arc(s * 0.17, -s * 1.12, s * 0.09, 0, Math.PI * 2);
      ctx.fill();

      // face
      ctx.fillStyle = '#fff9ff';
      ctx.beginPath();
      ctx.ellipse(-s * 0.32, -s * 0.25, s * 0.15, s * 0.19, -0.15, 0, Math.PI * 2);
      ctx.ellipse(s * 0.32, -s * 0.25, s * 0.15, s * 0.19, 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#24152e';
      ctx.beginPath();
      ctx.arc(-s * 0.28, -s * 0.22, s * 0.07, 0, Math.PI * 2);
      ctx.arc(s * 0.28, -s * 0.22, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f4d7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, s * 0.04, s * 0.27, 0.18, Math.PI - 0.18);
      ctx.stroke();

      // chest gem
      const gem = ctx.createRadialGradient(-s * 0.06, s * 0.32, 1, 0, s * 0.38, s * 0.24);
      gem.addColorStop(0, '#ffffff');
      gem.addColorStop(0.25, '#f6a7ff');
      gem.addColorStop(1, '#9c4ed2');
      ctx.fillStyle = gem;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.12);
      ctx.lineTo(s * 0.22, s * 0.38);
      ctx.lineTo(0, s * 0.66);
      ctx.lineTo(-s * 0.22, s * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const previousDrawEnemies = game.drawEnemies;
    game.drawEnemies = function (ctx) {
      previousDrawEnemies.call(this, ctx);
      for (const enemy of this.enemies) {
        if (enemy.type === 'boss') drawRefinedBoss(ctx, enemy);
      }
    };

    // ---------- Compact HUD and dock content ----------
    const stats = document.getElementById('stats');
    if (stats) {
      stats.classList.add('stats-inline-v7');
      const score = stats.querySelector('.score-row');
      if (score) score.innerHTML = '<span>击败 <b id="killText">0</b></span><span>连击 <b id="comboText">0</b></span>';
    }

    const previousUpdateHUD = game.updateHUD;
    game.updateHUD = function () {
      previousUpdateHUD.call(this);
      refreshLevelUI();
    };

    const dockTitle = document.querySelector('.dock-title span:first-child');
    if (dockTitle) dockTitle.textContent = '拖动投放 · 空中旋转与左右微调';
    const rotateBtn = document.getElementById('rotateBtn');
    if (rotateBtn) {
      rotateBtn.title = '方块释放后、落地前，每次点击顺时针旋转 90°';
      rotateBtn.setAttribute('aria-label', '空中顺时针旋转90度');
    }

    game.renderChoices();
    refreshLevelUI();
    game.toast('V7：50关、空中旋转、长按微调与新版界面');
    return true;
  };

  if (!install()) {
    const timer = setInterval(() => {
      if (install()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();
