// Single-player Level 1 (TMX)
// Exposes: window.SinglePlayerLevels.startLevel1(ctx, levelId)
(function () {
  window.SinglePlayerLevels = window.SinglePlayerLevels || {};

  window.SinglePlayerLevels.startLevel1 = async function startLevel1(ctx, levelId) {
    const { assets, state, setLevelPlayLayout, destroyPhaser, api, refreshMe } = ctx;

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    const tmxUrl = new URL(assets.level1Tmx, window.location.href).toString();
    if (window.location.protocol === "file:") {
      alert("当前是 file:// 方式打开页面，浏览器会阻止加载本地 TMX 资源。\n请用 http:// 方式运行一个本地静态服务器后再测试（例如 localhost）。");
      return;
    }

    let tmxText;
    try {
      const r = await fetch(tmxUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      tmxText = await r.text();
    } catch (e) {
      alert(`第一关地图加载失败：${e?.message || String(e)}`);
      return;
    }

    const tmxXml = new DOMParser().parseFromString(tmxText, "application/xml");
    const mapEl = tmxXml.querySelector("map");
    if (!mapEl) {
      alert("TMX 解析失败：找不到 <map>。");
      return;
    }

    const mapW = Number(mapEl.getAttribute("width") || 1);
    const mapH = Number(mapEl.getAttribute("height") || 1);
    const tileW = Number(mapEl.getAttribute("tilewidth") || 64);
    const tileH = Number(mapEl.getAttribute("tileheight") || 64);
    const worldW = mapW * tileW;
    const worldH = mapH * tileH;

    const mapBase = new URL(tmxUrl);

    function parseBoolProp(propEl) {
      if (!propEl) return undefined;
      const type = String(propEl.getAttribute("type") || "").toLowerCase();
      const value = String(propEl.getAttribute("value") || "").toLowerCase();
      if (type === "bool") return value === "true" || value === "1";
      return value === "true" || value === "1";
    }

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
          props[propName] = parseBoolProp(p);
        }
        tiles[id] = { id, imageSource, props };
      }
      return { name, tiles };
    }

    // layers (CSV)
    const layers = Array.from(mapEl.querySelectorAll("layer")).map((layerEl) => {
      const name = layerEl.getAttribute("name") || "";
      const dataEl = layerEl.querySelector("data");
      const encoding = String(dataEl?.getAttribute("encoding") || "").toLowerCase();
      const raw = (dataEl?.textContent || "").trim();
      if (encoding !== "csv" && encoding !== "") throw new Error(`Unsupported TMX encoding: ${encoding || "(empty)"}`);
      const parts = raw.replace(/\s+/g, "").split(",");
      const nums = parts.map((s) => (s === "" ? 0 : Number(s)));
      return { name, data: nums.slice(0, mapW * mapH) };
    });

    // objects for born/death/fallarea
    const objectGroups = Array.from(mapEl.querySelectorAll("objectgroup"));
    const playersGroup = objectGroups.find((g) => String(g.getAttribute("name") || "").toLowerCase() === "players") || objectGroups[0] || null;
    const playerObjects = playersGroup ? Array.from(playersGroup.querySelectorAll("object")) : [];
    let bornObj = playerObjects.find((o) => {
      const props = Array.from(o.querySelectorAll("properties > property"));
      return props.some((p) => {
        const n = String(p.getAttribute("name") || "").toLowerCase();
        return (n === "birth" || n === "born") && parseBoolProp(p);
      });
    });
    if (!bornObj) bornObj = { x: tileW * 2, y: tileH * 2, width: tileW, height: tileH };

    const deathObjects = playerObjects.filter((o) =>
      Array.from(o.querySelectorAll("properties > property")).some((p) => String(p.getAttribute("name") || "").toLowerCase() === "death" && parseBoolProp(p))
    );
    const fallareaObjects = playerObjects.filter((o) =>
      Array.from(o.querySelectorAll("properties > property")).some((p) => String(p.getAttribute("name") || "").toLowerCase() === "fallarea" && parseBoolProp(p))
    );

    // tilesets
    const tilesetInfos = [];
    for (const tsEl of Array.from(mapEl.querySelectorAll("tileset"))) {
      const firstgid = Number(tsEl.getAttribute("firstgid") || "1");
      const source = tsEl.getAttribute("source");
      const tsxText = await fetchTsxText(source, mapBase);
      const parsed = parseTsx(tsxText);
      tilesetInfos.push({ firstgid, source, ...parsed });
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
    const fallRects = [];
    const moveDBlocks = [];

    for (const layer of layers) {
      const data = layer.data;
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const tile = resolveTileFromGid(data[idx] || 0);
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;
        const p = tile.props || {};
        const hasMoveD = Object.prototype.hasOwnProperty.call(p, "moveD");
        const moveDInitial = hasMoveD ? p.moveD === true : false;
        if (p.solid === true && !hasMoveD) solids.push({ cx, cy, w: tileW, h: tileH });
        if (p.win === true) winRects.push({ cx, cy, w: tileW, h: tileH });
        if (p.death === true) deathRects.push({ cx, cy, w: tileW, h: tileH, imageSource: tile.imageSource });
        if (p.fallarea === true) fallRects.push({ cx, cy, w: tileW, h: tileH });
        if (hasMoveD) {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const imgKey = url ? imageToKey.get(url) : null;
          moveDBlocks.push({ cx, cy, w: tileW, h: tileH, imgKey, initialMoveD: moveDInitial });
        }
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
        this.dead = false;
        this.moveDActivated = false;
        this.trapEventTriggered = false;
        this.moveDBodies = [];
        this.trapSpikeImgs = [];
        this.layer3Imgs = [];
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 900;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // render tiles
        for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
          const layer = layers[layerIdx];
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const tile = resolveTileFromGid(data[idx] || 0);
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWin = tile.props && tile.props.win === true;
            img.setDisplaySize(isWin ? tileW * 2 : tileW, isWin ? tileH * 2 : tileH);
            if (Object.prototype.hasOwnProperty.call(tile.props || {}, "moveD")) {
              // Level1 trap cover should be visible initially and fall after trigger.
              const initial = tile.props.moveD === true;
              img.setAlpha(layerIdx === 2 ? 1 : (initial ? 1 : 0));
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
            // Third tile layer acts as a trap cover: remember sprites for "drop down" animation.
            if (layerIdx === 2) {
              this.layer3Imgs.push(img);
            }
          }
        }

        // solids
        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        // moveD group
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

        // spawn
        const bx = Number(bornObj.getAttribute ? bornObj.getAttribute("x") : bornObj.x) + (Number(bornObj.getAttribute ? bornObj.getAttribute("width") : bornObj.width) || tileW) / 2;
        const by = Number(bornObj.getAttribute ? bornObj.getAttribute("y") : bornObj.y) || tileH * 2;
        this.bornX = bx;
        this.bornY = by;

        this.player = this.physics.add.sprite(bx, by, "char_front").setOrigin(0.5, 1);
        this.player.setDisplaySize(tileW * 0.6 * 2, tileH * 0.9 * 2);
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
        this.player.body.setOffset(0, 0);
        this.player.body.setMaxVelocity(250, 900);
        this.player.body.setDragX(900);

        this.physics.add.collider(this.player, this.solids);
        this.physics.add.collider(this.player, this.moveDGroup);

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
        this.fallObjSensors = makeSensorGroup();
        for (const o of fallareaObjects) {
          const x = Number(o.getAttribute("x") || 0);
          const y = Number(o.getAttribute("y") || 0);
          const w = Number(o.getAttribute("width") || tileW);
          const h = Number(o.getAttribute("height") || tileH);
          const s = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x0000ff, 0);
          this.physics.add.existing(s, true);
          this.fallObjSensors.add(s);
        }
        this.deathObjSensors = makeSensorGroup();
        for (const o of deathObjects) {
          const x = Number(o.getAttribute("x") || 0);
          const y = Number(o.getAttribute("y") || 0);
          const w = Number(o.getAttribute("width") || tileW);
          const h = Number(o.getAttribute("height") || tileH);
          const s = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0xff0000, 0);
          this.physics.add.existing(s, true);
          this.deathObjSensors.add(s);
        }

        this.activateMoveD = () => {
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
        };
        this.triggerTrapEvent = () => {
          if (this.trapEventTriggered) return;
          this.trapEventTriggered = true;
          this.activateMoveD();
          // Drop tile layer 3 downward to reveal trap area.
          const dropDy = tileH * 4;
          for (const img of this.layer3Imgs) {
            this.tweens.add({ targets: img, y: img.y + dropDy, duration: 650, ease: "Sine.easeIn" });
          }
        };
        this.resetMoveD = () => {
          this.moveDActivated = false;
          for (const img of this.trapSpikeImgs) img.setAlpha(0);
          for (const blk of this.moveDBodies) {
            if (blk?.rect?.body) {
              blk.rect.body.enable = true;
              blk.rect.body.setImmovable(!blk.initialMoveD);
              blk.rect.body.allowGravity = !!blk.initialMoveD;
              blk.rect.body.setVelocity(0, 0);
            }
            blk.rect.setPosition(blk.cx, blk.cy);
            if (blk.img) blk.img.setAlpha(1);
          }
        };
        this.handleDeath = () => {
          if (this.dead || this.finished) return;
          this.dead = true;
          this.player.body.setVelocity(0, 0);
          this.time.delayedCall(650, () => {
            this.dead = false;
            this.lastRespawnAt = this.time.now;
            this.resetMoveD();
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
          alert("胜利！");
        });
        this.physics.add.overlap(this.player, this.deathSensors, () => {
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.handleDeath();
        });
        this.physics.add.overlap(this.player, this.deathObjSensors, () => {
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.handleDeath();
        });
        this.physics.add.overlap(this.player, this.fallObjSensors, () => {
          if (this.finished) return;
          this.triggerTrapEvent();
        });

        this.controls = this.input.keyboard.createCursorKeys();
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      },
      update: function () {
        if (!this.player?.body) return;
        if (this.dead || this.finished) return;

        // Proximity trigger: only near trap spikes (death), not near generic moveD cover.
        if (!this.trapEventTriggered && this.trapSpikeImgs.length) {
          const px = this.player.x;
          const py = this.player.y;
          const th2 = (tileW * 1.4) * (tileW * 1.4);
          for (const img of this.trapSpikeImgs) {
            const sx = img.x + img.displayWidth * 0.5;
            const sy = img.y - img.displayHeight * 0.5;
            const dx = px - sx;
            const dy = py - sy;
            if (dx * dx + dy * dy <= th2) {
              this.triggerTrapEvent();
              break;
            }
          }
        }

        for (const blk of this.moveDBodies) {
          const img = blk.img;
          const rect = blk.rect;
          if (!img || !rect || !rect.body) continue;
          img.x = rect.x - tileW / 2;
          img.y = rect.y + tileH / 2;
          if (rect.y - tileH / 2 > worldH + tileH) {
            img.setAlpha(0);
            rect.body.enable = false;
            rect.body.setVelocity(0, 0);
          }
        }

        const speed = 220;
        const left = this.controls.left.isDown;
        const right = this.controls.right.isDown;
        if (left) this.player.setVelocityX(-speed);
        else if (right) this.player.setVelocityX(speed);
        else this.player.setVelocityX(0);
        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump = Phaser.Input.Keyboard.JustDown(this.controls.up) || Phaser.Input.Keyboard.JustDown(this.jumpKey);
        // Jump power x1.5
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) this.player.setVelocityY(-720);
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

