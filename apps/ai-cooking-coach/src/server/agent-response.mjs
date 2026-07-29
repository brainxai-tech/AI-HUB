import {
  COOKING_AGENT_ID,
  COOKING_AGENT_NAME,
  COOKING_AGENT_RUNTIME_RULES,
  COOKING_AGENT_SYSTEM_PROMPT
} from "../domain/cooking-agent-prompt.mjs";

export function createAgentResponse() {
  return {
    id: COOKING_AGENT_ID,
    name: COOKING_AGENT_NAME,
    provider: "AI Project Hub",
    modelOptions: ["Hub default provider/model"],
    apiKeyPolicy: "hub_managed",
    apiKeyStorage: "hub_only",
    apiKeyRequired: false,
    systemPrompt: `${COOKING_AGENT_SYSTEM_PROMPT}\n\n${COOKING_AGENT_RUNTIME_RULES}`
  };
}
