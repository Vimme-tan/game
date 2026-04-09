// Team-up Challenges Level 1 (double-player cooperation)
// Exposes: window.TeamUpLevels.startTeamLevel1(ctx, levelId)
(function () {
  window.TeamUpLevels = window.TeamUpLevels || {};

  window.TeamUpLevels.startTeamLevel1 = async function startTeamLevel1(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("当前是 file:// 方式打开页面，浏览器会阻止加载本地 JSON 资源。\n请用 http:// 方式运行一个本地静态服务器后再测试（例如 localhost）。");
      return;
    }

    const mapUrl = new URL(assets.teamLevel1Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`双人合作第一关地图加载失败：${e?.message || String(e)}`);
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
      if (!Array.isArray(props)) return false;
      const k = String(key || "").toLowerCase();
      return props.some((p) => {
        const name = String(p?.name || "").toLowerCase();
        if (name !== k) return false;
        return p?.value === true || p?.value === 1 || String(p?.value || "").toLowerCase() === "true";
      });
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
      const mapped = baseName ? legacyNameMap[String(baseName).toLowerCase()] : null;
      if (mapped) {
        candidates.push(`../../map/${mapped}`);
        candidates.push(`../map/${mapped}`);
        candidates.push(`map/${mapped}`);
      }
      if (baseName) {
        candidates.push(`../../map/${baseName}`);
        candidates.push(`../map/${baseName}`);
        candidates.push(`map/${baseName}`);
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
      const source = ts.source;
      if (!source) continue;
      const tsxText = await fetchTsxText(source, mapBase);
      const parsed = parseTsx(tsxText);
      tilesetInfos.push({ firstgid, source, ...parsed });
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("双人合作第一关资源加载失败：TSX tileset 未能解析。");
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
    const opLayer = allLayers.find((l) => l && l.type === "objectgroup" && String(l.name || "").toLowerCase() === "op");
    const opObjects = Array.isArray(opLayer?.objects) ? opLayer.objects : [];
    const born1Obj = opObjects.find((o) => propTrue(o.properties, "born1") || propTrue(o.properties, "bron1")) || null;
    const born2Obj = opObjects.find((o) => propTrue(o.properties, "born2") || propTrue(o.properties, "bron2")) || null;

    let touch1Obj =
      opObjects.find((o) => propTrue(o.properties, "touch1") || String(o.name || "").toLowerCase() === "touch1") || null;
    let touch2Obj =
      opObjects.find((o) => propTrue(o.properties, "touch2") || String(o.name || "").toLowerCase() === "touch2") || null;

    // Compatibility fallback: some maps were authored with "vanish" tags on op objects.
    if (!touch1Obj || !touch2Obj) {
      const legacyTouch = opObjects.filter((o) => propTrue(o.properties, "vanish"));
      if (!touch1Obj) touch1Obj = legacyTouch[0] || null;
      if (!touch2Obj) touch2Obj = legacyTouch[1] || null;
    }

    function toSpawn(o, fallback) {
      if (!o) return fallback;
      return {
        x: o.x + (o.width || tileW) / 2,
        y: o.y - Math.max(6, Math.min(tileH * 0.6, (o.height || tileH) * 0.6)),
      };
    }

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
    const redRects = [];
    const blueRects = [];
    const redWinRects = [];
    const blueWinRects = [];
    const vanishTiles = [];

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

        const rec = { cx, cy, w: tileW, h: tileH, key, row, col, layerName };
        if (p.solid === true) solids.push(rec);
        if (p.red === true) redRects.push(rec);
        if (p.blue === true) blueRects.push(rec);
        if (p.redwin === true) redWinRects.push(rec);
        if (p.bluewin === true) blueWinRects.push(rec);
        if (layerName === "four" && p.death === true) deathRects.push(rec);
        if (layerName === "three" && p.vanish === true) vanishTiles.push(rec);
      }
    }

    // Split vanish blocks into left/right groups for touch1/touch2.
    const vanishSorted = [...vanishTiles].sort((a, b) => a.cx - b.cx);
    const splitX =
      vanishSorted.length > 0
        ? (vanishSorted[0].cx + vanishSorted[vanishSorted.length - 1].cx) / 2
        : worldW / 2;

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
        this.redCleared = false;
        this.blueCleared = false;
        this.touch1Done = false;
        this.touch2Done = false;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        this.vanishTileImgs = [];
        this.vanish1Imgs = [];
        this.vanish2Imgs = [];
        this.normalImgs = [];
        for (const layer of tileLayers) {
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const p = tile.props || {};
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWide = p.red === true || p.blue === true;
            const isWin = p.redwin === true || p.bluewin === true;
            const isDeath = p.death === true;
            if (isWin) img.setDisplaySize(tileW * 2, tileH * 2);
            else if (isWide) img.setDisplaySize(tileW * 1.5, tileH);
            else if (isDeath) img.setDisplaySize(tileW * 2, tileH);
            else img.setDisplaySize(tileW, tileH);

            if (String(layer.name || "").toLowerCase() === "three" && p.vanish === true) {
              this.vanishTileImgs.push({ row, col, img });
              if (col * tileW + tileW / 2 <= splitX) this.vanish1Imgs.push(img);
              else this.vanish2Imgs.push(img);
            } else {
              this.normalImgs.push(img);
            }
          }
        }

        this.solids = this.physics.add.staticGroup();
        this.redSensors = this.physics.add.staticGroup();
        this.blueSensors = this.physics.add.staticGroup();
        this.redWinSensors = this.physics.add.staticGroup();
        this.blueWinSensors = this.physics.add.staticGroup();
        this.deathSensors = this.physics.add.staticGroup();

        const addSensor = (g, r) => {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0xffffff, 0);
          this.physics.add.existing(s, true);
          g.add(s);
          return s;
        };

        for (const r of solids) addSensor(this.solids, r);
        for (const r of redRects) addSensor(this.redSensors, r);
        for (const r of blueRects) addSensor(this.blueSensors, r);
        for (const r of redWinRects) addSensor(this.redWinSensors, r);
        for (const r of blueWinRects) addSensor(this.blueWinSensors, r);
        for (const r of deathRects) addSensor(this.deathSensors, r);

        this.vanishBodies = this.physics.add.staticGroup();
        for (const r of vanishTiles) {
          const b = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0xffffff, 0);
          b._group = r.cx <= splitX ? 1 : 2;
          this.physics.add.existing(b, true);
          this.vanishBodies.add(b);
        }

        this.touch1Sensor = null;
        this.touch2Sensor = null;
        const mkTouch = (o) => {
          if (!o) return null;
          const w = Math.max(4, Number(o.width || 0));
          const h = Math.max(4, Number(o.height || 0));
          const s = this.add.rectangle(Number(o.x || 0) + w / 2, Number(o.y || 0) + h / 2, w, h, 0x00ffff, 0);
          this.physics.add.existing(s, true);
          return s;
        };
        this.touch1Sensor = mkTouch(touch1Obj);
        this.touch2Sensor = mkTouch(touch2Obj);

        const mkPlayer = (x, y, tint) => {
          const p = this.physics.add.sprite(x, y, "char_front").setOrigin(0.5, 1);
          p.setTint(tint);
          p.setDisplaySize(tileW * 0.55 * 2, tileH * 0.85 * 2);
          p.body.setCollideWorldBounds(true);
          p.body.setSize(p.displayWidth, p.displayHeight, false);
          p.body.setOffset(0, 0);
          p.body.setDragX(900);
          p.body.setMaxVelocity(250, 900);
          this.physics.add.collider(p, this.solids);
          this.physics.add.collider(p, this.vanishBodies);
          return p;
        };

        this.p1Spawn = toSpawn(born1Obj, { x: tileW * 2, y: worldH - tileH * 3 });
        this.p2Spawn = toSpawn(born2Obj, { x: tileW * 3.2, y: worldH - tileH * 3 });
        this.p1 = mkPlayer(this.p1Spawn.x, this.p1Spawn.y, 0x93c5fd);
        this.p2 = mkPlayer(this.p2Spawn.x, this.p2Spawn.y, 0xfca5a5);

        const respawn = (player, sp) => {
          player.setPosition(sp.x, sp.y);
          player.body.setVelocity(0, 0);
        };
        this.physics.add.overlap(this.p1, this.deathSensors, () => respawn(this.p1, this.p1Spawn));
        this.physics.add.overlap(this.p2, this.deathSensors, () => respawn(this.p2, this.p2Spawn));

        const clearRed = () => {
          if (this.redCleared) return;
          this.redCleared = true;
          this.redSensors.clear(true, true);
          for (const img of this.normalImgs) {
            if (img.texture?.key && redRects.some((r) => Math.abs(img.x - (r.cx - tileW / 2)) < 1 && Math.abs(img.y - (r.cy + tileH / 2)) < 1)) {
              img.destroy();
            }
          }
        };
        const clearBlue = () => {
          if (this.blueCleared) return;
          this.blueCleared = true;
          this.blueSensors.clear(true, true);
          for (const img of this.normalImgs) {
            if (img.texture?.key && blueRects.some((r) => Math.abs(img.x - (r.cx - tileW / 2)) < 1 && Math.abs(img.y - (r.cy + tileH / 2)) < 1)) {
              img.destroy();
            }
          }
        };
        this.physics.add.overlap(this.p1, this.redSensors, clearRed);
        this.physics.add.overlap(this.p2, this.blueSensors, clearBlue);

        const removeVanishGroup = (groupIndex) => {
          for (const b of this.vanishBodies.getChildren()) {
            if (b._group === groupIndex) b.destroy();
          }
          const imgs = groupIndex === 1 ? this.vanish1Imgs : this.vanish2Imgs;
          for (const img of imgs) img.destroy();
        };
        const onTouch1 = () => {
          if (this.touch1Done) return;
          this.touch1Done = true;
          removeVanishGroup(1);
          if (this.touch1Sensor?.body) this.touch1Sensor.body.enable = false;
        };
        const onTouch2 = () => {
          if (this.touch2Done) return;
          this.touch2Done = true;
          removeVanishGroup(2);
          if (this.touch2Sensor?.body) this.touch2Sensor.body.enable = false;
        };
        if (this.touch1Sensor) {
          this.physics.add.overlap(this.p1, this.touch1Sensor, onTouch1);
          this.physics.add.overlap(this.p2, this.touch1Sensor, onTouch1);
        }
        if (this.touch2Sensor) {
          this.physics.add.overlap(this.p1, this.touch2Sensor, onTouch2);
          this.physics.add.overlap(this.p2, this.touch2Sensor, onTouch2);
        }

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
        if (this.finished) return;
        const pSpeed = 520;
        const jumpV = -1200;
        const cam = this.cameras?.main;
        const hitGameViewportBottom = (p) => !!p && !!cam && p.getBounds().bottom >= cam.worldView.bottom - 2;
        const outOfMap = (p) =>
          !!p &&
          (p.x < -tileW || p.x > worldW + tileW || p.y < -tileH || p.y > worldH + tileH);
        if (hitGameViewportBottom(this.p1) || outOfMap(this.p1)) {
          this.p1.setPosition(this.p1Spawn.x, this.p1Spawn.y);
          this.p1.body?.setVelocity(0, 0);
        }
        if (hitGameViewportBottom(this.p2) || outOfMap(this.p2)) {
          this.p2.setPosition(this.p2Spawn.x, this.p2Spawn.y);
          this.p2.body?.setVelocity(0, 0);
        }

        const mobile = window.__PT_isMobileControl?.() === true;
        const movePlayer = (p, keys, allowTouch) => {
          if (!p?.body) return;
          const left = keys.left.isDown || (allowTouch && mobile && window.__PT_touchDown?.("left"));
          const right = keys.right.isDown || (allowTouch && mobile && window.__PT_touchDown?.("right"));
          if (left) p.setVelocityX(-pSpeed);
          else if (right) p.setVelocityX(pSpeed);
          else p.setVelocityX(0);
          if (left) p.setTexture("char_left");
          else if (right) p.setTexture("char_right");
          else p.setTexture("char_front");
          const wantJump = Phaser.Input.Keyboard.JustDown(keys.jump) || (allowTouch && mobile && window.__PT_consumeTouchJump?.());
          if (wantJump && (p.body.blocked.down || p.body.touching.down)) {
            p.setVelocityY(jumpV);
          }
        };
        movePlayer(this.p1, this.p1Keys, true);
        movePlayer(this.p2, this.p2Keys, false);

        let p1OnRedWin = false;
        let p2OnBlueWin = false;
        this.physics.overlap(this.p1, this.redWinSensors, () => {
          p1OnRedWin = true;
        });
        this.physics.overlap(this.p2, this.blueWinSensors, () => {
          p2OnBlueWin = true;
        });
        if (p1OnRedWin && p2OnBlueWin) {
          this.finished = true;
          if (typeof onLevelWin === "function") {
            onLevelWin(levelId, { title: "合作成功", message: "两名玩家已同时到达对应终点！" });
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
      parent: ctx.ui.phaserMount,
      width: vp.width,
      height: vp.height,
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  };
})();

