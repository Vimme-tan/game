// Team-up Challenges Level 6 (double6.json)
// Exposes: window.TeamUpLevels.startTeamLevel6(ctx, levelId)
(function () {
  window.TeamUpLevels = window.TeamUpLevels || {};

  window.TeamUpLevels.startTeamLevel6 = async function startTeamLevel6(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.teamLevel6Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Team level 6 map load failed: ${e?.message || String(e)}`);
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
        console.warn("[team6] tileset load failed", source, e?.message || e);
      }
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Team level 6 resource load failed: TSX tileset parse failed.");
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
          if (immovable) {
            if (o.setImmovable) o.setImmovable(true);
            o.body.immovable = true;
            if (o.body.setImmovable) o.body.setImmovable(true);
          }
          if (o.setVelocity) o.setVelocity(0, 0);
          if (o.body.setVelocity) o.body.setVelocity(0, 0);
        };

        // Base solids
        this.solids = this.physics.add.staticGroup();

        const deathW = tileW * 2;
        const deathH = tileH / 2;

        // hazards (initially disabled for those that appear later)
        this.deathObjs = []; // death
        this.death1Objs = []; // death1
        this.death3Objs = []; // death3
        this.death4Objs = []; // death4
        this.death5Objs = []; // death5

        // moving platform (layer1 move): enable on combo
        this.moveGroup = this.physics.add.group();

        // vanish blocks (layer4 vanish1/vanish2): removed on touch2/touch4
        this.vanish1Group = this.physics.add.staticGroup();
        this.vanish2Group = this.physics.add.staticGroup();

        // win rectangles (from tiles)
        this._winBlueRects = [];
        this._winRedRects = [];
        this._winActive = false;

        // layer3 redwin / bluewin (disappear on combo)
        this._layer3RedwinRects = [];
        this._layer3BluewinRects = [];

        const layerNameIs = (layer, name) => String(layer?.name || "").toLowerCase() === String(name).toLowerCase();

        // Scan tile layers and spawn needed objects
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
            const objKey = key || imgKeyByFile("earthWall.png") || imgKeyByFile("trap.png") || null;

            // render passive solids
            if (p.solid === true) {
              // move/vanish/death hazards are handled separately below
              if (p.move === true && lname === "1") continue;
              if ((p.death === true || p.death1 === true || p.death4 === true) && lname === "1") continue;
              if (p.vanish1 === true || p.vanish2 === true) continue;
              if (p.death3 === true || p.death5 === true) continue;
              const r = this.add.rectangle(cx, cy, tileW, tileH, 0x000000, 0);
              this.physics.add.existing(r, true);
              this.solids.add(r);
              continue;
            }

            // Layer 1
            if (lname === "1") {
              if (p.move === true) {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey, 20);
                freezeObj(o, true);
                o.setVisible(false);
                if (o.body) o.body.enable = false;
                this.moveGroup.add(o);
              } else if (p.death === true) {
                const o = spawnImageOrRect(cx, cy, deathW, deathH, objKey, 35);
                freezeObj(o, true);
                o.setVisible(false);
                if (o.body) o.body.enable = false;
                this.deathObjs.push(o);
              } else if (p.death1 === true) {
                const o = spawnImageOrRect(cx, cy, deathW, deathH, objKey, 35);
                freezeObj(o, true);
                o.setVisible(false);
                if (o.body) o.body.enable = false;
                this.death1Objs.push(o);
              } else if (p.death4 === true) {
                const o = spawnImageOrRect(cx, cy, deathW, deathH, objKey, 35);
                freezeObj(o, true);
                o.setVisible(false);
                if (o.body) o.body.enable = false;
                this.death4Objs.push(o);
              } else if (p.redwin1 === true) {
                const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0xff0000, 0);
                this.physics.add.existing(s, true);
                s.setVisible(false);
                s.body.enable = false;
                this._winRedRects.push(s);
              } else if (p.bluewin1 === true) {
                const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0x0000ff, 0);
                this.physics.add.existing(s, true);
                s.setVisible(false);
                s.body.enable = false;
                this._winBlueRects.push(s);
              }
            }

            // Layer 3
            if (lname === "3") {
              if (p.death3 === true) {
                const o = spawnImageOrRect(cx, cy, deathW, deathH, objKey, 35);
                freezeObj(o, true);
                o.setVisible(false);
                if (o.body) o.body.enable = false;
                this.death3Objs.push(o);
              } else if (p.death5 === true) {
                const o = spawnImageOrRect(cx, cy, deathW, deathH, objKey, 35);
                freezeObj(o, true);
                o.setVisible(false);
                if (o.body) o.body.enable = false;
                this.death5Objs.push(o);
              } else if (p.redwin === true) {
                const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0xff0000, 0);
                this.physics.add.existing(s, true);
                s.setVisible(true);
                s.body.enable = false; // not used for win; only for disappearance
                this._layer3RedwinRects.push(s);
              } else if (p.bluewin === true) {
                const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0x0000ff, 0);
                this.physics.add.existing(s, true);
                s.setVisible(true);
                s.body.enable = false;
                this._layer3BluewinRects.push(s);
              }
            }

            // Layer 4 vanish blocks
            if (lname === "4") {
              if (p.vanish1 === true) {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall.png"), 20);
                freezeObj(o, true);
                this.vanish1Group.add(o);
              }
              if (p.vanish2 === true) {
                const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall2.png"), 20);
                freezeObj(o, true);
                this.vanish2Group.add(o);
              }
            }
          }
        }

        // players
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
        this.physics.add.collider(this.p1, this.vanish1Group);
        this.physics.add.collider(this.p2, this.vanish1Group);
        this.physics.add.collider(this.p1, this.vanish2Group);
        this.physics.add.collider(this.p2, this.vanish2Group);
        this.physics.add.collider(this.p1, this.moveGroup);
        this.physics.add.collider(this.p2, this.moveGroup);

        // deadly overlap
        this.deadlyGroup = this.physics.add.group();
        for (const o of [...this.deathObjs, ...this.death1Objs, ...this.death3Objs, ...this.death4Objs, ...this.death5Objs]) this.deadlyGroup.add(o);
        const hitDeadly = (player) => {
          const isP1 = player === this.p1;
          const last = isP1 ? this.lastRespawnAt1 : this.lastRespawnAt2;
          if (this.time.now - last < this.deathInvulnMs) return;
          this.respawnPlayer(player);
        };
        this.physics.add.overlap(this.p1, this.deadlyGroup, () => hitDeadly(this.p1));
        this.physics.add.overlap(this.p2, this.deadlyGroup, () => hitDeadly(this.p2));

        // Touch sensors
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

        const sTouch = makeSensor(touchObj("touch"));
        const sTouch1 = makeSensor(touchObj("touch1"));
        const sTouch2 = makeSensor(touchObj("touch2"));
        const sTouch3 = makeSensor(touchObj("touch3"));
        const sTouch4 = makeSensor(touchObj("touch4"));
        const sTouch5 = makeSensor(touchObj("touch5"));
        const sTouch6 = makeSensor(touchObj("touch6"));

        // touch: death appears
        hook(sTouch, "t_death", () => {
          for (const o of this.deathObjs) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });
        // touch1: death1 moves to most-left
        hook(sTouch1, "t_death1_left", () => {
          for (const o of this.death1Objs) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
          if (!this.death1Objs.length) return;
          const minX = Math.min(...this.death1Objs.map((o) => o.x));
          for (const o of this.death1Objs) {
            this.tweens.add({
              targets: o,
              x: minX,
              duration: 600,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });
        // touch2: vanish1 disappears; enable death3
        hook(sTouch2, "t_touch2_vanish1_death3", () => {
          for (const o of this.vanish1Group.getChildren()) o.destroy();
          for (const o of this.death3Objs) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });
        // touch3: death4 appears
        hook(sTouch3, "t_touch3_death4", () => {
          for (const o of this.death4Objs) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });
        // touch4: vanish2 disappears; enable death5
        hook(sTouch4, "t_touch4_vanish2_death5", () => {
          for (const o of this.vanish2Group.getChildren()) o.destroy();
          for (const o of this.death5Objs) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });

        // combo: touch5 + touch6 simultaneously (record by which player)
        this._comboDone = false;
        this._p1Touch5 = false;
        this._p2Touch6 = false;
        this._p1Touch6 = false;
        this._p2Touch5 = false;

        const tryCombo = () => {
          if (this._comboDone) return;
          const ok = (this._p1Touch5 && this._p2Touch6) || (this._p1Touch6 && this._p2Touch5);
          if (!ok) return;
          this._comboDone = true;
          // layer3 redwin / bluewin disappear
          for (const s of [...this._layer3RedwinRects, ...this._layer3BluewinRects]) s.destroy();
          // enable move + win sensors
          for (const o of this.moveGroup.getChildren()) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
          const enableWinRects = (arr) => {
            for (const s of arr) {
              s.setVisible(true);
              if (s.body) s.body.enable = true;
            }
          };
          enableWinRects(this._winBlueRects);
          enableWinRects(this._winRedRects);
          this._winActive = true;
          // start up/down tween for move platform
          const dy = tileH * 2;
          for (const o of this.moveGroup.getChildren()) {
            this.tweens.add({
              targets: o,
              y: o.y - dy,
              duration: 520,
              ease: "Sine.easeInOut",
              yoyo: true,
              repeat: -1,
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        };

        if (sTouch5) {
          this.physics.add.overlap(this.p1, sTouch5, () => {
            this._p1Touch5 = true;
            tryCombo();
          });
          this.physics.add.overlap(this.p2, sTouch5, () => {
            this._p2Touch5 = true;
            tryCombo();
          });
        }
        if (sTouch6) {
          this.physics.add.overlap(this.p1, sTouch6, () => {
            this._p1Touch6 = true;
            tryCombo();
          });
          this.physics.add.overlap(this.p2, sTouch6, () => {
            this._p2Touch6 = true;
            tryCombo();
          });
        }

        // keyboard
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

        // Win check only after combo.
        if (this._winActive) {
          const pb1 = this.p1.getBounds();
          const pb2 = this.p2.getBounds();
          let p1InBlue = false;
          let p2InRed = false;
          for (const s of this._winBlueRects) {
            if (Phaser.Geom.Intersects.RectangleToRectangle(pb1, s.getBounds())) {
              p1InBlue = true;
              break;
            }
          }
          for (const s of this._winRedRects) {
            if (Phaser.Geom.Intersects.RectangleToRectangle(pb2, s.getBounds())) {
              p2InRed = true;
              break;
            }
          }
          if (p1InBlue && p2InRed) {
            this.finished = true;
            if (typeof onLevelWin === "function") onLevelWin(levelId, { title: "合作完成", message: "两人同时到达终点！" });
            return;
          }
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

        // Relative movement: carry players standing on moving `move` platform.
        window.PTLevelShared?.carryPlayersOnMovingObjects?.(this, [this.p1, this.p2], [this.moveGroup]);
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

