// Double-player Race Level 5 (JSON)
// Exposes: window.DoublePlayerLevels.startRaceLevel5(ctx, levelId)
(function () {
  window.DoublePlayerLevels = window.DoublePlayerLevels || {};

  window.DoublePlayerLevels.startRaceLevel5 = async function startRaceLevel5(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = window.PTLevelShared?.resolveGameUrl?.(assets.raceLevel5Json) || new URL(assets.raceLevel5Json, window.location.href).toString();
    let mapData;
    try {
      mapData = await (window.PTLevelShared?.fetchJsonWithFallback?.(assets.raceLevel5Json) ?? (await (await fetch(mapUrl, { credentials: "same-origin" })).json()));
    } catch (e) {
      alert(`Race level 5 map load failed: ${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;
    const mapBase = new URL(mapUrl);

    const resolveTilesetImageUrl = (imageSource, baseUrl) => window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ?? null;
    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);
    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    const isTrue = (v) => v === true || v === 1 || String(v || "").toLowerCase() === "true";

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
      alert("Race level 5 resource load failed: TSX tileset parse failed.");
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

    const hasPropName = (props, key) =>
      Array.isArray(props) && props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    const propTrue = (props, key) =>
      Array.isArray(props) &&
      props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase() && (p.value === true || p.value === 1 || String(p.value || "").toLowerCase() === "true"));
    const findObj = (key) => objects.find((o) => propTrue(o?.properties, key) || hasPropName(o?.properties, key) || String(o?.name || "").toLowerCase() === String(key).toLowerCase()) || null;

    const born1Obj = findObj("born1");
    const born2Obj = findObj("born2");
    const t1 = findObj("touch1");
    const t2 = findObj("touch2");
    const t3 = findObj("touch3");
    const t4 = findObj("touch4");
    const t5 = findObj("touch5");
    const t6 = findObj("touch6");
    const t7 = findObj("touch7");
    const t8 = findObj("touch8");

    const toSpawn = (o, fallback) => {
      if (!o) return fallback;
      const w = Number(o.width || tileW);
      const h = Number(o.height || tileH);
      const footOffset = Math.max(6, Math.min(tileH * 0.6, h * 0.6));
      return {
        x: o.x + w / 2,
        // born 区域较高时，角色应落在出生框底部附近，而不是贴着出生框顶部生成
        y: o.y + h - footOffset,
      };
    };

    // preload images
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

    const layerByName = (n) => tileLayers.find((l) => String(l.name || "").toLowerCase() === String(n || "").toLowerCase()) || null;
    const layerOne = layerByName("one");
    const layerTwo = layerByName("two");
    const layerThree = layerByName("three");
    const layerFour = layerByName("four");
    const layerFive = layerByName("five");

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

        this._tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };
        this.finished = false;
        this.triggered = new Set();

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = this._tuning.gravityY;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        this.solids = this.physics.add.staticGroup();
        this.deathSensors = this.physics.add.staticGroup();
        this.winSensors = this.physics.add.staticGroup();

        // dynamic platforms/objects (physics)
        this.oscL = this.physics.add.group(); // two: solid+lmove periodic
        this.oscR = this.physics.add.group(); // two: solid+rmove periodic

        this.spikes3L = this.physics.add.group(); // three: death+lmove (touch1)
        this.spikes4L = this.physics.add.group(); // four: death+lmove (touch2)
        this.spikes3LL = this.physics.add.group(); // three: death+llmove (touch3)
        this.spikes4LL = this.physics.add.group(); // four: death+llmove (touch4)
        this.spikes2R = this.physics.add.group(); // two: death+rmove (touch5)
        this.spikes5R = this.physics.add.group(); // five: death+rmove (touch6)

        this.dieDoors2 = this.physics.add.group(); // two: die doors (touch7)
        this.dieDoors5 = this.physics.add.group(); // five: die doors (touch8)
        this.winDoors3 = this.physics.add.group(); // three: win doors (touch7)
        this.winDoors4 = this.physics.add.group(); // four: win doors (touch8)

        const drawTile = (col, row, tile, w = tileW, h = tileH, depth = 5) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (!key) return null;
          const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
          img.setDepth(depth);
          img.setDisplaySize(w, h);
          return img;
        };

        const spawnBodyImage = (cx, cy, tile, w, h, depth = 20, solid = true) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          const o = key ? this.physics.add.image(cx, cy, key) : this.physics.add.image(cx, cy, "char_front"); // fallback
          if (!key) o.setAlpha(0);
          o.setDisplaySize(w, h);
          o.setDepth(depth);
          if (o.body) {
            o.body.allowGravity = false;
            if (o.body.setAllowGravity) o.body.setAllowGravity(false);
            o.body.immovable = true;
            if (o.body.setImmovable) o.body.setImmovable(true);
            o.body.moves = false;
            if (!solid) o.body.enable = false;
            // 显式同步命中框 size，避免只 setDisplaySize 导致 hitbox 不一致
            if (o.body.setSize) o.body.setSize(w, h, true);
            if (o.body.updateFromGameObject) o.body.updateFromGameObject();
          }
          if (o.setVelocity) o.setVelocity(0, 0);
          return o;
        };

        const addStaticRect = (group, x, y, w = tileW, h = tileH) => {
          const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
          this.physics.add.existing(r, true);
          group.add(r);
          return r;
        };

        const attachSensorToObj = (o, enabled = true) => {
          const s = window.PTLevelShared?.attachRectSensorToObject?.(this, o, { color: 0xff0000, enabled });
          if (s) return s;

          // fallback（shared 未加载时）
          const b = o.getBounds();
          const r = this.add.rectangle(b.centerX, b.centerY, b.width, b.height, 0xff0000, 0);
          this.physics.add.existing(r, true);
          if (r.body) {
            r.body.enable = !!enabled;
            if (r.body.updateFromGameObject) r.body.updateFromGameObject();
          }
          o._sensor = r;
          return r;
        };
        const syncSensor = (o) => {
          window.PTLevelShared?.syncRectSensorToObject?.(o);
        };

        const makeSensor = (obj) => {
          if (!obj) return null;
          const x = Number(obj.x || 0);
          const y = Number(obj.y || 0);
          const w = Number(obj.width || tileW);
          const h = Number(obj.height || tileH);
          const s = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x00ffff, 0);
          this.physics.add.existing(s, true);
          return s;
        };
        const oneShot = (key, fn) => {
          if (this.triggered.has(key)) return;
          this.triggered.add(key);
          fn();
        };

        const spikeW = tileW * 4;
        const spikeH = tileH / 2;

        // Render layers and build physics
        const renderLayer = (layer, depthBase) => {
          if (!layer) return;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            const isSolid = isTrue(p.solid);
            const isWin = isTrue(p.win);
            const isDie = isTrue(p.die);
            const isDeath = isTrue(p.death);
            const isLmove = isTrue(p.lmove);
            const isRmove = isTrue(p.rmove);
            const isLlmove = isTrue(p.llmove);

            const lname = String(layer.name || "").toLowerCase();

            // dynamic walls/spikes/doors are spawned as objects; skip drawing base
            const dynWall = lname === "two" && isSolid && (isLmove || isRmove);
            const dynSpike = isDeath && (isLmove || isRmove || isLlmove);
            const dynDoor = isWin || isDie;
            if (dynWall || dynSpike || dynDoor) continue;

            drawTile(col, row, tile, tileW, tileH, depthBase);
            if (isSolid) addStaticRect(this.solids, cx, cy, tileW, tileH);
          }
        };

        renderLayer(layerOne, 5);
        renderLayer(layerTwo, 12);
        renderLayer(layerThree, 16);
        renderLayer(layerFour, 18);
        renderLayer(layerFive, 20);

        // layer two: periodic moving walls + rmove death spikes + die doors
        if (layerTwo) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layerTwo.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            if (isTrue(p.solid) && isTrue(p.lmove)) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
              this.oscL.add(o);
              continue;
            }
            if (isTrue(p.solid) && isTrue(p.rmove)) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
              this.oscR.add(o);
              continue;
            }
            if (isTrue(p.death) && isTrue(p.rmove)) {
              const o = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 28, false);
              o.body.enable = false;
              this.spikes2R.add(o);
              const s = attachSensorToObj(o);
              this.deathSensors.add(s);
              continue;
            }
            if (isTrue(p.die)) {
              const o = spawnBodyImage(cx, cy, tile, tileW * 2, tileH * 2, 30, false);
              o.body.enable = false;
              this.dieDoors2.add(o);
              const s = attachSensorToObj(o);
              this.deathSensors.add(s);
              continue;
            }
            if (isTrue(p.win)) {
              // win in layer two is also valid (just in case)
              const o = spawnBodyImage(cx, cy, tile, tileW * 2, tileH * 2, 30, false);
              o.body.enable = false;
              this.winDoors3.add(o);
              const s = attachSensorToObj(o);
              this.winSensors.add(s);
              continue;
            }
          }
        }

        // layer three: lmove / llmove death spikes + win doors
        const gatherLayerSpikesDoors = (layer, lname) => {
          if (!layer) return;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            if (isTrue(p.death) && isTrue(p.lmove)) {
              const o = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 28, false);
              o.body.enable = false;
              (lname === "three" ? this.spikes3L : this.spikes4L).add(o);
              const s = attachSensorToObj(o);
              this.deathSensors.add(s);
              continue;
            }
            if (isTrue(p.death) && isTrue(p.llmove)) {
              const o = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 28, false);
              o.body.enable = false;
              (lname === "three" ? this.spikes3LL : this.spikes4LL).add(o);
              const s = attachSensorToObj(o);
              this.deathSensors.add(s);
              continue;
            }
            if (isTrue(p.win)) {
              const o = spawnBodyImage(cx, cy, tile, tileW * 2, tileH * 2, 30, false);
              o.body.enable = false;
              (lname === "three" ? this.winDoors3 : this.winDoors4).add(o);
              const s = attachSensorToObj(o);
              this.winSensors.add(s);
              continue;
            }
          }
        };
        gatherLayerSpikesDoors(layerThree, "three");
        gatherLayerSpikesDoors(layerFour, "four");

        // layer five: rmove death spikes + die doors
        if (layerFive) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layerFive.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            if (isTrue(p.death) && isTrue(p.rmove)) {
              const o = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 28, false);
              o.body.enable = false;
              this.spikes5R.add(o);
              const s = attachSensorToObj(o);
              this.deathSensors.add(s);
              continue;
            }
            if (isTrue(p.die)) {
              const o = spawnBodyImage(cx, cy, tile, tileW * 2, tileH * 2, 30, false);
              o.body.enable = false;
              this.dieDoors5.add(o);
              const s = attachSensorToObj(o);
              this.deathSensors.add(s);
              continue;
            }
          }
        }

        // periodic walls motion (3 tiles each way)
        const mediumMsPerTile = 150;
        const dur = 3 * mediumMsPerTile;
        for (const o of this.oscL.getChildren()) {
          this.tweens.add({
            targets: o,
            x: o.x - tileW * 3,
            duration: dur,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            onUpdate: () => o.body.updateFromGameObject(),
          });
        }
        for (const o of this.oscR.getChildren()) {
          this.tweens.add({
            targets: o,
            x: o.x + tileW * 3,
            duration: dur,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            onUpdate: () => o.body.updateFromGameObject(),
          });
        }

        // players
        this.spawn1 = toSpawn(born1Obj, { x: tileW * 2, y: tileH * 2 });
        this.spawn2 = toSpawn(born2Obj, { x: tileW * 4, y: tileH * 2 });
        const mkPlayer = (x, y, tint) => {
          const p = this.physics.add.sprite(x, y, "char_front").setOrigin(0.5, 1);
          p.setDepth(1000);
          p.setTint(tint);
          p.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
          p.body.setCollideWorldBounds(true);
          p.body.setSize(p.displayWidth, p.displayHeight, false);
          p.body.setDragX(this._tuning.dragX);
          p.body.setMaxVelocity(this._tuning.maxVx, this._tuning.maxVy);
          return p;
        };
        this.p1 = mkPlayer(this.spawn1.x, this.spawn1.y, 0x93c5fd);
        this.p2 = mkPlayer(this.spawn2.x, this.spawn2.y, 0xfca5a5);

        // collisions
        const addDynCollider = (p, grp) => this.physics.add.collider(p, grp, (_a, b) => b?.body?.updateFromGameObject?.());
        this.physics.add.collider(this.p1, this.solids);
        this.physics.add.collider(this.p2, this.solids);
        addDynCollider(this.p1, this.oscL);
        addDynCollider(this.p2, this.oscL);
        addDynCollider(this.p1, this.oscR);
        addDynCollider(this.p2, this.oscR);

        // death / win
        this.respawnPlayer = (p) => {
          if (!p?.body) return;
          const isP1 = p === this.p1;
          const sp = isP1 ? this.spawn1 : this.spawn2;
          p.setPosition(sp.x, sp.y);
          p.body.setVelocity(0, 0);
        };
        this.physics.add.overlap(this.p1, this.deathSensors, () => this.respawnPlayer(this.p1));
        this.physics.add.overlap(this.p2, this.deathSensors, () => this.respawnPlayer(this.p2));

        const winNow = () => {
          if (this.finished) return;
          this.finished = true;
          if (typeof onLevelWin === "function") onLevelWin(levelId);
        };
        this.physics.add.overlap(this.p1, this.winSensors, winNow);
        this.physics.add.overlap(this.p2, this.winSensors, winNow);

        // triggers
        const s1 = makeSensor(t1);
        const s2 = makeSensor(t2);
        const s3 = makeSensor(t3);
        const s4 = makeSensor(t4);
        const s5 = makeSensor(t5);
        const s6 = makeSensor(t6);
        const s7 = makeSensor(t7);
        const s8 = makeSensor(t8);

        const up1LeftNDisappear = (objs, key, leftTiles) => {
          oneShot(key, () => {
            for (const o of objs) {
              if (!o) continue;
              this.tweens.add({
                targets: o,
                y: o.y - tileH * 1,
                duration: 180,
                ease: "Sine.easeOut",
                onUpdate: () => syncSensor(o),
                onComplete: () => {
                  this.tweens.add({
                    targets: o,
                    x: o.x - tileW * leftTiles,
                    duration: 520,
                    ease: "Sine.easeInOut",
                    onUpdate: () => syncSensor(o),
                    onComplete: () => {
                      o._sensor?.destroy?.();
                      o.destroy?.();
                    },
                  });
                },
              });
            }
          });
        };
        const up1LeftNStop = (objs, key, leftTiles) => {
          oneShot(key, () => {
            for (const o of objs) {
              if (!o) continue;
              this.tweens.add({
                targets: o,
                y: o.y - tileH * 1,
                duration: 180,
                ease: "Sine.easeOut",
                onUpdate: () => syncSensor(o),
                onComplete: () => {
                  this.tweens.add({
                    targets: o,
                    x: o.x - tileW * leftTiles,
                    duration: 360,
                    ease: "Sine.easeInOut",
                    onUpdate: () => syncSensor(o),
                  });
                },
              });
            }
          });
        };
        const rightNStop = (objs, key, rightTiles) => {
          oneShot(key, () => {
            for (const o of objs) {
              if (!o) continue;
              this.tweens.add({
                targets: o,
                x: o.x + tileW * rightTiles,
                duration: 520,
                ease: "Sine.easeInOut",
                onUpdate: () => syncSensor(o),
              });
            }
          });
        };

        if (s1) {
          const fn = () => up1LeftNDisappear(this.spikes3L.getChildren(), "touch1", 8);
          this.physics.add.overlap(this.p1, s1, fn);
          this.physics.add.overlap(this.p2, s1, fn);
        }
        if (s2) {
          const fn = () => up1LeftNDisappear(this.spikes4L.getChildren(), "touch2", 8);
          this.physics.add.overlap(this.p1, s2, fn);
          this.physics.add.overlap(this.p2, s2, fn);
        }
        if (s3) {
          const fn = () => up1LeftNStop(this.spikes3LL.getChildren(), "touch3", 4);
          this.physics.add.overlap(this.p1, s3, fn);
          this.physics.add.overlap(this.p2, s3, fn);
        }
        if (s4) {
          const fn = () => up1LeftNStop(this.spikes4LL.getChildren(), "touch4", 4);
          this.physics.add.overlap(this.p1, s4, fn);
          this.physics.add.overlap(this.p2, s4, fn);
        }
        if (s5) {
          const fn = () => rightNStop(this.spikes2R.getChildren(), "touch5", 9);
          this.physics.add.overlap(this.p1, s5, fn);
          this.physics.add.overlap(this.p2, s5, fn);
        }
        if (s6) {
          const fn = () => rightNStop(this.spikes5R.getChildren(), "touch6", 9);
          this.physics.add.overlap(this.p1, s6, fn);
          this.physics.add.overlap(this.p2, s6, fn);
        }

        const moveDoorsSeq = (dieDoors, winDoors, key) => {
          oneShot(key, () => {
            const dies = dieDoors.getChildren();
            const wins = winDoors.getChildren();
            let pending = Math.max(1, dies.length);
            for (const o of dies) {
              this.tweens.add({
                targets: o,
                x: o.x - tileW * 14,
                duration: 850,
                ease: "Sine.easeInOut",
                onUpdate: () => syncSensor(o),
                onComplete: () => {
                  pending -= 1;
                  if (pending === 0) {
                    for (const w of wins) {
                      this.tweens.add({
                        targets: w,
                        x: w.x - tileW * 3,
                        duration: 260,
                        ease: "Sine.easeInOut",
                        onUpdate: () => syncSensor(w),
                      });
                    }
                  }
                },
              });
            }
            if (!dies.length) pending = 0;
          });
        };

        if (s7) {
          const fn = () => moveDoorsSeq(this.dieDoors2, this.winDoors3, "touch7");
          this.physics.add.overlap(this.p1, s7, fn);
          this.physics.add.overlap(this.p2, s7, fn);
        }
        if (s8) {
          const fn = () => moveDoorsSeq(this.dieDoors5, this.winDoors4, "touch8");
          this.physics.add.overlap(this.p1, s8, fn);
          this.physics.add.overlap(this.p2, s8, fn);
        }

        // controls
        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
          p2: { left: "KeyA", right: "KeyD", jump: "KeyW" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.UP;
        const p2Left = codeToPhaserKeyCode(kb.p2.left) ?? Phaser.Input.Keyboard.KeyCodes.A;
        const p2Right = codeToPhaserKeyCode(kb.p2.right) ?? Phaser.Input.Keyboard.KeyCodes.D;
        const p2Jump = codeToPhaserKeyCode(kb.p2.jump) ?? Phaser.Input.Keyboard.KeyCodes.W;
        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
        this.p2Keys = this.input.keyboard.addKeys({ left: p2Left, right: p2Right, jump: p2Jump });
      },
      update: function () {
        if (!this.p1?.body || !this.p2?.body) return;
        if (this.finished) return;

        // 载人：站在移动物体上时，跟随物体相对位移
        window.PTLevelShared?.carryPlayersOnMovingObjects?.(this, [this.p1, this.p2], [
          this.oscL,
          this.oscR,
          this.dieDoors2,
          this.dieDoors5,
          this.winDoors3,
          this.winDoors4,
        ]);

        // death spikes 与 solid 墙体重叠时隐藏/禁用判定
        window.PTLevelShared?.updateDeathSpikesHideOnSolidOverlap?.(this, [
          this.spikes3L,
          this.spikes4L,
          this.spikes3LL,
          this.spikes4LL,
          this.spikes2R,
          this.spikes5R,
        ], [this.solids, this.oscL, this.oscR]);

        // 强制分离（避免 tween 平台穿模）
        try {
          this.physics.world.collide(this.p1, this.oscL);
          this.physics.world.collide(this.p2, this.oscL);
          this.physics.world.collide(this.p1, this.oscR);
          this.physics.world.collide(this.p2, this.oscR);
        } catch {}

        const step = (p, keys, isP1) => {
          const tuning = this._tuning || { speed: 300, jumpV: -920 };
          const mobile = isP1 && window.__PT_isMobileControl?.() === true;
          const left = keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
          const right = keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
          if (left) p.setVelocityX(-tuning.speed);
          else if (right) p.setVelocityX(tuning.speed);
          else p.setVelocityX(0);
          if (left) p.setTexture("char_left");
          else if (right) p.setTexture("char_right");
          else p.setTexture("char_front");
          const wantJump = Phaser.Input.Keyboard.JustDown(keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
          if (wantJump && (p.body.blocked.down || p.body.touching.down)) p.setVelocityY(tuning.jumpV);
        };
        step(this.p1, this.p1Keys, true);
        step(this.p2, this.p2Keys, false);

        const outOfMap = (p) => p.x < -tileW || p.x > worldW + tileW || p.y < -tileH || p.y > worldH + tileH;
        if (outOfMap(this.p1)) this.respawnPlayer(this.p1);
        if (outOfMap(this.p2)) this.respawnPlayer(this.p2);
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

