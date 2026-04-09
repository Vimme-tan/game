// Single-player Level 3 (basic stable logic for map display)
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
      const legacyNameMap = {
        "1.png": "blue.png",
        "2.png": "earthWall.png",
        "3.png": "earthWall2.png",
        "4.png": "doorRedStroked.png",
        "5.png": "trap.png",
      };
      const mappedName = baseName ? legacyNameMap[String(baseName).toLowerCase()] : null;
      // Prefer mapped names first to avoid returning non-existent /map/1.png style URLs.
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
        // Compatibility with mixed TSX styles:
        // some tilesets omit explicit solid/death on wall/trap images.
        const srcLower = String(imageSource || "").toLowerCase();
        if (props.fake !== true && props.solid !== true && (srcLower.endsWith("/earthwall.png") || srcLower.endsWith("/earthwall2.png"))) {
          props.solid = true;
        }
        // fake tile should never be treated as a collision solid.
        if (props.fake === true) {
          props.solid = false;
        }
        if (props.death !== true && srcLower.endsWith("/trap.png")) {
          props.death = true;
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
      alert("第三关资源加载失败：TSX tileset 未能解析。");
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

    const tileLayers = (Array.isArray(mapData.layers) ? mapData.layers : []).filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objects = (Array.isArray(mapData.layers) ? mapData.layers : [])
      .filter((l) => l && l.type === "objectgroup" && Array.isArray(l.objects))
      .flatMap((l) => l.objects || []);
    const bornObj =
      objects.find(
        (o) =>
          Array.isArray(o.properties) &&
          o.properties.some((p) => String(p.name || "").toLowerCase() === "born" && (p.value === true || p.value === 1))
      ) || null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj
      ? bornObj.y - Math.max(6, Math.min(tileH * 0.6, (bornObj.height || tileH) * 0.6))
      : tileH * 2;

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
    const deathRects = [];
    const winRects = [];
    for (const layer of tileLayers) {
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(layer.data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        if (p.solid === true && p.fake !== true) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true) deathRects.push({ cx, cy, w: tileW, h: tileH });
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });
      }
    }

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
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 700;
        this.bornX = spawnX;
        this.bornY = spawnY;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);
        if (this._loadErrors.length) {
          console.error("[level3 loaderror urls]", this._loadErrors);
          alert(`第三关有 ${this._loadErrors.length} 个图片加载失败，已输出到控制台。`);
        }

        for (const layer of tileLayers) {
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(layer.data[idx] || 0);
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
            // Level 3 should render like level 1/2/4: do not hide by layer.visible.
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
        this.player.body.setDragX(900);
        this.player.body.setMaxVelocity(250, 900);
        this.physics.add.collider(this.player, this.solids);

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
        this.physics.add.overlap(this.player, this.winSensors, () => {
          if (this.finished) return;
          this.finished = true;
          if (typeof ctx.onLevelWin === "function") ctx.onLevelWin(levelId);
        });

        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.SPACE;
        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
      },
      update: function () {
        if (!this.player?.body || this.finished) return;

        const cam = this.cameras?.main;
        const playerBottom = this.player.getBounds().bottom;
        const hitGameViewportBottom = !!cam && playerBottom >= cam.worldView.bottom - 2;
        if (
          hitGameViewportBottom ||
          this.player.x < -tileW ||
          this.player.x > worldW + tileW ||
          this.player.y < -tileH ||
          this.player.y > worldH + tileH
        ) {
          this.player.body.setVelocity(0, 0);
          this.player.setPosition(this.bornX, this.bornY);
          this.lastRespawnAt = this.time.now;
          return;
        }

        const speed = 550;
        const mobile = window.__PT_isMobileControl?.() === true;
        const left = this.p1Keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.p1Keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
        if (left) this.player.setVelocityX(-speed);
        else if (right) this.player.setVelocityX(speed);
        else this.player.setVelocityX(0);

        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump = Phaser.Input.Keyboard.JustDown(this.p1Keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) {
          this.player.setVelocityY(-1200);
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

