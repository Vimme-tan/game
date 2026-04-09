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
      alert("当前是 file:// 方式打开页面，浏览器会阻止加载本地 JSON 资源。\n请用 http:// 方式运行一个本地静态服务器后再测试（例如 localhost）。");
      return;
    }

    const mapUrl = new URL(assets.raceLevel1Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`竞速第一关地图加载失败：${e?.message || String(e)}`);
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
        // Maps under `doubleplayer/level1/` need `../../map/`.
        candidates.push(`../../map/${baseName}`);
        candidates.push(`../map/${baseName}`);
        candidates.push(`map/${baseName}`);
      }

      // Normalize legacy exported path like "../tiled/examples/sticker-knight/map/x.png"
      // to the runtime shared map directory.
      if (baseName) candidates.push(`../../map/${baseName}`);

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
      alert("竞速第一关资源加载失败：TSX tileset 未能解析。");
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
    const born1Obj = objects.find((o) => hasTrueProp(o, "born1") || hasTrueProp(o, "bron1")) || null;
    const born2Obj = objects.find((o) => hasTrueProp(o, "born2")) || null;

    function toSpawn(o, fallback) {
      if (!o) return fallback;
      return {
        x: o.x + (o.width || tileW) / 2,
        y: o.y,
      };
    }

    function codeToPhaserKeyCode(code) {
      if (typeof code !== "string" || !code) return null;
      const c = code;
      if (c === "ArrowLeft") return Phaser.Input.Keyboard.KeyCodes.LEFT;
      if (c === "ArrowRight") return Phaser.Input.Keyboard.KeyCodes.RIGHT;
      if (c === "ArrowUp") return Phaser.Input.Keyboard.KeyCodes.UP;
      if (c === "ArrowDown") return Phaser.Input.Keyboard.KeyCodes.DOWN;
      if (c === "Space") return Phaser.Input.Keyboard.KeyCodes.SPACE;
      if (c === "ShiftLeft" || c === "ShiftRight") return Phaser.Input.Keyboard.KeyCodes.SHIFT;
      if (c === "ControlLeft" || c === "ControlRight") return Phaser.Input.Keyboard.KeyCodes.CTRL;
      if (c === "AltLeft" || c === "AltRight") return Phaser.Input.Keyboard.KeyCodes.ALT;
      if (c.startsWith("Key") && c.length === 4) {
        const ch = c.slice(3);
        const kc = Phaser.Input.Keyboard.KeyCodes[ch.toUpperCase()];
        return typeof kc === "number" ? kc : null;
      }
      if (c.startsWith("Digit") && c.length === 6) {
        const d = c.slice(5);
        const map = { "0": "ZERO", "1": "ONE", "2": "TWO", "3": "THREE", "4": "FOUR", "5": "FIVE", "6": "SIX", "7": "SEVEN", "8": "EIGHT", "9": "NINE" };
        const name = map[d];
        const kc = name ? Phaser.Input.Keyboard.KeyCodes[name] : null;
        return typeof kc === "number" ? kc : null;
      }
      return null;
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

        if (isWin) winRects.push({ cx, cy, w: tileW, h: tileH });

        // Moving logic depends on layer and props
        if (layerName === "two" && (isL || isR)) {
          movers.push({ x: col * tileW, y: (row + 1) * tileH, key, axis: "x", dir: isL ? -1 : 1, min: (isL ? -3 : -3), max: (isL ? 3 : 3) });
          continue;
        }
        if (layerName === "three" && isL) {
          movers.push({ x: col * tileW, y: (row + 1) * tileH, key, axis: "y", dir: 1, min: 0, max: 6 });
          continue;
        }
        if (layerName === "three" && isR && isDeath) {
          spikes.push({ x: col * tileW, y: (row + 1) * tileH, key, axis: "y", dir: -1, min: -6, max: 0 });
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
        this.finished = false;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
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
            const isMove = (layerName === "two" && (p.lmove === true || p.rmove === true)) || (layerName === "three" && (p.lmove === true || (p.rmove === true && p.death === true)));
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
          s._speed = (m.axis === "x" ? tileW : tileH) * 3.8;
          this.movers.push(s);
        }

        // spikes (moving death)
        this.spikes = [];
        for (const s0 of spikes) {
          const sp = this.add.image(s0.x, s0.y, s0.key).setOrigin(0, 1);
          sp.setDisplaySize(tileW * 2, tileH);
          this.physics.add.existing(sp);
          sp.body.allowGravity = false;
          sp.body.immovable = true;
          sp._axis = s0.axis;
          sp._baseX = sp.x;
          sp._baseY = sp.y;
          sp._dir = s0.dir;
          sp._min = s0.min;
          sp._max = s0.max;
          sp._speed = tileH * 6;
          this.spikes.push(sp);
        }

        // players
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
          for (const m of this.movers) this.physics.add.collider(p, m);
          for (const sp of this.spikes) this.physics.add.overlap(p, sp, () => {
            p.setPosition(x, y);
            p.body.setVelocity(0, 0);
          });
          return p;
        };

        this.p1Spawn = toSpawn(born1Obj, { x: tileW * 2, y: worldH - tileH * 3 });
        this.p2Spawn = toSpawn(born2Obj, { x: tileW * 3.2, y: worldH - tileH * 3 });
        this.p1 = mkPlayer(this.p1Spawn.x, this.p1Spawn.y, 0x93c5fd);
        this.p2 = mkPlayer(this.p2Spawn.x, this.p2Spawn.y, 0xfca5a5);

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
          if (typeof onLevelWin === "function") onLevelWin(levelId, { title: "竞速结束", message: `${who} 到达终点！` });
        };
        this.physics.add.overlap(this.p1, this.winSensors, () => finish("P1"));
        this.physics.add.overlap(this.p2, this.winSensors, () => finish("P2"));

        // inputs (from settings)
        const kb = state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "Space" },
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
        }

        if (this.finished) return;

        // P1
        const pSpeed = 520;
        const jumpV = -1200;
        const p1Left = this.p1Keys.left.isDown;
        const p1Right = this.p1Keys.right.isDown;
        if (p1Left) this.p1.setVelocityX(-pSpeed);
        else if (p1Right) this.p1.setVelocityX(pSpeed);
        else this.p1.setVelocityX(0);
        if (p1Left) this.p1.setTexture("char_left");
        else if (p1Right) this.p1.setTexture("char_right");
        else this.p1.setTexture("char_front");
        const p1Jump = Phaser.Input.Keyboard.JustDown(this.p1Keys.jump);
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

