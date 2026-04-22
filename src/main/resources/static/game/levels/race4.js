// Double-player Race Level 4 (JSON)
// Exposes: window.DoublePlayerLevels.startRaceLevel4(ctx, levelId)
(function () {
  window.DoublePlayerLevels = window.DoublePlayerLevels || {};

  window.DoublePlayerLevels.startRaceLevel4 = async function startRaceLevel4(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl =
      window.PTLevelShared?.resolveGameUrl?.(assets.raceLevel4Json) ||
      new URL(assets.raceLevel4Json, window.location.href).toString();

    let mapData;
    try {
      if (window.PTLevelShared?.fetchJsonWithFallback) {
        mapData = await window.PTLevelShared.fetchJsonWithFallback(assets.raceLevel4Json);
      } else {
        const r = await fetch(mapUrl, { credentials: "same-origin" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        mapData = await r.json();
      }
    } catch (e) {
      alert(`Race level 4 map load failed: ${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;

    const mapBase = new URL(mapUrl);

    const resolveTilesetImageUrl =
      (imageSource, baseUrl) => window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ?? null;
    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);

    const isTrue = (v) => v === true || v === 1 || String(v || "").toLowerCase() === "true";

    // tilesets
    const tilesetInfos = [];
    const tilesetsRaw = mapData?.tilesets;
    const tilesetsList =
      Array.isArray(tilesetsRaw) ? tilesetsRaw : tilesetsRaw && typeof tilesetsRaw === "object" ? Object.values(tilesetsRaw) : [];

    for (const ts of tilesetsList) {
      const firstgid = Number(ts.firstgid || 1);
      const source = ts.source;
      if (!source) continue;
      try {
        const tsxText = await fetchTsxText(source, mapBase);
        const parsed = parseTsx(tsxText);
        tilesetInfos.push({ firstgid, source, ...(parsed || {}) });
      } catch {
        // TSX 解析失败也先保留 tileset 信息，尽量让关卡继续渲染（至少不会整关直接中止）
        tilesetInfos.push({ firstgid, source, name: String(ts.name || source), tiles: {} });
      }
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);

    if (!tilesetInfos.length) {
      alert("Race level 4 resource load failed: TSX tileset parse failed.");
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
      Array.isArray(props) &&
      props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    const propTrue = (props, key) =>
      Array.isArray(props) &&
      props.some(
        (p) =>
          String(p?.name || "").toLowerCase() === String(key || "").toLowerCase() &&
          (p.value === true || p.value === 1 || String(p.value || "").toLowerCase() === "true")
      );
    const findObj = (key) =>
      objects.find(
        (o) =>
          propTrue(o?.properties, key) ||
          hasPropName(o?.properties, key) ||
          String(o?.name || "").toLowerCase() === String(key || "").toLowerCase()
      ) || null;

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
      return {
        x: o.x + (o.width || tileW) / 2,
        y: o.y - Math.max(6, Math.min(tileH * 0.6, (o.height || tileH) * 0.6)),
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
        if (!imageToKey.has(url)) imageToKey.set(url, `tile_${ts.name || "ts"}_${id}`);
      }
    }

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

        this._tuning =
          window.PTLevelShared?.getDefaultPlayerTuning?.() || {
            speed: 300,
            jumpV: -920,
            gravityY: 900,
            maxVx: 320,
            maxVy: 900,
            dragX: 900,
          };

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

        // Moving solids (for collisions + "carry the player")
        this.oscL = this.physics.add.group(); // carry + collide
        this.oscR = this.physics.add.group(); // reserved (empty)

        // Death spikes (sensors follow rotation + tween)
        this.spikesLmove2 = this.physics.add.group(); // touch1
        this.spikesLmove5 = this.physics.add.group(); // touch5
        this.spikesRturn3 = this.physics.add.group(); // touch2
        this.spikesRturn6 = this.physics.add.group(); // touch6
        this.spikesRrturn3 = this.physics.add.group(); // touch4
        this.spikesRrturn6 = this.physics.add.group(); // touch8

        // Moving wall platforms (solid, for carry)
        this.wallLmove2 = this.physics.add.group(); // touch3
        this.wallLmove5 = this.physics.add.group(); // touch7

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
          const o = key ? this.physics.add.image(cx, cy, key) : this.physics.add.image(cx, cy, "char_front");
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
            // Arcade Physics 命中框：显式同步一次 size，避免只 setDisplaySize 造成 hitbox 不一致
            if (o.body.setSize) o.body.setSize(w, h, true);
            if (o.body.updateFromGameObject) o.body.updateFromGameObject();
          }

          o.setVelocity?.(0, 0);
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
          if (s) {
            // deathSensors 用于与玩家做 overlap（传感器需要加入这个 group）
            this.deathSensors.add(s);
            return s;
          }

          // fallback（理论上不会触发，但避免 shared.js 未加载时直接崩溃）
          const b = o.getBounds();
          const r = this.add.rectangle(b.centerX, b.centerY, b.width, b.height, 0xff0000, 0);
          this.physics.add.existing(r, true);
          if (r.body) {
            r.body.enable = !!enabled;
            if (r.body.updateFromGameObject) r.body.updateFromGameObject();
          }
          this.deathSensors.add(r);
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

        // Render + build physics
        const layerName = (layer) => String(layer?.name || "").toLowerCase();

        const updoWalls = [];
        const doupWalls = [];

        const renderTileLayer = (layer) => {
          if (!layer) return;
          const lname = layerName(layer);
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            const solid = isTrue(p.solid);
            const fake = isTrue(p.fake);
            const win = isTrue(p.win);
            const death = isTrue(p.death);
            const lmove = isTrue(p.lmove);
            const rturn = isTrue(p.rturn);
            const rrturn = isTrue(p.rrturn);
            const updo = isTrue(p.updo);
            const doup = isTrue(p.doup);

            if (fake) {
              // 虚假墙：只显示，不生成碰撞
              drawTile(col, row, tile, tileW, tileH, 16);
              continue;
            }

            if (win) {
              // 纯胜利触发：不需要触发器
              drawTile(col, row, tile, tileW * 2, tileH * 2, 30);
              addStaticRect(this.winSensors, cx, cy, tileW * 2, tileH * 2);
              continue;
            }

            // Moving solid walls
            if (solid && lname === "two" && updo) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
              this.oscL.add(o);
              updoWalls.push(o);
              continue;
            }
            if (solid && lname === "two" && doup) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
              this.oscL.add(o);
              doupWalls.push(o);
              continue;
            }

            if (solid && lmove) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
              this.oscL.add(o);
              if (lname === "two") this.wallLmove2.add(o);
              if (lname === "five") this.wallLmove5.add(o);
              continue;
            }

            // Static solids (if any)
            if (solid) {
              addStaticRect(this.solids, cx, cy, tileW, tileH);
              drawTile(col, row, tile, tileW, tileH, 18);
              continue;
            }

            // Death spikes (as sensors)
            if (death && lmove) {
              const o = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 28, false);
              // lmove spikes：默认隐藏且不致死，触发后才开启
              o.setVisible?.(false);
              o._deathBaseEnable = false;
              o._deathBaseVisible = false;
              attachSensorToObj(o, false);

              if (lname === "two") this.spikesLmove2.add(o);
              if (lname === "five") this.spikesLmove5.add(o);
              continue;
            }

            if (death && rturn) {
              const o = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 28, false);
              o.setAngle?.(90);
              o._deathBaseEnable = true;
              o._deathBaseVisible = true;
              attachSensorToObj(o, true);
              syncSensor(o);

              if (lname === "three") this.spikesRturn3.add(o);
              if (lname === "six") this.spikesRturn6.add(o);
              continue;
            }

            if (death && rrturn) {
              const o = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 28, false);
              o.setAngle?.(90);
              o._deathBaseEnable = true;
              o._deathBaseVisible = true;
              attachSensorToObj(o, true);
              syncSensor(o);

              if (lname === "three") this.spikesRrturn3.add(o);
              if (lname === "six") this.spikesRrturn6.add(o);
              continue;
            }

            // other visuals
            drawTile(col, row, tile, tileW, tileH, 14);
          }
        };

        // base draw
        for (const layer of tileLayers) renderTileLayer(layer);

        // periodic up/down movement for updo+solid walls
        for (const o of updoWalls) {
          this.tweens.add({
            targets: o,
            y: o.y - tileH * 3,
            duration: 900,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            onUpdate: () => o.body?.updateFromGameObject?.(),
          });
        }
        // doup: first move down 3 tiles, then up 3 tiles, periodic.
        for (const o of doupWalls) {
          this.tweens.add({
            targets: o,
            y: o.y + tileH * 3,
            duration: 900,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            onUpdate: () => o.body?.updateFromGameObject?.(),
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

        this.physics.add.collider(this.p1, this.solids);
        this.physics.add.collider(this.p2, this.solids);

        const addDynCollider = (p, grp) =>
          this.physics.add.collider(p, grp, (_a, b) => b?.body?.updateFromGameObject?.());
        addDynCollider(this.p1, this.oscL);
        addDynCollider(this.p2, this.oscL);
        // oscR reserved (leave empty)

        this.respawnPlayer = (p) => {
          if (!p?.body || this.finished) return;
          const sp = p === this.p1 ? this.spawn1 : this.spawn2;
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

        const showSpikesMoveLeftStop = (spikeGroup, key, leftTiles) => {
          oneShot(key, () => {
            if (!spikeGroup?.getChildren) return;
            for (const o of spikeGroup.getChildren()) {
              if (!o) continue;
              o.setVisible?.(true);
              o._deathBaseEnable = true;
              o._deathBaseVisible = true;
              if (o._sensor?.body) o._sensor.body.enable = true;
              this.tweens.add({
                targets: o,
                x: o.x - tileW * leftTiles,
                duration: 260,
                ease: "Sine.easeInOut",
                onUpdate: () => syncSensor(o),
              });
            }
          });
        };

        const rightDisappear = (spikeGroup, key, rightTiles) => {
          oneShot(key, () => {
            if (!spikeGroup?.getChildren) return;
            for (const o of spikeGroup.getChildren()) {
              if (!o) continue;
              this.tweens.add({
                targets: o,
                x: o.x + tileW * rightTiles,
                duration: 520,
                ease: "Sine.easeInOut",
                onUpdate: () => syncSensor(o),
                onComplete: () => {
                  o._sensor?.destroy?.();
                  o.destroy?.();
                },
              });
            }
          });
        };

        const downThenRightDisappear = (spikeGroup, key, downTiles, rightTiles) => {
          oneShot(key, () => {
            if (!spikeGroup?.getChildren) return;
            for (const o of spikeGroup.getChildren()) {
              if (!o) continue;
              this.tweens.add({
                targets: o,
                y: o.y + tileH * downTiles,
                duration: 260,
                ease: "Sine.easeInOut",
                onUpdate: () => syncSensor(o),
                onComplete: () => {
                  this.tweens.add({
                    targets: o,
                    x: o.x + tileW * rightTiles,
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

        const moveWallsLeftStop = (wallGroup, key, leftTiles) => {
          oneShot(key, () => {
            if (!wallGroup?.getChildren) return;
            for (const o of wallGroup.getChildren()) {
              if (!o?.body) continue;
              this.tweens.add({
                targets: o,
                x: o.x - tileW * leftTiles,
                duration: 260,
                ease: "Sine.easeInOut",
                onUpdate: () => o.body?.updateFromGameObject?.(),
              });
            }
          });
        };

        // touch1 -> layer two death+lmove spikes move left2, then stop (still lethal)
        if (s1) {
          const fn = () => showSpikesMoveLeftStop(this.spikesLmove2, "touch1", 2);
          this.physics.add.overlap(this.p1, s1, fn);
          this.physics.add.overlap(this.p2, s1, fn);
        }
        // touch5 -> layer five death+lmove spikes move left2, then stop (still lethal)
        if (s5) {
          const fn = () => showSpikesMoveLeftStop(this.spikesLmove5, "touch5", 2);
          this.physics.add.overlap(this.p1, s5, fn);
          this.physics.add.overlap(this.p2, s5, fn);
        }

        // touch2 -> layer three rturn spikes move right25, then disappear
        if (s2) {
          const fn = () => rightDisappear(this.spikesRturn3, "touch2", 25);
          this.physics.add.overlap(this.p1, s2, fn);
          this.physics.add.overlap(this.p2, s2, fn);
        }
        // touch6 -> layer six rturn spikes move right25, then disappear
        if (s6) {
          const fn = () => rightDisappear(this.spikesRturn6, "touch6", 25);
          this.physics.add.overlap(this.p1, s6, fn);
          this.physics.add.overlap(this.p2, s6, fn);
        }

        // touch3 -> layer two lmove+solid walls move left4, then stop
        if (s3) {
          const fn = () => moveWallsLeftStop(this.wallLmove2, "touch3", 4);
          this.physics.add.overlap(this.p1, s3, fn);
          this.physics.add.overlap(this.p2, s3, fn);
        }
        // touch7 -> layer five lmove+solid walls move left4, then stop
        if (s7) {
          const fn = () => moveWallsLeftStop(this.wallLmove5, "touch7", 4);
          this.physics.add.overlap(this.p1, s7, fn);
          this.physics.add.overlap(this.p2, s7, fn);
        }

        // touch4 -> layer three rrturn spikes down5 then right20, then disappear
        if (s4) {
          const fn = () => downThenRightDisappear(this.spikesRrturn3, "touch4", 5, 20);
          this.physics.add.overlap(this.p1, s4, fn);
          this.physics.add.overlap(this.p2, s4, fn);
        }
        // touch8 -> layer six rrturn spikes down5 then right20, then disappear
        if (s8) {
          const fn = () => downThenRightDisappear(this.spikesRrturn6, "touch8", 5, 20);
          this.physics.add.overlap(this.p1, s8, fn);
          this.physics.add.overlap(this.p2, s8, fn);
        }

        // controls
        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
          p2: { left: "KeyA", right: "KeyD", jump: "KeyW" },
        };
        const p1Left = window.PTLevelShared?.codeToPhaserKeyCode?.(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = window.PTLevelShared?.codeToPhaserKeyCode?.(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = window.PTLevelShared?.codeToPhaserKeyCode?.(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.UP;
        const p2Left = window.PTLevelShared?.codeToPhaserKeyCode?.(kb.p2.left) ?? Phaser.Input.Keyboard.KeyCodes.A;
        const p2Right = window.PTLevelShared?.codeToPhaserKeyCode?.(kb.p2.right) ?? Phaser.Input.Keyboard.KeyCodes.D;
        const p2Jump = window.PTLevelShared?.codeToPhaserKeyCode?.(kb.p2.jump) ?? Phaser.Input.Keyboard.KeyCodes.W;

        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
        this.p2Keys = this.input.keyboard.addKeys({ left: p2Left, right: p2Right, jump: p2Jump });
      },
      update: function () {
        if (!this.p1?.body || !this.p2?.body) return;
        if (this.finished) return;

        // 载人：站在移动物体上时，跟随物体相对位移（避免掉下去/穿模）
        window.PTLevelShared?.carryPlayersOnMovingObjects?.(this, [this.p1, this.p2], [this.oscL]);

        // death spikes 与 solid 墙体重叠时隐藏/禁用判定
        window.PTLevelShared?.updateDeathSpikesHideOnSolidOverlap?.(
          this,
          [this.spikesLmove2, this.spikesLmove5, this.spikesRturn3, this.spikesRturn6, this.spikesRrturn3, this.spikesRrturn6],
          [this.solids, this.oscL]
        );

        // 强制分离（避免 tween 平台穿模）
        try {
          this.physics.world.collide(this.p1, this.oscL);
          this.physics.world.collide(this.p2, this.oscL);
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

    const vp = window.__PT_getGameViewport
      ? window.__PT_getGameViewport()
      : {
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

