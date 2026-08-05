(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DiceEstateDiceAnimation = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NORMAL_PROFILE = Object.freeze({
    windupHoldMs: 110,
    contactHoldsMs: Object.freeze([64, 72, 84, 102, 128, 164]),
    settleMotionMs: 220,
    resultHoldMs: 300,
    tumbleCycleMs: 360,
    glintMs: 240
  });

  const PIP_MAP = Object.freeze({
    1: Object.freeze([5]),
    2: Object.freeze([1, 9]),
    3: Object.freeze([1, 5, 9]),
    4: Object.freeze([1, 3, 7, 9]),
    5: Object.freeze([1, 3, 5, 7, 9]),
    6: Object.freeze([1, 3, 4, 6, 7, 9])
  });

  function normalizedScale(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0.01, Math.min(2, number)) : 1;
  }

  function scaled(milliseconds, scale) {
    return Math.max(1, Math.round(milliseconds * normalizedScale(scale)));
  }

  function randomFace(random) {
    const value = Math.max(0, Math.min(0.999999, Number(random()) || 0));
    return Math.floor(value * 6) + 1;
  }

  function createDiceTimeline(options = {}) {
    if (options.reduceMotion) {
      return {
        frames: [],
        settleMotionMs: 1,
        resultHoldMs: 120,
        tumbleCycleMs: 1,
        glintMs: 1
      };
    }
    const motionScale = normalizedScale(options.motionScale);
    const random = typeof options.random === "function" ? options.random : Math.random;
    const frames = [
      { phase: "windup", faces: null, contactIndex: 0, holdMs: scaled(NORMAL_PROFILE.windupHoldMs, motionScale) }
    ];
    NORMAL_PROFILE.contactHoldsMs.forEach((hold, index) => {
      frames.push({
        phase: "rolling",
        faces: [randomFace(random), randomFace(random)],
        contactIndex: index + 1,
        holdMs: scaled(hold, motionScale)
      });
    });
    return {
      frames,
      settleMotionMs: scaled(NORMAL_PROFILE.settleMotionMs, motionScale),
      resultHoldMs: scaled(NORMAL_PROFILE.resultHoldMs, motionScale),
      tumbleCycleMs: scaled(NORMAL_PROFILE.tumbleCycleMs, motionScale),
      glintMs: scaled(NORMAL_PROFILE.glintMs, motionScale)
    };
  }

  async function playDiceTimeline(timeline, hooks) {
    const shouldContinue = hooks.shouldContinue || (() => true);
    for (const frame of timeline.frames) {
      if (!shouldContinue()) return false;
      hooks.onFrame(frame);
      await hooks.wait(frame.holdMs);
    }
    return shouldContinue();
  }

  function pipIndexes(value) {
    return Array.from(PIP_MAP[value] || []);
  }

  function isDouble(dice) {
    return Array.isArray(dice) && dice.length === 2 && dice[0] === dice[1];
  }

  return { createDiceTimeline, playDiceTimeline, pipIndexes, isDouble };
});
