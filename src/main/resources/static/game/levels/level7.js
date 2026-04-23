// Single-player Level 7 (match previous single-player map logic)
// Exposes:
// window.SinglePlayerLevels.startLevel7(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel7 = async function startLevel7(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.level7Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Level 7 map load failed: ${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;
    const mapBase = new URL(mapUrl);

    // level7 旧贴图映射：1.png -> grey.png

    const lvl7LegacyMap = { "1.png": "grey.png", "2.png": "earthWall.png", "3.png": "earthWall2.png", "4.png": "doorRedStroked.png", "5.png": "trap.png" };
    const resolveTilesetImageUrl = (imageSource, baseUrl) =>
      window.PTLevelShared?.resolveTilesetImageUrlEx?.(imageSource, baseUrl, lvl7LegacyMap) ??
      window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ??
      null;
    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsxTyped?.(tsxText);
    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    const tilesetInfos = [];
    for (const ts of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(ts.firstgid || 1);
      if (!ts.source) continue;
      const tsxText = await fetchTsxText(ts.source, mapBase);
      const parsed = parseTsx(tsxText);
      tilesetInfos.push({ firstgid, ...parsed });
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Level 7 resource load failed: TSX tileset parse failed.");
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
      const tile = chosen.tiles ? chosen.tiles[tileId] : null;
      if (!tile) return null;
      return { ...tile, tileId };
    }

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const opLayer = allLayers.find((l) => l && l.type === "objectgroup" && String(l.name || "").toLowerCase() === "op");
    const opObjects = Array.isArray(opLayer?.objects) ? opLayer.objects : [];

    const hasPropName = (props, key) => Array.isArray(props) && props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    const propTrue = (props, key) =>
      Array.isArray(props) &&
      props.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase() && (p?.value === true || p?.value === 1 || String(p?.value || "").toLowerCase() === "true"));

    const bornObj = opObjects.find((o) => hasPropName(o?.properties, "born") || propTrue(o?.properties, "born")) || null;
    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y - Math.max(6, Math.min(tileH * 0.6, (bornObj.height || tileH) * 0.6)) : tileH * 2;

    const sensorObj = (name) => opObjects.find((o) => hasPropName(o?.properties, name) || propTrue(o?.properties, name) || String(o.name || "").toLowerCase() === String(name).toLowerCase()) || null;
    const s_jumpfall = sensorObj("jumpfall");
    const s_bombfall = sensorObj("bombfall");
    const s_move1 = sensorObj("move1");
    const s_move2 = sensorObj("move2");
    const s_move3 = sensorObj("move3");
    const s_push = sensorObj("push");

    // preload images used by tilesets

    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles || {})) {
        const t = ts.tiles[Number(idStr)];
        if (!t?.imageSource) continue;
        const url = resolveTilesetImageUrl(t.imageSource, mapBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `lvl7_${ts.name}_${idStr}`);
      }
    }

    const tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };

    const scene = {
      preload: function () {
        this.load.on("loaderror", (file) => {
          try {
            console.warn("[level7 loaderror]", file?.key, file?.src || file?.url);
          } catch {}
        });
        window.PTLevelShared?.loadCharacterSprites?.(this, assets);
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.PTLevelShared?.makeCharacterSpritesTransparent?.(this);

        this.finished = false;
        this._restarting = false;
        this._spawnGraceUntil = this.time.now + 650; // 防止出生点立刻触发死亡导致闪
        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = tuning.gravityY;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        const layerByName = (n) => tileLayers.find((l) => String(l.name || "").toLowerCase() === String(n)) || null;
        const L1 = layerByName("one");
        const L2 = layerByName("two");
        const L3 = layerByName("three");
        const L4 = layerByName("four");
        const ordered = [L1, L2, L3, L4].filter(Boolean);

        // 预收solid 单元格：用于“刺solid 重叠 -> 初始隐藏（仅事件触发才显示）
        const solidCells = new Set();
        for (const layer of ordered) {
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            if (p.solid === true) {
              const col = idx % mapW;
              const row = Math.floor(idx / mapW);
              solidCells.add(`${col},${row}`);
            }
          }
        }

        const drawTile = (col, row, tile, displayW = tileW, displayH = tileH, depth = 10) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          const cx = col * tileW + tileW / 2;
          const cy = row * tileH + tileH / 2;
          if (!key) {
            this.add.rectangle(cx, cy, displayW, displayH, 0x000000, 0.06).setDepth(depth);
            return null;
          }
          const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
          img.setDisplaySize(displayW, displayH);
          img.setDepth(depth);
          return img;
        };

        const addStaticRect = (group, cx, cy, w, h) => {
          const r = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
          this.physics.add.existing(r, true);
          group.add(r);
          return r;
        };

        const freezeObj = (o) => {
          if (!o?.body) return;
          o.body.allowGravity = false;
          if (o.body.setAllowGravity) o.body.setAllowGravity(false);
          o.body.immovable = true;
          if (o.body.setImmovable) o.body.setImmovable(true);
          o.body.moves = false;
          o.body.setVelocity(0, 0);
        };

        // death 判定用：让“可见刺”与“判定区”绑定，方便移动/隐藏/显示同步

        const attachDeadlySensor = (o) => {
          if (!o) return null;
          const b = o.getBounds();
          const s = this.add.rectangle(b.centerX, b.centerY, b.width, b.height, 0xff0000, 0);
          this.physics.add.existing(s, true);
          o._sensor = s;
          this.deadly.add(s);
          return s;
        };
        const syncDeadlySensor = (o) => {
          const s = o?._sensor;
          if (!o || !s?.body) return;
          const b = o.getBounds();
          s.x = b.centerX;
          s.y = b.centerY;
          if (s.body.setSize) s.body.setSize(b.width, b.height, true);
          s.body.updateFromGameObject();
        };
        const setDeadlyActive = (o, active) => {
          if (!o) return;
          const s = o._sensor;
          if (active) {
            o.setVisible(true);
            if (s?.body) s.body.enable = true;
          } else {
            o.setVisible(false);
            if (s?.body) s.body.enable = false;
          }
        };

        const spawnObjTile = (col, row, tile, displayW, displayH, depth = 30) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          const cx = col * tileW + tileW / 2;
          const cy = row * tileH + tileH / 2;
          const obj = key ? this.physics.add.image(cx, cy, key) : this.add.rectangle(cx, cy, displayW, displayH, 0xff00ff, 0.2);
          if (!key) this.physics.add.existing(obj);
          if (obj.setDisplaySize) obj.setDisplaySize(displayW, displayH);
          obj.setDepth(depth);
          freezeObj(obj);
          return obj;
        };

        // groups

        this.solids = this.physics.add.staticGroup();
        this.deadly = this.physics.add.staticGroup();
        this.dynamicSolids = this.physics.add.group();
        this.dynamicDeadly = this.physics.add.group();
        this.dynamicBombs = this.physics.add.group();

        // buckets by behavior

        const oneDeathMoveLeft = [];
        const oneRmoveWalls = [];
        const twoWalls = [];
        const twoWallsRmove = [];
        const twoDeathUp = [];
        const twoKey = [];
        const twoBombs = [];
        const threeDeath = [];
        const threeWallsRmove = [];
        const threeKey = [];
        const fourWalls = [];
        const fourDeath = [];
        const fourBombs = [];

        // scan tiles, render, and spawn interactive objects

        for (const layer of ordered) {
          const lname = String(layer.name || "").toLowerCase();
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            const isSolid = p.solid === true;
            const isDeath = p.death === true;
            const isWin = p.win === true;
            const isRmove = p.rmove === true;
            const isTouchKey = p.touch === true;
            // 炸弹：部tsx（例dung2）没有给 bomb tile 配置 properties            // 这里用“属性优+ 贴图名兜底”识别，保证炸弹一定会走“初始隐藏”逻辑
            const imgName = String(tile.imageSource || "").toLowerCase();
            const isBomb = (p.death2 === true && p.falling === true) || imgName.includes("bomb");

            // render base tile unless we spawn it as object

            const asObj = isTouchKey || isBomb || (isSolid && isRmove) || isDeath;
            if (!asObj) {
              drawTile(col, row, tile, isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH, isWin ? 30 : 8);
            }

            if (isWin) addStaticRect(this.deadly /*unused*/, -1, -1, 1, 1); // placeholder; win handled by door objects if any

            if (isSolid && !isRmove) {
              addStaticRect(this.solids, cx, cy, tileW, tileH);
              continue;
            }

            if (isSolid && isRmove) {
              const o = spawnObjTile(col, row, tile, tileW, tileH, 22);
              this.dynamicSolids.add(o);
              if (lname === "one") oneRmoveWalls.push(o);
              else if (lname === "two") twoWallsRmove.push(o);
              else if (lname === "three") threeWallsRmove.push(o);
              continue;
            }

            if (isDeath) {
              // 刺尺寸：按单人关卡一致（2格，半格
              const o = spawnObjTile(col, row, tile, tileW * 2, tileH / 2, 26);

              this.dynamicDeadly.add(o);
              // 需求：刺集体向右移1               o.x += tileW * 1;
              // bug汇总：刺向左移动半格，向下移动 0.3 格（在现有基础上微调）
              o.x -= tileW * 0.5;
              o.y += tileH * 0.3;
              if (o.body?.updateFromGameObject) o.body.updateFromGameObject();

              // death 判定区：与刺绑定，并同步到移动后位置
              attachDeadlySensor(o);
              syncDeadlySensor(o);

              // 需求：solid 墙体重叠的刺初始隐藏，只有事件触发才显示

              const overlappedSolid = solidCells.has(`${col},${row}`);
              if (overlappedSolid) setDeadlyActive(o, false);

              if (lname === "one") oneDeathMoveLeft.push(o);
              else if (lname === "two") twoDeathUp.push(o);
              else if (lname === "three") threeDeath.push(o);
              else if (lname === "four") fourDeath.push(o);
              continue;
            }

            if (isTouchKey) {
              const o = spawnObjTile(col, row, tile, tileW, tileH, 40);
              o.setVisible(false);
              o.body.enable = false;
              if (lname === "two") twoKey.push(o);
              else if (lname === "three") threeKey.push(o);
              continue;
            }

            if (isBomb) {
              // 炸弹改为正方形（居中显示，避免“太偏”）

              const o = spawnObjTile(col, row, tile, tileW, tileW, 35);
              o.setVisible(false);
              o.body.enable = false;
              this.dynamicBombs.add(o);
              if (lname === "two") twoBombs.push(o);
              else if (lname === "four") fourBombs.push(o);
              continue;
            }
          }
        }

        // static solids from layer2/4 non-rmove already covered by props scan above
        // For your description, layer2/4 walls are all solid; they are in tile data.

        // player

        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        this.player.setDepth(1000);
        window.PTLevelShared?.applyPlayerSizing?.(this.player, tileW, tileH);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setDragX(tuning.dragX);
        this.player.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);
        this.physics.add.collider(this.player, this.solids);
        this.physics.add.collider(this.player, this.dynamicSolids, (_a, b) => b?.body?.updateFromGameObject?.());

        const restart = () => {
          if (this._restarting) return;
          this._restarting = true;
          window.PTLevelShared?.restartLevel?.(ctx, levelId, window.SinglePlayerLevels?.startLevel7, 0);
        };

        // death overlap

        this.physics.add.overlap(this.player, this.deadly, () => {
          if (this.time.now < this._spawnGraceUntil) return;
          restart();
        });
        this.physics.add.overlap(this.player, this.dynamicBombs, () => {
          if (this.time.now < this._spawnGraceUntil) return;
          restart();
        });

        // keys

        this.haveKey = false;
        const keyTouch = (k) => {
          if (!k?.body) return;
          this.haveKey = true;
          // 需求：拿到 two touch 钥匙后，two death 刺向下移2 格（缩回墙内
          if (twoKey.includes(k)) {
            for (const s of twoDeathUp) {
              setDeadlyActive(s, true);
              tweenMove(s, 0, tileH * 2, 180, null);
            }
          }
          try {
            k.destroy();
          } catch {}
        };
        for (const k of [...twoKey, ...threeKey]) this.physics.add.overlap(this.player, k, () => keyTouch(k));

        // sensors

        const makeSensor = (obj) => {
          if (!obj) return null;
          const x = Number(obj.x || 0);
          const y = Number(obj.y || 0);
          const w = Math.max(4, Number(obj.width || tileW));
          const h = Math.max(4, Number(obj.height || tileH));
          const s = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x00ffff, 0);
          this.physics.add.existing(s, true);
          return s;
        };
        const sensors = {
          jumpfall: makeSensor(s_jumpfall),
          bombfall: makeSensor(s_bombfall),
          move1: makeSensor(s_move1),
          move2: makeSensor(s_move2),
          move3: makeSensor(s_move3),
          push: makeSensor(s_push),
        };

        const oneShot = new Set();
        const once = (k, fn) => {
          if (oneShot.has(k)) return;
          oneShot.add(k);
          fn();
        };

        const tweenMove = (obj, dx, dy, duration, onComplete) => {
          if (!obj) return;
          this.tweens.add({
            targets: obj,
            x: obj.x + dx,
            y: obj.y + dy,
            duration,
            ease: "Linear",
            onUpdate: () => {
              obj?.body?.updateFromGameObject?.();
              syncDeadlySensor(obj);
            },
            onComplete,
          });
        };

        const activateAndMove = (list, dx, dy, duration, after) => {
          for (const o of list) {
            setDeadlyActive(o, true);
            tweenMove(o, dx, dy, duration, after ? () => after(o) : null);
          }
        };

        // 记录会移动的平台，用于“载人”（人物站上去不会掉
        this._carryPlatforms = [];

        for (const w of oneRmoveWalls) this._carryPlatforms.push(w);
        for (const w of twoWallsRmove) this._carryPlatforms.push(w);
        for (const w of threeWallsRmove) this._carryPlatforms.push(w);

        // move1：three rmove 属性墙迅速右2
         if (sensors.move1) {

          this.physics.add.overlap(this.player, sensors.move1, () => {
            once("move1", () => {
              for (const w of threeWallsRmove) tweenMove(w, tileW * 2, 0, 220, null);
            });
          });
        }

        // push：三层钥匙出现（并向右“推出去”）

        if (sensors.push) {
          this.physics.add.overlap(this.player, sensors.push, () => {
            once("push", () => {
              for (const k of threeKey) {
                k.setVisible(true);
                k.body.enable = true;
                // 需求：三层钥匙向右平移出地
                tweenMove(k, worldW + tileW * 10, 0, 520, () => {

                  try {
                    k.destroy();
                  } catch {}
                });
              }
              // one: rmove+solid 墙向左推 9 格（符合旧逻辑
              for (const w of oneRmoveWalls) tweenMove(w, -tileW * 9, 0, 260, null);
            });
          });
        }

        // move2：one death 刺整体向左飞出地
        if (sensors.move2) {

          this.physics.add.overlap(this.player, sensors.move2, () => {
            once("move2", () => {
              // 需求：触发后才显示；适当速度，能跳跃躲开

              const moveTiles = (worldW + tileW * 10) / tileW;
              // 速度适中：按距离动态算时长，避免“太快来不及躲
              const dur = Math.max(2600, Math.round(moveTiles * 220));
              activateAndMove(oneDeathMoveLeft, -(worldW + tileW * 10), 0, dur, (o) => {
                try {
                  o._sensor?.destroy?.();
                  o.destroy();
                } catch {}
              });
            });
          });
        }

        // move3：two death 刺上格；two rmove wall 下移15格；two 的钥匙出
        if (sensors.move3) {

          this.physics.add.overlap(this.player, sensors.move3, () => {
            once("move3", () => {
              // 触发时显示并移动（刺贴地              activateAndMove(twoDeathUp, 0, -tileH * 1, 160, null);

              for (const w of twoWallsRmove) tweenMove(w, 0, tileH * 15, 520, null);
              for (const k of twoKey) {
                k.setVisible(true);
                k.body.enable = true;
              }
            });
          });
        }

        // jumpfall：three death 刺上
        if (sensors.jumpfall) {

          this.physics.add.overlap(this.player, sensors.jumpfall, () => {
            once("jumpfall", () => {
              activateAndMove(threeDeath, 0, -tileH * 1, 160, null);
            });
          });
        }

        // bombfall：需要拿到钥匙才触发；two 的炸弹显现并下落5格后消失

        if (sensors.bombfall) {
          this.physics.add.overlap(this.player, sensors.bombfall, () => {
            once("bombfall", () => {
              if (!this.haveKey) return;
              let pending = twoBombs.length;
              for (const b of twoBombs) {
                b.setVisible(true);
                b.body.enable = true;
                tweenMove(b, 0, tileH * 5, 240, () => {
                  try {
                    b.destroy();
                  } catch {}
                  pending = Math.max(0, pending - 1);
                  if (!this.finished && pending === 0 && typeof onLevelWin === "function") {
                    this.finished = true;
                    onLevelWin(levelId, { message: "7 关完成" });
                  }
                });
              }
            });
          });
        }

        // controls

        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || { p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" } };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
        this.keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
      },
      update: function () {
        if (!this.player?.body || this.finished) return;

        // 可移动平台“载人”：人物站在平台上时，平台移动多少，人物就跟随多少（避免掉下穿透）

        if (Array.isArray(this._carryPlatforms) && this._carryPlatforms.length) {
          const carryIfOn = (plat, dx, dy) => {
            if (!dx && !dy) return;
            const p = this.player;
            if (!p?.body || !plat) return;
            if (!(p.body.blocked.down || p.body.touching.down)) return;
            const pb = p.getBounds();
            const b = plat.getBounds ? plat.getBounds() : null;
            if (!b) return;
            const footY = pb.bottom;
            if (footY < b.top - 3 || footY > b.top + 14) return;
            if (pb.right < b.left + 2 || pb.left > b.right - 2) return;
            p.x += dx;
            p.y += dy;
          };
          for (const plat of this._carryPlatforms) {
            if (!plat) continue;
            const lastX = typeof plat._lastX === "number" ? plat._lastX : plat.x;
            const lastY = typeof plat._lastY === "number" ? plat._lastY : plat.y;
            const dx = plat.x - lastX;
            const dy = plat.y - lastY;
            plat._lastX = plat.x;
            plat._lastY = plat.y;
            if (dx || dy) carryIfOn(plat, dx, dy);
          }
        }

        const mobile = window.__PT_isMobileControl?.() === true;
        const speed = tuning.speed;
        const left = this.keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
        if (left) this.player.setVelocityX(-speed);
        else if (right) this.player.setVelocityX(speed);
        else this.player.setVelocityX(0);

        if (left) window.PTLevelShared?.setCharacterPose?.(this.player, "left", this.time?.now);
        else if (right) window.PTLevelShared?.setCharacterPose?.(this.player, "right", this.time?.now);
        else window.PTLevelShared?.setCharacterPose?.(this.player, "front", this.time?.now);

        const wantJump = Phaser.Input.Keyboard.JustDown(this.keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(tuning.jumpV);

        // 越界也判死（避免卡出世界
        if (this.time.now >=
 this._spawnGraceUntil) {
          if (this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH) {
            window.PTLevelShared?.playFallDeathSfx?.();
            window.PTLevelShared?.restartLevel?.(ctx, levelId, window.SinglePlayerLevels?.startLevel7, 0);
          }
        }
      },
    };

    const vp = window.__PT_getGameViewport ? window.__PT_getGameViewport() : { width: 960, height: 640 };
    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "phaserMount",
      width: vp.width,
      height: vp.height,
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();
