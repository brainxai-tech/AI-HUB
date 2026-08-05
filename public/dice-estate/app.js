(function () {
  "use strict";

  const Engine = window.DiceEstateEngine;
  const Difficulty = window.DiceEstateDifficulty;
  const Agents = window.DiceEstateAgents;
  const AudioManager = window.DiceEstateAudio ? window.DiceEstateAudio.createAudioManager() : null;
  const DiceAnimation = window.DiceEstateDiceAnimation;
  const MapLayout = window.DiceEstateMapLayout;
  const PropertyArt = window.DiceEstatePropertyArt;
  const PlayerModels = window.DiceEstatePlayerModels;
  const TradeFlow = window.DiceEstateTradeFlow;
  const PLAYER_CONFIGS = [
    { id: "player", name: "林浩", controller: "human", profileId: "human" },
    { id: "ai_red", name: "陈锋", controller: "ai", profileId: "aggressive" },
    { id: "ai_stone", name: "周岩", controller: "ai", profileId: "conservative" },
    { id: "ai_weaver", name: "苏晴", controller: "ai", profileId: "opportunist" }
  ];
  const SAVE_KEY = "dice-estate-duel-save";
  const SETTINGS_KEY = "dice-estate-duel-settings";
  const PROFILE_KEY = "dice-estate-duel-profile";
  const Onboarding = window.DiceEstateOnboarding;
  const MAP_CELL_X = 140;
  const MAP_CELL_Y = 180;
  const TILE_WIDTH = 116;
  const TILE_HEIGHT = 116;
  const MAP_PADDING = 76;
  const MAP_ZOOM_MIN = 0.6;
  const MAP_ZOOM_MAX = 2.2;
  const MAP_ZOOM_DEFAULT = 1.1;
  const WIDE_GRID_ROUTE = createSnakeGridRoute(70, 10, 7);
  const NARROW_GRID_ROUTE = createSnakeGridRoute(70, 7, 10);
  const refs = {};
  let settings = loadSettings();
  let playerProfile = loadPlayerProfile();
  let state = createConfiguredGame();
  let aiTimer = null;
  let agentInFlight = false;
  let agentRequestController = null;
  let agentGatewayStatus = "Hub GPT · 准备连接";
  let didInitialCenter = false;
  let feedbackTimer = null;
  let activeFeedbackKey = "";
  let dismissedFeedbackKeys = new Set();
  let effectTimer = null;
  let agentSpeechTimer = null;
  let mapResizeFrame = 0;
  let tileDetailDrag = null;
  const presentation = {
    activeView: "action",
    assetOwnerId: "player",
    lastRouteKey: "",
    isAnimating: false,
    rolling: false,
    moving: false,
    displayDice: null,
    dicePhase: "idle",
    diceTick: 0,
    visualPositions: {},
    tileDetailOpen: false,
    tileDetailPosition: null,
    menuOpen: false,
    agentSpeech: null,
    agentFast: false,
    skipAgentShow: false,
    diceRunId: 0,
    resultDismissed: false,
    lastResultKey: "",
    mapMode: "auto",
    mapZoom: MAP_ZOOM_DEFAULT,
    mapLayout: null,
    tradeOpen: false,
    tradePartnerId: "ai_red",
    tradeOfferedTileId: null,
    tradeFeedback: null,
    effects: []
  };

  document.addEventListener("DOMContentLoaded", () => {
    cacheRefs();
    bindEvents();
    applySettings();
    const saved = loadSavedGame();
    if (saved && saved.status === "playing" && saved.version === Engine.GAME_VERSION) {
      state = saved;
      if (repairConfiguredPlayerControllers(state)) saveGame();
    }
    render();
  });

  function createConfiguredGame() {
    const game = Engine.createGame({
      ruleset: settings.ruleset,
      endCondition: Engine.HUMAN_SURVIVAL_END_CONDITION,
      players: PLAYER_CONFIGS
    });
    const difficulty = Difficulty.normalizeDifficulty(settings.agentDifficulty);
    game.agentDifficulty = difficulty;
    game.agentDifficultyByPlayer = Object.fromEntries(
      game.players.filter((player) => !Agents.isHuman(player)).map((player) => [player.id, difficulty])
    );
    return game;
  }

  function repairConfiguredPlayerControllers(game) {
    if (!game || !Array.isArray(game.players)) return false;
    const configById = new Map(PLAYER_CONFIGS.map((config) => [config.id, config]));
    const difficulty = Difficulty.normalizeDifficulty(game.agentDifficulty || settings.agentDifficulty);
    let changed = false;

    if (game.endCondition !== Engine.HUMAN_SURVIVAL_END_CONDITION) changed = true;
    game.endCondition = Engine.HUMAN_SURVIVAL_END_CONDITION;

    game.players.forEach((player) => {
      const config = configById.get(player.id);
      const controller = player.id === "player" ? "human" : "ai";
      const profileId = config ? config.profileId : player.profileId || (controller === "human" ? "human" : player.id);
      if (player.controller !== controller || player.type !== controller || player.profileId !== profileId) changed = true;
      player.controller = controller;
      player.type = controller;
      player.profileId = profileId;
    });

    const difficultyByPlayer = Object.fromEntries(
      game.players.filter((player) => !Agents.isHuman(player)).map((player) => [player.id, difficulty])
    );
    if (JSON.stringify(game.agentDifficultyByPlayer || {}) !== JSON.stringify(difficultyByPlayer)) changed = true;
    game.agentDifficulty = difficulty;
    game.agentDifficultyByPlayer = difficultyByPlayer;
    return changed;
  }

  function humanPlayer() {
    return Engine.getPlayer(state, "player") || state.players.find((player) => Agents.isHuman(player));
  }

  function playerAppearance(player) {
    if (!player || Agents.isHuman(player)) {
      return { color: "#167f8f", pieceColorLabel: "青蓝", shortLabel: "林", pawnLabel: "林", emblem: "✦", seatKey: "player" };
    }
    const profile = Agents.getProfile(player.profileId);
    const identity = {
      aggressive: { emblem: "▲", pawnLabel: "陈", pieceColorLabel: "朱红", seatKey: "red" },
      conservative: { emblem: "⬟", pawnLabel: "周", pieceColorLabel: "岩蓝", seatKey: "stone" },
      opportunist: { emblem: "⌘", pawnLabel: "苏", pieceColorLabel: "紫色", seatKey: "weaver" }
    }[player.profileId] || { emblem: "◆", pawnLabel: String(player.name || "代").slice(0, 1), pieceColorLabel: "深色", seatKey: "agent" };
    return { color: profile.color, shortLabel: profile.shortLabel, ...identity };
  }

  function pawnModelHtml(appearance) {
    const ownerFlag = escapeHtml(String(appearance.pawnLabel || appearance.shortLabel || "?").slice(0, 1));
    const modelSpec = PlayerModels && PlayerModels.getModelSpec(appearance.seatKey);
    if (modelSpec && modelSpec.imagePath) {
      return `<span class="pawn-name pawn-name-image" aria-hidden="true">${ownerFlag}</span><span class="pawn-model pawn-model-image" data-player-model="${escapeHtml(modelSpec.modelKey)}" aria-hidden="true"><img class="pawn-character-art" src="${escapeHtml(modelSpec.imagePath)}" alt="" decoding="async" draggable="false" /></span>`;
    }
    if (modelSpec) {
      return `<span class="pawn-name" aria-hidden="true">${ownerFlag}</span><span class="pawn-model" data-player-model="${escapeHtml(modelSpec.modelKey)}" aria-hidden="true"><span class="pawn-body"></span><span class="pawn-gear pawn-gear-primary"></span><span class="pawn-gear pawn-gear-secondary"></span><span class="pawn-emblem">${escapeHtml(appearance.emblem)}</span></span>`;
    }
    return `<span class="pawn-name" aria-hidden="true">${ownerFlag}</span><span class="pawn-model" aria-hidden="true"><span class="pawn-emblem">${escapeHtml(appearance.emblem)}</span></span>`;
  }

  function mapPawnHtml(appearance) {
    const ownerFlag = escapeHtml(String(appearance.pawnLabel || appearance.shortLabel || "?").slice(0, 1));
    return `
      <span class="map-color-pawn" aria-hidden="true">
        <span class="map-color-pawn-head"></span>
        <span class="map-color-pawn-body"></span>
        <span class="map-color-pawn-base"></span>
        <span class="map-color-pawn-label">${ownerFlag}</span>
      </span>
    `;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cacheRefs() {
    [
      "board",
      "boardViewport",
      "boardStage",
      "mapZoomSlider",
      "mapZoomValue",
      "appShell",
      "round",
      "phase",
      "dice",
      "turn",
      "mobileStatus",
      "menuButton",
      "menuBackdrop",
      "pauseMenu",
      "players",
      "actions",
      "situationPanel",
      "tileDetail",
      "management",
      "log",
      "viewGuide",
      "settingsPanel",
      "resultModal",
      "resultContent",
      "feedbackLayer",
      "resumeButton",
      "tabAction",
      "tabSituation",
      "tabAssets",
      "tabLog",
      "tabRules",
      "tabSettings"
    ].forEach((id) => {
      refs[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    document.body.addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.action;
      const tileId = Number(button.dataset.tileId);
      const index = Number(button.dataset.index);
      const choiceKind = button.dataset.choiceKind;
      if (
        presentation.isAnimating &&
        action !== "close-feedback" &&
        action !== "close-tile-detail" &&
        action !== "switch-view" &&
        action !== "view-player-assets" &&
        action !== "inspect-asset" &&
        action !== "toggle-menu" &&
        action !== "close-menu" &&
        action !== "toggle-agent-speed" &&
        action !== "skip-agent-show" &&
        action !== "restart-tutorial" &&
        action !== "new-game" &&
        action !== "set-map-mode" &&
        action !== "adjust-map-zoom" &&
        action !== "reset-map-zoom"
      )
        return;

      recordOnboardingAction(action);

      if (action === "set-map-mode") {
        setMapMode(button.dataset.mapMode);
      } else if (action === "adjust-map-zoom") {
        setMapZoom(presentation.mapZoom + Number(button.dataset.zoomDelta || 0));
      } else if (action === "reset-map-zoom") {
        setMapZoom(MAP_ZOOM_DEFAULT);
      } else if (action === "view-player-assets") {
        const player = Engine.getPlayer(state, button.dataset.playerId);
        if (!player) return;
        presentation.assetOwnerId = player.id;
        presentation.tradeOpen = false;
        presentation.tradeFeedback = null;
        presentation.tradeOfferedTileId = null;
        renderManagement();
      } else if (action === "restart-tutorial") {
        restartTutorial();
      } else if (action === "new-game") {
        if (state.status === "playing" && !window.confirm("重新开始会覆盖当前对局进度，确定继续吗？")) return;
        newGame();
      } else if (action === "resume") {
        resumeGame();
      } else if (action === "switch-view") {
        switchView(button.dataset.view);
      } else if (action === "toggle-menu") {
        toggleMenu();
      } else if (action === "close-menu") {
        closeMenu();
      } else if (action === "toggle-agent-speed") {
        presentation.agentFast = !presentation.agentFast;
        presentation.skipAgentShow = false;
        renderActions();
      } else if (action === "skip-agent-show") {
        presentation.agentFast = true;
        presentation.skipAgentShow = true;
        presentation.agentSpeech = null;
        render();
      } else if (action === "close-result") {
        presentation.resultDismissed = true;
        renderResult();
      } else if (action === "roll") {
        rollWithAnimation();
      } else if (action === "buy") {
        withEconomyEffects(() => Engine.buyProperty(state, state.pending.tileId, "player"));
      } else if (action === "auction-start") {
        withEconomyEffects(() => Engine.startAuction(state, state.pending.tileId, "player"));
      } else if (action === "submit-bid") {
        const bidInput = document.getElementById("bidInput");
        withEconomyEffects(() => Engine.placeAuctionBid(state, "player", bidInput ? bidInput.value : 0));
      } else if (action === "auction-pass") {
        withEconomyEffects(() => Engine.passAuction(state, "player"));
      } else if (action === "choice") {
        withEconomyEffects(() => Engine.resolveChoice(state, index));
      } else if (action === "tax-choice") {
        withEconomyEffects(() => Engine.resolveTaxChoice(state, choiceKind));
      } else if (action === "demand-rent") {
        withEconomyEffects(() => Engine.demandRent(state, "player"));
      } else if (action === "waive-rent") {
        withEconomyEffects(() => Engine.waiveRent(state, "player"));
      } else if (action === "control-pay") {
        withEconomyEffects(() => Engine.payControlFee(state, "player"));
      } else if (action === "control-pass") {
        withEconomyEffects(() => Engine.useControlPass(state, "player"));
      } else if (action === "control-roll") {
        controlRollWithAnimation("player");
      } else if (action === "end-turn") {
        withEconomyEffects(() => Engine.endTurn(state));
      } else if (action === "select-tile") {
        selectTile(tileId);
      } else if (action === "inspect-asset") {
        presentation.activeView = "action";
        selectTile(tileId);
      } else if (action === "build") {
        withEconomyEffects(() => Engine.buildHouse(state, tileId, "player"));
      } else if (action === "sell") {
        withEconomyEffects(() => Engine.sellHouse(state, tileId, "player"));
      } else if (action === "mortgage") {
        withEconomyEffects(() => Engine.mortgageProperty(state, tileId, "player"));
      } else if (action === "redeem") {
        withEconomyEffects(() => Engine.redeemProperty(state, tileId, "player"));
      } else if (action === "open-trade") {
        openTradeComposer(Number.isInteger(tileId) ? tileId : null);
      } else if (action === "close-trade") {
        presentation.tradeOpen = false;
        presentation.tradeFeedback = null;
        renderManagement();
      } else if (action === "submit-trade") {
        submitTradeProposal();
      } else if (action === "trade-ai") {
        withEconomyEffects(() => Engine.sellPropertyToAi(state, tileId));
      } else if (action === "trade-pass-ai") {
        withEconomyEffects(() => Engine.sellControlPassToAi(state));
      } else if (action === "auto-debt") {
        withEconomyEffects(() => Engine.autoResolveDebt(state, "player"));
      } else if (action === "clear-save") {
        clearSavedGame();
      } else if (action === "reset-settings") {
        resetSettings();
      } else if (action === "close-feedback") {
        clearFeedback();
      } else if (action === "close-tile-detail") {
        hideTileDetail();
      }
    });

    const boardWrap = refs.boardViewport ? refs.boardViewport.closest(".board-wrap") : null;
    if (boardWrap) {
      boardWrap.addEventListener("click", (event) => {
        if (
          event.target.closest(".tile") ||
          event.target.closest("#tileDetail") ||
          event.target.closest("[data-action]")
        ) {
          return;
        }
        hideTileDetail();
      });
    }

    document.body.addEventListener("change", (event) => {
      const tradeControl = event.target.closest("[data-trade-field]");
      if (tradeControl) {
        if (tradeControl.dataset.tradeField === "partner") {
          presentation.tradePartnerId = tradeControl.value;
          presentation.tradeFeedback = null;
          renderManagement();
        }
        return;
      }
      const profileControl = event.target.closest("[data-profile-setting]");
      if (profileControl) {
        if (profileControl.dataset.profileSetting === "tutorialEnabled") {
          playerProfile.tutorialEnabled = Boolean(profileControl.checked);
          savePlayerProfile();
          render();
        }
        return;
      }
      const control = event.target.closest("[data-setting]");
      if (!control) return;
      updateSetting(control.dataset.setting, control.type === "checkbox" ? control.checked : control.value);
    });

    if (refs.mapZoomSlider) {
      refs.mapZoomSlider.addEventListener("input", () => {
        setMapZoom(Number(refs.mapZoomSlider.value) / 100);
      });
    }

    window.addEventListener("resize", handleMapResize);
    if (refs.boardViewport) {
      refs.boardViewport.addEventListener("scroll", positionMapDetail, { passive: true });
      bindMapDragging(refs.boardViewport);
    }
    if (refs.tileDetail) bindTileDetailDragging(refs.tileDetail);
    document.addEventListener("keydown", handleMenuKeydown);
    document.addEventListener("pointerdown", () => AudioManager && AudioManager.unlock(), { once: true, passive: true });
  }

  function recordOnboardingAction(action) {
    if (!Onboarding || !playerProfile.tutorialEnabled || playerProfile.tutorialCompleted) return;
    playerProfile.tutorialProgress = Onboarding.recordAction(playerProfile.tutorialProgress, action);
    playerProfile.tutorialCompleted = Onboarding.isComplete(playerProfile.tutorialProgress);
    savePlayerProfile();
  }

  function setMapMode(mode) {
    if (!MapLayout || !["overview", "focus"].includes(mode)) return;
    presentation.mapMode = mode;
    applyMapPresentation({ recenter: mode === "focus" });
  }

  function captureMapViewAnchor(anchorClient) {
    const viewport = refs.boardViewport;
    const layout = presentation.mapLayout;
    if (!viewport || !layout || layout.mode !== "focus") return null;
    const rect = viewport.getBoundingClientRect();
    const anchorX = anchorClient && Number.isFinite(anchorClient.clientX)
      ? Math.max(0, Math.min(viewport.clientWidth, anchorClient.clientX - rect.left))
      : viewport.clientWidth / 2;
    const anchorY = anchorClient && Number.isFinite(anchorClient.clientY)
      ? Math.max(0, Math.min(viewport.clientHeight, anchorClient.clientY - rect.top))
      : viewport.clientHeight / 2;
    return {
      anchorX,
      anchorY,
      boardX: (viewport.scrollLeft + anchorX - layout.contentOffsetX) / layout.scale,
      boardY: (viewport.scrollTop + anchorY - layout.contentOffsetY) / layout.scale
    };
  }

  function setMapZoom(scale, anchorClient) {
    if (!Number.isFinite(scale)) return;
    const viewAnchor = captureMapViewAnchor(anchorClient);
    presentation.mapZoom = Math.max(MAP_ZOOM_MIN, Math.min(MAP_ZOOM_MAX, scale));
    presentation.mapMode = "focus";
    applyMapPresentation({ viewAnchor, recenter: !viewAnchor });
  }

  function automaticMapMode() {
    return "focus";
  }

  function bindMapDragging(viewport) {
    let drag = null;
    let suppressClick = false;

    viewport.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch" || event.button !== 0 || presentation.mapLayout?.mode !== "focus") return;
      if (event.target.closest(".map-detail-panel, input, button:not(.tile)")) return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        moved: false
      };
      viewport.classList.add("is-drag-ready");
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;
      if (!drag.moved) {
        drag.moved = true;
        suppressClick = true;
        viewport.setPointerCapture(event.pointerId);
      }
      viewport.classList.remove("is-drag-ready");
      viewport.classList.add("is-dragging");
      viewport.scrollLeft = drag.scrollLeft - deltaX;
      viewport.scrollTop = drag.scrollTop - deltaY;
      event.preventDefault();
    });

    const finishDrag = (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      drag = null;
      viewport.classList.remove("is-drag-ready", "is-dragging");
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
    };

    viewport.addEventListener("pointerup", finishDrag);
    viewport.addEventListener("pointercancel", finishDrag);
    viewport.addEventListener("click", (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
    });
    viewport.addEventListener("wheel", (event) => {
      if ((!event.ctrlKey && !event.metaKey) || presentation.mapLayout?.mode !== "focus") return;
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      setMapZoom(presentation.mapZoom * zoomFactor, { clientX: event.clientX, clientY: event.clientY });
    }, { passive: false });
    viewport.addEventListener("keydown", (event) => {
      if (["+", "="].includes(event.key)) {
        event.preventDefault();
        setMapZoom(presentation.mapZoom + 0.1);
      } else if (event.key === "-") {
        event.preventDefault();
        setMapZoom(presentation.mapZoom - 0.1);
      } else if (event.key === "0") {
        event.preventDefault();
        setMapZoom(MAP_ZOOM_DEFAULT);
      }
    });
  }

  function bindTileDetailDragging(panel) {
    panel.addEventListener("pointerdown", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (panel.hidden || !target || !target.closest(".map-detail-drag-handle")) return;
      if (target.closest(".map-detail-close")) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      positionMapDetail();
      const rect = panel.getBoundingClientRect();
      tileDetailDrag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      presentation.tileDetailPosition = { left: rect.left, top: rect.top };
      panel.setPointerCapture(event.pointerId);
      panel.classList.add("is-dragging");
      event.preventDefault();
    });

    panel.addEventListener("pointermove", (event) => {
      if (!tileDetailDrag || event.pointerId !== tileDetailDrag.pointerId) return;
      presentation.tileDetailPosition = clampTileDetailPosition(
        event.clientX - tileDetailDrag.offsetX,
        event.clientY - tileDetailDrag.offsetY
      );
      applyTileDetailPosition();
      event.preventDefault();
    });

    const finishDrag = (event) => {
      if (!tileDetailDrag || event.pointerId !== tileDetailDrag.pointerId) return;
      if (panel.hasPointerCapture(event.pointerId)) panel.releasePointerCapture(event.pointerId);
      tileDetailDrag = null;
      panel.classList.remove("is-dragging");
    };

    panel.addEventListener("pointerup", finishDrag);
    panel.addEventListener("pointercancel", finishDrag);
    panel.addEventListener("keydown", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(".map-detail-drag-grip")) return;
      if (event.key === "Home") {
        event.preventDefault();
        presentation.tileDetailPosition = null;
        positionMapDetail();
        return;
      }
      const delta = event.shiftKey ? 32 : 12;
      const offsets = {
        ArrowLeft: [-delta, 0],
        ArrowRight: [delta, 0],
        ArrowUp: [0, -delta],
        ArrowDown: [0, delta]
      };
      const offset = offsets[event.key];
      if (!offset) return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const current = presentation.tileDetailPosition || { left: rect.left, top: rect.top };
      presentation.tileDetailPosition = clampTileDetailPosition(current.left + offset[0], current.top + offset[1]);
      applyTileDetailPosition();
    });
    panel.addEventListener("toggle", (event) => {
      if (!(event.target instanceof Element) || !event.target.matches(".deed-economy")) return;
      window.requestAnimationFrame(positionMapDetail);
    }, true);
  }

  function handleMapResize() {
    if (mapResizeFrame) window.cancelAnimationFrame(mapResizeFrame);
    mapResizeFrame = window.requestAnimationFrame(() => {
      mapResizeFrame = 0;
      if (refs.board && refs.board.dataset.gridVariant !== compactGridVariant()) {
        renderBoard();
      } else {
        applyMapPresentation({ recenter: true });
      }
      positionMapDetail();
    });
  }

  function withEconomyEffects(mutator) {
    const before = captureEconomySnapshot();
    mutator();
    enqueueEconomyEffects(before);
    afterAction();
  }

  function afterAction() {
    routeToRecommendedView();
    saveGame();
    render();
    centerSelectedTile(settings.reduceMotion ? "auto" : "smooth");
  }

  function afterAnimatedAction() {
    routeToRecommendedView();
    saveGame();
    render();
    centerSelectedTile(settings.reduceMotion ? "auto" : "smooth");
  }

  function rollWithAnimation() {
    if (presentation.isAnimating || state.status !== "playing" || state.phase !== "ready") return;
    const active = Engine.getActivePlayer(state);
    if (!active) return;
    if (!DiceAnimation) {
      const before = captureEconomySnapshot();
      Engine.rollActivePlayer(state);
      enqueueEconomyEffects(before);
      afterAnimatedAction();
      return;
    }
    animateRollAction(active.id, () => Engine.rollActivePlayer(state));
  }

  function controlRollWithAnimation(playerId) {
    if (presentation.isAnimating || state.status !== "playing" || state.phase !== "control") return;
    if (!DiceAnimation) {
      const before = captureEconomySnapshot();
      Engine.rollForControlRelease(state, playerId);
      enqueueEconomyEffects(before);
      afterAnimatedAction();
      return;
    }
    animateRollAction(playerId, () => Engine.rollForControlRelease(state, playerId));
  }

  async function animateRollAction(rollingPlayerId, rollAction) {
    const active = Engine.getPlayer(state, rollingPlayerId);
    if (!active || !DiceAnimation) return;
    const playerId = active.id;
    const startPosition = active.position;
    const previousMovePath = state.lastMovePath;
    const runId = ++presentation.diceRunId;
    const timeline = DiceAnimation.createDiceTimeline({
      reduceMotion: settings.reduceMotion,
      motionScale: motionScale()
    });
    presentation.isAnimating = true;
    presentation.rolling = true;
    presentation.moving = false;
    presentation.dicePhase = "windup";
    presentation.diceTick = 0;
    presentation.displayDice = state.lastDice ? state.lastDice.slice() : [1, 1];
    presentation.visualPositions[playerId] = startPosition;
    clearAiTimer();
    applyDiceMotionVariables(timeline);
    if (AudioManager) AudioManager.play("roll");
    render();

    const completed = await DiceAnimation.playDiceTimeline(timeline, {
      onFrame: applyDicePreviewFrame,
      wait: waitForAnimation,
      shouldContinue: () => presentation.diceRunId === runId
    });
    if (!completed) return;

    const before = captureEconomySnapshot();
    rollAction();
    enqueueEconomyEffects(before);
    const path =
      state.lastMovePath !== previousMovePath && Array.isArray(state.lastMovePath)
        ? state.lastMovePath.slice()
        : [];
    presentation.displayDice = state.lastDice ? state.lastDice.slice() : null;
    presentation.rolling = false;
    presentation.dicePhase = "settle";
    if (AudioManager) AudioManager.play("settle");
    if (AudioManager && DiceAnimation.isDouble(state.lastDice)) AudioManager.play("double");
    render();
    await waitForAnimation(timeline.resultHoldMs);
    if (presentation.diceRunId === runId) finishRollAnimation(playerId, path);
  }

  function waitForAnimation(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function applyDiceMotionVariables(timeline) {
    const root = document.documentElement;
    root.style.setProperty("--dice-tumble-speed", `${timeline.tumbleCycleMs}ms`);
    root.style.setProperty("--dice-land-duration", `${timeline.settleMotionMs}ms`);
    root.style.setProperty("--dice-glint-duration", `${timeline.glintMs}ms`);
  }

  function finishRollAnimation(playerId, path) {
    presentation.dicePhase = "idle";
    presentation.diceTick = 0;
    if (!path.length) {
      delete presentation.visualPositions[playerId];
      presentation.isAnimating = false;
      presentation.displayDice = null;
      afterAnimatedAction();
      return;
    }
    animateMovePath(playerId, path);
  }

  function animateMovePath(playerId, path) {
    presentation.moving = true;
    let index = 0;
    const step = () => {
      if (index >= path.length) {
        delete presentation.visualPositions[playerId];
        presentation.moving = false;
        presentation.isAnimating = false;
        presentation.displayDice = null;
        presentation.dicePhase = "idle";
        presentation.diceTick = 0;
        afterAnimatedAction();
        return;
      }
      const tileId = path[index];
      presentation.visualPositions[playerId] = tileId;
      state.selectedTileId = tileId;
      if (AudioManager) AudioManager.play("step");
      render();
      centerSelectedTile(settings.reduceMotion ? "auto" : "smooth");
      index += 1;
      window.setTimeout(step, motionMs(150));
    };
    step();
  }

  function captureEconomySnapshot() {
    return {
      players: Object.fromEntries(state.players.map((player) => [player.id, { cash: player.cash, status: player.status }])),
      tiles: Object.fromEntries(
        state.tiles
          .filter((tile) => Engine.isPurchasableTile(tile))
          .map((tile) => [tile.id, { houseLevel: tile.houseLevel, ownerId: tile.ownerId }])
      ),
      latestLogId: state.logs && state.logs[0] ? state.logs[0].id : null
    };
  }

  function enqueueEconomyEffects(before) {
    if (!before) return;
    const effects = [];
    const cashChanges = [];
    state.players.forEach((player) => {
      const previous = before.players[player.id];
      if (!previous) return;
      const delta = player.cash - previous.cash;
      if (delta !== 0) {
        cashChanges.push({ playerId: player.id, delta });
        effects.push({
          id: `money-${Date.now()}-${player.id}-${Math.random()}`,
          type: "money",
          playerId: player.id,
          delta,
          text: `${delta > 0 ? "+" : "-"}${money(Math.abs(delta))}`,
          tone: delta > 0 ? "gain" : "loss"
        });
      }
      if (previous.status !== "eliminated" && player.status === "eliminated") {
        effects.push({
          id: `eliminate-${Date.now()}-${player.id}`,
          type: "elimination",
          playerId: player.id,
          text: `${player.name} 淘汰`
        });
      }
    });

    const payers = cashChanges.filter((change) => change.delta < 0);
    const receivers = cashChanges.filter((change) => change.delta > 0);
    if (payers.length === 1 && receivers.length === 1 && Math.abs(payers[0].delta) === receivers[0].delta) {
      effects.push({
        id: `transfer-${Date.now()}`,
        type: "transfer",
        fromPlayerId: payers[0].playerId,
        toPlayerId: receivers[0].playerId,
        amount: receivers[0].delta
      });
    }

    state.tiles.forEach((tile) => {
      const previous = before.tiles[tile.id];
      if (!previous || !Engine.isPurchasableTile(tile)) return;
      if (previous.ownerId !== tile.ownerId && tile.ownerId) {
        effects.push({
          id: `claim-${Date.now()}-${tile.id}`,
          type: "claim",
          tileId: tile.id,
          ownerId: tile.ownerId,
          text: previous.ownerId ? "地契易主" : "地契入手"
        });
      }
      const delta = tile.houseLevel - previous.houseLevel;
      if (delta > 0) {
        effects.push({
          id: `build-${Date.now()}-${tile.id}-${Math.random()}`,
          type: "build",
          tileId: tile.id,
          level: tile.houseLevel,
          text: isLandmarkBuilt(tile) ? "地标完成" : `+${delta} 栋`
        });
      } else if (delta < 0) {
        effects.push({
          id: `sell-${Date.now()}-${tile.id}-${Math.random()}`,
          type: "build",
          tileId: tile.id,
          level: tile.houseLevel,
          text: `${delta} 栋`
        });
      }
    });

    const latestLog = state.logs && state.logs[0];
    if (latestLog && latestLog.id !== before.latestLogId && /竞拍|拍卖|出价/.test(latestLog.message || "")) {
      effects.push({
        id: `auction-${Date.now()}-${latestLog.id}`,
        type: "auction",
        text: latestLog.message
      });
    }

    if (!effects.length) return;
    presentation.effects = presentation.effects.concat(effects).slice(-24);
    playEconomyEffectSound(effects);
    scheduleEffectCleanup();
  }

  function playEconomyEffectSound(effects) {
    if (!AudioManager) return;
    if (effects.some((effect) => effect.type === "elimination")) AudioManager.play("eliminate");
    else if (effects.some((effect) => effect.type === "build")) AudioManager.play("build");
    else if (effects.some((effect) => effect.type === "claim")) AudioManager.play("purchase");
    else if (effects.some((effect) => effect.type === "auction")) AudioManager.play("auction");
    else if (effects.some((effect) => effect.type === "transfer")) AudioManager.play("coins");
  }

  function scheduleEffectCleanup() {
    if (effectTimer) window.clearTimeout(effectTimer);
    effectTimer = window.setTimeout(() => {
      effectTimer = null;
      presentation.effects = [];
      render();
    }, motionMs(2100));
  }

  function resetPresentation() {
    presentation.diceRunId += 1;
    presentation.activeView = "action";
    presentation.assetOwnerId = "player";
    presentation.lastRouteKey = "";
    presentation.isAnimating = false;
    presentation.rolling = false;
    presentation.moving = false;
    presentation.dicePhase = "idle";
    presentation.diceTick = 0;
    presentation.displayDice = null;
    presentation.visualPositions = {};
    presentation.tileDetailOpen = false;
    presentation.tileDetailPosition = null;
    presentation.menuOpen = false;
    presentation.agentSpeech = null;
    presentation.agentFast = false;
    presentation.skipAgentShow = false;
    presentation.resultDismissed = false;
    presentation.lastResultKey = "";
    presentation.effects = [];
    if (effectTimer) window.clearTimeout(effectTimer);
    effectTimer = null;
    if (agentSpeechTimer) window.clearTimeout(agentSpeechTimer);
    agentSpeechTimer = null;
  }

  function toggleMenu() {
    presentation.menuOpen = !presentation.menuOpen;
    if (presentation.menuOpen && presentation.tileDetailOpen) {
      presentation.tileDetailOpen = false;
      renderTileDetail();
    }
    renderViewChrome();
    if (presentation.menuOpen) {
      window.setTimeout(() => {
        const target = refs.pauseMenu && refs.pauseMenu.querySelector(".view-tab.is-active, button:not([disabled])");
        if (target) target.focus();
      }, 0);
    } else if (refs.menuButton) {
      refs.menuButton.focus();
    }
  }

  function closeMenu(restoreFocus = true) {
    if (!presentation.menuOpen) return;
    presentation.menuOpen = false;
    renderViewChrome();
    if (restoreFocus && refs.menuButton) refs.menuButton.focus();
  }

  function handleMenuKeydown(event) {
    if (!presentation.menuOpen || !refs.pauseMenu) {
      if (event.key === "Escape" && presentation.tileDetailOpen) {
        event.preventDefault();
        hideTileDetail();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(refs.pauseMenu.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function switchView(view) {
    const allowed = new Set(["action", "situation", "assets", "log", "rules", "settings"]);
    if (!allowed.has(view)) return;
    const restoreMenuFocus = presentation.menuOpen;
    presentation.menuOpen = false;
    presentation.activeView = view;
    presentation.lastRouteKey = currentRouteKey();
    renderViewChrome();
    if (restoreMenuFocus && refs.menuButton) refs.menuButton.focus();
    if (view === "action") {
      window.setTimeout(() => centerSelectedTile(settings.reduceMotion ? "auto" : "smooth"), 0);
    }
  }

  function newGame() {
    clearAiTimer();
    state = createConfiguredGame();
    didInitialCenter = false;
    dismissedFeedbackKeys = new Set();
    resetPresentation();
    saveGame();
    render();
  }

  function resumeGame() {
    const saved = loadSavedGame();
    if (saved && saved.version === Engine.GAME_VERSION) {
      clearAiTimer();
      state = saved;
      if (repairConfiguredPlayerControllers(state)) saveGame();
      didInitialCenter = false;
      resetPresentation();
      render();
    }
  }

  function saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, Engine.serialize(state));
    } catch (error) {
      console.warn("Save failed", error);
    }
  }

  function loadSavedGame() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (parsed && parsed.version !== Engine.GAME_VERSION) return null;
      const hydrated = parsed ? Engine.hydrate(parsed) : null;
      return hydrated && hydrated.version === Engine.GAME_VERSION ? hydrated : null;
    } catch (error) {
      console.warn("Resume failed", error);
      return null;
    }
  }

  function defaultSettings() {
    return {
      ruleset: Engine.STANDARD_RULESET,
      agentDifficulty: Difficulty.DEFAULT_DIFFICULTY,
      agentMode: "hub",
      animationSpeed: "normal",
      reduceMotion: false,
      muted: false
    };
  }

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      const next = Object.assign(defaultSettings(), parsed || {});
      next.agentMode = "hub";
      return next;
    } catch (error) {
      console.warn("Settings load failed", error);
      return defaultSettings();
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn("Settings save failed", error);
    }
  }

  function defaultPlayerProfile() {
    return { tutorialEnabled: true, tutorialCompleted: false, tutorialProgress: {} };
  }

  function loadPlayerProfile() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      return Object.assign(defaultPlayerProfile(), parsed || {}, {
        tutorialProgress: parsed && parsed.tutorialProgress ? parsed.tutorialProgress : {}
      });
    } catch (error) {
      console.warn("Profile load failed", error);
      return defaultPlayerProfile();
    }
  }

  function savePlayerProfile() {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(playerProfile));
    } catch (error) {
      console.warn("Profile save failed", error);
    }
  }

  function restartTutorial() {
    playerProfile = defaultPlayerProfile();
    savePlayerProfile();
    render();
  }

  function updateSetting(key, value) {
    if (key === "ruleset") settings.ruleset = value === Engine.SHORT_RULESET ? Engine.SHORT_RULESET : Engine.STANDARD_RULESET;
    if (key === "agentDifficulty") settings.agentDifficulty = Difficulty.normalizeDifficulty(value);
    if (key === "agentMode") settings.agentMode = "hub";
    if (key === "animationSpeed") settings.animationSpeed = value;
    if (key === "reduceMotion") settings.reduceMotion = Boolean(value);
    if (key === "muted") settings.muted = Boolean(value);
    saveSettings();
    applySettings();
    render();
  }

  function resetSettings() {
    settings = defaultSettings();
    saveSettings();
    applySettings();
    render();
  }

  function clearSavedGame() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      console.warn("Save clear failed", error);
    }
    render();
  }

  function motionScale() {
    if (settings.reduceMotion) return 0.01;
    const base = { slow: 1.45, normal: 1, fast: 0.62 }[settings.animationSpeed] || 1;
    const active = Engine.getActivePlayer(state);
    if (active && !Agents.isHuman(active)) {
      if (presentation.skipAgentShow) return Math.min(base, 0.04);
      if (presentation.agentFast) return Math.min(base, 0.42);
    }
    return base;
  }

  function motionMs(base) {
    return Math.max(1, Math.round(base * motionScale()));
  }

  function applySettings() {
    const scale = motionScale();
    const root = document.documentElement;
    root.style.setProperty("--motion-scale", String(scale));
    [
      ["--dice-windup-duration", 110],
      ["--dice-tumble-speed", 360],
      ["--dice-land-duration", 220],
      ["--dice-glint-duration", 240],
      ["--dice-double-duration", 360],
      ["--path-pulse-duration", 1200],
      ["--build-pop-duration", 1350],
      ["--piece-arrive-duration", 220],
      ["--money-rise-duration", 1550],
      ["--feedback-pop-duration", 260]
    ].forEach(([name, duration]) => {
      root.style.setProperty(name, `${motionMs(duration)}ms`);
    });
    root.classList.toggle("is-reduced-motion", settings.reduceMotion);
    if (AudioManager) AudioManager.setMuted(settings.muted);
  }

  function renderViewChrome() {
    if (refs.appShell) refs.appShell.dataset.view = presentation.activeView;
    if (refs.viewGuide) {
      refs.viewGuide.innerHTML = viewGuideHtml();
      refs.viewGuide.classList.toggle("has-tutorial", Boolean(refs.viewGuide.querySelector(".is-tutorial")));
    }
    if (refs.menuButton) {
      refs.menuButton.setAttribute("aria-expanded", presentation.menuOpen ? "true" : "false");
      refs.menuButton.setAttribute("aria-label", presentation.menuOpen ? "关闭游戏菜单" : "打开游戏菜单");
    }
    if (refs.pauseMenu) refs.pauseMenu.hidden = !presentation.menuOpen;
    if (refs.menuBackdrop) refs.menuBackdrop.hidden = !presentation.menuOpen;
    const tabs = [
      ["action", refs.tabAction],
      ["situation", refs.tabSituation],
      ["assets", refs.tabAssets],
      ["log", refs.tabLog],
      ["rules", refs.tabRules],
      ["settings", refs.tabSettings]
    ];
    tabs.forEach(([view, tab]) => {
      if (!tab) return;
      const active = presentation.activeView === view;
      const recommended = recommendedView() === view;
      tab.classList.toggle("is-active", active);
      tab.classList.toggle("is-recommended", !active && recommended);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.setAttribute("aria-current", recommended ? "step" : "false");
    });
  }

  function currentRouteKey() {
    const pending = state.pending || {};
    return [
      state.status,
      state.activePlayerId,
      state.phase,
      pending.type || "",
      pending.tileId ?? "",
      pending.cardId || "",
      pending.playerId || ""
    ].join(":");
  }

  function recommendedView() {
    if (state.status === "game-over") return "log";
    if (state.phase === "rent-demand") return "action";
    if (state.activePlayerId === "player" && state.phase === "debt") return "assets";
    if (
      state.activePlayerId === "player" &&
      ["ready", "purchase", "auction", "choice", "tax-choice", "control"].includes(state.phase)
    ) {
      return "action";
    }
    if (presentation.rolling || presentation.moving) return "action";
    return presentation.activeView;
  }

  function routeToRecommendedView() {
    const key = currentRouteKey();
    if (key === presentation.lastRouteKey) return;
    presentation.lastRouteKey = key;
    const target = recommendedView();
    if (target === "action" || target === "assets") presentation.activeView = target;
  }

  function viewGuideHtml() {
    const tutorial = currentOnboardingStep();
    if (tutorial) {
      return `<div class="guide-card is-tutorial"><strong>首局提示 · ${escapeHtml(tutorial.title)}</strong><span>${escapeHtml(tutorial.body)}</span></div>`;
    }
    const target = recommendedView();
    const message = viewGuideMessage(target);
    const targetLabel = { action: "行动", situation: "局势", assets: "资产", log: "日志", rules: "规则", settings: "设置" }[target] || "行动";
    const hidden = presentation.activeView === target ? " is-current" : "";
    return `
      <div class="guide-card${hidden}">
        <strong>${targetLabel}</strong>
        <span>${message}</span>
        ${presentation.activeView !== target ? `<button data-action="switch-view" data-view="${target}">前往${targetLabel}</button>` : ""}
      </div>
    `;
  }

  function currentOnboardingStep() {
    return Onboarding
      ? Onboarding.getStep({
          state,
          progress: playerProfile.tutorialProgress,
          enabled: playerProfile.tutorialEnabled && !playerProfile.tutorialCompleted
        })
      : null;
  }

  function highlightOnboardingTarget() {
    document.querySelectorAll(".is-tutorial-target").forEach((element) => element.classList.remove("is-tutorial-target"));
    const step = currentOnboardingStep();
    const selector = step ? Onboarding.targetSelector(step) : "";
    const target = selector ? document.querySelector(selector) : null;
    if (target && !target.disabled) target.classList.add("is-tutorial-target");
  }

  function viewGuideMessage(target) {
    const active = Engine.getActivePlayer(state);
    if (state.status === "game-over") return "对局已经结束，可以在日志页回看关键事件。";
    if (presentation.rolling) return "骰子正在滚动，等待结果落定。";
    if (presentation.moving) return "棋子正在移动，落点会决定下一步操作。";
    if (state.phase === "rent-demand" && state.pending && state.pending.ownerId === "player") {
      const tile = Engine.getTile(state, state.pending.tileId);
      const payer = Engine.getPlayer(state, state.pending.payerId);
      return `${payer ? payer.name : "对手"} 落到你的 ${tile.name}，请在行动页要求收租或放弃本次租金。`;
    }
    if (state.phase === "rent-demand") return "Agent 业主正在确认本次收租。";
    if (active && !Agents.isHuman(active)) return `${active.name} 正在行动，可查看地图或日志理解它的决策。`;
    if (state.phase === "ready") return "轮到你了。点击掷骰前进，落点会触发购买、租金或卡牌。";
    if (state.phase === "purchase") return "你落到无人资产，请在行动页选择购买或进入竞拍。";
    if (state.phase === "auction") return "资产正在拍卖，轮到你时可出价或放弃继续竞价。";
    if (state.phase === "choice") return "抽到了卡牌，请选择一个效果继续。";
    if (state.phase === "tax-choice") return `来到所得税格，请选择缴纳固定 ${money(Engine.INCOME_TAX_FIXED_AMOUNT)} 或总资产比例税。`;
    if (state.phase === "control") return `你在交通管制区，可缴纳 ${money(Engine.CONTROL_RELEASE_FEE)} 离开，或尝试掷出对子。`;
    if (state.phase === "debt") return "现金为负，去资产页卖房、抵押或自动清算。";
    if (state.phase === "management") {
      const buildable = Engine.getOwnedProperties(state, "player").filter((tile) => Engine.canBuildOnTile(state, tile.id, "player"));
      if (buildable.length) return `可在资产页继续建房：${buildable.slice(0, 2).map((tile) => tile.name).join("、")}。`;
      return "本回合事件已处理，可以结束回合，或去局势页判断领先与风险。";
    }
    if (target === "situation") return "查看净资产差距、现金安全、建房机会和对手高租风险。";
    return target === "assets" ? "查看地契、建房、卖房、抵押和赎回。" : "选择当前可执行的操作。";
  }

  function render() {
    routeToRecommendedView();
    const activePlayer = Engine.getActivePlayer(state);
    if (activePlayer && Agents.isHuman(activePlayer) && (presentation.agentFast || presentation.skipAgentShow)) {
      presentation.agentFast = false;
      presentation.skipAgentShow = false;
    }
    renderViewChrome();
    renderStatus();
    renderBoard();
    renderPlayers();
    renderActions();
    renderSituation();
    renderTileDetail();
    renderManagement();
    renderLog();
    renderSettings();
    renderResult();
    renderFeedback();
    highlightOnboardingTarget();
    positionMapDetail();
    refs.resumeButton.hidden = !loadSavedGame();
    if (!didInitialCenter) {
      didInitialCenter = true;
      window.setTimeout(() => centerSelectedTile("auto"), 0);
    }
    queueAi();
  }

  function renderStatus() {
    const active = Engine.getActivePlayer(state);
    const roundNumber = state.roundNumber;
    const phaseLabel = phaseText(state.phase);
    refs.round.textContent = `${roundNumber} · 生存制`;
    refs.phase.textContent = phaseLabel;
    refs.turn.textContent = active ? active.name : "-";
    const dice = presentation.displayDice || state.lastDice;
    refs.dice.textContent = dice ? `${dice[0]} + ${dice[1]}` : "--";
    if (refs.mobileStatus) refs.mobileStatus.textContent = `R${roundNumber} · ${active ? active.name : "对局结束"} · ${phaseLabel}`;
  }

  function phaseText(phase) {
    return {
      ready: "等待掷骰",
      purchase: "购买地块",
      auction: "拍卖竞价",
      choice: "事件选择",
      "tax-choice": "税务选择",
      "rent-demand": "要求收租",
      control: "交通管制",
      management: "资产管理",
      debt: "债务处理",
      "game-over": "结算完成"
    }[phase] || phase;
  }

  function renderBoard() {
    const metrics = getMapMetrics();
    refs.board.dataset.gridVariant = compactGridVariant();
    refs.board.style.width = `${metrics.width}px`;
    refs.board.style.height = `${metrics.height}px`;
    refs.board.innerHTML = "";
    refs.board.insertAdjacentHTML("beforeend", routeSvg(metrics));

    state.tiles.forEach((tile) => {
      const button = document.createElement("button");
      const position = tilePixels(tile);
      button.type = "button";
      button.className = tileClass(tile);
      button.dataset.action = "select-tile";
      button.dataset.tileId = tile.id;
      button.dataset.tileType = tile.type;
      button.dataset.colorFamily = tile.groupId || (tile.type === "event" && tile.deck === "chance" ? "chance" : tile.type);
      const gridCoordinate = compactGridCoordinate(tile);
      button.dataset.gridX = gridCoordinate.x;
      button.dataset.gridY = gridCoordinate.y;
      button.dataset.ownerState = tile.ownerId ? "owned" : "bank";
      if (tile.groupId) button.dataset.groupId = tile.groupId;
      button.style.left = `${position.left}px`;
      button.style.top = `${position.top}px`;
      button.setAttribute("aria-label", tileAriaLabel(tile));
      button.setAttribute("aria-controls", "tileDetail");
      button.setAttribute(
        "aria-expanded",
        tile.id === state.selectedTileId && presentation.tileDetailOpen ? "true" : "false"
      );

      const group = tile.groupId ? Engine.GROUPS[tile.groupId] : null;
      if (group) button.style.setProperty("--group-color", group.color);
      if (tile.ownerId) button.style.setProperty("--owner-color", playerAppearance(Engine.getPlayer(state, tile.ownerId)).color);
      button.innerHTML = `
        ${tileFaceHtml(tile, group)}
        <span class="tile-buildings" aria-label="${buildingText(tile)}">${buildingMarks(tile)}</span>
        <span class="tile-owner">${ownerBadge(tile)}</span>
        <span class="pieces">${pieceMarks(tile.id)}</span>
        ${tileEffectMarks(tile.id)}
      `;
      refs.board.appendChild(button);
    });
    refs.board.insertAdjacentHTML("beforeend", worldEffectMarks());
    applyMapPresentation();
  }

  function tileFaceHtml(tile, group) {
    return `
      <span class="tile-topline" aria-hidden="true">
        <span class="tile-index">${String(tile.id + 1).padStart(2, "0")}</span>
        <span class="tile-direction">${tileDirectionArrow(tile)}</span>
      </span>
      <span class="tile-name">${escapeHtml(tile.name)}</span>
      ${Engine.isPurchasableTile(tile) ? `<span class="tile-purchase-price">买入 ${money(tile.price)}</span>` : ""}
      ${tileFunctionMark(tile)}
      ${tile.type === "property" ? `<span class="tile-feature">${escapeHtml(tile.feature || (group && group.strategy) || "地产")}</span>` : ""}
    `;
  }

  function worldEffectMarks() {
    const transfers = presentation.effects.filter((effect) => effect.type === "transfer");
    const auctions = presentation.effects.filter((effect) => effect.type === "auction");
    if (!transfers.length && !auctions.length) return "";
    const selectedTile = Engine.getTile(state, state.selectedTileId);
    const anchor = selectedTile ? tilePixels(selectedTile) : { left: 360, top: 280 };
    const transferHtml = transfers
      .map((effect) => {
        const from = Engine.getPlayer(state, effect.fromPlayerId);
        const to = Engine.getPlayer(state, effect.toPlayerId);
        if (!from || !to) return "";
        const fromAppearance = playerAppearance(from);
        const toAppearance = playerAppearance(to);
        return `
          <span class="board-transfer" style="--from-color:${fromAppearance.color};--to-color:${toAppearance.color};left:${anchor.left + TILE_WIDTH / 2}px;top:${Math.max(16, anchor.top - 28)}px" aria-hidden="true">
            <span class="transfer-seat">${fromAppearance.emblem} ${escapeHtml(from.name)}</span>
            <span class="transfer-coins"><i>●</i><i>●</i><i>●</i></span>
            <strong>${money(effect.amount)}</strong>
            <span class="transfer-seat">${toAppearance.emblem} ${escapeHtml(to.name)}</span>
          </span>
        `;
      })
      .join("");
    const auctionHtml = auctions
      .map((effect, index) => `
        <span class="board-auction" style="left:${anchor.left + TILE_WIDTH / 2}px;top:${anchor.top + TILE_HEIGHT + 10 + index * 8}px" aria-hidden="true">
          <span class="auction-chips">${state.players.map((player) => `<i style="--chip-color:${playerAppearance(player).color}">${playerAppearance(player).emblem}</i>`).join("")}</span>
          <strong>竞价进行中</strong>
        </span>
      `)
      .join("");
    return transferHtml + auctionHtml;
  }

  function getMapMetrics() {
    const coordinates = state.tiles.map(compactGridCoordinate);
    const maxX = Math.max(...coordinates.map((point) => point.x));
    const maxY = Math.max(...coordinates.map((point) => point.y));
    return {
      width: MAP_PADDING * 2 + maxX * MAP_CELL_X + TILE_WIDTH,
      height: MAP_PADDING * 2 + maxY * MAP_CELL_Y + TILE_HEIGHT
    };
  }

  function applyMapPresentation(options = {}) {
    if (!MapLayout || !refs.board || !refs.boardStage || !refs.boardViewport) return;
    const metrics = getMapMetrics();
    const requestedMode = presentation.mapMode === "auto" ? automaticMapMode() : presentation.mapMode;
    const layout = MapLayout.createMapPresentation({
      viewportWidth: window.innerWidth,
      containerWidth: refs.boardViewport.clientWidth,
      containerHeight: refs.boardViewport.clientHeight,
      mapWidth: metrics.width,
      mapHeight: metrics.height,
      requestedMode,
      focusScale: presentation.mapZoom
    });
    presentation.mapLayout = layout;
    refs.boardViewport.dataset.mapMode = layout.mode;
    refs.boardViewport.dataset.detailLevel = layout.detailLevel;
    refs.boardStage.style.width = `${layout.stageWidth}px`;
    refs.boardStage.style.height = `${layout.stageHeight}px`;
    refs.board.style.left = `${layout.contentOffsetX}px`;
    refs.board.style.top = `${layout.contentOffsetY}px`;
    refs.board.style.transformOrigin = "0 0";
    refs.board.style.transform = `scale(${layout.scale})`;
    const mapPieceScale = Math.min(3.2, Math.max(1, 1 / layout.scale));
    refs.board.style.setProperty("--map-piece-width", `${28 * mapPieceScale}px`);
    refs.board.style.setProperty("--map-piece-height", `${38 * mapPieceScale}px`);
    refs.board.style.setProperty("--map-piece-overlap", `${-7 * mapPieceScale}px`);
    refs.board.style.setProperty("--map-pawn-label-size", `${16 * mapPieceScale}px`);
    refs.board.style.setProperty("--map-pawn-label-font", `${0.52 * mapPieceScale}rem`);
    refs.board.style.setProperty("--map-pawn-label-offset", `${-6 * mapPieceScale}px`);
    document.querySelectorAll('[data-action="set-map-mode"]').forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.mapMode === layout.mode ? "true" : "false");
    });
    if (refs.mapZoomSlider) {
      refs.mapZoomSlider.disabled = layout.mode === "overview";
      refs.mapZoomSlider.value = String(Math.round(presentation.mapZoom * 100));
    }
    if (refs.mapZoomValue) refs.mapZoomValue.textContent = layout.mode === "overview"
      ? `全图 ${Math.round(layout.scale * 100)}%`
      : `${Math.round(layout.scale * 100)}%`;
    if (layout.mode === "overview") {
      refs.boardViewport.scrollTo({ left: 0, top: 0, behavior: "auto" });
    }
    if (options.viewAnchor && layout.mode === "focus") {
      refs.boardViewport.scrollTo({
        left: layout.contentOffsetX + options.viewAnchor.boardX * layout.scale - options.viewAnchor.anchorX,
        top: layout.contentOffsetY + options.viewAnchor.boardY * layout.scale - options.viewAnchor.anchorY,
        behavior: "auto"
      });
    } else if (options.recenter && layout.mode === "focus") {
      window.requestAnimationFrame(() => centerSelectedTile("auto"));
    }
  }

  function tilePixels(tile) {
    const coordinate = compactGridCoordinate(tile);
    return {
      left: MAP_PADDING + coordinate.x * MAP_CELL_X,
      top: MAP_PADDING + coordinate.y * MAP_CELL_Y
    };
  }

  function createSnakeGridRoute(count, columns, rows) {
    const route = [];
    for (let y = rows - 1; y >= 0 && route.length < count; y -= 1) {
      const rowFromBottom = rows - 1 - y;
      if (rowFromBottom % 2 === 0) {
        for (let x = 0; x < columns && route.length < count; x += 1) route.push({ x, y });
      } else {
        for (let x = columns - 1; x >= 0 && route.length < count; x -= 1) route.push({ x, y });
      }
    }
    return route;
  }

  function compactGridVariant() {
    return window.matchMedia("(max-width: 599px)").matches ? "narrow" : "wide";
  }

  function compactGridRoute() {
    return compactGridVariant() === "narrow" ? NARROW_GRID_ROUTE : WIDE_GRID_ROUTE;
  }

  function compactGridCoordinate(tile) {
    return compactGridRoute()[tile.id] || { x: tile.x || 0, y: tile.y || 0 };
  }

  function tileDirectionArrow(tile) {
    const route = compactGridRoute();
    const current = route[tile.id];
    if (tile.id === route.length - 1) return "↺";
    const next = route[(tile.id + 1) % route.length];
    if (!current || !next) return "·";
    if (next.x > current.x) return "→";
    if (next.x < current.x) return "←";
    if (next.y > current.y) return "↓";
    return "↑";
  }

  function tileCenter(tile) {
    const position = tilePixels(tile);
    return {
      x: position.left + TILE_WIDTH / 2,
      y: position.top + TILE_HEIGHT / 2
    };
  }

  function routeSvg(metrics) {
    const points = state.tiles.map(tileCenter);
    const pointText = points.map((point) => `${point.x},${point.y}`).join(" ");
    const gapArrows = routeGapArrowMarks(points);
    const recentTiles = Array.isArray(state.lastMovePath)
      ? state.lastMovePath.map((tileId) => Engine.getTile(state, tileId)).filter(Boolean)
      : [];
    const recentText = recentTiles
      .map((tile) => {
        const point = tileCenter(tile);
        return `${point.x},${point.y}`;
      })
      .join(" ");
    return `
      <svg class="route-svg" width="${metrics.width}" height="${metrics.height}" aria-hidden="true">
        <polyline class="route-shadow" points="${pointText}" />
        <polyline class="route-line" points="${pointText}" />
        ${gapArrows}
        ${recentText ? `<polyline class="route-recent" points="${recentText}" />` : ""}
      </svg>
    `;
  }

  function routeGapArrowMarks(points) {
    return points.slice(0, -1).map((point, index) => {
      const next = points[index + 1];
      const midX = (point.x + next.x) / 2;
      const midY = (point.y + next.y) / 2;
      const angle = Math.atan2(next.y - point.y, next.x - point.x) * 180 / Math.PI;
      return `
        <g class="route-gap-arrow" transform="translate(${midX} ${midY}) rotate(${angle})">
          <circle r="8"></circle>
          <path d="M -3 -4 L 2 0 L -3 4"></path>
        </g>
      `;
    }).join("");
  }

  function centerSelectedTile(behavior) {
    if (!refs.boardViewport || !MapLayout) return;
    const tile = Engine.getTile(state, state.selectedTileId);
    const layout = presentation.mapLayout;
    if (!tile || !layout || layout.mode !== "focus") return;
    const position = tilePixels(tile);
    const scroll = MapLayout.getCenteredScroll({
      tileLeft: position.left,
      tileTop: position.top,
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
      scale: layout.scale,
      contentOffsetX: layout.contentOffsetX,
      contentOffsetY: layout.contentOffsetY,
      viewportWidth: refs.boardViewport.clientWidth,
      viewportHeight: refs.boardViewport.clientHeight,
      stageWidth: layout.stageWidth,
      stageHeight: layout.stageHeight
    });
    refs.boardViewport.scrollTo({ ...scroll, behavior });
  }

  function selectTile(tileId) {
    const tile = Engine.getTile(state, tileId);
    if (!tile) return;
    state.selectedTileId = tile.id;
    presentation.tileDetailOpen = true;
    presentation.tileDetailPosition = null;
    presentation.menuOpen = false;
    if (presentation.activeView !== "assets") presentation.activeView = "action";
    render();
    centerSelectedTile(settings.reduceMotion ? "auto" : "smooth");
  }

  function hideTileDetail() {
    if (!presentation.tileDetailOpen) return;
    presentation.tileDetailOpen = false;
    presentation.tileDetailPosition = null;
    tileDetailDrag = null;
    if (refs.appShell) refs.appShell.dataset.detailOpen = "false";
    if (refs.tileDetail) refs.tileDetail.classList.remove("is-dragging");
    renderTileDetail();
    renderBoard();
  }

  function tileClass(tile) {
    const classes = ["tile", "tile-grid-cell", `tile-${tile.type}`];
    const active = Engine.getActivePlayer(state);
    const activePosition = active
      ? (presentation.visualPositions[active.id] ?? active.position)
      : null;
    classes.push(`tile-id-${tile.id}`);
    if (tile.groupId) classes.push(`tile-group-${tile.groupId}`);
    if (tile.type === "event" && tile.deck === "chance") classes.push("tile-chance");
    if (tile.id === state.selectedTileId) classes.push("is-selected");
    if (tile.id === activePosition) classes.push("is-active-position");
    if (state.players.some((player) => player.status !== "eliminated" && (presentation.visualPositions[player.id] ?? player.position) === tile.id)) {
      classes.push("has-player-pawns");
    }
    if (state.lastMovePath && state.lastMovePath.includes(tile.id)) classes.push("is-in-path");
    if (tile.ownerId) classes.push(`owner-${tile.ownerId}`);
    if (tile.isMortgaged) classes.push("is-mortgaged");
    if (tile.houseLevel > 0) classes.push("has-buildings");
    if (Engine.isPurchasableTile(tile) && tile.ownerId && Engine.calculateRent(state, tile.id) >= 180) {
      classes.push("is-high-rent");
    }
    if (tile.type === "property" && Engine.isRentSpikeLevel(tile.houseLevel)) classes.push("is-spike-level");
    return classes.join(" ");
  }

  function tileMeta(tile) {
    if (Engine.isPurchasableTile(tile)) {
      const owner = tile.ownerId ? Engine.getPlayer(state, tile.ownerId).name : `￥${tile.price}`;
      const rent = tile.ownerId ? `租 ${Engine.calculateRent(state, tile.id)}` : "可购买";
      return `${owner} · ${rent}`;
    }
    if (tile.type === "tax") return tile.incomeTax ? "所得税选择" : `缴费 ${tile.amount}`;
    if (tile.type === "event") return tile.deck === "chance" ? "抽机遇卡" : "城市事件";
    if (tile.type === "rest") return "临时停靠";
    return `工资 +${Engine.PASS_START_REWARD}`;
  }

  function tileIcon(tile) {
    if (tile.type === "start") return "◇";
    if (tile.type === "tax") return "¥";
    if (tile.type === "rest") return "⏸";
    if (tile.type === "event") return tile.deck === "chance" ? "?" : "!";
    if (tile.type === "station") return "⇄";
    if (tile.type === "utility") return "⌁";
    if (!tile.groupId) return "□";
    return tile.groupId && Engine.GROUPS[tile.groupId] ? Engine.GROUPS[tile.groupId].symbol : "□";
  }

  function tileFunctionKind(tile) {
    if (!tile || tile.type === "property") return "";
    if (tile.type === "event") return tile.deck === "chance" ? "chance" : "event";
    if (tile.type === "rest") {
      if (tile.id === Engine.CONTROL_ZONE_INDEX) return "control";
      if (tile.tradeHub) return "trade";
    }
    return tile.type;
  }

  function tileFunctionLabel(tile) {
    const kind = tileFunctionKind(tile);
    if (kind === "start") return `经过领${money(Engine.PASS_START_REWARD)}`;
    if (kind === "station") return "站点收租";
    if (kind === "utility") return "按骰点收租";
    if (kind === "chance") return "抽机遇卡";
    if (kind === "event") return "抽事件卡";
    if (kind === "tax") return tile.incomeTax ? "税额二选一" : `支付${money(tile.amount)}`;
    if (kind === "control") return "交通管制";
    if (kind === "trade") return "地产交易";
    if (kind === "rest") return "安全停靠";
    return "";
  }

  function tileFunctionIcon(tile) {
    const kind = tileFunctionKind(tile);
    if (kind === "start") return "GO";
    if (kind === "station") return "↔";
    if (kind === "utility") return "⚡";
    if (kind === "chance") return "?";
    if (kind === "event") return "!";
    if (kind === "tax") return "¥";
    if (kind === "control") return "×";
    if (kind === "trade") return "⇄";
    if (kind === "rest") return "Ⅱ";
    return tileIcon(tile);
  }

  function tileFunctionMark(tile) {
    const kind = tileFunctionKind(tile);
    const label = tileFunctionLabel(tile);
    if (!kind || !label) return "";
    return `
      <span class="tile-function-mark" data-function-kind="${kind}" aria-hidden="true">
        <span class="tile-function-icon"><span>${tileFunctionIcon(tile)}</span></span>
        <span class="tile-function-label">${escapeHtml(label)}</span>
      </span>
    `;
  }

  function ownerBadge(tile) {
    if (!Engine.isPurchasableTile(tile)) return "";
    if (!tile.ownerId) return `<span class="owner-badge owner-free">待售</span>`;
    const player = Engine.getPlayer(state, tile.ownerId);
    const appearance = playerAppearance(player);
    return `<span class="owner-badge" style="--owner-color:${appearance.color}">${escapeHtml(player ? player.name : "未知")}</span>`;
  }

  function tileAriaLabel(tile) {
    const functionLabel = tileFunctionLabel(tile);
    const detail = functionLabel
      ? Engine.isPurchasableTile(tile)
        ? `${functionLabel}，${tileMeta(tile)}`
        : functionLabel
      : tileMeta(tile);
    return `第 ${tile.id + 1} 格，${tile.name}，${detail}`;
  }

  function buildingMarks(tile) {
    const level = buildingVisualLevel(tile);
    if (level <= 0) return "";
    return `<span class="building-model building-level-${level}" aria-hidden="true"></span>`;
  }

  function buildingVisualLevel(tile) {
    if (tile.type !== "property" || tile.houseLevel <= 0) return 0;
    if (isLandmarkBuilt(tile)) return Engine.STANDARD_LANDMARK_LEVEL;
    return Math.max(1, Math.min(tile.houseLevel, Engine.STANDARD_LANDMARK_LEVEL - 1));
  }

  function tileEffectMarks(tileId) {
    const effects = presentation.effects.filter((effect) => ["build", "claim"].includes(effect.type) && effect.tileId === tileId);
    if (!effects.length) return "";
    return effects
      .map((effect) => {
        const owner = effect.ownerId ? Engine.getPlayer(state, effect.ownerId) : null;
        const appearance = owner ? playerAppearance(owner) : null;
        const icon = effect.type === "claim" ? appearance.emblem : effect.level >= 5 ? "▲" : "⌂";
        return `
          <span class="tile-effect tile-effect-${effect.type}" style="${appearance ? `--effect-color:${appearance.color}` : ""}" aria-hidden="true">
            <span>${icon}</span>
            <strong>${effect.text}</strong>
          </span>
        `;
      })
      .join("");
  }

  function pieceMarks(tileId) {
    return state.players
      .filter((player) => player.status !== "eliminated")
      .filter((player) => (presentation.visualPositions[player.id] ?? player.position) === tileId)
      .map((player, index) => {
        const appearance = playerAppearance(player);
        const moving = presentation.moving && Object.hasOwn(presentation.visualPositions, player.id) ? " is-moving" : "";
        const pieceDescription = `${player.name}，${appearance.pieceColorLabel}棋子`;
        return `<span class="piece map-player-piece piece-${appearance.seatKey}${moving}" style="--piece-color:${appearance.color};--piece-index:${index}" title="${escapeHtml(pieceDescription)}" aria-label="${escapeHtml(pieceDescription)}">${mapPawnHtml(appearance)}</span>`;
      })
      .join("");
  }

  function renderPlayers() {
    refs.players.innerHTML = state.players
      .map((player) => {
        const propertyCount = Engine.getOwnedProperties(state, player.id).length;
        const buildingCounts = Engine.getOwnedBuildingCounts(state, player.id);
        const active = state.activePlayerId === player.id ? "is-active" : "";
        const eliminated = player.status === "eliminated" ? "is-eliminated" : "";
        const eliminationReaction = presentation.effects.some((effect) => effect.type === "elimination" && effect.playerId === player.id) ? "is-eliminating" : "";
        const appearance = playerAppearance(player);
        const intel = seatIntel(player);
        const stateLabel = player.status === "eliminated" ? "已淘汰" : active ? "正在行动" : "等待";
        const roleLabel = Agents.isHuman(player)
          ? "本地玩家"
          : ({ aggressive: "电脑玩家 · 积极型", conservative: "电脑玩家 · 稳健型", opportunist: "电脑玩家 · 灵活型" }[player.profileId] || "电脑玩家");
        const speech = presentation.agentSpeech && presentation.agentSpeech.playerId === player.id ? presentation.agentSpeech : null;
        return `
          <article class="player-panel seat-pod seat-${appearance.seatKey} ${active} ${eliminated} ${eliminationReaction} ${speech ? "is-speaking" : ""}" style="--player-card-color:${appearance.color}" aria-label="${escapeHtml(player.name)}，${appearance.pieceColorLabel}棋子，${stateLabel}，现金 ${money(player.cash)}">
            ${playerMoneyEffects(player.id)}
            ${speech ? `<p class="agent-speech" role="status"><span>${escapeHtml(speech.text)}</span><small>${escapeHtml(speech.codeLabel)}</small></p>` : ""}
            <div class="player-head">
              <div class="player-token player-token-${appearance.seatKey}" style="--piece-color:${appearance.color}" aria-hidden="true">${pawnModelHtml(appearance)}</div>
              <div class="player-identity">
                <p class="panel-label">${roleLabel}</p>
                <h2>${escapeHtml(player.name)}</h2>
                <span class="seat-piece-key" style="--piece-color:${appearance.color}"><span class="seat-piece-key-pawn" aria-hidden="true"></span>${appearance.pieceColorLabel}棋子</span>
              </div>
              <span class="seat-state">${stateLabel}</span>
            </div>
            <dl class="seat-stats">
              <div><dt>现金</dt><dd>${money(player.cash)}</dd></div>
              <div><dt>资产</dt><dd>${propertyCount} 地 · ${buildingCounts.houses} 房</dd></div>
            </dl>
            <p class="player-note seat-intel">${player.status === "eliminated" ? `第 ${player.eliminatedAtRound || "-"} 轮淘汰` : intel}</p>
          </article>
        `;
      })
      .join("");
  }

  function seatIntel(player) {
    const properties = Engine.getOwnedProperties(state, player.id).filter((tile) => !tile.isMortgaged);
    if (!properties.length) return "尚无可收租资产";
    const strongest = properties.reduce((best, tile) => {
      const rent = Engine.calculateRent(state, tile.id);
      return !best || rent > best.rent ? { tile, rent } : best;
    }, null);
    return `最高收租 ${money(strongest.rent)} · ${escapeHtml(strongest.tile.name)}`;
  }

  function playerMoneyEffects(playerId) {
    const effects = presentation.effects.filter((effect) => effect.type === "money" && effect.playerId === playerId);
    if (!effects.length) return "";
    return effects
      .map((effect) => `<span class="money-float money-${effect.tone}" aria-hidden="true">${effect.text}</span>`)
      .join("");
  }

  function showAgentSpeech(player, decision) {
    if (!player || !decision || !decision.publicLine || presentation.skipAgentShow) return;
    const majorTypes = new Set(["BUY", "AUCTION_BID", "BUILD", "RENT_DEMAND", "MORTGAGE", "AUTO_RESOLVE_DEBT"]);
    const majorCodes = new Set(["PRESSURE", "COMPLETE_SET", "BLOCK_SET", "RENT_SPIKE", "SURVIVAL"]);
    if (!majorTypes.has(decision.actionType) && !majorCodes.has(decision.decisionCode)) return;
    const labels = {
      PRESSURE: "施压",
      COMPLETE_SET: "成套",
      BLOCK_SET: "阻断",
      RENT_SPIKE: "跳涨",
      LIQUIDITY: "现金",
      SURVIVAL: "生存",
      POSITION: "布局"
    };
    presentation.agentSpeech = {
      playerId: player.id,
      text: String(decision.publicLine).slice(0, 40),
      codeLabel: labels[decision.decisionCode] || "决策"
    };
    if (agentSpeechTimer) window.clearTimeout(agentSpeechTimer);
    agentSpeechTimer = window.setTimeout(() => {
      agentSpeechTimer = null;
      presentation.agentSpeech = null;
      renderPlayers();
    }, motionMs(2400));
  }

  function renderActions() {
    const active = Engine.getActivePlayer(state);
    const isHumanTurn = active && Agents.isHuman(active);
    const requiredActorId = Agents.getRequiredActorId(state);
    const waitingForHumanResponse = requiredActorId === "player" && active && !isHumanTurn;
    const actionHeading = state.status === "game-over"
      ? "对局结束"
      : waitingForHumanResponse
        ? `${active.name}回合 · 轮到你回应`
        : isHumanTurn
          ? `${active.name} · 你的回合`
          : `${active ? active.name : "电脑玩家"} · 电脑自动行动`;
    const pending = state.pending;
    let html = "";

    if (presentation.rolling || presentation.dicePhase === "settle") {
      const isSettling = presentation.dicePhase === "settle";
      const dice = presentation.displayDice || state.lastDice || [1, 1];
      html = `
        <div class="${diceConsoleClass(isSettling ? "is-settling" : "is-rolling")}">
          ${diceFaceHtml(dice, { phase: presentation.dicePhase, tick: presentation.diceTick })}
          <div>
            <p class="action-title">${isSettling ? `点数定格：${dice[0]} + ${dice[1]}` : "骰子滚动中"}</p>
            <p class="action-copy">${isSettling ? "骰子落定，棋子马上沿城市路网前进。" : "两颗骰子正在错峰翻滚，真实点数会在落定时揭晓。"}</p>
          </div>
        </div>
        ${
          isSettling
            ? `<p class="sr-only dice-result-announcement" role="status" aria-live="polite" aria-atomic="true">掷骰结果：${dice[0]} 和 ${dice[1]}，合计 ${dice[0] + dice[1]}</p>`
            : ""
        }
        <button class="primary action-roll" disabled>${isSettling ? "准备移动" : "掷骰中"}</button>
      `;
    } else if (presentation.moving) {
      html = `
        <div class="${diceConsoleClass("is-settled")}">
          ${diceFaceHtml(presentation.displayDice || state.lastDice || [1, 1], { phase: "settled" })}
          <div>
            <p class="action-title">棋子移动中</p>
            <p class="action-copy">正在逐格经过本回合路线。</p>
          </div>
        </div>
        <button class="primary action-roll" disabled>移动中</button>
      `;
    } else if (state.status === "game-over") {
      html = `<button class="primary" data-action="new-game">再来一局</button>`;
    } else if (state.phase === "ready" && isHumanTurn) {
      html = `
        <div class="${diceConsoleClass("is-idle")}">
          ${diceFaceHtml(state.lastDice, { phase: "idle" })}
          <div>
            <p class="action-title">轮到你行动</p>
            <p class="action-copy">掷骰后沿城市路网前进，落地会触发购买、租金或卡牌事件。</p>
          </div>
        </div>
        <button class="primary action-roll" data-action="roll">掷骰前进</button>
      `;
    } else if (state.phase === "ready") {
      html = `<button class="primary" disabled>${active ? escapeHtml(active.name) : "Agent"} 正在掷骰</button>`;
    } else if (state.phase === "purchase" && pending && pending.playerId === "player") {
      const tile = Engine.getTile(state, pending.tileId);
      const canBuy = Engine.getPlayer(state, "player").cash >= tile.price;
      html = `
        <p class="action-title">${tile.name} 标价 ${money(tile.price)}</p>
        <div class="action-row">
          <button class="primary" data-action="buy" ${canBuy ? "" : "disabled"}>购买</button>
          <button data-action="auction-start">竞拍</button>
        </div>
      `;
    } else if (state.phase === "auction" && pending) {
      const tile = Engine.getTile(state, pending.tileId);
      const maxBid = Math.max(0, Engine.getPlayer(state, "player").cash);
      const minimumBid = Engine.getAuctionMinimumBid(state);
      const highBidder = pending.highBidderId ? Engine.getPlayer(state, pending.highBidderId) : null;
      const canBid = pending.activeBidderId === "player" && minimumBid <= maxBid;
      const value = Math.min(Math.max(minimumBid, pending.currentBid || 0), maxBid);
      if (pending.activeBidderId === "player") {
        const turnContext = active && !isHumanTurn ? `${active.name}已经掷骰并发起本次拍卖。` : "";
        html = `
          <p class="action-title">${tile.name} 拍卖中</p>
          <p class="action-copy">${turnContext}现在轮到你回应。当前最高价：${pending.currentBid ? money(pending.currentBid) : "暂无"}${highBidder ? ` · ${highBidder.name}` : ""}。最低出价 ${money(minimumBid)}。</p>
          <label class="bid-label" for="bidInput">你的出价</label>
          <div class="bid-row">
            <input id="bidInput" type="number" min="${minimumBid}" max="${maxBid}" step="${Engine.AUCTION_MIN_INCREMENT}" value="${value}" />
            <button class="primary" data-action="submit-bid" ${canBid ? "" : "disabled"}>出价</button>
          </div>
          <button data-action="auction-pass">放弃竞价</button>
        `;
      } else {
        const bidder = Engine.getPlayer(state, pending.activeBidderId);
        html = `
          <p class="action-title">${tile.name} 拍卖中</p>
          <p class="action-copy">当前最高价：${pending.currentBid ? money(pending.currentBid) : "暂无"}${highBidder ? ` · ${highBidder.name}` : ""}。轮到 ${bidder ? bidder.name : "对手"} 决定是否加价。</p>
          <button class="primary" disabled>${bidder ? escapeHtml(bidder.name) : "Agent"} 正在竞价</button>
        `;
      }
    } else if (state.phase === "choice" && pending && pending.playerId === "player") {
      const card = Engine.getCardById(pending.cardId, pending.deck || "event");
      const deckName = pending.deck === "chance" ? "机遇卡" : "城市事件";
      html = `
        <div class="card-draw card-${pending.deck === "chance" ? "chance" : "event"}">
          <p class="card-deck">${deckName}</p>
          <h3>${card.title}</h3>
          <p>${card.description}</p>
        </div>
        <div class="choice-list">
          ${card.choices
            .map((choice, index) => `<button data-action="choice" data-index="${index}">${choice.label}</button>`)
            .join("")}
        </div>
      `;
    } else if (state.phase === "tax-choice" && pending && pending.playerId === "player") {
      const tile = Engine.getTile(state, pending.tileId);
      const fixedAmount = tile.fixedAmount || Engine.INCOME_TAX_FIXED_AMOUNT;
      const rateLabel = `${Math.round((tile.percent || Engine.INCOME_TAX_RATE) * 100)}%`;
      html = `
        <div class="card-draw card-event">
          <p class="card-deck">税务格</p>
          <h3>${tile.name}</h3>
          <p>选择本次所得税方案，确认后由银行结算。</p>
        </div>
        <div class="choice-list">
          <button data-action="tax-choice" data-choice-kind="fixed">缴纳固定 ${money(fixedAmount)}</button>
          <button data-action="tax-choice" data-choice-kind="percent">缴纳总资产 ${rateLabel}</button>
        </div>
      `;
    } else if (state.phase === "rent-demand" && pending && pending.ownerId === "player") {
      const tile = Engine.getTile(state, pending.tileId);
      const payer = Engine.getPlayer(state, pending.payerId);
      html = `
        <div class="card-draw card-event">
          <p class="card-deck">收租要求</p>
          <h3>${tile.name}</h3>
          <p>${payer.name} 停在你的地块。规则要求业主在下一次掷骰前确认收租。</p>
        </div>
        <div class="action-row">
          <button class="primary" data-action="demand-rent">要求收租 ${money(pending.rent)}</button>
          <button data-action="waive-rent">放弃本次租金</button>
        </div>
      `;
    } else if (state.phase === "rent-demand" && pending) {
      const tile = Engine.getTile(state, pending.tileId);
      html = `
        <p class="action-title">${tile.name} 等待业主收租</p>
        <p class="action-copy">${escapeHtml(Engine.getPlayer(state, pending.ownerId).name)} 会在下一次掷骰前确认本次租金 ${money(pending.rent)}。</p>
        <button class="primary" disabled>Agent 正在确认收租</button>
      `;
    } else if (state.phase === "control" && pending && pending.playerId === "player") {
      const player = Engine.getPlayer(state, "player");
      const canPay = player.cash >= Engine.CONTROL_RELEASE_FEE;
      const controlPassCount = Engine.getControlPassCount(player);
      html = `
        <div class="${diceConsoleClass("is-idle")}">
          ${diceFaceHtml(state.lastDice, { phase: "idle" })}
          <div>
            <p class="action-title">交通管制区</p>
            <p class="action-copy">第 ${player.controlAttempts + 1} / ${Engine.MAX_CONTROL_ATTEMPTS} 次尝试。可用通行证、缴费或掷对子；第 ${Engine.MAX_CONTROL_ATTEMPTS} 次失败会强制缴费并移动。</p>
          </div>
        </div>
        <div class="action-row">
          <button class="primary" data-action="control-pass" ${controlPassCount > 0 ? "" : "disabled"}>使用通行证 ${controlPassCount}</button>
          <button class="primary" data-action="control-pay" ${canPay ? "" : "disabled"}>缴费离开 ${money(Engine.CONTROL_RELEASE_FEE)}</button>
          <button data-action="control-roll">掷骰试对子</button>
        </div>
      `;
    } else if (state.phase === "debt" && pending && pending.playerId === "player") {
      html = `
        <p class="action-title">现金为负，需要处理债务</p>
        <button data-action="auto-debt">自动清算可用资产</button>
      `;
    } else if (state.phase === "management" && isHumanTurn) {
      const label = Engine.getPlayer(state, "player").extraRoll ? "继续掷骰" : "结束回合";
      html = `
        ${riskHint()}
        <p class="action-copy">${latestLogText()}</p>
        <button class="primary" data-action="end-turn">${label}</button>
      `;
    } else {
      html = `
        <p class="action-copy">${latestLogText()}</p>
        <button class="primary" disabled>Agent 正在决策</button>
      `;
    }

    const agentPaceControls = active && !Agents.isHuman(active) && state.status === "playing"
      ? `<div class="agent-pace" aria-label="Agent 演出速度">
          <span>${presentation.skipAgentShow ? "已跳过演出" : presentation.agentFast ? "Agent 2×" : "Agent 标准速度"}</span>
          <button data-action="toggle-agent-speed" aria-pressed="${presentation.agentFast ? "true" : "false"}">${presentation.agentFast ? "恢复 1×" : "开启 2×"}</button>
          <button data-action="skip-agent-show">跳过演出</button>
        </div>`
      : "";

    refs.actions.innerHTML = `
      <div class="panel-heading action-heading">
        <div>
          <p class="panel-label">当前行动</p>
          <h2>${escapeHtml(actionHeading)}</h2>
        </div>
        <span class="phase-badge">${phaseText(state.phase)}</span>
      </div>
      ${html}
      ${agentPaceControls}
      <div class="utility-row">
        <button data-action="new-game" aria-label="重新开始当前对局">重新开始</button>
        <button id="resumeButton" data-action="resume">继续上局</button>
      </div>
    `;
    refs.resumeButton = document.getElementById("resumeButton");
  }

  function renderSituation() {
    if (!refs.situationPanel) return;
    const model = getSituationModel();
    refs.situationPanel.innerHTML = `
      <div class="panel-heading situation-heading">
        <div>
          <p class="panel-label">局势</p>
          <h2>${model.headline}</h2>
        </div>
        <span class="phase-badge">${model.badge}</span>
      </div>
      <div class="situation-advice ${model.tone}">
        <strong>${model.adviceTitle}</strong>
        <span>${model.adviceBody}</span>
      </div>
      <div class="situation-ranking" aria-label="四人净资产排名">
        ${model.rankings.map(situationRankingHtml).join("")}
      </div>
      <div class="situation-brief" aria-label="局势摘要">
        <p><span>现金安全</span><strong>${model.cashLabel}</strong><small>${model.cashDetail}</small></p>
        <p><span>竞争位置</span><strong>第 ${model.playerRank} 名 · ${model.playerProperties} 块地</strong><small>领先威胁：${escapeHtml(model.threatName)} · 收租能力 ${money(model.playerRentPower)}</small></p>
      </div>
      <div class="situation-lists">
        <article>
          <h3>优先建房</h3>
          ${model.buildOpportunities.length ? model.buildOpportunities.map(buildOpportunityHtml).join("") : '<p class="empty-state">暂无可安全升级的地契。</p>'}
        </article>
        <article>
          <h3>高租风险</h3>
          ${model.riskTiles.length ? model.riskTiles.map(riskTileHtml).join("") : '<p class="empty-state">暂未发现需要特别避开的高租地块。</p>'}
        </article>
      </div>
    `;
  }

  function getSituationModel() {
    const player = humanPlayer();
    const playerWorth = Engine.getNetWorth(state, "player");
    const rankings = state.players
      .map((item) => ({
        player: item,
        worth: Engine.getNetWorth(state, item.id),
        appearance: playerAppearance(item)
      }))
      .sort((a, b) => Number(a.player.status === "eliminated") - Number(b.player.status === "eliminated") || b.worth - a.worth);
    const playerRank = rankings.findIndex((item) => item.player.id === player.id) + 1;
    const opponents = state.players.filter((item) => item.id !== player.id && item.status !== "eliminated");
    const threat = rankings.find((item) => item.player.id !== player.id && item.player.status !== "eliminated") || rankings[0];
    const threatWorth = threat ? threat.worth : 0;
    const netGap = playerWorth - threatWorth;
    const playerProperties = Engine.getOwnedProperties(state, "player");
    const opponentProperties = opponents.flatMap((item) => Engine.getOwnedProperties(state, item.id));
    const playerBuildings = Engine.getOwnedBuildingCounts(state, "player");
    const playerRentPower = rentPower(playerProperties);
    const aiRentPower = Math.max(0, ...opponents.map((item) => rentPower(Engine.getOwnedProperties(state, item.id))));
    const buildOpportunities = buildOpportunitiesFor(playerProperties);
    const riskTiles = highRiskTiles(opponentProperties, player.cash);
    const cashState = cashSafety(player.cash, aiRentPower);
    const advice = strategicAdvice({
      netGap,
      cashState,
      buildOpportunities,
      riskTiles,
      playerRentPower,
      aiRentPower
    });

    return {
      playerWorth,
      netGap,
      rankings,
      playerRank,
      threatName: threat && threat.player.id !== player.id ? threat.player.name : "暂无",
      playerProperties: playerProperties.length,
      totalProperties: state.tiles.filter((tile) => Engine.isPurchasableTile(tile) && tile.ownerId).length,
      playerRentPower,
      aiRentPower,
      buildOpportunities,
      riskTiles,
      cashLabel: cashState.label,
      cashDetail: `${money(player.cash)} 现金`,
      cashTone: cashState.tone,
      rentTone: playerRentPower >= aiRentPower ? "good" : "warn",
      propertyTone: playerProperties.length >= Math.max(0, ...opponents.map((item) => Engine.getOwnedProperties(state, item.id).length)) ? "good" : "warn",
      headline: playerRank === 1 ? "你暂时领先" : `你目前排名第 ${playerRank}`,
      badge: state.status === "game-over" ? "已结算" : `第 ${state.roundNumber} 轮 · 生存制`,
      ...advice
    };
  }

  function situationRankingHtml(item, index) {
    const eliminated = item.player.status === "eliminated" ? " is-eliminated" : "";
    return `
      <div class="situation-rank${eliminated}" style="--rank-color:${item.appearance.color}">
        <strong>${index + 1}</strong>
        <span>${escapeHtml(item.player.name)}</span>
        <small>${item.player.status === "eliminated" ? "已淘汰" : money(item.worth)}</small>
      </div>
    `;
  }

  function rentPower(properties) {
    return properties.reduce((total, tile) => total + (tile.isMortgaged ? 0 : Engine.calculateRent(state, tile.id)), 0);
  }

  function buildOpportunitiesFor(properties) {
    return properties
      .filter((tile) => Engine.canBuildOnTile(state, tile.id, "player"))
      .map((tile) => {
        const currentRent = Engine.calculateRent(state, tile.id);
        const nextRent = Engine.getRentAtLevel(tile, nextRentLevel(tile));
        const buildCost = Engine.getBuildCost(state, tile.id, "player");
        return {
          tile,
          currentRent,
          nextRent,
          buildCost,
          gain: nextRent - currentRent,
          spike: Engine.isRentSpikeLevel(nextRentLevel(tile))
        };
      })
      .sort((a, b) => b.gain / Math.max(1, b.buildCost) - a.gain / Math.max(1, a.buildCost))
      .slice(0, 3);
  }

  function highRiskTiles(properties, cash) {
    return properties
      .map((tile) => ({ tile, rent: Engine.calculateRent(state, tile.id) }))
      .filter((item) => item.rent >= Math.max(120, cash * 0.18))
      .sort((a, b) => b.rent - a.rent)
      .slice(0, 3);
  }

  function cashSafety(cash, aiRentPower) {
    const dangerLine = Math.max(180, Math.round(aiRentPower * 0.32));
    const cautionLine = Math.max(320, Math.round(aiRentPower * 0.58));
    if (cash < dangerLine) return { label: "危险", tone: "danger" };
    if (cash < cautionLine) return { label: "偏紧", tone: "warn" };
    return { label: "充足", tone: "good" };
  }

  function strategicAdvice(model) {
    if (model.cashState.tone === "danger") {
      return {
        tone: "danger",
        adviceTitle: "先保现金",
        adviceBody: "现金低于安全线，优先结束冒险建房；若进入负债，先抵押低租地块或卖掉回本慢的房子。"
      };
    }
    if (model.riskTiles.length && model.cashState.tone === "warn") {
      return {
        tone: "warn",
        adviceTitle: "小心高租区",
        adviceBody: `AI 的 ${model.riskTiles[0].tile.name} 租金很高，现金没有拉开前不要把钱全部投进建房。`
      };
    }
    if (model.buildOpportunities.length) {
      const top = model.buildOpportunities[0];
      return {
        tone: top.spike ? "good" : "neutral",
        adviceTitle: top.spike ? "抓住租金跳点" : "可以稳健建房",
        adviceBody: `${top.tile.name} 升级到${nextBuildLabel(top.tile)}后，租金 ${money(top.currentRent)} → ${money(top.nextRent)}。`
      };
    }
    if (model.netGap < 0) {
      return {
        tone: "warn",
        adviceTitle: "扩大地产面",
        adviceBody: "当前净资产落后，优先争取未售地块和街区组合，不要只等随机事件翻盘。"
      };
    }
    return {
      tone: "good",
      adviceTitle: "稳住优势",
      adviceBody: "你当前处于领先，保留现金缓冲，同时优先升级回报率高的自有地块。"
    };
  }

  function situationStat(label, value, detail, tone) {
    return `
      <article class="situation-stat ${tone}">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${detail}</small>
      </article>
    `;
  }

  function buildOpportunityHtml(item) {
    return `
      <button class="situation-row" data-action="select-tile" data-tile-id="${item.tile.id}">
        <span>
          <strong>${item.tile.name}</strong>
          <small>${item.spike ? "租金跳点" : "常规升级"} · 建房 ${money(item.buildCost)}</small>
        </span>
        <b>${money(item.currentRent)} → ${money(item.nextRent)}</b>
      </button>
    `;
  }

  function riskTileHtml(item) {
    return `
      <button class="situation-row risk" data-action="select-tile" data-tile-id="${item.tile.id}">
        <span>
          <strong>${item.tile.name}</strong>
          <small>${Engine.GROUPS[item.tile.groupId].name} · ${buildingText(item.tile)}</small>
        </span>
        <b>${money(item.rent)}</b>
      </button>
    `;
  }

  function diceFaceHtml(dice, options = {}) {
    if (!dice) return '<div class="dice-face dice-face-empty">D6</div>';
    const phase = options.phase || "idle";
    const tick = Number(options.tick) || 0;
    const pairClass = ["dice-pair", `dice-pair-${phase}`].join(" ");
    const isPreview = phase === "windup" || phase === "rolling";
    const accessibility = isPreview
      ? 'aria-hidden="true"'
      : `role="img" aria-label="骰子 ${dice[0]} 和 ${dice[1]}，合计 ${dice[0] + dice[1]}"`;
    return `
      <div class="${pairClass}" ${accessibility} style="--dice-tick: ${tick}">
        ${dice.map((value, index) => singleDieHtml(value, index)).join("")}
      </div>
    `;
  }

  function diceConsoleClass(extraClass = "") {
    const doubleClass =
      presentation.dicePhase === "settle" && DiceAnimation.isDouble(presentation.displayDice)
        ? "is-double"
        : "";
    return [
      "dice-console",
      presentation.dicePhase ? `dice-phase-${presentation.dicePhase}` : "",
      doubleClass,
      extraClass
    ]
      .filter(Boolean)
      .join(" ");
  }

  function singleDieHtml(value, dieIndex = 0) {
    const active = new Set(DiceAnimation.pipIndexes(value));
    return `
      <span class="die die-${value} die-${dieIndex + 1}" style="--die-index: ${dieIndex}; --die-face: ${value}">
        ${Array.from({ length: 9 })
          .map((_, index) => `<span class="pip ${active.has(index + 1) ? "is-on" : ""}"></span>`)
          .join("")}
      </span>
    `;
  }

  function applyDicePreviewFrame(frame) {
    presentation.dicePhase = frame.phase;
    presentation.diceTick = frame.contactIndex;
    if (frame.faces) presentation.displayDice = frame.faces.slice();
    const consoleElement = refs.actions.querySelector(".dice-console");
    const pair = consoleElement && consoleElement.querySelector(".dice-pair");
    if (!consoleElement || !pair) return;
    consoleElement.className = diceConsoleClass("is-rolling");
    pair.className = `dice-pair dice-pair-${frame.phase}`;
    pair.style.setProperty("--dice-tick", String(frame.contactIndex));
    pair.setAttribute("aria-hidden", "true");
    pair.removeAttribute("aria-label");
    pair.querySelectorAll(".die").forEach((die, index) => {
      updateDieFace(die, presentation.displayDice[index], index);
    });
  }

  function updateDieFace(die, value, dieIndex) {
    const activePips = new Set(DiceAnimation.pipIndexes(value));
    die.className = `die die-${value} die-${dieIndex + 1}`;
    die.style.setProperty("--die-index", String(dieIndex));
    die.style.setProperty("--die-face", String(value));
    die.querySelectorAll(".pip").forEach((pip, index) => {
      pip.classList.toggle("is-on", activePips.has(index + 1));
    });
  }

  function renderTileDetail() {
    if (!refs.tileDetail) return;
    const tile = Engine.getTile(state, state.selectedTileId);
    if (!tile || !presentation.tileDetailOpen) {
      if (refs.appShell) refs.appShell.dataset.detailOpen = "false";
      refs.tileDetail.hidden = true;
      refs.tileDetail.innerHTML = "";
      return;
    }
    if (refs.appShell) refs.appShell.dataset.detailOpen = "true";
    refs.tileDetail.hidden = false;
    const ownerPlayer = tile.ownerId ? Engine.getPlayer(state, tile.ownerId) : null;
    const owner = ownerPlayer ? ownerPlayer.name : "无";
    const groupConfig = tile.groupId ? Engine.GROUPS[tile.groupId] : null;
    const group = groupConfig ? groupConfig.name : "-";
    const detailStats = tileDetailStats(tile);
    const detailClass = Engine.isPurchasableTile(tile) ? "property-detail" : "";
    refs.tileDetail.innerHTML = `
      <div class="panel-heading map-detail-drag-handle" title="拖动可移动地块详情">
        <div>
          <p class="panel-label">地契 · 路线 #${tile.id}</p>
          <h2 id="tileDetailTitle">${escapeHtml(tile.name)}</h2>
        </div>
        <div class="map-detail-window-actions">
          <span class="map-detail-drag-grip" role="button" tabindex="0" aria-label="移动地块详情；可拖动，或使用方向键移动，Home 键居中"><span aria-hidden="true">⠿</span> 拖动</span>
          <button class="map-detail-close" data-action="close-tile-detail" aria-label="关闭地块详情">×</button>
        </div>
      </div>
      <div class="tile-detail-card ${detailClass}" style="${tile.groupId ? `--group-color:${Engine.GROUPS[tile.groupId].color}` : ""}">
        <div class="detail-icon" aria-hidden="true">${tileIcon(tile)}</div>
        <div>
          <strong>${tileTypeName(tile.type)}</strong>
          <span>${tileMeta(tile)}</span>
        </div>
      </div>
      <dl class="detail-list detail-list-compact">
        <div><dt>街区</dt><dd>${group}</dd></div>
        <div><dt>地段特点</dt><dd>${escapeHtml(tile.feature || "-")}</dd></div>
        <div><dt>街区定位</dt><dd>${groupConfig ? escapeHtml(groupConfig.strategy) : "-"}</dd></div>
        <div><dt>成长模型</dt><dd>${groupConfig ? escapeHtml(groupConfig.growthLabel) : "-"}</dd></div>
        <div><dt>业主</dt><dd>${owner}</dd></div>
        <div><dt>买下价格</dt><dd>${detailStats.purchase}</dd></div>
        <div><dt>当前实收</dt><dd>${detailStats.currentRent}</dd></div>
        <div><dt>下一栋成本</dt><dd>${detailStats.nextBuildCost}</dd></div>
        <div><dt>状态</dt><dd>${tile.isMortgaged ? "抵押中" : detailStats.status}</dd></div>
      </dl>
      <details class="deed-economy">
        <summary>展开完整价格与升级表</summary>
        ${tileEconomyTable(tile)}
        ${tile.type === "property" ? upgradeTrack(tile) : ""}
      </details>
    `;
    positionMapDetail();
  }

  function positionMapDetail() {
    if (!refs.tileDetail || refs.tileDetail.hidden) return;
    const tile = Engine.getTile(state, state.selectedTileId);
    if (!tile) return;
    const panelWidth = refs.tileDetail.offsetWidth || 420;
    const panelHeight = refs.tileDetail.offsetHeight || 420;
    const desired = presentation.tileDetailPosition || {
      left: (window.innerWidth - panelWidth) / 2,
      top: (window.innerHeight - panelHeight) / 2
    };
    presentation.tileDetailPosition = clampTileDetailPosition(desired.left, desired.top);
    applyTileDetailPosition();
  }

  function clampTileDetailPosition(left, top) {
    const inset = 8;
    const panelWidth = refs.tileDetail ? refs.tileDetail.offsetWidth : 420;
    const panelHeight = refs.tileDetail ? refs.tileDetail.offsetHeight : 420;
    const maxLeft = Math.max(inset, window.innerWidth - panelWidth - inset);
    const maxTop = Math.max(inset, window.innerHeight - panelHeight - inset);
    return {
      left: Math.max(inset, Math.min(Number(left) || inset, maxLeft)),
      top: Math.max(inset, Math.min(Number(top) || inset, maxTop))
    };
  }

  function applyTileDetailPosition() {
    if (!refs.tileDetail || !presentation.tileDetailPosition) return;
    refs.tileDetail.style.setProperty("--map-detail-left", `${presentation.tileDetailPosition.left}px`);
    refs.tileDetail.style.setProperty("--map-detail-top", `${presentation.tileDetailPosition.top}px`);
  }

  function tileDetailStats(tile) {
    const purchasable = Engine.isPurchasableTile(tile);
    const purchase = purchasable ? money(tile.price) : "不可购买";
    const currentRent = purchasable && tile.ownerId && !tile.isMortgaged ? money(Engine.calculateRent(state, tile.id)) : rentPreview(tile);
    const nextBuildCost = tile.type === "property" && !isLandmarkBuilt(tile) ? money(nextBuildCostForTile(tile)) : "-";
    const nextRent = tile.type === "property" && !isLandmarkBuilt(tile) ? money(Engine.getRentAtLevel(tile, nextRentLevel(tile))) : "-";
    const status = purchasable ? (tile.ownerId ? "正常收租" : "待购买") : tileSpecialStatus(tile);
    return { purchase, currentRent, nextBuildCost, nextRent, status };
  }

  function rentPreview(tile) {
    if (tile.type === "property") return `基础 ${money(Engine.getRentAtLevel(tile, 0))}`;
    if (tile.type === "station") return `1 站 ${money(Engine.STATION_RENTS[0])}`;
    if (tile.type === "utility") return "骰点 × 4";
    if (tile.type === "tax") return tileTaxText(tile);
    return "-";
  }

  function tileSpecialStatus(tile) {
    if (tile.type === "start") return `经过奖励 ${money(Engine.PASS_START_REWARD)}`;
    if (tile.type === "event") return tile.deck === "chance" ? "抽机遇卡" : "抽事件卡";
    if (tile.type === "tax") return "到达即缴费";
    if (tile.type === "rest") return tile.tradeHub ? "产权交易提示" : "临时停靠";
    return "正常";
  }

  function tileTaxText(tile) {
    if (tile.incomeTax) {
      const fixed = Number.isFinite(tile.fixedAmount) ? tile.fixedAmount : Engine.INCOME_TAX_FIXED_AMOUNT;
      const percent = Math.round((Number.isFinite(tile.percent) ? tile.percent : Engine.INCOME_TAX_RATE) * 100);
      return `${money(fixed)} 或总资产 ${percent}%`;
    }
    if (Number.isFinite(tile.amount)) return money(tile.amount);
    return "-";
  }

  function nextBuildCostForTile(tile) {
    if (!tile || tile.type !== "property") return 0;
    if (tile.ownerId) return Engine.getBuildCost(state, tile.id, tile.ownerId);
    return standardBuildCostForLevel(tile, Math.min(tile.houseLevel + 1, Engine.getLandmarkLevel(state)));
  }

  function standardBuildCostForLevel(tile, level) {
    if (!tile || tile.type !== "property" || level <= 0) return 0;
    const landmarkLevel = Engine.getLandmarkLevel(state);
    const costIndex = level >= landmarkLevel ? 4 : level - 1;
    return Array.isArray(tile.buildCosts) && tile.buildCosts[costIndex] ? tile.buildCosts[costIndex] : tile.buildCost;
  }

  function tileEconomyTable(tile) {
    if (tile.type === "property") return propertyEconomyTable(tile);
    if (tile.type === "station") return stationEconomyTable(tile);
    if (tile.type === "utility") return utilityEconomyTable(tile);
    return specialEconomyNote(tile);
  }

  function propertyEconomyTable(tile) {
    const rows = propertyRentRows(tile);
    return `
      <section class="economy-detail" aria-label="${tile.name}收费表">
        <div class="economy-heading">
          <strong>过路费和建房价格</strong>
          <span>${tile.ownerId ? "按当前规则预估" : "买下后可参考"}</span>
        </div>
        <div class="economy-table property-economy-table">
          <div class="economy-row economy-head">
            <span>建筑档位</span>
            <span>建到此档</span>
            <span>别人踩到收</span>
          </div>
          ${rows
            .map(
              (row) => `
                <div class="economy-row ${row.active ? "is-current" : ""} ${row.spike ? "is-spike" : ""}">
                  <span>${row.label}</span>
                  <span>${row.cost}</span>
                  <span>${row.rent}</span>
                </div>
              `
            )
            .join("")}
        </div>
        <p class="economy-note">${propertyRuleNote(tile)}</p>
      </section>
    `;
  }

  function propertyRentRows(tile) {
    const landmarkLevel = Engine.getLandmarkLevel(state);
    return Array.from({ length: landmarkLevel + 1 }, (_, level) => {
      const isLandmark = level >= landmarkLevel;
      const rentLevel = isLandmark ? Engine.STANDARD_LANDMARK_LEVEL : level;
      const rent = Engine.getRentAtLevel(tile, rentLevel);
      const active = isLandmark ? isLandmarkBuilt(tile) : tile.houseLevel === level;
      return {
        label: level === 0 ? "空地" : isLandmark ? "地标" : `${level} 栋房`,
        cost: level === 0 ? "-" : money(standardBuildCostForLevel(tile, level)),
        rent: level === 0 ? `${money(rent)} / 整组 ${money(rent * 2)}` : money(rent),
        active,
        spike: Engine.isRentSpikeLevel(rentLevel)
      };
    });
  }

  function propertyRuleNote(tile) {
    const group = tile.groupId ? Engine.GROUPS[tile.groupId] : null;
    const groupTiles = tile.groupId ? Engine.getGroupTiles(state, tile.groupId) : [];
    const ownedInGroup = tile.ownerId && tile.groupId ? groupTiles.filter((item) => item.ownerId === tile.ownerId).length : 0;
    const groupText = group ? `${group.name}共 ${groupTiles.length} 块，当前业主持有 ${ownedInGroup} 块。` : "";
    const landmarkLevel = Engine.getLandmarkLevel(state);
    return `${groupText}买齐同街区后，空地过路费翻倍；建房和卖房必须保持同街区均匀。第 ${landmarkLevel} 档为地标。`;
  }

  function stationEconomyTable(tile) {
    return `
      <section class="economy-detail" aria-label="${tile.name}交通站收费表">
        <div class="economy-heading">
          <strong>交通站过路费</strong>
          <span>按同一业主持有站点数量计算</span>
        </div>
        <div class="economy-table compact-economy-table">
          ${Engine.STATION_RENTS.map(
            (rent, index) => `
              <div class="economy-row ${stationOwnershipCount(tile) === index + 1 ? "is-current" : ""}">
                <span>${index + 1} 个站点</span>
                <span>${money(rent)}</span>
              </div>
            `
          ).join("")}
        </div>
      </section>
    `;
  }

  function stationOwnershipCount(tile) {
    if (!tile.ownerId) return 0;
    return state.tiles.filter((item) => item.type === "station" && item.ownerId === tile.ownerId).length;
  }

  function utilityEconomyTable(tile) {
    const diceTotal = state.lastDice ? state.lastDice.reduce((sum, value) => sum + value, 0) : null;
    const ownerUtilities = utilityOwnershipCount(tile);
    return `
      <section class="economy-detail" aria-label="${tile.name}公用事业收费表">
        <div class="economy-heading">
          <strong>公用事业过路费</strong>
          <span>按本次骰点相乘</span>
        </div>
        <div class="economy-table compact-economy-table">
          ${Engine.UTILITY_RENT_MULTIPLIERS.map(
            (multiplier, index) => `
              <div class="economy-row ${ownerUtilities === index + 1 ? "is-current" : ""}">
                <span>${index + 1} 个公用事业</span>
                <span>骰点 × ${multiplier}${diceTotal ? ` = ${money(diceTotal * multiplier)}` : ""}</span>
              </div>
            `
          ).join("")}
        </div>
        <p class="economy-note">例如掷出 8 点，持有 1 个公用事业收 ${money(8 * Engine.UTILITY_RENT_MULTIPLIERS[0])}，持有 2 个收 ${money(8 * Engine.UTILITY_RENT_MULTIPLIERS[1])}。</p>
      </section>
    `;
  }

  function utilityOwnershipCount(tile) {
    if (!tile.ownerId) return 0;
    return state.tiles.filter((item) => item.type === "utility" && item.ownerId === tile.ownerId).length;
  }

  function specialEconomyNote(tile) {
    return `
      <section class="economy-detail">
        <div class="economy-heading">
          <strong>地块效果</strong>
          <span>${tileSpecialStatus(tile)}</span>
        </div>
        <p class="economy-note">${specialTileCopy(tile)}</p>
      </section>
    `;
  }

  function specialTileCopy(tile) {
    if (tile.type === "start") return `经过或停在这里会领取 ${money(Engine.PASS_START_REWARD)} 工资。`;
    if (tile.type === "event") return tile.deck === "chance" ? "停在这里会抽一张机遇卡。" : "停在这里会触发一张城市事件。";
    if (tile.type === "tax") return `停在这里需要支付 ${tileTaxText(tile)}。`;
    if (tile.type === "rest") return "正常停靠只是休息；被卡牌或连续对子送入交通管制时，才需要按管制规则离开。";
    return "这个格子没有购买或收租规则。";
  }

  function tileTypeName(type) {
    const tile = Engine.getTile(state, state.selectedTileId);
    if (type === "event" && tile && tile.deck === "chance") return "机遇卡";
    return {
      start: "起点",
      property: "地块",
      station: "交通站",
      utility: "公用事业",
      event: "事件",
      tax: "费用",
      rest: "管制"
    }[type];
  }

  function buildingText(tile) {
    if (tile.type !== "property") return "-";
    if (tile.houseLevel === 0) return "无";
    if (isLandmarkBuilt(tile)) return "地标建筑";
    return `${tile.houseLevel} 栋房`;
  }

  function isLandmarkBuilt(tile) {
    return tile && tile.type === "property" && tile.houseLevel >= Engine.getLandmarkLevel(state);
  }

  function nextRentLevel(tile) {
    return tile.houseLevel + 1 >= Engine.getLandmarkLevel(state) ? Engine.STANDARD_LANDMARK_LEVEL : tile.houseLevel + 1;
  }

  function nextBuildLabel(tile) {
    return tile.houseLevel + 1 >= Engine.getLandmarkLevel(state) ? "地标" : `${tile.houseLevel + 1} 栋房`;
  }

  function activeTradePartners() {
    return state.players.filter((player) => player.id !== "player" && player.status !== "eliminated");
  }

  function canPlayerTradeNow() {
    return state.status === "playing" && state.activePlayerId === "player";
  }

  function tradeableOwnedTiles(playerId) {
    return Engine.getOwnedProperties(state, playerId).filter((tile) => {
      if (tile.type !== "property") return true;
      return !Engine.getGroupTiles(state, tile.groupId).some((groupTile) => groupTile.houseLevel > 0);
    });
  }

  function openTradeComposer(tileId = null) {
    if (!canPlayerTradeNow()) return;
    const partners = activeTradePartners();
    if (!partners.some((player) => player.id === presentation.tradePartnerId)) {
      presentation.tradePartnerId = partners[0] ? partners[0].id : "";
    }
    const offeredTile = Number.isInteger(tileId) ? Engine.getTile(state, tileId) : null;
    presentation.tradeOfferedTileId = offeredTile && offeredTile.ownerId === "player" ? offeredTile.id : null;
    presentation.tradeFeedback = null;
    presentation.tradeOpen = true;
    presentation.assetOwnerId = "player";
    presentation.activeView = "assets";
    render();
  }

  function readTradeProposal() {
    const value = (id) => {
      const element = document.getElementById(id);
      return element ? element.value : "";
    };
    return Engine.normalizeTradeProposal({
      fromPlayerId: "player",
      toPlayerId: value("tradePartner") || presentation.tradePartnerId,
      offeredTileId: value("tradeOfferTile"),
      requestedTileId: value("tradeRequestTile"),
      offeredCash: value("tradeOfferCash"),
      requestedCash: value("tradeRequestCash")
    });
  }

  function submitTradeProposal() {
    if (!canPlayerTradeNow()) {
      presentation.tradeFeedback = { tone: "reject", text: "只有在你的回合才能进行地产交易。" };
      renderManagement();
      return;
    }
    const proposal = readTradeProposal();
    const before = captureEconomySnapshot();
    const result = TradeFlow.settleTradeProposal(Engine, state, proposal);
    if (!result.executed) {
      presentation.tradeFeedback = { tone: "reject", text: result.reason };
      renderManagement();
      return;
    }
    const transferText = result.transfers
      .map((transfer) => {
        const recipient = Engine.getPlayer(state, transfer.toPlayerId);
        return `${transfer.tileName} → ${transfer.toPlayerId === "player" ? "你" : recipient ? recipient.name : "对方"}`;
      })
      .join("；");
    presentation.tradeFeedback = {
      tone: "accept",
      text: transferText ? `交易完成，地产已转移：${transferText}。` : "交易完成，双方现金已同步结算。"
    };
    presentation.tradeOfferedTileId = null;
    presentation.assetOwnerId = "player";
    presentation.activeView = "assets";
    enqueueEconomyEffects(before);
    afterAction();
  }

  function tradePropertyOptions(playerId, selectedTileId) {
    const options = tradeableOwnedTiles(playerId)
      .map((tile) => {
        const group = tile.groupId ? Engine.GROUPS[tile.groupId] : null;
        const label = `${tile.name} · ${group ? group.name : tileTypeName(tile.type)}${tile.isMortgaged ? " · 已抵押" : ""}`;
        return `<option value="${tile.id}" ${tile.id === selectedTileId ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("");
    return `<option value="">不提供地产</option>${options}`;
  }

  function renderTradeComposer(canTrade) {
    if (!presentation.tradeOpen) {
      return `<button class="trade-entry" data-action="open-trade" ${canTrade && activeTradePartners().length ? "" : "disabled"}>发起地产交易</button>`;
    }
    const partners = activeTradePartners();
    if (!partners.length) return '<p class="empty-state">没有可交易的对手。</p>';
    if (!partners.some((player) => player.id === presentation.tradePartnerId)) presentation.tradePartnerId = partners[0].id;
    const partner = Engine.getPlayer(state, presentation.tradePartnerId) || partners[0];
    const feedback = presentation.tradeFeedback
      ? `<p class="trade-feedback trade-${presentation.tradeFeedback.tone}" role="status">${escapeHtml(presentation.tradeFeedback.text)}</p>`
      : '<p class="trade-feedback">对方会按地产估值、成套价值与人格安全线判断。</p>';
    return `
      <section class="trade-composer" aria-label="双边地产交易">
        <div class="trade-heading">
          <div><p class="panel-label">双边报价</p><h3>地产与资金同时交换</h3></div>
          <button data-action="close-trade" aria-label="关闭交易">×</button>
        </div>
        <label class="trade-partner">交易对手
          <select id="tradePartner" data-trade-field="partner">
            ${partners.map((player) => `<option value="${player.id}" ${player.id === partner.id ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("")}
          </select>
        </label>
        <div class="trade-sides">
          <fieldset>
            <legend>你提供</legend>
            <label>地产<select id="tradeOfferTile">${tradePropertyOptions("player", presentation.tradeOfferedTileId)}</select></label>
            <label>现金<input id="tradeOfferCash" type="number" min="0" step="10" value="0" inputmode="numeric"></label>
          </fieldset>
          <span class="trade-swap" aria-hidden="true">⇄</span>
          <fieldset>
            <legend>${escapeHtml(partner.name)}提供</legend>
            <label>地产<select id="tradeRequestTile">${tradePropertyOptions(partner.id, null)}</select></label>
            <label>现金<input id="tradeRequestCash" type="number" min="0" step="10" value="0" inputmode="numeric"></label>
          </fieldset>
        </div>
        ${feedback}
        <button class="primary trade-submit" data-action="submit-trade" ${canTrade ? "" : "disabled"}>提交报价</button>
      </section>
    `;
  }

  function displayRentLevel(tile) {
    return isLandmarkBuilt(tile) ? Engine.STANDARD_LANDMARK_LEVEL : tile.houseLevel;
  }

  function upgradeTrack(tile) {
    const currentRent = Engine.getRentAtLevel(tile, displayRentLevel(tile));
    const stock = Engine.getBuildingStock(state);
    const landmarkLevel = Engine.getLandmarkLevel(state);
    return `
      <div class="upgrade-track" aria-label="建筑等级">
        ${Array.from({ length: landmarkLevel })
          .map((_, index) => {
            const level = index + 1;
            const active = level <= tile.houseLevel ? "is-active" : "";
            const rentLevel = level >= landmarkLevel ? Engine.STANDARD_LANDMARK_LEVEL : level;
            const spike = Engine.isRentSpikeLevel(rentLevel) ? "is-spike" : "";
            return `<span class="${active} ${spike}">${level >= landmarkLevel ? "标" : level}</span>`;
          })
          .join("")}
      </div>
      <p class="upgrade-note">
        当前租金 ${money(currentRent)}。持有街区 2/3 可开始均匀建造，买齐后未建房租金翻倍；第 ${landmarkLevel} 级为地标，银行余 ${stock.availableHouses} 房 / ${stock.availableLandmarks} 标。
      </p>
    `;
  }

  function renderAssetPlayerTabs(activePlayerId) {
    return `
      <div class="asset-player-tabs" role="tablist" aria-label="查看玩家资产">
        ${state.players.map((player) => {
          const appearance = playerAppearance(player);
          const propertyCount = Engine.getOwnedProperties(state, player.id).length;
          const active = player.id === activePlayerId;
          return `
            <button
              type="button"
              class="asset-player-tab ${active ? "is-active" : ""}"
              style="--asset-player-color:${appearance.color}"
              data-action="view-player-assets"
              data-player-id="${player.id}"
              role="tab"
              aria-selected="${active ? "true" : "false"}"
            >
              <span><span class="asset-player-dot" aria-hidden="true"></span><strong>${escapeHtml(player.name)}${Agents.isHuman(player) ? "（你）" : ""}</strong></span>
              <small>${propertyCount} 项 · ${money(player.cash)}</small>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderAssetOwnerSummary(player, properties) {
    const buildingCounts = Engine.getOwnedBuildingCounts(state, player.id);
    const mortgagedCount = properties.filter((tile) => tile.isMortgaged).length;
    const passCount = Engine.getControlPassCount(player);
    return `
      <section class="asset-owner-summary" aria-label="${escapeHtml(player.name)}资产概览">
        <p><span>现金</span><strong>${money(player.cash)}</strong></p>
        <p><span>净资产</span><strong>${money(Engine.getNetWorth(state, player.id))}</strong></p>
        <p><span>地契</span><strong>${properties.length} 项</strong></p>
        <p><span>建筑</span><strong>${buildingCounts.houses} 房 · ${buildingCounts.landmarks} 标</strong></p>
        <p><span>抵押 / 通行证</span><strong>${mortgagedCount} / ${passCount}</strong></p>
      </section>
    `;
  }

  function renderManagement() {
    let viewedPlayer = Engine.getPlayer(state, presentation.assetOwnerId);
    if (!viewedPlayer) {
      presentation.assetOwnerId = "player";
      viewedPlayer = Engine.getPlayer(state, "player");
    }
    const ownerId = viewedPlayer ? viewedPlayer.id : "player";
    const isOwnPortfolio = ownerId === "player";
    const properties = Engine.getOwnedProperties(state, ownerId);
    const isPlayerTurn = state.status === "playing" && state.activePlayerId === "player";
    const canManageAssets = isOwnPortfolio && isPlayerTurn && (state.phase === "management" || state.phase === "debt");
    const canTrade = isOwnPortfolio && isPlayerTurn;
    const passRow = controlPassRow(ownerId, isOwnPortfolio);
    const groupedProperties = properties.reduce((groups, tile) => {
      const group = tile.groupId ? Engine.GROUPS[tile.groupId] : null;
      const key = tile.groupId || tile.type;
      if (!groups.has(key)) groups.set(key, { label: group ? group.name : tileTypeName(tile.type), tiles: [] });
      groups.get(key).tiles.push(tile);
      return groups;
    }, new Map());
    const propertyGroups = Array.from(groupedProperties.values())
      .map(
        (group) => `
          <section class="asset-group">
            <div class="asset-group-heading"><h3>${escapeHtml(group.label)}</h3><span>${group.tiles.length} 项资产</span></div>
            <div class="asset-group-list">${group.tiles.map((tile) => propertyRow(tile, canManageAssets, canTrade, ownerId)).join("")}</div>
          </section>
        `
      )
      .join("");
    refs.management.innerHTML = `
      <div class="panel-heading">
        <p class="panel-label">资产管理</p>
        <h2>${isOwnPortfolio ? "你的资产" : `${escapeHtml(viewedPlayer.name)}的资产`} · ${properties.length} 项</h2>
      </div>
      ${renderAssetPlayerTabs(ownerId)}
      ${renderAssetOwnerSummary(viewedPlayer, properties)}
      ${isOwnPortfolio ? renderTradeComposer(canTrade) : '<p class="asset-readonly-note">对手资产为只读；展开地契可查看价格、建筑、抵押状态与地图详情。</p>'}
      ${passRow}
      ${propertyGroups || (passRow ? "" : '<p class="empty-state">暂无资产</p>')}
    `;
  }

  function controlPassRow(playerId, isOwnPortfolio) {
    const player = Engine.getPlayer(state, playerId);
    if (!player) return "";
    const passCount = Engine.getControlPassCount(player);
    if (passCount <= 0) return "";
    return `
      <article class="asset-row">
        <div class="asset-color" style="--asset-color:#5c7cfa"></div>
        <div class="asset-main">
          <strong>交通管制通行证</strong>
          <span>持有 ${passCount} 张 · 被管制时可免费离开</span>
          <small>${isOwnPortfolio ? "可保留到被管制时使用；多人公开交易将在后续版本开放。" : `${escapeHtml(player.name)}持有的特殊资产。`}</small>
        </div>
        ${isOwnPortfolio ? '<div class="asset-actions"><button disabled>保留</button></div>' : '<span class="asset-readonly-status">只读</span>'}
      </article>
    `;
  }

  function propertyRow(tile, canManageAssets, canTrade, ownerId = "player") {
    const isOwnPortfolio = ownerId === "player";
    const isStreet = tile.type === "property";
    const buildable = isOwnPortfolio && canManageAssets && state.phase === "management" && Engine.canBuildOnTile(state, tile.id, ownerId);
    const sellable = isOwnPortfolio && canManageAssets && Engine.canSellHouse(state, tile.id, ownerId);
    const mortgageable = isOwnPortfolio && canManageAssets && Engine.canMortgageProperty(state, tile.id, ownerId);
    const redeemable = isOwnPortfolio && canManageAssets && state.phase === "management" && Engine.canRedeemProperty(state, tile.id, ownerId);
    const group = tile.groupId ? Engine.GROUPS[tile.groupId] : null;
    const assetColor = group ? group.color : tile.type === "station" ? "#8b7355" : "#4f8f91";
    const currentRent = Engine.calculateRent(state, tile.id);
    const nextRent = isStreet && !isLandmarkBuilt(tile) ? Engine.getRentAtLevel(tile, nextRentLevel(tile)) : null;
    const buildCost = isOwnPortfolio && isStreet && !isLandmarkBuilt(tile) ? Engine.getBuildCost(state, tile.id, ownerId) : null;
    const spikeLabel = isStreet && !isLandmarkBuilt(tile) && Engine.isRentSpikeLevel(nextRentLevel(tile)) ? " · 跳涨" : "";
    const districtOwned = isStreet ? Engine.getGroupTiles(state, tile.groupId).filter((item) => item.ownerId === ownerId).length : 0;
    const districtTotal = isStreet ? Engine.getGroupTiles(state, tile.groupId).length : 0;
    const stock = Engine.getBuildingStock(state);
    const stockBlocked =
      isOwnPortfolio &&
      isStreet &&
      tile.ownerId === ownerId &&
      ((tile.houseLevel < 4 && stock.availableHouses <= 0) || (tile.houseLevel === 4 && stock.availableLandmarks <= 0));
    const buildHint = !isOwnPortfolio
      ? tile.isMortgaged
        ? "已抵押，当前不收租"
        : isStreet
          ? `控制该街区 ${districtOwned}/${districtTotal}`
          : `${tileTypeName(tile.type)} · 当前正常运营`
      : buildable
      ? "可建房"
      : !isStreet
        ? tile.type === "station"
          ? "交通站不能建房；持有越多，同类租金越高"
          : "公用事业不能建房；租金按本次骰点倍数计算"
      : stockBlocked
        ? tile.houseLevel === 4
          ? "银行地标已用完，需等待有人卖回"
          : "银行房屋已用完，需等待有人卖回"
      : isLandmarkBuilt(tile)
        ? "已满级"
        : `建房需控制街区至少 2/3 并均匀升级（${districtOwned}/${districtTotal}）`;
    const tradeHint = tile.type === "property" && Engine.getGroupTiles(state, tile.groupId).some((item) => item.houseLevel > 0)
      ? "街区有建筑，需先卖回才能交易"
      : "可加入双边报价";
    return `
      <details class="asset-row asset-disclosure ${isOwnPortfolio ? "" : "is-readonly"}">
        <summary>
          <span class="asset-color" style="--asset-color:${assetColor}"></span>
          <span class="asset-main">
            <strong>${escapeHtml(tile.name)}</strong>
            <span>${buildingText(tile)} · 租 ${money(currentRent)}${nextRent ? ` → ${money(nextRent)}${spikeLabel}` : ""}</span>
            <small>${escapeHtml(tile.feature || (group && group.strategy) || "资产地契")} · ${buildHint}</small>
          </span>
          <span class="asset-manage-label">${isOwnPortfolio ? "管理" : "查看"}</span>
        </summary>
        ${isOwnPortfolio ? `
          <div class="asset-actions">
            <button data-action="build" data-tile-id="${tile.id}" aria-label="在${escapeHtml(tile.name)}建房" ${buildable ? "" : "disabled"}>${buildCost ? `建房 ${money(buildCost)}` : "已满级"}</button>
            <button data-action="sell" data-tile-id="${tile.id}" aria-label="出售${escapeHtml(tile.name)}的房屋" ${sellable ? "" : "disabled"}>卖房</button>
            <button data-action="mortgage" data-tile-id="${tile.id}" aria-label="抵押${escapeHtml(tile.name)}" ${mortgageable ? "" : "disabled"}>抵押</button>
            <button data-action="redeem" data-tile-id="${tile.id}" aria-label="赎回${escapeHtml(tile.name)}" ${redeemable ? "" : "disabled"}>赎回</button>
            <button data-action="open-trade" data-tile-id="${tile.id}" aria-label="交易${escapeHtml(tile.name)}" ${canTrade && tradeableOwnedTiles(ownerId).some((item) => item.id === tile.id) ? "" : "disabled"}>交易</button>
          </div>
          <p class="asset-trade-hint">${tradeHint}</p>
        ` : `
          <div class="asset-readonly-details">
            <span><small>购入价</small><strong>${money(tile.price)}</strong></span>
            <span><small>当前租金</small><strong>${money(currentRent)}</strong></span>
            <span><small>建筑</small><strong>${buildingText(tile)}</strong></span>
            <span><small>状态</small><strong>${tile.isMortgaged ? "已抵押" : "正常"}</strong></span>
            <button data-action="inspect-asset" data-tile-id="${tile.id}" aria-label="在地图查看${escapeHtml(tile.name)}">地图详情</button>
          </div>
          <p class="asset-trade-hint">对手资产只读；你不能替其建房、出售或抵押。</p>
        `}
      </details>
    `;
  }

  function renderLog() {
    const groups = state.logs.slice(0, 18).reduce((result, item) => {
      const current = result[result.length - 1];
      if (!current || current.round !== item.round) result.push({ round: item.round, items: [item] });
      else current.items.push(item);
      return result;
    }, []);
    refs.log.innerHTML = groups
      .map(
        (group) => `
          <li class="log-round-group">
            <h3>第 ${group.round} 轮</h3>
            <ol>
              ${group.items
                .map((item) => {
                  const meta = logEventMeta(item.message);
                  return `<li class="log-entry log-${meta.tone}"><span aria-hidden="true">${meta.icon}</span><p>${escapeHtml(item.message)}</p></li>`;
                })
                .join("")}
            </ol>
          </li>
        `
      )
      .join("");
  }

  function logEventMeta(message) {
    const text = String(message || "");
    if (/破产|淘汰|债务|税|罚/.test(text)) return { icon: "!", tone: "risk" };
    if (/建房|地标|升级/.test(text)) return { icon: "建", tone: "build" };
    if (/购买|买下|竞拍|拍卖|地契/.test(text)) return { icon: "契", tone: "claim" };
    if (/租金|支付|获得|领取|金币/.test(text)) return { icon: "币", tone: "money" };
    return { icon: "·", tone: "neutral" };
  }

  function renderSettings() {
    if (!refs.settingsPanel) return;
    const hasSave = Boolean(loadSavedGame());
    refs.settingsPanel.innerHTML = `
      <section class="settings-group">
        <div class="settings-group-heading"><h3>对局规则</h3><span>标记为“新对局”的项目不会改变当前进度</span></div>
        <label class="setting-row" for="ruleset">
          <span><strong>规则版本 <em>新对局</em></strong><small>短局包含开局免费地契和 3 栋房后升级地标。</small></span>
          <select id="ruleset" data-setting="ruleset">
            <option value="${Engine.STANDARD_RULESET}" ${settings.ruleset === Engine.STANDARD_RULESET ? "selected" : ""}>标准局</option>
            <option value="${Engine.SHORT_RULESET}" ${settings.ruleset === Engine.SHORT_RULESET ? "selected" : ""}>官方短局</option>
          </select>
        </label>
        <div class="setting-row setting-static">
          <span><strong>终局条件</strong><small>没有轮数上限；你破产，或三名 Agent 全部破产时才结束。</small></span>
          <strong>破产生存制</strong>
        </div>
        <label class="setting-row" for="agentDifficulty">
          <span><strong>Agent 难度 <em>新对局</em></strong><small>只调整公开策略阈值，不改变骰子、租金或隐藏信息。</small></span>
          <select id="agentDifficulty" data-setting="agentDifficulty">
            <option value="easy" ${settings.agentDifficulty === "easy" ? "selected" : ""}>轻松 · 更保守</option>
            <option value="standard" ${settings.agentDifficulty === "standard" ? "selected" : ""}>标准 · 当前基线</option>
            <option value="hard" ${settings.agentDifficulty === "hard" ? "selected" : ""}>挑战 · 更积极</option>
          </select>
        </label>
        <div class="setting-row">
          <span><strong>Agent 决策源</strong><small>由 AI HUB 统一调用 Hub GPT；路由不可用或返回非法动作时自动切回本地人格规则。</small></span>
          <output aria-label="当前 Agent 决策源">Hub GPT</output>
        </div>
      </section>
      <section class="settings-group">
        <div class="settings-group-heading"><h3>表现与辅助</h3><span>即时生效</span></div>
        <label class="setting-row" for="animationSpeed">
          <span><strong>动画速度</strong><small>影响骰子、棋子移动和经济反馈的节奏。</small></span>
          <select id="animationSpeed" data-setting="animationSpeed">
            <option value="slow" ${settings.animationSpeed === "slow" ? "selected" : ""}>慢速</option>
            <option value="normal" ${settings.animationSpeed === "normal" ? "selected" : ""}>标准</option>
            <option value="fast" ${settings.animationSpeed === "fast" ? "selected" : ""}>快速</option>
          </select>
        </label>
        <label class="setting-row setting-check">
          <span><strong>减少动效</strong><small>尽量缩短动画，用于更安静或更敏感的环境。</small></span>
          <input type="checkbox" data-setting="reduceMotion" ${settings.reduceMotion ? "checked" : ""} />
        </label>
        <label class="setting-row setting-check">
          <span><strong>静音</strong><small>关闭骰子、棋子、金币、建筑和终局音效。</small></span>
          <input type="checkbox" data-setting="muted" ${settings.muted ? "checked" : ""} />
        </label>
        <label class="setting-row setting-check">
          <span><strong>首局提示</strong><small>只解释当前动作，完成首回合后自动停止。</small></span>
          <input type="checkbox" data-profile-setting="tutorialEnabled" ${playerProfile.tutorialEnabled ? "checked" : ""} />
        </label>
      </section>
      <section class="settings-group settings-data-group">
        <div class="settings-group-heading"><h3>对局与本机数据</h3><span>请谨慎操作</span></div>
        <div class="settings-actions">
          <button class="primary" data-action="new-game">按当前设置开新对局</button>
          <button data-action="restart-tutorial">重新开始首局提示</button>
          <button data-action="reset-settings">恢复默认设置</button>
          <button class="danger" data-action="clear-save" ${hasSave ? "" : "disabled"}>清空本机存档</button>
        </div>
        <p class="settings-note">设置会自动保存到本机浏览器；新开对局会替换当前进度。当前 Agent：${escapeHtml(agentGatewayStatus)}。</p>
      </section>
    `;
  }

  function latestLogText() {
    const latest = state.logs && state.logs[0];
    return escapeHtml(latest ? latest.message : "对局开始，等待第一步行动。");
  }

  function riskHint() {
    const player = Engine.getPlayer(state, "player");
    const dangerousTiles = state.tiles
      .filter((tile) => Engine.isPurchasableTile(tile) && tile.ownerId && tile.ownerId !== "player")
      .map((tile) => ({ tile, rent: Engine.calculateRent(state, tile.id) }))
      .filter((item) => item.rent >= Math.max(120, player.cash * 0.22))
      .sort((a, b) => b.rent - a.rent)
      .slice(0, 2);
    const buildable = Engine.getOwnedProperties(state, "player").filter((tile) => Engine.canBuildOnTile(state, tile.id, "player"));
    if (!dangerousTiles.length && !buildable.length) return "";
    return `
      <div class="situation-hint">
        ${
          dangerousTiles.length
            ? `<span>高租风险：${dangerousTiles.map((item) => `${item.tile.name} ${money(item.rent)}`).join(" / ")}</span>`
            : ""
        }
        ${buildable.length ? `<span>可建房：${buildable.slice(0, 2).map((tile) => tile.name).join("、")}</span>` : ""}
      </div>
    `;
  }

  function renderFeedback() {
    const model = getFeedbackModel();
    if (!model) {
      if (!feedbackTimer) refs.feedbackLayer.hidden = true;
      return;
    }
    if (model.key === activeFeedbackKey) return;
    if (dismissedFeedbackKeys.has(model.key)) return;
    activeFeedbackKey = model.key;
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
    if (AudioManager && model.type === "card") AudioManager.play("card");
    refs.feedbackLayer.hidden = false;
    refs.feedbackLayer.innerHTML = feedbackHtml(model);
    if (!model.sticky) {
      feedbackTimer = window.setTimeout(() => {
        feedbackTimer = null;
        if (activeFeedbackKey === model.key) clearFeedback();
      }, model.duration || 2600);
    }
  }

  function getFeedbackModel() {
    if (state.phase === "choice" && state.pending && state.pending.cardId) {
      const card = Engine.getCardById(state.pending.cardId, state.pending.deck || "event");
      if (!card) return null;
      return {
        key: `choice-${state.pending.deck}-${card.id}`,
        type: "card",
        deck: state.pending.deck === "chance" ? "机遇卡" : "城市事件",
        title: card.title,
        body: card.description,
        choices: card.choices || [],
        sticky: state.pending.playerId === "player"
      };
    }

    if (state.phase === "tax-choice" && state.pending && state.pending.tileId !== undefined) {
      const tile = Engine.getTile(state, state.pending.tileId);
      const fixedAmount = tile.fixedAmount || Engine.INCOME_TAX_FIXED_AMOUNT;
      const rateLabel = `${Math.round((tile.percent || Engine.INCOME_TAX_RATE) * 100)}%`;
      return {
        key: `tax-${state.pending.playerId}-${tile.id}`,
        type: "card",
        deck: "税务格",
        title: tile.name,
        body: "请选择本次所得税方案。",
        choices: [
          { label: `缴纳固定 ${money(fixedAmount)}`, action: "tax-choice", choiceKind: "fixed" },
          { label: `缴纳总资产 ${rateLabel}`, action: "tax-choice", choiceKind: "percent" }
        ],
        sticky: state.pending.playerId === "player"
      };
    }

    const latest = state.logs && state.logs[0];
    if (!latest) return null;
    const message = latest.message || "";
    if (/抽到|购买|建房|收取|支付|破产|竞拍|AI 解释/.test(message)) {
      return {
        key: `log-${latest.id}`,
        type: message.includes("AI 解释") ? "ai" : message.includes("抽到") ? "card" : "event",
        deck: message.includes("机遇") ? "机遇卡" : message.includes("抽到") ? "城市事件" : "局势变化",
        title: feedbackTitle(message),
        body: message,
        sticky: false,
        duration: message.includes("AI 解释") ? 3200 : 2400
      };
    }
    return null;
  }

  function feedbackTitle(message) {
    if (message.includes("AI 解释")) return "AI 决策";
    if (message.includes("抽到")) return "翻开卡牌";
    if (message.includes("建房")) return "建筑升级";
    if (message.includes("购买")) return "地契入手";
    if (message.includes("支付") || message.includes("收取")) return "租金结算";
    if (message.includes("竞拍")) return "竞拍结果";
    return "事件反馈";
  }

  function feedbackHtml(model) {
    if (model.type === "card") {
      return `
        <article class="feedback-card feedback-${model.deck === "机遇卡" ? "chance" : "event"}">
          <button class="feedback-close" data-action="close-feedback" aria-label="关闭反馈">×</button>
          <p class="card-deck">${escapeHtml(model.deck)}</p>
          <h2>${escapeHtml(model.title)}</h2>
          <p>${escapeHtml(model.body)}</p>
          ${
            model.choices
              ? `<div class="feedback-choices">${model.choices
                  .map((choice, index) => {
                    const action = choice.action || "choice";
                    const choiceKind = choice.choiceKind ? ` data-choice-kind="${choice.choiceKind}"` : "";
                    return `<button data-action="${action}" data-index="${index}"${choiceKind}>${escapeHtml(choice.label)}</button>`;
                  })
                  .join("")}</div>`
              : ""
          }
        </article>
      `;
    }
    return `
      <article class="feedback-toast feedback-${model.type}">
        <button class="feedback-close" data-action="close-feedback" aria-label="关闭反馈">×</button>
        <strong>${escapeHtml(model.title)}</strong>
        <span>${escapeHtml(model.body)}</span>
      </article>
    `;
  }

  function clearFeedback() {
    if (feedbackTimer) window.clearTimeout(feedbackTimer);
    feedbackTimer = null;
    if (activeFeedbackKey) dismissedFeedbackKeys.add(activeFeedbackKey);
    activeFeedbackKey = "";
    refs.feedbackLayer.hidden = true;
    refs.feedbackLayer.innerHTML = "";
  }

  function renderResult() {
    if (state.status !== "game-over" || !state.result || presentation.resultDismissed) {
      refs.resultModal.hidden = true;
      return;
    }
    const winner = state.result.winnerId ? Engine.getPlayer(state, state.result.winnerId).name : "平局";
    const winnerPlayer = state.result.winnerId ? Engine.getPlayer(state, state.result.winnerId) : null;
    const winnerAppearance = winnerPlayer ? playerAppearance(winnerPlayer) : { color: "#d9a83c", emblem: "◇" };
    const standings = Array.isArray(state.result.standings) ? state.result.standings : [];
    const resultKey = `${state.result.winnerId || "draw"}:${state.result.reason}`;
    if (presentation.lastResultKey !== resultKey) {
      presentation.lastResultKey = resultKey;
      if (AudioManager) AudioManager.play("victory");
    }
    refs.resultModal.hidden = false;
    refs.resultContent.innerHTML = `
      <div class="result-ceremony" style="--winner-color:${winnerAppearance.color}">
        <span class="result-token" aria-hidden="true">${winnerAppearance.emblem}</span>
        <div>
          <p class="panel-label">城市最终排名</p>
          <h2>${escapeHtml(winner)}${winnerPlayer ? " 获胜" : ""}</h2>
          <p>${escapeHtml(state.result.reason)}</p>
        </div>
      </div>
      <ol class="result-standings">
        ${standings.map((standing) => `
          <li class="${standing.status === "eliminated" ? "is-eliminated" : ""}">
            <strong>${standing.rank}</strong>
            <span>${escapeHtml(standing.name)}${standing.rank === 1 ? " · 城市之冠" : ""}</span>
            <small>${standing.status === "eliminated" ? `第 ${standing.eliminatedAtRound || "-"} 轮淘汰` : money(standing.netWorth)}</small>
          </li>
        `).join("")}
      </ol>
      <div class="result-actions">
        <button data-action="close-result">查看最终棋盘</button>
        <button class="primary" data-action="new-game">再来一局</button>
      </div>
    `;
  }

  function queueAi() {
    if (presentation.isAnimating) return;
    if (aiTimer || agentInFlight || state.status !== "playing") return;
    const actorId = Agents.getRequiredActorId(state);
    const actor = actorId ? Engine.getPlayer(state, actorId) : null;
    if (!actor || Agents.isHuman(actor)) return;
    aiTimer = window.setTimeout(runAiStep, motionMs(settings.animationSpeed === "fast" ? 110 : 260));
  }

  async function requestRemoteDecision(context) {
    if (settings.agentMode !== "hub" || !/^https?:$/.test(window.location.protocol)) return null;
    agentRequestController = new AbortController();
    const timeout = window.setTimeout(() => agentRequestController && agentRequestController.abort(), 3500);
    try {
      const response = await fetch("/api/agent/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: agentRequestController.signal,
        body: JSON.stringify({
          profileId: context.profile.id,
          request: Agents.toModelRequest(context)
        })
      });
      if (!response.ok) {
        agentGatewayStatus = "本地规则（Hub GPT 不可用）";
        return null;
      }
      const payload = await response.json();
      agentGatewayStatus = "Hub GPT";
      return payload.decision || null;
    } catch (error) {
      agentGatewayStatus = "本地规则（已安全降级）";
      return null;
    } finally {
      window.clearTimeout(timeout);
      agentRequestController = null;
    }
  }

  async function runAiStep() {
    aiTimer = null;
    const actorId = Agents.getRequiredActorId(state);
    const actor = actorId ? Engine.getPlayer(state, actorId) : null;
    if (!actor || Agents.isHuman(actor) || state.status !== "playing") return;
    agentInFlight = true;
    const before = captureEconomySnapshot();
    let decision = null;
    let animatedActionStarted = false;
    try {
      const context = Agents.buildDecisionContext(state, actorId);
      const onlyLegalAction = context.legalActions && context.legalActions.length === 1;
      decision = onlyLegalAction ? Agents.chooseDeterministicAction(context) : await requestRemoteDecision(context);
      if (!Agents.validateAgentDecision(context, decision).valid) decision = Agents.chooseDeterministicAction(context);
      if (!Agents.validateAgentDecision(context, decision).valid) decision = Agents.chooseFallbackAction(context);

      if (decision && decision.actionType === "ROLL_DICE") {
        if (decision.publicLine) Engine.log(state, `${actor.name}：${decision.publicLine}`);
        animatedActionStarted = true;
        agentInFlight = false;
        rollWithAnimation();
        return;
      }
      if (decision && decision.actionType === "CONTROL_ROLL") {
        if (decision.publicLine) Engine.log(state, `${actor.name}：${decision.publicLine}`);
        animatedActionStarted = true;
        agentInFlight = false;
        controlRollWithAnimation(actorId);
        return;
      }

      let executed = decision ? Agents.executeDecision(state, context, decision) : false;
      if (!executed) {
        const currentContext = Agents.buildDecisionContext(state, actorId);
        decision = Agents.chooseFallbackAction(currentContext);
        executed = Agents.executeDecision(state, currentContext, decision);
      }
      if (executed) {
        showAgentSpeech(actor, decision);
        if (AudioManager && decision && decision.actionType === "AUCTION_BID") AudioManager.play("auction");
      }
    } catch (error) {
      console.warn("Agent step failed; applying deterministic recovery", error);
      const recoveryContext = Agents.buildDecisionContext(state, actorId);
      decision = Agents.chooseFallbackAction(recoveryContext);
      if (Agents.executeDecision(state, recoveryContext, decision)) showAgentSpeech(actor, decision);
    } finally {
      if (animatedActionStarted) return;
      enqueueEconomyEffects(before);
      agentInFlight = false;
      saveGame();
      render();
    }
  }

  function clearAiTimer() {
    if (aiTimer) window.clearTimeout(aiTimer);
    if (agentRequestController) agentRequestController.abort();
    aiTimer = null;
    agentRequestController = null;
    agentInFlight = false;
  }

  function money(value) {
    return `￥${Math.floor(value)}`;
  }
})();
