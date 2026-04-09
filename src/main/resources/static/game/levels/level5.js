// Single-player Level 5 (trigger mechanics restored)
// Exposes: window.SinglePlayerLevels.startLevel5(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel5 = async function startLevel5(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("当前是 file:// 方式打开页面，浏览器会阻止加载本地 JSON 资源。\n请用 http:// 方式运行一个本地静态服务器后再测试（例如 localhost）。");
      return;
    }

    const mapUrl = new URL(assets.level5Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`第五关地图加载失败：${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;
    const mapBase = new URL(mapUrl);

    function resolveTilesetImageUrl(imageSource, baseUrl) {
      const candidates = [];
      if (typeof imageSource !== "string" || !imageSource) return null;
      const baseName = imageSource.split("/").pop();
      const legacyNameMap = {
        "1.png": "blue.png",
        "2.png": "earthWall.png",
        "3.png": "earthWall2.png",
        "4.png": "doorRedStroked.png",
        "5.png": "trap.png",
      };
      const mappedName = baseName ? legacyNameMap[String(baseName).toLowerCase()] : null;
      // IMPORTANT:
      // new URL() only validates URL syntax; it does not check file existence.
      // So we must put mapped filename BEFORE the raw 1.png~5.png candidates.
      if (mappedName) {
        candidates.push(`../../map/${mappedName}`);
        candidates.push(`../map/${mappedName}`);
        candidates.push(`map/${mappedName}`);
        candidates.push(`./map/${mappedName}`);
      }
      if (baseName) {
        candidates.push(`../../map/${baseName}`);
        candidates.push(`../map/${baseName}`);
        candidates.push(`map/${baseName}`);
        candidates.push(`./map/${baseName}`);
      }
      candidates.push(imageSource);
      for (const c of candidates) {
        try {
          return new URL(c, baseUrl).toString();
        } catch {}
      }
      return null;
    }

    async function fetchTsxText(tsxSource, baseUrl) {
      const tsxUrl = new URL(tsxSource, baseUrl).toString();
      const baseName = String(tsxSource || "").split("/").pop();
      const fallback = baseName ? new URL(`./${baseName}`, baseUrl).toString() : null;
      const candidates = [tsxUrl, fallback].filter(Boolean);
      let lastErr = null;
      for (const cand of candidates) {
        try {
          const r = await fetch(cand, { credentials: "same-origin" });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return await r.text();
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error(`Failed to fetch tsx: ${tsxSource}`);
    }

    function parseTsx(tsxText) {
      const xml = new DOMParser().parseFromString(tsxText, "application/xml");
      const root = xml.querySelector("tileset");
      if (!root) throw new Error("invalid tsx format");
      const name = root.getAttribute("name") || "tileset";
      const tiles = {};
      for (const tileEl of Array.from(xml.querySelectorAll("tile"))) {
        const id = Number(tileEl.getAttribute("id") || "0");
        const imgEl = tileEl.querySelector("image");
        const imageSource = imgEl?.getAttribute("source") || null;
        const props = {};
        for (const p of Array.from(tileEl.querySelectorAll("properties > property"))) {
          const propName = String(p.getAttribute("name") || "");
          if (!propName) continue;
          const type = String(p.getAttribute("type") || "").toLowerCase();
          const value = String(p.getAttribute("value") || "").toLowerCase();
          props[propName] = type === "bool" ? value === "true" || value === "1" : value;
        }
        tiles[id] = { id, imageSource, props };
      }
      return { name, tiles };
    }
    function codeToPhaserKeyCode(code) {
      if (typeof code !== "string" || !code) return null;
      if (code === "ArrowLeft") return Phaser.Input.Keyboard.KeyCodes.LEFT;
      if (code === "ArrowRight") return Phaser.Input.Keyboard.KeyCodes.RIGHT;
      if (code === "ArrowUp") return Phaser.Input.Keyboard.KeyCodes.UP;
      if (code === "ArrowDown") return Phaser.Input.Keyboard.KeyCodes.DOWN;
      if (code === "Space") return Phaser.Input.Keyboard.KeyCodes.SPACE;
      if (code.startsWith("Key") && code.length === 4) {
        const ch = code.slice(3);
        const kc = Phaser.Input.Keyboard.KeyCodes[ch.toUpperCase()];
        return typeof kc === "number" ? kc : null;
      }
      return null;
    }

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
      alert("第五关资源加载失败：TSX tileset 未能解析。");
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

    const hasTrueProp = (obj, key) =>
      Array.isArray(obj?.properties) &&
      obj.properties.some((p) => String(p.name || "").toLowerCase() === key && (p.value === true || p.value === 1 || String(p.value || "").toLowerCase() === "true"));

    const bornObj =
      objects.find((o) => hasTrueProp(o, "born")) || null;
    const touchObj = objects.find((o) => hasTrueProp(o, "touch")) || null;
    const touch1Obj = objects.find((o) => hasTrueProp(o, "touch1")) || null;
    const touch2Obj = objects.find((o) => hasTrueProp(o, "touch2")) || null;
    const touch3Obj = objects.find((o) => hasTrueProp(o, "touch3")) || null;
    const touch4Obj = objects.find((o) => hasTrueProp(o, "touch4")) || null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y : tileH * 2;

    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles)) {
        const t = ts.tiles[Number(idStr)];
        if (!t?.imageSource) continue;
        const url = resolveTilesetImageUrl(t.imageSource, mapBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `tile_${ts.name}_${idStr}`);
      }
    }

    const solids = [];
    const winRects = [];
    const allDeathSpawns = [];
    const moving = {
      two_rmove_spikes: [],
      four_rmove_spikes: [],
      five_rmove_spikes: [],
      two_rrmove_walls: [],
      four_rrmove_walls: [],
    };
    for (const layer of tileLayers) {
      const layerName = String(layer.name || "").toLowerCase();
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(layer.data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};

        const url = tile.imageSource ? resolveTilesetImageUrl(tile.imageSource, mapBase) : null;
        const key = url ? imageToKey.get(url) : null;
        if (!key) continue;

        const isRmoveSpike = p.rmove === true && p.death === true;
        const isRrmoveWall = p.rrmove === true && p.solid === true;
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });

        if (layerName === "two" && isRmoveSpike) moving.two_rmove_spikes.push({ x: col * tileW, y: (row + 1) * tileH, key });
        if (layerName === "four" && isRmoveSpike) moving.four_rmove_spikes.push({ x: col * tileW, y: (row + 1) * tileH, key });
        if (layerName === "five" && isRmoveSpike) moving.five_rmove_spikes.push({ x: col * tileW, y: (row + 1) * tileH, key });

        if (layerName === "two" && isRrmoveWall) moving.two_rrmove_walls.push({ x: col * tileW, y: (row + 1) * tileH, key });
        if (layerName === "four" && isRrmoveWall) moving.four_rrmove_walls.push({ x: col * tileW, y: (row + 1) * tileH, key });

        if (p.solid === true && !isRrmoveWall) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true && !isRmoveSpike) allDeathSpawns.push({ x: col * tileW, y: (row + 1) * tileH, key });
      }
    }

    const playerSpeed = 550;
    const jumpV = -1200;
    const scene = {
      preload: function () {
        this._loadErrors = [];
        this.load.on("loaderror", (file) => {
          this._loadErrors.push(file?.url || file?.src || file?.key || "unknown");
        });
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        this.finished = false;
        this.dead = false;
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 900;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);
        if (this._loadErrors.length) {
          console.error("[level5 loaderror urls]", this._loadErrors);
          alert(`第五关有 ${this._loadErrors.length} 个图片加载失败，已输出到控制台。`);
        }

        for (const layer of tileLayers) {
          const layerName = String(layer.name || "").toLowerCase();
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const isRmoveSpike = p.rmove === true && p.death === true;
            const isRrmoveWall = p.rrmove === true && p.solid === true;
            if (layerName === "two" && (isRmoveSpike || isRrmoveWall)) continue;
            if (layerName === "four" && (isRmoveSpike || isRrmoveWall)) continue;
            if (layerName === "five" && isRmoveSpike) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
            if (layer.visible === false) img.setVisible(false);
          }
        }

        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        this.player.setDisplaySize(tileW * 1.2, tileH * 1.8);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setOffset(0, 0);
        this.player.body.setMaxVelocity(250, 900);
        this.player.body.setDragX(900);
        this.physics.add.collider(this.player, this.solids);

        this.winSensors = this.physics.add.staticGroup();
        for (const r of winRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        }
        this.physics.add.overlap(this.player, this.winSensors, async () => {
          if (this.finished) return;
          this.finished = true;
          try {
            await api.complete(levelId, 10000);
            await refreshMe();
          } catch {}
          if (typeof onLevelWin === "function") onLevelWin(levelId);
        });

        const respawn = () => {
          if (this.dead || this.finished) return;
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.dead = true;
          this.player.body.setVelocity(0, 0);
          this.time.delayedCall(450, () => {
            this.dead = false;
            this.lastRespawnAt = this.time.now;
            this.player.setPosition(spawnX, spawnY);
            this.player.body.setVelocity(0, 0);
          });
        };

        const spawnSpike = (s) => {
          const sp = this.add.image(s.x, s.y, s.key).setOrigin(0, 1);
          sp.setDisplaySize(tileW * 2, tileH);
          sp.setDepth(20);
          this.physics.add.existing(sp);
          if (sp.body) {
            sp.body.setAllowGravity(false);
            sp.body.setImmovable(true);
            // Prevent accidental physics stepping drift before any trigger tween.
            sp.body.moves = false;
          }
          this.physics.add.overlap(this.player, sp, respawn);
          return sp;
        };
        for (const s of allDeathSpawns) spawnSpike(s);

        this.layerTwoRmoveSpikes = moving.two_rmove_spikes.map(spawnSpike);
        this.layerFourRmoveSpikes = moving.four_rmove_spikes.map(spawnSpike);
        this.layerFiveRmoveSpikes = moving.five_rmove_spikes.map(spawnSpike);
        // touch1 / touch4 spikes are hidden initially.
        for (const sp of this.layerFourRmoveSpikes) sp.setAlpha(0);
        for (const sp of this.layerFiveRmoveSpikes) sp.setAlpha(0);

        const spawnWall = (w) => {
          const b = this.add.image(w.x, w.y, w.key).setOrigin(0, 1);
          b.setDisplaySize(tileW, tileH);
          // Keep solid walls above spikes visually.
          b.setDepth(40);
          this.physics.add.existing(b);
          if (b.body) {
            b.body.setAllowGravity(false);
            b.body.setImmovable(true);
            b.body.moves = false;
          }
          this.physics.add.collider(this.player, b);
          return b;
        };
        this.layerTwoRrWalls = moving.two_rrmove_walls.map(spawnWall);
        this.layerFourRrWalls = moving.four_rrmove_walls.map(spawnWall);

        this.touched = { touch: false, touch1: false, touch2: false, touch3: false, touch4: false };
        const mkSensor = (o) => {
          if (!o) return null;
          const w = Number(o.width || tileW);
          const h = Number(o.height || tileH);
          const s = this.add.rectangle(o.x + w / 2, o.y + h / 2, w, h, 0x0000ff, 0);
          this.physics.add.existing(s, true);
          return s;
        };
        this.touchSensor = mkSensor(touchObj);
        this.touch1Sensor = mkSensor(touch1Obj);
        this.touch2Sensor = mkSensor(touch2Obj);
        this.touch3Sensor = mkSensor(touch3Obj);
        this.touch4Sensor = mkSensor(touch4Obj);

        const tweenMoveBy = (targets, dx, dy, duration, onComplete) => {
          if (!targets || !targets.length) return;
          this.tweens.add({
            targets,
            x: `+=${dx}`,
            y: `+=${dy}`,
            duration,
            ease: "Linear",
            onUpdate: () => {
              for (const t of targets) t.body?.updateFromGameObject?.();
            },
            onComplete,
          });
        };

        this.onTouch = () => {
          if (this.touched.touch) return;
          this.touched.touch = true;
          if (this.touchSensor?.body) this.touchSensor.body.enable = false;
          tweenMoveBy(this.layerTwoRmoveSpikes, tileW * 4, 0, 180);
        };
        this.onTouch1 = () => {
          if (this.touched.touch1) return;
          this.touched.touch1 = true;
          if (this.touch1Sensor?.body) this.touch1Sensor.body.enable = false;
          for (const sp of this.layerFourRmoveSpikes) sp.setAlpha(1);
          tweenMoveBy(this.layerFourRmoveSpikes, 0, -tileH * 1, 180);
        };
        this.onTouch2 = () => {
          if (this.touched.touch2) return;
          this.touched.touch2 = true;
          if (this.touch2Sensor?.body) this.touch2Sensor.body.enable = false;
          tweenMoveBy(this.layerTwoRrWalls, tileW * 24, 0, 220, () => {
            for (const w of this.layerTwoRrWalls) {
              if (w.body) w.body.enable = false;
              w.setVisible(false);
              w.destroy();
            }
            this.layerTwoRrWalls = [];
          });
        };
        this.onTouch3 = () => {
          if (this.touched.touch3) return;
          this.touched.touch3 = true;
          if (this.touch3Sensor?.body) this.touch3Sensor.body.enable = false;
          tweenMoveBy(this.layerFourRrWalls, tileW * 3, 0, 220);
        };
        this.onTouch4 = () => {
          if (this.touched.touch4) return;
          this.touched.touch4 = true;
          if (this.touch4Sensor?.body) this.touch4Sensor.body.enable = false;
          for (const sp of this.layerFiveRmoveSpikes) sp.setAlpha(1);
          tweenMoveBy(this.layerFiveRmoveSpikes, 0, -tileH * 1, 160, () => {
            for (const sp of this.layerFiveRmoveSpikes) {
              this.tweens.add({
                targets: sp,
                x: worldW + sp.displayWidth + 40,
                duration: 1200,
                ease: "Linear",
                onUpdate: () => sp.body?.updateFromGameObject?.(),
                onComplete: () => {
                  if (sp.body) sp.body.enable = false;
                  sp.destroy();
                },
              });
            }
          });
        };

        if (this.touchSensor) this.physics.add.overlap(this.player, this.touchSensor, () => this.onTouch());
        if (this.touch1Sensor) this.physics.add.overlap(this.player, this.touch1Sensor, () => this.onTouch1());
        if (this.touch2Sensor) this.physics.add.overlap(this.player, this.touch2Sensor, () => this.onTouch2());
        if (this.touch3Sensor) this.physics.add.overlap(this.player, this.touch3Sensor, () => this.onTouch3());
        if (this.touch4Sensor) this.physics.add.overlap(this.player, this.touch4Sensor, () => this.onTouch4());

        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
      },
      update: function () {
        if (!this.player?.body || this.dead || this.finished) return;
        if (this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH) {
          this.player.body.setVelocity(0, 0);
          this.player.setPosition(spawnX, spawnY);
          this.lastRespawnAt = this.time.now;
          return;
        }

        const mobile = window.__PT_isMobileControl?.() === true;
        const left = this.p1Keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.p1Keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
        if (left) this.player.setVelocityX(-playerSpeed);
        else if (right) this.player.setVelocityX(playerSpeed);
        else this.player.setVelocityX(0);
        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump = Phaser.Input.Keyboard.JustDown(this.p1Keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(jumpV);
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

