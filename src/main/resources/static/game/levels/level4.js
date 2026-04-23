// Single-player Level 4
// Exposes: window.SinglePlayerLevels.startLevel4(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel4 = async function startLevel4(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, ui } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.level4Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`??????????${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;
    const mapBase = new URL(mapUrl);

    const resolveTilesetImageUrl = (imageSource, baseUrl) =>
      window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ?? null;

    // TSX 加载/解析统一走共享模块，避免每关重复实现
    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);
    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    // tilesets
    const tilesetInfos = [];
    for (const ts of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(ts.firstgid || 1);
      const source = ts.source;
      if (!source) continue;
      const tsxText = await fetchTsxText(source, mapBase);
      const parsed = parseTsx(tsxText);
      tilesetInfos.push({ firstgid, source, ...parsed });
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Level 4 resource load failed: TSX tileset parse failed.");
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
      const tile = chosen.tiles ? chosen.tiles[tileId] : null;
      if (!tile) return null;
      return { ...tile, tileset: chosen, tileId };
    }

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objects = allLayers
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);

    const hasTrueProp = (obj, key) =>
      Array.isArray(obj?.properties) &&
      obj.properties.some((p) => String(p.name || "").toLowerCase() === key && (p.value === true || p.value === 1 || String(p.value || "").toLowerCase() === "true"));
    const bornObj = objects.find((o) => hasTrueProp(o, "born")) || null;
    const touchObj = objects.find((o) => hasTrueProp(o, "touch")) || null;
    const touch2Obj = objects.find((o) => hasTrueProp(o, "touch2")) || null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y : tileH * 2;

    // image preload map
    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles || {})) {
        const id = Number(idStr);
        const t = ts.tiles[id];
        if (!t?.imageSource) continue;
        const url = resolveTilesetImageUrl(t.imageSource, mapBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `tile_${ts.name}_${id}`);
      }
    }

    const solids = [];
    const winRects = [];
    const movingBlocks = []; // lmove/rmove
    const layerDeath = { 4: [], 5: [], 6: [] }; // layerId -> spike sprites info built later

    const isTrue = (v) => v === true || v === 1 || String(v || "").toLowerCase() === "true";

    // gather tiles
    for (const layer of tileLayers) {
      const layerId = Number(layer.id || 0);
      const data = layer.data;
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        const isL = isTrue(p.lmove);
        const isR = isTrue(p.rmove);
        // Compatibility: some maps use `mov`/`move` to mean "move right".
        const isMovR = isTrue(p.mov) || isTrue(p.move);
        if (isL || isR || isMovR) {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          movingBlocks.push({ x: col * tileW, y: (row + 1) * tileH, w: tileW, h: tileH, key, mode: isL ? "lmove" : "rmove" });
          continue;
        }
        if (p.solid === true) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true && (layerId === 4 || layerId === 5 || layerId === 6)) {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          layerDeath[layerId].push({ x: col * tileW, y: (row + 1) * tileH, w: tileW, h: tileH, key });
        }
      }
    }

    // 人物参数统一走共享模块（方便全关统一调整）
    const tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || {
      speed: 300,
      jumpV: -920,
      gravityY: 900,
      maxVx: 220,
      maxVy: 900,
      dragX: 900,
    };

    const scene = {
      preload: function () {
        window.PTLevelShared?.loadCharacterSprites?.(this, assets);
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.PTLevelShared?.makeCharacterSpritesTransparent?.(this);
        this.finished = false;
        this.touchTriggered = false;
        this.touch2Triggered = false;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = tuning.gravityY;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        // 单人关卡背景统一：世界内灰底，世界外保持主页面背景
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // render non-moving tiles (skip lmove/rmove)
        for (const layer of tileLayers) {
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            if (isTrue(p.lmove) || isTrue(p.rmove) || isTrue(p.mov) || isTrue(p.move)) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = p.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
          }
        }

        // solids
        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        // moving blocks (periodic)
        this.movers = [];
        for (const b of movingBlocks) {
          const s = b.key ? this.add.image(b.x, b.y, b.key).setOrigin(0, 1) : this.add.rectangle(b.x + tileW / 2, b.y - tileH / 2, tileW, tileH, 0xffffff, 0.08);
          if (s.setDisplaySize) s.setDisplaySize(tileW, tileH);
          this.physics.add.existing(s);
          s.body.allowGravity = false;
          s.body.immovable = true;
          s._mode = b.mode;
          if (b.mode === "lmove") {
            s._minX = s.x - tileW * 7;
            s._maxX = s.x + tileW * 7;
            s._dir = -1;
          } else {
            // Spec: rmove -> right 5 then left 10 (cycle between +5 and -5).
            s._minX = s.x - tileW * 5;
            s._maxX = s.x + tileW * 5;
            s._dir = 1;
          }
          // Keep a steady speed and let distance spec define travel range.
          s._speed = tileW * 4;
          this.movers.push(s);
        }

        // player
        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        window.PTLevelShared?.applyPlayerSizing?.(this.player, tileW, tileH);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);
        this.player.body.setDragX(tuning.dragX);
        this.physics.add.collider(this.player, this.solids);
        for (const m of this.movers) this.physics.add.collider(this.player, m);
        this.respawnPlayer = () => {
          // 需求：死亡 = 重新开始本关（事件全部重置）
          window.PTLevelShared?.restartLevel?.(ctx, levelId, window.SinglePlayerLevels?.startLevel4, 250);
        };

        // death spikes by layer
        this.layer3Spikes = [];
        this.layer4Spikes = [];
        this.layer5Spikes = [];
        const createSpikes = (arr, target, hiddenInitially) => {
          for (const d of arr) {
            const sp = this.add.image(d.x, d.y, d.key).setOrigin(0, 1);
            // All death spikes: height is half of previous.
            sp.setDisplaySize(tileW * 2, tileH);
            this.physics.add.existing(sp);
            sp.body.allowGravity = false;
            sp.body.immovable = true;
            if (hiddenInitially) sp.setAlpha(0);
            target.push(sp);
          }
        };
        createSpikes(layerDeath[4], this.layer3Spikes, true);
        createSpikes(layerDeath[5], this.layer4Spikes, true);
        createSpikes(layerDeath[6], this.layer5Spikes, true);

        // death overlap all spikes
        this.allSpikes = [...this.layer3Spikes, ...this.layer4Spikes, ...this.layer5Spikes];
        for (const sp of this.allSpikes) {
          this.physics.add.overlap(this.player, sp, () => {
            this.respawnPlayer();
          });
        }

        // win sensors
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

        // touch/touch2 sensors
        if (touchObj) {
          this.touchSensor = this.add.rectangle(touchObj.x + touchObj.width / 2, touchObj.y + touchObj.height / 2, touchObj.width, touchObj.height, 0x0000ff, 0);
          this.physics.add.existing(this.touchSensor, true);
          this.physics.add.overlap(this.player, this.touchSensor, () => this.onTouch());
        }
        if (touch2Obj) {
          this.touch2Sensor = this.add.rectangle(touch2Obj.x + touch2Obj.width / 2, touch2Obj.y + touch2Obj.height / 2, touch2Obj.width, touch2Obj.height, 0x0000ff, 0);
          this.physics.add.existing(this.touch2Sensor, true);
          this.physics.add.overlap(this.player, this.touch2Sensor, () => this.onTouch2());
        }

        this.onTouch = () => {
          if (this.touchTriggered) return;
          this.touchTriggered = true;
          // layer3 death: move left until out of map
          for (const sp of this.layer3Spikes) {
            sp.setAlpha(1);
            this.tweens.add({ targets: sp, x: -sp.displayWidth - 20, duration: 2200, ease: "Linear", onUpdate: () => sp.body.updateFromGameObject() });
          }
          // layer4 death: move up 1 tile
          for (const sp of this.layer4Spikes) {
            sp.setAlpha(1);
            this.tweens.add({ targets: sp, y: sp.y - tileH, duration: 350, ease: "Sine.easeOut", onUpdate: () => sp.body.updateFromGameObject() });
          }
        };

        this.onTouch2 = () => {
          if (this.touch2Triggered) return;
          this.touch2Triggered = true;
          // touch2 can trigger independently.
          // Extra step: move layer5 spikes up 1 tile, then shoot left
          // so their launch height matches touch event's spike lane.
          for (const sp of this.layer5Spikes) {
            sp.setAlpha(1);
            this.tweens.add({
              targets: sp,
              y: sp.y - tileH,
              duration: 300,
              ease: "Sine.easeOut",
              onUpdate: () => sp.body.updateFromGameObject(),
              onComplete: () => {
                this.tweens.add({
                  targets: sp,
                  x: -sp.displayWidth - 20,
                  duration: 2200,
                  ease: "Linear",
                  onUpdate: () => sp.body.updateFromGameObject(),
                });
              },
            });
          }
        };

        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
      },
      update: function () {
        if (!this.player?.body) return;
        if (this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH) {
          window.PTLevelShared?.playFallDeathSfx?.();
          this.respawnPlayer();
          return;
        }

        // mover periodic motion
        for (const m of this.movers) {
          const dt = this.game.loop.delta / 1000;
          m.x += m._dir * m._speed * dt;
          if (m.x <= m._minX) {
            m.x = m._minX;
            m._dir = 1;
          } else if (m.x >= m._maxX) {
            m.x = m._maxX;
            m._dir = -1;
          }
          m.body.updateFromGameObject();
        }

        const mobile = window.__PT_isMobileControl?.() === true;
        const left = this.p1Keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.p1Keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
        const speed = tuning.speed;
        if (left) this.player.setVelocityX(-speed);
        else if (right) this.player.setVelocityX(speed);
        else this.player.setVelocityX(0);
        if (left) window.PTLevelShared?.setCharacterPose?.(this.player, "left", this.time?.now);
        else if (right) window.PTLevelShared?.setCharacterPose?.(this.player, "right", this.time?.now);
        else window.PTLevelShared?.setCharacterPose?.(this.player, "front", this.time?.now);

        const wantJump = Phaser.Input.Keyboard.JustDown(this.p1Keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(tuning.jumpV);
      },
    };

    const vp = window.__PT_getGameViewport ? window.__PT_getGameViewport() : {
      width: Math.min(1400, Math.max(900, window.innerWidth - 80)),
      height: Math.min(900, Math.max(650, window.innerHeight - 200)),
    };
    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ui.phaserMount,
      width: vp.width,
      height: vp.height,
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();

