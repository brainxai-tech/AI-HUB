import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiceDecisionChatPayload,
  parseDiceDecisionResponse,
  validateDiceDecisionRequest,
} from "../server.mjs";

function decisionFixture() {
  return {
    profileId: "aggressive",
    request: {
      turn_id: "3:ready:ai_red:state123",
      state_version: 17,
      legal_actions_hash: "legal123",
      agent_id: "ai_red",
      public_state: {
        phase: "ready",
        players: [
          { id: "human", name: "Player", cash: 1500 },
          { id: "ai_red", name: "Agent", cash: 1420 },
        ],
      },
      public_metrics: { referenceValue: 0, maxVisibleOpponentRent: 90, isLeading: false },
      legal_actions: [
        {
          actionId: "roll_dice:1a2b3c",
          actionType: "ROLL_DICE",
          params: {},
          metadata: {},
        },
      ],
      fallback_action: {
        turnId: "3:ready:ai_red:state123",
        stateVersion: 17,
        legalActionsHash: "legal123",
        agentId: "ai_red",
        actionId: "roll_dice:1a2b3c",
        actionType: "ROLL_DICE",
        params: {},
        publicLine: "按安全策略行动。",
        decisionCode: "FALLBACK",
      },
      allowed_decision_codes: ["MANDATORY", "FALLBACK"],
    },
  };
}

test("Dice Estate accepts a bounded public decision request", () => {
  const validated = validateDiceDecisionRequest(decisionFixture());
  assert.equal(validated.profileId, "aggressive");
  assert.equal(validated.request.legal_actions.length, 1);

  const chat = buildDiceDecisionChatPayload(validated);
  assert.equal(chat.response_format.type, "json_object");
  assert.equal(chat.stream, false);
  assert.ok(chat.max_tokens <= 500);
  assert.match(chat.messages[0].content, /legal_actions/);
  assert.doesNotMatch(JSON.stringify(chat), /x-hub-project-token/i);
});

test("Dice Estate rejects unbounded or malformed decision requests", () => {
  assert.throws(
    () => validateDiceDecisionRequest({ ...decisionFixture(), profileId: "unknown" }),
    /profile/i,
  );
  assert.throws(
    () =>
      validateDiceDecisionRequest({
        ...decisionFixture(),
        request: {
          ...decisionFixture().request,
          public_state: { padding: "x".repeat(70_000) },
        },
      }),
    /large|size|bytes/i,
  );
});

test("Dice Estate accepts only a legal model-selected action and server-owned params", () => {
  const fixture = decisionFixture();
  const upstream = {
    choices: [
      {
        message: {
          content: JSON.stringify({
            turnId: fixture.request.turn_id,
            stateVersion: fixture.request.state_version,
            legalActionsHash: fixture.request.legal_actions_hash,
            agentId: fixture.request.agent_id,
            actionId: "roll_dice:1a2b3c",
            actionType: "ROLL_DICE",
            params: { injected: true },
            publicLine: "现在掷骰子。",
            decisionCode: "MANDATORY",
          }),
        },
      },
    ],
  };

  const decision = parseDiceDecisionResponse(upstream, fixture.request);
  assert.deepEqual(decision.params, {});
  assert.equal(decision.actionId, "roll_dice:1a2b3c");

  const illegal = structuredClone(upstream);
  illegal.choices[0].message.content = JSON.stringify({
    ...JSON.parse(upstream.choices[0].message.content),
    actionId: "buy:forged",
  });
  assert.throws(() => parseDiceDecisionResponse(illegal, fixture.request), /legal/i);
});
