(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DiceEstateDifficulty = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_DIFFICULTY = "standard";
  const PRESETS = Object.freeze({
    easy: Object.freeze({
      id: "easy",
      label: "轻松",
      reserveDelta: 150,
      tacticalReserveDelta: 100,
      bidMultiplier: 0.82,
      buildRoiDelta: 0.12,
      purchaseMultiplier: 1.12,
      auctionPressureMultiplier: 0.82
    }),
    standard: Object.freeze({
      id: "standard",
      label: "标准",
      reserveDelta: 0,
      tacticalReserveDelta: 0,
      bidMultiplier: 1,
      buildRoiDelta: 0,
      purchaseMultiplier: 1,
      auctionPressureMultiplier: 1
    }),
    hard: Object.freeze({
      id: "hard",
      label: "挑战",
      reserveDelta: 50,
      tacticalReserveDelta: 0,
      bidMultiplier: 1.05,
      buildRoiDelta: -0.05,
      purchaseMultiplier: 0.92,
      auctionPressureMultiplier: 1.08
    })
  });

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function normalizeDifficulty(value) {
    return Object.hasOwn(PRESETS, value) ? value : DEFAULT_DIFFICULTY;
  }

  function getPreset(value) {
    return { ...PRESETS[normalizeDifficulty(value)] };
  }

  function applyToProfile(profile, value) {
    const preset = PRESETS[normalizeDifficulty(value)];
    const source = profile || {};
    return {
      ...source,
      difficulty: preset.id,
      reserveMin: Math.max(0, Number(source.reserveMin || 0) + preset.reserveDelta),
      tacticalReserve: Math.max(0, Number(source.tacticalReserve || 0) + preset.tacticalReserveDelta),
      bidValueMultiplier: Number((Number(source.bidValueMultiplier || 1) * preset.bidMultiplier).toFixed(3)),
      bidListMultiplier: Number((Number(source.bidListMultiplier || 1) * preset.bidMultiplier).toFixed(3)),
      buildRoi: Number(clamp(Number(source.buildRoi || 0) + preset.buildRoiDelta, 0.05, 1).toFixed(3)),
      purchaseValueRatio: Number((Number(source.purchaseValueRatio || 1) * preset.purchaseMultiplier).toFixed(3)),
      auctionPressure: Number((Number(source.auctionPressure || 0.1) * preset.auctionPressureMultiplier).toFixed(3))
    };
  }

  return { DEFAULT_DIFFICULTY, PRESETS, normalizeDifficulty, getPreset, applyToProfile };
});
