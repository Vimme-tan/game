// Shared helpers for single/race/team levels (non-module script).
// Exposes: window.PTLevelShared
(function () {
  const legacyNameMap = {
    "1.png": "blue.png",
    "2.png": "earthWall.png",
    "3.png": "earthWall2.png",
    "4.png": "doorRedStroked.png",
    "5.png": "trap.png",
  };

  function codeToPhaserKeyCode(code) {
    if (typeof code !== "string" || !code) return null;
    if (code === "ArrowLeft") return Phaser.Input.Keyboard.KeyCodes.LEFT;
    if (code === "ArrowRight") return Phaser.Input.Keyboard.KeyCodes.RIGHT;
    if (code === "ArrowUp") return Phaser.Input.Keyboard.KeyCodes.UP;
    if (code === "ArrowDown") return Phaser.Input.Keyboard.KeyCodes.DOWN;
    if (code === "Space") return Phaser.Input.Keyboard.KeyCodes.SPACE;
    if (code === "ShiftLeft" || code === "ShiftRight") return Phaser.Input.Keyboard.KeyCodes.SHIFT;
    if (code === "ControlLeft" || code === "ControlRight") return Phaser.Input.Keyboard.KeyCodes.CTRL;
    if (code === "AltLeft" || code === "AltRight") return Phaser.Input.Keyboard.KeyCodes.ALT;
    if (code.startsWith("Key") && code.length === 4) {
      const ch = code.slice(3);
      const kc = Phaser.Input.Keyboard.KeyCodes[ch.toUpperCase()];
      return typeof kc === "number" ? kc : null;
    }
    if (code.startsWith("Digit") && code.length === 6) {
      const d = code.slice(5);
      const map = { "0": "ZERO", "1": "ONE", "2": "TWO", "3": "THREE", "4": "FOUR", "5": "FIVE", "6": "SIX", "7": "SEVEN", "8": "EIGHT", "9": "NINE" };
      const name = map[d];
      const kc = name ? Phaser.Input.Keyboard.KeyCodes[name] : null;
      return typeof kc === "number" ? kc : null;
    }
    return null;
  }

  function resolveTilesetImageUrl(imageSource, baseUrl) {
    const candidates = [];
    if (typeof imageSource !== "string" || !imageSource) return null;
    const baseName = imageSource.split("/").pop();
    const mapped = baseName ? legacyNameMap[String(baseName).toLowerCase()] : null;

    // 尝试定位到 /assets/maps/ 根目录（最稳定的运行时资源位置）
    let mapsRoot = null;
    try {
      const u = new URL(baseUrl, window.location.href);
      const href = u.toString();
      const idx = href.toLowerCase().indexOf("/assets/maps/");
      if (idx >= 0) mapsRoot = href.slice(0, idx + "/assets/maps/".length);
    } catch {}
    const pushMapsRoot = (fileName) => {
      if (!mapsRoot || !fileName) return;
      // 你仓库实际贴图目录：assets/maps/map/
      // 重要：必须优先尝试这个路径，否则会命中错误的 assets/maps/maps/map 导致整张地图全灰
      candidates.push(`${mapsRoot}map/${fileName}`);
    };

    if (mapped) {
      // 先放“稳定绝对路径”，避免被相对路径误导到 maps/maps/map
      pushMapsRoot(mapped);
      candidates.push(`../../maps/map/${mapped}`);
      candidates.push(`../maps/map/${mapped}`);
      candidates.push(`maps/map/${mapped}`);
      candidates.push(`./maps/map/${mapped}`);
      candidates.push(`../../map/${mapped}`);
      candidates.push(`../map/${mapped}`);
      candidates.push(`map/${mapped}`);
      candidates.push(`./map/${mapped}`);
    }
    if (baseName) {
      pushMapsRoot(baseName);
      candidates.push(`../../maps/map/${baseName}`);
      candidates.push(`../maps/map/${baseName}`);
      candidates.push(`maps/map/${baseName}`);
      candidates.push(`./maps/map/${baseName}`);
      candidates.push(`../../map/${baseName}`);
      candidates.push(`../map/${baseName}`);
      candidates.push(`map/${baseName}`);
      candidates.push(`./map/${baseName}`);
    }
    const stickerIdx = imageSource.toLowerCase().lastIndexOf("sticker-knight/map/");
    if (stickerIdx >= 0) {
      const tail = imageSource.slice(stickerIdx + "sticker-knight/map/".length);
      pushMapsRoot(tail);
      candidates.push(`../../maps/map/${tail}`);
      candidates.push(`../maps/map/${tail}`);
      candidates.push(`maps/map/${tail}`);
      candidates.push(`../../map/${tail}`);
      candidates.push(`../map/${tail}`);
      candidates.push(`map/${tail}`);
    }
    candidates.push(imageSource);
    for (const c of candidates) {
      try {
        return new URL(c, baseUrl).toString();
      } catch {}
    }
    return null;
  }

  // resolveTilesetImageUrl 的增强版：允许关卡传入旧命名映射覆盖（例如 level7 把 1.png 映射成 grey.png）
  function resolveTilesetImageUrlEx(imageSource, baseUrl, legacyOverride) {
    try {
      const baseName = typeof imageSource === "string" ? imageSource.split("/").pop() : null;
      const override =
        legacyOverride && typeof legacyOverride === "object"
          ? legacyOverride[String(baseName || "").toLowerCase()] || legacyOverride[baseName] || null
          : null;
      if (override && typeof baseName === "string" && baseName.length) {
        // 优先使用覆盖映射（避免返回不存在的 /map/1.png）
        const candidates = [];
        // 先尝试稳定绝对路径：/assets/maps/map/<override>
        try {
          const u = new URL(baseUrl, window.location.href);
          const href = u.toString();
          const idx = href.toLowerCase().indexOf("/assets/maps/");
          if (idx >= 0) {
            const mapsRoot = href.slice(0, idx + "/assets/maps/".length);
            candidates.push(`${mapsRoot}map/${override}`);
          }
        } catch {}
        candidates.push(
          `../../maps/map/${override}`,
          `../maps/map/${override}`,
          `maps/map/${override}`,
          `./maps/map/${override}`,
          `../../map/${override}`,
          `../map/${override}`,
          `map/${override}`,
          `./map/${override}`
        );
        for (const c of candidates) {
          try {
            return new URL(c, baseUrl).toString();
          } catch {}
        }
      }
    } catch {}
    return resolveTilesetImageUrl(imageSource, baseUrl);
  }

  // 统一的 TSX 加载（兼容不同导出路径/同目录副本）
  async function fetchTsxText(tsxSource, baseUrl) {
    const tsxUrl = new URL(tsxSource, baseUrl).toString();
    const baseName = String(tsxSource || "").split("/").pop();
    const fallbackSameDir = baseName ? new URL(`./${baseName}`, baseUrl).toString() : null;
    const candidates = [tsxUrl, fallbackSameDir].filter(Boolean);

    // Team-up challenges: tilesets are centralized in teamupchallenges/common/
    // while json may sit either in teamupchallenges/ (double1.json, double2.json...)
    // or in teamupchallenges/levelX/. If map exports tsx as "111.tsx", we need to
    // fallback to ./common/111.tsx or ../common/111.tsx.
    try {
      const bu = String(new URL(baseUrl, window.location.href).toString()).toLowerCase();
      if (baseName && bu.includes("/assets/maps/teamupchallenges/")) {
        candidates.push(new URL(`./common/${baseName}`, baseUrl).toString());
        candidates.push(new URL(`../common/${baseName}`, baseUrl).toString());
        candidates.push(new URL(`../../common/${baseName}`, baseUrl).toString());
      }
    } catch {}

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

  // 统一的 JSON 加载（兼容 GitHub Pages 子路径/缓存/503 等情况）
  function resolveGameRoot() {
    // 优先用 game.js 的 script src 作为根（最稳定：不依赖当前页面 URL）
    try {
      const s = document.querySelector('script[src*="/game.js"],script[src$="/game.js"],script[src*="game.js?v="],script[src$="game.js"]');
      if (s && s.src) return new URL("./", s.src).toString(); // .../game/
    } catch {}
    // 兜底：用当前页面
    try {
      return new URL("./", window.location.href).toString();
    } catch {}
    return "./";
  }

  function resolveGameUrl(relOrAbs) {
    if (typeof relOrAbs !== "string" || !relOrAbs) return null;
    try {
      // 已经是绝对 URL
      const u = new URL(relOrAbs);
      return u.toString();
    } catch {}
    // 相对路径：相对于 game root（而不是 window.location.href）
    try {
      return new URL(relOrAbs, resolveGameRoot()).toString();
    } catch {}
    return null;
  }

  async function fetchJsonWithFallback(relOrUrl) {
    const url0 = resolveGameUrl(relOrUrl) || String(relOrUrl || "");
    const candidates = [];
    if (url0) candidates.push(url0);
    // 再试一次：加 cache-bust，避免 Pages/CDN 返回旧的错误响应
    if (url0) candidates.push(url0 + (url0.includes("?") ? "&" : "?") + "v=" + Date.now());

    let lastErr = null;
    for (const url of candidates) {
      try {
        // first try: same-origin
        let r = await fetch(url, { credentials: "same-origin" });
        if (!r.ok) {
          // second try: no credentials (some static hosts behave better)
          r = await fetch(url);
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error(`Failed to fetch json: ${relOrUrl}`);
  }

  // 统一的 TSX 解析：读取 tile 的 imageSource 和自定义 properties
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
        const value = String(p.getAttribute("value") || "");
        // 这里统一把 bool 属性转成 true/false，字符串属性保留原值
        if (type === "bool") props[propName] = value === "true" || value === "1";
        else props[propName] = value;
      }
      tiles[id] = { id, imageSource, props };
    }
    return { name, tiles };
  }

  // TSX 解析（增强版）：支持 int/float 的数值属性（level7 用）
  function parseTsxTyped(tsxText) {
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
        const valueRaw = p.getAttribute("value");
        let value = valueRaw;
        if (type === "bool") value = String(valueRaw || "").toLowerCase() === "true" || String(valueRaw) === "1";
        else if (type === "int" || type === "float") value = Number(valueRaw || "0");
        props[propName] = value;
      }
      tiles[id] = { id, imageSource, props };
    }
    return { name, tiles };
  }

  // 人物基础参数（单人关卡通用）
  // 说明：不同关卡如果需要“更快/更慢/更高跳”，可以在关卡内覆盖这些值
  function getDefaultPlayerTuning() {
    return {
      speed: 300, // 水平移动速度（保持与历史关卡手感一致）
      jumpV: -920, // 起跳速度（负值向上）
      gravityY: 900, // 重力
      maxVx: 500, // 最大水平速度（不要低于 speed，否则会出现“按住也跑不快/手感怪”的错觉）
      maxVy: 900, // 最大竖直速度
      dragX: 900, // 水平阻尼（松开后更快停下）
    };
  }

  // 玩家碰到世界边界时的处理（解决“落到底部边界不触发死亡”的问题）
  // 注意：Arcade Physics 在 setCollideWorldBounds(true) 时会把物体“顶住”边界，
  // 此时用坐标越界判断可能永远触发不到，所以需要监听 worldbounds 事件。
  function installWorldBoundsDeath(scene, player, onDeath, opts = {}) {
    const o = opts || {};
    if (!scene?.physics?.world || !player?.body) return;
    const killDown = o.down !== false; // 默认：触底也算死亡

    // 开启 worldbounds 事件
    scene.physics.world.on("worldbounds", (body, up, down, left, right) => {
      if (!body || body.gameObject !== player) return;
      if (killDown && down) {
        try {
          window.__PT_playFallDeathSfx?.();
        } catch {}
        onDeath?.();
      }
      // 其它方向如需也判死，可以后续扩展
      if (o.left && left) {
        try {
          window.__PT_playFallDeathSfx?.();
        } catch {}
        onDeath?.();
      }
      if (o.right && right) {
        try {
          window.__PT_playFallDeathSfx?.();
        } catch {}
        onDeath?.();
      }
      if (o.up && up) {
        try {
          window.__PT_playFallDeathSfx?.();
        } catch {}
        onDeath?.();
      }
    });

    player.body.onWorldBounds = true;
  }

  // 通用：把“掉出地图下边界”的动态物体禁用（减少每关重复代码）
  // objects: [{ obj: Phaser.GameObjects, ... }, ...] 或者直接传 GameObject 数组也可
  function disableBodiesBelowWorld(objects, worldH, tileH) {
    const arr = Array.isArray(objects) ? objects : [];
    for (const item of arr) {
      const obj = item?.obj ?? item;
      if (!obj?.body) continue;
      if (obj.y - tileH / 2 > worldH + tileH) {
        obj.body.enable = false;
        obj.body.setVelocity(0, 0);
        if (typeof obj.setVisible === "function") obj.setVisible(false);
      }
    }
  }

  // 通用：把“死亡 = 重开本关（事件全部重置）”做成一个可复用的动作。
  // startLevelFn: 例如 window.SinglePlayerLevels.startLevel6
  function restartLevel(ctx, levelId, startLevelFn, delayMs = 0) {
    if (!ctx || typeof startLevelFn !== "function") return;
    const run = () => {
      try {
        window.__PT_playDieSfx?.();
      } catch {}
      try {
        // 先销毁旧 Phaser，再重新进入关卡，等价于“重新开始本关”
        if (typeof ctx.destroyPhaser === "function") ctx.destroyPhaser();
      } catch {}
      try {
        // 关卡启动函数很多是 async；这里必须接住 Promise，否则失败会变成“未处理拒绝”，导致整页状态异常
        Promise.resolve(startLevelFn(ctx, levelId)).catch((e) => {
          console.error("[restartLevel failed]", e);
        });
      } catch (e) {
        console.error("[restartLevel failed]", e);
      }
    };
    if (delayMs > 0 && ctx?.state?.levelScene?.time?.delayedCall) {
      ctx.state.levelScene.time.delayedCall(delayMs, run);
    } else {
      run();
    }
  }

  // 单人关卡背景统一：
  // - 画布未显示关卡内容的区域：保持主页面背景（透明）
  // - 显示关卡内容的区域（世界范围）：灰色底
  function applyWorldGreyBackdrop(scene, worldW, worldH) {
    try {
      if (!scene?.cameras?.main) return;
      // 相机背景透明，让“世界外区域”露出主页面背景
      scene.cameras.main.setBackgroundColor("rgba(0,0,0,0)");
      // 在世界范围内铺一块灰色底（放到最底层）
      const bg = scene.add.rectangle(worldW / 2, worldH / 2, worldW, worldH, 0x808080, 1);
      bg.setDepth(-10000);
      bg.setScrollFactor?.(1);
    } catch {}
  }

  // 通用：把“人物站在移动物体上”做成可复用逻辑
  // 注意：不区分 move/lmove/rmove，调用方只要把“会移动的固体/平台对象组”传进来即可
  function carryPlayersOnMovingObjects(scene, players, groups) {
    if (!scene?.physics || !Array.isArray(players) || !players.length) return;
    const carryIfOn = (p, plat, dx, dy) => {
      if (!dx && !dy) return;
      if (!p?.body || !plat?.getBounds) return;
      const pb = p.getBounds();
      const b = plat.getBounds();
      // 判断玩家脚底是否落在平台顶部附近，且水平投影重叠
      const footY = pb.bottom;
      if (footY < b.top - 6 || footY > b.top + 18) return;
      if (pb.right < b.left + 2 || pb.left > b.right - 2) return;

      p.x += dx;
      p.y += dy;
      p.body.x += dx;
      p.body.y += dy;
    };

    const allGroups = Array.isArray(groups) ? groups : [];
    for (const grp of allGroups) {
      if (!grp?.getChildren) continue;
      for (const o of grp.getChildren()) {
        if (!o) continue;
        const lastX = typeof o._lastX === "number" ? o._lastX : o.x;
        const lastY = typeof o._lastY === "number" ? o._lastY : o.y;
        const dx = o.x - lastX;
        const dy = o.y - lastY;
        o._lastX = o.x;
        o._lastY = o.y;
        if (!dx && !dy) continue;

        for (const p of players) carryIfOn(p, o, dx, dy);
      }
    }
  }

  function getObjectSensorMetrics(obj) {
    const b = obj?.getBounds?.();
    if (!b) return null;

    let width = Number(b.width || 0);
    let height = Number(b.height || 0);
    const displayW = Number(obj?.displayWidth || obj?.width || width || 0);
    const displayH = Number(obj?.displayHeight || obj?.height || height || 0);
    const angleDeg =
      typeof obj?.angle === "number"
        ? obj.angle
        : typeof obj?.rotation === "number"
          ? (obj.rotation * 180) / Math.PI
          : 0;
    const quarterTurn = ((Math.round(angleDeg / 90) % 4) + 4) % 4;

    // Arcade Physics 不支持真正的旋转矩形，这里对 90/270 度旋转做宽高互换，
    // 让“旋转刺”的判定框至少在尺寸上与视觉方向一致。
    if ((quarterTurn === 1 || quarterTurn === 3) && displayW > 0 && displayH > 0) {
      width = displayH;
      height = displayW;
    }

    return {
      centerX: Number(b.centerX || obj?.x || 0),
      centerY: Number(b.centerY || obj?.y || 0),
      width,
      height,
    };
  }

  // 通用：判定区域（sensor）绑定到某个可移动物体
  function attachRectSensorToObject(scene, obj, opts = {}) {
    if (!scene || !obj) return null;
    const enabled = opts.enabled !== false; // 默认启用
    const color = typeof opts.color === "number" ? opts.color : 0xff0000;

    const m = getObjectSensorMetrics(obj);
    if (!m) return null;
    const s = scene.add.rectangle(m.centerX, m.centerY, m.width, m.height, color, 0);
    scene.physics.add.existing(s, true);
    if (s.body) {
      s.body.enable = !!enabled;
      if (s.body.setSize) s.body.setSize(m.width, m.height, true);
      if (s.body.updateFromGameObject) s.body.updateFromGameObject();
    }
    obj._sensor = s;
    return s;
  }

  function syncRectSensorToObject(obj) {
    const s = obj?._sensor;
    if (!obj || !s?.body) return;
    const m = getObjectSensorMetrics(obj);
    if (!m) return;
    s.x = m.centerX;
    s.y = m.centerY;
    // Arcade Physics 的矩形判定通常需要显式 setSize（避免 hitbox 没同步）
    if (s.body.setSize) s.body.setSize(m.width, m.height, true);
    // sensor 旋转：至少保持与对象旋转一致（更符合“旋转/移动同时判定区域同步”）
    if (typeof obj.rotation === "number") s.rotation = obj.rotation;
    if (s.body.updateFromGameObject) s.body.updateFromGameObject();
  }

  // 通用：对象 tween 时同步 body / sensor，适合移动刺、旋转刺、移动门、移动墙
  function tweenObjectsWithBodyAndSensorSync(scene, targets, config = {}) {
    if (!scene?.tweens) return null;
    const list = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
    if (!list.length) return null;

    const userOnUpdate = typeof config.onUpdate === "function" ? config.onUpdate : null;
    const userOnComplete = typeof config.onComplete === "function" ? config.onComplete : null;
    const tweenConfig = { ...config, targets: list };
    delete tweenConfig.onUpdate;
    delete tweenConfig.onComplete;

    return scene.tweens.add({
      ...tweenConfig,
      onUpdate: (tween, target, key, current, previous) => {
        target?.body?.updateFromGameObject?.();
        syncRectSensorToObject(target);
        userOnUpdate?.(tween, target, key, current, previous);
      },
      onComplete: (tween, tweenTargets) => {
        for (const target of list) {
          target?.body?.updateFromGameObject?.();
          syncRectSensorToObject(target);
        }
        userOnComplete?.(tween, tweenTargets);
      },
    });
  }

  // 通用：death spikes 与“solid 墙体”重叠时，临时隐藏/禁用判定
  // 依赖关卡脚本维护：
  //  - spike._deathBaseEnable：基础启用态（例如 lmove spikes 在触发前为 false）
  //  - spike._deathBaseVisible：基础可见态
  function updateDeathSpikesHideOnSolidOverlap(scene, spikeGroups, solidGroups) {
    const allSpikeGroups = Array.isArray(spikeGroups) ? spikeGroups : [];
    const allSolidGroups = Array.isArray(solidGroups) ? solidGroups : [];
    if (!scene?.physics) return;

    const rectsOverlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    for (const sg of allSpikeGroups) {
      if (!sg?.getChildren) continue;
      for (const spike of sg.getChildren()) {
        if (!spike?._sensor?.getBounds) continue;

        const baseEnable = typeof spike._deathBaseEnable === "boolean" ? spike._deathBaseEnable : true;
        const baseVisible = typeof spike._deathBaseVisible === "boolean" ? spike._deathBaseVisible : !!spike.visible;

        // 基础态就不显示/不致死：直接保持
        if (!baseEnable && !baseVisible) {
          if (spike._sensor.body) spike._sensor.body.enable = false;
          if (spike.setVisible) spike.setVisible(false);
          continue;
        }

        const sb = spike._sensor.getBounds();
        let overlapping = false;
        for (const solidGrp of allSolidGroups) {
          if (!solidGrp?.getChildren) continue;
          for (const solidObj of solidGrp.getChildren()) {
            if (!solidObj?.getBounds) continue;
            const bb = solidObj.getBounds();
            if (rectsOverlap(sb, bb)) {
              overlapping = true;
              break;
            }
          }
          if (overlapping) break;
        }

        const enable = baseEnable && !overlapping;
        const visible = baseVisible && !overlapping;
        if (spike._sensor.body) spike._sensor.body.enable = !!enable;
        if (spike.setVisible) spike.setVisible(!!visible);
      }
    }
  }

  window.PTLevelShared = {
    makeCharacterSpritesTransparent(scene) {
      try {
        window.__PT_makeSpriteBgTransparent?.(scene, [
          "char_front",
          "char_left",
          "char_left2",
          "char_left3",
          "char_left4",
          "char_right",
          "char_right2",
          "char_right3",
          "char_right4",
        ]);
      } catch {}
    },
    // Unified player sizing/collider so feet stand on solids.
    // scale ~ 2/3 of previous "2x" character size.
    applyPlayerSizing(player, tileW, tileH, scale = 0.67) {
      if (!player) return;
      try {
        player.setOrigin?.(0.5, 1);
        const s = Number.isFinite(scale) && scale > 0 ? scale : 0.67;
        const dispW = tileW * 0.6 * 2 * s;
        const dispH = tileH * 0.9 * 2 * s;
        player.setDisplaySize?.(dispW, dispH);
        // Use a slightly smaller body than sprite to avoid wall embedding
        // when new character frames have thicker visual outlines.
        const bodyW = Math.max(8, Math.round(dispW * 0.72));
        const bodyH = Math.max(8, Math.round(dispH * 0.78));
        if (player.body?.setSize) player.body.setSize(bodyW, bodyH, false);
        if (player.body?.setOffset) {
          const ox = Math.max(0, Math.round((dispW - bodyW) / 2));
          // Lift collision body a bit to avoid embedding into wall tiles.
          const oy = Math.max(0, Math.round((dispH - bodyH) * 0.55));
          player.body.setOffset(ox, oy);
        }
      } catch {}
    },
    playDieSfx() {
      try {
        window.__PT_playDieSfx?.();
      } catch {}
    },
    playFallDeathSfx() {
      try {
        window.__PT_playFallDeathSfx?.();
      } catch {}
    },
    // Character sprite helpers (multi-frame walk)
    loadCharacterSprites(scene, assets) {
      if (!scene?.load || !assets) return;
      const abs = (p) => new URL(p, window.location.href).toString();
      scene.load.image("char_front", abs(assets.characterFront));
      scene.load.image("char_left", abs(assets.characterLeft));
      scene.load.image("char_right", abs(assets.characterRight));
      // extra walk frames (optional)
      if (assets.characterLeft2) scene.load.image("char_left2", abs(assets.characterLeft2));
      if (assets.characterLeft3) scene.load.image("char_left3", abs(assets.characterLeft3));
      if (assets.characterLeft4) scene.load.image("char_left4", abs(assets.characterLeft4));
      if (assets.characterRight2) scene.load.image("char_right2", abs(assets.characterRight2));
      if (assets.characterRight3) scene.load.image("char_right3", abs(assets.characterRight3));
      if (assets.characterRight4) scene.load.image("char_right4", abs(assets.characterRight4));
    },
    setCharacterPose(player, dir, nowMs) {
      if (!player || typeof player.setTexture !== "function") return;
      const d = dir === "left" ? "left" : dir === "right" ? "right" : "front";
      if (d === "front") {
        player.setTexture("char_front");
        return;
      }
      const t = Number.isFinite(nowMs) ? nowMs : Date.now();
      const frame = Math.floor(t / 120) % 4; // 0..3
      const key = d === "left" ? (frame === 0 ? "char_left" : `char_left${frame + 1}`) : frame === 0 ? "char_right" : `char_right${frame + 1}`;
      // Fallback to base key if extra frame not loaded.
      try {
        const tex = player.scene?.textures?.get?.(key);
        if (tex && tex.key !== "__MISSING") player.setTexture(key);
        else player.setTexture(d === "left" ? "char_left" : "char_right");
      } catch {
        player.setTexture(d === "left" ? "char_left" : "char_right");
      }
    },
    codeToPhaserKeyCode,
    resolveTilesetImageUrl,
    resolveTilesetImageUrlEx,
    fetchTsxText,
    fetchJsonWithFallback,
    resolveGameUrl,
    parseTsx,
    parseTsxTyped,
    getDefaultPlayerTuning,
    installWorldBoundsDeath,
    disableBodiesBelowWorld,
    restartLevel,
    applyWorldGreyBackdrop,
    carryPlayersOnMovingObjects,
    attachRectSensorToObject,
    syncRectSensorToObject,
    tweenObjectsWithBodyAndSensorSync,
    updateDeathSpikesHideOnSolidOverlap,
  };
})();

