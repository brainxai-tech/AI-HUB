export type HubTrackEventType = "generate" | "export";

export type HubTrackPayload = {
  eventType: HubTrackEventType;
  projectPath: "/data";
  projectId: "ai-data-analyst";
  source: "project";
  statusCode?: number;
  durationMs?: number;
};

export type HubTrackInput = {
  eventType: HubTrackEventType;
  statusCode?: number;
  durationMs?: number;
};

export function buildHubTrackPayload(input: HubTrackInput): HubTrackPayload {
  return {
    eventType: input.eventType,
    projectPath: "/data",
    projectId: "ai-data-analyst",
    source: "project",
    statusCode: sanitizeStatusCode(input.statusCode),
    durationMs: sanitizeDurationMs(input.durationMs),
  };
}

function sanitizeStatusCode(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : undefined;
}

function sanitizeDurationMs(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}
