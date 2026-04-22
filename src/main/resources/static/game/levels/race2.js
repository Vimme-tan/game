// Double-player Race Level 2 (JSON)
// Exposes: window.DoublePlayerLevels.startRaceLevel2(ctx, levelId)
(function () {
  window.DoublePlayerLevels = window.DoublePlayerLevels || {};

  window.DoublePlayerLevels.startRaceLevel2 = async function startRaceLevel2(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl =
      window.PTLevelShared?.resolveGameUrl?.(assets.raceLevel2Json) ||
      new URL(assets.raceLevel2Json, window.location.href).toString();
    let mapData;
    try {
      if (window.PTLevelShared?.fetchJsonWithFallback) {
        mapData = await window.PTLevelShared.fetchJsonWithFallback(assets.raceLevel2Json);
      } else {
        const r = await fetch(mapUrl, { credentials: "same-origin" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        mapData = await r.json();
      }
    } catch (e) {
      alert(`Race level 2 map load failed: ${e?.message || String(e)}`);
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
      if (!Array.isArray(props)) return false;
      const k = String(key || "").toLowerCase();
      return props.some((p) => {
        const name = String(p?.name || "").toLowerCase();
        if (name !== k) return false;
        return p?.value === true || p?.value === 1 || String(p?.value || "").toLowerCase() === "true";
      });
    }

    const race2LegacyMap = {
      "1.png": "grey.png",
      "2.png": "earthWall.png",
      "3.png": "earthWall2.png",
      "4.png": "doorRedStroked.png",
      "5.png": "trap.png",
    };
    const resolveTilesetImageUrl = (imageSource, baseUrl) =>
      window.PTLevelShared?.resolveTilesetImageUrlEx?.(imageSource, baseUrl, race2LegacyMap) ??
      window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ??
      null;
    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);

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
      alert("Race level 2 resource load failed: TSX tileset parse failed.");
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

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    // 竞速第二关：对象层可能不止一个，统一扁平化（否则 born1/born2 可能找不到 -> 看起来“没人物出生”）
    const objs = allLayers
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);
    const hasPropName = (obj, key) =>
      Array.isArray(obj?.properties) && obj.properties.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    // 竞速第二关：使用 born / born2（兼容值为 false 的情况：只要属性名存在就视为出生点）
    const born1Obj =
      objs.find((o) => propTrue(o.properties, "born") || hasPropName(o, "born") || propTrue(o.properties, "born1") || hasPropName(o, "born1") || propTrue(o.properties, "bron1") || hasPropName(o, "bron1")) ||
      null;
    const born2Obj = objs.find((o) => propTrue(o.properties, "born2") || hasPropName(o, "born2")) || null;
    const touchObj = (n) => objs.find((o) => propTrue(o.properties, `touch${n}`) || String(o.name || "").toLowerCase() === `touch${n}`) || null;
    const t1 = touchObj(1);
    const t2 = touchObj(2);
    const t3 = touchObj(3);
    const t4 = touchObj(4);
    const t5 = touchObj(5);
    const t6 = touchObj(6);
    const t7 = touchObj(7);
    const t8 = touchObj(8);

    const mediumMsPerTile = 150; // medium speed for oscillating blocks (slower than before)

    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    const scene = {
      preload: function () {
        this.load.on("loaderror", (file) => {
          // Keep running; helps diagnose missing assets quickly.
          console.warn("loaderror:", file?.key, file?.src);
        });
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.__PT_makeSpriteBgTransparent?.(this, ["char_front", "char_left", "char_right"]);
        this.finished = false;
        this.dead1 = false;
        this.dead2 = false;
        this.lastRespawnAt1 = -1e9;
        this.lastRespawnAt2 = -1e9;
        this.deathInvulnMs = 650;
        this.triggered = new Set();

        this._tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = this._tuning.gravityY;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        const addStaticRect = (group, x, y, w = tileW, h = tileH) => {
          const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
          this.physics.add.existing(r, true);
          group.add(r);
          return r;
        };

        // groups
        this.solids = this.physics.add.staticGroup();
        this.winSensors = this.physics.add.staticGroup();
        this.deathSensors = this.physics.add.staticGroup();
        this.fakeVisuals = [];

        // moving solids
        this.oscLR = this.physics.add.group(); // solid+lmove in layer two
        this.oscDU = this.physics.add.group(); // solid+dmove in layer two
        this.upmoveWalls = this.physics.add.group(); // solid+upmove in layer two (touch1)
        this.upmWalls = this.physics.add.group(); // solid+upm in layer two (touch5)

        // spikes by layer for triggers
        this.spikesR3 = this.physics.add.group();
        this.spikesR4 = this.physics.add.group();
        this.spikesUp3 = this.physics.add.group();
        this.spikesUp4 = this.physics.add.group();
        this.spikesL3 = this.physics.add.group();
        this.spikesL4 = this.physics.add.group();

        const layerByName = (n) => tileLayers.find((l) => String(l.name || "").toLowerCase() === n) || null;
        const layerTwo = layerByName("two");
        const layerThree = layerByName("three");
        const layerFour = layerByName("four");
        const layerOne = layerByName("one");

        const drawTile = (cx, cy, tile, displayW = tileW, displayH = tileH, depth = 10) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (!key) return null;
          const img = this.add.image(cx - displayW / 2, cy + displayH / 2, key).setOrigin(0, 1);
          img.setDisplaySize(displayW, displayH);
          img.setDepth(depth);
          return img;
        };

        // 刺尺寸统一（竞速2：向右变长为原来的两倍 -> 4 格宽，半格高）
        const isTrue = (v) => v === true || v === 1 || String(v || "").toLowerCase() === "true";
        const spikeW = tileW * 4;
        const spikeH = tileH / 2;

        // 预先收集所有 solid 的 tile 坐标：用于“刺与墙重叠则隐藏”
        const solidCells = new Set();
        for (const layer of tileLayers) {
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx]);
            if (!tile) continue;
            const p = tile.props || {};
            if (isTrue(p.solid)) {
              const col = idx % mapW;
              const row = Math.floor(idx / mapW);
              solidCells.add(`${col},${row}`);
            }
          }
        }

        // render all static tiles as images (background grey etc.)
        let missingStaticKeys = 0;
        for (const layer of tileLayers) {
          const layerName = String(layer.name || "").toLowerCase();
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx]);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            // We'll spawn physics-enabled versions for certain interactive tiles; skip their base visual here.
            const isWallInteractive =
              layerName === "two" &&
              isTrue(p.solid) &&
              (isTrue(p.lmove) || isTrue(p.dmove) || isTrue(p.upmove) || isTrue(p.upm) || isTrue(p.rmove));
            const isSpikeInteractive =
              (layerName === "three" || layerName === "four") &&
              isTrue(p.death) &&
              (isTrue(p.rmove) || isTrue(p.lmove) || isTrue(p.upmove));
            const isFake = layerName === "two" && isTrue(p.fake);
            // 所有刺统一走“自定义大小显示 + death 判定区”，避免出现“刺大小没变化”
            const isAnyDeath = isTrue(p.death);
            if (isWallInteractive || isSpikeInteractive || isFake || isAnyDeath) continue;

            const isWin = isTrue(p.win);
            const img = drawTile(cx, cy, tile, isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH, isWin ? 30 : 5);
            if (!img) {
              // Fallback so the map is still visible even if an image URL mapping is wrong.
              missingStaticKeys++;
              this.add
                .rectangle(cx, cy, isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH, 0x000000, 0.06)
                .setDepth(isWin ? 30 : 5);
            }

            if (isTrue(p.solid)) addStaticRect(this.solids, cx, cy);
            if (isTrue(p.win)) addStaticRect(this.winSensors, cx, cy, tileW * 2, tileH * 2);
          }
        }
        if (missingStaticKeys > 0) {
          console.warn(`race2: ${missingStaticKeys} static tiles missing image keys (showing fallback rectangles).`);
        }

        const spawnBodyImage = (cx, cy, tile, w = tileW, h = tileH, depth = 20, allowCollide = true) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (!key) {
            // Fallback: keep gameplay working even if an image key is missing.
            const r = this.add.rectangle(cx, cy, w, h, 0xff00ff, 0.2);
            r.setDepth(depth);
            this.physics.add.existing(r);
            const body = r.body;
            body.allowGravity = false;
            if (body.setAllowGravity) body.setAllowGravity(false);
            body.immovable = true;
            if (body.setImmovable) body.setImmovable(true);
            body.moves = false;
            if (body.setVelocity) body.setVelocity(0, 0);
            if (!allowCollide) body.enable = false;
            return r;
          }
          const o = this.physics.add.image(cx, cy, key);
          o.setDisplaySize(w, h);
          o.setDepth(depth);
          // Hard-freeze by default; trigger handlers will set velocity / tweens.
          if (o.body) {
            o.body.allowGravity = false;
            if (o.body.setAllowGravity) o.body.setAllowGravity(false);
            o.body.immovable = true;
            if (o.body.setImmovable) o.body.setImmovable(true);
            o.body.moves = false;
          }
          if (o.setVelocity) o.setVelocity(0, 0);
          if (!allowCollide) o.body.enable = false;
          return o;
        };

        // 所有静态刺（不带移动属性）统一在这里生成：显示尺寸 + death 判定区
        const spawnStaticSpike = (cx, cy, tile) => {
          // 竞速：刺集体向右移动 1 格
          cx += tileW * 1;
          const img = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 26, false);
          // 纯展示：关闭碰撞体，仅用于显示（death 判定走 deathSensors）
          if (img?.body) img.body.enable = false;
          addStaticRect(this.deathSensors, cx, cy, spikeW, spikeH);
          return img;
        };
        for (const layer of tileLayers) {
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx]);
            if (!tile) continue;
            const p = tile.props || {};
            if (!isTrue(p.death)) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            if (solidCells.has(`${col},${row}`)) continue; // 重叠在墙里的刺隐藏
            const isSpikeInteractive =
              (String(layer.name || "").toLowerCase() === "three" || String(layer.name || "").toLowerCase() === "four") &&
              (isTrue(p.rmove) || isTrue(p.lmove) || isTrue(p.upmove));
            if (isSpikeInteractive) continue; // 动态刺由后续逻辑生成
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            spawnStaticSpike(cx, cy, tile);
          }
        }

        // two layer moving/trigger walls + fake
        if (layerTwo) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layerTwo.data[idx]);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            if (isTrue(p.fake)) {
              // visual only fake wall
              const img = drawTile(cx, cy, tile, tileW, tileH, 12);
              if (img) this.fakeVisuals.push(img);
              continue;
            }

            if (!isTrue(p.solid)) continue;
            // 水平往返平台：solid + lmove / rmove（都按“左右往返”处理，避免出现“move 平台不动”）
            if (isTrue(p.lmove) || isTrue(p.rmove)) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
              this.oscLR.add(o);
              continue;
            }
            if (isTrue(p.dmove)) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 22, true);
              this.oscDU.add(o);
              continue;
            }
            if (isTrue(p.upmove)) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 24, true);
              o._oneShot = false;
              this.upmoveWalls.add(o);
              continue;
            }
            if (isTrue(p.upm)) {
              const o = spawnBodyImage(cx, cy, tile, tileW, tileH, 24, true);
              o._oneShot = false;
              this.upmWalls.add(o);
              continue;
            }
            // 其他 solid tiles：静态
          }
        }

        // oscillations (medium speed, start in positive direction)
        const oscTiles = 14;
        const oscDx = tileW * oscTiles;
        const oscDy = tileH * oscTiles;
        const oscDur = oscTiles * mediumMsPerTile;

        for (const o of this.oscLR.getChildren()) {
          this.tweens.add({
            targets: o,
            x: o.x + oscDx,
            duration: oscDur,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            onUpdate: () => o.body.updateFromGameObject(),
          });
        }
        for (const o of this.oscDU.getChildren()) {
          this.tweens.add({
            targets: o,
            y: o.y + oscDy,
            duration: oscDur,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            onUpdate: () => o.body.updateFromGameObject(),
          });
        }
        // fake 墙体：先向下 14 格后再向上 14 格（虚假，不可站立）
        for (const img of this.fakeVisuals) {
          this.tweens.add({
            targets: img,
            y: img.y + oscDy,
            duration: oscDur,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
          });
        }

        // spikes in three/four（动态刺）
        const attachSensor = (o) => {
          const b = o.getBounds();
          const s = this.add.rectangle(b.centerX, b.centerY, b.width, b.height, 0xff0000, 0);
          this.physics.add.existing(s, true);
          o._sensor = s;
          this.deathSensors.add(s);
          return s;
        };
        const syncSensor = (o) => {
          const s = o?._sensor;
          if (!o || !s?.body) return;
          const b = o.getBounds();
          s.x = b.centerX;
          s.y = b.centerY;
          if (s.body.setSize) s.body.setSize(b.width, b.height, true);
          s.body.updateFromGameObject();
        };

        const spawnSpike = (cx, cy, tile, rotationDeg, group) => {
          // 竞速：刺集体向右移动 1 格
          cx += tileW * 1;
          const o = spawnBodyImage(cx, cy, tile, spikeW, spikeH, 26, true);
          o.setAngle(rotationDeg);
          // Ensure spikes never fall unless we intentionally move them.
          if (o.body) {
            o.body.allowGravity = false;
            if (o.body.setAllowGravity) o.body.setAllowGravity(false);
            if (o.body.setImmovable) o.body.setImmovable(true);
            o.body.immovable = true;
          }
          group.add(o);
          // 动态刺：判定区要跟随移动，所以用独立 sensor，并在 tween/onUpdate 时同步
          if (o.body) o.body.enable = false; // 关闭自身碰撞体，只用 sensor 做死亡判定
          attachSensor(o);
          return o;
        };
        const gatherSpikes = (layer, which) => {
          if (!layer) return;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx]);
            if (!tile) continue;
            const p = tile.props || {};
            if (!isTrue(p.death)) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            if (solidCells.has(`${col},${row}`)) continue; // 重叠在墙里的刺直接隐藏
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            if (which === "r" && isTrue(p.rmove)) spawnSpike(cx, cy, tile, 90, layer === layerThree ? this.spikesR3 : this.spikesR4);
            if (which === "l" && isTrue(p.lmove)) spawnSpike(cx, cy, tile, -90, layer === layerThree ? this.spikesL3 : this.spikesL4);
            if (which === "u" && isTrue(p.upmove)) spawnSpike(cx, cy, tile, 0, layer === layerThree ? this.spikesUp3 : this.spikesUp4);
          }
        };
        gatherSpikes(layerThree, "r");
        gatherSpikes(layerFour, "r");
        gatherSpikes(layerThree, "l");
        gatherSpikes(layerFour, "l");
        gatherSpikes(layerThree, "u");
        gatherSpikes(layerFour, "u");

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

        const mkPlayer = (x, y) => {
          const p = this.physics.add.sprite(x, y, "char_front").setOrigin(0.5, 1);
          p.setDepth(1000); // 永远显示在最上层（避免被地图 tile 覆盖导致“看不到人物”）
          p.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
          p.body.setCollideWorldBounds(true);
          p.body.setSize(p.displayWidth, p.displayHeight, false);
          p.body.setDragX(900);
          p.body.setMaxVelocity(320, 900);
          return p;
        };
        this.p1 = mkPlayer(this.spawn1.x, this.spawn1.y);
        this.p2 = mkPlayer(this.spawn2.x, this.spawn2.y);

        const addDynCollider = (p, grp) => this.physics.add.collider(p, grp, (_a, b) => b?.body?.updateFromGameObject?.());
        this.physics.add.collider(this.p1, this.solids);
        this.physics.add.collider(this.p2, this.solids);
        addDynCollider(this.p1, this.oscLR);
        addDynCollider(this.p2, this.oscLR);
        addDynCollider(this.p1, this.oscDU);
        addDynCollider(this.p2, this.oscDU);
        addDynCollider(this.p1, this.upmoveWalls);
        addDynCollider(this.p2, this.upmoveWalls);
        addDynCollider(this.p1, this.upmWalls);
        addDynCollider(this.p2, this.upmWalls);

        const respawn = (p, which) => {
          if (which === 1) {
            if (this.dead1 || this.finished) return;
            this.dead1 = true;
            p.body.setVelocity(0, 0);
            this.time.delayedCall(520, () => {
              this.dead1 = false;
              this.lastRespawnAt1 = this.time.now;
              p.setPosition(this.spawn1.x, this.spawn1.y);
              p.body.setVelocity(0, 0);
            });
          } else {
            if (this.dead2 || this.finished) return;
            this.dead2 = true;
            p.body.setVelocity(0, 0);
            this.time.delayedCall(520, () => {
              this.dead2 = false;
              this.lastRespawnAt2 = this.time.now;
              p.setPosition(this.spawn2.x, this.spawn2.y);
              p.body.setVelocity(0, 0);
            });
          }
        };

        this.physics.add.overlap(this.p1, this.deathSensors, () => {
          if (this.time.now - this.lastRespawnAt1 < this.deathInvulnMs) return;
          respawn(this.p1, 1);
        });
        this.physics.add.overlap(this.p2, this.deathSensors, () => {
          if (this.time.now - this.lastRespawnAt2 < this.deathInvulnMs) return;
          respawn(this.p2, 2);
        });

        // sensors
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

        const s1 = makeSensor(t1);
        const s2 = makeSensor(t2);
        const s3 = makeSensor(t3);
        const s4 = makeSensor(t4);
        const s5 = makeSensor(t5);
        const s6 = makeSensor(t6);
        const s7 = makeSensor(t7);
        const s8 = makeSensor(t8);

        const fastUp10 = (targets) => {
          for (const o of targets) {
            if (!o?.body) continue;
            if (o._oneShot) continue;
            o._oneShot = true;
            this.tweens.add({
              targets: o,
              y: o.y - tileH * 10,
              duration: 220,
              ease: "Sine.easeInOut",
              onUpdate: () => o.body.updateFromGameObject(),
            });
          }
        };

        const moveRightOnce = (targets, tiles, key, destroyAfter = false) => {
          oneShot(key, () => {
            for (const o of targets) {
              if (!o) continue;
              this.tweens.add({
                targets: o,
                x: o.x + tileW * tiles,
                duration: 520,
                ease: "Sine.easeInOut",
                onUpdate: () => syncSensor(o),
                onComplete: () => {
                  if (destroyAfter) {
                    o._sensor?.destroy?.();
                    o.destroy?.();
                  }
                },
              });
            }
          });
        };

        const up1WaitRight20Disappear = (targets, key) => {
          oneShot(key, () => {
            for (const o of targets) {
              if (!o) continue;
              this.tweens.add({
                targets: o,
                y: o.y - tileH * 1,
                duration: 160,
                ease: "Sine.easeInOut",
                onUpdate: () => syncSensor(o),
                onComplete: () => {
                  this.time.delayedCall(1000, () => {
                    this.tweens.add({
                      targets: o,
                      x: o.x + tileW * 20,
                      duration: 520,
                      ease: "Sine.easeInOut",
                      onUpdate: () => syncSensor(o),
                      onComplete: () => {
                        o._sensor?.destroy?.();
                        o.destroy?.();
                      },
                    });
                  });
                },
              });
            }
          });
        };

        const left6Disappear = (targets, key) => {
          oneShot(key, () => {
            for (const o of targets) {
              if (!o) continue;
              this.tweens.add({
                targets: o,
                x: o.x - tileW * 6,
                duration: 420,
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
        const flyLeftShort = (targets, tiles = 6) => {
          const dx = tileW * tiles;
          for (const o of targets) {
            if (!o?.body) continue;
            this.tweens.add({
              targets: o,
              x: o.x - dx,
              duration: 420,
              ease: "Sine.easeInOut",
              onUpdate: () => o.body.updateFromGameObject(),
              onComplete: () => {
                o.body.enable = false;
                o.destroy();
              },
            });
          }
        };

        if (s1) {
          const fn = () => oneShot("touch1", () => fastUp10(this.upmoveWalls.getChildren()));
          this.physics.add.overlap(this.p1, s1, fn);
          this.physics.add.overlap(this.p2, s1, fn);
        }
        if (s5) {
          const fn = () => oneShot("touch5", () => fastUp10(this.upmWalls.getChildren()));
          this.physics.add.overlap(this.p1, s5, fn);
          this.physics.add.overlap(this.p2, s5, fn);
        }
        if (s2) {
          const fn = () => moveRightOnce(this.spikesR3.getChildren(), 35, "touch2", false);
          this.physics.add.overlap(this.p1, s2, fn);
          this.physics.add.overlap(this.p2, s2, fn);
        }
        if (s6) {
          const fn = () => moveRightOnce(this.spikesR4.getChildren(), 35, "touch6", false);
          this.physics.add.overlap(this.p1, s6, fn);
          this.physics.add.overlap(this.p2, s6, fn);
        }
        if (s3) {
          const fn = () => up1WaitRight20Disappear(this.spikesUp3.getChildren(), "touch3");
          this.physics.add.overlap(this.p1, s3, fn);
          this.physics.add.overlap(this.p2, s3, fn);
        }
        if (s7) {
          const fn = () => up1WaitRight20Disappear(this.spikesUp4.getChildren(), "touch7");
          this.physics.add.overlap(this.p1, s7, fn);
          this.physics.add.overlap(this.p2, s7, fn);
        }
        if (s4) {
          const fn = () => left6Disappear(this.spikesL3.getChildren(), "touch4");
          this.physics.add.overlap(this.p1, s4, fn);
          this.physics.add.overlap(this.p2, s4, fn);
        }
        if (s8) {
          const fn = () => left6Disappear(this.spikesL4.getChildren(), "touch8");
          this.physics.add.overlap(this.p1, s8, fn);
          this.physics.add.overlap(this.p2, s8, fn);
        }
        // （旧逻辑）touch3/7/4/8 的实现已由上面的新规格逻辑替换

        // win: either player touches win ends level
        const winNow = () => {
          if (this.finished) return;
          this.finished = true;
          if (typeof onLevelWin === "function") onLevelWin(levelId);
        };
        this.physics.add.overlap(this.p1, this.winSensors, winNow);
        this.physics.add.overlap(this.p2, this.winSensors, winNow);

        // Controls
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

        // 掉出地图边界才重生（原先用 camera.worldView 会导致“看起来没出生/瞬间死亡”）
        const outOfMap = (p) =>
          !!p &&
          (p.x < -tileW || p.x > worldW + tileW || p.y < -tileH || p.y > worldH + tileH);
        if (!this.dead1 && outOfMap(this.p1)) {
          this.dead1 = true;
          this.p1.body.setVelocity(0, 0);
          this.time.delayedCall(520, () => {
            this.dead1 = false;
            this.lastRespawnAt1 = this.time.now;
            this.p1.setPosition(this.spawn1.x, this.spawn1.y);
            this.p1.body.setVelocity(0, 0);
          });
        }
        if (!this.dead2 && outOfMap(this.p2)) {
          this.dead2 = true;
          this.p2.body.setVelocity(0, 0);
          this.time.delayedCall(520, () => {
            this.dead2 = false;
            this.lastRespawnAt2 = this.time.now;
            this.p2.setPosition(this.spawn2.x, this.spawn2.y);
            this.p2.body.setVelocity(0, 0);
          });
        }

        // 可移动平台“载人”：人物站在平台上时，平台移动多少，人物就跟随多少（避免掉下去）
        const carryIfOn = (p, plat, dx, dy) => {
          if (!dx && !dy) return;
          if (!p?.body || !plat) return;
          const pb = p.getBounds();
          const b = plat.getBounds ? plat.getBounds() : null;
          if (!b) return;
          // 脚底接近平台顶面，并且水平有交叠
          const footY = pb.bottom;
          // 不依赖 blocked.down：平台用 tween 移动时 touching 状态会不稳定
          if (footY < b.top - 6 || footY > b.top + 18) return;
          if (pb.right < b.left + 2 || pb.left > b.right - 2) return;
          // 同步移动 sprite + body，保证形成“相对移动”
          p.x += dx;
          p.y += dy;
          p.body.x += dx;
          p.body.y += dy;
        };
        const carryFromGroup = (grp) => {
          if (!grp?.getChildren) return;
          for (const o of grp.getChildren()) {
            if (!o) continue;
            const lastX = typeof o._lastX === "number" ? o._lastX : o.x;
            const lastY = typeof o._lastY === "number" ? o._lastY : o.y;
            const dx = o.x - lastX;
            const dy = o.y - lastY;
            o._lastX = o.x;
            o._lastY = o.y;
            if (dx || dy) {
              carryIfOn(this.p1, o, dx, dy);
              carryIfOn(this.p2, o, dx, dy);
            }
          }
        };
        carryFromGroup(this.oscLR);
        carryFromGroup(this.oscDU);
        carryFromGroup(this.upmoveWalls);
        carryFromGroup(this.upmWalls);

        // 防穿墙兜底：对“用 tween 改位置”的平台，Arcade 有时会漏分离，这里每帧强制 collide 一次
        //（否则会出现：平台移动时人物穿过去/掉下去）
        try {
          this.physics.world.collide(this.p1, this.oscLR);
          this.physics.world.collide(this.p2, this.oscLR);
          this.physics.world.collide(this.p1, this.oscDU);
          this.physics.world.collide(this.p2, this.oscDU);
          this.physics.world.collide(this.p1, this.upmoveWalls);
          this.physics.world.collide(this.p2, this.upmoveWalls);
          this.physics.world.collide(this.p1, this.upmWalls);
          this.physics.world.collide(this.p2, this.upmWalls);
        } catch {}

        const step = (p, keys, isP1) => {
          const tuning = this._tuning || { speed: 300, jumpV: -920 };
          const speed = tuning.speed;
          const jumpV = tuning.jumpV;
          const mobile = isP1 && window.__PT_isMobileControl?.() === true;
          const left = keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
          const right = keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
          if (left) p.setVelocityX(-speed);
          else if (right) p.setVelocityX(speed);
          else p.setVelocityX(0);
          if (left) p.setTexture("char_left");
          else if (right) p.setTexture("char_right");
          else p.setTexture("char_front");
          const wantJump = Phaser.Input.Keyboard.JustDown(keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
          if (wantJump && (p.body.blocked.down || p.body.touching.down)) p.setVelocityY(jumpV);
        };

        if (!this.dead1) step(this.p1, this.p1Keys, true);
        else this.p1.setVelocityX(0);
        if (!this.dead2) step(this.p2, this.p2Keys, false);
        else this.p2.setVelocityX(0);

        // cleanup flying spikes
        const killOff = (grp) => {
          for (const o of grp.getChildren()) {
            if (!o?.body) continue;
            if (o.x > worldW + tileW * 2 || o.x < -tileW * 2) {
              o.body.enable = false;
              o.destroy();
            }
          }
        };
        killOff(this.spikesR3);
        killOff(this.spikesR4);
        killOff(this.spikesUp3);
        killOff(this.spikesUp4);
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

