// Team-up Challenges Level 7 (double7.json)
// Exposes: window.TeamUpLevels.startTeamLevel7(ctx, levelId)
(function () {
  window.TeamUpLevels = window.TeamUpLevels || {};

  window.TeamUpLevels.startTeamLevel7 = async function startTeamLevel7(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.teamLevel7Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Team level 7 map load failed: ${e?.message || String(e)}`);
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

    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);
    const resolveTilesetImageUrl = (imageSource, baseUrl) => window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ?? null;
    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

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
        console.warn("[team7] tileset load failed", source, e?.message || e);
      }
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Team level 7 resource load failed: TSX tileset parse failed.");
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
      opObjects.find((o) => propTrue(o.properties, name) || String(o.name || "").toLowerCase() === String(name).toLowerCase()) || null;

    // touches
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

    const EXTRA_MAP_IMAGES = ["earthWall.png", "earthWall2.png", "trap.png", "doorRedStroked.png", "doorStroked.png", "grey.png"];
    for (const f of EXTRA_MAP_IMAGES) {
      const url = new URL(`../map/${f}`, mapBase).toString();
      if (!imageToKey.has(url)) imageToKey.set(url, `map_${f.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`);
    }
    const imgKeyByFile = (fileName) => {
      const url = new URL(`../map/${fileName}`, mapBase).toString();
      return imageToKey.get(url) || null;
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

        const freezeObj = (o, immovable = true) => {
          if (!o?.body) return;
          if (o.setAllowGravity) o.setAllowGravity(false);
          o.body.allowGravity = false;
          if (immovable) {
            if (o.setImmovable) o.setImmovable(true);
            o.body.immovable = true;
            if (o.body.setImmovable) o.body.setImmovable(true);
          }
          if (o.setVelocity) o.setVelocity(0, 0);
          if (o.body.setVelocity) o.body.setVelocity(0, 0);
        };

        // Groups
        this.solids = this.physics.add.staticGroup();

        // Layer4 solids to disappear
        this.layer4Solid = this.physics.add.staticGroup();

        // Layer4/5 vanish1/vanish2
        this.vanish1_4 = this.physics.add.staticGroup();
        this.vanish1_5 = this.physics.add.staticGroup();
        this.vanish2_4 = this.physics.add.staticGroup();
        this.vanish2_5 = this.physics.add.staticGroup();

        // Layer4 empty / empty1 to disappear
        this.empty_4 = this.physics.add.staticGroup();
        this.empty1_4 = this.physics.add.staticGroup();

        // Layer3 b/r to disappear
        this.b_3 = this.physics.add.staticGroup();
        this.r_3 = this.physics.add.staticGroup();

        // Death hazards
        this.death = this.physics.add.staticGroup(); // property death (enabled at touch1/touch5)
        this.death1 = this.physics.add.staticGroup(); // property death1 (enabled at touch2)

        // Controls / Move platforms
        this.layer1Move = this.physics.add.group(); // move on layer1 (appear at touch3, then up at touch9)
        this.move = this.physics.add.group(); // move on layer4
        this.move1 = this.physics.add.group(); // move1 on layer4/5
        this.move2 = this.physics.add.group(); // move2 on layer4 (disappear at touch5)
        this.move5 = this.physics.add.group(); // move on layer5 (optional)

        // Win rectangles (always on)
        this.blueWinRects = [];
        this.redWinRects = [];

        const drawStatic = (cx, cy, key, w = tileW, h = tileH) => {
          if (!key) return;
          const img = this.add.image(cx - tileW / 2, cy + tileH / 2, key).setOrigin(0, 1);
          img.setDisplaySize(w, h);
          img.setDepth(5);
        };

        // Scan layers and spawn
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
            const key = tile.imageSource ? imageToKey.get(resolveTilesetImageUrl(tile.imageSource, mapBase)) || null : null;

            const isLayer1 = lname === "1";
            const isLayer3 = lname === "3";
            const isLayer4 = lname === "4";
            const isLayer5 = lname === "5";

            const isSolid = p.solid === true;
            const isDeath = p.death === true;
            const isDeath1 = p.death1 === true;
            const isVanish1 = p.vanish1 === true;
            const isVanish2 = p.vanish2 === true;
            const isEmpty = p.empty === true;
            const isEmpty1 = p.empty1 === true;
            const isB = p.b === true;
            const isR = p.r === true;
            const isMove = p.move === true;
            const isMove1 = p.move1 === true;
            const isMove2 = p.move2 === true;
            const isBlueWin = p.bluewin === true;
            const isRedWin = p.redwin === true;

            // Win (layer3)
            if (isBlueWin) {
              const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0x0000ff, 0);
              this.physics.add.existing(s, true);
              this.blueWinRects.push(s);
              continue;
            }
            if (isRedWin) {
              const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0xff0000, 0);
              this.physics.add.existing(s, true);
              this.redWinRects.push(s);
              continue;
            }

            // Layer1 move appears later
            if (isLayer1 && isMove) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
              freezeObj(o, true);
              o.setVisible(false);
              if (o.body) o.body.enable = false;
              this.layer1Move.add(o);
              continue;
            }

            // Move platforms (always exist unless explicitly removed/disappeared)
            if (isLayer4 && isMove) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
              freezeObj(o, true);
              this.move.add(o);
              continue;
            }
            if (isLayer4 && isMove2) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
              freezeObj(o, true);
              this.move2.add(o);
              continue;
            }
            if ((isLayer4 || isLayer5) && isMove1) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
              freezeObj(o, true);
              this.move1.add(o);
              continue;
            }
            if (isLayer5 && isMove) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 20);
              freezeObj(o, true);
              this.move5.add(o);
              continue;
            }

            // Death hazards (enabled later)
            if (isLayer3 && isDeath) {
              const o = spawnImageOrRect(cx, cy, tileW * 2, tileH / 2, key || imgKeyByFile("trap.png"), 35);
              freezeObj(o, true);
              o.setVisible(true);
              if (o.body) o.body.enable = false;
              this.death.add(o);
              continue;
            }
            if (isLayer3 && isDeath1) {
              const o = spawnImageOrRect(cx, cy, tileW * 2, tileH / 2, key || imgKeyByFile("trap.png"), 35);
              freezeObj(o, true);
              o.setVisible(true);
              if (o.body) o.body.enable = false;
              this.death1.add(o);
              continue;
            }

            // Vanish1/2 on layer4/5
            if (isLayer4 && isVanish1) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
              freezeObj(o, true);
              this.vanish1_4.add(o);
              continue;
            }
            if (isLayer5 && isVanish1) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
              freezeObj(o, true);
              this.vanish1_5.add(o);
              continue;
            }
            if (isLayer4 && isVanish2) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
              freezeObj(o, true);
              this.vanish2_4.add(o);
              continue;
            }
            if (isLayer5 && isVanish2) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall2.png"), 22);
              freezeObj(o, true);
              this.vanish2_5.add(o);
              continue;
            }

            // Empty on layer4
            if (isLayer4 && isEmpty) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
              freezeObj(o, true);
              this.empty_4.add(o);
              continue;
            }
            if (isLayer4 && isEmpty1) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
              freezeObj(o, true);
              this.empty1_4.add(o);
              continue;
            }

            // b/r on layer3
            if (isLayer3 && isB) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
              freezeObj(o, true);
              this.b_3.add(o);
              continue;
            }
            if (isLayer3 && isR) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 22);
              freezeObj(o, true);
              this.r_3.add(o);
              continue;
            }

            // Layer4 solid disappears at touch (but initially solid)
            if (isLayer4 && isSolid) {
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key || imgKeyByFile("earthWall.png"), 15);
              freezeObj(o, true);
              this.layer4Solid.add(o);
              continue;
            }

            // Other solids (enabled)
            if (isSolid) {
              const r = this.add.rectangle(cx, cy, tileW, tileH, 0x000000, 0);
              this.physics.add.existing(r, true);
              this.solids.add(r);
              drawStatic(cx, cy, key, tileW, tileH);
              continue;
            }

            // Non-solid decorative render
            if (key && !isSolid) drawStatic(cx, cy, key, tileW, tileH);
          }
        }

        // Tweens for moving platforms (horizontal oscillation)
        const dx2 = tileW * 2;
        const tweenOscX = (grp, dx) => {
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
        tweenOscX(this.move, dx2);
        tweenOscX(this.move1, dx2);
        tweenOscX(this.move2, dx2);
        tweenOscX(this.move5, dx2);

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

        this.respawnPlayer = (player) => {
          const isP1 = player === this.p1;
          const sp = isP1 ? this.p1Spawn : this.p2Spawn;
          player.setPosition(sp.x, sp.y);
          player.body.setVelocity(0, 0);
          if (isP1) this.lastRespawnAt1 = this.time.now;
          else this.lastRespawnAt2 = this.time.now;
        };

        // Colliders
        this.physics.add.collider(this.p1, this.solids);
        this.physics.add.collider(this.p2, this.solids);
        for (const grp of [this.layer4Solid, this.vanish1_4, this.vanish1_5, this.vanish2_4, this.vanish2_5, this.empty_4, this.empty1_4, this.b_3, this.r_3]) {
          this.physics.add.collider(this.p1, grp);
          this.physics.add.collider(this.p2, grp);
        }
        for (const grp of [this.move, this.move1, this.move2, this.move5, this.layer1Move]) {
          this.physics.add.collider(this.p1, grp);
          this.physics.add.collider(this.p2, grp);
        }

        // Win overlap check uses rectangles directly; no collider required.

        const hitDeadly = (player) => {
          const isP1 = player === this.p1;
          const last = isP1 ? this.lastRespawnAt1 : this.lastRespawnAt2;
          if (this.time.now - last < this.deathInvulnMs) return;
          this.respawnPlayer(player);
        };
        this.physics.add.overlap(this.p1, this.death, () => hitDeadly(this.p1));
        this.physics.add.overlap(this.p2, this.death, () => hitDeadly(this.p2));
        this.physics.add.overlap(this.p1, this.death1, () => hitDeadly(this.p1));
        this.physics.add.overlap(this.p2, this.death1, () => hitDeadly(this.p2));

        // Sensors for op objects
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

        // touch: layer4 solid disappears
        hook(s0, "t0", () => {
          for (const o of this.layer4Solid.getChildren()) {
            o.destroy();
          }
        });

        // touch1: layer4 vanish1 disappears; enable death
        hook(s1, "t1", () => {
          for (const o of this.vanish1_4.getChildren()) o.destroy();
          for (const o of this.death.getChildren()) {
            o.body.enable = true;
            o.setVisible(true);
          }
        });

        // touch2: layer4 vanish2 disappears; enable death1
        hook(s2, "t2", () => {
          for (const o of this.vanish2_4.getChildren()) o.destroy();
          for (const o of this.death1.getChildren()) {
            o.body.enable = true;
            o.setVisible(true);
          }
        });

        // touch3: layer1 move appears
        hook(s3, "t3", () => {
          for (const o of this.layer1Move.getChildren()) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
          // start horizontal oscillation for layer1 move
          const dx = dx2;
          for (const o of this.layer1Move.getChildren()) {
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
        });

        // touch4: layer5 vanish1 disappears
        hook(s4, "t4", () => {
          for (const o of this.vanish1_5.getChildren()) o.destroy();
        });

        // touch5: layer4 move2 disappears; enable death
        hook(s5, "t5", () => {
          for (const o of this.move2.getChildren()) o.destroy();
          for (const o of this.death.getChildren()) {
            o.body.enable = true;
            o.setVisible(true);
          }
        });

        // touch6: layer5 vanish2 disappears
        hook(s6, "t6", () => {
          for (const o of this.vanish2_5.getChildren()) o.destroy();
        });

        // touch7: layer3 b disappears; layer4 empty disappears
        hook(s7, "t7", () => {
          for (const o of this.b_3.getChildren()) o.destroy();
          for (const o of this.empty_4.getChildren()) o.destroy();
        });

        // touch8: layer3 r disappears; layer4 empty1 disappears
        hook(s8, "t8", () => {
          for (const o of this.r_3.getChildren()) o.destroy();
          for (const o of this.empty1_4.getChildren()) o.destroy();
        });

        // touch9: layer1 move up 13 tiles
        hook(s9, "t9", () => {
          const dy = tileH * 13;
          for (const o of this.layer1Move.getChildren()) {
            this.tweens.add({
              targets: o,
              y: o.y - dy,
              duration: 1100,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
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
        if (!this.p1?.body || !this.p2?.body) return;
        if (this.finished) return;

        // Victory check: simultaneous touch of layer3 bluewin and redwin
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

        // Boundary death -> respawn
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
        window.PTLevelShared?.carryPlayersOnMovingObjects?.(this, [this.p1, this.p2], [this.move, this.move1, this.move2, this.move5, this.layer1Move]);
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

