// Double-player Race Level 3 (JSON)
// Exposes: window.DoublePlayerLevels.startRaceLevel3(ctx, levelId)
(function () {
  window.DoublePlayerLevels = window.DoublePlayerLevels || {};

  window.DoublePlayerLevels.startRaceLevel3 = async function startRaceLevel3(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.raceLevel3Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Race level 3 map load failed: ${e?.message || String(e)}`);
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
      alert("Race level 3 resource load failed: TSX tileset parse failed.");
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
      return { ...tile, tileset: chosen, tileId };
    }

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objs = allLayers
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);

    const propHas = (obj, key) =>
      Array.isArray(obj?.properties) && obj.properties.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    const propTrue = (obj, key) =>
      Array.isArray(obj?.properties) &&
      obj.properties.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase() && (p.value === true || p.value === 1 || String(p.value || "").toLowerCase() === "true"));
    const born1Obj = objs.find((o) => propTrue(o, "born1") || propHas(o, "born1")) || null;
    const born2Obj = objs.find((o) => propTrue(o, "born2") || propHas(o, "born2")) || null;
    const touchObj = (n) => objs.find((o) => propTrue(o, `touch${n}`) || propHas(o, `touch${n}`) || String(o.name || "").toLowerCase() === `touch${n}`) || null;

    const t1 = touchObj(1);
    const t2 = touchObj(2);
    const t3 = touchObj(3);
    const t4 = touchObj(4);
    const t5 = touchObj(5);
    const t6 = touchObj(6);
    const t7 = touchObj(7);
    const t8 = touchObj(8);

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

    const scene = {
      preload: function () {
        this.load.on("loaderror", (file) => {
          console.warn("race3 loaderror:", file?.key, file?.src);
        });
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.__PT_makeSpriteBgTransparent?.(this, ["char_front", "char_left", "char_right"]);

        this._tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };
        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = this._tuning.gravityY;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        this.finished = false;
        this.triggered = new Set();

        const layerByName = (n) => tileLayers.find((l) => String(l.name || "").toLowerCase() === n) || null;
        const layerOne = layerByName("one");
        const layerTwo = layerByName("two");
        const layerThree = layerByName("three");
        const layerFour = layerByName("four");
        const layerFive = layerByName("five");

        const drawTile = (col, row, tile, w = tileW, h = tileH, depth = 10) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (!key) return null;
          const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
          img.setDisplaySize(w, h);
          img.setDepth(depth);
          return img;
        };

        const spawnBodyImage = (cx, cy, tile, w = tileW, h = tileH, depth = 20, solid = true) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (!key) {
            const r = this.add.rectangle(cx, cy, w, h, 0xff00ff, 0.2);
            r.setDepth(depth);
            this.physics.add.existing(r);
            if (r.body) {
              r.body.allowGravity = false;
              if (r.body.setAllowGravity) r.body.setAllowGravity(false);
              r.body.immovable = true;
              if (r.body.setImmovable) r.body.setImmovable(true);
              r.body.moves = false;
              if (!solid) r.body.enable = false;
            }
            return r;
          }
          const o = this.physics.add.image(cx, cy, key);
          o.setDisplaySize(w, h);
          o.setDepth(depth);
          if (o.body) {
            o.body.allowGravity = false;
            if (o.body.setAllowGravity) o.body.setAllowGravity(false);
            o.body.immovable = true;
            if (o.body.setImmovable) o.body.setImmovable(true);
            o.body.moves = false;
            if (!solid) o.body.enable = false;
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

        // groups
        this.solids = this.physics.add.staticGroup();
        this.deathSensors = this.physics.add.staticGroup();
        this.winSensors = this.physics.add.staticGroup();
        this.fakeVisuals = [];

        this.oscR16 = this.physics.add.group(); // two: solid+rmove, periodic
        this.rrmoveTwo = this.physics.add.group(); // two: solid+rrmove, touch1
        this.rmove2Two = this.physics.add.group(); // two: solid+rmove2, touch2
        this.rrmoveThree = this.physics.add.group(); // three: solid+rrmove, touch5
        this.rmove2Three = this.physics.add.group(); // three: solid+rmove2, touch6

        this.spikesFour = this.physics.add.group(); // four: death+rturn, touch3
        this.spikesFive = this.physics.add.group(); // five: death+rturn, touch7

        this.winDoorsFour = this.physics.add.group(); // four: win, touch4 (move left 3)
        this.winDoorsFive = this.physics.add.group(); // five: win, touch8 (move left 3)

        // render one layer (pure background / base)
        if (layerOne) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layerOne.data[idx] || 0);
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            drawTile(col, row, tile, tileW, tileH, 5);
          }
        }

        // two layer: walls + fake door (death2)
        if (layerTwo) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layerTwo.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            if (p.fake === true) {
              const img = drawTile(col, row, tile, tileW, tileH, 12);
              if (img) this.fakeVisuals.push(img);
              continue;
            }

            // fake door: death2 kills
            if (p.death2 === true) {
              drawTile(col, row, tile, tileW * 2, tileH * 2, 30);
              addStaticRect(this.deathSensors, cx, cy, tileW * 2, tileH * 2);
              continue;
            }

            if (p.win === true) {
              drawTile(col, row, tile, tileW * 2, tileH * 2, 30);
              addStaticRect(this.winSensors, cx, cy, tileW * 2, tileH * 2);
              continue;
            }

            if (p.solid === true) {
              if (p.rmove === true) {
                const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
                this.oscR16.add(o);
              } else if (p.rrmove === true) {
                const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
                this.rrmoveTwo.add(o);
              } else if (p.rmove2 === true) {
                const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
                this.rmove2Two.add(o);
              } else {
                // solid static
                addStaticRect(this.solids, cx, cy, tileW, tileH);
                drawTile(col, row, tile, tileW, tileH, 18);
              }
            } else {
              drawTile(col, row, tile, tileW, tileH, 18);
            }
          }
        }

        // three layer: fake walls (non-solid) + rrmove/rmove2 solid blocks
        if (layerThree) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layerThree.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            if (p.fake === true) {
              // 虚假墙：只显示，不生成碰撞体
              drawTile(col, row, tile, tileW, tileH, 16);
              continue;
            }
            if (p.solid === true && p.rrmove === true) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 24, true);
              this.rrmoveThree.add(o);
              continue;
            }
            if (p.solid === true && p.rmove2 === true) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 24, true);
              this.rmove2Three.add(o);
              continue;
            }
            // other visuals
            drawTile(col, row, tile, tileW, tileH, 16);
          }
        }

        // spikes + win doors in four/five
        const spikeW = tileW * 2;
        const spikeH = tileH / 2;
        const attachSensorToObj = (o, w, h) => {
          const b = o.getBounds();
          const s = this.add.rectangle(b.centerX, b.centerY, w ?? b.width, h ?? b.height, 0xff0000, 0);
          this.physics.add.existing(s, true);
          o._sensor = s;
          return s;
        };
        const syncSensor = (o) => {
          const s = o?._sensor;
          if (!o || !s || !s.body) return;
          const b = o.getBounds();
          s.x = b.centerX;
          s.y = b.centerY;
          if (s.body.setSize) s.body.setSize(b.width, b.height, true);
          s.body.updateFromGameObject();
        };

        const scanDoorsAndSpikes = (layer, spikeGroup, winGroup) => {
          if (!layer) return;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            if (p.win === true) {
              const o = spawnBodyImage(cx, cy, tile, tileW * 2, tileH * 2, 30, true);
              o.body.moves = false;
              winGroup.add(o);
              addStaticRect(this.winSensors, cx, cy, tileW * 2, tileH * 2);
              continue;
            }
            if (p.death === true && p.rturn === true) {
              const o = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 28, false);
              o.setAngle(90);
              o.body.enable = false; // death 判定走 sensor
              spikeGroup.add(o);
              const s = attachSensorToObj(o);
              this.deathSensors.add(s);
              continue;
            }
            // other visuals
            drawTile(col, row, tile, tileW, tileH, 14);
          }
        };

        scanDoorsAndSpikes(layerFour, this.spikesFour, this.winDoorsFour);
        scanDoorsAndSpikes(layerFive, this.spikesFive, this.winDoorsFive);

        // periodic movement for two:rmove walls (16 tiles each way, medium speed)
        const mediumMsPerTile = 150;
        const oscTiles = 16;
        const dur = oscTiles * mediumMsPerTile;
        for (const o of this.oscR16.getChildren()) {
          this.tweens.add({
            targets: o,
            x: o.x + tileW * oscTiles,
            duration: dur,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            onUpdate: () => o.body.updateFromGameObject(),
          });
        }

        // players
        const toSpawn = (o, fallback) => {
          if (!o) return fallback;
          return {
            x: o.x + (o.width || tileW) / 2,
            y: o.y - Math.max(6, Math.min(tileH * 0.6, (o.height || tileH) * 0.6)),
          };
        };
        this.spawn1 = toSpawn(born1Obj, { x: tileW * 2, y: tileH * 2 });
        this.spawn2 = toSpawn(born2Obj, { x: tileW * 4, y: tileH * 2 });

        const mkPlayer = (x, y, tint) => {
          const tuning = this._tuning;
          const p = this.physics.add.sprite(x, y, "char_front").setOrigin(0.5, 1);
          p.setDepth(1000); // 永远显示在最上层（避免被地图 tile 覆盖导致“看不到人物”）
          p.setTint(tint);
          p.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
          p.body.setCollideWorldBounds(true);
          p.body.setSize(p.displayWidth, p.displayHeight, false);
          p.body.setDragX(tuning.dragX);
          p.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);
          this.physics.add.collider(p, this.solids);
          this.physics.add.collider(p, this.oscR16);
          this.physics.add.collider(p, this.rrmoveTwo);
          this.physics.add.collider(p, this.rmove2Two);
          this.physics.add.collider(p, this.rrmoveThree);
          this.physics.add.collider(p, this.rmove2Three);
          this.physics.add.overlap(p, this.deathSensors, () => this.respawnPlayer(p));
          return p;
        };

        this.respawnPlayer = (p) => {
          if (!p?.body || this.finished) return;
          const sp = p === this.p1 ? this.spawn1 : this.spawn2;
          p.setPosition(sp.x, sp.y);
          p.body.setVelocity(0, 0);
        };

        this.p1 = mkPlayer(this.spawn1.x, this.spawn1.y, 0x93c5fd);
        this.p2 = mkPlayer(this.spawn2.x, this.spawn2.y, 0xfca5a5);

        // win
        const winNow = () => {
          if (this.finished) return;
          this.finished = true;
          if (typeof onLevelWin === "function") onLevelWin(levelId);
        };
        this.physics.add.overlap(this.p1, this.winSensors, winNow);
        this.physics.add.overlap(this.p2, this.winSensors, winNow);

        // touches
        const s1 = makeSensor(t1);
        const s2 = makeSensor(t2);
        const s3 = makeSensor(t3);
        const s4 = makeSensor(t4);
        const s5 = makeSensor(t5);
        const s6 = makeSensor(t6);
        const s7 = makeSensor(t7);
        const s8 = makeSensor(t8);

        const quickRightN = (targets, tiles, key) => {
          oneShot(key, () => {
            for (const o of targets) {
              if (!o?.body) continue;
              this.tweens.add({
                targets: o,
                x: o.x + tileW * tiles,
                duration: 220,
                ease: "Sine.easeInOut",
                onUpdate: () => o.body.updateFromGameObject(),
              });
            }
          });
        };

        const spikesFlyRightAndDisappear = (targets, tiles, key) => {
          oneShot(key, () => {
            for (const o of targets) {
              if (!o) continue;
              const sensor = o._sensor;
              this.tweens.add({
                targets: o,
                x: o.x + tileW * tiles,
                duration: 620,
                ease: "Sine.easeInOut",
                onUpdate: () => syncSensor(o),
                onComplete: () => {
                  if (sensor?.body) sensor.body.enable = false;
                  sensor?.destroy?.();
                  o.destroy?.();
                },
              });
            }
          });
        };

        const doorLeft3 = (targets, key) => {
          oneShot(key, () => {
            for (const o of targets) {
              if (!o?.body) continue;
              this.tweens.add({
                targets: o,
                x: o.x - tileW * 3,
                duration: 260,
                ease: "Sine.easeInOut",
                onUpdate: () => o.body.updateFromGameObject(),
              });
            }
          });
        };

        if (s1) {
          const fn = () => quickRightN(this.rrmoveTwo.getChildren(), 4, "touch1");
          this.physics.add.overlap(this.p1, s1, fn);
          this.physics.add.overlap(this.p2, s1, fn);
        }
        if (s5) {
          const fn = () => quickRightN(this.rrmoveThree.getChildren(), 4, "touch5");
          this.physics.add.overlap(this.p1, s5, fn);
          this.physics.add.overlap(this.p2, s5, fn);
        }
        if (s2) {
          const fn = () => quickRightN(this.rmove2Two.getChildren(), 4, "touch2");
          this.physics.add.overlap(this.p1, s2, fn);
          this.physics.add.overlap(this.p2, s2, fn);
        }
        if (s6) {
          const fn = () => quickRightN(this.rmove2Three.getChildren(), 4, "touch6");
          this.physics.add.overlap(this.p1, s6, fn);
          this.physics.add.overlap(this.p2, s6, fn);
        }
        if (s3) {
          const fn = () => spikesFlyRightAndDisappear(this.spikesFour.getChildren(), 21, "touch3");
          this.physics.add.overlap(this.p1, s3, fn);
          this.physics.add.overlap(this.p2, s3, fn);
        }
        if (s7) {
          const fn = () => spikesFlyRightAndDisappear(this.spikesFive.getChildren(), 21, "touch7");
          this.physics.add.overlap(this.p1, s7, fn);
          this.physics.add.overlap(this.p2, s7, fn);
        }
        if (s4) {
          const fn = () => doorLeft3(this.winDoorsFour.getChildren(), "touch4");
          this.physics.add.overlap(this.p1, s4, fn);
          this.physics.add.overlap(this.p2, s4, fn);
        }
        if (s8) {
          const fn = () => doorLeft3(this.winDoorsFive.getChildren(), "touch8");
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

        const tuning = this._tuning || { speed: 300, jumpV: -920 };
        const step = (p, keys, isP1) => {
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

        // fall out -> respawn
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

