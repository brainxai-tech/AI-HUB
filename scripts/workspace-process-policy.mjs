export const WINDOWS_TRANSIENT_FAST_FAIL = 0xc0000409;

export function isTransientWindowsFastFail(platform, status) {
  return platform === "win32" && Number.isInteger(status) && (status >>> 0) === WINDOWS_TRANSIENT_FAST_FAIL;
}

export function runWithTransientWindowsRetry(
  runOnce,
  { platform = process.platform, onRetry = () => {} } = {},
) {
  if (typeof runOnce !== "function") throw new TypeError("runOnce must be a function.");
  if (typeof onRetry !== "function") throw new TypeError("onRetry must be a function.");
  let result = runOnce();
  if (isTransientWindowsFastFail(platform, result?.status)) {
    onRetry(result);
    result = runOnce();
  }
  return result;
}
