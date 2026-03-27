// Game client (no framework).
// Flow: Login/Register -> Main menu -> Levels (locked/unlocked) -> Play -> Complete -> Unlock next.

(() => {
  const $ = (id) => document.getElementById(id);

  const ui = {
    landing: $("landing"),
    app: $("app"),
    authForms: $("authForms"),
    loginForm: $("loginForm"),
    registerForm: $("registerForm"),
    authError: $("authError"),
    btnShowLogin: $("btnShowLogin"),
    btnShowRegister: $("btnShowRegister"),
    btnCancelAuth: $("btnCancelAuth"),
    btnCancelAuth2: $("btnCancelAuth2"),
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
    panelModeHint: $("panelModeHint"),
    modeHintText: $("modeHintText"),
    panelStart: $("panelStart"),
    panelSettings: $("panelSettings"),
    levels: $("levels"),

    volumeSlider: $("volumeSlider"),
    volumeValue: $("volumeValue"),

    gameHost: $("gameHost"),
    phaserMount: $("phaserMount"),
  };

  const api = {
    async json(url, options = {}) {
      const r = await fetch(url, {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(text || `HTTP ${r.status}`);
      }
      if (r.status === 204) return null;
      return r.json();
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
    authBgImage: "./assets/images/login_bg_placeholder.jpg",
    menuBgm: "./assets/audio/bgm/menu_bgm.mp3",
    clickSfx: "./assets/audio/sfx/btn_click.wav",
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
  };

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
    ui.panelStart.style.display = which === "start" ? "block" : "none";
    ui.panelModeHint.style.display = which === "modeHint" ? "block" : "none";
    ui.panelSettings.style.display = which === "settings" ? "block" : "none";
  }

  function setModeHint(mode, text) {
    state.mode = mode;
    ui.modeHintText.textContent = text;
    showPanel("modeHint");
  }

  async function refreshMe() {
    state.me = await api.me();
    ui.meText.textContent = `当前用户：${state.me.username}（已解锁到：${state.me.maxUnlockedLevel ?? 1}）`;
  }

  async function renderLevels() {
    const list = await api.levels();
    ui.levels.innerHTML = "";
    list.forEach((l) => {
      const btn = document.createElement("button");
      btn.className = "levelBtn" + (l.unlocked ? "" : " locked");
      btn.type = "button";
      btn.innerHTML = `<div class="levelNum">关卡 ${l.levelId}</div><div class="levelTitle">${l.title}</div>`;
      if (!l.unlocked) {
        btn.disabled = true;
        btn.title = "请先通关上一关";
      } else {
        btn.addEventListener("click", () => startGame(l.levelId));
      }
      ui.levels.appendChild(btn);
    });
  }

  function destroyPhaser() {
    if (state.phaser) {
      state.phaser.destroy(true);
      state.phaser = null;
    }
    ui.phaserMount.innerHTML = "";
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
    });
    state.menuBgmAudio.addEventListener("error", () => {
      state.hasBgmAudio = false;
    });

    // Click SFX.
    state.clickAudio = new Audio(assets.clickSfx);
    state.clickAudio.preload = "auto";
    state.clickAudio.addEventListener("canplaythrough", () => {
      state.hasClickAudio = true;
    });
    state.clickAudio.addEventListener("error", () => {
      state.hasClickAudio = false;
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

  async function startGame(levelId) {
    state.currentLevelId = levelId;
    ui.gameHost.style.display = "block";
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
      backgroundColor: "#0b1220",
      scene,
    });
  }

  function initLandingButtons() {
    ui.btnShowLogin.addEventListener("click", () => {
      playClickSfx();
      ensureBgmPlayback();
      clearAuthError();
      ui.authForms.style.display = "block";
      ui.loginForm.style.display = "block";
      ui.registerForm.style.display = "none";
    });
    ui.btnShowRegister.addEventListener("click", () => {
      playClickSfx();
      ensureBgmPlayback();
      clearAuthError();
      ui.authForms.style.display = "block";
      ui.loginForm.style.display = "none";
      ui.registerForm.style.display = "block";
    });
    ui.btnCancelAuth.addEventListener("click", () => {
      playClickSfx();
      ui.authForms.style.display = "none";
      clearAuthError();
    });
    ui.btnCancelAuth2.addEventListener("click", () => {
      playClickSfx();
      ui.authForms.style.display = "none";
      clearAuthError();
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
      setModeHint("single", "单人闯关：已接入关卡列表，可直接在下方选择关卡开始。");
      showPanel("start");
    });
    ui.navCoop.addEventListener("click", () => {
      playClickSfx();
      setModeHint("coop", "双人闯关：功能待接入，当前为占位入口。");
    });
    ui.navRace.addEventListener("click", () => {
      playClickSfx();
      setModeHint("race", "双人竞速：功能待接入，当前为占位入口。");
    });
    ui.navSettings.addEventListener("click", () => showPanel("settings"));
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
    showPanel("start");
    state.volume = Number(state.me.volume ?? state.volume);
    ui.volumeSlider.value = String(state.volume);
    ui.volumeValue.textContent = String(state.volume);
    applyVolumeToMedia();
    setModeHint("single", "单人闯关：已接入关卡列表，可直接在下方选择关卡开始。");
    await renderLevels();
  }

  async function init() {
    initLandingButtons();
    initAppNav();
    initMedia();
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);

    // If already logged in, go straight to app.
    try {
      await bootstrapApp();
    } catch {
      showLanding();
    }
  }

  init();
})();

