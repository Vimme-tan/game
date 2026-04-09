// Single-player Level 3 (JSON map, same basic rules as Level 1)
// Exposes: window.SinglePlayerLevels.startLevel3(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel3 = async function startLevel3(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, ui } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("当前是 file:// 方式打开页面，浏览器会阻止加载本地 JSON 资源。\n请用 http:// 方式运行一个本地静态服务器后再测试（例如 localhost）。");
      return;
    }

    const mapUrl = new URL(assets.level3Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`第三关地图加载失败：${e?.message || String(e)}`);
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
        // Maps under `singleplayer/level3/` need `../../map/`.
        candidates.push(`../../map/${baseName}`);
        candidates.push(`../map/${baseName}`);
        candidates.push(`map/${baseName}`);
      }

      // Normalize legacy exported path like "../tiled/examples/sticker-knight/map/x.png"
      // to the runtime shared map directory.
      if (baseName) candidates.push(`../../map/${baseName}`);

      // Keep original + relative fallbacks
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
          props[propName] = type === "bool" ? value === "true" || value === "1" : value === "true" || value === "1";
        }
        tiles[id] = { id, imageSource, props };
      }
      return { name, tiles };
    }

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
      alert("第三关资源加载失败：TSX tileset 未能解析。");
      return;
    }

    function resolveTileFromGid(gid) {
      const cleanGid = gid & 0x1fffffff;
      if (!cleanGid) return null;
      let chosen = null;
      for (let i = 0; i < tilesetInfos.length; i++) {
        const ts = tilesetInfos[i];
        const nextFirst = i + 1 < tilesetInfos.length ? tilesetInfos[i + 1].firstgid : Infinity;
        if (cleanGid >= ts.firstgid && cleanGid < nextFirst) {
          chosen = ts;
          break;
        }
      }
      if (!chosen) return null;
      const tileId = cleanGid - chosen.firstgid;
      const tile = chosen.tiles[tileId];
      if (!tile) return null;
      return { ...tile, tileset: chosen, tileId };
    }

    const tileLayers = (Array.isArray(mapData.layers) ? mapData.layers : []).filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objectLayers = (Array.isArray(mapData.layers) ? mapData.layers : []).filter((l) => l && l.type === "objectgroup");
    const bornObj =
      objectLayers
        .flatMap((l) => (Array.isArray(l.objects) ? l.objects : []))
        .find((o) => Array.isArray(o.properties) && o.properties.some((p) => String(p.name || "").toLowerCase() === "born" && p.value === true)) || null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y : tileH * 2;

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
    const deathRects = [];
    const winRects = [];
    const moveDBlocks = [];
    const moveDTriggers = [];
    for (const layer of tileLayers) {
      const data = layer.data;
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const gid = data[idx];
        const tile = gid ? resolveTileFromGid(gid) : null;
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        const hasMoveD = Object.prototype.hasOwnProperty.call(p, "moveD");
        const moveDInitial = hasMoveD ? p.moveD === true : false;
        if (p.solid === true && !hasMoveD) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true) deathRects.push({ cx, cy, w: tileW, h: tileH });
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });
        if (hasMoveD) {
          moveDBlocks.push({ cx, cy, w: tileW, h: tileH, initialMoveD: moveDInitial });
          if (Number(layer.id) === 4 || String(layer.name || "").includes("3")) {
            moveDTriggers.push({ cx, cy, w: tileW, h: tileH });
          }
        }
      }
    }

    const playerSpeed = 550;

    const scene = {
      preload: function () {
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        this.bornX = spawnX;
        this.bornY = spawnY;
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 700;
        this.moveDActivated = false;
        this.moveDBodies = [];
        this.layer3Imgs = [];
        this.trapSpikeImgs = [];
        this.trapArmAt = this.time.now + 500;
        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        for (const layer of tileLayers) {
          // Level 3 hidden terrain: keep collisions but hide the special layer.
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const gid = data[idx];
            const tile = gid ? resolveTileFromGid(gid) : null;
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
            const hasMoveD = Object.prototype.hasOwnProperty.call(tile.props || {}, "moveD");
            if (hasMoveD) {
              // Cover should be visible initially.
              img.setAlpha(1);
              const block = moveDBlocks.find((b) => b.cx === col * tileW + tileW / 2 && b.cy === row * tileH + tileH / 2);
              if (block) block.img = img;
            }
            const isTrapSpike =
              tile.props &&
              tile.props.death === true &&
              typeof tile.imageSource === "string" &&
              tile.imageSource.toLowerCase().includes("trap.png");
            if (isTrapSpike) {
              img.setDisplaySize(tileW * 2, tileH * 2);
              img.setAlpha(0);
              this.trapSpikeImgs.push(img);
            }
            if (Number(layer.id) === 4 || String(layer.name || "").includes("3")) this.layer3Imgs.push(img);
          }
        }

        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        this.player.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setOffset(0, 0);
        this.player.body.setMaxVelocity(250, 900);
        this.player.body.setDragX(900);
        this.physics.add.collider(this.player, this.solids);

        this.moveDGroup = this.physics.add.group();
        for (const b of moveDBlocks) {
          const rect = this.add.rectangle(b.cx, b.cy, b.w, b.h, 0x000000, 0);
          this.physics.add.existing(rect);
          if (rect.body) {
            rect.body.setImmovable(!b.initialMoveD);
            rect.body.allowGravity = !!b.initialMoveD;
            rect.body.setVelocity(0, 0);
          }
          this.moveDGroup.add(rect);
          this.moveDBodies.push({ ...b, rect });
        }
        this.physics.add.collider(this.player, this.moveDGroup);

        this.deathSensors = this.physics.add.staticGroup();
        for (const r of deathRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0xff0000, 0);
          this.physics.add.existing(s, true);
          this.deathSensors.add(s);
        }
        this.physics.add.overlap(this.player, this.deathSensors, () => {
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.player.body.setVelocity(0, 0);
          this.player.setPosition(this.bornX, this.bornY);
          this.lastRespawnAt = this.time.now;
        });

        this.winSensors = this.physics.add.staticGroup();
        for (const r of winRects) {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        }
        this.finished = false;
        this.physics.add.overlap(this.player, this.winSensors, () => {
          if (this.finished) return;
          this.finished = true;
          if (typeof ctx.onLevelWin === "function") ctx.onLevelWin(levelId);
        });

        this.triggerSensors = this.physics.add.staticGroup();
        for (const t of moveDTriggers) {
          const s = this.add.rectangle(t.cx, t.cy, t.w, t.h, 0x0000ff, 0);
          this.physics.add.existing(s, true);
          this.triggerSensors.add(s);
        }
        this.physics.add.overlap(this.player, this.triggerSensors, () => {
          if (this.finished) return;
          if (this.time.now < this.trapArmAt) return;
          this.triggerTrapEvent();
        });

        this.triggerTrapEvent = () => {
          if (this.moveDActivated) return;
          this.moveDActivated = true;
          for (const blk of this.moveDBodies) {
            const body = blk?.rect?.body;
            if (!body) continue;
            body.setImmovable(false);
            body.allowGravity = true;
            body.setVelocity(0, 0);
            if (blk.img) blk.img.setAlpha(1);
          }
          for (const img of this.trapSpikeImgs) img.setAlpha(1);
          for (const img of this.layer3Imgs) {
            this.tweens.add({ targets: img, y: img.y + tileH * 4, duration: 650, ease: "Sine.easeIn" });
          }
        };

        this.controls = this.input.keyboard.createCursorKeys();
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      },
      update: function () {
        // Trigger is now only via dedicated moveD trigger tiles.

        // Fall out of map => death and respawn at born.
        if (this.player?.y > worldH + tileH) {
          this.player.body.setVelocity(0, 0);
          this.player.setPosition(this.bornX, this.bornY);
          this.lastRespawnAt = this.time.now;
        }

        const left = this.controls.left.isDown;
        const right = this.controls.right.isDown;
        if (left) this.player.setVelocityX(-playerSpeed);
        else if (right) this.player.setVelocityX(playerSpeed);
        else this.player.setVelocityX(0);
        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump = Phaser.Input.Keyboard.JustDown(this.controls.up) || Phaser.Input.Keyboard.JustDown(this.jumpKey);
        // Jump power x1.5
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(-1200);
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

