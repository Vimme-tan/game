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
      if (killDown && down) onDeath?.();
      // 其它方向如需也判死，可以后续扩展
      if (o.left && left) onDeath?.();
      if (o.right && right) onDeath?.();
      if (o.up && up) onDeath?.();
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
        // 先销毁旧 Phaser，再重新进入关卡，等价于“重新开始本关”
        if (typeof ctx.destroyPhaser === "function") ctx.destroyPhaser();
      } catch {}
      try {
        startLevelFn(ctx, levelId);
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

  window.PTLevelShared = {
    codeToPhaserKeyCode,
    resolveTilesetImageUrl,
    resolveTilesetImageUrlEx,
    fetchTsxText,
    parseTsx,
    parseTsxTyped,
    getDefaultPlayerTuning,
    installWorldBoundsDeath,
    disableBodiesBelowWorld,
    restartLevel,
    applyWorldGreyBackdrop,
  };
})();

