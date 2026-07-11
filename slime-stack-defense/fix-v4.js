(() => {
  'use strict';

  const install = () => {
    const game = window.__game;
    if (!game || game.__dropAndSlimeFixV4) return false;
    game.__dropAndSlimeFixV4 = true;

    const { Body, Sleeping } = window.Matter;

    // Keep a visible gap below the dragged piece so releasing always produces
    // an obvious gravity drop instead of appearing to remain suspended.
    const originalMoveDrag = game.moveDrag;
    game.moveDrag = function (event) {
      originalMoveDrag.call(this, event);
      if (!this.drag) return;
      const body = this.drag.piece.body;
      const maxY = this.platformY - 92;
      if (body.position.y > maxY) {
        Body.setPosition(body, { x: body.position.x, y: maxY });
        Body.setVelocity(body, { x: 0, y: 0 });
      }
    };

    // Matter compound bodies can retain sleeping/filter state on some mobile
    // browsers after being held as static. Explicitly wake every part.
    const originalEndDrag = game.endDrag;
    game.endDrag = function (event) {
      const piece = this.drag && this.drag.piece;
      originalEndDrag.call(this, event);
      if (!piece || !piece.released) return;

      Body.setStatic(piece.body, false);
      piece.body.collisionFilter.mask = 0x0001;
      for (const part of piece.body.parts) part.collisionFilter.mask = 0x0001;
      Sleeping.set(piece.body, false);
      piece.body.isSleeping = false;
      piece.stable = 0;
      piece.connected = false;
      piece.active = false;
      Body.setVelocity(piece.body, { x: 0, y: 2.2 });
      Body.setAngularVelocity(piece.body, 0);
      Body.applyForce(piece.body, piece.body.position, {
        x: 0,
        y: Math.max(0.0015, piece.body.mass * 0.0012)
      });
    };

    // Put the slime in one of the occupied cells rather than above the piece.
    const originalCreatePiece = game.createPiece;
    game.createPiece = function (...args) {
      const piece = originalCreatePiece.apply(this, args);
      const body = piece.body;
      const cells = body.parts.slice(1);
      if (cells.length) {
        let best = cells[0];
        let bestScore = Infinity;
        for (const part of cells) {
          const dx = part.position.x - body.position.x;
          const dy = part.position.y - body.position.y;
          const score = dx * dx + dy * dy + Math.max(0, dy) * 0.01;
          if (score < bestScore) {
            best = part;
            bestScore = score;
          }
        }
        piece.anchorLocal = {
          x: best.position.x - body.position.x,
          y: best.position.y - body.position.y + 1
        };
        piece.slimeScale = 0.54;
      }
      return piece;
    };

    // Scale the in-game slime to fit inside a cell. Also hide the old "!" /
    // "Zz" markers, which looked like errors while a piece was still falling.
    const originalDrawPieces = game.drawPieces;
    const originalDrawSlime = game.drawSlime;
    const originalDrawCard = game.drawCard;

    game.drawPieces = function (context) {
      const originalFillText = context.fillText;
      context.fillText = function (text, ...rest) {
        if (text === '!' || text === 'Zz') return;
        return originalFillText.call(this, text, ...rest);
      };
      this.__drawingWorldSlime = true;
      try {
        originalDrawPieces.call(this, context);
      } finally {
        this.__drawingWorldSlime = false;
        context.fillText = originalFillText;
      }
    };

    game.drawCard = function (...args) {
      this.__drawingCardSlime = true;
      try {
        return originalDrawCard.apply(this, args);
      } finally {
        this.__drawingCardSlime = false;
      }
    };

    game.drawSlime = function (context, ...args) {
      if (this.__drawingWorldSlime) {
        context.save();
        context.scale(0.54, 0.54);
        originalDrawSlime.call(this, context, ...args);
        context.restore();
        return;
      }
      if (this.__drawingCardSlime) {
        context.save();
        context.translate(0, 31);
        context.scale(0.52, 0.52);
        originalDrawSlime.call(this, context, ...args);
        context.restore();
        return;
      }
      return originalDrawSlime.call(this, context, ...args);
    };

    // Refresh the three cards so their preview slimes also sit inside blocks.
    if (game.renderChoices) game.renderChoices();
    return true;
  };

  if (!install()) {
    const timer = setInterval(() => {
      if (install()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();
