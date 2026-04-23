// Team-up Challenges Level 4 (double-player cooperation)
// Exposes: window.TeamUpLevels.startTeamLevel4(ctx, levelId)
(function () {
  window.TeamUpLevels = window.TeamUpLevels || {};

  window.TeamUpLevels.startTeamLevel4 = async function startTeamLevel4(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.teamLevel4Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Team level 4 map load failed: ${e?.message || String(e)}`);
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
        console.warn("[team4] tileset load failed", source, e?.message || e);
      }
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Team level 4 resource load failed: TSX tileset parse failed.");
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
    const touchObj = (name) => opObjects.find((o) => propTrue(o.properties, name) || String(o.name || "").toLowerCase() === name) || null;

    const t0 = touchObj("touch");
    const t1 = touchObj("touch1");
    const t2 = touchObj("touch2");
    const t3 = touchObj("touch3");
    const t4 = touchObj("touch4");
    const t5 = touchObj("touch5");
    const t6 = touchObj("touch6");

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
      const url = new URL(`../../map/${f}`, mapBase).toString();
      if (!imageToKey.has(url)) imageToKey.set(url, `map_${f.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`);
    }
    const imgKeyByFile = (fileName) => {
      const url = new URL(`../../map/${fileName}`, mapBase).toString();
      return imageToKey.get(url) || null;
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
        const layer3 = layerByName("3");

        this.solids = this.physics.add.staticGroup();
        this.deadlyStatic = this.physics.add.staticGroup();
        this.deadlyDynamic = this.physics.add.group();

        this.emptyBlocks = this.physics.add.staticGroup(); // layer3 empty removable
        this.vanish1Blocks = this.physics.add.staticGroup(); // layer3 vanish1 removable
        this.moveBlocks = this.physics.add.group(); // layer3 move blocks oscillate

        this.layer1Stones = [];
        this.layer1Stone1s = [];
        this.layer1Death1s = [];
        this.layer1Deaths = [];
        this.layer1Death2s = [];
        this.layer1Death3s = [];

        // util: check prop presence even if bool=false in tsx
        const hasProp = (props, name) => props && Object.prototype.hasOwnProperty.call(props, name);

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
        };

        const trapW = tileW * 2;
        const trapH = tileH / 2;

        const drawStaticTile = (col, row, tile) => {
          const cx = col * tileW + tileW / 2;
          const cy = row * tileH + tileH / 2;
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (!key) {
            this.add.rectangle(cx, cy, tileW, tileH, 0x000000, 0.05);
            return;
          }
          const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
          const p = tile.props || {};
          // 要求：所有带有 death2 的属性图像隐藏
          if (p.death2 === true) {
            img.setVisible(false);
            return;
          }
          const isTrap = p.death === true || p.death1 === true || p.death2 === true || p.death3 === true;
          if (isTrap) img.setDisplaySize(trapW, trapH);
          else img.setDisplaySize(tileW, tileH);
        };

        // Render all layers as visuals; build physics from specific properties.
        const layers = [layer1, layer3].filter(Boolean);
        for (const layer of layers) {
          const data = layer.data;
          const lname = String(layer.name || "");
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            // moving/hidden objects will be handled separately; for now, draw base tiles.
            drawStaticTile(col, row, tile);

            if (lname === "3") {
              // layer3 objects: empty / vanish1 / move / death / win zones
              if (p.death === true) {
                addStaticRect(this.deadlyStatic, cx, cy, trapW, trapH);
                continue;
              }
              if (p.move === true || p.move2 === true) {
                const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
                const key = url ? imageToKey.get(url) : null;
                const o = spawnImageOrRect(cx, cy, tileW, tileH, key, 25);
                freezeObj(o, true);
                this.moveBlocks.add(o);
                continue;
              }
              if (p.empty === true || p.empty1 === true) {
                // removable solid block
                addStaticRect(this.emptyBlocks, cx, cy, tileW, tileH);
                continue;
              }
              if (p.vanish1 === true) {
                addStaticRect(this.vanish1Blocks, cx, cy, tileW, tileH);
                continue;
              }
              if (p.bluewin === true || p.bluewin1 === true) {
                // create sensor (no visible)
                const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0x00ff00, 0);
                this.physics.add.existing(s, true);
                s._win = "blue";
                this.deadlyStatic.add(s); // reuse group container; won't kill because we never overlap on it
                this._blueWinSensor = s;
              }
              if (p.redwin === true || p.redwin1 === true) {
                const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0x00ff00, 0);
                this.physics.add.existing(s, true);
                s._win = "red";
                this.deadlyStatic.add(s);
                this._redWinSensor = s;
              }
            }

            if (lname === "1") {
              // layer1: stones/deaths are activated by touches; spawn as hidden dynamic objects
              const isStone = hasProp(p, "stone");
              const isStone1 = hasProp(p, "stone1");
              const isDeath1 = p.death1 === true;
              const isDeath = p.death === true;
              const isDeath2 = p.death2 === true;
              const isDeath3 = p.death3 === true;
              if (!(isStone || isStone1 || isDeath1 || isDeath || isDeath2 || isDeath3)) continue;

              let key = null;
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              key = url ? imageToKey.get(url) : null;
              // death tiles always use trap for clarity
              if (isDeath || isDeath1 || isDeath2 || isDeath3) key = imgKeyByFile("trap.png") || key;
              const w = isStone || isStone1 ? tileW * 2 : trapW;
              const h = isStone || isStone1 ? tileH * 1.2 : trapH;
              const o = spawnImageOrRect(cx, cy, w, h, key, 35);
              freezeObj(o, true);
              o.setVisible(false);
              if (o.body) o.body.enable = false;
              this.deadlyDynamic.add(o);
              if (isStone) this.layer1Stones.push(o);
              if (isStone1) this.layer1Stone1s.push(o);
              if (isDeath1) this.layer1Death1s.push(o);
              if (isDeath) this.layer1Deaths.push(o);
              if (isDeath2) this.layer1Death2s.push(o);
              if (isDeath3) this.layer1Death3s.push(o);
            }
          }
        }

        // Base solids: any tile with prop solid in any visible layer
        for (const layer of tileLayers) {
          const data = layer.data;
          const lname = String(layer.name || "");
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            if (p.solid !== true) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            // Don't double-add for empty blocks (handled separately) or move blocks
            if (lname === "3" && (p.empty === true || p.empty1 === true || p.move === true || p.move2 === true || p.vanish1 === true)) continue;
            addStaticRect(this.solids, cx, cy, tileW, tileH);
          }
        }

        // Oscillate move blocks left/right 2 tiles forever.
        const oscDx = tileW * 2;
        for (const o of this.moveBlocks.getChildren()) {
          this.tweens.add({
            targets: o,
            x: o.x + oscDx,
            duration: 520,
            ease: "Sine.easeInOut",
            yoyo: true,
            repeat: -1,
            onUpdate: () => o?.body?.updateFromGameObject?.(),
          });
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

        this.respawnPlayer = (player) => {
          if (!player?.body) return;
          const isP1 = player === this.p1;
          const sp = isP1 ? this.p1Spawn : this.p2Spawn;
          player.setPosition(sp.x, sp.y);
          player.body.setVelocity(0, 0);
          if (isP1) this.lastRespawnAt1 = this.time.now;
          else this.lastRespawnAt2 = this.time.now;
        };

        // colliders
        this.physics.add.collider(this.p1, this.solids);
        this.physics.add.collider(this.p2, this.solids);
        this.physics.add.collider(this.p1, this.emptyBlocks);
        this.physics.add.collider(this.p2, this.emptyBlocks);
        this.physics.add.collider(this.p1, this.vanish1Blocks);
        this.physics.add.collider(this.p2, this.vanish1Blocks);
        for (const m of this.moveBlocks.getChildren()) {
          this.physics.add.collider(this.p1, m);
          this.physics.add.collider(this.p2, m);
        }

        const hitDeadly = (player) => {
          const isP1 = player === this.p1;
          const last = isP1 ? this.lastRespawnAt1 : this.lastRespawnAt2;
          if (this.time.now - last < this.deathInvulnMs) return;
          this.respawnPlayer(player);
        };
        this.physics.add.overlap(this.p1, this.deadlyStatic, (p, obj) => {
          if (obj?._win) return;
          hitDeadly(p);
        });
        this.physics.add.overlap(this.p2, this.deadlyStatic, (p, obj) => {
          if (obj?._win) return;
          hitDeadly(p);
        });
        this.physics.add.overlap(this.p1, this.deadlyDynamic, () => hitDeadly(this.p1));
        this.physics.add.overlap(this.p2, this.deadlyDynamic, () => hitDeadly(this.p2));

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

        // touch: layer3 empty disappears
        hook(s0, "touch", () => {
          for (const o of this.emptyBlocks.getChildren()) o.destroy();
        });

        // touch1: layer1 stone down, deadly
        hook(s1, "touch1", () => {
          for (const o of this.layer1Stones) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
            this.tweens.add({
              targets: o,
              y: o.y + tileH * 6,
              duration: 700,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });

        // touch2: layer1 stone1 down
        hook(s2, "touch2", () => {
          for (const o of this.layer1Stone1s) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
            this.tweens.add({
              targets: o,
              y: o.y + tileH * 6,
              duration: 700,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });

        // touch3: death1 up 1
        hook(s3, "touch3", () => {
          for (const o of this.layer1Death1s) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
            this.tweens.add({
              targets: o,
              y: o.y - tileH,
              duration: 220,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });

        // touch4: death appears
        hook(s4, "touch4", () => {
          for (const o of this.layer1Deaths) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });

        // touch5: death3 down 1
        hook(s5, "touch5", () => {
          for (const o of this.layer1Death3s) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
            this.tweens.add({
              targets: o,
              y: o.y + tileH,
              duration: 220,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });

        // touch6: layer3 vanish1 disappears; layer1 death2 appears
        hook(s6, "touch6", () => {
          for (const o of this.vanish1Blocks.getChildren()) o.destroy();
          for (const o of this.layer1Death2s) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });

        // Win: P1 in bluewin AND P2 in redwin simultaneously
        this._p1InBlue = false;
        this._p2InRed = false;

        // inputs
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

        // win check (tile sensors are rectangles stored on scene)
        this._p1InBlue = false;
        this._p2InRed = false;
        if (this._blueWinSensor) {
          if (Phaser.Geom.Intersects.RectangleToRectangle(this.p1.getBounds(), this._blueWinSensor.getBounds())) this._p1InBlue = true;
        }
        if (this._redWinSensor) {
          if (Phaser.Geom.Intersects.RectangleToRectangle(this.p2.getBounds(), this._redWinSensor.getBounds())) this._p2InRed = true;
        }
        if (this._p1InBlue && this._p2InRed) {
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
        window.PTLevelShared?.carryPlayersOnMovingObjects?.(this, [this.p1, this.p2], [this.moveBlocks]);
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

