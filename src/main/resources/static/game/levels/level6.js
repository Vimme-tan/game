// Single-player Level 6
// Exposes: window.SinglePlayerLevels.startLevel6(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel6 = async function startLevel6(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.level6Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Level 6 map load failed: ${e?.message || String(e)}`);
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
      if (!props) return false;
      if (Array.isArray(props)) {
        const k = String(key || "").toLowerCase();
        return props.some((p) => {
          const name = String(p?.name || "").toLowerCase();
          if (name !== k) return false;
          return p?.value === true || p?.value === 1 || String(p?.value || "").toLowerCase() === "true";
        });
      }
      return false;
    }

    const resolveTilesetImageUrl = (imageSource, baseUrl) =>
      window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ?? null;

    // TSX 加载/解析统一走共享模块，减少重复代码
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
      alert("Level 6 resource load failed: TSX tileset parse failed.");
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
    const objLayer = allLayers.find((l) => l && l.type === "objectgroup" && String(l.name || "").toLowerCase() === "obj");
    const objObjects = Array.isArray(objLayer?.objects) ? objLayer.objects : [];
    const bornObj = objObjects.find((o) => propTrue(o.properties, "born")) || null;
    const touchObj = (key) =>
      objObjects.find((o) => propTrue(o.properties, key) || String(o.name || "").toLowerCase() === key) || null;

    const touch0 = touchObj("touch");
    const touch1 = touchObj("touch1");
    const touch2 = touchObj("touch2");
    const touch3 = touchObj("touch3") || touchObj("rouch3"); // authored as typo in map
    const touch4 = touchObj("touch4");
    const touch5 = touchObj("touch5");
    const touch6 = touchObj("touch6");
    const touch7 = touchObj("touch7"); // may be absent in current map
    const touch8 = touchObj("touch8");

    const dynPosKey = (cx, cy, layerName) => `${layerName}:${Math.round(cx)}:${Math.round(cy)}`;
    const dynamicTiles = []; // {layerName,cx,cy,props,imgKey,isWall,isSpike}
    const solids = [];
    const winRects = [];
    const staticDeaths = []; // non-moving death tiles

    for (const layer of tileLayers) {
      const layerName = String(layer.name || "").toLowerCase();
      const data = layer.data;
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const gid = data[idx] || 0;
        const tile = resolveTileFromGid(gid);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        const isSolid = p.solid === true;
        const isWin = p.win === true;
        const isDeath = p.death === true;

        const isMovingWall = (layerName === "two" || layerName === "five") && isSolid && (p.rrmove === true || p.rmove === true);
        const isMovingSpike =
          (layerName === "four" || layerName === "five" || layerName === "two") &&
          isDeath === true &&
          (p.upmove === true || p.dmove === true || p.dmover === true || p.umove === true || p.uumove === true);

        if (isMovingWall || isMovingSpike) {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const imgKey = url ? imageToKey.get(url) : null;
          dynamicTiles.push({ layerName, cx, cy, props: { ...p }, imgKey, isWall: isMovingWall, isSpike: isMovingSpike });
          continue;
        }

        if (isSolid) solids.push({ cx, cy, w: tileW, h: tileH });
        if (isWin) winRects.push({ cx, cy, w: tileW * 2, h: tileH * 2 });
        if (isDeath) staticDeaths.push({ cx, cy, w: tileW * 2, h: tileH / 2 });
      }
    }

    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    // 人物参数统一走共享模块（方便全关统一调整）
    const tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };

    const scene = {
      preload: function () {
        window.PTLevelShared?.loadCharacterSprites?.(this, assets);
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.PTLevelShared?.makeCharacterSpritesTransparent?.(this);
        this.finished = false;
        this.dead = false;
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 800;
        this.triggered = new Set();

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = tuning.gravityY;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        // 单人关卡背景统一：世界内灰底，世界外保持主页面背景
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // render static tiles (skip dynamic ones)
        const dynamicPos = new Set(dynamicTiles.map((t) => dynPosKey(t.cx, t.cy, t.layerName)));
        for (const layer of tileLayers) {
          const layerName = String(layer.name || "").toLowerCase();
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const gid = data[idx] || 0;
            const tile = resolveTileFromGid(gid);
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            if (dynamicPos.has(dynPosKey(cx, cy, layerName))) continue;
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(cx - tileW / 2, cy + tileH / 2, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
          }
        }

        // groups
        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        // Death groups: keep STATIC and DYNAMIC separated to avoid Arcade mixing quirks.
        this.deadlyStatic = this.physics.add.staticGroup();
        for (const d of staticDeaths) {
          const s = this.add.rectangle(d.cx, d.cy, d.w, d.h, 0xff0000, 0);
          this.physics.add.existing(s, true);
          this.deadlyStatic.add(s);
        }
        this.deadlyDynamic = this.physics.add.staticGroup();

        this.movingWallsRr = []; // rrmove+solid in layer two
        this.movingWallsR = []; // rmove+solid in layer two/five
        this.spikesUpmoveL4 = [];
        this.spikesDmoveL4 = [];
        this.spikesDmoverL4 = [];
        this.spikesUmoveL4 = [];
        this.spikesUumoveL4 = [];
        this.spikesUpmoveL5 = [];
        this.spikesUpmoveL2 = [];
        this.dynamicSpikeObjects = [];

        const spawnDyn = (t) => {
          const x = t.cx;
          const y = t.cy;
          const imgKey = t.imgKey;
          const o = imgKey ? this.physics.add.image(x, y, imgKey) : null;
          const bodyObj = o || this.add.rectangle(x, y, tileW, tileH, 0xff00ff, 0.2);
          if (!o) this.physics.add.existing(bodyObj);
          const isSpike = t?.isSpike === true;
          const isWall = t?.isWall === true;
          if (o) {
            // 第6关：所有刺宽*2，高/2（墙体仍保持正常 tile 尺寸）
            o.setDisplaySize(isSpike ? tileW * 2 : tileW, isSpike ? tileH / 2 : tileH);
            if (isSpike) {
              // 关键：刺按 tile 网格对齐（与静态砖块相同的 (x,y,origin) 体系），避免“整体右移几格”的错位感
              o.setOrigin(0, 1);
              o.setPosition(x - tileW / 2, y + tileH / 2);
            }
            // Walls should cover spikes visually.
            o.setDepth(isWall ? 45 : 15);
            // Hide ALL spikes visually (even while moving).
            if (isSpike) o.setVisible(false);
          } else {
            bodyObj.setDepth?.(isWall ? 45 : 15);
            if (isSpike && typeof bodyObj.setVisible === "function") bodyObj.setVisible(false);
          }
          const b = bodyObj.body;
          if (b) {
            // Must be fully "frozen" on start; only move when triggered.
            b.setAllowGravity(false);
            b.allowGravity = false;
            b.setImmovable(true);
            b.moves = false;
            b.setVelocity(0, 0);
            if (typeof b.setGravityY === "function") b.setGravityY(0);
            // 刺的碰撞体也按宽*2、高/2缩放（墙体保持默认）
            if (isSpike && typeof b.setSize === "function") b.setSize((tileW * 2) * 0.9, (tileH / 2) * 0.9, true);
            if (isSpike) b.enable = false;
          }
          bodyObj._spawn = { x, y };
          bodyObj._props = t.props;
          bodyObj._layer = t.layerName;
          if (isSpike) {
            bodyObj._deathBaseEnable = false;
            bodyObj._deathBaseVisible = false;
            const sensor = window.PTLevelShared?.attachRectSensorToObject?.(this, bodyObj, { enabled: false, color: 0xff0000 });
            if (sensor) this.deadlyDynamic.add(sensor);
            this.dynamicSpikeObjects.push(bodyObj);
          }
          return bodyObj;
        };

        for (const t of dynamicTiles) {
          const o = spawnDyn(t);
          const p = t.props || {};
          if (t.isWall) {
            if (p.rrmove === true) this.movingWallsRr.push(o);
            if (p.rmove === true) this.movingWallsR.push(o);
          } else if (t.isSpike) {
            if (t.layerName === "four") {
              if (p.upmove === true) this.spikesUpmoveL4.push(o);
              if (p.dmove === true) this.spikesDmoveL4.push(o);
              if (p.dmover === true) this.spikesDmoverL4.push(o);
              if (p.umove === true) this.spikesUmoveL4.push(o);
              if (p.uumove === true) this.spikesUumoveL4.push(o);
            }
            if (t.layerName === "five" && p.upmove === true) this.spikesUpmoveL5.push(o);
            if (t.layerName === "two" && p.upmove === true) this.spikesUpmoveL2.push(o);
          }
        }

        // spawn
        const bx = (Number(bornObj?.x) || tileW * 2) + (Number(bornObj?.width) || tileW) / 2;
        const byRaw = Number(bornObj?.y) || tileH * 2;
        const by = byRaw - Math.max(6, Math.min(tileH * 0.6, (Number(bornObj?.height) || tileH) * 0.6));
        this.bornX = bx;
        this.bornY = by;

        this.player = this.physics.add.sprite(bx, by, "char_front").setOrigin(0.5, 1);
        window.PTLevelShared?.applyPlayerSizing?.(this.player, tileW, tileH);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setDragX(tuning.dragX);
        this.player.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);

        this.physics.add.collider(this.player, this.solids);
        // moving walls are part of `deadly` group? no. add as collider targets explicitly
        for (const w of this.movingWallsRr) this.physics.add.collider(this.player, w);
        for (const w of this.movingWallsR) this.physics.add.collider(this.player, w);

        // win sensors
        this.winSensors = this.physics.add.staticGroup();
        for (const r of winRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        }

        const handleDeath = () => {
          if (this.dead || this.finished) return;
          this.dead = true;
          this.player.body.setVelocity(0, 0);
          // 需求：死亡 = 重新开始本关（事件全部重置）
          window.PTLevelShared?.restartLevel?.(ctx, levelId, window.SinglePlayerLevels?.startLevel6, 650);
        };
        this.handleDeath = handleDeath;

        this.physics.add.overlap(this.player, this.deadlyStatic, () => {
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          handleDeath();
        });
        this.physics.add.overlap(this.player, this.deadlyDynamic, () => {
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          handleDeath();
        });

        this.physics.add.overlap(this.player, this.winSensors, async () => {
          if (this.finished || this.dead) return;
          this.finished = true;
          try {
            await api.complete(levelId, 10000);
            await refreshMe();
          } catch {}
          if (typeof onLevelWin === "function") onLevelWin(levelId);
        });

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
        const revealSpikes = (targets) => {
          for (const o of targets) {
            if (!o) continue;
            if (typeof o.setVisible === "function") o.setVisible(true);
            if (typeof o.setDepth === "function") o.setDepth(35); // visible, but still under walls (45)
            o._deathBaseEnable = true;
            o._deathBaseVisible = true;
            if (o._sensor?.body) o._sensor.body.enable = true;
            window.PTLevelShared?.syncRectSensorToObject?.(o);
          }
        };
        const moveTween = (targets, dx, dy, duration, destroyOnDone) => {
          for (const o of targets) {
            if (!o) continue;
            window.PTLevelShared?.tweenObjectsWithBodyAndSensorSync?.(this, o, {
              x: o.x + dx,
              y: o.y + dy,
              duration,
              ease: "Sine.easeInOut",
              onComplete: destroyOnDone
                ? () => {
                    if (o._sensor?.body) o._sensor.body.enable = false;
                    o._sensor?.destroy?.();
                    if (o.body) o.body.enable = false;
                    o.destroy();
                  }
                : undefined,
            });
          }
        };
        const startFly = (targets, vx) => {
          for (const o of targets) {
            if (!o?.body) continue;
            // 先停止所有运动
            o.body.setVelocity(0, 0);
            o.body.setImmovable(true);
            o.body.setAllowGravity(false);
            o.body.allowGravity = false;
            o.body.moves = true;
            o.body.setVelocityX(vx);
            if (o._sensor?.body) {
              o._sensor.body.enable = true;
              // sensor 跟随对象移动：Arcade Physics 静态组不会自动移动，需要每帧同步
            }
            window.PTLevelShared?.syncRectSensorToObject?.(o);
          }
        };

        const sTouch = makeSensor(touch0);
        const sTouch1 = makeSensor(touch1);
        const sTouch2 = makeSensor(touch2);
        const sTouch3 = makeSensor(touch3);
        const sTouch4 = makeSensor(touch4);
        const sTouch5 = makeSensor(touch5);
        const sTouch6 = makeSensor(touch6);
        const sTouch7 = makeSensor(touch7);
        const sTouch8 = makeSensor(touch8);

        if (sTouch) {
          this.physics.add.overlap(this.player, sTouch, () =>
            oneShot("touch", () => {
              // two layer rrmove+solid walls quickly move right 3 tiles
              moveTween(this.movingWallsRr, tileW * 3, 0, 180, false);
            })
          );
        }
        if (sTouch1) {
          this.physics.add.overlap(this.player, sTouch1, () =>
            oneShot("touch1", () => {
              // four layer upmove+death spikes move up 2 tiles
              revealSpikes(this.spikesUpmoveL4);
              moveTween(this.spikesUpmoveL4, 0, -tileH * 2, 260, false);
            })
          );
        }
        if (sTouch2) {
          this.physics.add.overlap(this.player, sTouch2, () =>
            oneShot("touch2", () => {
              // dmove spikes: move down 5 tiles, then left 2 tiles (medium), then disappear.
              revealSpikes(this.spikesDmoveL4);
              // Requirements:
              // - dmove+death spikes rotate 90° (left) then execute: down 5 -> left 2 -> disappear.
              // - dmover+death spikes rotate 90° (right), start after ~1.5s: down 5 -> then move right until off-map.
              let dmoverStarted = false;
              const startDmover = () => {
                if (dmoverStarted) return;
                dmoverStarted = true;
                revealSpikes(this.spikesDmoverL4);
                for (const o of this.spikesDmoverL4) {
                  try {
                    o.setAngle?.(90);
                  } catch {}
                  window.PTLevelShared?.tweenObjectsWithBodyAndSensorSync?.(this, o, {
                    y: o.y + tileH * 5,
                    duration: 650,
                    ease: "Sine.easeInOut",
                    onComplete: () => {
                      // 确保 body 停止 tween，然后启动飞行
                      if (o.body) {
                        o.body.reset(o.x, o.y); // 确保 body 位置与 game object 一致
                        o.body.setVelocity(0, 0);
                        o.body.moves = false;
                      }
                      window.PTLevelShared?.syncRectSensorToObject?.(o);
                      startFly([o], 220);
                    },
                  });
                }
              };
              this.time?.delayedCall?.(1500, startDmover);

              this.spikesDmoveL4.forEach((o) => {
                // rotate left 90°
                try {
                  o.setAngle?.(-90);
                } catch {}
                window.PTLevelShared?.tweenObjectsWithBodyAndSensorSync?.(this, o, {
                  y: o.y + tileH * 5,
                  duration: 650,
                  ease: "Sine.easeInOut",
                  onComplete: () => {
                    window.PTLevelShared?.tweenObjectsWithBodyAndSensorSync?.(this, o, {
                      x: o.x - tileW * 2,
                      duration: 420,
                      ease: "Sine.easeInOut",
                      onComplete: () => {
                        if (o._sensor?.body) o._sensor.body.enable = false;
                        o._sensor?.destroy?.();
                        if (o.body) o.body.enable = false;
                        o.destroy();
                      },
                    });
                  },
                });
              });
            })
          );
        }
        if (sTouch3) {
          this.physics.add.overlap(this.player, sTouch3, () =>
              oneShot("touch3", () => {
                // 触发 touch3 后，touch1 也无法再触发
                this.triggered.add("touch1");
                // four layer umove+death spikes 只向上移动 1 格，不左右移动
                revealSpikes(this.spikesUmoveL4);
                moveTween(this.spikesUmoveL4, 0, -tileH * 1, 220, false);
              })
          );
        }
        if (sTouch4) {
          this.physics.add.overlap(this.player, sTouch4, () =>
            oneShot("touch4", () => {
              // two layer rmove+solid walls quickly move right 4 tiles
              const walls = this.movingWallsR.filter((o) => o?._layer === "two");
              moveTween(walls, tileW * 4, 0, 180, false);
            })
          );
        }
        if (sTouch5) {
          this.physics.add.overlap(this.player, sTouch5, () =>
            oneShot("touch5", () => {
              // four layer uumove spikes quickly move up 3 tiles
              revealSpikes(this.spikesUumoveL4);
              moveTween(this.spikesUumoveL4, 0, -tileH * 3, 200, false);
            })
          );
        }
        if (sTouch6) {
          this.physics.add.overlap(this.player, sTouch6, () =>
            oneShot("touch6", () => {
              // five layer upmove+death spikes move right until off-map (medium)
              revealSpikes(this.spikesUpmoveL5);
              startFly(this.spikesUpmoveL5, 220);
            })
          );
        }
        if (sTouch7) {
          this.physics.add.overlap(this.player, sTouch7, () =>
            oneShot("touch7", () => {
              // five layer rmove+solid walls quickly move right 4 tiles
              const walls = this.movingWallsR.filter((o) => o?._layer === "five");
              moveTween(walls, tileW * 4, 0, 180, false);
            })
          );
        }
        if (sTouch8) {
          this.physics.add.overlap(this.player, sTouch8, () =>
            oneShot("touch8", () => {
              // two layer upmove+death spikes move left until off-map (medium)
              revealSpikes(this.spikesUpmoveL2);
              startFly(this.spikesUpmoveL2, -220);
            })
          );
        }

        // Controls
        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.UP;
        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
      },
      update: function () {
        if (!this.player?.body) return;
        if (this.dead || this.finished) return;

        // viewport boundary death+respawn
        const vb = this.cameras.main.worldView;
        const pb = this.player.getBounds();
        const hitVb = pb.bottom >= vb.bottom - 2 || pb.top <= vb.top + 2 || pb.left <= vb.left + 2 || pb.right >= vb.right - 2;
        if (hitVb) {
          this.handleDeath();
          return;
        }

        // moving spikes fly out cleanup (dynamic only)
        for (const o of this.dynamicSpikeObjects) {
          if (!o?.body) continue;
          if (!o.body.enable && !o._sensor?.body?.enable) continue;
          window.PTLevelShared?.syncRectSensorToObject?.(o);
          if (o.x < -tileW * 2 || o.x > worldW + tileW * 2 || o.y > worldH + tileH * 2 || o.y < -tileH * 2) {
            if (o._sensor?.body) o._sensor.body.enable = false;
            o._sensor?.destroy?.();
            o.body.enable = false;
            o.destroy();
          }
        }

        const mobile = window.__PT_isMobileControl?.() === true;
        const left = this.p1Keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.p1Keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
        const speed = tuning.speed;
        if (left) this.player.setVelocityX(-speed);
        else if (right) this.player.setVelocityX(speed);
        else this.player.setVelocityX(0);
        if (left) window.PTLevelShared?.setCharacterPose?.(this.player, "left", this.time?.now);
        else if (right) window.PTLevelShared?.setCharacterPose?.(this.player, "right", this.time?.now);
        else window.PTLevelShared?.setCharacterPose?.(this.player, "front", this.time?.now);

        const wantJump = Phaser.Input.Keyboard.JustDown(this.p1Keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(tuning.jumpV);
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

