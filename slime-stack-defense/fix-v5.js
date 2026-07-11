(() => {
  'use strict';

  const install = () => {
    const game = window.__game;
    if (!game || game.__placementAndMagnetFixV5) return false;
    game.__placementAndMagnetFixV5 = true;

    const { Body, Sleeping } = window.Matter;
    const CELL = 30;

    // Longer practical attack reach so towers on the right side can still cover
    // the left and lower route without turning every unit into a full-map turret.
    const originalPickTarget = game.pickTarget;
    game.pickTarget = function (position, range) {
      const tunedRange = Math.max(335, range * 1.5);
      return originalPickTarget.call(this, position, tunedRange);
    };

    // Pieces may only be aimed horizontally along the top deployment rail.
    // The actual descent starts only after release.
    const originalMoveDrag = game.moveDrag;
    game.moveDrag = function (event) {
      originalMoveDrag.call(this, event);
      if (!this.drag) return;
      const body = this.drag.piece.body;
      const spawnY = this.pathTop + 72;
      Body.setPosition(body, { x: body.position.x, y: spawnY });
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
    };

    // Slow, readable descent. Remove the old extra drop force and start gently.
    const originalEndDrag = game.endDrag;
    game.endDrag = function (event) {
      const piece = this.drag && this.drag.piece;
      originalEndDrag.call(this, event);
      if (!piece || !piece.released) return;
      piece.body.force.x = 0;
      piece.body.force.y = 0;
      piece.body.torque = 0;
      Sleeping.set(piece.body, false);
      Body.setVelocity(piece.body, { x: 0, y: 0.38 });
      Body.setAngularVelocity(piece.body, 0);
      piece.magnetTimer = 0;
      piece.locked = false;
    };

    // Lower global gravity and add damping. This keeps the drop deliberate while
    // still allowing obviously unsupported pieces to slide off the platform.
    game.engine.gravity.y = 0.42;
    game.engine.gravity.scale = 0.001;

    const horizontalOverlap = (a, b) =>
      Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);

    const findContact = function (piece) {
      const body = piece.body;
      let best = null;

      const considerSurface = (bounds, owner) => {
        for (const part of body.parts.slice(1)) {
          const overlap = horizontalOverlap(part.bounds, bounds);
          if (overlap < 8) continue;
          const gap = bounds.min.y - part.bounds.max.y;
          if (gap < -8 || gap > 18) continue;
          const score = Math.abs(gap) + Math.max(0, 14 - overlap) * 0.18;
          if (!best || score < best.score) best = { gap, overlap, owner, score };
        }
      };

      const platformSurface = {
        min: { x: this.platform.bounds.min.x, y: this.platform.bounds.min.y },
        max: { x: this.platform.bounds.max.x, y: this.platform.bounds.min.y }
      };
      considerSurface(platformSurface, this.platform);

      for (const lower of this.pieces) {
        if (lower === piece || !lower.released) continue;
        if (!(lower.locked || lower.body.isStatic || lower.connected)) continue;
        for (const part of lower.body.parts.slice(1)) considerSurface(part.bounds, lower.body);
      }
      return best;
    };

    const originalUpdatePhysics = game.updatePhysics;
    game.updatePhysics = function (dt) {
      originalUpdatePhysics.call(this, dt);

      for (const piece of this.pieces) {
        const body = piece.body;
        if (!piece.released || piece === this.drag?.piece) continue;

        // A support disappearing should release a previously magnet-locked piece.
        if (piece.locked && !piece.connected) {
          Body.setStatic(body, false);
          Sleeping.set(body, false);
          piece.locked = false;
          piece.magnetTimer = 0;
        }

        if (piece.locked) {
          Body.setVelocity(body, { x: 0, y: 0 });
          Body.setAngularVelocity(body, 0);
          continue;
        }

        // Cap falling speed to roughly 70–85 px/s on a normal 60 Hz display.
        const vx = Math.max(-0.42, Math.min(0.42, body.velocity.x));
        const vy = Math.max(-1.15, Math.min(1.15, body.velocity.y));
        if (vx !== body.velocity.x || vy !== body.velocity.y) {
          Body.setVelocity(body, { x: vx, y: vy });
        }

        const nearestAngle = Math.round(body.angle / (Math.PI / 2)) * (Math.PI / 2);
        const angleDelta = Math.atan2(
          Math.sin(nearestAngle - body.angle),
          Math.cos(nearestAngle - body.angle)
        );
        const contact = findContact.call(this, piece);

        if (!contact || Math.abs(angleDelta) > 0.26) {
          piece.magnetTimer = Math.max(0, (piece.magnetTimer || 0) - dt * 2);
          continue;
        }

        // Visible magnetic attraction: align to the 30 px cell lattice and pull
        // the lowest occupied cell onto the supporting surface.
        const gridX = this.platform.position.x +
          Math.round((body.position.x - this.platform.position.x) / CELL) * CELL;
        const dx = gridX - body.position.x;
        const snapX = Math.abs(dx) <= 11 ? dx * Math.min(1, dt * 9) : 0;
        const snapY = contact.gap * Math.min(1, dt * 11);
        Body.setPosition(body, {
          x: body.position.x + snapX,
          y: body.position.y + snapY
        });
        Body.setAngle(body, body.angle + angleDelta * Math.min(1, dt * 10));
        Body.setVelocity(body, {
          x: body.velocity.x * 0.28,
          y: Math.min(body.velocity.y, 0.18) * 0.22
        });
        Body.setAngularVelocity(body, body.angularVelocity * 0.18);

        const aligned = Math.abs(contact.gap) < 2.4 &&
          Math.abs(angleDelta) < 0.035 &&
          Math.abs(body.velocity.x) < 0.25 &&
          Math.abs(body.velocity.y) < 0.35 &&
          Math.abs(body.angularVelocity) < 0.025;

        piece.magnetTimer = aligned
          ? (piece.magnetTimer || 0) + dt
          : Math.max(0, (piece.magnetTimer || 0) - dt * 0.7);

        // Once absorbed, freeze the body. New pieces can land on it without
        // continuously shaking the entire tower.
        if (piece.magnetTimer > 0.18 && piece.connected) {
          const finalContact = findContact.call(this, piece);
          if (finalContact) {
            const finalGridX = this.platform.position.x +
              Math.round((body.position.x - this.platform.position.x) / CELL) * CELL;
            Body.setPosition(body, {
              x: Math.abs(finalGridX - body.position.x) <= 11 ? finalGridX : body.position.x,
              y: body.position.y + finalContact.gap
            });
          }
          Body.setAngle(body, nearestAngle);
          Body.setVelocity(body, { x: 0, y: 0 });
          Body.setAngularVelocity(body, 0);
          Body.setStatic(body, true);
          piece.locked = true;
          piece.stable = 1;
          piece.active = true;
          piece.lastActive = true;
          this.burst(body.position.x, body.position.y, '#ffffff', 4, 0.45);
        }
      }
    };

    game.toast('已优化：顶部投放、缓慢下落、接触吸附');
    return true;
  };

  if (!install()) {
    const timer = setInterval(() => {
      if (install()) clearInterval(timer);
    }, 25);
    setTimeout(() => clearInterval(timer), 10000);
  }
})();
