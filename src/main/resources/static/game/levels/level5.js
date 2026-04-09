// Single-player Level 5 (JSON)
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
      const hasSticker = imageSource.includes("sticker-knight/map/");
      if (hasSticker && baseName) {
        // Maps under `singleplayer/level5/` need `../../map/`.
        candidates.push(`../../map/${baseName}`);
        candidates.push(`../map/${baseName}`);
        candidates.push(`map/${baseName}`);
      }

      // Normalize legacy exported path like "../tiled/examples/sticker-knight/map/x.png"
      // to the runtime shared map directory.
      if (baseName) {
        candidates.push(`../../map/${baseName}`);
      }
      candidates.push(imageSource);
      if (baseName) {
        candidates.push(`../../map/${baseName}`);
        candidates.push(`../map/${baseName}`);
        candidates.push(`map/${baseName}`);
        candidates.push(`./map/${baseName}`);
      }

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
      return { ...tile, tileset: chosen, tileId };
    }

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objects = allLayers
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);

    const hasTrueProp = (obj, key) =>
      Array.isArray(obj?.properties) &&
      obj.properties.some((p) => String(p.name || "").toLowerCase() === key && (p.value === true || p.value === 1 || String(p.value || "").toLowerCase() === "true"));

    const bornObj = objects.find((o) => hasTrueProp(o, "born")) || null;
    const touchObj = objects.find((o) => hasTrueProp(o, "touch")) || null;
    const touch1Obj = objects.find((o) => hasTrueProp(o, "touch1")) || null;
    const touch2Obj = objects.find((o) => hasTrueProp(o, "touch2")) || null;
    const touch3Obj = objects.find((o) => hasTrueProp(o, "touch3")) || null;
    const touch4Obj = objects.find((o) => hasTrueProp(o, "touch4")) || null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y : tileH * 2;

    // preload images
    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles)) {
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

        const isRmoveSpike = p.rmove === true && p.death === true;
        const isRrmoveWall = p.rrmove === true && p.solid === true;
        const isSolid = p.solid === true;
        const isWin = p.win === true;
        const isDeath = p.death === true;

        if (isWin) winRects.push({ cx, cy, w: tileW, h: tileH });

        if (layerName === "two" && isRmoveSpike) moving.two_rmove_spikes.push({ x: col * tileW, y: (row + 1) * tileH, key });
        if (layerName === "four" && isRmoveSpike) moving.four_rmove_spikes.push({ x: col * tileW, y: (row + 1) * tileH, key });
        if (layerName === "five" && isRmoveSpike) moving.five_rmove_spikes.push({ x: col * tileW, y: (row + 1) * tileH, key });

        if (layerName === "two" && isRrmoveWall) moving.two_rrmove_walls.push({ x: col * tileW, y: (row + 1) * tileH, key });
        if (layerName === "four" && isRrmoveWall) moving.four_rrmove_walls.push({ x: col * tileW, y: (row + 1) * tileH, key });

        // Static solids: exclude the rrmove walls (they are dynamic).
        if (isSolid && !isRrmoveWall) solids.push({ cx, cy, w: tileW, h: tileH });

        // Static death: exclude rmove spikes that are controlled by touch triggers.
        if (isDeath && !isRmoveSpike) allDeathSpawns.push({ x: col * tileW, y: (row + 1) * tileH, key });
      }
    }

    const playerSpeed = 550;
    const jumpV = -1200;

    const scene = {
      preload: function () {
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

        this.touched = { touch: false, touch1: false, touch2: false, touch3: false, touch4: false };

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // Render static tiles (skip dynamic moving tiles we will spawn as sprites)
        for (const layer of tileLayers) {
          const layerName = String(layer.name || "").toLowerCase();
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
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
            const isWin = p.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
            if (layer.visible === false) img.setVisible(false);
          }
        }

        // Solids
        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        // Player
        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        this.player.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setOffset(0, 0);
        this.player.body.setMaxVelocity(250, 900);
        this.player.body.setDragX(900);
        this.physics.add.collider(this.player, this.solids);

        // Win sensors
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
          this.time.delayedCall(520, () => {
            this.dead = false;
            this.lastRespawnAt = this.time.now;
            this.player.setPosition(spawnX, spawnY);
            this.player.body.setVelocity(0, 0);
          });
        };

        // Death spikes (static)
        this.deathGroup = this.physics.add.group();
        const spawnSpike = (s) => {
          const sp = this.add.image(s.x, s.y, s.key).setOrigin(0, 1);
          sp.setDisplaySize(tileW * 2, tileH);
          this.physics.add.existing(sp);
          sp.body.allowGravity = false;
          sp.body.immovable = true;
          this.deathGroup.add(sp);
          this.physics.add.overlap(this.player, sp, respawn);
          return sp;
        };
        for (const s of allDeathSpawns) spawnSpike(s);

        // Dynamic groups
        this.layerTwoRmoveSpikes = moving.two_rmove_spikes.map(spawnSpike);
        this.layerFourRmoveSpikes = moving.four_rmove_spikes.map(spawnSpike);
        this.layerFiveRmoveSpikes = moving.five_rmove_spikes.map(spawnSpike);

        const spawnWall = (w) => {
          const b = this.add.image(w.x, w.y, w.key).setOrigin(0, 1);
          b.setDisplaySize(tileW, tileH);
          this.physics.add.existing(b);
          b.body.allowGravity = false;
          b.body.immovable = true;
          this.physics.add.collider(this.player, b);
          return b;
        };
        this.layerTwoRrWalls = moving.two_rrmove_walls.map(spawnWall);
        this.layerFourRrWalls = moving.four_rrmove_walls.map(spawnWall);

        // Touch sensors (one-shot)
        const mkSensor = (o) => {
          if (!o) return null;
          const s = this.add.rectangle(o.x + o.width / 2, o.y + o.height / 2, o.width, o.height, 0x0000ff, 0);
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
            x: (t) => t.x + dx,
            y: (t) => t.y + dy,
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
          // Layer two rmove spikes: fast right 4 tiles, then stop
          tweenMoveBy(this.layerTwoRmoveSpikes, tileW * 4, 0, 180);
        };
        this.onTouch1 = () => {
          if (this.touched.touch1) return;
          this.touched.touch1 = true;
          // Layer four rmove spikes: up 1 tile, then stop
          tweenMoveBy(this.layerFourRmoveSpikes, 0, -tileH * 1, 180);
        };
        this.onTouch2 = () => {
          if (this.touched.touch2) return;
          this.touched.touch2 = true;
          // Layer two rrmove+solid walls: fast right 24 tiles, then disappear
          tweenMoveBy(this.layerTwoRrWalls, tileW * 24, 0, 220, () => {
            for (const w of this.layerTwoRrWalls) {
              w.body && (w.body.enable = false);
              w.setVisible(false);
              w.destroy();
            }
            this.layerTwoRrWalls = [];
          });
        };
        this.onTouch3 = () => {
          if (this.touched.touch3) return;
          this.touched.touch3 = true;
          // Layer four rrmove+solid walls: fast right 3 tiles, then stop
          tweenMoveBy(this.layerFourRrWalls, tileW * 3, 0, 220);
        };
        this.onTouch4 = () => {
          if (this.touched.touch4) return;
          this.touched.touch4 = true;
          // Layer five rmove spikes: up 1 tile, then right until out of map
          tweenMoveBy(this.layerFiveRmoveSpikes, 0, -tileH * 1, 160, () => {
            for (const sp of this.layerFiveRmoveSpikes) {
              this.tweens.add({
                targets: sp,
                x: worldW + sp.displayWidth + 40,
                duration: 1200,
                ease: "Linear",
                onUpdate: () => sp.body?.updateFromGameObject?.(),
                onComplete: () => {
                  sp.body && (sp.body.enable = false);
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

        this.controls = this.input.keyboard.createCursorKeys();
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      },
      update: function () {
        if (!this.player?.body) return;
        if (this.dead || this.finished) return;

        const left = this.controls.left.isDown;
        const right = this.controls.right.isDown;
        if (left) this.player.setVelocityX(-playerSpeed);
        else if (right) this.player.setVelocityX(playerSpeed);
        else this.player.setVelocityX(0);
        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump = Phaser.Input.Keyboard.JustDown(this.controls.up) || Phaser.Input.Keyboard.JustDown(this.jumpKey);
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(jumpV);
      },
    };

    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ctx.ui.phaserMount,
      width: Math.min(1400, Math.max(900, window.innerWidth - 80)),
      height: Math.min(900, Math.max(650, window.innerHeight - 200)),
      backgroundColor: "#0b1220",
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();

