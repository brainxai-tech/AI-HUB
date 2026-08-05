(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DiceEstateOnboarding = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ACTION_PROGRESS = Object.freeze({
    roll: "roll",
    buy: "property",
    "auction-start": "property",
    "submit-bid": "auction",
    "auction-pass": "auction",
    build: "management",
    sell: "management",
    mortgage: "management",
    redeem: "management",
    "auto-debt": "debt",
    "end-turn": "turn"
  });

  function step(id, title, body, targetActions) {
    return { id, title, body, targetActions };
  }

  function isHumanMoment(state) {
    if (!state || state.status === "game-over") return false;
    const pending = state.pending || {};
    const actorId = pending.activeBidderId || pending.playerId || pending.ownerId || state.activePlayerId;
    return actorId === "player";
  }

  function getStep(options = {}) {
    const game = options.state;
    const progress = options.progress || {};
    if (!options.enabled || !isHumanMoment(game) || isComplete(progress)) return null;
    if (game.phase === "debt") {
      return step("debt", "先恢复现金", "现金为负时先自动清算，之后再继续回合。", ["auto-debt"]);
    }
    if (!progress.roll && game.phase === "ready") {
      return step("roll", "掷骰开始", "点击骰子，棋子会逐格移动并自动结算落点。", ["roll"]);
    }
    if (game.phase === "purchase") {
      return step("property", "决定是否拿地", "购买会扩大资产；放弃购买则进入公开竞拍。", ["buy", "auction-start"]);
    }
    if (game.phase === "auction") {
      return step("auction", "竞价要留现金", "出价不要超过你的承受范围，也可以放弃。", ["submit-bid", "auction-pass"]);
    }
    if (game.phase === "management") {
      return step("finish-turn", "检查后结束回合", "可先管理资产；准备好后结束回合。", ["end-turn"]);
    }
    return null;
  }

  function recordAction(progress, action) {
    const key = ACTION_PROGRESS[action];
    return key ? { ...(progress || {}), [key]: true } : { ...(progress || {}) };
  }

  function isComplete(progress) {
    return Boolean(progress && progress.roll && progress.turn);
  }

  function targetSelector(currentStep) {
    return currentStep && Array.isArray(currentStep.targetActions)
      ? currentStep.targetActions.map((action) => `[data-action="${action}"]`).join(", ")
      : "";
  }

  return { getStep, recordAction, isComplete, targetSelector };
});
