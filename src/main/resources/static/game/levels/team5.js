// Team-up Challenges Level 5 (double5.json)
// Exposes:
// window.TeamUpLevels.startTeamLevel5(ctx, levelId)
(function () {
  window.TeamUpLevels = window.TeamUpLevels || {};

  window.TeamUpLevels.startTeamLevel5 = async function startTeamLevel5(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.teamLevel5Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Team level 5 map load failed: ${e?.message || String(e)}`);
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

    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);
    const resolveTilesetImageUrl = (imageSource, baseUrl) => window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ?? null;
    const codeToPhaserKeyCode = (code) => window.PTLevelShared?.codeToPhaserKeyCode?.(code) ?? null;

    const tilesetInfos = [];
    for (const ts of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(ts.firstgid || 1);
      const source = ts.source;
      if (!source) continue;
      try {
        const tsxText = await fetchTsxText(source, mapBase);
        const parsed = parseTsx(tsxText);
        tilesetInfos.push({ firstgid, source, ...parsed });
      } catch (e) {
        console.warn("[team5] tileset load failed", source, e?.message || e);
      }
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Team level 5 resource load failed: TSX tileset parse failed.");
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
      if (!tile) return { tileset: chosen, tileId, imageSource: null, props: {} };
      return { ...tile, tileset: chosen, tileId };
    }

    const allLayers = Array.isArray(mapData.layers) ? mapData.layers : [];
    const tileLayers = allLayers.filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const opLayer = allLayers.find((l) => l && l.type === "objectgroup" && String(l.name || "").toLowerCase() === "op");
    const opObjects = Array.isArray(opLayer?.objects) ? opLayer.objects : [];

    const born1Obj = opObjects.find((o) => propTrue(o.properties, "born1") || propTrue(o.properties, "bron1")) || null;
    const born2Obj = opObjects.find((o) => propTrue(o.properties, "born2") || propTrue(o.properties, "bron2")) || null;

    const touchObj = (name) =>
      opObjects.find((o) => propTrue(o.properties, name) || String(o.name || "").toLowerCase() === String(name).toLowerCase()) || null;

    function toSpawn(o, fallback) {
      if (!o) return fallback;
      return {
        x: o.x + (o.width || tileW) / 2,
        y: o.y - Math.max(6, Math.min(tileH * 0.6, (o.height || tileH) * 0.6)),
      };
    }

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

    const EXTRA_MAP_IMAGES = ["earthWall.png", "earthWall2.png", "trap.png", "bombStroked.png", "doorRedStroked.png", "doorStroked.png", "grey.png"];
    const mapFileUrl = (fileName) => resolveTilesetImageUrl(fileName, mapBase);
    for (const f of EXTRA_MAP_IMAGES) {
      const url = mapFileUrl(f);
      if (!url) continue;
      if (!imageToKey.has(url)) imageToKey.set(url, `map_${f.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`);
    }
    const imgKeyByFile = (fileName) => {
      const url = mapFileUrl(fileName);
      return url ? imageToKey.get(url) || null : null;
    };

    const scene = {
      preload: function () {
        window.PTLevelShared?.loadCharacterSprites?.(this, assets);
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.PTLevelShared?.makeCharacterSpritesTransparent?.(this);
        this.finished = false;
        this.deathInvulnMs = 650;
        this.lastRespawnAt1 = -1e9;
        this.lastRespawnAt2 = -1e9;
        this.triggered = new Set();
        this._controEnabled = false;
        this._redGone = false;
        this._blueGone = false;

        this._tuning = window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = this._tuning.gravityY;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        const spawnImageOrRect = (cx, cy, w, h, key, depth = 20) => {
          if (!key) {
            const r = this.add.rectangle(cx, cy, w, h, 0xff00ff, 0.2).setDepth(depth);
            this.physics.add.existing(r);
            return r;
          }
          const img = this.physics.add.image(cx, cy, key);
          img.setDisplaySize(w, h);
          img.setDepth(depth);
          return img;
        };

        const freezeObj = (o, immovable = true) => {
          if (!o?.body) return;
          if (o.setAllowGravity) o.setAllowGravity(false);
          o.body.allowGravity = false;
          o.body.moves = false;
          if (immovable) {
            if (o.setImmovable) o.setImmovable(true);
            o.body.immovable = true;
            if (o.body.setImmovable) o.body.setImmovable(true);
          }
          if (o.setVelocity) o.setVelocity(0, 0);
          if (o.body.setVelocity) o.body.setVelocity(0, 0);
        };

        // Colliders

        this.solids = this.physics.add.staticGroup();
        this.death1Objs = [];
        this.death2Objs = [];
        this.death3Objs = [];
        this.deathObjs = [];
        this.sword1Objs = [];
        this.sword2Objs = [];
        this.sword3Objs = [];
        this.sword4Objs = [];

        this.emptyGroup = this.physics.add.staticGroup(); // empty
        this.empty1Group = this.physics.add.staticGroup();
        this.empty2Group = this.physics.add.staticGroup();
        this.empty3Group = this.physics.add.group(); // empty3 moving platform

        this.vanish1Group = this.physics.add.staticGroup();
        this.moveGroup = this.physics.add.group(); // move
        this.move1Group = this.physics.add.group(); // move1
        this.move2Group = this.physics.add.group(); // move2

        this.redGroup = this.physics.add.group(); // removable red tiles
        this.blueGroup = this.physics.add.group(); // removable blue tiles
        this.contro3Group = this.physics.add.staticGroup(); // appears after both gone

        const addStaticSolid = (x, y, w, h) => {
          const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
          this.physics.add.existing(r, true);
          this.solids.add(r);
          return r;
        };

        const layerByName = (n) => tileLayers.find((l) => String(l.name || "").toLowerCase() === String(n)) || null;
        const layer1 = tileLayers.filter((l) => String(l.name || "").toLowerCase() === "1");
        const layer3 = tileLayers.filter((l) => String(l.name || "").toLowerCase() === "3");

        // helper to build tile groups by scanning layers

        const scanLayerTiles = (layers, handler) => {
          for (const layer of layers) {
            const data = layer.data;
            for (let idx = 0; idx < mapW * mapH; idx++) {
              const gid = data[idx] || 0;
              const tile = resolveTileFromGid(gid);
              if (!tile) continue;
              const p = tile.props || {};
              const col = idx % mapW;
              const row = Math.floor(idx / mapW);
              const cx = col * tileW + tileW / 2;
              const cy = row * tileH + tileH / 2;

              handler(tile, p, cx, cy, tileLayers);
            }
          }
        };

        const drawStaticTile = (cx, cy, key, w, h) => {
          if (!key) return;
          const img = this.add.image(cx - tileW / 2, cy + tileH / 2, key).setOrigin(0, 1);
          img.setDisplaySize(w, h);
          img.setDepth(5);
        };

        // base solids: p.solid on any layer (skip tiles that we spawn as interactive physics objects)
        scanLayerTiles(tileLayers, (tile, p, cx, cy) => {
          const isInteractive =
            p.move === true ||
            p.move1 === true ||
            p.move2 === true ||
            p.empty === true ||
            p.empty1 === true ||
            p.empty2 === true ||
            p.empty3 === true ||
            p.red === true ||
            p.blue === true ||
            p.death === true ||
            p.death1 === true ||
            p.death2 === true ||
            p.death3 === true ||
            p.sword === true ||
            p.sword1 === true ||
            p.sword2 === true ||
            p.sword3 === true ||
            p.sword4 === true ||
            p.vanish1 === true ||
            p.contro3 === true;
          if (p.solid === true && !isInteractive) addStaticSolid(cx, cy, tileW, tileH);
          // Also render background for non-interactive tiles
          const url = tile.imageSource ? resolveTilesetImageUrl(tile.imageSource, mapBase) : null;
          const key = url ? imageToKey.get(url) : null;
          if (
            key &&
            p.solid !== true &&
            (p.death ||
              p.death1 ||
              p.death2 ||
              p.death3 ||
              p.sword ||
              p.sword1 ||
              p.sword2 ||
              p.sword3 ||
              p.sword4 ||
              p.move ||
              p.move1 ||
              p.move2 ||
              p.empty ||
              p.empty1 ||
              p.empty2 ||
              p.empty3 ||
              p.vanish1 ||
              p.red ||
              p.blue ||
              p.bluewin ||
              p.redwin ||
              p.contro3)
          ) {
            // interactive tiles are spawned as objects, so skip static render here.
          } else if (key) {
            drawStaticTile(cx, cy, key, tileW, tileH);
          }
        });

        // spawn interactive tiles for layer1 & layer3 only (those tags exist there in double5)
        const spawnInteractive = (tile, p, cx, cy) => {
          const url = tile.imageSource ? resolveTilesetImageUrl(tile.imageSource, mapBase) : null;
          const key = url ? imageToKey.get(url) : null;
          const objKey = key || imgKeyByFile("earthWall.png") || imgKeyByFile("trap.png") || null;

          // Death hazards (layer1): start hidden+disabled

          const trapW = tileW * 2;
          const trapH = tileH / 2;

          if (p.death === true) {
            const o = spawnImageOrRect(cx, cy, trapW, trapH, objKey, 35);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.deathObjs.push(o);
            return;
          }
          if (p.death1 === true) {
            const o = spawnImageOrRect(cx, cy, trapW, trapH, objKey, 35);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.death1Objs.push(o);
            return;
          }
          if (p.death2 === true) {
            const o = spawnImageOrRect(cx, cy, trapW, trapH, objKey, 35);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.death2Objs.push(o);
            return;
          }
          if (p.death3 === true) {
            const o = spawnImageOrRect(cx, cy, trapW, trapH, objKey, 35);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.death3Objs.push(o);
            return;
          }

          // Swords (layer1): start hidden+disabled

          if (p.sword === true || p.sword1 === true) {
            const o = spawnImageOrRect(cx, cy, tileW * 1.6, tileH * 0.9, objKey || imgKeyByFile("doorStroked.png"), 45);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.sword1Objs.push(o);
            return;
          }
          if (p.sword2 === true) {
            const o = spawnImageOrRect(cx, cy, tileW * 1.6, tileH * 0.9, objKey, 45);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.sword2Objs.push(o);
            return;
          }
          if (p.sword3 === true) {
            const o = spawnImageOrRect(cx, cy, tileW * 1.6, tileH * 0.9, objKey, 45);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.sword3Objs.push(o);
            return;
          }
          if (p.sword4 === true) {
            const o = spawnImageOrRect(cx, cy, tileW * 1.6, tileH * 0.9, objKey, 45);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.sword4Objs.push(o);
            return;
          }

          if (p.vanish1 === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall.png"), 15);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.vanish1Group.add(o);
            return;
          }
          if (p.contro3 === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall.png"), 15);
            freezeObj(o, true);
            o.setVisible(false);
            if (o.body) o.body.enable = false;
            this.contro3Group.add(o);
            return;
          }

          // Layer3 moving platforms & removables

          const isLayer3 = true;

          if (p.move === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall.png"), 20);
            freezeObj(o, true);
            this.moveGroup.add(o);
            return;
          }
          if (p.move1 === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall.png"), 20);
            freezeObj(o, true);
            this.move1Group.add(o);
            return;
          }
          if (p.move2 === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall.png"), 20);
            freezeObj(o, true);
            this.move2Group.add(o);
            return;
          }
          if (p.empty3 === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall2.png"), 20);
            freezeObj(o, true);
            this.empty3Group.add(o);
            return;
          }
          if (p.empty === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall.png"), 20);
            freezeObj(o, true);
            this.emptyGroup.add(o);
            return;
          }
          if (p.empty1 === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall.png"), 20);
            freezeObj(o, true);
            this.empty1Group.add(o);
            return;
          }
          if (p.empty2 === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("earthWall.png"), 20);
            freezeObj(o, true);
            this.empty2Group.add(o);
            return;
          }
          if (p.red === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("doorRedStroked.png"), 25);
            freezeObj(o, true);
            this.redGroup.add(o);
            return;
          }
          if (p.blue === true) {
            const o = spawnImageOrRect(cx, cy, tileW, tileH, objKey || imgKeyByFile("doorStroked.png"), 25);
            freezeObj(o, true);
            this.blueGroup.add(o);
            return;
          }

          if (p.bluewin === true || p.redwin === true || p.redwin1 === true || p.bluewin1 === true) {
            // win tiles handled separately via rectangles

            return;
          }
        };

        // scan all tile layers to spawn interactive objects
        scanLayerTiles(tileLayers, (tile, p, cx, cy) => {
          if (!p) return;
          // interactive based on props presence

          if (
            p.death === true ||
            p.death1 === true ||
            p.death2 === true ||
            p.death3 === true ||
            p.sword === true ||
            p.sword1 === true ||
            p.sword2 === true ||
            p.sword3 === true ||
            p.sword4 === true ||
            p.vanish1 === true ||
            p.contro3 === true ||
            p.move === true ||
            p.move1 === true ||
            p.move2 === true ||
            p.empty3 === true ||
            p.empty === true ||
            p.empty1 === true ||
            p.empty2 === true ||
            p.red === true ||
            p.blue === true
          ) {
            spawnInteractive(tile, p, cx, cy);
          }
        });

        // tweens: move oscillations (match rules)

        const oscMoveDx = -tileW * 2; // move: left 2 then right 2
        const oscMove2Dx = tileW * 10; // move2: right 10 then left 10
        const oscMove1Dx = -tileW * 10; // move1: left 10 then right 10
        const oscEmpty3Dy = tileH * 2;
        const tweenGroupX = (grp, dx) => {
          for (const o of grp.getChildren()) {
            this.tweens.add({
              targets: o,
              x: o.x + dx,
              duration: 520,
              ease: "Sine.easeInOut",
              yoyo: true,
              repeat: -1,
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        };
        const tweenGroupY = (grp, dy) => {
          for (const o of grp.getChildren()) {
            this.tweens.add({
              targets: o,
              y: o.y - dy,
              duration: 520,
              ease: "Sine.easeInOut",
              yoyo: true,
              repeat: -1,
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        };
        tweenGroupX(this.moveGroup, oscMoveDx);
        tweenGroupX(this.move1Group, oscMove1Dx);
        tweenGroupX(this.move2Group, oscMove2Dx);
        tweenGroupY(this.empty3Group, oscEmpty3Dy);

        // Players

        const mkPlayer = (x, y, tint) => {
          const p = this.physics.add.sprite(x, y, "char_front").setOrigin(0.5, 1);
          p.setTint(tint);
          window.PTLevelShared?.applyPlayerSizing?.(p, tileW, tileH);
          p.body.setCollideWorldBounds(true);
          p.body.setDragX(900);
          p.body.setMaxVelocity(320, 900);
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
          if (isP1) this.lastRespawnAt1 = this.time.now;
          else this.lastRespawnAt2 = this.time.now;
        };

        // Colliders for solids and moving platforms

        this.physics.add.collider(this.p1, this.solids);
        this.physics.add.collider(this.p2, this.solids);
        this.physics.add.collider(this.p1, this.emptyGroup);
        this.physics.add.collider(this.p2, this.emptyGroup);
        this.physics.add.collider(this.p1, this.empty1Group);
        this.physics.add.collider(this.p2, this.empty1Group);
        this.physics.add.collider(this.p1, this.empty2Group);
        this.physics.add.collider(this.p2, this.empty2Group);
        this.physics.add.collider(this.p1, this.empty3Group);
        this.physics.add.collider(this.p2, this.empty3Group);
        this.physics.add.collider(this.p1, this.vanish1Group);
        this.physics.add.collider(this.p2, this.vanish1Group);
        this.physics.add.collider(this.p1, this.contro3Group);
        this.physics.add.collider(this.p2, this.contro3Group);
        this.physics.add.collider(this.p1, this.moveGroup);
        this.physics.add.collider(this.p2, this.moveGroup);
        this.physics.add.collider(this.p1, this.move1Group);
        this.physics.add.collider(this.p2, this.move1Group);
        this.physics.add.collider(this.p1, this.move2Group);
        this.physics.add.collider(this.p2, this.move2Group);
        this.physics.add.collider(this.p1, this.redGroup);
        this.physics.add.collider(this.p2, this.redGroup);
        this.physics.add.collider(this.p1, this.blueGroup);
        this.physics.add.collider(this.p2, this.blueGroup);

        // Deadly objects overlap

        this.deadlyGroup = this.physics.add.group();
        for (const o of [...this.deathObjs, ...this.death1Objs, ...this.death2Objs, ...this.death3Objs, ...this.sword1Objs, ...this.sword2Objs, ...this.sword3Objs, ...this.sword4Objs]) {
          this.deadlyGroup.add(o);
        }

        const hitDeadly = (player) => {
          const isP1 = player === this.p1;
          const last = isP1 ? this.lastRespawnAt1 : this.lastRespawnAt2;
          if (this.time.now - last < this.deathInvulnMs) return;
          window.PTLevelShared?.playDieSfx?.();
          this.respawnPlayer(player);
        };
        this.physics.add.overlap(this.p1, this.deadlyGroup, () => hitDeadly(this.p1));
        this.physics.add.overlap(this.p2, this.deadlyGroup, () => hitDeadly(this.p2));

        // Win rectangles (layer3 bluewin/redwin)

        this._blueWinRects = [];
        this._redWinRects = [];
        for (const layer of tileLayers) {
          if (String(layer.name || "").toLowerCase() !== "3") continue;
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const gid = data[idx] || 0;
            const tile = resolveTileFromGid(gid);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;
            if (p.bluewin === true) {
              const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0x0000ff, 0);
              this.physics.add.existing(s, true);
              this._blueWinRects.push(s);
            }
            if (p.redwin === true) {
              const s = this.add.rectangle(cx, cy, tileW * 2, tileH * 2, 0xff0000, 0);
              this.physics.add.existing(s, true);
              this._redWinRects.push(s);
            }
          }
        }

        // Touch sensors

        const makeSensor = (obj) => {
          if (!obj) return null;
          const x = Number(obj.x || 0);
          const y = Number(obj.y || 0);
          const w = Number(obj.width || tileW);
          const h = Number(obj.height || tileH);
          const s = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x00ffff, 0);
          this.physics.add.existing(s, true);
          return s;
        };
        const oneShot = (key, fn) => {
          if (this.triggered.has(key)) return;
          this.triggered.add(key);
          fn();
        };
        const hook = (sensor, key, fn) => {
          if (!sensor) return;
          const fire = () => oneShot(key, fn);
          this.physics.add.overlap(this.p1, sensor, fire);
          this.physics.add.overlap(this.p2, sensor, fire);
        };

        const t0 = makeSensor(touchObj("touch"));
        const t1 = makeSensor(touchObj("touch1"));
        const t2 = makeSensor(touchObj("touch2"));
        const t3 = makeSensor(touchObj("touch3"));
        const t4 = makeSensor(touchObj("touch4"));
        const t5 = makeSensor(touchObj("touch5"));
        const t6 = makeSensor(touchObj("touch6"));
        const t7 = makeSensor(touchObj("touch7"));
        const t8 = makeSensor(touchObj("touch8"));
        const t9 = makeSensor(touchObj("touch9"));
        const t10 = makeSensor(touchObj("touch10"));
        const t11 = makeSensor(touchObj("touch11"));
        const t12 = makeSensor(touchObj("touch12"));
        const t13 = makeSensor(touchObj("touch13"));

        // touch: death up 1 tile
        hook(t0, "touch_death", () => {
          for (const o of this.deathObjs) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
            this.tweens.add({
              targets: o,
              y: o.y - tileH,
              duration: 220,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });
        hook(t1, "touch1_death1", () => {
          for (const o of this.death1Objs) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
            this.tweens.add({
              targets: o,
              y: o.y - tileH,
              duration: 220,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });
        hook(t2, "touch2_death2", () => {
          for (const o of this.death2Objs) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
            this.tweens.add({
              targets: o,
              y: o.y - tileH,
              duration: 220,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        });
        const triggerDeath3 = () => {
          for (const o of this.death3Objs) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
            this.tweens.add({
              targets: o,
              y: o.y + tileH * 32,
              duration: 2400,
              ease: "Sine.easeInOut",
              onUpdate: () => o?.body?.updateFromGameObject?.(),
            });
          }
        };
        hook(t3, "touch3_death3", triggerDeath3);
        hook(t5, "touch5_death3", triggerDeath3);

        // touch4: sword (sword1) -> right 48, sword4 -> left 48
        hook(t4, "touch4_swords", () => {
          const dx = tileW * 48;
          const run = (objs, dir = 1) => {
            for (const o of objs) {
              o.setVisible(true);
              if (o.body) o.body.enable = true;
              this.tweens.add({
                targets: o,
                x: o.x + dir * dx,
                duration: 2600,
                ease: "Sine.easeIn",
                onUpdate: () => o?.body?.updateFromGameObject?.(),
                onComplete: () => {
                  if (o.body) o.body.enable = false;
                  o.setVisible(false);
                },
              });
            }
          };
          run(this.sword1Objs, 1);
          run(this.sword4Objs, -1);
        });

        // touch12 or touch13: sword2 -> right 48 ; sword3 -> left 48

        const triggerSwords23 = () => {
          const dx = tileW * 48;
          const run = (objs, dir) => {
            for (const o of objs) {
              o.setVisible(true);
              if (o.body) o.body.enable = true;
              this.tweens.add({
                targets: o,
                x: o.x + dir * dx,
                duration: 2600,
                ease: "Sine.easeIn",
                onUpdate: () => o?.body?.updateFromGameObject?.(),
                onComplete: () => {
                  if (o.body) o.body.enable = false;
                  o.setVisible(false);
                },
              });
            }
          };
          run(this.sword2Objs, 1);
          run(this.sword3Objs, -1);
        };
        hook(t12, "touch12_swords23", triggerSwords23);
        hook(t13, "touch13_swords23", triggerSwords23);

        // touch6: red disappears; touch7: blue disappears; then contro3 appears
        hook(t6, "touch6_redGone", () => {
          this._redGone = true;
          for (const o of this.redGroup.getChildren()) {
            if (o?.body) o.body.enable = false;
            o.setVisible(false);
            o.destroy();
          }
          if (this._blueGone && !this._controEnabled) {
            this._controEnabled = true;
            for (const o of this.contro3Group.getChildren()) {
              o.setVisible(true);
              if (o.body) o.body.enable = true;
            }
          }
        });
        hook(t7, "touch7_blueGone", () => {
          this._blueGone = true;
          for (const o of this.blueGroup.getChildren()) {
            if (o?.body) o.body.enable = false;
            o.setVisible(false);
            o.destroy();
          }
          if (this._redGone && !this._controEnabled) {
            this._controEnabled = true;
            for (const o of this.contro3Group.getChildren()) {
              o.setVisible(true);
              if (o.body) o.body.enable = true;
            }
          }
        });

        // touch8/9/10: empty/empty1/empty2 disappear
        hook(t8, "touch8_empty", () => this.emptyGroup.clear(true, true));
        hook(t9, "touch9_empty1", () => this.empty1Group.clear(true, true));
        hook(t10, "touch10_empty2", () => this.empty2Group.clear(true, true));

        // touch11: vanish1 appears
        hook(t11, "touch11_vanish1", () => {
          for (const o of this.vanish1Group.getChildren()) {
            o.setVisible(true);
            if (o.body) o.body.enable = true;
          }
        });

        // Win check: simultaneous touch intersection (bluewin+redwin), allow swap.

        this._p1InBlue = false;
        this._p1InRed = false;
        this._p2InBlue = false;
        this._p2InRed = false;

        // input keys

        const kb = (window.__PT_getKeybinds && window.__PT_getKeybinds()) || state.keybinds || {
          p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
          p2: { left: "KeyA", right: "KeyD", jump: "KeyW" },
        };
        const p1Left = codeToPhaserKeyCode(kb.p1.left) ?? Phaser.Input.Keyboard.KeyCodes.LEFT;
        const p1Right = codeToPhaserKeyCode(kb.p1.right) ?? Phaser.Input.Keyboard.KeyCodes.RIGHT;
        const p1Jump = codeToPhaserKeyCode(kb.p1.jump) ?? Phaser.Input.Keyboard.KeyCodes.UP;
        const p2Left = codeToPhaserKeyCode(kb.p2.left) ?? Phaser.Input.Keyboard.KeyCodes.A;
        const p2Right = codeToPhaserKeyCode(kb.p2.right) ?? Phaser.Input.Keyboard.KeyCodes.D;
        const p2Jump = codeToPhaserKeyCode(kb.p2.jump) ?? Phaser.Input.Keyboard.KeyCodes.W;

        this.p1Keys = this.input.keyboard.addKeys({ left: p1Left, right: p1Right, jump: p1Jump });
        this.p2Keys = this.input.keyboard.addKeys({ left: p2Left, right: p2Right, jump: p2Jump });
      },

      update: function () {
        if (!this.p1?.body || !this.p2?.body) return;
        if (this.finished) return;

        // win check via bounds intersection

        this._p1InBlue = false;
        this._p1InRed = false;
        this._p2InBlue = false;
        this._p2InRed = false;
        const pb1 = this.p1.getBounds();
        const pb2 = this.p2.getBounds();
        for (const s of this._blueWinRects) {
          const b = s.getBounds();
          if (Phaser.Geom.Intersects.RectangleToRectangle(pb1, b)) this._p1InBlue = true;
          if (Phaser.Geom.Intersects.RectangleToRectangle(pb2, b)) this._p2InBlue = true;
        }
        for (const s of this._redWinRects) {
          const b = s.getBounds();
          if (Phaser.Geom.Intersects.RectangleToRectangle(pb1, b)) this._p1InRed = true;
          if (Phaser.Geom.Intersects.RectangleToRectangle(pb2, b)) this._p2InRed = true;
        }
        const win = (this._p1InBlue && this._p2InRed) || (this._p1InRed && this._p2InBlue);
        if (win) {
          this.finished = true;
          if (typeof onLevelWin === "function") onLevelWin(levelId, { title: "合作完成", message: "两人同时到达终点！" });
          return;
        }

        // viewport boundary death -> respawn

        const vb = this.cameras.main.worldView;
        const hitVb = (b) => b.bottom >= vb.bottom - 2 || b.top <= vb.top + 2 || b.left <= vb.left + 2 || b.right >= vb.right - 2;
        if (hitVb(this.p1.getBounds())) {
          window.PTLevelShared?.playFallDeathSfx?.();
          this.respawnPlayer(this.p1);
        }
        if (hitVb(this.p2.getBounds())) {
          window.PTLevelShared?.playFallDeathSfx?.();
          this.respawnPlayer(this.p2);
        }

        const step = (p, keys, isP1) => {
          const tuning = this._tuning || { speed: 300, jumpV: -920 };
          const speed = tuning.speed;
          const jumpV = tuning.jumpV;
          const mobile = isP1 && window.__PT_isMobileControl?.() === true;
          const left = keys.left.isDown || (mobile && window.__PT_touchDown?.("left"));
          const right = keys.right.isDown || (mobile && window.__PT_touchDown?.("right"));
          if (left) p.setVelocityX(-speed);
          else if (right) p.setVelocityX(speed);
          else p.setVelocityX(0);
          if (left) window.PTLevelShared?.setCharacterPose?.(p, "left", this.time?.now);
          else if (right) window.PTLevelShared?.setCharacterPose?.(p, "right", this.time?.now);
          else window.PTLevelShared?.setCharacterPose?.(p, "front", this.time?.now);
          const wantJump = Phaser.Input.Keyboard.JustDown(keys.jump) || (mobile && window.__PT_consumeTouchJump?.());
          if (wantJump && (p.body.blocked.down || p.body.touching.down)) p.setVelocityY(jumpV);
        };

        step(this.p1, this.p1Keys, true);
        step(this.p2, this.p2Keys, false);

        // Relative movement: carry players standing on moving blocks.

        window.PTLevelShared?.carryPlayersOnMovingObjects?.(this, [this.p1, this.p2], [this.moveGroup, this.move1Group, this.move2Group, this.empty3Group]);
      },
    };

    const vp = window.__PT_getGameViewport
      ? window.__PT_getGameViewport()
      : { width: Math.min(1400, Math.max(900, window.innerWidth - 80)), height: Math.min(900, Math.max(650, window.innerHeight - 200)) };

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

