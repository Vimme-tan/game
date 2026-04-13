// Single-player Level 1 (JSON)
// Exposes: window.SinglePlayerLevels.startLevel1(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel1 = async function startLevel1(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, api, refreshMe } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    const mapUrl = new URL(assets.level1Json, window.location.href).toString();
    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local map resources.");
      return;
    }

    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Level 1 map load failed: ${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;

    const mapBase = new URL(mapUrl);

    const parseBool = (p) => {
      if (!p) return undefined;
      const type = String(p.type || "").toLowerCase();
      const v = p.value;
      if (type === "bool") return v === true || v === 1 || String(v).toLowerCase() === "true";
      return v === true || v === 1 || String(v).toLowerCase() === "true";
    };
    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    const resolveTilesetImageUrl = (imageSource, baseUrl) =>
      window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ?? null;

    // TSX 加载/解析统一走共享模块（减少重复）
    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const opLayer = allLayers.find((l) => l && l.type === "objectgroup" && String(l.name || "").toLowerCase() === "op");
    const opObjects = Array.isArray(opLayer?.objects) ? opLayer.objects : [];
    const objHas = (o, key) =>
      Array.isArray(o?.properties) && o.properties.some((p) => String(p.name || "").toLowerCase() === key && parseBool(p) === true);
    const bornObj = opObjects.find((o) => objHas(o, "born")) || null;
    const touchObj = opObjects.find((o) => objHas(o, "touch")) || null;
    const fallareaObj = opObjects.find((o) => objHas(o, "fallarea")) || null;

    // tilesets
    const tilesetInfos = [];
    for (const tsEl of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(tsEl.firstgid || 1);
      const source = tsEl.source;
      if (!source) continue;
      try {
        const tsxText = await fetchTsxText(source, mapBase);
        const parsed = parseTsx(tsxText);
        tilesetInfos.push({ firstgid, source, ...parsed });
      } catch (e) {
        console.error("[level1 tsx load fail]", source, e);
      }
    }
    if (!tilesetInfos.length) {
      alert("Level 1 resource load failed: TSX files cannot be read.");
      return;
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);

    function resolveTileFromGid(gid) {
      const clean = gid & 0x1fffffff;
      if (!clean) return null;
      let chosen = null;
      for (let i = 0; i < tilesetInfos.length; i++) {
        const ts = tilesetInfos[i];
        const next = i + 1 < tilesetInfos.length ? tilesetInfos[i + 1].firstgid : Infinity;
        if (clean >= ts.firstgid && clean < next) {
          chosen = ts;
          break;
        }
      }
      if (!chosen) return null;
      const tileId = clean - chosen.firstgid;
      const tile = chosen.tiles[tileId];
      if (!tile) return null;
      return { ...tile, tileset: chosen, tileId };
    }

    // preload images
    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles)) {
        const id = Number(idStr);
        const t = ts.tiles[id];
        if (!t?.imageSource) continue;
        const url = resolveTilesetImageUrl(t.imageSource, mapBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `tile_${ts.name}_${id}`);
      }
    }

    // collect rects
    const solids = [];
    const winRects = [];
    const deathRects = [];
    const fallTiles = [];

    for (const layer of tileLayers) {
      const data = layer.data;
      const layerName = String(layer.name || "").toLowerCase();
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        const isFall = p.fall === true;
        if (p.solid === true && !isFall) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true) deathRects.push({ cx, cy, w: tileW, h: tileH, imageSource: tile.imageSource });
        if (isFall && layerName === "three") {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const imgKey = url ? imageToKey.get(url) : null;
          fallTiles.push({ cx, cy, w: tileW, h: tileH, imgKey });
        }
      }
    }

    // 人物参数统一从共享模块读取（可按关卡覆盖）
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
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.__PT_makeSpriteBgTransparent?.(this, ["char_front", "char_left", "char_right"]);
        this.finished = false;
        this.dead = false;
        this.fallActivated = false;
        this.fallBodies = [];
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 900;
        this.spawnGraceUntil = -1e9;
        this.touchTriggered = false;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = tuning.gravityY;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        const fallPosKey = (cx, cy) => `${Math.round(cx)}:${Math.round(cy)}`;
        const fallPosSet = new Set(fallTiles.map((t) => fallPosKey(t.cx, t.cy)));

        // render tiles
        for (let layerIdx = 0; layerIdx < tileLayers.length; layerIdx++) {
          const layer = tileLayers[layerIdx];
          const layerName = String(layer.name || "").toLowerCase();
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            // For fall blocks, we do NOT draw static tiles here.
            // They will be spawned as physics-enabled images so they can visibly fall.
            if (layerName === "three" && tile?.props?.fall === true && fallPosSet.has(fallPosKey(cx, cy))) continue;
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
            // no special per-tile visuals needed here
          }
        }

        // solids
        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        // 下落方块组：初始作为“不可移动支撑”，触发后才允许移动并受重力影响
        this.fallGroup = this.physics.add.group();
        for (const b of fallTiles) {
          if (b.imgKey) {
            const img = this.physics.add.image(b.cx, b.cy, b.imgKey);
            img.setDisplaySize(tileW, tileH);
            img.setImmovable(true);
            // 关键：初始禁止移动，避免玩家落地碰撞把方块“挤”下去（看起来像自动触发）
            img.body.moves = false;
            img.body.allowGravity = false;
            img.body.setVelocity(0, 0);
            this.fallGroup.add(img);
            this.fallBodies.push({ ...b, obj: img, kind: "image" });
          } else {
            // Fallback: still provide collision even if texture missing
            const rect = this.add.rectangle(b.cx, b.cy, b.w, b.h, 0x000000, 0);
            this.physics.add.existing(rect);
            if (rect.body) {
              rect.body.setImmovable(true);
              rect.body.moves = false;
              rect.body.allowGravity = false;
              rect.body.setVelocity(0, 0);
            }
            this.fallGroup.add(rect);
            this.fallBodies.push({ ...b, obj: rect, kind: "rect" });
          }
        }

        // spawn
        const bx = (Number(bornObj?.x) || tileW * 2) + (Number(bornObj?.width) || tileW) / 2;
        const byRaw = Number(bornObj?.y) || tileH * 2;
        const by = byRaw - Math.max(6, Math.min(tileH * 0.6, (Number(bornObj?.height) || tileH) * 0.6));
        this.bornX = bx;
        this.bornY = by;

        this.player = this.physics.add.sprite(bx, by, "char_front").setOrigin(0.5, 1);
        this.player.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setOffset(0, 0);
        this.player.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);
        this.player.body.setDragX(tuning.dragX);
        // Avoid triggering sensors immediately on level entry due to spawn overlap.
        this.spawnGraceUntil = this.time.now + 900;

        // 触底（撞到世界边界底部）也判定死亡并重置
        window.PTLevelShared?.installWorldBoundsDeath?.(this, this.player, () => this.handleDeath(), { down: true });

        this.physics.add.collider(this.player, this.solids);
        this.physics.add.collider(this.player, this.fallGroup);

        const makeSensorGroup = () => this.physics.add.staticGroup();
        this.winSensors = makeSensorGroup();
        winRects.forEach((r) => {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        });
        this.deathSensors = makeSensorGroup();
        deathRects.forEach((r) => {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0xff0000, 0);
          this.physics.add.existing(s, true);
          this.deathSensors.add(s);
        });
        this.activateFall = () => {
          if (this.fallActivated) return;
          this.fallActivated = true;
          for (const blk of this.fallBodies) {
            const body = blk?.obj?.body;
            if (!body) continue;
            body.setImmovable(false);
            body.moves = true;
            body.allowGravity = true;
            body.setVelocity(0, 0);
          }
        };
        this.resetFall = () => {
          this.fallActivated = false;
          for (const blk of this.fallBodies) {
            if (blk?.obj?.body) {
              blk.obj.body.enable = true;
              blk.obj.body.setImmovable(true);
              blk.obj.body.moves = false;
              blk.obj.body.allowGravity = false;
              blk.obj.body.setVelocity(0, 0);
            }
            if (typeof blk?.obj?.setPosition === "function") blk.obj.setPosition(blk.cx, blk.cy);
            if (typeof blk?.obj?.setVisible === "function") blk.obj.setVisible(true);
          }
        };
        this.handleDeath = () => {
          if (this.dead || this.finished) return;
          this.dead = true;
          this.player.body.setVelocity(0, 0);
          this.time.delayedCall(650, () => {
            this.dead = false;
            this.lastRespawnAt = this.time.now;
            // Death = restart level: reset all trigger-driven mechanics.
            this.touchTriggered = false;
            if (this.touchSensor?.body) this.touchSensor.body.enable = true;
            this.resetFall();
            this.player.setPosition(this.bornX, this.bornY);
            this.player.body.setVelocity(0, 0);
            this.spawnGraceUntil = this.time.now + 600;
          });
        };

        this.physics.add.overlap(this.player, this.winSensors, async () => {
          if (this.finished || this.dead) return;
          this.finished = true;
          try {
            await api.complete(levelId, 10000);
            await refreshMe();
          } catch {}
          if (typeof ctx.onLevelWin === "function") ctx.onLevelWin(levelId);
        });
        this.physics.add.overlap(this.player, this.deathSensors, () => {
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.handleDeath();
        });
        // 触发区逻辑（推荐顺序）：
        // 1) 如果地图对象层画了 touch=true：直接使用（最精确、最可控）
        // 2) 否则：自动根据“下滑物块（layer=three 且 fall=true）”计算触发带
        //    - 触发带的宽度 = 下滑物块的整体宽度（也就是“陷阱/物块”的宽度）
        //    - 触发带的位置 = 这些物块的正上方（高度固定为 2 格，避免过大导致误触）
        // 3) fallarea 仅作为最后兜底（老地图遗留，往往太大）

        let trigger = null;

        if (touchObj) {
          trigger = {
            x: Number(touchObj.x || 0),
            y: Number(touchObj.y || 0),
            w: Number(touchObj.width || tileW),
            h: Number(touchObj.height || tileH),
          };
        } else if (Array.isArray(fallTiles) && fallTiles.length) {
          // 自动触发带：覆盖所有下滑物块的水平跨度，并放在其上方
          let minCx = Infinity;
          let maxCx = -Infinity;
          let minCy = Infinity;
          for (const t of fallTiles) {
            if (!t) continue;
            if (typeof t.cx === "number") {
              minCx = Math.min(minCx, t.cx);
              maxCx = Math.max(maxCx, t.cx);
            }
            if (typeof t.cy === "number") {
              minCy = Math.min(minCy, t.cy);
            }
          }
          if (Number.isFinite(minCx) && Number.isFinite(maxCx) && Number.isFinite(minCy)) {
            const fallLeft = minCx - tileW / 2;
            const fallRight = maxCx + tileW / 2;
            const w = Math.max(tileW, fallRight - fallLeft);
            const h = tileH * 2;
            // 下滑物块的顶部边缘
            const fallTop = minCy - tileH / 2;
            // 触发带紧贴在物块上方（不覆盖到物块本身）
            const y = fallTop - h;
            trigger = { x: fallLeft, y, w, h };
          }
        } else if (fallareaObj) {
          // 兜底：对 fallarea 做裁剪，只取顶部 2 格
          const rawX = Number(fallareaObj.x || 0);
          const rawY = Number(fallareaObj.y || 0);
          const rawW = Number(fallareaObj.width || tileW);
          const rawH = Number(fallareaObj.height || tileH);
          trigger = { x: rawX, y: rawY, w: rawW, h: Math.min(rawH, tileH * 2) };
        }

        if (trigger) {
          const x = trigger.x;
          const y = trigger.y;
          const w = trigger.w;
          const h = trigger.h;

          this.touchSensor = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x00ffff, 0);
          this.physics.add.existing(this.touchSensor, true);
          this.physics.add.overlap(this.player, this.touchSensor, () => {
            if (this.touchTriggered) return;
            if (this.time.now < this.spawnGraceUntil) return;
            this.touchTriggered = true;
            if (this.touchSensor?.body) this.touchSensor.body.enable = false;
            this.activateFall();
          });
        }

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
        if (this.dead || this.finished) return;
        if (this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH) {
          this.handleDeath();
          return;
        }
        // 掉出地图下边界的下落方块禁用（统一封装在共享模块里）
        window.PTLevelShared?.disableBodiesBelowWorld?.(this.fallBodies, worldH, tileH);

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
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(tuning.jumpV);
      },
    };

    const vp = window.__PT_getGameViewport ? window.__PT_getGameViewport() : {
      width: Math.min(1400, Math.max(900, window.innerWidth - 80)),
      height: Math.min(900, Math.max(650, window.innerHeight - 200)),
    };
    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ctx.ui.phaserMount,
      width: vp.width,
      height: vp.height,
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();

