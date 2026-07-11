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
