// Single-player Level 7 (stable baseline logic)
// Exposes: window.SinglePlayerLevels.startLevel7(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel7 = async function startLevel7(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.level7Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Level 7 map load failed: ${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;
    const mapBase = new URL(mapUrl);

    const lvl7LegacyMap = {
      "1.png": "grey.png",
      "2.png": "earthWall.png",
      "3.png": "earthWall2.png",
      "4.png": "doorRedStroked.png",
      "5.png": "trap.png",
    };

    const resolveTilesetImageUrl = (imageSource, baseUrl) =>
      window.PTLevelShared?.resolveTilesetImageUrlEx?.(imageSource, baseUrl, lvl7LegacyMap) ??
      window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ??
      null;
    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsxTyped?.(tsxText);
    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    const tilesetInfos = [];
    for (const ts of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(ts.firstgid || 1);
      if (!ts.source) continue;
      const tsxText = await fetchTsxText(ts.source, mapBase);
      const parsed = parseTsx(tsxText);
      tilesetInfos.push({ firstgid, ...parsed });
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Level 7 resource load failed: TSX tileset parse failed.");
      return;
    }

    function resolveTileFromGid(gid) {
      const clean = gid & 0x1fffffff;
      if (!clean) return null;
      let chosen = null;
      for (let i = 0; i < tilesetInfos.length; i++) {
        const ts = tilesetInfos[i];
        const nextFirst = i + 1 < tilesetInfos.length ? tilesetInfos[i + 1].firstgid : Infinity;
        if (clean >= ts.firstgid && clean < nextFirst) {
          chosen = ts;
          break;
        }
      }
      if (!chosen) return null;
      const tileId = clean - chosen.firstgid;
      const tile = chosen.tiles[tileId];
      if (!tile) return null;
      return { ...tile, tileId };
    }

    const tileLayers = (Array.isArray(mapData.layers) ? mapData.layers : []).filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objects = (Array.isArray(mapData.layers) ? mapData.layers : [])
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);

    const hasPropName = (props, key) =>
      Array.isArray(props) && props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    const propTrue = (props, key) =>
      Array.isArray(props) &&
      props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase() && (p?.value === true || p?.value === 1 || String(p?.value || "").toLowerCase() === "true"));
    const bornObj = objects.find((o) => hasPropName(o?.properties, "born") || propTrue(o?.properties, "born")) || null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y - Math.max(6, Math.min(tileH * 0.6, (bornObj.height || tileH) * 0.6)) : tileH * 2;

    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles || {})) {
        const t = ts.tiles[Number(idStr)];
        if (!t?.imageSource) continue;
        const url = resolveTilesetImageUrl(t.imageSource, mapBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `lvl7_${ts.name}_${idStr}`);
      }
    }

    const solids = [];
    const deathRects = [];
    const winRects = [];
    for (const layer of tileLayers) {
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(layer.data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        if (p.solid === true && p.fake !== true) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true) deathRects.push({ cx, cy, w: tileW * 2, h: tileH / 2 });
        if (p.win === true) winRects.push({ cx, cy, w: tileW * 2, h: tileH * 2 });
      }
    }

    const tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || {
      speed: 300,
      jumpV: -920,
      gravityY: 900,
      maxVx: 320,
      maxVy: 900,
      dragX: 900,
    };

    const scene = {
      preload: function () {
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        this.finished = false;
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 700;
        this.bornX = spawnX;
        this.bornY = spawnY;

        window.__PT_makeSpriteBgTransparent?.(this, ["char_front", "char_left", "char_right"]);
        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = tuning.gravityY;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        for (const layer of tileLayers) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx] || 0);
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
          }
        }

        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        this.player.setDisplaySize(tileW * 1.2, tileH * 1.8);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setOffset(0, 0);
        this.player.body.setDragX(tuning.dragX);
        this.player.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);
        this.physics.add.collider(this.player, this.solids);

        this.deathSensors = this.physics.add.staticGroup();
        for (const r of deathRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0xff0000, 0);
          this.physics.add.existing(s, true);
          this.deathSensors.add(s);
        }
        this.physics.add.overlap(this.player, this.deathSensors, () => {
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.lastRespawnAt = this.time.now;
          window.PTLevelShared?.restartLevel?.(ctx, levelId, window.SinglePlayerLevels?.startLevel7, 0);
        });

        this.winSensors = this.physics.add.staticGroup();
        for (const r of winRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        }
        this.physics.add.overlap(this.player, this.winSensors, () => {
          if (this.finished) return;
          this.finished = true;
          if (typeof ctx.onLevelWin === "function") ctx.onLevelWin(levelId);
        });

        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
      },
      update: function () {
        if (!this.player?.body || this.finished) return;

        if (this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH) {
          this.player.body.setVelocity(0, 0);
          this.player.setPosition(this.bornX, this.bornY);
          this.lastRespawnAt = this.time.now;
          return;
        }

        const speed = tuning.speed;
        const mobile = window.__PT_isMobileControl?.() === true;
        const left = this.p1Keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.p1Keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
        if (left) this.player.setVelocityX(-speed);
        else if (right) this.player.setVelocityX(speed);
        else this.player.setVelocityX(0);

        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump = Phaser.Input.Keyboard.JustDown(this.p1Keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) {
          this.player.setVelocityY(tuning.jumpV);
        }
      },
    };

    const vp = window.__PT_getGameViewport ? window.__PT_getGameViewport() : {
      width: Math.min(1100, Math.max(720, window.innerWidth * 0.92)),
      height: Math.min(820, Math.max(500, window.innerHeight * 0.72)),
    };
    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "phaserMount",
      width: vp.width,
      height: vp.height,
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();
// Single-player Level 7 (stable baseline logic)
// Exposes: window.SinglePlayerLevels.startLevel7(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel7 = async function startLevel7(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.level7Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Level 7 map load failed: ${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;
    const mapBase = new URL(mapUrl);

    const lvl7LegacyMap = {
      "1.png": "grey.png",
      "2.png": "earthWall.png",
      "3.png": "earthWall2.png",
      "4.png": "doorRedStroked.png",
      "5.png": "trap.png",
    };

    const resolveTilesetImageUrl = (imageSource, baseUrl) =>
      window.PTLevelShared?.resolveTilesetImageUrlEx?.(imageSource, baseUrl, lvl7LegacyMap) ??
      window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ??
      null;
    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsxTyped?.(tsxText);
    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    const tilesetInfos = [];
    for (const ts of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(ts.firstgid || 1);
      if (!ts.source) continue;
      const tsxText = await fetchTsxText(ts.source, mapBase);
      const parsed = parseTsx(tsxText);
      tilesetInfos.push({ firstgid, ...parsed });
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Level 7 resource load failed: TSX tileset parse failed.");
      return;
    }

    function resolveTileFromGid(gid) {
      const clean = gid & 0x1fffffff;
      if (!clean) return null;
      let chosen = null;
      for (let i = 0; i < tilesetInfos.length; i++) {
        const ts = tilesetInfos[i];
        const nextFirst = i + 1 < tilesetInfos.length ? tilesetInfos[i + 1].firstgid : Infinity;
        if (clean >= ts.firstgid && clean < nextFirst) {
          chosen = ts;
          break;
        }
      }
      if (!chosen) return null;
      const tileId = clean - chosen.firstgid;
      const tile = chosen.tiles[tileId];
      if (!tile) return null;
      return { ...tile, tileId };
    }

    const tileLayers = (Array.isArray(mapData.layers) ? mapData.layers : []).filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objects = (Array.isArray(mapData.layers) ? mapData.layers : [])
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);

    const hasPropName = (props, key) =>
      Array.isArray(props) && props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    const propTrue = (props, key) =>
      Array.isArray(props) &&
      props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase() && (p?.value === true || p?.value === 1 || String(p?.value || "").toLowerCase() === "true"));
    const bornObj = objects.find((o) => hasPropName(o?.properties, "born") || propTrue(o?.properties, "born")) || null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y - Math.max(6, Math.min(tileH * 0.6, (bornObj.height || tileH) * 0.6)) : tileH * 2;

    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles || {})) {
        const t = ts.tiles[Number(idStr)];
        if (!t?.imageSource) continue;
        const url = resolveTilesetImageUrl(t.imageSource, mapBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `lvl7_${ts.name}_${idStr}`);
      }
    }

    const solids = [];
    const deathRects = [];
    const winRects = [];
    for (const layer of tileLayers) {
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(layer.data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        if (p.solid === true && p.fake !== true) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true) deathRects.push({ cx, cy, w: tileW * 2, h: tileH / 2 });
        if (p.win === true) winRects.push({ cx, cy, w: tileW * 2, h: tileH * 2 });
      }
    }

    const tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || {
      speed: 300,
      jumpV: -920,
      gravityY: 900,
      maxVx: 320,
      maxVy: 900,
      dragX: 900,
    };

    const scene = {
      preload: function () {
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        this.finished = false;
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 700;
        this.bornX = spawnX;
        this.bornY = spawnY;

        window.__PT_makeSpriteBgTransparent?.(this, ["char_front", "char_left", "char_right"]);
        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = tuning.gravityY;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        for (const layer of tileLayers) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx] || 0);
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
          }
        }

        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        this.player.setDisplaySize(tileW * 1.2, tileH * 1.8);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setOffset(0, 0);
        this.player.body.setDragX(tuning.dragX);
        this.player.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);
        this.physics.add.collider(this.player, this.solids);

        this.deathSensors = this.physics.add.staticGroup();
        for (const r of deathRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0xff0000, 0);
          this.physics.add.existing(s, true);
          this.deathSensors.add(s);
        }
        this.physics.add.overlap(this.player, this.deathSensors, () => {
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.lastRespawnAt = this.time.now;
          window.PTLevelShared?.restartLevel?.(ctx, levelId, window.SinglePlayerLevels?.startLevel7, 0);
        });

        this.winSensors = this.physics.add.staticGroup();
        for (const r of winRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        }
        this.physics.add.overlap(this.player, this.winSensors, () => {
          if (this.finished) return;
          this.finished = true;
          if (typeof ctx.onLevelWin === "function") ctx.onLevelWin(levelId);
        });

        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
      },
      update: function () {
        if (!this.player?.body || this.finished) return;

        if (this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH) {
          this.player.body.setVelocity(0, 0);
          this.player.setPosition(this.bornX, this.bornY);
          this.lastRespawnAt = this.time.now;
          return;
        }

        const speed = tuning.speed;
        const mobile = window.__PT_isMobileControl?.() === true;
        const left = this.p1Keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.p1Keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
        if (left) this.player.setVelocityX(-speed);
        else if (right) this.player.setVelocityX(speed);
        else this.player.setVelocityX(0);

        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump = Phaser.Input.Keyboard.JustDown(this.p1Keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) {
          this.player.setVelocityY(tuning.jumpV);
        }
      },
    };

    const vp = window.__PT_getGameViewport ? window.__PT_getGameViewport() : {
      width: Math.min(1100, Math.max(720, window.innerWidth * 0.92)),
      height: Math.min(820, Math.max(500, window.innerHeight * 0.72)),
    };
    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "phaserMount",
      width: vp.width,
      height: vp.height,
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();
// Single-player Level 7
// Exposes: window.SinglePlayerLevels.startLevel7(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel7 = async function startLevel7(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.level7Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Level 7 map load failed: ${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;
    const mapBase = new URL(mapUrl);

    function propTrue(props, key) {
      if (!props) return false;
      if (Array.isArray(props)) {
        const k = String(key || "").toLowerCase();
        return props.some((p) => {
          const name = String(p?.name || "").toLowerCase();
          if (name !== k) return false;
          return p?.value === true || p?.value === 1 || String(p?.value || "").toLowerCase() === "true";
        });
      }
      return false;
    }

    // level7 的旧贴图映射：1.png -> grey.png（与其它关卡不同）
    const lvl7LegacyMap = {
      "1.png": "grey.png",
      "2.png": "earthWall.png",
      "3.png": "earthWall2.png",
      "4.png": "doorRedStroked.png",
      "5.png": "trap.png",
    };

    const resolveTilesetImageUrl = (imageSource, baseUrl) =>
      window.PTLevelShared?.resolveTilesetImageUrlEx?.(imageSource, baseUrl, lvl7LegacyMap) ??
      window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ??
      null;

    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsxTyped?.(tsxText);

    function gidToLocalId(gid, firstgid) {
      // Strip Tiled flip flags (high bits)
      const FLIP_MASK = 0xe0000000;
      const clean = gid & ~FLIP_MASK;
      return clean - firstgid;
    }

    // Load TSX tilesets referenced by the map (with fallback to local basename).
    const tilesets = [];
    try {
      for (const ts of Array.from(mapData.tilesets || [])) {
        const firstgid = Number(ts.firstgid || 1);
        const source = ts.source;
        if (!source) continue;
        const text = await fetchTsxText(source, mapBase);
        const parsed = parseTsx(text);
        tilesets.push({ firstgid, source, ...parsed });
      }
    } catch (e) {
      alert(`Level 7 resources load failed: TSX 文件读取失败。请确认 level7 目录下 tsx 文件存在并可访问。\n${e?.message || String(e)}`);
      return;
    }
    tilesets.sort((a, b) => a.firstgid - b.firstgid);

    function getTileInfoByGid(gid) {
      if (!gid) return null;
      const FLIP_MASK = 0xe0000000;
      const clean = gid & ~FLIP_MASK;
      let pick = null;
      for (let i = 0; i < tilesets.length; i++) {
        const cur = tilesets[i];
        const next = tilesets[i + 1];
        const start = cur.firstgid;
        const end = next ? next.firstgid - 1 : Number.MAX_SAFE_INTEGER;
        if (clean >= start && clean <= end) {
          pick = cur;
          break;
        }
      }
      if (!pick) return null;
      const localId = gidToLocalId(gid, pick.firstgid);
      const tile = pick.tiles[localId];
      if (!tile) return null;
      return { tileset: pick, tile, localId };
    }

    // Preload all tile images referenced in the map.
    const images = new Map(); // url -> key
    const imageToKey = new Map();
    const layers = Array.from(mapData.layers || []);
    const tileLayers = layers.filter((l) => l.type === "tilelayer");
    const gidsInMap = new Set();
    for (const layer of tileLayers) {
      const data = Array.from(layer.data || []);
      for (const gid of data) {
        const g = Number(gid || 0);
        if (g) gidsInMap.add(g);
      }
    }
    for (const gid of gidsInMap) {
      const info = getTileInfoByGid(gid);
      if (!info?.tile?.imageSource) continue;
      const url = resolveTilesetImageUrl(info.tile.imageSource, mapBase);
      if (!url) continue;
      if (!images.has(url)) {
        const key = `lvl7_${images.size}_${url.split("/").pop()}`;
        images.set(url, key);
        imageToKey.set(url, key);
      }
    }

    const config = {
      type: Phaser.AUTO,
      parent: "phaserMount",
      width: Math.max(720, Math.floor(document.getElementById("phaserMount")?.clientWidth || window.innerWidth - 96)),
      height: Math.max(520, Math.floor(Math.min(window.innerHeight * 0.76, 860))),
      physics: { default: "arcade", arcade: { gravity: { y: 1600 }, debug: false } },
      scene: {
        preload: function preload() {
          this.load.on("loaderror", (file) => {
            try {
              console.warn("Level7 loaderror:", file?.key, file?.src || file?.url);
            } catch {}
          });
          // 角色贴图（与其它关卡一致）
          this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
          this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
          this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
          for (const [url, key] of images.entries()) {
            this.load.image(key, url);
          }
        },
        create: function create() {
          const scene = this;
          const cam = scene.cameras.main;
          state.levelScene = scene;
          window.__PT_makeSpriteBgTransparent?.(scene, ["char_front", "char_left", "char_right"]);
          // 单人关卡背景统一：世界内灰底，世界外保持主页面背景
          window.PTLevelShared?.applyWorldGreyBackdrop?.(scene, worldW, worldH);
          cam.setBounds(0, 0, worldW, worldH);
          scene.physics.world.setBounds(0, 0, worldW, worldH);

          const staticGroup = scene.physics.add.staticGroup();
          const deadlyStatic = scene.physics.add.staticGroup();
          const winSensors = scene.physics.add.staticGroup();

          const dynamicSolids = scene.physics.add.group({ allowGravity: false, immovable: true });
          const dynamicDeadly = scene.physics.add.group({ allowGravity: false, immovable: true });
          const dynamicBombs = scene.physics.add.group({ allowGravity: false, immovable: true });

          const tileToWorldCenter = (tx, ty) => ({ x: tx * tileW + tileW / 2, y: ty * tileH + tileH / 2 });

          const missingStaticKeys = new Set();
          function drawTileSprite(cx, cy, tileInfo, displayW = tileW, displayH = tileH, depth = 10) {
            const url = tileInfo?.tile?.imageSource ? resolveTilesetImageUrl(tileInfo.tile.imageSource, mapBase) : null;
            const key = url ? imageToKey.get(url) : null;
            if (!key) {
              const sig = `${tileInfo?.tileset?.name || "ts"}:${tileInfo?.localId ?? "?"}`;
              if (!missingStaticKeys.has(sig)) {
                missingStaticKeys.add(sig);
                console.warn("Level7 missing image key for tile", sig, url);
              }
              const r = scene.add.rectangle(cx, cy, displayW, displayH, 0xff00ff, 0.15);
              r.setDepth(depth);
              return r;
            }
            const img = scene.add.image(cx, cy, key);
            img.setDisplaySize(displayW, displayH);
            img.setDepth(depth);
            return img;
          }

          function freezeObj(o) {
            if (!o || !o.body) return;
            o.body.allowGravity = false;
            if (o.body.setAllowGravity) o.body.setAllowGravity(false);
            if (o.setAllowGravity) o.setAllowGravity(false);
            if (o.body.setImmovable) o.body.setImmovable(true);
            if (o.setImmovable) o.setImmovable(true);
            o.body.moves = true;
            if (o.setVelocity) o.setVelocity(0, 0);
          }

          function spawnBodyImage(cx, cy, tileInfo, w = tileW, h = tileH, depth = 20, allowCollide = true) {
            const url = tileInfo?.tile?.imageSource ? resolveTilesetImageUrl(tileInfo.tile.imageSource, mapBase) : null;
            const key = url ? imageToKey.get(url) : null;
            if (!key) {
              const r = scene.add.rectangle(cx, cy, w, h, 0x00ffff, 0.18);
              r.setDepth(depth);
              scene.physics.add.existing(r);
              const body = r.body;
              body.allowGravity = false;
              if (body.setAllowGravity) body.setAllowGravity(false);
              body.immovable = true;
              if (body.setImmovable) body.setImmovable(true);
              body.moves = true;
              if (body.setVelocity) body.setVelocity(0, 0);
              if (!allowCollide) body.enable = false;
              return r;
            }
            const o = scene.physics.add.image(cx, cy, key);
            o.setDisplaySize(w, h);
            o.setDepth(depth);
            freezeObj(o);
            if (!allowCollide) o.body.enable = false;
            return o;
          }

          const layerByName = new Map(tileLayers.map((l) => [String(l.name || ""), l]));
          const one = layerByName.get("one");
          const two = layerByName.get("two");
          const three = layerByName.get("three");
          const four = layerByName.get("four");

          // Collect tiles by behavior buckets per layer.
          function collectFromLayer(layerName, layer) {
            const buckets = {
              solidsStatic: [],
              deadlyStatic: [],
              wins: [],
              dynamicRmoveSolids: [],
              dynamicRmoveSolidsOne: [],
              deadlyOneMoveLeftGroup: [],
              deadlyTwoUpGroup: [],
              touchKeys: [],
              bombs: [],
            };
            if (!layer?.data) return buckets;
            const data = Array.from(layer.data);
            for (let idx = 0; idx < data.length; idx++) {
              const gid = Number(data[idx] || 0);
              if (!gid) continue;
              const info = getTileInfoByGid(gid);
              if (!info) continue;
              const props = info.tile?.props || {};
              const tx = idx % mapW;
              const ty = Math.floor(idx / mapW);
              const { x: cx, y: cy } = tileToWorldCenter(tx, ty);
              const entry = { cx, cy, tx, ty, info, props, layerName };

              const isSolid = !!props.solid || propTrue(Object.entries(props).map(([name, value]) => ({ name, value })), "solid");
              const isDeath = !!props.death;
              const isWin = !!props.win;
              const isRmove = !!props.rmove;
              const isTouch = !!props.touch;
              const isBomb = !!props.death2 || !!props.falling || !!props.visible;

              if (isWin) buckets.wins.push(entry);
              if (isTouch) buckets.touchKeys.push(entry);
              if (isBomb) buckets.bombs.push(entry);

              // Death spikes: prefer treat as deadly by property.
              if (isDeath) {
                // Some spikes will be moved by triggers; we decide per layer+intent later.
                buckets.deadlyStatic.push(entry);
              }

              // Moving solid walls (rmove+solid)
              if (isSolid && isRmove) {
                buckets.dynamicRmoveSolids.push(entry);
                if (layerName === "one") buckets.dynamicRmoveSolidsOne.push(entry);
              }

              if (isSolid && !isRmove) buckets.solidsStatic.push(entry);
              if (isDeath && !isRmove) {
                // Still render now; physics decided later.
              }
            }
            return buckets;
          }

          const bOne = collectFromLayer("one", one);
          const bTwo = collectFromLayer("two", two);
          const bThree = collectFromLayer("three", three);
          const bFour = collectFromLayer("four", four);

          // Render map tiles as sprites (visuals) and create physics bodies based on properties.
          // Static solids & static deaths
          function addStaticBlock(entry, group, depth = 30, w = tileW, h = tileH) {
            const s = spawnBodyImage(entry.cx, entry.cy, entry.info, w, h, depth, true);
            group.add(s);
            return s;
          }

          // For spikes, use a thinner body to feel like spikes.
          const spikeW = tileW * 2;
          const spikeH = tileH / 2;
          function addSpike(entry, group, depth = 25) {
            const s = spawnBodyImage(entry.cx, entry.cy, entry.info, spikeW, spikeH, depth, true);
            group.add(s);
            return s;
          }

          // Static solids
          for (const e of [...bOne.solidsStatic, ...bTwo.solidsStatic, ...bThree.solidsStatic, ...bFour.solidsStatic]) {
            addStaticBlock(e, staticGroup, 35, tileW, tileH);
          }

          // Win zones
          for (const e of [...bOne.wins, ...bTwo.wins, ...bThree.wins, ...bFour.wins]) {
            const o = spawnBodyImage(e.cx, e.cy, e.info, tileW, tileH, 22, false);
            winSensors.add(o);
            o.body.enable = true;
            o.setVisible(true);
          }

          // Build special dynamic sets we need to control by triggers.
          const onePushWalls = []; // one layer rmove+solid wall group moved left 9 on push
          const oneDeathMoveLeft = []; // one layer death spikes moved left off-map on move2
          const twoRmoveWallsDown = []; // two layer rmove+solid walls moved down 15 on move3
          const twoDeathUpDown = []; // two layer death spikes group that moves up then retract
          const twoKeyObjects = []; // two layer touch key revealed on move3; collected then retract spikes
          const threeKeyObjects = []; // three layer touch key initial invisible, then pushed out on push
          const threeDeathJumpUp = []; // three layer death spikes moved up 1 on jumpfall
          const bombsTwo = []; // bombs on layer two
          const bombsFour = []; // bombs on layer four

          function isBombTile(entry) {
            return !!entry?.props?.death2 || !!entry?.props?.falling || !!entry?.props?.visible;
          }
          function isTouchKey(entry) {
            return !!entry?.props?.touch;
          }
          function isDeathSpike(entry) {
            return !!entry?.props?.death;
          }
          function isRmoveSolid(entry) {
            return !!entry?.props?.solid && !!entry?.props?.rmove;
          }

          // One layer: decide special groups.
          for (const e of bOne.deadlyStatic) {
            if (isDeathSpike(e)) {
              // In one layer: there are left-facing spike group that should fly left on move2 trigger.
              // We'll treat ALL one-layer death spikes as this group unless they are used as static hazard elsewhere.
              const o = addSpike(e, dynamicDeadly, 24);
              freezeObj(o);
              oneDeathMoveLeft.push(o);
            }
          }
          for (const e of bOne.dynamicRmoveSolidsOne) {
            const o = addStaticBlock(e, dynamicSolids, 42, tileW, tileH);
            freezeObj(o);
            onePushWalls.push(o);
          }

          // Two layer: rmove solids that should drop on move3, death spikes group, touch key hidden, bombs hidden.
          for (const e of bTwo.dynamicRmoveSolids) {
            const o = addStaticBlock(e, dynamicSolids, 44, tileW, tileH);
            freezeObj(o);
            twoRmoveWallsDown.push(o);
          }
          for (const e of bTwo.deadlyStatic) {
            if (isDeathSpike(e)) {
              const o = addSpike(e, dynamicDeadly, 23);
              freezeObj(o);
              twoDeathUpDown.push(o);
            }
          }
          for (const e of bTwo.touchKeys) {
            if (!isTouchKey(e)) continue;
            const o = spawnBodyImage(e.cx, e.cy, e.info, tileW, tileH, 50, false);
            scene.physics.add.existing(o);
            freezeObj(o);
            o.body.enable = false;
            o.setVisible(false);
            twoKeyObjects.push(o);
          }
          for (const e of bTwo.bombs) {
            if (!isBombTile(e)) continue;
            const o = spawnBodyImage(e.cx, e.cy, e.info, tileW, tileH, 28, false);
            scene.physics.add.existing(o);
            freezeObj(o);
            o.body.enable = false;
            o.setVisible(false);
            dynamicBombs.add(o);
            bombsTwo.push(o);
          }

          // Three layer: death spikes group moved on jumpfall, touch key (invisible), plus normal solids already handled.
          for (const e of bThree.deadlyStatic) {
            if (!isDeathSpike(e)) continue;
            const o = addSpike(e, dynamicDeadly, 21);
            freezeObj(o);
            threeDeathJumpUp.push(o);
          }
          for (const e of bThree.touchKeys) {
            if (!isTouchKey(e)) continue;
            const o = spawnBodyImage(e.cx, e.cy, e.info, tileW, tileH, 55, false);
            scene.physics.add.existing(o);
            freezeObj(o);
            // three-layer key starts invisible.
            o.body.enable = false;
            o.setVisible(false);
            threeKeyObjects.push(o);
          }

          // Four layer: bombs hidden but lethal on contact (reveal then die), plus death spikes static hazards.
          for (const e of bFour.deadlyStatic) {
            if (!isDeathSpike(e)) continue;
            // four-layer death spikes are static hazard; keep them deadly static.
            addSpike(e, deadlyStatic, 26);
          }
          for (const e of bFour.bombs) {
            if (!isBombTile(e)) continue;
            const o = spawnBodyImage(e.cx, e.cy, e.info, tileW, tileH, 27, false);
            scene.physics.add.existing(o);
            freezeObj(o);
            // Invisible but still collidable to "touch then visible then die".
            o.body.enable = true;
            o.setVisible(false);
            dynamicBombs.add(o);
            bombsFour.push(o);
          }

          // Also keep any remaining death spikes from layers we didn't special-case as static deadly hazards.
          // Layer three spikes are special (jumpfall), layer two spikes are special (move3/retract), layer one spikes are special (move2 fly).
          // Layer one/two/three already spawned into dynamicDeadly; layer four spawned into deadlyStatic above.

          // Player spawn from object layer "op" born.
          const opLayer = layers.find((l) => l.type === "objectgroup" && String(l.name || "") === "op");
          const opObjects = Array.from(opLayer?.objects || []);
          // 兼容：born 属性可能是 false，但“只要存在 born 字段”就视为出生点
          const hasPropName = (props, key) =>
            Array.isArray(props) && props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
          const bornObj = opObjects.find((o) => propTrue(o?.properties, "born") || hasPropName(o?.properties, "born"));
          const spawnX = (bornObj?.x || 0) + (bornObj?.width || tileW) / 2;
          // 脚踩在出生平台上方，避免“出生点卡进砖块立即死亡/看不见”
          const spawnY = (bornObj?.y || 0) - Math.max(6, Math.min(tileH * 0.6, (bornObj?.height || tileH) * 0.6));

          // 第7关也使用统一人物参数 + 角色贴图（与其它关卡一致）
          const tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };
          const playerObj = scene.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
          playerObj.setDepth(100);
          playerObj.setDisplaySize(tileW * 1.2, tileH * 1.8);
          playerObj.body.setSize(playerObj.displayWidth, playerObj.displayHeight, false);
          playerObj.body.setOffset(0, 0);
          playerObj.body.setDragX(tuning.dragX);
          playerObj.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);
          playerObj.body.setCollideWorldBounds(false);

          // Controls: follow global keybinds (player1 in single).
          const kb = window.__PT_getKeybinds ? window.__PT_getKeybinds() : { p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" } };
          const toKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
          const keys = scene.input.keyboard.addKeys({
            left: toKeyCode(kb?.p1?.left),
            right: toKeyCode(kb?.p1?.right),
            jump: toKeyCode(kb?.p1?.jump),
          });

          // Collisions
          scene.physics.add.collider(playerObj, staticGroup);
          scene.physics.add.collider(playerObj, dynamicSolids);
          scene.physics.add.overlap(playerObj, deadlyStatic, () => dieAndRespawn(), null, scene);
          scene.physics.add.overlap(playerObj, dynamicDeadly, () => dieAndRespawn(), null, scene);

          // Bombs: touching bomb is death; if invisible, reveal first.
          function bombTouch(b) {
            if (b && b.setVisible && !b.visible) b.setVisible(true);
            dieAndRespawn();
          }
          scene.physics.add.overlap(playerObj, dynamicBombs, (p, b) => bombTouch(b), null, scene);

          // Win overlap
          let finished = false;
          scene.physics.add.overlap(playerObj, winSensors, async () => {
            if (finished) return;
            finished = true;
            await onLevelWin(levelId, { message: "第 7 关完成。" });
          });

          // Object layer trigger sensors
          const sensorGroup = scene.physics.add.staticGroup();
          function addSensor(obj, name) {
            const cx = (obj.x || 0) + (obj.width || tileW) / 2;
            const cy = (obj.y || 0) + (obj.height || tileH) / 2;
            const r = scene.add.rectangle(cx, cy, obj.width || tileW, obj.height || tileH, 0x000000, 0);
            scene.physics.add.existing(r, true);
            r.body.enable = true;
            r._sensorName = name;
            sensorGroup.add(r);
            return r;
          }

          const sensors = {
            move1: null,
            move2: null,
            move3: null,
            jumpfall: null,
            bombfall: null,
            push: null,
          };
          for (const o of opObjects) {
            if (propTrue(o?.properties, "move1")) sensors.move1 = addSensor(o, "move1");
            if (propTrue(o?.properties, "move2")) sensors.move2 = addSensor(o, "move2");
            if (propTrue(o?.properties, "move3")) sensors.move3 = addSensor(o, "move3");
            if (propTrue(o?.properties, "jumpfall")) sensors.jumpfall = addSensor(o, "jumpfall");
            if (propTrue(o?.properties, "bombfall")) sensors.bombfall = addSensor(o, "bombfall");
            if (propTrue(o?.properties, "push")) sensors.push = addSensor(o, "push");
          }

          let haveKey = false;
          let triggered = {
            push: false,
            move2: false,
            move3: false,
            jumpfall: false,
            bombfall: false,
          };
          let pendingBombfallBombs = 0;

          function tweenMove(obj, dx, dy, duration, onComplete) {
            if (!obj) return;
            scene.tweens.add({
              targets: obj,
              x: obj.x + dx,
              y: obj.y + dy,
              duration,
              ease: "Linear",
              onUpdate: () => {
                try {
                  if (obj.body && obj.body.updateFromGameObject) obj.body.updateFromGameObject();
                } catch {}
              },
              onComplete,
            });
          }

          function dieAndRespawn() {
            if (finished) return;
            if (scene._dead) return;
            scene._dead = true;
            // 你要求的是：死亡 = 重新开始本关（事件全重置，人物回到出生点）
            window.PTLevelShared?.restartLevel?.(ctx, levelId, window.SinglePlayerLevels?.startLevel7, 0);
          }

          // three-layer key decoy: move right off map on push trigger
          function pushKeyOut() {
            for (const k of threeKeyObjects) {
              k.body.enable = true;
              k.setVisible(true);
              tweenMove(k, worldW + tileW * 4, 0, 700, () => {
                try {
                  k.destroy();
                } catch {}
              });
            }
          }

          // two-layer key: appears on move3 trigger; touching key collects it and retracts spikes down 2 tiles.
          for (const k of twoKeyObjects) {
            scene.physics.add.overlap(playerObj, k, () => {
              if (haveKey) return;
              haveKey = true;
              try {
                k.destroy();
              } catch {}
              // Retract the two-layer death spikes down 2 tiles.
              for (const s of twoDeathUpDown) {
                tweenMove(s, 0, tileH * 2, 180, null);
              }
            });
          }

          // push trigger behavior
          if (sensors.push) {
            scene.physics.add.overlap(playerObj, sensors.push, () => {
              if (triggered.push) return;
              triggered.push = true;
              pushKeyOut();
              // One-layer rmove+solid wall: quickly left 9 tiles, can push the player.
              for (const w of onePushWalls) {
                tweenMove(w, -tileW * 9, 0, 260, null);
              }
            });
          }

          // move2 trigger: one-layer death spikes fly left off-map (medium speed).
          if (sensors.move2) {
            scene.physics.add.overlap(playerObj, sensors.move2, () => {
              if (triggered.move2) return;
              triggered.move2 = true;
              for (const s of oneDeathMoveLeft) {
                tweenMove(s, -(worldW + tileW * 10), 0, 950, () => {
                  try {
                    s.destroy();
                  } catch {}
                });
              }
            });
          }

          // move3 trigger:
          // - two-layer death spikes move up 1 tile (贴地)
          // - two-layer two rmove walls move down 15 tiles
          // - two-layer touch key becomes visible
          if (sensors.move3) {
            scene.physics.add.overlap(playerObj, sensors.move3, () => {
              if (triggered.move3) return;
              triggered.move3 = true;
              for (const s of twoDeathUpDown) {
                tweenMove(s, 0, -tileH * 1, 140, null);
              }
              for (const w of twoRmoveWallsDown) {
                tweenMove(w, 0, tileH * 15, 520, null);
              }
              for (const k of twoKeyObjects) {
                if (!k.active) continue;
                k.setVisible(true);
                k.body.enable = true;
                if (k.body.updateFromGameObject) k.body.updateFromGameObject();
              }
            });
          }

          // jumpfall trigger: three-layer death spikes move up 1 tile (贴地)
          if (sensors.jumpfall) {
            scene.physics.add.overlap(playerObj, sensors.jumpfall, () => {
              if (triggered.jumpfall) return;
              triggered.jumpfall = true;
              for (const s of threeDeathJumpUp) {
                tweenMove(s, 0, -tileH * 1, 140, null);
              }
            });
          }

          // bombfall trigger: only after haveKey
          if (sensors.bombfall) {
            scene.physics.add.overlap(playerObj, sensors.bombfall, () => {
              if (triggered.bombfall) return;
              if (!haveKey) return;
              triggered.bombfall = true;
              // Reveal two-layer bombs, drop down 5 tiles quickly then disappear.
              pendingBombfallBombs = bombsTwo.length;
              for (const b of bombsTwo) {
                b.setVisible(true);
                b.body.enable = true;
                if (b.body.updateFromGameObject) b.body.updateFromGameObject();
                tweenMove(b, 0, tileH * 5, 240, () => {
                  try {
                    b.destroy();
                  } catch {}
                  pendingBombfallBombs = Math.max(0, pendingBombfallBombs - 1);
                  // Map没有放 win 门时：以“拿到钥匙后触发 bombfall 并让炸弹全部落下消失”为通关条件
                  if (!finished && pendingBombfallBombs === 0) {
                    finished = true;
                    onLevelWin(levelId, { message: "第 7 关完成。" });
                  }
                });
              }
            });
          }

          // move1 exists in map but no spec; keep as no-op sensor to avoid confusion.

          // Camera follow player
          cam.startFollow(playerObj, true, 0.12, 0.12);
          cam.setDeadzone(160, 120);

          // Expose update loop for movement + boundary death.
          scene._ptUpdate = function _ptUpdate() {
            if (finished) return;
            const leftHeld = keys.left?.isDown || (window.__PT_isMobileControl && window.__PT_isMobileControl() && window.__PT_touchDown && window.__PT_touchDown("left"));
            const rightHeld = keys.right?.isDown || (window.__PT_isMobileControl && window.__PT_isMobileControl() && window.__PT_touchDown && window.__PT_touchDown("right"));
            const jumpPressed = (keys.jump?.isDown && Phaser.Input.Keyboard.JustDown(keys.jump)) || (window.__PT_consumeTouchJump && window.__PT_consumeTouchJump());

            const body = playerObj.body;
            const speed = 300;
            if (leftHeld && !rightHeld) body.setVelocityX(-speed);
            else if (rightHeld && !leftHeld) body.setVelocityX(speed);
            else body.setVelocityX(0);

            // Jump
            if (jumpPressed && body.blocked.down) {
              body.setVelocityY(-740);
            }

            // Viewport boundary death (touching/going out of camera view counts).
            const wv = cam.worldView;
            const pad = 2;
            const px = playerObj.x;
            const py = playerObj.y;
            if (px < wv.x + pad || px > wv.x + wv.width - pad || py < wv.y + pad || py > wv.y + wv.height - pad) {
              dieAndRespawn();
            }
          };
        },
        update: function update() {
          if (typeof this._ptUpdate === "function") this._ptUpdate();
        },
      },
    };

    state.phaser = new Phaser.Game(config);
  };
})();

