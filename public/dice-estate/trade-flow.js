(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DiceEstateTradeFlow = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const EXECUTION_FAILED_REASON = "交易在最终结算时失败，地产与现金均未变更，请重新确认报价。";
  const TRANSFER_FAILED_REASON = "交易结算结果异常，已撤销本次交易，请重新提交。";

  function captureTradeSnapshot(state, from, to, offeredTile, requestedTile) {
    return {
      fromCash: from.cash,
      toCash: to.cash,
      offeredOwnerId: offeredTile ? offeredTile.ownerId : null,
      requestedOwnerId: requestedTile ? requestedTile.ownerId : null,
      phase: state.phase,
      logs: Array.isArray(state.logs) ? state.logs.slice() : null
    };
  }

  function restoreTradeSnapshot(state, from, to, offeredTile, requestedTile, snapshot) {
    from.cash = snapshot.fromCash;
    to.cash = snapshot.toCash;
    if (offeredTile) offeredTile.ownerId = snapshot.offeredOwnerId;
    if (requestedTile) requestedTile.ownerId = snapshot.requestedOwnerId;
    state.phase = snapshot.phase;
    if (snapshot.logs) state.logs = snapshot.logs;
  }

  function settleTradeProposal(Engine, state, rawProposal) {
    const proposal = Engine.normalizeTradeProposal(rawProposal);
    const evaluation = Engine.evaluateTradeProposal(state, proposal);
    if (!evaluation.accepted) {
      return {
        executed: false,
        proposal,
        evaluation,
        reason: evaluation.reason
      };
    }

    const from = Engine.getPlayer(state, proposal.fromPlayerId);
    const to = Engine.getPlayer(state, proposal.toPlayerId);
    const offeredTile = proposal.offeredTileId === null ? null : Engine.getTile(state, proposal.offeredTileId);
    const requestedTile = proposal.requestedTileId === null ? null : Engine.getTile(state, proposal.requestedTileId);
    const snapshot = captureTradeSnapshot(state, from, to, offeredTile, requestedTile);
    let executed = false;

    try {
      executed = Engine.executeTrade(state, proposal) === true;
    } catch (error) {
      restoreTradeSnapshot(state, from, to, offeredTile, requestedTile, snapshot);
      return { executed: false, proposal, evaluation, reason: EXECUTION_FAILED_REASON, error };
    }

    if (!executed) {
      restoreTradeSnapshot(state, from, to, offeredTile, requestedTile, snapshot);
      return { executed: false, proposal, evaluation, reason: EXECUTION_FAILED_REASON };
    }

    const ownershipTransferred =
      (!offeredTile || offeredTile.ownerId === to.id) &&
      (!requestedTile || requestedTile.ownerId === from.id);
    if (!ownershipTransferred) {
      restoreTradeSnapshot(state, from, to, offeredTile, requestedTile, snapshot);
      return { executed: false, proposal, evaluation, reason: TRANSFER_FAILED_REASON };
    }

    return {
      executed: true,
      proposal,
      evaluation,
      transfers: [
        offeredTile && { tileId: offeredTile.id, tileName: offeredTile.name, fromPlayerId: from.id, toPlayerId: to.id },
        requestedTile && { tileId: requestedTile.id, tileName: requestedTile.name, fromPlayerId: to.id, toPlayerId: from.id }
      ].filter(Boolean)
    };
  }

  return {
    EXECUTION_FAILED_REASON,
    TRANSFER_FAILED_REASON,
    settleTradeProposal
  };
});
