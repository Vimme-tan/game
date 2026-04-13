// Single-player Level 8 (JSON)
// Exposes: window.SinglePlayerLevels.startLevel8(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel8 = async function startLevel8(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    if (window.location.protocol === "file:") {
      alert("Please run via http://localhost instead of file:// to load local JSON resources.");
      return;
    }

    const mapUrl = new URL(assets.level8Json, window.location.href).toString();
    let mapData;
    try {
      const r = await fetch(mapUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      mapData = await r.json();
    } catch (e) {
      alert(`Level 8 map load failed: ${e?.message || String(e)}`);
      return;
    }

    const mapW = Number(mapData.width || 1);
    const mapH = Number(mapData.height || 1);
    const tileW = Number(mapData.tilewidth || 64);
    const tileH = Number(mapData.tileheight || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;
    const mapBase = new URL(mapUrl);

    const resolveTilesetImageUrl = (imageSource, baseUrl) => window.PTLevelShared?.resolveTilesetImageUrl?.(imageSource, baseUrl) ?? null;
    const fetchTsxText = (tsxSource, baseUrl) => window.PTLevelShared?.fetchTsxText?.(tsxSource, baseUrl);
    const parseTsx = (tsxText) => window.PTLevelShared?.parseTsx?.(tsxText);

    const tilesetInfos = [];
    for (const ts of Array.isArray(mapData.tilesets) ? mapData.tilesets : []) {
      const firstgid = Number(ts.firstgid || 1);
      if (!ts.source) continue;
      // eight.json 里 tileset source 是 ../tiled/examples/*.tsx
      // 共享模块 fetchTsxText 会自动用 basename 在同目录回退（level8 目录下有 dung.tsx / fake.tsx）
      const tsxText = await fetchTsxText(ts.source, mapBase);
      const parsed = parseTsx(tsxText);
      tilesetInfos.push({ firstgid, ...parsed });
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);
    if (!tilesetInfos.length) {
      alert("Level 8 resource load failed: TSX tileset parse failed.");
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

    const hasPropName = (obj, key) =>
      Array.isArray(obj?.properties) && obj.properties.some((p) => String(p?.name || "").toLowerCase() === String(key || "").toLowerCase());
    const propTrue = (props, key) => {
      if (!Array.isArray(props)) return false;
      const k = String(key || "").toLowerCase();
      return props.some((p) => {
        const name = String(p?.name || "").toLowerCase();
        if (name !== k) return false;
        return p?.value === true || p?.value === 1 || String(p?.value || "").toLowerCase() === "true";
      });
    };

    const bornObj = objects.find((o) => propTrue(o.properties, "born") || hasPropName(o, "born")) || null;
    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y - Math.max(6, Math.min(tileH * 0.6, (bornObj.height || tileH) * 0.6)) : tileH * 2;

    // preload images
    const imageToKey = new Map();
    for (const ts of tilesetInfos) {
      for (const idStr of Object.keys(ts.tiles || {})) {
        const t = ts.tiles[Number(idStr)];
        if (!t?.imageSource) continue;
        const url = resolveTilesetImageUrl(t.imageSource, mapBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `tile_${ts.name}_${idStr}`);
      }
    }

    const scene = {
      preload: function () {
        this.load.on("loaderror", (file) => {
          console.warn("level8 loaderror:", file?.key, file?.src);
        });
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        window.__PT_makeSpriteBgTransparent?.(this, ["char_front", "char_left", "char_right"]);

        this.finished = false;
        this._tuning =
          window.PTLevelShared?.getDefaultPlayerTuning?.() || { speed: 300, jumpV: -920, gravityY: 900, maxVx: 320, maxVy: 900, dragX: 900 };

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = this._tuning.gravityY;
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        window.PTLevelShared?.applyWorldGreyBackdrop?.(this, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        const drawTile = (cx, cy, tile, displayW = tileW, displayH = tileH, depth = 10) => {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (!key) return null;
          const img = this.add.image(cx - displayW / 2, cy + displayH / 2, key).setOrigin(0, 1);
          img.setDisplaySize(displayW, displayH);
          img.setDepth(depth);
          return img;
        };

        const addStaticRect = (group, cx, cy, w = tileW, h = tileH) => {
          const r = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
          this.physics.add.existing(r, true);
          group.add(r);
          return r;
        };

        this.solids = this.physics.add.staticGroup();
        this.deathSensors = this.physics.add.staticGroup();
        this.winSensors = this.physics.add.staticGroup();

        // Render tile layers as images + build collisions.
        for (const layer of tileLayers) {
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const p = tile.props || {};
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const cx = col * tileW + tileW / 2;
            const cy = row * tileH + tileH / 2;

            const isWin = p.win === true;
            drawTile(cx, cy, tile, isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH, isWin ? 30 : 10);

            if (p.solid === true) addStaticRect(this.solids, cx, cy);
            if (p.death === true) addStaticRect(this.deathSensors, cx, cy, tileW * 2, tileH / 2);
            if (p.win === true) addStaticRect(this.winSensors, cx, cy, tileW * 2, tileH * 2);
          }
        }

        // player
        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front").setOrigin(0.5, 1);
        this.player.setDepth(1000); // 永远显示在最上层（避免被地图 tile 覆盖导致“看不到人物”）
        this.player.setDisplaySize(tileW * 0.55 * 2, tileH * 0.85 * 2);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setDragX(this._tuning.dragX);
        this.player.body.setMaxVelocity(this._tuning.maxVx, this._tuning.maxVy);
        this.physics.add.collider(this.player, this.solids);

        // death => restart level (重置事件)
        const restart = () => window.PTLevelShared?.restartLevel?.(ctx, levelId);
        this.physics.add.overlap(this.player, this.deathSensors, () => {
          if (this.finished) return;
          restart?.();
        });
        this.physics.add.overlap(this.player, this.winSensors, async () => {
          if (this.finished) return;
          this.finished = true;
          try {
            await api.complete(levelId, 100);
            await refreshMe();
          } catch {}
          if (typeof onLevelWin === "function") onLevelWin(levelId);
        });

        // input
        this.cursors = this.input.keyboard.createCursorKeys();
      },
      update: function () {
        if (!this.player?.body || this.finished) return;
        const tuning = this._tuning || { speed: 300, jumpV: -920 };

        const mobile = window.__PT_isMobileControl?.() === true;
        const left = this.cursors.left.isDown || (mobile && window.__PT_touchDown?.("left"));
        const right = this.cursors.right.isDown || (mobile && window.__PT_touchDown?.("right"));

        if (left) this.player.setVelocityX(-tuning.speed);
        else if (right) this.player.setVelocityX(tuning.speed);
        else this.player.setVelocityX(0);

        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump = Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.cursors.up) || (mobile && window.__PT_consumeTouchJump?.());
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) {
          this.player.setVelocityY(tuning.jumpV);
        }

        // 掉出地图边界：死亡重开
        const outOfMap = this.player.x < -tileW || this.player.x > worldW + tileW || this.player.y < -tileH || this.player.y > worldH + tileH;
        if (outOfMap) {
          window.PTLevelShared?.restartLevel?.(ctx, levelId);
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

