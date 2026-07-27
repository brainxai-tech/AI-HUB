(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DiceEstateMapLayout = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const OVERVIEW_BREAKPOINT = 1100;
  const MOBILE_BREAKPOINT = 720;
  const MOBILE_FOCUS_SCALE = 1;
  const TABLET_FOCUS_SCALE = 1.05;
  const DESKTOP_FOCUS_SCALE = 1.1;

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function createMapPresentation(options = {}) {
    const viewportWidth = finite(options.viewportWidth, 1440);
    const containerWidth = finite(options.containerWidth, viewportWidth);
    const containerHeight = finite(options.containerHeight, 620);
    const mapWidth = finite(options.mapWidth, 1510);
    const mapHeight = finite(options.mapHeight, 1058);
    const requested = ["overview", "focus"].includes(options.requestedMode)
      ? options.requestedMode
      : viewportWidth >= OVERVIEW_BREAKPOINT
        ? "overview"
        : "focus";
    const mode = requested;
    const fitScale = clamp(
      Math.min(
        Math.max(1, containerWidth - 16) / mapWidth,
        Math.max(1, containerHeight - 16) / mapHeight,
        1
      ),
      0.1,
      1
    );
    const defaultFocusScale = viewportWidth <= MOBILE_BREAKPOINT
      ? MOBILE_FOCUS_SCALE
      : viewportWidth < OVERVIEW_BREAKPOINT
        ? TABLET_FOCUS_SCALE
        : DESKTOP_FOCUS_SCALE;
    const focusScale = clamp(finite(options.focusScale, defaultFocusScale), 0.6, 2.2);
    const scale = mode === "overview" ? fitScale : focusScale;
    const contentOffsetX = mode === "focus" ? Math.round(containerWidth / 2) : 0;
    const contentOffsetY = mode === "focus" ? Math.round(containerHeight / 2) : 0;
    return {
      mode,
      scale,
      stageWidth: Math.round(mapWidth * scale) + contentOffsetX * 2,
      stageHeight: Math.round(mapHeight * scale) + contentOffsetY * 2,
      contentOffsetX,
      contentOffsetY,
      detailLevel: mode === "overview" ? "compact" : "full",
      scrollable: mode === "focus"
    };
  }

  function getCenteredScroll(options = {}) {
    const scale = finite(options.scale, 1);
    const stageWidth = finite(options.stageWidth, 1);
    const stageHeight = finite(options.stageHeight, 1);
    const viewportWidth = finite(options.viewportWidth, 1);
    const viewportHeight = finite(options.viewportHeight, 1);
    const contentOffsetX = Math.max(0, Number(options.contentOffsetX) || 0);
    const contentOffsetY = Math.max(0, Number(options.contentOffsetY) || 0);
    const tileCenterX = (Number(options.tileLeft) + finite(options.tileWidth, 1) / 2) * scale + contentOffsetX;
    const tileCenterY = (Number(options.tileTop) + finite(options.tileHeight, 1) / 2) * scale + contentOffsetY;
    return {
      left: Math.round(clamp(tileCenterX - viewportWidth / 2, 0, Math.max(0, stageWidth - viewportWidth))),
      top: Math.round(clamp(tileCenterY - viewportHeight / 2, 0, Math.max(0, stageHeight - viewportHeight)))
    };
  }

  return { createMapPresentation, getCenteredScroll };
});
