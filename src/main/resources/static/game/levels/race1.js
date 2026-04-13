// Double-player Race Level 1 (JSON)
// Exposes: window.DoublePlayerLevels.startRaceLevel1(ctx, levelId)
(function () {
  window.DoublePlayerLevels = window.DoublePlayerLevels || {};

  window.DoublePlayerLevels.startRaceLevel1 = async function startRaceLevel1(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.raceLevel1Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Race level 1 map load failed: ${e?.message || String(e)}`);
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

    // tilesets
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
      alert("Race level 1 resource load failed: TSX tileset parse failed.");
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

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objects = allLayers
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);

    const hasPropName = (obj, key) =>
      Array.isArray(obj?.properties) && obj.properties.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    const hasTrueProp = (obj, key) =>
      Array.isArray(obj?.properties) &&
      obj.properties.some((p) => String(p.name || "").toLowerCase() === key && (p.value === true || p.value === 1 || String(p.value || "").toLowerCase() === "true"));
    // born 属性在部分图里可能是 false；只要属性名存在也视为出生点
    const born1Obj = objects.find((o) => hasTrueProp(o, "born1") || hasTrueProp(o, "bron1") || hasPropName(o, "born1") || hasPropName(o, "bron1")) || null;
    const born2Obj = objects.find((o) => hasTrueProp(o, "born2") || hasPropName(o, "born2")) || null;

    function toSpawn(o, fallback) {
      if (!o) return fallback;
      return {
        x: o.x + (o.width || tileW) / 2,
        // Lift spawn point a bit so feet stand on born platform instead of inside it.
        y: o.y - Math.max(6, Math.min(tileH * 0.6, (o.height || tileH) * 0.6)),
      };
    }

    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    // preload images
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

    const solids = [];
    const winRects = [];
    const movers = [];
    const spikes = [];

    for (const layer of tileLayers) {
      const layerName = String(layer.name || "").toLowerCase();
      const data = layer.data;
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        const url = tile.imageSource ? resolveTilesetImageUrl(tile.imageSource, mapBase) : null;
        const key = url ? imageToKey.get(url) : null;
        if (!key) continue;

        const isSolid = p.solid === true;
        const isWin = p.win === true;
        const isDeath = p.death === true;
        const isL = p.lmove === true;
        const isR = p.rmove === true;
        const isD = p.dmove === true;
        const isU = p.upmove === true;

        const hasMove = isL || isR || isD || isU;

        if (isWin) winRects.push({ cx, cy, w: tileW, h: tileH });

        // Moving walls: solid + movement props.
        // lmove/rmove: left 3 then right 3 (or opposite), periodic
        // dmove/upmove: down 6 then up 6 (or opposite), periodic
        if (isSolid && hasMove) {
          if (isL || isR) {
            movers.push({
              x: col * tileW,
              y: (row + 1) * tileH,
              key,
              axis: "x",
              dir: isL ? -1 : 1,
              min: -3,
              max: 3,
            });
          } else {
            movers.push({
              x: col * tileW,
              y: (row + 1) * tileH,
              key,
              axis: "y",
              dir: isU ? -1 : 1,
              min: -6,
              max: 6,
            });
          }
          continue;
        }

        // Spikes rotation and special spike-follow for rturn2
        if (isDeath) {
          const angle = p.dturn ? 180 : p.rturn || p.rturn2 ? 90 : p.lturn ? -90 : 0;
          // rturn2 spikes should move together with upmove wall: move up 6 then down 6 periodically
          if (p.rturn2 === true) {
            spikes.push({ x: col * tileW, y: (row + 1) * tileH, key, axis: "y", dir: -1, min: -6, max: 6, angle, speedGroup: "upmove" });
          } else {
            spikes.push({ x: col * tileW, y: (row + 1) * tileH, key, axis: null, dir: 0, min: 0, max: 0, angle });
          }
          continue;
        }

        if (isSolid) solids.push({ cx, cy, w: tileW, h: tileH });
      }
    }

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

        // 保存到 scene 上，供 update 使用（避免出现 “tuning is not defined”）
        this._tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = this._tuning.gravityY;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        // 双人关卡也统一：世界内灰底，世界外保持主页面背景
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // Render static tiles (skip moving tiles from layer two/three)
        for (const layer of tileLayers) {
          const layerName = String(layer.name || "").toLowerCase();
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const isMove = p.lmove === true || p.rmove === true || p.dmove === true || p.upmove === true || p.rturn2 === true;
            const isDeath = p.death === true;
            // death spikes are spawned separately (for rotation / moving rturn2)
            if (isMove || isDeath) {
              // but keep win door visible
              if (p.win === true) {
                // fallthrough to draw
              } else {
                continue;
              }
            }
            if (isMove) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = p.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
          }
        }

        // solids
        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        // movers
        this.movers = [];
        for (const m of movers) {
          const s = this.add.image(m.x, m.y, m.key).setOrigin(0, 1);
          s.setDisplaySize(tileW, tileH);
          this.physics.add.existing(s);
          s.body.allowGravity = false;
          s.body.immovable = true;
          s._axis = m.axis;
          s._baseX = s.x;
          s._baseY = s.y;
          s._dir = m.dir;
          s._min = m.min;
          s._max = m.max;
          // medium speed, consistent across movers
          s._speed = (m.axis === "x" ? tileW : tileH) * 3.2;
          this.movers.push(s);
        }

        // spikes (death): rotation + optional movement for rturn2
        // Arcade Physics 不支持旋转碰撞体，这里用“可见图片 + 隐形矩形判定区”来让 death 区域随旋转变化（AABB）。
        this.deathSensors = this.physics.add.staticGroup();
        this.spikes = [];
        for (const s0 of spikes) {
          const sp = this.add.image(s0.x, s0.y, s0.key).setOrigin(0, 1);
          sp.setDisplaySize(tileW * 2, tileH / 2);
          this.physics.add.existing(sp);
          sp.body.allowGravity = false;
          sp.body.immovable = true;
          sp._axis = s0.axis;
          sp._baseX = sp.x;
          sp._baseY = sp.y;
          sp._dir = s0.dir;
          sp._min = s0.min;
          sp._max = s0.max;
          sp._speed = tileH * 3.2;
          sp.angle = Number(s0.angle || 0);
          // 小修正：旋转后的刺在不同贴图下会出现偏移，按你的要求手动对齐
          // dturn: 上移1格，右移2格；rturn: 上移2格；lturn: 上移1格
          if (sp.angle === 180) {
            sp.x += tileW * 2;
            sp.y -= tileH * 1;
          } else if (sp.angle === 90) {
            sp.y -= tileH * 2;
          } else if (sp.angle === -90) {
            sp.y -= tileH * 1;
          }
          sp._baseX = sp.x;
          sp._baseY = sp.y;

          // 旋转后更新 body 位置（避免“显示移动了但判定没动”）
          if (sp.body?.updateFromGameObject) sp.body.updateFromGameObject();

          // 创建/绑定一个随图片旋转变化的 death 判定区（矩形 AABB）
          const b = sp.getBounds();
          const s = this.add.rectangle(b.centerX, b.centerY, b.width, b.height, 0xff0000, 0);
          this.physics.add.existing(s, true);
          sp._sensor = s;
          this.deathSensors.add(s);
          this.spikes.push(sp);
        }

        // players
        const mkPlayer = (x, y, tint) => {
          const tuning = this._tuning || { speed: 300, jumpV: -920, maxVx: 320, maxVy: 900, dragX: 900 };
          const p = this.physics.add.sprite(x, y, "char_front").setOrigin(0.5, 1);
          p.setTint(tint);
          p.setDisplaySize(tileW * 0.55 * 2, tileH * 0.85 * 2);
          p.body.setCollideWorldBounds(true);
          p.body.setSize(p.displayWidth, p.displayHeight, false);
          p.body.setOffset(0, 0);
          p.body.setDragX(tuning.dragX);
          p.body.setMaxVelocity(tuning.maxVx, tuning.maxVy);
          this.physics.add.collider(p, this.solids);
          for (const m of this.movers) this.physics.add.collider(p, m);
          // death 判定统一走 deathSensors（让旋转后的判定区也一致）
          this.physics.add.overlap(p, this.deathSensors, () => this.respawnPlayer(p));
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
        };

        // win sensors
        this.winSensors = this.physics.add.staticGroup();
        for (const r of winRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        }
        const finish = (who) => {
          if (this.finished) return;
          this.finished = true;
          if (typeof onLevelWin === "function") onLevelWin(levelId, { title: "Race Finished", message: `${who} reached the goal.` });
        };
        this.physics.add.overlap(this.p1, this.winSensors, () => finish("P1"));
        this.physics.add.overlap(this.p2, this.winSensors, () => finish("P2"));

        // inputs (from settings)
        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
          p2: { left: "KeyA", right: "KeyD", jump: "KeyW" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
        const p2Left = codeToPhaserKeyCode(kb.p2.left) ?? Phaser.Input.Keyboard.KeyCodes.A;
        const p2Right = codeToPhaserKeyCode(kb.p2.right) ?? Phaser.Input.Keyboard.KeyCodes.D;
        const p2Jump = codeToPhaserKeyCode(kb.p2.jump) ?? Phaser.Input.Keyboard.KeyCodes.W;

        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
        this.p2Keys = this.input.keyboard.addKeys({ left: p2Left, right: p2Right, jump: p2Jump });
      },
      update: function () {
        const dt = this.game.loop.delta / 1000;

        // mover updates (ping-pong)
        for (const m of this.movers) {
          if (m._axis === "x") {
            m.x += m._dir * m._speed * dt;
            const off = m.x - m._baseX;
            if (off <= m._min * tileW) {
              m.x = m._baseX + m._min * tileW;
              m._dir = 1;
            } else if (off >= m._max * tileW) {
              m.x = m._baseX + m._max * tileW;
              m._dir = -1;
            }
          } else {
            m.y += m._dir * m._speed * dt;
            const off = m.y - m._baseY;
            if (off <= m._min * tileH) {
              m.y = m._baseY + m._min * tileH;
              m._dir = 1;
            } else if (off >= m._max * tileH) {
              m.y = m._baseY + m._max * tileH;
              m._dir = -1;
            }
          }
          m.body.updateFromGameObject();
        }

        for (const sp of this.spikes) {
          if (sp._axis === "y") {
            sp.y += sp._dir * sp._speed * dt;
            const off = sp.y - sp._baseY;
            if (off <= sp._min * tileH) {
              sp.y = sp._baseY + sp._min * tileH;
              sp._dir = 1;
            } else if (off >= sp._max * tileH) {
              sp.y = sp._baseY + sp._max * tileH;
              sp._dir = -1;
            }
            sp.body.updateFromGameObject();

            // 同步更新 death sensor 的位置和尺寸（角度不变，但 AABB 会随旋转维持一致）
            if (sp._sensor?.body?.updateFromGameObject) {
              const b = sp.getBounds();
              sp._sensor.x = b.centerX;
              sp._sensor.y = b.centerY;
              sp._sensor.width = b.width;
              sp._sensor.height = b.height;
              if (sp._sensor.body.setSize) sp._sensor.body.setSize(b.width, b.height, true);
              sp._sensor.body.updateFromGameObject();
            }
          }
        }

        if (this.finished) return;
        const outOfMap = (p) =>
          !!p &&
          (p.x < -tileW || p.x > worldW + tileW || p.y < -tileH || p.y > worldH + tileH);
        if (outOfMap(this.p1)) this.respawnPlayer(this.p1);
        if (outOfMap(this.p2)) this.respawnPlayer(this.p2);

        // P1 / P2
        const tuning = this._tuning || { speed: 300, jumpV: -920 };
        const pSpeed = tuning.speed;
        const jumpV = tuning.jumpV;
        const mobile = window.__PT_isMobileControl?.() === true;
        const p1Left = this.p1Keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const p1Right = this.p1Keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
        if (p1Left) this.p1.setVelocityX(-pSpeed);
        else if (p1Right) this.p1.setVelocityX(pSpeed);
        else this.p1.setVelocityX(0);
        if (p1Left) this.p1.setTexture("char_left");
        else if (p1Right) this.p1.setTexture("char_right");
        else this.p1.setTexture("char_front");
        const p1Jump = Phaser.Input.Keyboard.JustDown(this.p1Keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
        if (p1Jump && (this.p1.body.blocked.down || this.p1.body.touching.down)) this.p1.setVelocityY(jumpV);

        // P2
        const p2Left = this.p2Keys.left.isDown;
        const p2Right = this.p2Keys.right.isDown;
        if (p2Left) this.p2.setVelocityX(-pSpeed);
        else if (p2Right) this.p2.setVelocityX(pSpeed);
        else this.p2.setVelocityX(0);
        if (p2Left) this.p2.setTexture("char_left");
        else if (p2Right) this.p2.setTexture("char_right");
        else this.p2.setTexture("char_front");
        const p2Jump = Phaser.Input.Keyboard.JustDown(this.p2Keys.jump);
        if (p2Jump && (this.p2.body.blocked.down || this.p2.body.touching.down)) this.p2.setVelocityY(jumpV);
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

