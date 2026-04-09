// Single-player Level 1 (JSON)
// Exposes: window.SinglePlayerLevels.startLevel1(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel1 = async function startLevel1(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, api, refreshMe } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    const mapUrl = new URL(assets.level1Json, window.location.href).toString();
    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local map resources.");
      return;
    }

    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Level 1 map load failed: ${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;

    const mapBase = new URL(mapUrl);

    const parseBool = (p) => {
      if (!p) return undefined;
      const type = String(p.type || "").toLowerCase();
      const v = p.value;
      if (type === "bool") return v === true || v === 1 || String(v).toLowerCase() === "true";
      return v === true || v === 1 || String(v).toLowerCase() === "true";
    };
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
      if (imageSource.includes("sticker-knight/map/")) {
        candidates.push(imageSource.replace("sticker-knight/map/", "../../map/"));
        candidates.push(imageSource.replace("sticker-knight/map/", "../map/"));
        candidates.push(imageSource.replace("sticker-knight/map/", "map/"));
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
      if (baseName && baseName.toLowerCase().endsWith(".tsx")) {
        const stem = baseName.slice(0, -4);
        candidates.push(new URL(`./${stem} .tsx`, baseUrl).toString());
      }
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
          const value = p.getAttribute("value");
          if (type === "bool") props[propName] = String(value).toLowerCase() === "true" || String(value) === "1";
          else props[propName] = value;
        }
        tiles[id] = { id, imageSource, props };
      }
      return { name, tiles };
    }

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const opLayer = allLayers.find((l) => l && l.type === "objectgroup" && String(l.name || "").toLowerCase() === "op");
    const opObjects = Array.isArray(opLayer?.objects) ? opLayer.objects : [];
    const objHas = (o, key) =>
      Array.isArray(o?.properties) && o.properties.some((p) => String(p.name || "").toLowerCase() === key && parseBool(p) === true);
    const bornObj = opObjects.find((o) => objHas(o, "born")) || null;
    const fallareaObj = opObjects.find((o) => objHas(o, "fallarea")) || null;

    // tilesets
    const tilesetInfos = [];
    for (const tsEl of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(tsEl.firstgid || 1);
      const source = tsEl.source;
      if (!source) continue;
      try {
        const tsxText = await fetchTsxText(source, mapBase);
        const parsed = parseTsx(tsxText);
        tilesetInfos.push({ firstgid, source, ...parsed });
      } catch (e) {
        console.error("[level1 tsx load fail]", source, e);
      }
    }
    if (!tilesetInfos.length) {
      alert("Level 1 resource load failed: TSX files cannot be read.");
      return;
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);

    function resolveTileFromGid(gid) {
      const clean = gid & 0x1fffffff;
      if (!clean) return null;
      let chosen = null;
      for (let i = 0; i < tilesetInfos.length; i++) {
        const ts = tilesetInfos[i];
        const next = i + 1 < tilesetInfos.length ? tilesetInfos[i + 1].firstgid : Infinity;
        if (clean >= ts.firstgid && clean < next) {
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

    // collect rects
    const solids = [];
    const winRects = [];
    const deathRects = [];
    const fallTiles = [];

    for (const layer of tileLayers) {
      const data = layer.data;
      const layerName = String(layer.name || "").toLowerCase();
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        const isFall = p.fall === true;
        if (p.solid === true && !isFall) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true) deathRects.push({ cx, cy, w: tileW, h: tileH, imageSource: tile.imageSource });
        if (isFall && layerName === "three") {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const imgKey = url ? imageToKey.get(url) : null;
          fallTiles.push({ cx, cy, w: tileW, h: tileH, imgKey });
        }
      }
    }

    const PLAYER_SPEED = 300; // requested fast movement
    const JUMP_V = -920; // about 7 tiles jump apex with gravity 900
    const GRAVITY_Y = 900;
    const PLAYER_MAX_VY = 900; // symmetric up/down speed cap
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
        this.fallActivated = false;
        this.fallBodies = [];
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 900;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = GRAVITY_Y;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        const fallPosKey = (cx, cy) => `${Math.round(cx)}:${Math.round(cy)}`;
        const fallPosSet = new Set(fallTiles.map((t) => fallPosKey(t.cx, t.cy)));

        // render tiles
        for (let layerIdx = 0; layerIdx < tileLayers.length; layerIdx++) {
          const layer = tileLayers[layerIdx];
          const layerName = String(layer.name || "").toLowerCase();
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            // For fall blocks, we do NOT draw static tiles here.
            // They will be spawned as physics-enabled images so they can visibly fall.
            if (layerName === "three" && tile?.props?.fall === true && fallPosSet.has(fallPosKey(cx, cy))) continue;
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
            // no special per-tile visuals needed here
          }
        }

        // solids
        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        // fall blocks group (initially solid support; after trigger fall with gravity)
        this.fallGroup = this.physics.add.group();
        for (const b of fallTiles) {
          if (b.imgKey) {
            const img = this.physics.add.image(b.cx, b.cy, b.imgKey);
            img.setDisplaySize(tileW, tileH);
            img.setImmovable(true);
            img.body.allowGravity = false;
            img.body.setVelocity(0, 0);
            this.fallGroup.add(img);
            this.fallBodies.push({ ...b, obj: img, kind: "image" });
          } else {
            // Fallback: still provide collision even if texture missing
            const rect = this.add.rectangle(b.cx, b.cy, b.w, b.h, 0x000000, 0);
            this.physics.add.existing(rect);
            if (rect.body) {
              rect.body.setImmovable(true);
              rect.body.allowGravity = false;
              rect.body.setVelocity(0, 0);
            }
            this.fallGroup.add(rect);
            this.fallBodies.push({ ...b, obj: rect, kind: "rect" });
          }
        }

        // spawn
        const bx = (Number(bornObj?.x) || tileW * 2) + (Number(bornObj?.width) || tileW) / 2;
        const byRaw = Number(bornObj?.y) || tileH * 2;
        const by = byRaw - Math.max(6, Math.min(tileH * 0.6, (Number(bornObj?.height) || tileH) * 0.6));
        this.bornX = bx;
        this.bornY = by;

        this.player = this.physics.add.sprite(bx, by, "char_front").setOrigin(0.5, 1);
        this.player.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setOffset(0, 0);
        this.player.body.setMaxVelocity(220, PLAYER_MAX_VY);
        this.player.body.setDragX(900);

        this.physics.add.collider(this.player, this.solids);
        this.physics.add.collider(this.player, this.fallGroup);

        const makeSensorGroup = () => this.physics.add.staticGroup();
        this.winSensors = makeSensorGroup();
        winRects.forEach((r) => {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x00ff00, 0);
          this.physics.add.existing(s, true);
          this.winSensors.add(s);
        });
        this.deathSensors = makeSensorGroup();
        deathRects.forEach((r) => {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0xff0000, 0);
          this.physics.add.existing(s, true);
          this.deathSensors.add(s);
        });
        this.activateFall = () => {
          if (this.fallActivated) return;
          this.fallActivated = true;
          for (const blk of this.fallBodies) {
            const body = blk?.obj?.body;
            if (!body) continue;
            body.setImmovable(false);
            body.allowGravity = true;
            body.setVelocity(0, 0);
          }
        };
        this.resetFall = () => {
          this.fallActivated = false;
          for (const blk of this.fallBodies) {
            if (blk?.obj?.body) {
              blk.obj.body.enable = true;
              blk.obj.body.setImmovable(true);
              blk.obj.body.allowGravity = false;
              blk.obj.body.setVelocity(0, 0);
            }
            if (typeof blk?.obj?.setPosition === "function") blk.obj.setPosition(blk.cx, blk.cy);
            if (typeof blk?.obj?.setVisible === "function") blk.obj.setVisible(true);
          }
        };
        this.handleDeath = () => {
          if (this.dead || this.finished) return;
          this.dead = true;
          this.player.body.setVelocity(0, 0);
          this.time.delayedCall(650, () => {
            this.dead = false;
            this.lastRespawnAt = this.time.now;
            this.resetFall();
            this.player.setPosition(this.bornX, this.bornY);
            this.player.body.setVelocity(0, 0);
          });
        };

        this.physics.add.overlap(this.player, this.winSensors, async () => {
          if (this.finished || this.dead) return;
          this.finished = true;
          try {
            await api.complete(levelId, 10000);
            await refreshMe();
          } catch {}
          if (typeof ctx.onLevelWin === "function") ctx.onLevelWin(levelId);
        });
        this.physics.add.overlap(this.player, this.deathSensors, () => {
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.handleDeath();
        });
        // fallarea trigger object
        if (fallareaObj) {
          const x = Number(fallareaObj.x || 0);
          const y = Number(fallareaObj.y || 0);
          const w = Number(fallareaObj.width || tileW);
          const h = Number(fallareaObj.height || tileH);
          this.fallareaSensor = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x00ffff, 0);
          this.physics.add.existing(this.fallareaSensor, true);
          this.physics.add.overlap(this.player, this.fallareaSensor, () => this.activateFall());
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
        if (this.dead || this.finished) return;
        if (this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH) {
          this.handleDeath();
          return;
        }
        // Touching the game viewport boundary counts as death+respawn (not solid walls).
        const vb = this.cameras.main.worldView;
        const pb = this.player.getBounds();
        if (pb.bottom >= vb.bottom - 2 || pb.top <= vb.top + 2 || pb.left <= vb.left + 2 || pb.right >= vb.right - 2) {
          this.handleDeath();
          return;
        }
        // disable fall blocks when off-map
        for (const blk of this.fallBodies) {
          const obj = blk.obj;
          if (!obj?.body) continue;
          if (obj.y - tileH / 2 > worldH + tileH) {
            obj.body.enable = false;
            obj.body.setVelocity(0, 0);
            if (typeof obj.setVisible === "function") obj.setVisible(false);
          }
        }

        const speed = PLAYER_SPEED;
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
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(JUMP_V);
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

