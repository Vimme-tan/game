// Single-player Level 8 (JSON)
// Exposes:
// window.SinglePlayerLevels.startLevel8(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel8 = async function startLevel8(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.level8Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Level 8 map load failed: ${e?.message || String(e)}`);
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

    const tilesetInfos = [];
    for (const ts of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(ts.firstgid || 1);
      if (!ts.source) continue;
      // eight.json tileset source ../tiled/examples/*.tsx
      // 共享模块 fetchTsxText 会自动用 basename 在同目录回退（level8 目录下有 dung.tsx / fake.tsx
      const tsxText = await fetchTsxText(ts.source, mapBase);
      const parsed = parseTsx(tsxText);
      tilesetInfos.push({ firstgid, ...parsed });
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Level 8 resource load failed: TSX tileset parse failed.");
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
      return { ...tile, tileId };
    }

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objects = allLayers
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);

    const hasPropName = (obj, key) =>
      Array.isArray(obj?.properties) && obj.properties.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    const propTrue = (props, key) => {
      if (!Array.isArray(props)) return false;
      const k = String(key || "").toLowerCase();
      return props.some((p) => {
        const name = String(p?.name || "").toLowerCase();
        if (name !== k) return false;
        return p?.value === true || p?.value === 1 || String(p?.value || "").toLowerCase() === "true";
      });
    };

    const bornObj = objects.find((o) => propTrue(o.properties, "born") || hasPropName(o, "born")) || null;
    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y - Math.max(6, Math.min(tileH * 0.6, (bornObj.height || tileH) * 0.6)) : tileH * 2;

    // preload images

    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles || {})) {
        const t = ts.tiles[Number(idStr)];
        if (!t?.imageSource) continue;
        const url = resolveTilesetImageUrl(t.imageSource, mapBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `tile_${ts.name}_${idStr}`);
      }
    }

    const scene = {
      preload: function () {
        this.load.on("loaderror", (file) => {
          console.warn("level8 loaderror:", file?.key, file?.src);
        });
        window.PTLevelShared?.loadCharacterSprites?.(this, assets);
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.PTLevelShared?.makeCharacterSpritesTransparent?.(this);

        this.finished = false;
        this._tuning =
          window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };
        this.triggered = new Set();

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = this._tuning.gravityY;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        const drawTile = (cx, cy, tile, displayW = tileW, displayH = tileH, depth = 10) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (!key) return null;
          const img = this.add.image(cx - displayW / 2, cy + displayH / 2, key).setOrigin(0, 1);
          img.setDisplaySize(displayW, displayH);
          img.setDepth(depth);
          return img;
        };

        const addStaticRect = (group, cx, cy, w = tileW, h = tileH) => {
          const r = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
          this.physics.add.existing(r, true);
          group.add(r);
          return r;
        };

        this.solids = this.physics.add.staticGroup();
        this.deathSensors = this.physics.add.staticGroup();
        this.winSensors = this.physics.add.staticGroup(); // sensors synced to win doors

        // Dynamic objects (need movement)
        this.dynamicSolids = this.physics.add.group();
        this.bombs = this.physics.add.group();
        this.winDoors = this.physics.add.group();

        const freezeObj = (o, solid = true) => {
          if (!o?.body) return;
          o.body.allowGravity = false;
          if (o.body.setAllowGravity) o.body.setAllowGravity(false);
          if (solid) {
            o.body.immovable = true;
            if (o.body.setImmovable) o.body.setImmovable(true);
          }
          o.body.moves = false;
          o.body.setVelocity(0, 0);
          if (!solid) o.body.enable = false;
          if (o.body.updateFromGameObject) o.body.updateFromGameObject();
        };

        const spawnImageOrRect = (cx, cy, w, h, key, depth = 20) => {
          if (!key) {
            const r = this.add.rectangle(cx, cy, w, h, 0xff00ff, 0.16).setDepth(depth);
            this.physics.add.existing(r);
            return r;
          }
          const img = this.physics.add.image(cx, cy, key);
          img.setDisplaySize(w, h);
          img.setDepth(depth);
          return img;
        };

        this.attachWinSensor = (door) => {
          if (!door) return null;
          const b = door.getBounds();
          const s = this.add.rectangle(b.centerX, b.centerY, b.width, b.height, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
          door._winSensor = s;
          return s;
        };
        this.syncWinSensor = (door) => {
          const s = door?._winSensor;
          if (!door || !s?.body) return;
          const b = door.getBounds();
          s.x = b.centerX;
          s.y = b.centerY;
          if (s.body.setSize) s.body.setSize(b.width, b.height, true);
          if (s.body.updateFromGameObject) s.body.updateFromGameObject();
        };

        // Collect targets for triggers
        const move1Targets = []; // layer two: fake+solid objects
        const move3Targets = []; // layer four: fake OR solid objects
        const bombObjs = []; // layer four: death2 bombs (initially hidden)
        const winDoors = []; // doors that can be moved by move2

        // Render tile layers as images + build collisions and dynamic objects.
        for (const layer of tileLayers) {
          const layerName = String(layer.name || "").toLowerCase();
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            const isWin = p.win === true;
            drawTile(cx, cy, tile, isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH, isWin ? 30 : 10);

            // Death: keep as static sensors
            if (p.death === true) addStaticRect(this.deathSensors, cx, cy, tileW * 2, tileH / 2);

            // Win door: create a physical door object so it can be moved (move2 trigger).
            if (p.win === true) {
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              const key = url ? imageToKey.get(url) : null;
              const door = spawnImageOrRect(cx, cy, tileW * 2, tileH * 2, key, 40);
              freezeObj(door, true);
              this.winDoors.add(door);
              winDoors.push(door);
              this.attachWinSensor(door);
              continue;
            }

            // Bombs: layer four, death2 => hidden; on touch become visible then kill after 0.2s.
            if (layerName === "four" && p.death2 === true) {
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              const key = url ? imageToKey.get(url) : null;
              const bomb = spawnImageOrRect(cx, cy, tileW, tileW, key, 35);
              freezeObj(bomb, false);
              bomb.setVisible?.(false);
              if (bomb.body) bomb.body.enable = false;
              this.bombs.add(bomb);
              bombObjs.push(bomb);
              continue;
            }

            // move1 targets: layer two fake+solid objects, move down then fall out on move1 sensor.
            if (layerName === "two" && p.fake === true && p.solid === true) {
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              const key = url ? imageToKey.get(url) : null;
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key, 25);
              freezeObj(o, true);
              this.dynamicSolids.add(o);
              move1Targets.push(o);
              continue;
            }

            // move3 targets: layer four fake objects + specifically-marked solid objects.
            // Avoid turning the entire solid tilemap into dynamic bodies (would stall rendering).
            const isSoild = p.soild === true; // authored typo compatibility
            if (layerName === "four" && (p.fake === true || isSoild === true)) {
              const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
              const key = url ? imageToKey.get(url) : null;
              const o = spawnImageOrRect(cx, cy, tileW, tileH, key, 24);
              freezeObj(o, true);
              this.dynamicSolids.add(o);
              move3Targets.push(o);
              continue;
            }

            // Normal solids (static)
            if (p.solid === true) addStaticRect(this.solids, cx, cy);
          }
        }

        // player

        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        this.player.setDepth(1000); // 永远显示在最上层（避免被地图 tile 覆盖导致“看不到人物”）
        window.PTLevelShared?.applyPlayerSizing?.(this.player, tileW, tileH);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setDragX(this._tuning.dragX);
        this.player.body.setMaxVelocity(this._tuning.maxVx, this._tuning.maxVy);
        this.physics.add.collider(this.player, this.solids);
        this.physics.add.collider(this.player, this.dynamicSolids, (_a, b) => b?.body?.updateFromGameObject?.());

        // death => restart level (重置事件)

        const restart = () => window.PTLevelShared?.restartLevel?.(ctx, levelId);
        this.physics.add.overlap(this.player, this.deathSensors, () => {
          if (this.finished) return;
          restart?.();
        });
        this.physics.add.overlap(this.player, this.winSensors, async () => {
          if (this.finished) return;
          this.finished = true;
          try {
            await api.complete(levelId, 100);
            await refreshMe();
          } catch {}
          if (typeof onLevelWin === "function") onLevelWin(levelId);
        });

        // Bomb interaction: on touch => show bomb, after 0.2s kill player.
        const bombHitOnce = new Set();
        this.physics.add.overlap(this.player, this.bombs, (_p, bomb) => {
          if (!bomb || bombHitOnce.has(bomb)) return;
          bombHitOnce.add(bomb);
          bomb.setVisible?.(true);
          if (bomb.body) bomb.body.enable = true;
          this.time.delayedCall(200, () => {
            if (this.finished) return;
            window.PTLevelShared?.playDieSfx?.();
            restart?.();
          });
        });

        // Trigger sensors from object layers: move1/move2/move3
        const oneShot = (k, fn) => {
          if (this.triggered.has(k)) return;
          this.triggered.add(k);
          fn();
        };
        const makeSensorFromObj = (obj) => {
          if (!obj) return null;
          const x = Number(obj.x || 0);
          const y = Number(obj.y || 0);
          const w = Math.max(4, Number(obj.width || tileW));
          const h = Math.max(4, Number(obj.height || tileH));
          const s = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x00ffff, 0);
          this.physics.add.existing(s, true);
          return s;
        };
        const objByProp = (name) =>
          objects.find((o) => propTrue(o.properties, name) || hasPropName(o, name) || String(o.name || "").toLowerCase() === String(name).toLowerCase()) || null;
        const oMove1 = objByProp("move1");
        const oMove2 = objByProp("move2");
        const oMove3 = objByProp("move3");
        const sMove1 = makeSensorFromObj(oMove1);
        const sMove2 = makeSensorFromObj(oMove2);
        const sMove3 = makeSensorFromObj(oMove3);

        if (sMove1) {
          this.physics.add.overlap(this.player, sMove1, () =>
            oneShot("move1", () => {
              // two layer fake+solid objects: down 6 tiles, stop 2s, then fly out (or disappear).
              for (const o of move1Targets) {
                window.PTLevelShared?.tweenObjectsWithBodyAndSensorSync?.(this, o, {
                  y: o.y + tileH * 6,
                  duration: 600,
                  ease: "Sine.easeInOut",
                });
                this.time.delayedCall(2000, () => {
                  // fast drop out of map then destroy
                  window.PTLevelShared?.tweenObjectsWithBodyAndSensorSync?.(this, o, {
                    y: worldH + tileH * 6,
                    duration: 500,
                    ease: "Cubic.easeIn",
                    onComplete: () => {
                      try {
                        if (o.body) o.body.enable = false;
                        o.destroy();
                      } catch {}
                    },
                  });
                });
              }
            })
          );
        }

        if (sMove3) {
          this.physics.add.overlap(this.player, sMove3, () =>
            oneShot("move3", () => {
              // four layer fake+solid objects: move right 37 tiles at 1 tile/sec, then disappear.
              const dx = tileW * 37;
              const duration = 37000;
              for (const o of move3Targets) {
                window.PTLevelShared?.tweenObjectsWithBodyAndSensorSync?.(this, o, {
                  x: o.x + dx,
                  duration,
                  ease: "Linear",
                  onComplete: () => {
                    try {
                      if (o.body) o.body.enable = false;
                      o.destroy();
                    } catch {}
                  },
                });
              }
            })
          );
        }

        if (sMove2) {
          this.physics.add.overlap(this.player, sMove2, () =>
            oneShot("move2", () => {
              // win doors move down 11 tiles over 10 seconds; when finished, disable win sensor.
              const dy = tileH * 11;
              const duration = 10000;
              for (const door of winDoors) {
                if (!door) continue;
                window.PTLevelShared?.tweenObjectsWithBodyAndSensorSync?.(this, door, {
                  y: door.y + dy,
                  duration,
                  ease: "Linear",
                  onUpdate: () => this.syncWinSensor(door),
                  onComplete: () => {
                    const s = door._winSensor;
                    if (s?.body) s.body.enable = false;
                    try {
                      s?.destroy?.();
                    } catch {}
                  },
                });
              }
            })
          );
        }

        // input

        this.cursors = this.input.keyboard.createCursorKeys();
      },
      update: function () {
        if (!this.player?.body || this.finished) return;
        const tuning = this._tuning || { speed: 300, jumpV: -920 };

        const mobile = window.__PT_isMobileControl?.() === true;
        const left = this.cursors.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.cursors.right.isDown || (mobile && window.__PT_touchDown?.("right"));

        if (left) this.player.setVelocityX(-tuning.speed);
        else if (right) this.player.setVelocityX(tuning.speed);
        else this.player.setVelocityX(0);

        if (left) window.PTLevelShared?.setCharacterPose?.(this.player, "left", this.time?.now);
        else if (right) window.PTLevelShared?.setCharacterPose?.(this.player, "right", this.time?.now);
        else window.PTLevelShared?.setCharacterPose?.(this.player, "front", this.time?.now);

        const wantJump = Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.cursors.up) || (mobile && window.__PT_consumeTouchJump?.());
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) {
          this.player.setVelocityY(tuning.jumpV);
        }

        // 掉出地图边界：死亡重开

        const outOfMap = this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH;
        if (outOfMap) {
          window.PTLevelShared?.playFallDeathSfx?.();
          window.PTLevelShared?.restartLevel?.(ctx, levelId);
        }

        // Sync win sensors to doors (when doors tween).
        for (const door of this.winDoors.getChildren()) this.syncWinSensor(door);
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

