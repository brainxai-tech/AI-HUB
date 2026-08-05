export function workflowRetentionDays(environment = process.env) {
  return boundedInteger(environment.AIHUB_WORKFLOW_RETENTION_DAYS, 30, 1, 365);
}

function boundedInteger(value, fallback, minimum, maximum) {
  if (value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}
