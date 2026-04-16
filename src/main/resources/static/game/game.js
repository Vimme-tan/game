(() => {
  // GitHub Pages 默认 Jekyll 会忽略以下划线开头的静态文件（例如 levels/_shared.js），
  // 导致 PTLevelShared 不存在，从而所有关卡加载失败。
  // 这里做兜底：若未加载到 PTLevelShared，则动态加载 levels/shared.js。
  try {
    if (!window.PTLevelShared) {
      const s = document.createElement("script");
      s.src = "./levels/shared.js?v=20260413b";
      s.async = false;
      document.head.appendChild(s);
    }
  } catch {}

  const $ = (id) => document.getElementById(id);
  const ui = {
    landing: $("landing"),
    app: $("app"),
    tabLogin: $("tabLogin"),
    tabRegister: $("tabRegister"),
    loginForm: $("loginForm"),
    registerForm: $("registerForm"),
    authError: $("authError"),
    btnLogin: $("btnLogin"),
    btnRegister: $("btnRegister"),
    loginUsername: $("loginUsername"),
    loginPassword: $("loginPassword"),
    regUsername: $("regUsername"),
    regPassword: $("regPassword"),

    meText: $("meText"),
    navSingle: $("navSingle"),
    navCoop: $("navCoop"),
    navRace: $("navRace"),
    navSettings: $("navSettings"),
    navLogout: $("navLogout"),
    panelMenu: $("panelMenu"),
    panelLevels: $("panelLevels"),
    panelSettings: $("panelSettings"),
    btnBackFromLevels: $("btnBackFromLevels"),
    btnBackFromSettings: $("btnBackFromSettings"),
    levelsTitle: $("levelsTitle"),
    levelsGrid: $("levelsGrid"),

    volumeSlider: $("volumeSlider"),
    volumeValue: $("volumeValue"),

    gameHost: $("gameHost"),
    phaserMount: $("phaserMount"),
    mobileControls: $("mobileControls"),
    mcLeft: $("mcLeft"),
    mcRight: $("mcRight"),
    mcJump: $("mcJump"),
    btnPauseLevel: $("btnPauseLevel"),
    btnExitLevel: $("btnExitLevel"),

    winDialogBackdrop: $("winDialogBackdrop"),
    winDialogTitle: $("winDialogTitle"),
    winDialogMsg: $("winDialogMsg"),
    btnWinNext: $("btnWinNext"),
    btnWinExit: $("btnWinExit"),

    pauseBackdrop: $("pauseBackdrop"),
    btnResumeLevel: $("btnResumeLevel"),

    kbP1Left: $("kbP1Left"),
    kbP1Right: $("kbP1Right"),
    kbP1Jump: $("kbP1Jump"),
    kbP2Left: $("kbP2Left"),
    kbP2Right: $("kbP2Right"),
    kbP2Jump: $("kbP2Jump"),
    btnBindP1Left: $("btnBindP1Left"),
    btnBindP1Right: $("btnBindP1Right"),
    btnBindP1Jump: $("btnBindP1Jump"),
    btnBindP2Left: $("btnBindP2Left"),
    btnBindP2Right: $("btnBindP2Right"),
    btnBindP2Jump: $("btnBindP2Jump"),
    btnResetKeybinds: $("btnResetKeybinds"),
    controlModeSelect: $("controlModeSelect"),
  };

  const api = {
    async json(url, options = {}) {
      // When hosting on GitHub/Gitee Pages there is usually no backend (/api/*),
      // so we provide minimal mock data to keep the front-end playable.
      const getMock = () => {
        const u = String(url || "").toLowerCase();
        if (u === "/api/auth/me") {
          return {
            username: "Guest",
            maxUnlockedLevel: 1,
            volume: 70,
          };
        }
        if (u === "/api/settings/volume") return null;
        if (u === "/api/progress/complete") return null;
        if (u === "/api/progress/levels") return { unlocked: [1, 2, 3, 4, 5] };
        if (u === "/api/auth/logout") return null;
        if (u === "/api/auth/login") return { ok: true };
        if (u === "/api/auth/register") return { ok: true };
        if (u.startsWith("/api/levels/")) {
          const id = Number(u.split("/").pop() || 1) || 1;
          return { levelId: id, width: 30, height: 18, spawnX: 2, spawnY: 2, goalX: 26, goalY: 14 };
        }
        if (u.startsWith("/api/debug/log")) return null;
        // For levelConfig and other endpoints, you can extend mock later.
        return undefined;
      };

      try {
        const r = await fetch(url, {
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", ...(options.headers || {}) },
          ...options,
        });
        if (!r.ok) {
          const mock = getMock();
          if (mock !== undefined) return mock;
          const text = await r.text().catch(() => "");
          throw new Error(text || `HTTP ${r.status}`);
        }
        if (r.status === 204) return null;
        return r.json();
      } catch (e) {
        const mock = getMock();
        if (mock !== undefined) return mock;
        throw e;
      }
    },
    me() {
      return this.json("/api/auth/me", { method: "GET" });
    },
    login(username, password) {
      return this.json("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
    },
    register(username, password) {
      return this.json("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password }) });
    },
    logout() {
      return this.json("/api/auth/logout", { method: "POST" });
    },
    levels() {
      return this.json("/api/progress/levels", { method: "GET" });
    },
    levelConfig(levelId) {
      return this.json(`/api/levels/${levelId}`, { method: "GET" });
    },
    complete(levelId, score) {
      return this.json("/api/progress/complete", {
        method: "POST",
        body: JSON.stringify({ levelId, score }),
      });
    },
    saveVolume(volume) {
      return this.json("/api/settings/volume", {
        method: "POST",
        body: JSON.stringify({ volume }),
      });
    },
  };

  const assets = {
    menuBgm: "./assets/audio/bgm/menu_bgm.mp3",
    clickSfx: "./assets/audio/sfx/btn_click.wav",
    level1Json: "./assets/maps/singleplayer/level1/one.json",
    level2Json: "./assets/maps/singleplayer/level2/level2.json",
    level3Json: "./assets/maps/singleplayer/level3/three.json",
    level4Json: "./assets/maps/singleplayer/level4/level4.json",
    level5Json: "./assets/maps/singleplayer/level5/sinfive.json",
    level6Json: "./assets/maps/singleplayer/level6/sinsix.json",
    level7Json: "./assets/maps/singleplayer/level7/seven.json",
    level8Json: "./assets/maps/singleplayer/level8/eight.json",
    raceLevel1Json: "./assets/maps/doubleplayer/level1/doubone.json",
    raceLevel2Json: "./assets/maps/doubleplayer/level2/doutwo.json",
    raceLevel3Json: "./assets/maps/doubleplayer/level3/douthree.json",
    raceLevel4Json: "./assets/maps/doubleplayer/level4/doufour.json",
    raceLevel5Json: "./assets/maps/doubleplayer/level5/doufive.json",
    // Team-up challenges: json files are under teamupchallenges/ (tilesets in teamupchallenges/common/)
    teamLevel1Json: "./assets/maps/teamupchallenges/double1.json",
    teamLevel2Json: "./assets/maps/teamupchallenges/double2.json",
    teamLevel3Json: "./assets/maps/teamupchallenges/double3.json",
    teamLevel4Json: "./assets/maps/teamupchallenges/double4.json",
    characterFront: "./assets/character/front.png",
    characterLeft: "./assets/character/left.png",
    characterRight: "./assets/character/right.png",
  };

  const state = {
    me: null,
    volume: 70,
    phaser: null,
    currentLevelId: null,
    mode: "single",
    volumeSaveTimer: null,
    menuBgmAudio: null,
    clickAudio: null,
    hasBgmAudio: false,
    hasClickAudio: false,
    audioUnlocked: false,
    _winOnNext: null,
    _winOnExit: null,
    keybinds: null,
    controlMode: "desktop",
    touch: { left: false, right: false, jumpPressed: false, jumpHeld: false },
  };

  const KEYBINDS_STORAGE_KEY = "pt_keybinds_v1";
  const CONTROL_MODE_STORAGE_KEY = "pt_control_mode_v1";
  const DEFAULT_KEYBINDS = {
    p1: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp" },
    p2: { left: "KeyA", right: "KeyD", jump: "KeyW" },
  };
  function cloneKeybinds(src) {
    return {
      p1: {
        left: String(src?.p1?.left || DEFAULT_KEYBINDS.p1.left),
        right: String(src?.p1?.right || DEFAULT_KEYBINDS.p1.right),
        jump: String(src?.p1?.jump || DEFAULT_KEYBINDS.p1.jump),
      },
      p2: {
        left: String(src?.p2?.left || DEFAULT_KEYBINDS.p2.left),
        right: String(src?.p2?.right || DEFAULT_KEYBINDS.p2.right),
        jump: String(src?.p2?.jump || DEFAULT_KEYBINDS.p2.jump),
      },
    };
  }

  function loadKeybinds() {
    try {
      const raw = localStorage.getItem(KEYBINDS_STORAGE_KEY);
      if (!raw) return cloneKeybinds(DEFAULT_KEYBINDS);
      const obj = JSON.parse(raw);
      const pick = (v, fallback) => (typeof v === "string" && v.length ? v : fallback);
      return {
        p1: {
          left: pick(obj?.p1?.left, DEFAULT_KEYBINDS.p1.left),
          right: pick(obj?.p1?.right, DEFAULT_KEYBINDS.p1.right),
          jump: pick(obj?.p1?.jump, DEFAULT_KEYBINDS.p1.jump),
        },
        p2: {
          left: pick(obj?.p2?.left, DEFAULT_KEYBINDS.p2.left),
          right: pick(obj?.p2?.right, DEFAULT_KEYBINDS.p2.right),
          jump: pick(obj?.p2?.jump, DEFAULT_KEYBINDS.p2.jump),
        },
      };
    } catch {
      return cloneKeybinds(DEFAULT_KEYBINDS);
    }
  }

  function saveKeybinds(keybinds) {
    try {
      localStorage.setItem(KEYBINDS_STORAGE_KEY, JSON.stringify(keybinds));
    } catch {}
  }

  function loadControlMode() {
    try {
      const v = String(localStorage.getItem(CONTROL_MODE_STORAGE_KEY) || "desktop").toLowerCase();
      return v === "mobile" ? "mobile" : "desktop";
    } catch {
      return "desktop";
    }
  }

  function saveControlMode(mode) {
    try {
      localStorage.setItem(CONTROL_MODE_STORAGE_KEY, mode === "mobile" ? "mobile" : "desktop");
    } catch {}
  }

  function syncControlModeUI() {
    if (ui.controlModeSelect) ui.controlModeSelect.value = state.controlMode === "mobile" ? "mobile" : "desktop";
  }

  function resetTouchState() {
    state.touch.left = false;
    state.touch.right = false;
    state.touch.jumpHeld = false;
    state.touch.jumpPressed = false;
  }

  function setupMobileButtons() {
    if (!ui.mcLeft || !ui.mcRight || !ui.mcJump) return;
    const bindHold = (el, down, up) => {
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        down();
      });
      el.addEventListener("pointerup", (e) => {
        e.preventDefault();
        up();
      });
      el.addEventListener("pointercancel", up);
      el.addEventListener("pointerleave", up);
    };
    bindHold(
      ui.mcLeft,
      () => {
        state.touch.left = true;
      },
      () => {
        state.touch.left = false;
      }
    );
    bindHold(
      ui.mcRight,
      () => {
        state.touch.right = true;
      },
      () => {
        state.touch.right = false;
      }
    );
    bindHold(
      ui.mcJump,
      () => {
        if (!state.touch.jumpHeld) state.touch.jumpPressed = true;
        state.touch.jumpHeld = true;
      },
      () => {
        state.touch.jumpHeld = false;
      }
    );
  }

  function syncKeybindsUI() {
    if (!state.keybinds) state.keybinds = loadKeybinds();
    if (ui.kbP1Left) ui.kbP1Left.value = state.keybinds.p1.left;
    if (ui.kbP1Right) ui.kbP1Right.value = state.keybinds.p1.right;
    if (ui.kbP1Jump) ui.kbP1Jump.value = state.keybinds.p1.jump;
    if (ui.kbP2Left) ui.kbP2Left.value = state.keybinds.p2.left;
    if (ui.kbP2Right) ui.kbP2Right.value = state.keybinds.p2.right;
    if (ui.kbP2Jump) ui.kbP2Jump.value = state.keybinds.p2.jump;
  }

  function beginBindKey(label, apply) {
    const tips = `按下要绑定的键：${label}\n（按 ESC 取消）`;
    alert(tips);
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener("keydown", onKey, true);
      if (e.code === "Escape") return;
      if (typeof apply === "function") apply(e.code);
      syncKeybindsUI();
      saveKeybinds(state.keybinds);
    };
    document.addEventListener("keydown", onKey, true);
  }

  function debugLog(runId, hypothesisId, location, message, data) {
    // #region agent log
    // 1) Try local debug ingest (may be unavailable to browser).
    fetch("http://127.0.0.1:7653/ingest/610664d2-1787-4460-9926-1f3c1ea1773e",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"377d1b"},body:JSON.stringify({sessionId:"377d1b",runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
    // 2) Always send to same-origin backend logger for runtime evidence.
    fetch("/api/debug/log",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({runId,hypothesisId,location,message,data})}).catch(()=>{});
    // #endregion
  }

  function showAuthError(msg) {
    ui.authError.style.display = "block";
    ui.authError.textContent = msg;
  }
  function clearAuthError() {
    ui.authError.style.display = "none";
    ui.authError.textContent = "";
  }

  function showLanding() {
    ui.app.style.display = "none";
    ui.landing.style.display = "flex";
  }

  function showApp() {
    ui.landing.style.display = "none";
    ui.app.style.display = "block";
    ensureBgmPlayback();
  }

  function showPanel(which) {
    ui.panelMenu.style.display = which === "menu" ? "flex" : "none";
    ui.panelLevels.style.display = which === "levels" ? "block" : "none";
    ui.panelSettings.style.display = which === "settings" ? "block" : "none";
    if (which !== "levels") {
      ui.gameHost.style.display = "none";
      ui.levelsGrid.style.display = "";
      ui.levelsTitle.style.display = "";
      destroyPhaser();
    }
    debugLog("run_ui_layout", "H5_panel_visibility", "game.js:showPanel", "panel_switched", {
      panel: which,
      mode: state.mode,
    });
  }

  function setLevelPlayLayout(isPlaying) {
    // When playing a level: hide level grid/title and center the game view.
    ui.levelsGrid.style.display = isPlaying ? "none" : "";
    ui.levelsTitle.style.display = isPlaying ? "none" : "";
    ui.gameHost.style.display = isPlaying ? "block" : "none";
    ui.panelLevels.classList.toggle("isPlaying", !!isPlaying);
    const toolbar = ui.btnPauseLevel?.parentElement;
    if (toolbar) toolbar.style.display = isPlaying ? "flex" : "none";
    // Keep mobile controls visible during level play only.
    const showMobile = Boolean(isPlaying) && state.controlMode === "mobile";
    if (ui.mobileControls) ui.mobileControls.classList.toggle("active", showMobile);
    if (!showMobile) resetTouchState();
  }

  window.__PT_getGameViewport = function __PT_getGameViewport() {
    const mount = ui.phaserMount;
    // 关卡游玩视口：限制最大尺寸，保证画面“居中且不占满”
    const w = Math.min(1100, Math.max(720, Math.floor(mount?.clientWidth || window.innerWidth * 0.92)));
    const h = Math.min(820, Math.max(500, Math.floor(Math.min(window.innerHeight * 0.72, 820))));
    return { width: w, height: h };
  };
  window.__PT_isMobileControl = function __PT_isMobileControl() {
    return state.controlMode === "mobile";
  };
  window.__PT_touchDown = function __PT_touchDown(name) {
    return !!state.touch?.[name];
  };
  window.__PT_consumeTouchJump = function __PT_consumeTouchJump() {
    const v = !!state.touch.jumpPressed;
    state.touch.jumpPressed = false;
    return v;
  };
  window.__PT_getKeybinds = function __PT_getKeybinds() {
    if (!state.keybinds) state.keybinds = loadKeybinds();
    return state.keybinds;
  };

  async function refreshMe() {
    state.me = await api.me();
    ui.meText.textContent = `当前用户：${state.me.username}（已解锁到：${state.me.maxUnlockedLevel ?? 1}）`;
  }

  function renderLevelsForMode() {
    ui.levelsGrid.innerHTML = "";
    const totalLevels = 9;
    const firstPlayable = 1;
    for (let i = 1; i <= totalLevels; i++) {
      const btn = document.createElement("button");
      const unlocked =
        (state.mode === "single" && (i === 1 || i === 2 || i === 3 || i === 4 || i === 5 || i === 6 || i === 7 || i === 8)) ||
        (state.mode === "race" && (i === 1 || i === 2 || i === 3 || i === 4 || i === 5)) ||
        (state.mode === "coop" && (i === 1 || i === 2 || i === 3 || i === 4)) ||
        (state.mode !== "single" && state.mode !== "race" && state.mode !== "coop" && i === 1);
      btn.className = "levelCell" + (unlocked ? "" : " locked");
      btn.type = "button";
      btn.textContent = `第 ${i} 关`;
      if (!unlocked) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", async () => {
          playClickSfx();
          debugLog("run_ui_layout", "H5_panel_visibility", "game.js:renderLevelsForMode", "level_clicked", {
            mode: state.mode,
            levelId: i,
          });
          await startGame(i);
        });
      }
      ui.levelsGrid.appendChild(btn);
    }
  }

  function destroyPhaser() {
    if (state.phaser) {
      state.phaser.destroy(true);
      state.phaser = null;
    }
    ui.phaserMount.innerHTML = "";
    state.levelScene = null;
    state.levelPaused = false;
    syncPauseUi(false);
    resetTouchState();
    if (ui.mobileControls) ui.mobileControls.classList.remove("active");
  }

  function hideWinDialog() {
    if (ui.winDialogBackdrop) ui.winDialogBackdrop.style.display = "none";
    state._winOnNext = null;
    state._winOnExit = null;
  }

  function showWinDialog({ title, message, nextText, exitText, onNext, onExit }) {
    if (!ui.winDialogBackdrop) return;
    if (ui.winDialogTitle) ui.winDialogTitle.textContent = title || "通关";
    if (ui.winDialogMsg) ui.winDialogMsg.textContent = message || "";
    if (ui.btnWinNext) ui.btnWinNext.textContent = nextText || "下一关";
    if (ui.btnWinExit) ui.btnWinExit.textContent = exitText || "退出";
    state._winOnNext = typeof onNext === "function" ? onNext : null;
    state._winOnExit = typeof onExit === "function" ? onExit : null;
    ui.winDialogBackdrop.style.display = "flex";
  }

  function getActiveLevelScene() {
    return state.levelScene || null;
  }

  function syncPauseUi(isPaused) {
    if (ui.btnPauseLevel) {
      ui.btnPauseLevel.textContent = isPaused ? "▶" : "||";
      ui.btnPauseLevel.title = isPaused ? "继续" : "暂停";
      ui.btnPauseLevel.setAttribute("aria-label", ui.btnPauseLevel.title);
    }
    if (ui.pauseBackdrop) ui.pauseBackdrop.style.display = isPaused ? "flex" : "none";
  }

  function togglePauseLevel() {
    const scene = getActiveLevelScene();
    if (!scene) return;
    scene.isPaused = !scene.isPaused;
    state.levelPaused = scene.isPaused;
    if (scene.physics && scene.physics.pause) {
      if (scene.isPaused) scene.physics.pause();
      else scene.physics.resume();
    }
    syncPauseUi(scene.isPaused);
  }

  function exitLevelWithConfirm() {
    if (!state.phaser) return;
    const ok = confirm("确定退出当前关卡吗？退出后不会保存进度。");
    if (!ok) return;
    hideWinDialog();
    destroyPhaser();
    setLevelPlayLayout(false);
    showPanel("menu");
  }

  function applyVolumeToMedia() {
    const volume01 = Math.max(0, Math.min(1, state.volume / 100));
    if (state.menuBgmAudio) state.menuBgmAudio.volume = volume01;
    if (state.clickAudio) state.clickAudio.volume = volume01;
  }

  function saveVolumeDebounced() {
    if (state.volumeSaveTimer) {
      clearTimeout(state.volumeSaveTimer);
    }
    state.volumeSaveTimer = setTimeout(async () => {
      try {
        await api.saveVolume(state.volume);
      } catch (e) {
        console.warn("save volume failed:", e?.message || e);
      }
    }, 350);
  }

  function ensureBgmPlayback() {
    if (!state.hasBgmAudio || !state.menuBgmAudio) return;
    if (!state.audioUnlocked) return;
    if (!state.menuBgmAudio.paused) return;
    state.menuBgmAudio.play().catch(() => {});
  }

  function initMedia() {
    // BGM.
    state.menuBgmAudio = new Audio(assets.menuBgm);
    state.menuBgmAudio.loop = true;
    state.menuBgmAudio.preload = "auto";
    state.menuBgmAudio.addEventListener("canplaythrough", () => {
      state.hasBgmAudio = true;
      ensureBgmPlayback();
      debugLog("run_ui_layout", "H3_audio_ready", "game.js:initMedia", "bgm_ready", { src: assets.menuBgm });
    });
    state.menuBgmAudio.addEventListener("error", () => {
      state.hasBgmAudio = false;
      debugLog("run_ui_layout", "H3_audio_ready", "game.js:initMedia", "bgm_error", { src: assets.menuBgm });
    });

    // Click SFX.
    state.clickAudio = new Audio(assets.clickSfx);
    state.clickAudio.preload = "auto";
    state.clickAudio.addEventListener("canplaythrough", () => {
      state.hasClickAudio = true;
      debugLog("run_ui_layout", "H3_audio_ready", "game.js:initMedia", "click_ready", { src: assets.clickSfx });
    });
    state.clickAudio.addEventListener("error", () => {
      state.hasClickAudio = false;
      debugLog("run_ui_layout", "H3_audio_ready", "game.js:initMedia", "click_error", { src: assets.clickSfx });
    });

    applyVolumeToMedia();
  }

  function unlockAudio() {
    if (state.audioUnlocked) return;
    state.audioUnlocked = true;
    ensureBgmPlayback();
    document.removeEventListener("pointerdown", unlockAudio);
    document.removeEventListener("keydown", unlockAudio);
  }

  function playClickSfx() {
    if (!state.hasClickAudio || !state.clickAudio) return;
    try {
      state.clickAudio.currentTime = 0;
      state.clickAudio.play().catch(() => {});
    } catch {
      // Keep silent when browser blocks autoplay or resource not ready.
    }
  }

  // Remove black background from character PNGs (simple chroma-key).
  // Keeps stickman while making surrounding black transparent.
  window.__PT_makeSpriteBgTransparent = function __PT_makeSpriteBgTransparent(scene, keys) {
    try {
      if (!scene?.textures || !Array.isArray(keys)) return;
      for (const key of keys) {
        if (!key) continue;
        const tex = scene.textures.get(key);
        if (!tex || tex.key === "__MISSING") continue;
        if (tex._ptChromaKeyApplied) continue;
        const srcImg = typeof tex.getSourceImage === "function" ? tex.getSourceImage() : null;
        if (!srcImg || !srcImg.width || !srcImg.height) continue;

        const w = srcImg.width;
        const h = srcImg.height;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx2d = c.getContext("2d", { willReadFrequently: true });
        if (!ctx2d) continue;
        ctx2d.drawImage(srcImg, 0, 0);
        const imgData = ctx2d.getImageData(0, 0, w, h);
        const d = imgData.data;
        const thr = 20;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          if (r <= thr && g <= thr && b <= thr) d[i + 3] = 0;
        }
        ctx2d.putImageData(imgData, 0, 0);

        scene.textures.remove(key);
        scene.textures.addCanvas(key, c);
        const tex2 = scene.textures.get(key);
        if (tex2) tex2._ptChromaKeyApplied = true;
      }
    } catch {
      // noop
    }
  };

  async function onLevelWin(levelId, extra = {}) {
    const mode = state.mode;
    if (mode === "single") {
      const nextId = Number(levelId) + 1;
      showWinDialog({
        title: extra.title || "通关成功",
        message: extra.message || `第 ${levelId} 关完成。`,
        nextText: "下一关",
        exitText: "退出",
        onNext: async () => {
          hideWinDialog();
          await startGame(nextId);
        },
        onExit: () => {
          hideWinDialog();
          destroyPhaser();
          setLevelPlayLayout(false);
          showPanel("menu");
        },
      });
      return;
    }
    if (mode === "race") {
      showWinDialog({
        title: extra.title || "竞速结束",
        message: extra.message || `第 ${levelId} 关结束。`,
        nextText: "再来一局",
        exitText: "退出",
        onNext: async () => {
          hideWinDialog();
          await startGame(levelId);
        },
        onExit: () => {
          hideWinDialog();
          destroyPhaser();
          setLevelPlayLayout(false);
          showPanel("menu");
        },
      });
      return;
    }
    if (mode === "coop") {
      showWinDialog({
        title: extra.title || "合作完成",
        message: extra.message || `第 ${levelId} 关完成。`,
        nextText: "再来一局",
        exitText: "退出",
        onNext: async () => {
          hideWinDialog();
          await startGame(levelId);
        },
        onExit: () => {
          hideWinDialog();
          destroyPhaser();
          setLevelPlayLayout(false);
          showPanel("menu");
        },
      });
    }
  }

  async function startGame(levelId) {
    hideWinDialog();
    if (state.mode === "single" && levelId === 1) {
      if (window.SinglePlayerLevels?.startLevel1) {
        await window.SinglePlayerLevels.startLevel1({ assets, state, ui, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("第一关脚本未加载。");
      }
      return;
    }
    if (state.mode === "single" && levelId === 2) {
      if (window.SinglePlayerLevels?.startLevel2) {
        await window.SinglePlayerLevels.startLevel2({ assets, state, ui, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("第二关脚本未加载。");
      }
      return;
    }
    if (state.mode === "single" && levelId === 3) {
      if (window.SinglePlayerLevels?.startLevel3) {
        await window.SinglePlayerLevels.startLevel3({ assets, state, ui, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("第三关脚本未加载。");
      }
      return;
    }
    if (state.mode === "single" && levelId === 4) {
      if (window.SinglePlayerLevels?.startLevel4) {
        await window.SinglePlayerLevels.startLevel4({ assets, state, ui, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("第四关脚本未加载。");
      }
      return;
    }

    if (state.mode === "single" && levelId === 5) {
      if (window.SinglePlayerLevels?.startLevel5) {
        await window.SinglePlayerLevels.startLevel5({ assets, state, ui, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("第五关脚本未加载。");
      }
      return;
    }
    if (state.mode === "single" && levelId === 6) {
      if (window.SinglePlayerLevels?.startLevel6) {
        await window.SinglePlayerLevels.startLevel6({ assets, state, ui, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("第六关脚本未加载。");
      }
      return;
    }
    if (state.mode === "single" && levelId === 7) {
      if (window.SinglePlayerLevels?.startLevel7) {
        await window.SinglePlayerLevels.startLevel7({ assets, state, ui, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("第七关脚本未加载。");
      }
      return;
    }
    if (state.mode === "single" && levelId === 8) {
      if (window.SinglePlayerLevels?.startLevel8) {
        await window.SinglePlayerLevels.startLevel8({ assets, state, ui, setLevelPlayLayout, destroyPhaser, api, refreshMe, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("第八关脚本未加载。");
      }
      return;
    }

    if (state.mode === "race" && levelId === 1) {
      if (window.DoublePlayerLevels?.startRaceLevel1) {
        await window.DoublePlayerLevels.startRaceLevel1({ assets, state, ui, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("双人竞速第一关脚本未加载。");
      }
      return;
    }
    if (state.mode === "race" && levelId === 2) {
      if (window.DoublePlayerLevels?.startRaceLevel2) {
        await window.DoublePlayerLevels.startRaceLevel2({ assets, state, ui, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("双人竞速第二关脚本未加载。");
      }
      return;
    }
    if (state.mode === "race" && levelId === 3) {
      if (window.DoublePlayerLevels?.startRaceLevel3) {
        await window.DoublePlayerLevels.startRaceLevel3({ assets, state, ui, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("双人竞速第三关脚本未加载。");
      }
      return;
    }
    if (state.mode === "race" && levelId === 4) {
      if (window.DoublePlayerLevels?.startRaceLevel4) {
        await window.DoublePlayerLevels.startRaceLevel4({ assets, state, ui, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("双人竞速第四关脚本未加载。");
      }
      return;
    }
    if (state.mode === "race" && levelId === 5) {
      if (window.DoublePlayerLevels?.startRaceLevel5) {
        await window.DoublePlayerLevels.startRaceLevel5({ assets, state, ui, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("双人竞速第五关脚本未加载。");
      }
      return;
    }
    if (state.mode === "coop" && levelId === 1) {
      if (window.TeamUpLevels?.startTeamLevel1) {
        await window.TeamUpLevels.startTeamLevel1({ assets, state, ui, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("双人合作第一关脚本未加载。");
      }
      return;
    }
    if (state.mode === "coop" && levelId === 2) {
      if (window.TeamUpLevels?.startTeamLevel2) {
        await window.TeamUpLevels.startTeamLevel2({ assets, state, ui, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("双人合作第二关脚本未加载。");
      }
      return;
    }
    if (state.mode === "coop" && levelId === 3) {
      if (window.TeamUpLevels?.startTeamLevel3) {
        await window.TeamUpLevels.startTeamLevel3({ assets, state, ui, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("双人合作第三关脚本未加载。");
      }
      return;
    }
    if (state.mode === "coop" && levelId === 4) {
      if (window.TeamUpLevels?.startTeamLevel4) {
        await window.TeamUpLevels.startTeamLevel4({ assets, state, ui, setLevelPlayLayout, destroyPhaser, onLevelWin, showWinDialog, hideWinDialog }, levelId);
      } else {
        alert("双人合作第四关脚本未加载。");
      }
      return;
    }

    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    const cfg = await api.levelConfig(levelId);
    const tileSize = 20;
    const widthPx = cfg.width * tileSize;
    const heightPx = cfg.height * tileSize;

    const scene = {
      create: function () {
        this.levelId = cfg.levelId;
        this.tileSize = tileSize;
        this.width = cfg.width;
        this.height = cfg.height;
        this.goalX = cfg.goalX;
        this.goalY = cfg.goalY;
        this.tileX = cfg.spawnX;
        this.tileY = cfg.spawnY;
        this.steps = 0;
        this.finished = false;

        this.add.rectangle(widthPx / 2, heightPx / 2, widthPx, heightPx, 0x0b1220).setOrigin(0.5);
        const gfx = this.add.graphics();
        gfx.lineStyle(1, 0x334155, 0.25);
        for (let x = 0; x <= this.width; x++) {
          gfx.beginPath();
          gfx.moveTo(x * tileSize, 0);
          gfx.lineTo(x * tileSize, heightPx);
          gfx.strokePath();
        }
        for (let y = 0; y <= this.height; y++) {
          gfx.beginPath();
          gfx.moveTo(0, y * tileSize);
          gfx.lineTo(widthPx, y * tileSize);
          gfx.strokePath();
        }

        this.playerRect = this.add
            .rectangle(this.tileX * tileSize + tileSize / 2, this.tileY * tileSize + tileSize / 2, tileSize * 0.8, tileSize * 0.8, 0x22c55e)
            .setOrigin(0.5);

        this.goalRect = this.add
            .rectangle(this.goalX * tileSize + tileSize / 2, this.goalY * tileSize + tileSize / 2, tileSize * 0.8, tileSize * 0.8, 0xfbbf24)
            .setOrigin(0.5);

        this.info = this.add.text(12, 10, "", { fontSize: "14px", color: "#e6edf3" }).setDepth(10);
        this.keys = this.input.keyboard.createCursorKeys();
        this.lastMoveAt = 0;
        this.cooldownMs = 120;
      },
      update: function () {
        if (this.finished) return;
        const now = this.time.now;
        if (now - this.lastMoveAt < this.cooldownMs) return;

        let dx = 0;
        let dy = 0;
        if (this.keys.left.isDown) dx = -1;
        else if (this.keys.right.isDown) dx = 1;
        else if (this.keys.up.isDown) dy = -1;
        else if (this.keys.down.isDown) dy = 1;
        if (dx === 0 && dy === 0) return;

        const nextX = this.tileX + dx;
        const nextY = this.tileY + dy;
        this.lastMoveAt = now;
        if (nextX < 0 || nextX >= this.width || nextY < 0 || nextY >= this.height) return;

        this.tileX = nextX;
        this.tileY = nextY;
        this.steps += 1;
        this.playerRect.setPosition(this.tileX * this.tileSize + this.tileSize / 2, this.tileY * this.tileSize + this.tileSize / 2);
        this.info.setText(`关卡：${this.levelId}  Steps：${this.steps}`);

        if (this.tileX === this.goalX && this.tileY === this.goalY) {
          this.finished = true;
          this.onFinish();
        }
      },
      onFinish: async function () {
        const score = Math.max(0, 10000 - this.steps * 120);
        try {
          await api.complete(this.levelId, score);
          await refreshMe();
          await renderLevels();
          alert(`通关成功！得分：${score}。已尝试解锁下一关。`);
        } catch (e) {
          alert(`通关提交失败：${e.message || e}`);
        }
      },
    };

    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ui.phaserMount,
      width: widthPx,
      height: heightPx,
      transparent: true,
      scene,
    });
  }

  async function startTilemapLevelOneTmx(levelId) {
    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    const tmxUrl = new URL(assets.level1Tmx, window.location.href).toString();
    let tmxText;
    try {
      const r = await fetch(tmxUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      tmxText = await r.text();
      debugLog("run_ui_layout", "H6_tmx_load", "game.js:startTilemapLevelOneTmx", "tmx_loaded", { tmxUrl });
    } catch (e) {
      debugLog("run_ui_layout", "H6_tmx_load", "game.js:startTilemapLevelOneTmx", "tmx_load_error", {
        tmxUrl,
        error: e?.message || String(e),
      });
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

    const tmjBase = new URL(tmxUrl); // keep var name similar for URL resolution

    function parseBoolProp(propEl) {
      if (!propEl) return undefined;
      const type = String(propEl.getAttribute("type") || "").toLowerCase();
      const value = String(propEl.getAttribute("value") || "").toLowerCase();
      if (type === "bool") return value === "true" || value === "1";
      // Fallback: treat "1" as true.
      return value === "true" || value === "1";
    }

    function resolveTilesetImageUrl(imageSource, baseUrl) {
      const candidates = [];
      if (typeof imageSource !== "string" || !imageSource) return null;
      if (imageSource.includes("sticker-knight/map/")) {
        // After moving map/ to `assets/maps/map/`, prefer parent-relative path from `singleplayer/`.
        candidates.push(imageSource.replace("sticker-knight/map/", "../map/"));
        // Keep legacy fallback (when map/ is colocated).
        candidates.push(imageSource.replace("sticker-knight/map/", "map/"));
      }
      candidates.push(imageSource);
      const baseName = imageSource.split("/").pop();
      if (baseName) {
        // Prefer the new location first.
        candidates.push(`../map/${baseName}`);
        candidates.push(`map/${baseName}`);
        candidates.push(`./map/${baseName}`);
      }
      for (const c of candidates) {
        try {
          return new URL(c, baseUrl).toString();
        } catch {
          // keep trying
        }
      }
      return null;
    }

    async function fetchTsxText(tsxSource, baseUrl) {
      const tsxUrl = new URL(tsxSource, baseUrl).toString();
      const tsxBaseName = String(tsxSource || "").split("/").pop();
      const fallbackTsxUrl = tsxBaseName ? new URL(`./${tsxBaseName}`, baseUrl).toString() : null;

      const candidates = [];
      if (tsxUrl) candidates.push(tsxUrl);
      if (fallbackTsxUrl) candidates.push(fallbackTsxUrl);
      // Try Windows-rename variant `dung .tsx`
      if (tsxBaseName && tsxBaseName.toLowerCase().endsWith(".tsx")) {
        const stem = tsxBaseName.slice(0, -4);
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
      const tsTileW = Number(root.getAttribute("tilewidth") || tileW);
      const tsTileH = Number(root.getAttribute("tileheight") || tileH);
      const tiles = {};

      const tileEls = Array.from(xml.querySelectorAll("tile"));
      for (const tileEl of tileEls) {
        const id = Number(tileEl.getAttribute("id") || "0");
        const imgEl = tileEl.querySelector("image");
        const imageSource = imgEl?.getAttribute("source") || null;
        const props = {};
        const propEls = Array.from(tileEl.querySelectorAll("properties > property"));
        for (const p of propEls) {
          const propName = String(p.getAttribute("name") || "");
          if (!propName) continue;
          const b = parseBoolProp(p);
          props[propName] = b;
        }
        tiles[id] = { id, imageSource, props };
      }

      return { name, tileW: tsTileW, tileH: tsTileH, tiles };
    }

    // 1) Parse layers (CSV data).
    const layerEls = Array.from(mapEl.querySelectorAll("layer"));
    const layers = layerEls.map((layerEl) => {
      const name = layerEl.getAttribute("name") || "";
      const dataEl = layerEl.querySelector("data");
      const encoding = String(dataEl?.getAttribute("encoding") || "").toLowerCase();
      const raw = (dataEl?.textContent || "").trim();
      if (encoding !== "csv" && encoding !== "") {
        // Keep minimal support.
        throw new Error(`Unsupported TMX layer encoding: ${encoding || "(empty)"}`);
      }
      // TMX CSV 里会大量出现 `0`（表示空白 tile），不能用 `filter(Boolean)` 过滤掉，否则
      // 会导致 data 索引错位、地图看起来像没加载出来。
      const parts = raw.replace(/\s+/g, "").split(",");
      const nums = parts.map((s) => (s === "" ? 0 : Number(s)));
      // 防御：只取期望长度，避免 CSV 最末尾的多余空项造成越界/错位。
      const expected = mapW * mapH;
      return { name, data: nums.slice(0, expected) };
    });

    // 2) Parse players object layer (born/death/fallarea).
    const objectGroups = Array.from(mapEl.querySelectorAll("objectgroup"));
    const playersGroup = objectGroups.find((g) => String(g.getAttribute("name") || "").toLowerCase() === "players") || objectGroups[0] || null;
    const playerObjects = playersGroup ? Array.from(playersGroup.querySelectorAll("object")) : [];

    let bornObj = playerObjects.find((o) => {
      const props = Array.from(o.querySelectorAll("properties > property"));
      const birth = props.some((p) => {
        const n = String(p.getAttribute("name") || "").toLowerCase();
        return (n === "birth" || n === "born") && parseBoolProp(p);
      });
      return birth;
    });
    if (!bornObj) bornObj = { x: tileW * 2, y: tileH * 2, width: tileW, height: tileH };

    const deathObjects = playerObjects.filter((o) => {
      const props = Array.from(o.querySelectorAll("properties > property"));
      return props.some((p) => String(p.getAttribute("name") || "").toLowerCase() === "death" && parseBoolProp(p));
    });

    const fallareaObjects = playerObjects.filter((o) => {
      const props = Array.from(o.querySelectorAll("properties > property"));
      return props.some((p) => String(p.getAttribute("name") || "").toLowerCase() === "fallarea" && parseBoolProp(p));
    });

    // 3) Load TSX for tilesets and build gid->tile resolver.
    const tilesetEls = Array.from(mapEl.querySelectorAll("tileset"));
    const tilesetInfos = [];
    for (const tsEl of tilesetEls) {
      const firstgid = Number(tsEl.getAttribute("firstgid") || "1");
      const source = tsEl.getAttribute("source");
      try {
        const tsxText = await fetchTsxText(source, tmjBase);
        const parsed = parseTsx(tsxText);
        tilesetInfos.push({ firstgid, source, ...parsed });
      } catch (e) {
        debugLog("run_ui_layout", "H6_tmx_load", "game.js:startTilemapLevelOneTmx", "tsx_load_error", {
          tsxSource: source,
          error: e?.message || String(e),
        });
      }
    }
    if (!tilesetInfos.length) {
      alert("第一关资源加载失败：TSX tileset 未能解析。请看控制台 debug 记录。");
      return;
    }
    tilesetInfos.sort((a, b) => a.firstgid - b.firstgid);

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

    // Collect images to preload (for rendering and player).
    const imageToKey = new Map(); // url -> key
    let heroImageUrl = null;
    for (const ts of tilesetInfos) {
      for (const tileIdStr of Object.keys(ts.tiles || {})) {
        const tileId = Number(tileIdStr);
        const tile = ts.tiles[tileId];
        if (!tile?.imageSource) continue;
        const url = resolveTilesetImageUrl(tile.imageSource, tmjBase);
        if (!url) continue;
        if (!imageToKey.has(url)) imageToKey.set(url, `tile_${ts.name}_${tileId}`);
        if (String(tile.imageSource || "").toLowerCase().endsWith("hero.png")) heroImageUrl = url;
      }
    }
    const heroKey = heroImageUrl ? imageToKey.get(heroImageUrl) : null;
    if (!imageToKey.size) {
      alert("第一关资源加载失败：未能解析到任何 tile 图片。请看控制台 debug 记录。");
      return;
    }

    // Precompute tile-trigger rectangles.
    const winRects = [];
    const deathRects = [];
    const fallareaRects = [];
    const moveDBlocks = []; // {cx,cy,imgKey, body: created later, initialMoveD, canFall}
    const solids = []; // {cx,cy}

    const anyLayerHasTile = layers.some((l) => Array.isArray(l.data));
    if (!anyLayerHasTile) {
      alert("TMX 地图没有 tile 图层数据。");
      return;
    }

    for (const layer of layers) {
      const data = layer.data;
      if (!Array.isArray(data) || data.length < mapW * mapH) continue;
      for (let idx = 0; idx < mapW * mapH; idx++) {
        const gid = data[idx];
        const tile = gid ? resolveTileFromGid(gid) : null;
        if (!tile) continue;
        const col = idx % mapW;
        const row = Math.floor(idx / mapW);
        const cx = col * tileW + tileW / 2;
        const cy = row * tileH + tileH / 2;

        const p = tile.props || {};
        const isSolid = p.solid === true;
        const isWin = p.win === true;
        const isDeath = p.death === true;
        const isFallArea = p.fallarea === true;
        const hasMoveD = Object.prototype.hasOwnProperty.call(p, "moveD");
        // Requirement: moveD starts at 0 (false) for all trap blocks, regardless of TSX value.
        const moveDInitial = false;

        // `moveD` tiles are controlled by the falling system, so they should not
        // also be treated as regular static solids.
        if (isSolid && !hasMoveD) solids.push({ cx, cy, w: tileW, h: tileH });
        if (isWin) winRects.push({ cx, cy, w: tileW, h: tileH });
        if (isDeath) deathRects.push({ cx, cy, w: tileW, h: tileH });
        if (isFallArea) fallareaRects.push({ cx, cy, w: tileW, h: tileH });

        if (hasMoveD) {
          const url = resolveTilesetImageUrl(tile.imageSource, tmjBase);
          const imgKey = url ? imageToKey.get(url) : null;
          moveDBlocks.push({
            cx,
            cy,
            w: tileW,
            h: tileH,
            imgKey,
            initialMoveD: moveDInitial,
          });
        }
      }
    }

    // 4) Build Phaser scene (render all tiles + implement triggers).
    const scene = {
      preload: function () {
        this._loadErrors = [];
        this.load.on("loaderror", (file) => {
          this._loadErrors.push({ key: file?.key, url: file?.url || file?.src, type: file?.type });
          console.error("[phaser loaderror]", file?.key, file?.type, file?.url || file?.src);
        });

        // Character sprites (override tileset hero.png)
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());

        for (const [url, key] of imageToKey.entries()) {
          if (!url || !key) continue;
          this.load.image(key, url);
        }
      },
      create: function () {
        if (this._loadErrors && this._loadErrors.length) {
          const top = this._loadErrors.slice(0, 6);
          console.error("[tmx tileset load errors]", top);
          alert(`第一关部分图片加载失败（${this._loadErrors.length} 个）。请看控制台查看具体 URL。`);
        }
        state.levelScene = this;
        this.isPaused = false;
        this.finished = false;
        this.dead = false;
        this.lastRespawnAt = -1e9;
        this.deathInvulnMs = 900;
        this.moveDActivated = false;
        this.moveDBodies = [];
        this.trapSpikeImgs = [];

        // Fit whole map into viewport with fixed camera.
        this.worldW = worldW;
        this.worldH = worldH;
        this.cameras.main.setBounds(0, 0, worldW, worldH);

        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        const fitZoom = Number.isFinite(zoom) && zoom > 0 ? Math.min(1, zoom) : 1;
        this.cameras.main.setZoom(fitZoom);
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // Render tiles from all tile layers.
        for (const layer of layers) {
          if (!layer.data || !Array.isArray(layer.data)) continue;
          const data = layer.data;
          for (let idx = 0; idx < mapW * mapH; idx++) {
            const gid = data[idx];
            const tile = gid ? resolveTileFromGid(gid) : null;
            if (!tile) continue;
            const col = idx % mapW;
            const row = Math.floor(idx / mapW);
            const url = resolveTilesetImageUrl(tile.imageSource, tmjBase);
            const key = url ? imageToKey.get(url) : null;
            if (!key) continue;
            const img = this.add.image(col * tileW, (row + 1) * tileH, key).setOrigin(0, 1);
            const isWinTile = tile.props && tile.props.win === true;
            const isTrapSpikeTile =
              tile.props &&
              tile.props.death === true &&
              typeof tile.imageSource === "string" &&
              tile.imageSource.toLowerCase().includes("trap.png");
            if (isWinTile) {
              // win tile: display at 2x
              img.setDisplaySize(tileW * 2, tileH * 2);
            } else {
              img.setDisplaySize(tileW, tileH);
            }

            // For moveD tiles, we need to sync image with physics body later.
            if (Object.prototype.hasOwnProperty.call(tile.props || {}, "moveD")) {
              // moveD starts hidden (0) until trap triggers.
              img.setAlpha(0);
              // Find corresponding moveDBlocks by coordinates (O(n) but map small).
              const block = moveDBlocks.find((b) => b.cx === col * tileW + tileW / 2 && b.cy === row * tileH + tileH / 2);
              if (block) block.img = img;
            }

            // Trap spikes (`trap.png`) are "death" tiles, but they should be hidden until moveD triggers.
            if (isTrapSpikeTile) {
              // 2x and extend to the right to cover the pit.
              // Origin is (0,1), so increasing width extends to the right.
              img.setDisplaySize(tileW * 2, tileH * 2);
              img.setAlpha(0); // hidden at start
              this.trapSpikeImgs.push(img);
            }
          }
        }

        // Physics setup.
        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;

        this.solids = this.physics.add.staticGroup();
        for (const r of solids) {
          const rect = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x000000, 0);
          this.physics.add.existing(rect, true);
          this.solids.add(rect);
        }

        // moveD blocks are initially immovable (behave like solids) then start falling.
        this.moveDGroup = this.physics.add.group();
        for (const b of moveDBlocks) {
          const rect = this.add.rectangle(b.cx, b.cy, b.w, b.h, 0x000000, 0);
          this.physics.add.existing(rect);
          // Some tiles may already be flagged as moveD=true in TSX.
          // Default expectation: initial moveD=false => immovable until fallarea triggers.
          if (rect.body) {
            rect.body.setImmovable(!b.initialMoveD);
            rect.body.allowGravity = !!b.initialMoveD;
            rect.body.setVelocity(0, 0);
          }
          this.moveDGroup.add(rect);
          this.moveDBodies.push({ ...b, rect });
          if (b.img) {
            // If tile image was not assigned due to coords mismatch, still keep.
            // Sync on every update.
          }
        }

        // Spawn player.
        const spawnX = Number(bornObj.getAttribute ? bornObj.getAttribute("x") : bornObj.x) + (Number(bornObj.getAttribute ? bornObj.getAttribute("width") : bornObj.width) || tileW) / 2;
        const spawnYTop = Number(bornObj.getAttribute ? bornObj.getAttribute("y") : bornObj.y) || 0;
        // Spawn using the top of the born marker, then let gravity settle onto solids.
        // (Using y+height often spawns inside ground if the born object overlaps tiles.)
        const spawnY = spawnYTop;
        this.bornX = spawnX;
        this.bornY = spawnY;

        // Use the new character sprites
        this.player = this.physics.add.sprite(spawnX, spawnY, "char_front");
        if (this.player) {
          this.player.setOrigin(0.5, 1);
          // birth hero: display at 2x
          const dispW = tileW * 0.6 * 2;
          const dispH = tileH * 0.9 * 2;
          this.player.setDisplaySize(dispW, dispH);
        }

        this.player.body.setCollideWorldBounds(true);
        // Make the physics body match the full visible hero so feet stand on solids.
        // With origin (0.5,1), offset (0,0) aligns body to sprite top-left.
        if (this.player.displayWidth && this.player.displayHeight) {
          this.player.body.setSize(this.player.displayWidth, this.player.displayHeight, false);
          this.player.body.setOffset(0, 0);
        }
        this.player.body.setMaxVelocity(250, 900);
        this.player.body.setDragX(900);

        this.physics.add.collider(this.player, this.solids);
        this.physics.add.collider(this.player, this.moveDGroup);

        // Win / Death / Fallarea sensors from tiles.
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

        this.fallSensors = makeSensorGroup();
        fallareaRects.forEach((r) => {
          const s = this.add.rectangle(r.cx, r.cy, r.w, r.h, 0x0000ff, 0);
          this.physics.add.existing(s, true);
          this.fallSensors.add(s);
        });

        // Also sensors from object layer: death / fallarea.
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

        this.physics.add.overlap(this.player, this.winSensors, () => {
          if (this.finished || this.dead) return;
          this.finished = true;
          alert("胜利！进入下一步（待完善计分/解锁）。");
          togglePauseInScene(this, true);
        });

        this.physics.add.overlap(this.player, this.deathSensors, () => {
          if (this.finished || this.dead) return;
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.handlePlayerDeath();
        });

        this.physics.add.overlap(this.player, this.deathObjSensors, () => {
          if (this.finished || this.dead) return;
          if (this.time.now - this.lastRespawnAt < this.deathInvulnMs) return;
          this.handlePlayerDeath();
        });

        this.physics.add.overlap(this.player, this.fallSensors, () => {
          if (this.moveDActivated || this.finished) return;
          this.activateMoveD();
        });
        this.physics.add.overlap(this.player, this.fallObjSensors, () => {
          if (this.moveDActivated || this.finished) return;
          this.activateMoveD();
        });

        // Helper methods on scene instance.
        this.activateMoveD = () => {
          if (this.moveDActivated) return;
          this.moveDActivated = true;
          for (const blk of this.moveDBodies) {
            if (!blk || !blk.rect) continue;
            const body = blk.rect.body;
            if (!body) continue; // already destroyed / not physics-enabled
            if (typeof body.setImmovable === "function") body.setImmovable(false);
            body.allowGravity = true;
            if (typeof body.setVelocity === "function") body.setVelocity(0, 0);
            if (blk.img) blk.img.setAlpha(1);
          }
          // Show trap spikes when the falling system starts.
          for (const img of this.trapSpikeImgs) img.setAlpha(1);
        };

        this.resetMoveDBodiesToInitial = () => {
          this.moveDActivated = false;
          for (const img of this.trapSpikeImgs) img.setAlpha(0);
          for (const blk of this.moveDBodies) {
            if (!blk || !blk.rect) continue;
            if (blk.rect.body) {
              blk.rect.body.enable = true;
              if (typeof blk.rect.body.setImmovable === "function") blk.rect.body.setImmovable(!blk.initialMoveD);
              blk.rect.body.allowGravity = !!blk.initialMoveD;
              if (typeof blk.rect.body.setVelocity === "function") blk.rect.body.setVelocity(0, 0);
            }
            blk.rect.setPosition(blk.cx, blk.cy);
            if (blk.img) blk.img.setAlpha(blk.initialMoveD ? 1 : 0);
          }
        };

        this.handlePlayerDeath = () => {
          if (this.dead || this.finished) return;
          this.dead = true;
          // Stop immediately to avoid repeated triggers.
          if (this.player?.body) this.player.body.setVelocity(0, 0);
          // Re-spawn after a short delay.
          this.time.delayedCall(650, () => {
            if (!this.scene) return;
            this.dead = false;
            this.lastRespawnAt = this.time.now;
            // Reset traps too, so death returns you to the initial layout.
            this.resetMoveDBodiesToInitial();
            if (this.player?.body) {
              this.player.body.enable = true;
              this.player.setPosition(this.bornX, this.bornY);
              this.player.body.setVelocity(0, 0);
            } else if (this.player) {
              this.player.setPosition(this.bornX, this.bornY);
            }
          });
        };

        function togglePauseInScene(scene, force) {
          if (force) scene.isPaused = true;
          else scene.isPaused = !scene.isPaused;
          if (scene.physics && scene.physics.pause) {
            scene.physics.pause();
          }
        }

        this.controls = this.input.keyboard.createCursorKeys();
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      },
      update: function () {
        if (!this.player || !this.player.body) return;
        if (this.isPaused || this.finished || this.dead) return;

        // moveD 只在触碰到 fallarea 后触发（上方触发区）。

        // Sync moveD tile images with physics bodies (for falling visuals).
        for (const blk of this.moveDBodies) {
          const img = blk.img;
          const rect = blk.rect;
          if (!img || !rect || !rect.body) continue;
          // rect.x/y are body center; img is bottom-left due to origin(0,1).
          img.x = rect.x - tileW / 2;
          img.y = rect.y + tileH / 2;
          // Hide after leaving map (do not destroy, so we can reset on respawn).
          if (rect.y - tileH / 2 > worldH + tileH) {
            img.setAlpha(0);
            if (rect.body) {
              rect.body.enable = false;
              rect.body.setVelocity(0, 0);
            }
          }
        }

        const speed = 220;
        const left = this.controls.left.isDown;
        const right = this.controls.right.isDown;
        if (left) this.player.setVelocityX(-speed);
        else if (right) this.player.setVelocityX(speed);
        else this.player.setVelocityX(0);

        // Swap character sprite by movement
        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump =
            Phaser.Input.Keyboard.JustDown(this.controls.up) || Phaser.Input.Keyboard.JustDown(this.jumpKey);
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) {
          this.player.setVelocityY(-480);
        }
      },
    };

    const canvasW = Math.min(1400, Math.max(900, window.innerWidth - 80));
    const canvasH = Math.min(900, Math.max(650, window.innerHeight - 200));

    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ui.phaserMount,
      width: canvasW,
      height: canvasH,
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  }

  async function startTilemapLevelTwoJson(levelId) {
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

    function parseBoolPropFromTsx(propEl) {
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
        } catch {
          // keep trying
        }
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
          props[propName] = parseBoolPropFromTsx(p);
        }
        tiles[id] = { id, imageSource, props };
      }
      return { name, tiles };
    }

    // Tilesets (external TSX)
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

    // Layers
    const tileLayers = (Array.isArray(mapData.layers) ? mapData.layers : []).filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
    const objectLayers = (Array.isArray(mapData.layers) ? mapData.layers : []).filter((l) => l && l.type === "objectgroup");

    // born object
    const bornObj =
      objectLayers
        .flatMap((l) => Array.isArray(l.objects) ? l.objects : [])
        .find((o) => Array.isArray(o.properties) && o.properties.some((p) => String(p.name || "").toLowerCase() === "born" && p.value === true)) ||
      null;

    const spawnX = bornObj ? bornObj.x + (bornObj.width || tileW) / 2 : tileW * 2;
    const spawnY = bornObj ? bornObj.y : tileH * 2;

    // Preload all tile images
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

    // Build solids + moving spikes placement from tiles
    const solids = [];
    const spikeSpawns = []; // {x,y,key}
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
        const isTrap = p.death === true && typeof tile.imageSource === "string" && tile.imageSource.toLowerCase().includes("trap.png");
        if (isTrap) {
          const url = resolveTilesetImageUrl(tile.imageSource, mapBase);
          const key = url ? imageToKey.get(url) : null;
          if (key) spikeSpawns.push({ x: col * tileW, y: (row + 1) * tileH, key }); // origin (0,1)
        }
      }
    }

    const playerSpeed = 220;
    const spikeSpeed = playerSpeed * 0.7;

    const scene = {
      preload: function () {
        this._loadErrors = [];
        this.load.on("loaderror", (file) => {
          console.error("[phaser loaderror]", file?.key, file?.type, file?.url || file?.src);
        });
        this.load.image("char_front", new URL(assets.characterFront, window.location.href).toString());
        this.load.image("char_left", new URL(assets.characterLeft, window.location.href).toString());
        this.load.image("char_right", new URL(assets.characterRight, window.location.href).toString());
        for (const [url, key] of imageToKey.entries()) this.load.image(key, url);
      },
      create: function () {
        state.levelScene = this;
        this.isPaused = false;

        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 980;

        // Fixed camera show whole map
        this.cameras.main.setBounds(0, 0, worldW, worldH);
        const zoom = Math.min(this.scale.width / worldW, this.scale.height / worldH);
        this.cameras.main.setZoom(Math.min(1, zoom));
        this.cameras.main.centerOn(worldW / 2, worldH / 2);

        // Render tiles (skip trap tiles; they will be dynamic spikes)
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
            img.setDisplaySize(tileW, tileH);
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

        // Moving spikes
        this.spikes = this.physics.add.group();
        for (const s of spikeSpawns) {
          const spike = this.physics.add.sprite(s.x, s.y, s.key).setOrigin(0, 1);
          spike.setDisplaySize(tileW * 2, tileH * 2);
          spike.body.allowGravity = false;
          spike.body.setVelocityX(-spikeSpeed); // start left
          spike._dir = -1;
          this.spikes.add(spike);
        }

        // Bounce on solid
        this.physics.add.collider(this.spikes, this.solids, (spike) => {
          if (!spike?.body) return;
          const dir = spike.body.velocity.x >= 0 ? 1 : -1;
          const newDir = -dir;
          spike._dir = newDir;
          spike.body.setVelocityX(newDir * spikeSpeed);
        });

        // Death on touch
        this.physics.add.overlap(this.player, this.spikes, () => {
          alert("死亡：碰到刺（第二关）。");
        });

        this.controls = this.input.keyboard.createCursorKeys();
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      },
      update: function () {
        if (!this.player?.body) return;
        if (this.isPaused) return;

        // Player movement + sprite swap
        const left = this.controls.left.isDown;
        const right = this.controls.right.isDown;
        if (left) this.player.setVelocityX(-playerSpeed);
        else if (right) this.player.setVelocityX(playerSpeed);
        else this.player.setVelocityX(0);
        if (left) this.player.setTexture("char_left");
        else if (right) this.player.setTexture("char_right");
        else this.player.setTexture("char_front");

        const wantJump = Phaser.Input.Keyboard.JustDown(this.controls.up) || Phaser.Input.Keyboard.JustDown(this.jumpKey);
        if (wantJump && (this.player.body.blocked.down || this.player.body.touching.down)) {
          this.player.setVelocityY(-480);
        }

        // Proximity: reverse spike direction immediately when player approaches
        const threshold = tileW * 2.2;
        const th2 = threshold * threshold;
        const px = this.player.x;
        const py = this.player.y;
        for (const spike of this.spikes.getChildren()) {
          if (!spike?.body) continue;
          const dx = px - spike.x;
          const dy = py - spike.y;
          if (dx * dx + dy * dy <= th2) {
            spike._dir = -(spike._dir || -1);
            spike.body.setVelocityX(spike._dir * spikeSpeed);
          }
        }
      },
    };

    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ui.phaserMount,
      width: Math.min(1400, Math.max(900, window.innerWidth - 80)),
      height: Math.min(900, Math.max(650, window.innerHeight - 200)),
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  }

  async function startTilemapLevelOne(levelId) {
    // Deprecated: kept for backward compatibility, but single player now uses TMX.
    // Returning early prevents loading the (possibly deleted) TMJ resources.
    return startTilemapLevelOneTmx(levelId);
    state.currentLevelId = levelId;
    setLevelPlayLayout(true);
    destroyPhaser();

    const tmjUrl = new URL(assets.level1Tmj, window.location.href).toString();
    let tmjData;
    try {
      const r = await fetch(tmjUrl, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      tmjData = await r.json();
      debugLog("run_ui_layout", "H6_tmj_load", "game.js:startTilemapLevelOne", "tmj_loaded", {
        tmjUrl,
        width: tmjData.width,
        height: tmjData.height,
        tilewidth: tmjData.tilewidth,
        tileheight: tmjData.tileheight,
        tilesetCount: Array.isArray(tmjData.tilesets) ? tmjData.tilesets.length : 0,
      });
    } catch (e) {
      debugLog("run_ui_layout", "H6_tmj_load", "game.js:startTilemapLevelOne", "tmj_load_error", {
        tmjUrl,
        error: e?.message || String(e),
      });
      alert(`第一关地图加载失败：${e?.message || e}`);
      return;
    }

    const tmjBase = new URL(tmjUrl);

    function decodeBase64ToBytes(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }

    function bytesToUint32LEArray(bytes) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const out = [];
      for (let i = 0; i < bytes.byteLength; i += 4) {
        out.push(view.getUint32(i, true));
      }
      return out;
    }

    function inflateZlibBase64ToGids(b64) {
      const bytes = decodeBase64ToBytes(b64);
      // pako is loaded via CDN in index.html
      const inflated = window.pako.inflate(bytes);
      const raw = bytesToUint32LEArray(inflated);
      // Tiled stores flip flags in highest bits; Phaser expects bare gids.
      // We'll keep only the low 29 bits (0x1FFFFFFF).
      let max = 0;
      let nonZero = 0;
      let highBitCount = 0;
      const masked = raw.map((v) => {
        if (v !== 0) nonZero += 1;
        if (v > max) max = v;
        if ((v & 0xE0000000) !== 0) highBitCount += 1;
        return v & 0x1fffffff;
      });
      debugLog("run_ui_layout", "H7_layer_data", "game.js:inflateZlibBase64ToGids", "layer_gid_stats", {
        nonZero,
        maxRaw: max,
        highBitCount,
      });
      return masked;
    }

    // 1) Decompress tile layers (Phaser cannot parse zlib-compressed layers).
    const layers = Array.isArray(tmjData.layers) ? tmjData.layers : [];
    let decompressedLayers = 0;
    for (const layer of layers) {
      if (!layer || layer.type !== "tilelayer") continue;
      if (layer.encoding === "base64" && layer.compression === "zlib" && typeof layer.data === "string") {
        try {
          const gids = inflateZlibBase64ToGids(layer.data);
          layer.data = gids;
          delete layer.encoding;
          delete layer.compression;
          decompressedLayers += 1;
        } catch (e) {
          debugLog("run_ui_layout", "H6_tmj_load", "game.js:startTilemapLevelOne", "layer_decompress_error", {
            layerName: layer.name,
            error: e?.message || String(e),
          });
        }
      }
    }
    debugLog("run_ui_layout", "H6_tmj_load", "game.js:startTilemapLevelOne", "layers_decompressed", {
      decompressedLayers,
      layerCount: layers.length,
    });

    // 2) Inline external TSX tilesets (Phaser cannot parse external tilesets from tmj).
    const rawTilesets = Array.isArray(tmjData.tilesets) ? tmjData.tilesets : [];
    const embeddedTilesets = [];
    const tilesetDefs = [];

    function resolveTilesetImageUrl(imageSource, baseUrl) {
      // imageSource may contain paths that don't match our runtime assets folder.
      // We'll try a few fallbacks that match this project's structure:
      // - sticker-knight/map/*.png  -> map/*.png  (sibling of one.tsx)
      // - basename only -> map/<basename>
      // - original as-is
      const candidates = [];
      if (typeof imageSource === "string" && imageSource) {
        if (imageSource.includes("sticker-knight/map/")) {
          candidates.push(imageSource.replace("sticker-knight/map/", "map/"));
        }
        // Prefer the normalized form first; the original `sticker-knight/...` path is usually
        // not present at runtime in this repo and would otherwise cause 404s.
        candidates.push(imageSource);
        const baseName = imageSource.split("/").pop();
        if (baseName) {
          candidates.push(`map/${baseName}`);
          candidates.push(`./map/${baseName}`);
        }
      }
      for (const c of candidates) {
        try {
          return new URL(c, baseUrl).toString();
        } catch {
          // keep trying
        }
      }
      return null;
    }

    for (let i = 0; i < rawTilesets.length; i++) {
      const ts = rawTilesets[i];
      if (!ts) continue;

      // Already embedded in tmj (rare for your current export, but supported).
      if (ts.image) {
        const imageUrl = new URL(ts.image, tmjBase).toString();
        tilesetDefs.push({
          firstgid: ts.firstgid || 1,
          name: ts.name || `tileset_${i}`,
          tilewidth: ts.tilewidth || tmjData.tilewidth || 32,
          tileheight: ts.tileheight || tmjData.tileheight || 32,
          margin: ts.margin || 0,
          spacing: ts.spacing || 0,
          imageUrl,
          key: `ts_${i}`,
        });
        embeddedTilesets.push({ ...ts, image: new URL(ts.image, tmjBase).pathname.replace(/^\/+/, "") });
        continue;
      }

      if (ts.source) {
        const tsxUrl = new URL(ts.source, tmjBase).toString();
        const tsxBaseName = (ts.source || "").split("/").pop();
        const fallbackTsxUrl = tsxBaseName ? new URL(`./${tsxBaseName}`, tmjBase).toString() : null;
        // Some Windows renames can accidentally create filenames like `dung .tsx`
        // (space before `.tsx`). Your TMJ/ts.source usually expects `one.tsx`,
        // so add a couple of safe variants as extra fetch candidates.
        const tsxCandidates = [];
        if (fallbackTsxUrl) tsxCandidates.push(fallbackTsxUrl);
        if (tsxBaseName && tsxBaseName.toLowerCase().endsWith(".tsx")) {
          const stem = tsxBaseName.slice(0, -4); // remove ".tsx"
          const spaced = `${stem} .tsx`;
          tsxCandidates.push(new URL(`./${spaced}`, tmjBase).toString());
        }
        try {
          let r = await fetch(tsxUrl, { credentials: "same-origin" });
          if (!r.ok) {
            debugLog("run_ui_layout", "H6_tmj_load", "game.js:startTilemapLevelOne", "tsx_fetch_fallback", {
              original: tsxUrl,
              candidates: tsxCandidates,
              status: r.status,
            });
            let last = r;
            for (const cand of tsxCandidates) {
              try {
                const rc = await fetch(cand, { credentials: "same-origin" });
                if (rc && rc.ok) {
                  r = rc;
                  break;
                }
                last = rc;
              } catch {
                // Keep trying candidates.
              }
            }
            if (!r.ok) throw new Error(`HTTP ${last?.status ?? "unknown"}`);
          }
          const tsxText = await r.text();
          const xml = new DOMParser().parseFromString(tsxText, "application/xml");
          const root = xml.querySelector("tileset");
          if (!root) throw new Error("invalid tsx format");

          const name = root.getAttribute("name") || `tileset_${i}`;
          const tilewidth = Number(root.getAttribute("tilewidth") || tmjData.tilewidth || 32);
          const tileheight = Number(root.getAttribute("tileheight") || tmjData.tileheight || 32);
          const margin = Number(root.getAttribute("margin") || 0);
          const spacing = Number(root.getAttribute("spacing") || 0);
          const tilecount = Number(root.getAttribute("tilecount") || 0);
          const columns = Number(root.getAttribute("columns") || 0);

          const resolvedTsxUrl = r.url || (fallbackTsxUrl || tsxUrl);

          // TSX may be a single-image tileset or an image-collection tileset.
          const tiles = Array.from(xml.querySelectorAll("tile")).map((tileNode) => {
            const id = Number(tileNode.getAttribute("id") || "0");
            const img = tileNode.querySelector("image");
            if (!img) return null;
            const src = img.getAttribute("source");
            if (!src) return null;
            const w = Number(img.getAttribute("width") || 0);
            const h = Number(img.getAttribute("height") || 0);
            const url = resolveTilesetImageUrl(src, resolvedTsxUrl);
            if (!url) return null;
            const solidProp = tileNode.querySelector('properties > property[name="solid"]');
            const solid =
                solidProp &&
                String(solidProp.getAttribute("type") || "").toLowerCase() === "bool" &&
                String(solidProp.getAttribute("value") || "").toLowerCase() === "true";
            return { id, source: src, imageUrl: url, width: w, height: h, solid, key: `ts_${i}_tile_${id}` };
          }).filter(Boolean);

          const tilesetImageNode = root.querySelector(":scope > image");
          const singleImageSource = tilesetImageNode?.getAttribute("source") || null;
          const singleImageUrl = singleImageSource ? resolveTilesetImageUrl(singleImageSource, resolvedTsxUrl) : null;
          const singleImageWidth = Number(tilesetImageNode?.getAttribute("width") || 0);
          const singleImageHeight = Number(tilesetImageNode?.getAttribute("height") || 0);

          tilesetDefs.push({
            firstgid: ts.firstgid || 1,
            name,
            tilewidth,
            tileheight,
            margin,
            spacing,
            tilecount,
            columns,
            kind: singleImageUrl ? "single" : "collection",
            imageUrl: singleImageUrl,
            key: `ts_${i}`,
            tiles,
          });

          // Embed minimal tileset fields into tmjData (kept for compatibility/logging).
          embeddedTilesets.push({
            firstgid: ts.firstgid || 1,
            name,
            tilewidth,
            tileheight,
            margin,
            spacing,
            tilecount,
            columns,
            ...(singleImageSource
                ? { image: singleImageSource, imagewidth: singleImageWidth, imageheight: singleImageHeight }
                : {}),
          });

          debugLog("run_ui_layout", "H6_tmj_load", "game.js:startTilemapLevelOne", "tsx_loaded", {
            tsxUrl: resolvedTsxUrl,
            tilesetName: name,
            kind: singleImageUrl ? "single" : "collection",
            tileImages: tiles.length,
          });
        } catch (e) {
          debugLog("run_ui_layout", "H6_tmj_load", "game.js:startTilemapLevelOne", "tsx_load_error", {
            tsxUrl,
            error: e?.message || String(e),
          });
        }
      }
    }

    tmjData.tilesets = embeddedTilesets;
    debugLog("run_ui_layout", "H6_tmj_load", "game.js:startTilemapLevelOne", "tilesets_inlined", {
      rawTilesetCount: rawTilesets.length,
      embeddedTilesetCount: embeddedTilesets.length,
      tilesetDefsCount: tilesetDefs.length,
    });
    const objectLayers = (tmjData.layers || []).filter((l) => l.type === "objectgroup");
    const spawnObj = objectLayers.flatMap((l) => l.objects || []).find((o) => (o.name || "").toLowerCase() === "spawn");
    const goalObj = objectLayers.flatMap((l) => l.objects || []).find((o) => (o.name || "").toLowerCase() === "goal");

    // Build a gid->tileImage definition table from tilesetDefs.
    function buildGidResolver() {
      const sorted = [...tilesetDefs].sort((a, b) => (a.firstgid || 1) - (b.firstgid || 1));
      return function resolveGid(gid) {
        if (!gid) return null;
        let chosen = null;
        for (let i = 0; i < sorted.length; i++) {
          const ts = sorted[i];
          const fg = ts.firstgid || 1;
          const nextFg = i + 1 < sorted.length ? sorted[i + 1].firstgid || Infinity : Infinity;
          if (gid >= fg && gid < nextFg) {
            chosen = ts;
            break;
          }
        }
        if (!chosen) return null;
        const tileId = gid - (chosen.firstgid || 1);
        const tile = (chosen.tiles || []).find((t) => t.id === tileId);
        if (tile) return { ...tile, tileId, tileset: chosen };
        // Fallback for single-image tilesets (not used in your current one.tsx, but kept).
        if (chosen.kind === "single" && chosen.imageUrl) {
          return { key: chosen.key, imageUrl: chosen.imageUrl, width: chosen.tilewidth, height: chosen.tileheight, tileId, tileset: chosen };
        }
        return null;
      };
    }

    const resolveGid = buildGidResolver();

    const scene = {
      preload: function () {
        this._loadErrors = [];
        this.load.on("loaderror", (file) => {
          this._loadErrors.push({ key: file?.key, url: file?.url || file?.src, type: file?.type });
          debugLog("run_ui_layout", "H6_tmj_load", "game.js:preload", "phaser_load_error", {
            key: file?.key,
            type: file?.type,
            url: file?.url,
            src: file?.src,
          });
        });

        // Load all tile images referenced by tilesets (image-collection friendly).
        let tileImageCount = 0;
        tilesetDefs.forEach((ts) => {
          if (ts.kind === "single" && ts.imageUrl) {
            this.load.image(ts.key, ts.imageUrl);
            tileImageCount += 1;
            return;
          }
          (ts.tiles || []).forEach((t) => {
            this.load.image(t.key, t.imageUrl);
            tileImageCount += 1;
          });
        });
        debugLog("run_ui_layout", "H6_tmj_load", "game.js:preload", "tileset_images_queued", {
          tilesetCount: tilesetDefs.length,
          tileImageCount,
        });
      },
      create: function () {
        const mapW = tmjData.width || 1;
        const mapH = tmjData.height || 1;
        const tw = tmjData.tilewidth || 32;
        const th = tmjData.tileheight || 32;
        const worldW = mapW * tw;
        const worldH = mapH * th;

        // Simple background.
        this.add.rectangle(worldW / 2, worldH / 2, worldW, worldH, 0x0b1220).setOrigin(0.5);

        // Render tile layers by placing images directly (works for image-collection tilesets).
        const layers = (tmjData.layers || []).filter((l) => l && l.type === "tilelayer" && Array.isArray(l.data));
        debugLog("run_ui_layout", "H8_layer_render", "game.js:create", "tilelayer_names", {
          names: layers.map((l) => l.name),
        });

        for (const layer of layers) {
          if (layer.visible === false) continue;
          for (let idx = 0; idx < layer.data.length; idx++) {
            const gid = layer.data[idx] & 0x1fffffff;
            if (!gid) continue;
            const x = idx % mapW;
            const y = Math.floor(idx / mapW);
            const tile = resolveGid(gid);
            if (!tile) continue;

            const img = this.add.image(x * tw, (y + 1) * th, tile.key).setOrigin(0, 1);
            if (typeof layer.opacity === "number") img.setAlpha(layer.opacity);
          }
        }

        // Physics & platformer controls.
        this.physics.world.setBounds(0, 0, worldW, worldH);
        this.physics.world.gravity.y = 900;

        // Collisions:
        // - Primary: tiles with TSX property `solid=true` (your tileset uses this).
        // - Optional: if TMJ has an object layer named `solid`, use it instead (hand-authored).
        const solidObjectLayer = (tmjData.layers || []).find(
            (l) => l && l.type === "objectgroup" && String(l.name || "").toLowerCase() === "solid"
        );
        this.solids = this.physics.add.staticGroup();

        if (solidObjectLayer && Array.isArray(solidObjectLayer.objects) && solidObjectLayer.objects.length) {
          let added = 0;
          for (const o of solidObjectLayer.objects) {
            if (!o || typeof o.x !== "number" || typeof o.y !== "number") continue;
            const w = typeof o.width === "number" && o.width > 0 ? o.width : tw;
            const h = typeof o.height === "number" && o.height > 0 ? o.height : th;
            const body = this.add.rectangle(o.x + w / 2, o.y + h / 2, w, h, 0x000000, 0);
            this.physics.add.existing(body, true);
            this.solids.add(body);
            added += 1;
          }
          this.solids.refresh();
          debugLog("run_ui_layout", "H8_layer_render", "game.js:create", "collision_solid_objectlayer_loaded", {
            objects: solidObjectLayer.objects.length,
            bodies: added,
          });
        } else {
          // Build static collision rectangles by scanning tile layers and using `solid=true` metadata.
          let added = 0;
          let solidTiles = 0;
          // Prefer a layer named like "solid" if it exists; otherwise scan all tile layers.
          const solidTileLayer = layers.find((l) => String(l.name || "").toLowerCase().includes("solid")) || null;
          const scanLayers = solidTileLayer ? [solidTileLayer] : layers;

          for (const layer of scanLayers) {
            if (!layer || !Array.isArray(layer.data)) continue;
            for (let y = 0; y < mapH; y++) {
              let x = 0;
              while (x < mapW) {
                const idx = y * mapW + x;
                const gid = layer.data[idx] & 0x1fffffff;
                const tile = gid ? resolveGid(gid) : null;
                const isSolid = !!tile?.solid;
                if (!isSolid) {
                  x += 1;
                  continue;
                }
                solidTiles += 1;
                const x0 = x;
                // Merge horizontal runs of solid tiles into one body.
                while (x < mapW) {
                  const gid2 = layer.data[y * mapW + x] & 0x1fffffff;
                  const t2 = gid2 ? resolveGid(gid2) : null;
                  if (!t2?.solid) break;
                  x += 1;
                }
                const runW = (x - x0) * tw;
                const body = this.add.rectangle(x0 * tw + runW / 2, y * th + th / 2, runW, th, 0x000000, 0);
                this.physics.add.existing(body, true);
                this.solids.add(body);
                added += 1;
              }
            }
          }

          this.solids.refresh();
          debugLog("run_ui_layout", "H8_layer_render", "game.js:create", "collision_solid_tiles_built", {
            bodies: added,
            solidTiles,
            scannedLayers: scanLayers.map((l) => l.name),
          });
        }

        // Player sprite: prefer a loaded "hero" tile image if present.
        const heroTile = tilesetDefs.flatMap((ts) => ts.tiles || []).find((t) => String(t.source || "").toLowerCase().includes("hero.png"));
        const playerKey = heroTile?.key || (tilesetDefs[0]?.tiles?.[0]?.key ?? null);
        const spawnX = spawnObj ? spawnObj.x + (spawnObj.width || tw) / 2 : tw * 2;
        const spawnY = spawnObj ? spawnObj.y - (spawnObj.height || th) / 2 : th * 2;
        // Ensure we spawn inside bounds even if no spawn object exists.
        const safeSpawnY = Math.max(th, Math.min(worldH - th, spawnY));

        if (playerKey) {
          this.player = this.physics.add.sprite(spawnX, safeSpawnY, playerKey);
          this.player.setOrigin(0.5, 1);
          this.player.setScale(0.5);
        } else {
          this.player = this.physics.add.sprite(spawnX, safeSpawnY, "__missing_player__");
        }
        this.player.body.setCollideWorldBounds(true);
        this.player.body.setDragX(900);
        this.player.body.setMaxVelocity(220, 800);
        this.player.body.setSize(Math.max(14, tw * 0.55), Math.max(18, th * 0.85), true);

        this.goal = this.add.rectangle(worldW - tw * 2, th * 2, Math.max(18, tw * 0.7), Math.max(18, th * 0.7), 0xfbbf24);
        this.physics.add.existing(this.goal, true);

        this.keys = this.input.keyboard.createCursorKeys();
        this.keyJump = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.finished = false;

        this.physics.add.collider(this.player, this.solids);
        this.physics.add.overlap(this.player, this.goal, async () => {
          if (this.finished) return;
          this.finished = true;
          const score = 10000;
          try {
            await api.complete(levelId, score);
            await refreshMe();
            alert(`第一关通关成功！得分：${score}`);
          } catch (e) {
            alert(`通关提交失败：${e.message || e}`);
          }
        });

        this.cameras.main.setBounds(0, 0, worldW, worldH);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(1);
      },
      update: function () {
        if (!this.player || !this.player.body) return;
        const speed = 200;
        const left = this.keys.left.isDown;
        const right = this.keys.right.isDown;

        if (left) this.player.setVelocityX(-speed);
        else if (right) this.player.setVelocityX(speed);
        else this.player.setVelocityX(0);

        const wantJump = Phaser.Input.Keyboard.JustDown(this.keys.up) || Phaser.Input.Keyboard.JustDown(this.keyJump);
        if (wantJump && this.player.body.blocked.down) {
          this.player.setVelocityY(-420);
        }
      },
    };

    state.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ui.phaserMount,
      width: Math.min(1080, Math.max(640, window.innerWidth - 120)),
      height: Math.min(720, Math.max(420, window.innerHeight - 180)),
      transparent: true,
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
    });
  }

  function initLandingButtons() {
    ui.tabLogin.addEventListener("click", () => {
      playClickSfx();
      ensureBgmPlayback();
      clearAuthError();
      ui.tabLogin.classList.add("active");
      ui.tabRegister.classList.remove("active");
      ui.loginForm.style.display = "block";
      ui.registerForm.style.display = "none";
      debugLog("run_ui_layout", "H4_auth_layout", "game.js:initLandingButtons", "tab_login_selected", {});
    });
    ui.tabRegister.addEventListener("click", () => {
      playClickSfx();
      ensureBgmPlayback();
      clearAuthError();
      ui.tabRegister.classList.add("active");
      ui.tabLogin.classList.remove("active");
      ui.loginForm.style.display = "none";
      ui.registerForm.style.display = "block";
      debugLog("run_ui_layout", "H4_auth_layout", "game.js:initLandingButtons", "tab_register_selected", {});
    });

    ui.btnLogin.addEventListener("click", async () => {
      playClickSfx();
      clearAuthError();
      const username = (ui.loginUsername.value || "").trim();
      const password = ui.loginPassword.value || "";
      try {
        await api.login(username, password);
        await bootstrapApp();
      } catch (e) {
        showAuthError(`登录失败：${e.message || e}`);
      }
    });

    ui.btnRegister.addEventListener("click", async () => {
      playClickSfx();
      clearAuthError();
      const username = (ui.regUsername.value || "").trim();
      const password = ui.regPassword.value || "";
      try {
        await api.register(username, password);
        await bootstrapApp();
      } catch (e) {
        showAuthError(`注册失败：${e.message || e}`);
      }
    });
  }

  function initAppNav() {
    ui.navSingle.addEventListener("click", () => {
      playClickSfx();
      state.mode = "single";
      ui.levelsTitle.textContent = "单人闯关";
      renderLevelsForMode();
      showPanel("levels");
    });
    ui.navCoop.addEventListener("click", () => {
      playClickSfx();
      state.mode = "coop";
      ui.levelsTitle.textContent = "双人闯关";
      renderLevelsForMode();
      showPanel("levels");
    });
    ui.navRace.addEventListener("click", () => {
      playClickSfx();
      state.mode = "race";
      ui.levelsTitle.textContent = "双人竞速";
      renderLevelsForMode();
      showPanel("levels");
    });
    ui.navSettings.addEventListener("click", () => {
      playClickSfx();
      showPanel("settings");
    });
    ui.btnBackFromLevels.addEventListener("click", () => {
      playClickSfx();
      showPanel("menu");
    });
    ui.btnBackFromSettings.addEventListener("click", () => {
      playClickSfx();
      showPanel("menu");
    });
    ui.navLogout.addEventListener("click", async () => {
      playClickSfx();
      try {
        await api.logout();
      } finally {
        destroyPhaser();
        if (state.menuBgmAudio) {
          state.menuBgmAudio.pause();
          state.menuBgmAudio.currentTime = 0;
        }
        showLanding();
      }
    });

    ui.volumeSlider.addEventListener("input", () => {
      state.volume = Number(ui.volumeSlider.value || 0);
      ui.volumeValue.textContent = String(state.volume);
      applyVolumeToMedia();
      saveVolumeDebounced();
    });
  }

  async function bootstrapApp() {
    await refreshMe();
    showApp();
    showPanel("menu");
    state.volume = Number(state.me.volume ?? state.volume);
    ui.volumeSlider.value = String(state.volume);
    ui.volumeValue.textContent = String(state.volume);
    applyVolumeToMedia();
    state.keybinds = loadKeybinds();
    state.controlMode = loadControlMode();
    syncKeybindsUI();
    syncControlModeUI();
    renderLevelsForMode();
  }

  async function init() {
    initLandingButtons();
    initAppNav();
    initMedia();
    setupMobileButtons();
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
    debugLog("run_ui_layout", "H1_bg_ratio", "game.js:init", "client_boot", {
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      userAgent: navigator.userAgent,
    });

    if (ui.btnPauseLevel) ui.btnPauseLevel.addEventListener("click", togglePauseLevel);
    if (ui.btnResumeLevel) ui.btnResumeLevel.addEventListener("click", () => state.levelPaused && togglePauseLevel());
    if (ui.pauseBackdrop) {
      ui.pauseBackdrop.addEventListener("click", (e) => {
        if (e.target === ui.pauseBackdrop && state.levelPaused) togglePauseLevel();
      });
    }
    if (ui.btnExitLevel) ui.btnExitLevel.addEventListener("click", exitLevelWithConfirm);
    if (ui.btnWinNext) ui.btnWinNext.addEventListener("click", () => state._winOnNext && state._winOnNext());
    if (ui.btnWinExit) ui.btnWinExit.addEventListener("click", () => state._winOnExit && state._winOnExit());
    if (ui.winDialogBackdrop) ui.winDialogBackdrop.addEventListener("click", (e) => {
      if (e.target === ui.winDialogBackdrop && state._winOnExit) state._winOnExit();
    });

    // Keybind settings
    syncKeybindsUI();
    if (ui.btnBindP1Left) ui.btnBindP1Left.addEventListener("click", () => beginBindKey("玩家1-左", (code) => (state.keybinds.p1.left = code)));
    if (ui.btnBindP1Right) ui.btnBindP1Right.addEventListener("click", () => beginBindKey("玩家1-右", (code) => (state.keybinds.p1.right = code)));
    if (ui.btnBindP1Jump) ui.btnBindP1Jump.addEventListener("click", () => beginBindKey("玩家1-跳", (code) => (state.keybinds.p1.jump = code)));
    if (ui.btnBindP2Left) ui.btnBindP2Left.addEventListener("click", () => beginBindKey("玩家2-左", (code) => (state.keybinds.p2.left = code)));
    if (ui.btnBindP2Right) ui.btnBindP2Right.addEventListener("click", () => beginBindKey("玩家2-右", (code) => (state.keybinds.p2.right = code)));
    if (ui.btnBindP2Jump) ui.btnBindP2Jump.addEventListener("click", () => beginBindKey("玩家2-跳", (code) => (state.keybinds.p2.jump = code)));
    if (ui.btnResetKeybinds) ui.btnResetKeybinds.addEventListener("click", () => {
      state.keybinds = cloneKeybinds(DEFAULT_KEYBINDS);
      syncKeybindsUI();
      saveKeybinds(state.keybinds);
    });
    if (ui.controlModeSelect) ui.controlModeSelect.addEventListener("change", () => {
      const v = String(ui.controlModeSelect.value || "desktop").toLowerCase();
      state.controlMode = v === "mobile" ? "mobile" : "desktop";
      saveControlMode(state.controlMode);
      setLevelPlayLayout(!!state.phaser);
    });

    // If already logged in, go straight to app.
    try {
      await bootstrapApp();
    } catch {
      showLanding();
    }
  }

  init();
})();

