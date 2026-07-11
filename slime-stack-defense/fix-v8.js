(() => {
  'use strict';

  const install = () => {
    const game = window.__game;
    if (!game || game.__rigidBlockVisualFixV8) return false;
    game.__rigidBlockVisualFixV8 = true;

    const { Body, Sleeping } = window.Matter;
    const TWO_PI = Math.PI * 2;
    const HALF_PI = Math.PI / 2;
    const CELL_SIZE = 30;
    const DRAW_SIZE = 27.2;

    const TYPES = {
      I: { color: '#68d98d', edge: '#35ae68', emoji: '➶' },
      O: { color: '#ffc95b', edge: '#e49c2e', emoji: '✹' },
      T: { color: '#a98bff', edge: '#7554db', emoji: '✦' },
      L: { color: '#ff7f78', edge: '#db4d56', emoji: '●' },
      J: { color: '#ff7f78', edge: '#db4d56', emoji: '●' },
      S: { color: '#69cfff', edge: '#3a9ed4', emoji: '❄' },
      Z: { color: '#69cfff', edge: '#3a9ed4', emoji: '❄' }
    };

    game.engine.positionIterations = Math.max(game.engine.positionIterations || 6, 14);
    game.engine.velocityIterations = Math.max(game.engine.velocityIterations || 4, 10);
    game.engine.constraintIterations = Math.max(game.engine.constraintIterations || 2, 4);

    const inverseRotate = (dx, dy, angle) => ({
      x: dx * Math.cos(angle) + dy * Math.sin(angle),
      y: -dx * Math.sin(angle) + dy * Math.cos(angle)
    });

    const configurePiece = piece => {
      if (!piece?.body) return piece;
      const body = piece.body;
      body.slop = 0.008;
      body.restitution = 0;
      body.friction = 1;
      body.frictionStatic = 1.35;
      for (const part of body.parts.slice(1)) {
        part.slop = 0.008;
        part.restitution = 0;
        part.friction = 1;
        part.frictionStatic = 1.35;
      }
      if (!piece.rigidRenderCells || piece.rigidRenderCells.length !== body.parts.length - 1) {
        piece.rigidRenderCells = body.parts.slice(1).map(part => {
          const local = inverseRotate(
            part.position.x - body.position.x,
            part.position.y - body.position.y,
            body.angle
          );
          return {
            x: Math.round(local.x * 1000) / 1000,
            y: Math.round(local.y * 1000) / 1000
          };
        });
      }
      return piece;
    };

    for (const piece of game.pieces) configurePiece(piece);

    const previousCreatePiece = game.createPiece;
    game.createPiece = function (...args) {
      return configurePiece(previousCreatePiece.apply(this, args));
    };

    const overlapX = (a, b) => Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);

    // Resolve only tiny vertical penetration on already balanced, grid-aligned stacks.
    // Unsupported or tilted bodies remain fully dynamic and can still topple.
    const correctShallowPenetration = function (piece) {
      const body = piece.body;
      const info = piece.supportInfo;
      if (!piece.connected || !info?.stable || piece.airControl || piece === this.drag?.piece) return;
      const nearest = Math.round(body.angle / HALF_PI) * HALF_PI;
      const angleDelta = Math.atan2(Math.sin(nearest - body.angle), Math.cos(nearest - body.angle));
      if (Math.abs(angleDelta) > 0.045 || body.speed > 0.55 || body.angularSpeed > 0.045) return;

      let lift = 0;
      const surfaces = [{ bounds: this.platform.bounds, top: this.platform.bounds.min.y }];
      for (const lower of this.pieces) {
        if (lower === piece || !lower.released) continue;
        for (const part of lower.body.parts.slice(1)) surfaces.push({ bounds: part.bounds, top: part.bounds.min.y });
      }

      for (const upper of body.parts.slice(1)) {
        for (const surface of surfaces) {
          if (surface.top <= upper.position.y) continue;
          if (overlapX(upper.bounds, surface.bounds) < 5) continue;
          const penetration = upper.bounds.max.y - surface.top;
          if (penetration > 0.02 && penetration < 2.4) lift = Math.max(lift, penetration);
        }
      }

      if (lift > 0) {
        Body.translate(body, { x: 0, y: -Math.min(lift + 0.03, 1.5) });
        Body.setVelocity(body, {
          x: body.velocity.x * 0.82,
          y: Math.min(0, body.velocity.y * 0.18)
        });
      }
    };

    const previousUpdatePhysics = game.updatePhysics;
    game.updatePhysics = function (dt) {
      previousUpdatePhysics.call(this, dt);
      for (const piece of this.pieces) {
        configurePiece(piece);
        correctShallowPenetration.call(this, piece);
      }
    };

    const roundedPath = (ctx, x, y, w, h, r) => {
      if (game.roundRect) {
        game.roundRect(ctx, x, y, w, h, r);
        return;
      }
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    };

    const drawDropGuide = function (ctx) {
      if (!this.drag?.piece) return;
      const piece = this.drag.piece;
      const body = piece.body;
      let targetY = this.platform.bounds.min.y - 16;
      for (const lower of this.pieces) {
        if (lower === piece || !lower.released) continue;
        const horizontal = Math.min(body.bounds.max.x, lower.body.bounds.max.x) -
          Math.max(body.bounds.min.x, lower.body.bounds.min.x);
        if (horizontal > 4) targetY = Math.min(targetY, lower.body.bounds.min.y - 16);
      }
      ctx.save();
      ctx.setLineDash([7, 7]);
      ctx.strokeStyle = 'rgba(111,79,231,.48)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(body.position.x, body.position.y + 18);
      ctx.lineTo(body.position.x, Math.max(body.position.y + 28, targetY));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    };

    // Draw every tetromino from immutable local cell coordinates. Physics controls
    // position and rotation only; rendering never uses penetrated polygons, so blocks
    // cannot appear compressed, stretched or dented when stacked.
    game.drawPieces = function (ctx) {
      drawDropGuide.call(this, ctx);

      for (const piece of this.pieces) {
        configurePiece(piece);
        const body = piece.body;
        const style = TYPES[piece.type] || TYPES.I;

        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);

        for (const cell of piece.rigidRenderCells) {
          const x = cell.x - DRAW_SIZE / 2;
          const y = cell.y - DRAW_SIZE / 2;
          const gradient = ctx.createLinearGradient(x, y, x + DRAW_SIZE, y + DRAW_SIZE);
          gradient.addColorStop(0, style.color);
          gradient.addColorStop(1, style.edge);
          ctx.fillStyle = gradient;
          ctx.strokeStyle = 'rgba(255,255,255,.92)';
          ctx.lineWidth = 2;
          roundedPath(ctx, x, y, DRAW_SIZE, DRAW_SIZE, 5.6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = 'rgba(255,255,255,.20)';
          roundedPath(ctx, x + 4, y + 3.5, DRAW_SIZE * 0.55, 4.5, 2.2);
          ctx.fill();
        }
        ctx.restore();

        const slime = this.slimePos(piece);
        ctx.save();
        ctx.translate(slime.x, slime.y);
        this.__drawingWorldSlime = true;
        try {
          this.drawSlime(ctx, style.color, style.edge, piece.active ? 1 : 0.72, style.emoji, piece.active);
        } finally {
          this.__drawingWorldSlime = false;
        }
        if (!piece.active && piece.released) {
          ctx.fillStyle = 'rgba(52,42,69,.48)';
          ctx.font = '900 10px sans-serif';
          ctx.textAlign = 'center';
          if (!piece.connected) ctx.fillText('!', 0, -16);
        }
        ctx.restore();
      }
    };

    game.toast('已修复：方块保持绝对刚性，不再出现挤压形变');
    return true;
  };

  if (!install()) {
    const timer = setInterval(() => install() && clearInterval(timer), 25);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();