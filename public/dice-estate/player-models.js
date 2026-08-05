(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DiceEstatePlayerModels = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MODEL_SPECS = Object.freeze({
    player: Object.freeze({
      seatKey: "player",
      displayName: "林浩",
      modelKey: "lin-hao-image2-v1",
      imagePath: "assets/players/lin-hao-token.png"
    }),
    red: Object.freeze({
      seatKey: "red",
      displayName: "陈锋",
      modelKey: "chen-feng-image2-v1",
      imagePath: "assets/players/chen-feng-token.png"
    }),
    stone: Object.freeze({
      seatKey: "stone",
      displayName: "周岩",
      modelKey: "zhou-yan-image2-v1",
      imagePath: "assets/players/zhou-yan-token.png"
    }),
    weaver: Object.freeze({
      seatKey: "weaver",
      displayName: "苏晴",
      modelKey: "su-qing-image2-v1",
      imagePath: "assets/players/su-qing-token.png"
    })
  });

  function getModelSpec(seatKey) {
    if (typeof seatKey !== "string") return null;
    return MODEL_SPECS[seatKey] || null;
  }

  function modeledSeatKeys() {
    return Object.keys(MODEL_SPECS);
  }

  return { getModelSpec, modeledSeatKeys };
});
