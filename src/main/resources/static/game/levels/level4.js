// Single-player Level 4
// Exposes: window.SinglePlayerLevels.startLevel4(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel4 = async function startLevel4(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, ui } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("当前是 file:// 方式打开页面，浏览器会阻止加载本地 JSON 资源。\n请用 http:// 方式运行一个本地静态服务器后再测试（例如 localhost）。");
      return;
    }

    const mapUrl = new URL(assets.level4Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`第四关地图加载失败：${e?.message || String(e)}`);
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
      if (imageSource.includes("sticker-knight/map/")) {
        candidates.push(imageSource.replace("sticker-knight/map/", "../map/"));
        candidates.push(imageSource.replace("sticker-knight/map/", "map/"));
      }
      candidates.push(imageSource);
      const baseName = imageSource.split("/").pop();
      if (baseName) {
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
      const r = await fetch(tsxUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
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
      alert("第四关资源加载失败：TSX tileset 未能解析。");
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
    const touch2Obj = objects.find((o) => hasTrueProp(o, "touch2")) || null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y : tileH * 2;

    // image preload map
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
    const movingBlocks = []; // lmove/rmove
    const layerDeath = { 4: [], 5: [], 6: [] }; // layerId -> spike sprites info built later

    // gather tiles
    for (const layer of tileLayers) {
      const layerId = Number(layer.id || 0);
      const data = layer.data;
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        const isL = p.lmove === true;
        const isR = p.rmove === true;
        if (isL || isR) {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          movingBlocks.push({ x: col * tileW, y: (row + 1) * tileH, w: tileW, h: tileH, key, mode: isL ? "lmove" : "rmove" });
          continue;
        }
        if (p.solid === true) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true && (layerId === 4 || layerId === 5 || layerId === 6)) {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          layerDeath[layerId].push({ x: col * tileW, y: (row + 1) * tileH, w: tileW, h: tileH, key });
        }
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
        this.touchTriggered = false;
        this.touch2Triggered = false;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // render non-moving tiles (skip lmove/rmove)
        for (const layer of tileLayers) {
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            if (p.lmove === true || p.rmove === true) continue;
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

        // moving blocks (periodic)
        this.movers = [];
        for (const b of movingBlocks) {
          const s = this.add.image(b.x, b.y, b.key).setOrigin(0, 1);
          s.setDisplaySize(tileW, tileH);
          this.physics.add.existing(s);
          s.body.allowGravity = false;
          s.body.immovable = true;
          s._mode = b.mode;
          if (b.mode === "lmove") {
            s._minX = s.x - tileW * 7;
            s._maxX = s.x + tileW * 7;
            s._dir = -1;
          } else {
            s._minX = s.x - tileW * 5;
            s._maxX = s.x + tileW * 5;
            s._dir = 1;
          }
          // Keep a steady speed and let distance spec define travel range.
          s._speed = tileW * 4;
          this.movers.push(s);
        }

        // player
        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        this.player.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setOffset(0, 0);
        this.player.body.setMaxVelocity(250, 900);
        this.player.body.setDragX(900);
        this.physics.add.collider(this.player, this.solids);
        for (const m of this.movers) this.physics.add.collider(this.player, m);

        // death spikes by layer
        this.layer3Spikes = [];
        this.layer4Spikes = [];
        this.layer5Spikes = [];
        const createSpikes = (arr, target, hiddenInitially) => {
          for (const d of arr) {
            const sp = this.add.image(d.x, d.y, d.key).setOrigin(0, 1);
            // All death spikes: height is half of previous.
            sp.setDisplaySize(tileW * 2, tileH);
            this.physics.add.existing(sp);
            sp.body.allowGravity = false;
            sp.body.immovable = true;
            if (hiddenInitially) sp.setAlpha(0);
            target.push(sp);
          }
        };
        createSpikes(layerDeath[4], this.layer3Spikes, true);
        createSpikes(layerDeath[5], this.layer4Spikes, true);
        createSpikes(layerDeath[6], this.layer5Spikes, true);

        // death overlap all spikes
        this.allSpikes = [...this.layer3Spikes, ...this.layer4Spikes, ...this.layer5Spikes];
        for (const sp of this.allSpikes) {
          this.physics.add.overlap(this.player, sp, () => {
            this.player.setPosition(spawnX, spawnY);
            this.player.body.setVelocity(0, 0);
          });
        }

        // win sensors
        this.winSensors = this.physics.add.staticGroup();
        for (const r of winRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        }
        this.physics.add.overlap(this.player, this.winSensors, () => {
          if (this.finished) return;
          this.finished = true;
          if (typeof ctx.onLevelWin === "function") ctx.onLevelWin(levelId);
        });

        // touch/touch2 sensors
        if (touchObj) {
          this.touchSensor = this.add.rectangle(touchObj.x + touchObj.width / 2, touchObj.y + touchObj.height / 2, touchObj.width, touchObj.height, 0x0000ff, 0);
          this.physics.add.existing(this.touchSensor, true);
          this.physics.add.overlap(this.player, this.touchSensor, () => this.onTouch());
        }
        if (touch2Obj) {
          this.touch2Sensor = this.add.rectangle(touch2Obj.x + touch2Obj.width / 2, touch2Obj.y + touch2Obj.height / 2, touch2Obj.width, touch2Obj.height, 0x0000ff, 0);
          this.physics.add.existing(this.touch2Sensor, true);
          this.physics.add.overlap(this.player, this.touch2Sensor, () => this.onTouch2());
        }

        this.onTouch = () => {
          if (this.touchTriggered) return;
          this.touchTriggered = true;
          // layer3 death: move left until out of map
          for (const sp of this.layer3Spikes) {
            sp.setAlpha(1);
            this.tweens.add({ targets: sp, x: -sp.displayWidth - 20, duration: 2200, ease: "Linear", onUpdate: () => sp.body.updateFromGameObject() });
          }
          // layer4 death: move up 1 tile
          for (const sp of this.layer4Spikes) {
            sp.setAlpha(1);
            this.tweens.add({ targets: sp, y: sp.y - tileH, duration: 350, ease: "Sine.easeOut", onUpdate: () => sp.body.updateFromGameObject() });
          }
        };

        this.onTouch2 = () => {
          if (this.touch2Triggered) return;
          this.touch2Triggered = true;
          // touch2 can trigger independently.
          // Extra step: move layer5 spikes up 1 tile, then shoot left
          // so their launch height matches touch event's spike lane.
          for (const sp of this.layer5Spikes) {
            sp.setAlpha(1);
            this.tweens.add({
              targets: sp,
              y: sp.y - tileH,
              duration: 300,
              ease: "Sine.easeOut",
              onUpdate: () => sp.body.updateFromGameObject(),
              onComplete: () => {
                this.tweens.add({
                  targets: sp,
                  x: -sp.displayWidth - 20,
                  duration: 2200,
                  ease: "Linear",
                  onUpdate: () => sp.body.updateFromGameObject(),
                });
              },
            });
          }
        };

        this.controls = this.input.keyboard.createCursorKeys();
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      },
      update: function () {
        if (!this.player?.body) return;

        // mover periodic motion
        for (const m of this.movers) {
          const dt = this.game.loop.delta / 1000;
          m.x += m._dir * m._speed * dt;
          if (m.x <= m._minX) {
            m.x = m._minX;
            m._dir = 1;
          } else if (m.x >= m._maxX) {
            m.x = m._maxX;
            m._dir = -1;
          }
          m.body.updateFromGameObject();
        }

        const left = this.controls.left.isDown;
        const right = this.controls.right.isDown;
        if (left) this.player.setVelocityX(-220);
        else if (right) this.player.setVelocityX(220);
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
      parent: ui.phaserMount,
      width: Math.min(1400, Math.max(900, window.innerWidth - 80)),
      height: Math.min(900, Math.max(650, window.innerHeight - 200)),
      backgroundColor: "#0b1220",
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();

