// Team-up Challenges Level 2 (double-player cooperation)
// Exposes: window.TeamUpLevels.startTeamLevel2(ctx, levelId)
(function () {
  window.TeamUpLevels = window.TeamUpLevels || {};

  window.TeamUpLevels.startTeamLevel2 = async function startTeamLevel2(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.teamLevel2Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Team level 2 map load failed: ${e?.message || String(e)}`);
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
        console.warn("[team2] tileset load failed", source, e?.message || e);
      }
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);

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
    const touchObj = (n) => opObjects.find((o) => propTrue(o.properties, `touch${n}`) || String(o.name || "").toLowerCase() === `touch${n}`) || null;

    const t1 = touchObj(1);
    const t2 = touchObj(2);
    const t3 = touchObj(3);
    const t4 = touchObj(4);
    const t5 = touchObj(5);
    const t6 = touchObj(6);
    const t7 = touchObj(7);
    const t8 = touchObj(8);

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

    // Ensure key visuals exist even when TSX is empty (444/555).
    // We always load these from `assets/maps/map/`.
    const EXTRA_MAP_IMAGES = [
      "earthWall.png",
      "earthWall2.png",
      "trap.png",
      "bombStroked.png",
      "swordStroked.png",
      "doorRedStroked.png",
      "doorStroked.png",
    ];
    for (const f of EXTRA_MAP_IMAGES) {
      const url = new URL(`../../map/${f}`, mapBase).toString();
      if (!imageToKey.has(url)) imageToKey.set(url, `map_${f.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`);
    }

    const imgKeyByFile = (fileName) => {
      const url = new URL(`../../map/${fileName}`, mapBase).toString();
      return imageToKey.get(url) || null;
    };

    // Find common tile textures by property (now TSX are complete).
    const findFirstTileKeyByProp = (propName) => {
      const key = String(propName || "").toLowerCase();
      for (const ts of tilesetInfos) {
        for (const idStr of Object.keys(ts.tiles || {})) {
          const id = Number(idStr);
          const t = ts.tiles[id];
          if (!t?.props || t.props[key] !== true) continue;
          const url = resolveTilesetImageUrl(t.imageSource, mapBase);
          const k = url ? imageToKey.get(url) : null;
          if (k) return k;
        }
      }
      return null;
    };
    const deathTileKey = findFirstTileKeyByProp("death") || imgKeyByFile("trap.png");

    function spawnTileObject(scene, x, y, imgKey, opts) {
      const w = opts?.displayW ?? tileW;
      const h = opts?.displayH ?? tileH;
      const o = imgKey ? scene.physics.add.image(x, y, imgKey) : scene.add.rectangle(x, y, w, h, 0xff00ff, 0.25);
      if (!imgKey) scene.physics.add.existing(o);
      o.setDepth?.(opts?.depth ?? 10);
      o.setDisplaySize?.(w, h);
      if (o.body) {
        o.body.setAllowGravity(false);
        o.body.setImmovable(true);
        o.body.moves = opts?.moves === true;
        o.body.setVelocity(0, 0);
      }
      if (opts?.visible === false) o.setVisible(false);
      if (opts?.active === false && o.body) o.body.enable = false;
      return o;
    }

    function makeSensor(scene, obj) {
      if (!obj) return null;
      const x = Number(obj.x || 0);
      const y = Number(obj.y || 0);
      const w = Number(obj.width || tileW);
      const h = Number(obj.height || tileH);
      const s = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x00ffff, 0);
      scene.physics.add.existing(s, true);
      return s;
    }

    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

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
        this.dead1 = false;
        this.dead2 = false;
        this.lastRespawnAt1 = -1e9;
        this.lastRespawnAt2 = -1e9;
        this.deathInvulnMs = 700;
        this.triggered = new Set();

        this._tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = this._tuning.gravityY;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // Render static tiles (skip interactive tiles that we spawn separately)
        for (const layer of tileLayers) {
          const data = layer.data;
          const layerName = String(layer.name || "").toLowerCase();
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx]);
            if (!tile) continue;
            const p = tile.props || {};
            const isInteractiveOne = layerName === "one" && (p.bomb1 === true || p.bomb2 === true || p.sword1 === true || p.sword2 === true);
            const isInteractiveThree =
              layerName === "three" &&
              (p.vanish1 === true || p.move === true || p.move1 === true || p.bluewin === true || p.redwin === true);
            if (isInteractiveOne || isInteractiveThree) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            let key = null;
            if (tile?.imageSource) {
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              key = url ? imageToKey.get(url) : null;
            }
            if (!key) continue;
            const img = this.add.image(cx - tileW / 2, cy + tileH / 2, key).setOrigin(0, 1);
            img.setDisplaySize(tileW, tileH);
          }
        }

        // Groups
        this.solids = this.physics.add.staticGroup();
        this.deadly = this.physics.add.staticGroup(); // deadly areas (trap tiles + touch1 replacement)
        this.vanishGroup = this.physics.add.staticGroup();
        this.moveGroup = this.physics.add.group();
        this.move1Group = this.physics.add.group();

        // Spawn interactive tiles by TILE PROPERTIES
        const layerOne = tileLayers.find((l) => String(l.name || "").toLowerCase() === "one");
        const layerThree = tileLayers.find((l) => String(l.name || "").toLowerCase() === "three");

        const bomb1Objs = [];
        const bomb2Objs = [];
        const sword1Objs = [];
        const sword2Objs = [];
        const bluewinRects = [];
        const redwinRects = [];

        const addStaticRect = (group, x, y, w = tileW, h = tileH) => {
          const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
          this.physics.add.existing(r, true);
          group.add(r);
          return r;
        };

        if (layerOne) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layerOne.data[idx]);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            if (p.solid === true) addStaticRect(this.solids, cx, cy);
            if (p.death === true) addStaticRect(this.deadly, cx, cy, tileW * 2, tileH / 2);

            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const imgKey = url ? imageToKey.get(url) : null;

            if (p.bomb1 === true) {
              bomb1Objs.push(spawnTileObject(this, cx, cy, imgKey || imgKeyByFile("bombStroked.png"), { visible: false, active: false, depth: 40, displayW: tileW * 1.2, displayH: tileH * 1.6 }));
            }
            if (p.bomb2 === true) {
              bomb2Objs.push(spawnTileObject(this, cx, cy, imgKey || imgKeyByFile("bombStroked.png"), { visible: false, active: false, depth: 40, displayW: tileW * 1.2, displayH: tileH * 1.6 }));
            }
            if (p.sword1 === true) {
              sword1Objs.push(spawnTileObject(this, cx, cy, imgKey || imgKeyByFile("swordStroked.png"), { visible: false, active: false, depth: 40, displayW: tileW * 1.6, displayH: tileH * 0.9, moves: true }));
            }
            if (p.sword2 === true) {
              sword2Objs.push(spawnTileObject(this, cx, cy, imgKey || imgKeyByFile("swordStroked.png"), { visible: false, active: false, depth: 40, displayW: tileW * 1.6, displayH: tileH * 0.9, moves: true }));
            }
          }
        }

        if (layerThree) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layerThree.data[idx]);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            if (p.solid === true) addStaticRect(this.solids, cx, cy);

            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const imgKey = url ? imageToKey.get(url) : null;

            if (p.vanish1 === true) {
              const b = spawnTileObject(this, cx, cy, imgKey || imgKeyByFile("earthWall.png"), { visible: true, active: true, depth: 30, moves: false });
              if (b.body) {
                b.body.setAllowGravity(false);
                b.body.setImmovable(true);
              }
              this.vanishGroup.add(b);
              b._spawn = { cx, cy };
            }
            if (p.move === true) {
              const o = spawnTileObject(this, cx, cy, imgKey || imgKeyByFile("earthWall.png"), { visible: true, active: true, depth: 28, moves: true });
              o._spawn = { cx, cy };
              this.moveGroup.add(o);
            }
            if (p.move1 === true) {
              const o = spawnTileObject(this, cx, cy, imgKey || imgKeyByFile("earthWall.png"), { visible: true, active: true, depth: 28, moves: true });
              o._spawn = { cx, cy };
              this.move1Group.add(o);
            }
            if (p.bluewin === true) bluewinRects.push({ cx, cy, w: tileW * 2, h: tileH * 2 });
            if (p.redwin === true) redwinRects.push({ cx, cy, w: tileW * 2, h: tileH * 2 });
          }
        }

        // Players
        const p1Spawn = toSpawn(born1Obj, { x: tileW * 2, y: tileH * 2 });
        const p2Spawn = toSpawn(born2Obj, { x: tileW * 3, y: tileH * 2 });
        this.spawn1 = { ...p1Spawn };
        this.spawn2 = { ...p2Spawn };

        const mkPlayer = (x, y) => {
          const p = this.physics.add.sprite(x, y, "char_front").setOrigin(0.5, 1);
          p.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
          p.body.setCollideWorldBounds(true);
          p.body.setSize(p.displayWidth, p.displayHeight, false);
          p.body.setDragX(900);
          p.body.setMaxVelocity(260, 900);
          return p;
        };
        this.p1 = mkPlayer(this.spawn1.x, this.spawn1.y);
        this.p2 = mkPlayer(this.spawn2.x, this.spawn2.y);

        this.physics.add.collider(this.p1, this.solids);
        this.physics.add.collider(this.p2, this.solids);
        this.physics.add.collider(this.p1, this.vanishGroup);
        this.physics.add.collider(this.p2, this.vanishGroup);
        this.physics.add.collider(this.p1, this.moveGroup);
        this.physics.add.collider(this.p2, this.moveGroup);
        this.physics.add.collider(this.p1, this.move1Group);
        this.physics.add.collider(this.p2, this.move1Group);

        const kill1 = () => {
          if (this.dead1 || this.finished) return;
          this.dead1 = true;
          this.p1.body.setVelocity(0, 0);
          this.time.delayedCall(520, () => {
            this.dead1 = false;
            this.lastRespawnAt1 = this.time.now;
            this.p1.setPosition(this.spawn1.x, this.spawn1.y);
            this.p1.body.setVelocity(0, 0);
          });
        };
        const kill2 = () => {
          if (this.dead2 || this.finished) return;
          this.dead2 = true;
          this.p2.body.setVelocity(0, 0);
          this.time.delayedCall(520, () => {
            this.dead2 = false;
            this.lastRespawnAt2 = this.time.now;
            this.p2.setPosition(this.spawn2.x, this.spawn2.y);
            this.p2.body.setVelocity(0, 0);
          });
        };

        this.physics.add.overlap(this.p1, this.deadly, () => {
          if (this.time.now - this.lastRespawnAt1 < this.deathInvulnMs) return;
          kill1();
        });
        this.physics.add.overlap(this.p2, this.deadly, () => {
          if (this.time.now - this.lastRespawnAt2 < this.deathInvulnMs) return;
          kill2();
        });

        // swords: only deadly when that sword object is visible+enabled
        const swordGroup = this.physics.add.group();
        for (const s of sword1Objs.concat(sword2Objs)) swordGroup.add(s);
        this.physics.add.overlap(this.p1, swordGroup, (_p, sword) => {
          if (this.time.now - this.lastRespawnAt1 < this.deathInvulnMs) return;
          if (sword?.visible !== true) return;
          if (sword?.body && sword.body.enable !== true) return;
          kill1();
        });
        this.physics.add.overlap(this.p2, swordGroup, (_p, sword) => {
          if (this.time.now - this.lastRespawnAt2 < this.deathInvulnMs) return;
          if (sword?.visible !== true) return;
          if (sword?.body && sword.body.enable !== true) return;
          kill2();
        });

        // Win sensors
        this.blueWins = this.physics.add.staticGroup();
        this.redWins = this.physics.add.staticGroup();
        for (const r of bluewinRects) addStaticRect(this.blueWins, r.cx, r.cy, r.w, r.h);
        for (const r of redwinRects) addStaticRect(this.redWins, r.cx, r.cy, r.w, r.h);

        const activateObj = (o) => {
          o.setVisible(true);
          if (o.body) o.body.enable = true;
        };
        const oneShot = (key, fn) => {
          if (this.triggered.has(key)) return;
          this.triggered.add(key);
          fn();
        };

        const moveLeft = (targets, tiles = 6, ms = 800) => {
          const dx = tileW * tiles;
          for (const o of targets) {
            if (!o) continue;
            this.tweens.add({
              targets: o,
              x: o.x - dx,
              duration: ms,
              ease: "Sine.easeInOut",
              onUpdate: () => {
                if (o?.body?.updateFromGameObject) o.body.updateFromGameObject();
              },
            });
          }
        };

        // Sensors
        const s1 = makeSensor(this, t1);
        const s2 = makeSensor(this, t2);
        const s3 = makeSensor(this, t3);
        const s4 = makeSensor(this, t4);
        const s5 = makeSensor(this, t5);
        const s6 = makeSensor(this, t6);
        const s7 = makeSensor(this, t7);
        const s8 = makeSensor(this, t8);

        if (s2) {
          this.physics.add.overlap(this.p1, s2, () => oneShot("touch2_p1", () => {
            bomb1Objs.forEach(activateObj);
            kill1();
          }));
          this.physics.add.overlap(this.p2, s2, () => oneShot("touch2_p2", () => {
            bomb1Objs.forEach(activateObj);
            kill2();
          }));
        }
        if (s3) {
          this.physics.add.overlap(this.p1, s3, () => oneShot("touch3_p1", () => {
            bomb2Objs.forEach(activateObj);
            kill1();
          }));
          this.physics.add.overlap(this.p2, s3, () => oneShot("touch3_p2", () => {
            bomb2Objs.forEach(activateObj);
            kill2();
          }));
        }
        if (s6) {
          this.physics.add.overlap(this.p1, s6, () => oneShot("touch6", () => {
            sword2Objs.forEach(activateObj);
            moveLeft(sword2Objs, 6, 850);
          }));
          this.physics.add.overlap(this.p2, s6, () => oneShot("touch6", () => {
            sword2Objs.forEach(activateObj);
            moveLeft(sword2Objs, 6, 850);
          }));
        }
        const touchMove = () => oneShot("touch4or8", () => moveLeft(this.moveGroup.getChildren(), 6, 900));
        if (s4) {
          this.physics.add.overlap(this.p1, s4, touchMove);
          this.physics.add.overlap(this.p2, s4, touchMove);
        }
        if (s8) {
          this.physics.add.overlap(this.p1, s8, touchMove);
          this.physics.add.overlap(this.p2, s8, touchMove);
        }
        const touchMove1 = () => oneShot("touch5or7", () => {
          moveLeft(this.move1Group.getChildren(), 6, 900);
          sword1Objs.forEach(activateObj);
          moveLeft(sword1Objs, 6, 900);
        });
        if (s5) {
          this.physics.add.overlap(this.p1, s5, touchMove1);
          this.physics.add.overlap(this.p2, s5, touchMove1);
        }
        if (s7) {
          this.physics.add.overlap(this.p1, s7, touchMove1);
          this.physics.add.overlap(this.p2, s7, touchMove1);
        }
        if (s1) {
          const doTouch1 = () =>
            oneShot("touch1", () => {
              // vanish1 removed immediately so players drop
              for (const b of this.vanishGroup.getChildren()) {
                if (b.body) b.body.enable = false;
                b.destroy();
              }
              // replace with deadly tiles (visible trap + death body)
              if (layerThree) {
                for (let idx = 0; idx < mapW * mapH; idx++) {
                  const tile = resolveTileFromGid(layerThree.data[idx]);
                  if (!tile?.props || tile.props.vanish1 !== true) continue;
                  const col = idx % mapW;
                  const row = Math.floor(idx / mapW);
                  const cx = col * tileW + tileW / 2;
                  const cy = row * tileH + tileH / 2;
                  const trap = spawnTileObject(this, cx, cy, deathTileKey, {
                    visible: true,
                    active: true,
                    depth: 38,
                    displayW: tileW * 2,
                    displayH: tileH / 2,
                  });
                  // keep it as a static death area
                  if (trap.body) {
                    trap.body.setAllowGravity(false);
                    trap.body.setImmovable(true);
                    trap.body.moves = false;
                    if (trap.body.updateFromGameObject) trap.body.updateFromGameObject();
                  }
                  this.deadly.add(trap);
                }
              }
            });
          this.physics.add.overlap(this.p1, s1, doTouch1);
          this.physics.add.overlap(this.p2, s1, doTouch1);
        }

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

        const tuning = this._tuning || { speed: 300, jumpV: -920 };
        const pSpeed = tuning.speed;
        const jumpV = tuning.jumpV;

        this._stepPlayer = (p, keys, isP1) => {
          if (!p?.body) return;
          const mobile = isP1 && window.__PT_isMobileControl?.() === true;
          const left = keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
          const right = keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
          if (left) p.setVelocityX(-pSpeed);
          else if (right) p.setVelocityX(pSpeed);
          else p.setVelocityX(0);
          if (left) p.setTexture("char_left");
          else if (right) p.setTexture("char_right");
          else p.setTexture("char_front");
          const wantJump = Phaser.Input.Keyboard.JustDown(keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
          if (wantJump && (p.body.blocked.down || p.body.touching.down)) p.setVelocityY(jumpV);
        };

        // Victory check helper
        this._inGroup = (p, group) => {
          const pb = p.getBounds();
          for (const s of group.getChildren()) {
            const sb = s.getBounds();
            if (!(pb.right < sb.left || pb.left > sb.right || pb.bottom < sb.top || pb.top > sb.bottom)) return true;
          }
          return false;
        };
      },
      update: function () {
        if (!this.p1?.body || !this.p2?.body) return;
        if (this.finished) return;

        // touching game viewport boundary => death (per-player)
        const vb = this.cameras.main.worldView;
        const b1 = this.p1.getBounds();
        const b2 = this.p2.getBounds();
        const hitVb = (b) => b.bottom >= vb.bottom - 2 || b.top <= vb.top + 2 || b.left <= vb.left + 2 || b.right >= vb.right - 2;
        if (!this.dead1 && hitVb(b1)) {
          this.dead1 = true;
          this.p1.body.setVelocity(0, 0);
          this.time.delayedCall(520, () => {
            this.dead1 = false;
            this.lastRespawnAt1 = this.time.now;
            this.p1.setPosition(this.spawn1.x, this.spawn1.y);
            this.p1.body.setVelocity(0, 0);
          });
        }
        if (!this.dead2 && hitVb(b2)) {
          this.dead2 = true;
          this.p2.body.setVelocity(0, 0);
          this.time.delayedCall(520, () => {
            this.dead2 = false;
            this.lastRespawnAt2 = this.time.now;
            this.p2.setPosition(this.spawn2.x, this.spawn2.y);
            this.p2.body.setVelocity(0, 0);
          });
        }

        if (!this.dead1) this._stepPlayer(this.p1, this.p1Keys, true);
        else this.p1.setVelocityX(0);
        if (!this.dead2) this._stepPlayer(this.p2, this.p2Keys, false);
        else this.p2.setVelocityX(0);

        // Relative movement: carry players standing on moving blocks.
        window.PTLevelShared?.carryPlayersOnMovingObjects?.(this, [this.p1, this.p2], [this.moveGroup, this.move1Group]);

        const p1InBlue = this._inGroup(this.p1, this.blueWins);
        const p2InRed = this._inGroup(this.p2, this.redWins);
        if (p1InBlue && p2InRed) {
          this.finished = true;
          if (typeof onLevelWin === "function") onLevelWin(levelId);
        }
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

