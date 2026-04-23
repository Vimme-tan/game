// Team-up Challenges Level 3 (double-player cooperation)
// Exposes: window.TeamUpLevels.startTeamLevel3(ctx, levelId)
(function () {
  window.TeamUpLevels = window.TeamUpLevels || {};

  window.TeamUpLevels.startTeamLevel3 = async function startTeamLevel3(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.teamLevel3Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Team level 3 map load failed: ${e?.message || String(e)}`);
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

    const resolveTilesetImageUrl = (imageSource, baseUrl) => window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ?? null;

    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);

    const tilesetInfos = [];
    for (const ts of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(ts.firstgid || 1);
      const source = ts.source;
      if (!source) continue;
      try {
        const tsxText = await fetchTsxText(source, mapBase);
        const parsed = parseTsx(tsxText);
        tilesetInfos.push({ firstgid, source, ...parsed });
      } catch (e) {
        console.warn("[team3] tileset load failed", source, e?.message || e);
      }
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Team level 3 resource load failed: TSX tileset parse failed.");
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
      if (!tile) return { tileset: chosen, tileId, imageSource: null, props: {} };
      return { ...tile, tileset: chosen, tileId };
    }

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const opLayer = allLayers.find((l) => l && l.type === "objectgroup" && String(l.name || "").toLowerCase() === "op");
    const opObjects = Array.isArray(opLayer?.objects) ? opLayer.objects : [];

    const born1Obj = opObjects.find((o) => propTrue(o.properties, "born1") || propTrue(o.properties, "bron1")) || null;
    const born2Obj = opObjects.find((o) => propTrue(o.properties, "born2") || propTrue(o.properties, "bron2")) || null;
    const touchObj = (name) =>
      opObjects.find((o) => propTrue(o.properties, name) || String(o.name || "").toLowerCase() === name) || null;

    const t0 = touchObj("touch");
    const t1 = touchObj("touch1");
    const t2 = touchObj("touch2");
    const t3 = touchObj("touch3");
    const t4 = touchObj("touch4");
    const t5 = touchObj("touch5");
    const t6 = touchObj("touch6");
    const t7 = touchObj("touch7");
    const t8 = touchObj("touch8");
    const t9 = touchObj("touch9");

    function toSpawn(o, fallback) {
      if (!o) return fallback;
      return {
        x: o.x + (o.width || tileW) / 2,
        y: o.y - Math.max(6, Math.min(tileH * 0.6, (o.height || tileH) * 0.6)),
      };
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

    const EXTRA_MAP_IMAGES = ["earthWall.png", "earthWall2.png", "trap.png", "bombStroked.png", "doorRedStroked.png", "doorStroked.png", "grey.png"];
    for (const f of EXTRA_MAP_IMAGES) {
      const url = window.PTLevelShared?.resolveTilesetImageUrl?.(f, mapBase);
      if (url && !imageToKey.has(url)) imageToKey.set(url, `map_${f.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`);
    }
    const imgKeyByFile = (fileName) => {
      const url = window.PTLevelShared?.resolveTilesetImageUrl?.(fileName, mapBase);
      return url ? imageToKey.get(url) || null : null;
    };

    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    const scene = {
      preload: function () {
        this.load.on("loaderror", (file) => console.warn("loaderror:", file?.key, file?.src));
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

        const layerByName = (n) => tileLayers.find((l) => String(l.name || "").toLowerCase() === String(n)) || null;
        const layer1 = layerByName("1");
        const layer2 = layerByName("2");
        const layer3 = layerByName("3");
        const layer4 = layerByName("4");
        const layersInOrder = [layer1, layer2, layer3, layer4].filter(Boolean);

        this.solids = this.physics.add.staticGroup();
        this.deadlyStatic = this.physics.add.staticGroup();
        this.deadlyDynamic = this.physics.add.group();

        // special tiles (spawned as objects so they can be shown/hidden/moved)
        this.layer1Death = [];
        this.layer1Bomb = [];
        this.winBlue = [];
        this.winRed = [];
        this.emptyGroup = this.physics.add.staticGroup(); // empty / empty1 / empty3
        this.empty2Group = this.physics.add.staticGroup(); // empty2
        this.empty4Group = this.physics.add.staticGroup(); // empty4
        this.death1Objs = [];
        this.death2Objs = [];
        this.moveBlocks = [];

        const drawStatic = (col, row, tile, p) => {
          const cx = col * tileW + tileW / 2;
          const cy = row * tileH + tileH / 2;
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (!key) {
            this.add.rectangle(cx, cy, tileW, tileH, 0x000000, 0.05);
            return;
          }
          const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
          // 要求：所有带有 death2 的属性图像隐藏
          if (p.death2 === true) {
            img.setVisible(false);
            return;
          }
          const isWin = p.bluewin1 === true || p.redwin1 === true;
          const isBomb = p.bomb1 === true || p.bomb === true;
          const isTrap = p.death === true || p.death1 === true || p.death2 === true || p.death3 === true || p.death4 === true;
          if (isWin) img.setDisplaySize(tileW * 2, tileH * 2);
          else if (isBomb) img.setDisplaySize(tileW * 1.2, tileH * 1.6);
          else if (isTrap) img.setDisplaySize(tileW * 2, tileH / 2);
          else img.setDisplaySize(tileW, tileH);
        };

        // Spawn helpers for object tiles (with physics)
        const spawnImageOrRect = (cx, cy, w, h, key, depth = 15) => {
          if (!key) {
            const r = this.add.rectangle(cx, cy, w, h, 0xff00ff, 0.2).setDepth(depth);
            this.physics.add.existing(r);
            return r;
          }
          const img = this.physics.add.image(cx, cy, key);
          img.setDisplaySize(w, h);
          img.setDepth(depth);
          return img;
        };

        const freezeObj = (o, immovable = true) => {
          if (!o?.body) return;
          if (o.setAllowGravity) o.setAllowGravity(false);
          o.body.allowGravity = false;
          o.body.moves = false;
          if (o.body.setAllowGravity) o.body.setAllowGravity(false);
          if (immovable) {
            if (o.setImmovable) o.setImmovable(true);
            o.body.immovable = true;
            if (o.body.setImmovable) o.body.setImmovable(true);
          }
          if (o.setVelocity) o.setVelocity(0, 0);
          if (o.body.setVelocity) o.body.setVelocity(0, 0);
        };

        const trapW = tileW * 2;
        const trapH = tileH / 2;
        const winW = tileW * 2;
        const winH = tileH * 2;

        // Scan all layers: render most tiles as static images + solids; special tiles become objects.
        for (const layer of layersInOrder) {
          const layerName = String(layer.name || "");
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            const isLayer1 = layerName === "1";
            const isLayer3 = layerName === "3";
            const isLayer4 = layerName === "4";

            const isEmpty = p.empty === true || p.empty1 === true || p.empty3 === true;
            const isEmpty2 = p.empty2 === true;
            const isEmpty4 = p.empty4 === true;
            const isMove = p.move === true;
            const isDeathGeneric = p.death === true;
            const isDeath1 = p.death1 === true;
            const isDeath2 = p.death2 === true;
            const isBomb = p.bomb1 === true || p.bomb === true || p.bomb2 === true;
            const isWin1 = p.bluewin1 === true || p.redwin1 === true;

            // layer 4 empties must be removable; spawn as separate objects (so we can destroy).
            if (isLayer4 && (isEmpty || isEmpty2 || isEmpty4)) {
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              let key = url ? imageToKey.get(url) : null;
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key, 40);
              this.physics.add.existing(o, true);
              if (isEmpty4) this.empty4Group.add(o);
              else if (isEmpty2) this.empty2Group.add(o);
              else this.emptyGroup.add(o);
              continue;
            }

            // layer 3 death tiles exist, but only become active after touch1/touch4.
            if (isLayer3 && isDeathGeneric) {
              // Render static now, but defer deadly sensor enable.
              drawStatic(col, row, tile, p);
              const s = this.add.rectangle(cx, cy, trapW, trapH, 0xff0000, 0);
              this.physics.add.existing(s, true);
              s._deferEnable = true;
              s._enabled = false;
              s._key = "death_generic";
              s.body.enable = false;
              this.deadlyStatic.add(s);
              continue;
            }

            // death1 / death2 are moving on trigger (layer3). Spawn as dynamic (frozen).
            if (isLayer3 && (isDeath1 || isDeath2)) {
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              const key = url ? imageToKey.get(url) : null;
              const o = spawnImageOrRect(cx, cy, trapW, trapH, key, 35);
              if (isDeath2) o.setVisible(false);
              freezeObj(o, true);
              this.deadlyDynamic.add(o);
              if (isDeath1) this.death1Objs.push(o);
              if (isDeath2) this.death2Objs.push(o);
              continue;
            }

            // move blocks in layer3
            if (isLayer3 && isMove) {
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              const key = url ? imageToKey.get(url) : null;
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key, 28);
              freezeObj(o, true);
              this.moveBlocks.push(o);
              continue;
            }

            // layer1: death appears on touch; bomb appears on touch3; win1 appears on touch9
            if (isLayer1 && (isDeathGeneric || isBomb || isWin1)) {
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              let key = url ? imageToKey.get(url) : null;
              let w = tileW,
                h = tileH;
              if (isDeathGeneric) {
                w = trapW;
                h = trapH;
              } else if (isWin1) {
                w = winW;
                h = winH;
              } else if (isBomb) {
                // Prefer bomb image even if tileset points elsewhere.
                const k2 = imgKeyByFile("bombStroked.png");
                if (k2) key = k2;
                w = tileW * 1.2;
                h = tileH * 1.6;
              }
              const o = spawnImageOrRect(cx, cy, w, h, key, 45);
              freezeObj(o, true);
              o.setVisible(false);
              if (o.body) o.body.enable = false;
              if (isDeathGeneric) this.layer1Death.push(o);
              else if (isBomb) this.layer1Bomb.push(o);
              else if (p.bluewin1 === true) this.winBlue.push(o);
              else if (p.redwin1 === true) this.winRed.push(o);
              continue;
            }

            // normal render + solids (use property solid)
            drawStatic(col, row, tile, p);
            if (p.solid === true) addStaticRect(this.solids, cx, cy);
          }
        }

        // Make move blocks collidable (treat as solids)
        for (const o of this.moveBlocks) {
          if (!o?.body) continue;
          o.body.setSize(tileW, tileH);
          o.body.setOffset(-tileW / 2, -tileH / 2);
        }

        // Players
        const mkPlayer = (x, y, tint) => {
          const p = this.physics.add.sprite(x, y, "char_front").setOrigin(0.5, 1);
          p.setTint(tint);
          p.setDisplaySize(tileW * 0.55 * 2, tileH * 0.85 * 2);
          p.body.setCollideWorldBounds(true);
          p.body.setSize(p.displayWidth, p.displayHeight, false);
          p.body.setDragX(900);
          p.body.setMaxVelocity(320, 900);
          return p;
        };
        this.p1Spawn = toSpawn(born1Obj, { x: tileW * 2, y: worldH - tileH * 3 });
        this.p2Spawn = toSpawn(born2Obj, { x: tileW * 3.2, y: worldH - tileH * 3 });
        this.p1 = mkPlayer(this.p1Spawn.x, this.p1Spawn.y, 0x93c5fd);
        this.p2 = mkPlayer(this.p2Spawn.x, this.p2Spawn.y, 0xfca5a5);

        const respawnPlayer = (player) => {
          if (!player?.body) return;
          const isP1 = player === this.p1;
          const sp = isP1 ? this.p1Spawn : this.p2Spawn;
          player.setPosition(sp.x, sp.y);
          player.body.setVelocity(0, 0);
          if (isP1) this.lastRespawnAt1 = this.time.now;
          else this.lastRespawnAt2 = this.time.now;
        };
        this.respawnPlayer = respawnPlayer;

        // Colliders
        this.physics.add.collider(this.p1, this.solids);
        this.physics.add.collider(this.p2, this.solids);
        this.physics.add.collider(this.p1, this.emptyGroup);
        this.physics.add.collider(this.p2, this.emptyGroup);
        this.physics.add.collider(this.p1, this.empty2Group);
        this.physics.add.collider(this.p2, this.empty2Group);
        this.physics.add.collider(this.p1, this.empty4Group);
        this.physics.add.collider(this.p2, this.empty4Group);
        for (const m of this.moveBlocks) {
          this.physics.add.collider(this.p1, m);
          this.physics.add.collider(this.p2, m);
        }

        const hitDeadly = (player) => {
          const isP1 = player === this.p1;
          const last = isP1 ? this.lastRespawnAt1 : this.lastRespawnAt2;
          if (this.time.now - last < this.deathInvulnMs) return;
          respawnPlayer(player);
        };
        this.physics.add.overlap(this.p1, this.deadlyStatic, () => hitDeadly(this.p1));
        this.physics.add.overlap(this.p2, this.deadlyStatic, () => hitDeadly(this.p2));
        this.physics.add.overlap(this.p1, this.deadlyDynamic, () => hitDeadly(this.p1));
        this.physics.add.overlap(this.p2, this.deadlyDynamic, () => hitDeadly(this.p2));
        for (const o of this.layer1Death) {
          this.physics.add.overlap(this.p1, o, () => hitDeadly(this.p1));
          this.physics.add.overlap(this.p2, o, () => hitDeadly(this.p2));
        }
        for (const o of this.layer1Bomb) {
          this.physics.add.overlap(this.p1, o, () => hitDeadly(this.p1));
          this.physics.add.overlap(this.p2, o, () => hitDeadly(this.p2));
        }

        // Sensors from op objects
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
        const hook = (sensor, key, fn) => {
          if (!sensor) return;
          const fire = () => oneShot(key, fn);
          this.physics.add.overlap(this.p1, sensor, fire);
          this.physics.add.overlap(this.p2, sensor, fire);
        };

        const s0 = makeSensor(t0);
        const s1 = makeSensor(t1);
        const s2 = makeSensor(t2);
        const s3 = makeSensor(t3);
        const s4 = makeSensor(t4);
        const s5 = makeSensor(t5);
        const s6 = makeSensor(t6);
        const s7 = makeSensor(t7);
        const s8 = makeSensor(t8);
        const s9 = makeSensor(t9);

        // touch: layer1 death appears
        hook(s0, "touch", () => {
          for (const o of this.layer1Death) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });

        // touch1: layer4 empty disappears; enable layer3 death (generic)
        hook(s1, "touch1", () => {
          for (const o of this.emptyGroup.getChildren()) o.destroy();
          for (const o of this.deadlyStatic.getChildren()) {
            if (o._deferEnable) o.body.enable = true;
          }
        });

        // touch2: death1 up 1 tile and deadly (already deadly)
        hook(s2, "touch2", () => {
          for (const o of this.death1Objs) {
            this.tweens.add({
              targets: o,
              y: o.y - tileH,
              duration: 220,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });

        // touch3: bomb appears (layer1 bomb1)
        hook(s3, "touch3", () => {
          for (const o of this.layer1Bomb) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });

        // touch4: layer4 empty2 disappears; enable layer3 death (generic)
        hook(s4, "touch4", () => {
          for (const o of this.empty2Group.getChildren()) o.destroy();
          for (const o of this.deadlyStatic.getChildren()) {
            if (o._deferEnable) o.body.enable = true;
          }
        });

        // touch5: death2 up 1 tile
        hook(s5, "touch5", () => {
          for (const o of this.death2Objs) {
            this.tweens.add({
              targets: o,
              y: o.y - tileH,
              duration: 220,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });

        const moveDx = tileW * 41;
        // touch6: move blocks right 41
        hook(s6, "touch6", () => {
          for (const o of this.moveBlocks) {
            this.tweens.add({
              targets: o,
              x: o.x + moveDx,
              duration: 1100,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });
        // touch7: move blocks left 41
        hook(s7, "touch7", () => {
          for (const o of this.moveBlocks) {
            this.tweens.add({
              targets: o,
              x: o.x - moveDx,
              duration: 1100,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });

        // touch8: empty4 disappears
        hook(s8, "touch8", () => {
          for (const o of this.empty4Group.getChildren()) o.destroy();
        });

        // touch9: win tiles appear; win requires P1 in bluewin1 AND P2 in redwin1 simultaneously
        hook(s9, "touch9", () => {
          for (const o of [...this.winBlue, ...this.winRed]) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });

        // Overlap flags for win
        this.p1InBlue = false;
        this.p2InRed = false;
        const mkWinSensor = (o, kind) => {
          if (!o) return;
          const s = this.add.rectangle(o.x, o.y, winW, winH, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          s.setVisible(false);
          s.body.enable = false;
          s._kind = kind;
          return s;
        };
        this.blueSensor = mkWinSensor(this.winBlue[0], "blue");
        this.redSensor = mkWinSensor(this.winRed[0], "red");
        if (this.blueSensor) {
          this.physics.add.overlap(this.p1, this.blueSensor, () => (this.p1InBlue = true));
          this.physics.add.overlap(this.p2, this.blueSensor, () => {});
        }
        if (this.redSensor) {
          this.physics.add.overlap(this.p2, this.redSensor, () => (this.p2InRed = true));
          this.physics.add.overlap(this.p1, this.redSensor, () => {});
        }

        // Inputs (settings)
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

        // win sensors follow win tiles + enable when tiles visible
        if (this.blueSensor && this.winBlue[0]) {
          this.blueSensor.setPosition(this.winBlue[0].x, this.winBlue[0].y);
          const en = this.winBlue[0].visible === true;
          this.blueSensor.setVisible(false);
          this.blueSensor.body.enable = en;
        }
        if (this.redSensor && this.winRed[0]) {
          this.redSensor.setPosition(this.winRed[0].x, this.winRed[0].y);
          const en = this.winRed[0].visible === true;
          this.redSensor.setVisible(false);
          this.redSensor.body.enable = en;
        }

        // recompute win flags per frame
        this.p1InBlue = false;
        this.p2InRed = false;
        if (this.blueSensor?.body?.enable) {
          if (Phaser.Geom.Intersects.RectangleToRectangle(this.p1.getBounds(), this.blueSensor.getBounds())) this.p1InBlue = true;
        }
        if (this.redSensor?.body?.enable) {
          if (Phaser.Geom.Intersects.RectangleToRectangle(this.p2.getBounds(), this.redSensor.getBounds())) this.p2InRed = true;
        }
        if (this.p1InBlue && this.p2InRed) {
          this.finished = true;
          if (typeof onLevelWin === "function") onLevelWin(levelId, { title: "合作完成", message: "两人同时到达终点！" });
          return;
        }

        // viewport boundary death -> respawn
        const vb = this.cameras.main.worldView;
        const hitVb = (b) => b.bottom >= vb.bottom - 2 || b.top <= vb.top + 2 || b.left <= vb.left + 2 || b.right >= vb.right - 2;
        if (hitVb(this.p1.getBounds())) this.respawnPlayer(this.p1);
        if (hitVb(this.p2.getBounds())) this.respawnPlayer(this.p2);

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

        step(this.p1, this.p1Keys, true);
        step(this.p2, this.p2Keys, false);

        // Relative movement: carry players standing on moving blocks.
        window.PTLevelShared?.carryPlayersOnMovingObjects?.(this, [this.p1, this.p2], [{ getChildren: () => this.moveBlocks || [] }]);

        // cleanup: destroy moved death objects if way off-map (safety)
        for (const o of this.deadlyDynamic.getChildren()) {
          if (!o) continue;
          if (o.x < -tileW * 4 || o.x > worldW + tileW * 4 || o.y < -tileH * 4 || o.y > worldH + tileH * 4) {
            o.destroy();
          }
        }
      },
    };

    const vp = window.__PT_getGameViewport
      ? window.__PT_getGameViewport()
      : { width: Math.min(1400, Math.max(900, window.innerWidth - 80)), height: Math.min(900, Math.max(650, window.innerHeight - 200)) };

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

