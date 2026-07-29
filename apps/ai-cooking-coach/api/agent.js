import { createAgentResponse } from "../src/server/agent-response.mjs";

export default function handler(request, response) {
  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  response.setHeader("Cache-Control", "no-store");
  response.status(200).json(createAgentResponse());
}
