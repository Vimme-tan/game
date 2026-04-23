// Single-player Level 5 (trigger mechanics restored)
// Exposes:
// window.SinglePlayerLevels.startLevel5(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel5 = async function startLevel5(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.level5Json, window.location.href).toString();
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

    // TSX 加载/解析统一走共享模块（减少重复
    const fetchTsxText = (tsxSource, baseUrl) =>
 window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);
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
      alert("Level 5 resource load failed: TSX tileset parse failed.");
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

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objects = allLayers
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);

    const hasTrueProp = (obj, key) =>
      Array.isArray(obj?.properties) &&
      obj.properties.some((p) => String(p.name || "").toLowerCase() === key && (p.value === true || p.value === 1 || String(p.value || "").toLowerCase() === "true"));

    const bornObj =
      objects.find((o) => hasTrueProp(o, "born")) || null;
    const touchObj = objects.find((o) => hasTrueProp(o, "touch")) || null;
    const touch1Obj = objects.find((o) => hasTrueProp(o, "touch1")) || null;
    const touch2Obj = objects.find((o) => hasTrueProp(o, "touch2")) || null;
    const touch3Obj = objects.find((o) => hasTrueProp(o, "touch3")) || null;
    const touch4Obj = objects.find((o) => hasTrueProp(o, "touch4")) || null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y : tileH * 2;

    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles || {})) {
        const t = ts.tiles[Number(idStr)];
        if (!t?.imageSource) continue;
        const url = resolveTilesetImageUrl(t.imageSource, mapBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `tile_${ts.name}_${idStr}`);
      }
    }

    const solids = [];
    const winRects = [];
    const allDeathSpawns = [];
    const moving = {
      two_rmove_spikes: [],
      four_rmove_spikes: [],
      five_rmove_spikes: [],
      two_rrmove_walls: [],
      four_rrmove_walls: [],
    };
    for (const layer of tileLayers) {
      const layerName = String(layer.name || "").toLowerCase();
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(layer.data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};

        const url = tile.imageSource ? resolveTilesetImageUrl(tile.imageSource, mapBase) : null;
        const key = url ? imageToKey.get(url) : null;
        if (!key) continue;

        const isRmoveSpike = p.rmove === true && p.death === true;
        const isRrmoveWall = p.rrmove === true && p.solid === true;
        const isFake = p.fake === true;
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });

        if (layerName === "two" && isRmoveSpike) moving.two_rmove_spikes.push({ x: col * tileW, y: (row + 1) * tileH, key });
        if (layerName === "four" && isRmoveSpike) moving.four_rmove_spikes.push({ x: col * tileW, y: (row + 1) * tileH, key });
        if (layerName === "five" && isRmoveSpike) moving.five_rmove_spikes.push({ x: col * tileW, y: (row + 1) * tileH, key });

        if (layerName === "two" && isRrmoveWall) moving.two_rrmove_walls.push({ x: col * tileW, y: (row + 1) * tileH, key });
        if (layerName === "four" && isRrmoveWall) moving.four_rrmove_walls.push({ x: col * tileW, y: (row + 1) * tileH, key });

        if (p.solid === true && !isRrmoveWall && !isFake) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true && !isRmoveSpike) allDeathSpawns.push({ x: col * tileW, y: (row + 1) * tileH, key });
      }
    }

    // 人物参数统一走共享模块（方便全关统一调整
    const tuning =
      window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 220, maxVy: 900, dragX: 900 };
    const wallMoveSpeed = 520; // 迅速移动（rrmove+solid 墙体：加快速度）
    const scene = {
      preload: function () {
        this._loadErrors = [];
        this.load.on("loaderror", (file) => {
          this._loadErrors.push(file?.url || file?.src || file?.key || "unknown");
        });
        window.PTLevelShared?.loadCharacterSprites?.(this, assets);
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.PTLevelShared?.makeCharacterSpritesTransparent?.(this);
        this.finished = false;
        this.dead = false;
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 900;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = tuning.gravityY;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        // 单人关卡背景统一：世界内灰底，世界外保持主页面背
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);

        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);
        if (this._loadErrors.length) {
          console.error("[level5 loaderror urls]", this._loadErrors);
          alert(`???? ${this._loadErrors.length} ????????????????`);
        }

        for (const layer of tileLayers) {
          const layerName = String(layer.name || "").toLowerCase();
          // `one` 图层是蓝色铺底，会把关卡区域染成蓝色；这里不绘制它，统一用灰底
          if (layerName === "one") continue;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const isRmoveSpike = p.rmove === true && p.death === true;
            const isRrmoveWall = p.rrmove === true && p.solid === true;
            if (layerName === "two" && (isRmoveSpike || isRrmoveWall)) continue;
            if (layerName === "four" && (isRmoveSpike || isRrmoveWall)) continue;
            if (layerName === "five" && isRmoveSpike) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
            if (layer.visible === false) img.setVisible(false);
          }
        }

        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        window.PTLevelShared?.applyPlayerSizing?.(this.player, tileW, tileH);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);
        this.player.body.setDragX(tuning.dragX);
        this.physics.add.collider(this.player, this.solids);

        this.winSensors = this.physics.add.staticGroup();
        for (const r of winRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        }
        this.physics.add.overlap(this.player, this.winSensors, async () => {
          if (this.finished) return;
          this.finished = true;
          try {
            await api.complete(levelId, 10000);
            await refreshMe();
          } catch {}
          if (typeof onLevelWin === "function") onLevelWin(levelId);
        });

        const respawn = () => {
          if (this.dead || this.finished) return;
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.dead = true;
          this.player.body.setVelocity(0, 0);
          // 需求：死亡 = 重新开始本关（事件全部重置
          window.PTLevelShared?.restartLevel?.(ctx, levelId, window.SinglePlayerLevels?.startLevel5, 450);
        };

        // 只隐藏“最底下、且在地图边缘的那一个刺”（包含动rmove 刺）        // 你描述的是“最下面在地图边缘的那个刺”，所以这里优先挑选最底部并且更靠边的那根
        const allSpikeSpawns = []
          .concat(allDeathSpawns || [])
          .concat(moving.two_rmove_spikes || [])
          .concat(moving.four_rmove_spikes || [])
          .concat(moving.five_rmove_spikes || []);
        let bottomEdgeSpike = null;
        for (const s of allSpikeSpawns) {
          if (!s) continue;
          if (!bottomEdgeSpike) bottomEdgeSpike = s;
          else {
            const y1 = Number(bottomEdgeSpike.y);
            const y2 = Number(s.y);
            const x1 = Number(bottomEdgeSpike.x);
            const x2 = Number(s.x);
            const edge1 = Math.min(x1, worldW - x1);
            const edge2 = Math.min(x2, worldW - x2);
            // 优先更低；同一高度优先更贴边；再同一贴边程度取更靠右（稳定）

            if (y2 > y1 || (y2 === y1 && (edge2 < edge1 || (edge2 === edge1 && x2 > x1)))) bottomEdgeSpike = s;
          }
        }
        const isBottomEdgeSpike = (s) =>
          bottomEdgeSpike && s && s.x === bottomEdgeSpike.x && s.y === bottomEdgeSpike.y && s.key === bottomEdgeSpike.key;

        const spawnSpike = (s) => {
          // 隐藏：地图边缘最低那一根刺

          if (isBottomEdgeSpike(s)) return null;
          const sp = this.add.image(s.x, s.y, s.key).setOrigin(0, 1);
          sp.setDisplaySize(tileW * 2, tileH);
          // 刺需要正常显示（不要整体压到背景后面          sp.setDepth(10);

          this.physics.add.existing(sp);
          if (sp.body) {
            sp.body.setAllowGravity(false);
            sp.body.setImmovable(true);
            // Prevent accidental physics stepping drift before any trigger tween.
            sp.body.moves = false;
          }
          this.physics.add.overlap(this.player, sp, respawn);
          return sp;
        };
        for (const s of allDeathSpawns) spawnSpike(s);

        this.layerTwoRmoveSpikes = moving.two_rmove_spikes.map(spawnSpike).filter(Boolean);
        this.layerFourRmoveSpikes = moving.four_rmove_spikes.map(spawnSpike).filter(Boolean);
        this.layerFiveRmoveSpikes = moving.five_rmove_spikes.map(spawnSpike).filter(Boolean);
        // touch1 / touch4 spikes are hidden initially.

        for (const sp of this.layerFourRmoveSpikes) sp.setAlpha(0);
        for (const sp of this.layerFiveRmoveSpikes) sp.setAlpha(0);

        const spawnWall = (w) => {
          const b = this.add.image(w.x, w.y, w.key).setOrigin(0, 1);
          b.setDisplaySize(tileW, tileH);
          // Keep solid walls above spikes visually.
          b.setDepth(40);
          this.physics.add.existing(b);
          if (b.body) {
            b.body.setAllowGravity(false);
            b.body.setImmovable(true);
            b.body.moves = true;
            b.body.setVelocityX(0);
          }
          b._moveRemaining = 0;
          b._moveDir = 0;
          b._destroyOnDone = false;
          this.physics.add.collider(this.player, b);
          return b;
        };
        this.layerTwoRrWalls = moving.two_rrmove_walls.map(spawnWall);
        this.layerFourRrWalls = moving.four_rrmove_walls.map(spawnWall);

        this.touched = { touch: false, touch1: false, touch2: false, touch3: false, touch4: false };
        const mkSensor = (o) => {
          if (!o) return null;
          const w = Number(o.width || tileW);
          const h = Number(o.height || tileH);
          const s = this.add.rectangle(o.x + w / 2, o.y + h / 2, w, h, 0x0000ff, 0);
          this.physics.add.existing(s, true);
          return s;
        };
        this.touchSensor = mkSensor(touchObj);
        this.touch1Sensor = mkSensor(touch1Obj);
        this.touch2Sensor = mkSensor(touch2Obj);
        this.touch3Sensor = mkSensor(touch3Obj);
        this.touch4Sensor = mkSensor(touch4Obj);

        const tweenMoveBy = (targets, dx, dy, duration, onComplete) => {
          if (!targets || !targets.length) return;
          this.tweens.add({
            targets,
            x: `+=${dx}`,
            y: `+=${dy}`,
            duration,
            ease: "Linear",
            onUpdate: () => {
              for (const t of targets) t.body?.updateFromGameObject?.();
            },
            onComplete,
          });
        };

        this.onTouch = () => {
          if (this.touched.touch) return;
          this.touched.touch = true;
          if (this.touchSensor?.body) this.touchSensor.body.enable = false;
          tweenMoveBy(this.layerTwoRmoveSpikes, tileW * 4, 0, 180);
        };
        this.onTouch1 = () => {
          if (this.touched.touch1) return;
          this.touched.touch1 = true;
          if (this.touch1Sensor?.body) this.touch1Sensor.body.enable = false;
          for (const sp of this.layerFourRmoveSpikes) sp.setAlpha(1);
          tweenMoveBy(this.layerFourRmoveSpikes, 0, -tileH * 1, 180);
        };
        this.startMoveWalls = (walls, distancePx, destroyOnDone) => {
          if (!walls || !walls.length) return;
          const dir = distancePx >= 0 ? 1 : -1;
          const dist = Math.abs(distancePx);
          for (const w of walls) {
            if (!w || !w.body) continue;
            w._moveRemaining = dist;
            w._moveDir = dir;
            w._destroyOnDone = !!destroyOnDone;
            w.body.setVelocityX(dir * wallMoveSpeed);
          }
        };
        this.onTouch2 = () => {
          if (this.touched.touch2) return;
          this.touched.touch2 = true;
          if (this.touch2Sensor?.body) this.touch2Sensor.body.enable = false;
          this.startMoveWalls(this.layerTwoRrWalls, tileW * 24, true);
        };
        this.onTouch3 = () => {
          if (this.touched.touch3) return;
          this.touched.touch3 = true;
          if (this.touch3Sensor?.body) this.touch3Sensor.body.enable = false;
          this.startMoveWalls(this.layerFourRrWalls, tileW * 5, false);
        };
        this.onTouch4 = () => {
          if (this.touched.touch4) return;
          this.touched.touch4 = true;
          if (this.touch4Sensor?.body) this.touch4Sensor.body.enable = false;
          for (const sp of this.layerFiveRmoveSpikes) sp.setAlpha(1);
          tweenMoveBy(this.layerFiveRmoveSpikes, 0, -tileH * 1, 160, () => {
            for (const sp of this.layerFiveRmoveSpikes) {
              this.tweens.add({
                targets: sp,
                x: worldW + sp.displayWidth + 40,
                duration: 1200,
                ease: "Linear",
                onUpdate: () => sp.body?.updateFromGameObject?.(),
                onComplete: () => {
                  if (sp.body) sp.body.enable = false;
                  sp.destroy();
                },
              });
            }
          });
        };

        if (this.touchSensor) this.physics.add.overlap(this.player, this.touchSensor, () => this.onTouch());
        if (this.touch1Sensor) this.physics.add.overlap(this.player, this.touch1Sensor, () => this.onTouch1());
        if (this.touch2Sensor) this.physics.add.overlap(this.player, this.touch2Sensor, () => this.onTouch2());
        if (this.touch3Sensor) this.physics.add.overlap(this.player, this.touch3Sensor, () => this.onTouch3());
        if (this.touch4Sensor) this.physics.add.overlap(this.player, this.touch4Sensor, () => this.onTouch4());

        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
      },
      update: function () {
        if (!this.player?.body || this.dead || this.finished) return;
        if (this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH) {
          window.PTLevelShared?.playFallDeathSfx?.();
          this.player.body.setVelocity(0, 0);
          this.player.setPosition(spawnX, spawnY);
          this.lastRespawnAt = this.time.now;
          return;
        }

        const dt = this.game.loop.delta / 1000;
        const stepMax = wallMoveSpeed * dt;
        const updateWallList = (list) => {
          if (!list || !list.length) return list;
          const keep = [];
          for (const w of list) {
            if (!w || !w.body) continue;
            if (w._moveRemaining > 0) {
              const prevX = w.x;
              const step = Math.min(stepMax, w._moveRemaining);
              w.x += w._moveDir * step;
              w._moveRemaining -= step;
              w.body.updateFromGameObject?.();
              w.body.setVelocityX(w._moveDir * wallMoveSpeed);
              // 关键：墙体移动后立刻做一次碰撞分离，避免“高速穿墙
              this.physics.world.collide(this.player, w);
              // 站在移动墙上时，跟随墙体位移（避免掉下去
              const dx = w.x - prevX;
              if (dx && (this.player.body.blocked.down || this.player.body.touching.down)) {
                const pb = this.player.getBounds();
                const b = w.getBounds ? w.getBounds() : null;
                if (b) {
                  const footY = pb.bottom;
                  const onTop = footY >= b.top - 3 && footY <= b.top + 14 && pb.right > b.left + 2 && pb.left < b.right - 2;
                  if (onTop) this.player.x += dx;
                }
              }
              if (w._moveRemaining <= 0) {
                w.body.setVelocityX(0);
                if (w._destroyOnDone) {
                  w.body.enable = false;
                  w.setVisible(false);
                  w.destroy();
                  continue;
                }
              }
            }
            keep.push(w);
          }
          return keep;
        };
        this.layerTwoRrWalls = updateWallList(this.layerTwoRrWalls);
        this.layerFourRrWalls = updateWallList(this.layerFourRrWalls);

        const mobile = window.__PT_isMobileControl?.() === true;
        const speed = tuning.speed;
        const left = this.p1Keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.p1Keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
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
      parent: ctx.ui.phaserMount,
      width: vp.width,
      height: vp.height,
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();

