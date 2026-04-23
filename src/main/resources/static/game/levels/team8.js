// Team-up Challenges Level 8 (double8.json)
// Exposes: window.TeamUpLevels.startTeamLevel8(ctx, levelId)
(function () {
  window.TeamUpLevels = window.TeamUpLevels || {};

  window.TeamUpLevels.startTeamLevel8 = async function startTeamLevel8(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.teamLevel8Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Team level 8 map load failed: ${e?.message || String(e)}`);
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

    // Load tilesets (tsx => tiles with props)
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
        console.warn("[team8] tileset load failed", source, e?.message || e);
      }
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Team level 8 resource load failed: TSX tileset parse failed.");
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

    const touchObj = (name) => opObjects.find((o) => propTrue(o.properties, name) || String(o.name || "").toLowerCase() === String(name).toLowerCase()) || null;
    const t0 = touchObj("t") || touchObj("touch");
    const t1 = touchObj("t1");
    const t2 = touchObj("t2");
    const t3 = touchObj("t3");
    const t4 = touchObj("t4");
    const t5 = touchObj("t5");
    const t6 = touchObj("t6");
    const t7 = touchObj("t7");
    const t8 = touchObj("t8");
    const t9 = touchObj("t9");
    const t10 = touchObj("t10");
    const t11 = touchObj("t11");
    const t12 = touchObj("t12");
    const t13 = touchObj("t13");
    const t14 = touchObj("t14");

    // Build imageToKey
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
      const url = new URL(`../../map/${f}`, mapBase).toString();
      if (!imageToKey.has(url)) imageToKey.set(url, `map_${f.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`);
    }
    const imgKeyByFile = (fileName) => {
      const url = new URL(`../../map/${fileName}`, mapBase).toString();
      return imageToKey.get(url) || null;
    };

    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    // Born points
    const born1Obj = opObjects.find((o) => propTrue(o.properties, "born1") || propTrue(o.properties, "bron1")) || null;
    const born2Obj = opObjects.find((o) => propTrue(o.properties, "born2") || propTrue(o.properties, "bron2")) || null;

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
        this.deathInvulnMs = 650;
        this.lastRespawnAt1 = -1e9;
        this.lastRespawnAt2 = -1e9;
        this.triggered = new Set();

        this._tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = this._tuning.gravityY;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        const freezeObj = (o, immovable = true) => {
          if (!o?.body) return;
          if (o.setAllowGravity) o.setAllowGravity(false);
          o.body.allowGravity = false;
          o.body.moves = false;
          if (immovable) {
            if (o.setImmovable) o.setImmovable(true);
            o.body.immovable = true;
            if (o.body.setImmovable) o.body.setImmovable(true);
          }
          if (o.setVelocity) o.setVelocity(0, 0);
          if (o.body.setVelocity) o.body.setVelocity(0, 0);
        };

        const spawnImageOrRect = (cx, cy, w, h, key, depth = 20) => {
          if (!key) {
            const r = this.add.rectangle(cx, cy, w, h, 0xff00ff, 0.25).setDepth(depth);
            this.physics.add.existing(r);
            return r;
          }
          const img = this.physics.add.image(cx, cy, key);
          img.setDisplaySize(w, h);
          img.setDepth(depth);
          return img;
        };

        const toSpawn = (o, fallback) => {
          if (!o) return fallback;
          return { x: o.x + (o.width || tileW) / 2, y: o.y - Math.max(6, Math.min(tileH * 0.6, (o.height || tileH) * 0.6)) };
        };

        const drawStatic = (cx, cy, key) => {
          const img = this.add.image(cx - tileW / 2, cy + tileH / 2, key).setOrigin(0, 1);
          img.setDisplaySize(tileW, tileH);
          img.setDepth(2);
        };

        // Solid groups (selective disappearance)
        this.solidL1 = this.physics.add.group(); // initially hidden until t14
        this.solidL3 = this.physics.add.group();
        this.solidL4 = this.physics.add.group();
        this.solidL5 = this.physics.add.group();
        this.solidL6 = this.physics.add.group();
        this.solidL7 = this.physics.add.group();
        this.solidsOther = this.physics.add.staticGroup();

        // Vanish groups
        this.vanish1L4 = this.physics.add.group();
        this.vanish1L6 = this.physics.add.group();
        this.vanish1L7 = this.physics.add.group();
        this.vanish2L4 = this.physics.add.group();
        this.vanish2L6 = this.physics.add.group();

        // Move groups
        this.moveL4 = this.physics.add.group();
        this.moveL6 = this.physics.add.group();
        this.move1L6 = this.physics.add.group();
        this.move2L4 = this.physics.add.group();
        this.move2L6 = this.physics.add.group();

        // b1/r1 (layer3 disappear)
        this.b1_3 = this.physics.add.group();
        this.r1_3 = this.physics.add.group();

        // Death hazards
        this.death1 = this.physics.add.group(); // always deadly (layer3 death1)
        this.death = this.physics.add.group(); // layer1 death, enable at t4

        // Win sensors (layer3 bluewin/redwin)
        this.blueWinRects = [];
        this.redWinRects = [];

        // Scan tiles
        for (const layer of tileLayers) {
          const lname = String(layer.name || "");
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const gid = data[idx] || 0;
            const tile = resolveTileFromGid(gid);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            const url = tile.imageSource ? resolveTilesetImageUrl(tile.imageSource, mapBase) : null;
            const key = url ? imageToKey.get(url) : null;

            const isSolid = p.solid === true;
            const isDeath = p.death === true;
            const isDeath1 = p.death1 === true;
            const isVanish1 = p.vanish1 === true;
            const isVanish2 = p.vanish2 === true;
            const isMove = p.move === true;
            const isMove1 = p.move1 === true;
            const isMove2 = p.move2 === true;
            const isB1 = p.b1 === true;
            const isR1 = p.r1 === true;
            const isBlueWin = p.bluewin === true || p.bluewin1 === true;
            const isRedWin = p.redwin === true || p.redwin1 === true;

            // Win
            if (lname === "3" && isBlueWin) {
              const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0x0000ff, 0);
              this.physics.add.existing(s, true);
              this.blueWinRects.push(s);
              continue;
            }
            if (lname === "3" && isRedWin) {
              const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0xff0000, 0);
              this.physics.add.existing(s, true);
              this.redWinRects.push(s);
              continue;
            }

            // death1 deadly always
            if (lname === "3" && isDeath1) {
              const o = spawnImageOrRect(cx, cy, tileW * 2, tileH / 2, key || imgKeyByFile("trap.png"), 35);
              freezeObj(o, true);
              o.setVisible(true);
              if (o.body) o.body.enable = true;
              this.death1.add(o);
              continue;
            }

            // death (layer1) hidden until t4
            if (lname === "1" && isDeath) {
              const o = spawnImageOrRect(cx, cy, tileW * 2, tileH / 2, key || imgKeyByFile("trap.png"), 35);
              freezeObj(o, true);
              o.setVisible(false);
              if (o.body) o.body.enable = false;
              this.death.add(o);
              continue;
            }

            // b1/r1 on layer3
            if (lname === "3" && isB1) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
              freezeObj(o, true);
              this.b1_3.add(o);
              continue;
            }
            if (lname === "3" && isR1) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
              freezeObj(o, true);
              this.r1_3.add(o);
              continue;
            }

            // Vanish blocks
            if (isVanish1) {
              if (lname === "4") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
                freezeObj(o, true);
                this.vanish1L4.add(o);
                continue;
              }
              if (lname === "6") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
                freezeObj(o, true);
                this.vanish1L6.add(o);
                continue;
              }
              if (lname === "7") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
                freezeObj(o, true);
                this.vanish1L7.add(o);
                continue;
              }
            }
            if (isVanish2) {
              if (lname === "4") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall2.png"), 22);
                freezeObj(o, true);
                this.vanish2L4.add(o);
                continue;
              }
              if (lname === "6") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall2.png"), 22);
                freezeObj(o, true);
                this.vanish2L6.add(o);
                continue;
              }
            }

            // Move platforms
            if (isMove) {
              if (lname === "4") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
                freezeObj(o, true);
                this.moveL4.add(o);
                continue;
              }
              if (lname === "6") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
                freezeObj(o, true);
                this.moveL6.add(o);
                continue;
              }
            }
            if (isMove1 && lname === "6") {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
              freezeObj(o, true);
              this.move1L6.add(o);
              continue;
            }
            if (isMove2) {
              if (lname === "4") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
                freezeObj(o, true);
                this.move2L4.add(o);
                continue;
              }
              if (lname === "6") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
                freezeObj(o, true);
                this.move2L6.add(o);
                continue;
              }
            }

            // Solids (by layer)
            if (isSolid) {
              if (lname === "1") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 15);
                freezeObj(o, true);
                o.setVisible(false);
                if (o.body) o.body.enable = false;
                this.solidL1.add(o);
                continue;
              }
              if (lname === "3") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 15);
                freezeObj(o, true);
                this.solidL3.add(o);
                continue;
              }
              if (lname === "4") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 15);
                freezeObj(o, true);
                this.solidL4.add(o);
                continue;
              }
              if (lname === "5") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 15);
                freezeObj(o, true);
                this.solidL5.add(o);
                continue;
              }
              if (lname === "6") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 15);
                freezeObj(o, true);
                this.solidL6.add(o);
                continue;
              }
              if (lname === "7") {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 15);
                freezeObj(o, true);
                this.solidL7.add(o);
                continue;
              }

              // others
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 15);
              freezeObj(o, true);
              this.solidsOther.add(o);
              continue;
            }

            // Decorative render for non-solid tiles
            if (key) {
              drawStatic(cx, cy, key);
            }
          }
        }

        // Oscillate moving platforms (x)
        const dx = tileW * 2;
        const tweenOscX = (grp) => {
          for (const o of grp.getChildren()) {
            this.tweens.add({
              targets: o,
              x: o.x + dx,
              duration: 520,
              ease: "Sine.easeInOut",
              yoyo: true,
              repeat: -1,
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        };
        tweenOscX(this.moveL4);
        tweenOscX(this.moveL6);
        tweenOscX(this.move1L6);
        tweenOscX(this.move2L4);
        tweenOscX(this.move2L6);

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
        this.p2Spawn = toSpawn(born2Obj, { x: tileW * 3, y: worldH - tileH * 3 });
        this.p1 = mkPlayer(this.p1Spawn.x, this.p1Spawn.y, 0x93c5fd);
        this.p2 = mkPlayer(this.p2Spawn.x, this.p2Spawn.y, 0xfca5a5);

        this.respawnPlayer = (player) => {
          const isP1 = player === this.p1;
          const sp = isP1 ? this.p1Spawn : this.p2Spawn;
          player.setPosition(sp.x, sp.y);
          player.body.setVelocity(0, 0);
          if (isP1) this.lastRespawnAt1 = this.time.now;
          else this.lastRespawnAt2 = this.time.now;
        };

        // Colliders (solids & movers & vanish blocks)
        const collideGrp = (grp) => {
          this.physics.add.collider(this.p1, grp);
          this.physics.add.collider(this.p2, grp);
        };
        for (const grp of [this.solidL1, this.solidL3, this.solidL4, this.solidL5, this.solidL6, this.solidL7, this.solidsOther]) collideGrp(grp);
        for (const grp of [this.vanish1L4, this.vanish1L6, this.vanish1L7, this.vanish2L4, this.vanish2L6]) collideGrp(grp);
        for (const grp of [this.b1_3, this.r1_3]) collideGrp(grp);
        for (const grp of [this.moveL4, this.moveL6, this.move1L6, this.move2L4, this.move2L6]) collideGrp(grp);

        // Deadly overlaps
        const hitDeadly = (player) => {
          const isP1 = player === this.p1;
          const last = isP1 ? this.lastRespawnAt1 : this.lastRespawnAt2;
          if (this.time.now - last < this.deathInvulnMs) return;
          this.respawnPlayer(player);
        };
        this.physics.add.overlap(this.p1, this.death1, () => hitDeadly(this.p1));
        this.physics.add.overlap(this.p2, this.death1, () => hitDeadly(this.p2));
        this.physics.add.overlap(this.p1, this.death, () => hitDeadly(this.p1));
        this.physics.add.overlap(this.p2, this.death, () => hitDeadly(this.p2));

        // Sensors
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
        const s10 = makeSensor(t10);
        const s11 = makeSensor(t11);
        const s12 = makeSensor(t12);
        const s13 = makeSensor(t13);
        const s14 = makeSensor(t14);

        const destroyGrp = (grp) => {
          if (!grp?.getChildren) return;
          for (const o of grp.getChildren()) o?.destroy?.();
        };

        // Touch actions (strict)
        hook(s0, "t0", () => {
          const dy = tileH * 2;
          for (const o of this.death1.getChildren()) {
            if (!o?.body) continue;
            this.tweens.add({
              targets: o,
              y: o.y - dy,
              duration: 520,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });
        hook(s1, "t1", () => destroyGrp(this.move2L6));
        hook(s2, "t2", () => destroyGrp(this.vanish1L4));
        hook(s3, "t3", () => destroyGrp(this.vanish2L4));
        hook(s4, "t4", () => {
          for (const o of this.death.getChildren()) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });
        hook(s5, "t5", () => destroyGrp(this.vanish1L6));
        hook(s6, "t6", () => destroyGrp(this.vanish2L6));
        hook(s7, "t7", () => destroyGrp(this.vanish1L7));
        hook(s8, "t8", () => {
          destroyGrp(this.r1_3);
          destroyGrp(this.solidL5);
        });
        hook(s9, "t9", () => {
          destroyGrp(this.b1_3);
          destroyGrp(this.move2L4);
        });
        hook(s10, "t10", () => {
          destroyGrp(this.r1_3);
          destroyGrp(this.moveL4);
        });
        hook(s11, "t11", () => {
          destroyGrp(this.b1_3);
          destroyGrp(this.solidL4);
        });
        hook(s12, "t12", () => destroyGrp(this.moveL6));
        hook(s13, "t13", () => destroyGrp(this.move1L6));
        hook(s14, "t14", () => {
          for (const o of this.solidL1.getChildren()) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });

        // Inputs
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
        if (this.finished) return;
        if (!this.p1?.body || !this.p2?.body) return;

        this._p1InBlue = false;
        this._p2InRed = false;
        const pb1 = this.p1.getBounds();
        const pb2 = this.p2.getBounds();

        for (const s of this.blueWinRects) {
          if (Phaser.Geom.Intersects.RectangleToRectangle(pb1, s.getBounds())) {
            this._p1InBlue = true;
            break;
          }
        }
        for (const s of this.redWinRects) {
          if (Phaser.Geom.Intersects.RectangleToRectangle(pb2, s.getBounds())) {
            this._p2InRed = true;
            break;
          }
        }

        if (this._p1InBlue && this._p2InRed) {
          this.finished = true;
          if (typeof onLevelWin === "function") onLevelWin(levelId, { title: "合作完成", message: "两人同时到达终点！" });
          return;
        }

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

        // Relative movement for moving platforms
        window.PTLevelShared?.carryPlayersOnMovingObjects?.(this, [this.p1, this.p2], [this.moveL4, this.moveL6, this.move1L6, this.move2L4, this.move2L6]);
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

