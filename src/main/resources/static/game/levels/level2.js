// Single-player Level 2 (JSON map)
// Exposes: window.SinglePlayerLevels.startLevel2(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel2 = async function startLevel2(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, ui } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("当前是 file:// 方式打开页面，浏览器会阻止加载本地 JSON 资源。\n请用 http:// 方式运行一个本地静态服务器后再测试（例如 localhost）。");
      return;
    }

    const mapUrl = new URL(assets.level2Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`第二关地图加载失败：${e?.message || String(e)}`);
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
          props[propName] = type === "bool" ? value === "true" || value === "1" : value === "true" || value === "1";
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

    // Tilesets
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
      alert("第二关资源加载失败：TSX tileset 未能解析。");
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

    // solids + spike spawns
    const solids = [];
    const winRects = [];
    const spikeSpawns = [];
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
        if (p.solid === true) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });
        const isTrap = p.death === true && typeof tile.imageSource === "string" && tile.imageSource.toLowerCase().includes("trap.png");
        if (isTrap) {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (key) spikeSpawns.push({ x: col * tileW, y: (row + 1) * tileH, key });
        }
      }
    }

    const playerSpeed = 550;
    const spikeSpeed = playerSpeed * 0.7;
    const nearThreshold = tileW * 2.2;
    const nearTh2 = nearThreshold * nearThreshold;
    const reverseCooldownMs = 250;

    const scene = {
      preload: function () {
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        this.isPaused = false;
        this.bornX = spawnX;
        this.bornY = spawnY;
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 700;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // Render tiles (skip trap tiles; dynamic spikes instead)
        for (const layer of tileLayers) {
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const gid = data[idx];
            const tile = gid ? resolveTileFromGid(gid) : null;
            if (!tile) continue;
            const p = tile.props || {};
            const isTrap = p.death === true && typeof tile.imageSource === "string" && tile.imageSource.toLowerCase().includes("trap.png");
            if (isTrap) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
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

        this.handleDeath = () => {
          this.player.body.setVelocity(0, 0);
          this.player.setPosition(this.bornX, this.bornY);
          this.lastRespawnAt = this.time.now;
        };

        // Win sensors
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

        // Spikes (manual horizontal patrol, stable near walls)
        this.spikes = [];
        for (const s of spikeSpawns) {
          const spike = this.add.sprite(s.x, s.y, s.key).setOrigin(0, 1);
          // Half of previous size
          spike.setDisplaySize(tileW, tileH);
          this.physics.add.existing(spike);
          spike.body.allowGravity = false;
          spike.body.immovable = true;
          spike.body.moves = false;
          spike.body.setSize(spike.displayWidth * 0.75, spike.displayHeight * 0.5, true);
          spike._dir = -1;
          spike._lastFlipAt = -1e9;
          this.spikes.push(spike);
        }

        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
      },
      update: function () {
        if (!this.player?.body) return;
        if (this.isPaused) return;
        if (this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH) {
          this.handleDeath();
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
        // Jump power x1.5
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(-1200);

        const px = this.player.x;
        const py = this.player.y;
        const now = this.time.now;
        for (const spike of this.spikes) {
          if (!spike?.body) continue;

          // Manual horizontal movement
          const dt = this.game.loop.delta / 1000;
          const nextX = spike.x + (spike._dir || -1) * spikeSpeed * dt;
          const left = nextX;
          const right = nextX + spike.displayWidth;
          // Only check side-wall band to avoid constantly hitting floor solids.
          const top = spike.y - spike.displayHeight * 0.75;
          const bottom = spike.y - spike.displayHeight * 0.25;
          let hitWall = false;
          for (const r of solids) {
            const rl = r.cx - r.w / 2;
            const rr = r.cx + r.w / 2;
            const rt = r.cy - r.h / 2;
            const rb = r.cy + r.h / 2;
            const overlap = !(right < rl || left > rr || bottom < rt || top > rb);
            if (overlap) {
              hitWall = true;
              break;
            }
          }
          if (hitWall) spike._dir = -(spike._dir || -1);
          spike.x += (spike._dir || -1) * spikeSpeed * dt;
          spike.body.updateFromGameObject();

          // Touch player => death/respawn
          const pb = this.player.getBounds();
          const sb = spike.getBounds();
          const hitPlayer = !(pb.right < sb.left || pb.left > sb.right || pb.bottom < sb.top || pb.top > sb.bottom);
          if (hitPlayer && now - this.lastRespawnAt >= this.deathInvulnMs) this.handleDeath();

          const dx = px - spike.x;
          const dy = py - spike.y;
          if (dx * dx + dy * dy <= nearTh2) {
            if (now - (spike._lastFlipAt || -1e9) < reverseCooldownMs) continue;
            spike._lastFlipAt = now;
            spike._dir = -(spike._dir || -1);
          }
        }
      },
    };

    const vp = window.__PT_getGameViewport ? window.__PT_getGameViewport() : {
      width: Math.min(1400, Math.max(900, window.innerWidth - 80)),
      height: Math.min(900, Math.max(650, window.innerHeight - 200)),
    };
    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ui.phaserMount,
      width: vp.width,
      height: vp.height,
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();

