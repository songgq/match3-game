(() => {
  'use strict';
  const install = () => {
    const game = window.__game;
    if (!game || !game.__campaignControlsFixV7 || game.__campaignControlsPerfFixV7) return false;
    game.__campaignControlsPerfFixV7 = true;

    const byId = id => document.getElementById(id);
    game.updateHUD = function () {
      const hpBar = byId('hpBar');
      const hpText = byId('hpText');
      const energyBar = byId('energyBar');
      const energyText = byId('energyText');
      const killText = byId('killText');
      const comboText = byId('comboText');
      const enemyText = byId('enemyText');
      if (hpBar) hpBar.style.width = `${this.hp}%`;
      if (hpText) hpText.textContent = Math.ceil(this.hp);
      if (energyBar) energyBar.style.width = `${this.energy}%`;
      if (energyText) energyText.textContent = Math.floor(this.energy);
      if (killText) killText.textContent = this.kills;
      if (comboText) comboText.textContent = this.combo;
      if (enemyText) {
        const alive = this.enemies.filter(enemy => !enemy.dead).length;
        const queued = this.waveQueue.length;
        enemyText.textContent = this.waveIndex < 0 ? '准备中' : `剩余 ${alive + queued}`;
      }
      const levelBtn = byId('levelBtnV7');
      if (levelBtn && levelBtn.dataset.level !== String(this.currentLevel)) {
        const names = ['草原防线', '迷雾峡谷', '晶石高地', '熔火边境', '深渊王庭'];
        const name = names[Math.min(4, Math.floor((this.currentLevel - 1) / 10))];
        levelBtn.dataset.level = String(this.currentLevel);
        levelBtn.innerHTML = `<b>第 ${this.currentLevel} 关</b><small>${name}</small>`;
      }
      this.updateCardState();
    };

    const startBtn = byId('startBtn');
    if (startBtn && !byId('startLevelSettingsV7')) {
      const startSettings = document.createElement('button');
      startSettings.id = 'startLevelSettingsV7';
      startSettings.type = 'button';
      startSettings.textContent = '⚙ 关卡设置';
      Object.assign(startSettings.style, {
        width: '100%', height: '38px', marginBottom: '9px', border: '1px solid rgba(113,81,220,.18)',
        borderRadius: '13px', background: '#f1ebff', color: '#674bd0', fontSize: '11px',
        fontWeight: '900', cursor: 'pointer'
      });
      startBtn.parentElement.insertBefore(startSettings, startBtn);
      startSettings.addEventListener('click', () => byId('settingsBtnV7')?.click());
    }
    const bossTip = document.querySelector('.how-grid>div:nth-child(3) small');
    if (bossTip) bossTip.textContent = '击败多波敌人与最终 Boss';

    document.addEventListener('pointerdown', event => {
      const rect = game.canvas.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right ||
          event.clientY < rect.top || event.clientY > rect.bottom) {
        game.airHoldDirection = 0;
        game.airHoldPointer = null;
      }
    }, { capture: true, passive: true });
    return true;
  };
  if (!install()) {
    const timer = setInterval(() => install() && clearInterval(timer), 25);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();
