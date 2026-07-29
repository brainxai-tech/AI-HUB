const toneScoreDelta = {
    firmer: { firm: 28, soft: -8, premium: 8, boundary: 10 },
    softer: { soft: 30, firm: -8, premium: 5, boundary: -3 },
    premium: { premium: 30, firm: 8, soft: 4, boundary: 8 },
    selfLike: { selfLike: 26, premium: 6, soft: 2 },
    boundaried: { boundary: 32, firm: 16, soft: -4, premium: 6 }
};
export function estimateBeforeScores(text) {
    const trimmed = text.trim();
    const hasSoftener = /麻烦|谢谢|辛苦|可以吗|方便|也许|可能|希望/.test(trimmed);
    const hasBoundary = /不接受|不能|底线|边界|必须|截止|否则|不再/.test(trimmed);
    const hasFirm = /必须|请你|我要|我决定|我需要|现在|立刻/.test(trimmed);
    const hasCasual = /吧|啦|嘛|真的|其实|有点|感觉|哈哈/.test(trimmed);
    const punctuation = (trimmed.match(/[!！。；;]/g) || []).length;
    return {
        firm: clampScore(42 + (hasFirm ? 16 : 0) + (punctuation > 2 ? 5 : 0) - (hasSoftener ? 5 : 0)),
        soft: clampScore(46 + (hasSoftener ? 18 : 0) - (hasFirm ? 6 : 0)),
        premium: clampScore(40 + (trimmed.length > 48 ? 9 : 0) - (hasCasual ? 8 : 0)),
        selfLike: clampScore(64 + (hasCasual ? 7 : 0) - (trimmed.length > 220 ? 8 : 0)),
        boundary: clampScore(38 + (hasBoundary ? 22 : 0) + (hasFirm ? 7 : 0))
    };
}
export function estimateAfterScores(input, beforeScores = estimateBeforeScores(input.text)) {
    const intensityBoost = input.intensity * 4;
    const delta = toneScoreDelta[input.targetTone];
    return {
        firm: clampScore(beforeScores.firm + (delta.firm || 0) + intensityBoost),
        soft: clampScore(beforeScores.soft + (delta.soft || 0) + (input.targetTone === "softer" ? intensityBoost : 0)),
        premium: clampScore(beforeScores.premium + (delta.premium || 0) + intensityBoost),
        selfLike: clampScore(beforeScores.selfLike + (delta.selfLike || 0) - (input.targetTone === "premium" ? 4 : 0)),
        boundary: clampScore(beforeScores.boundary + (delta.boundary || 0) + (input.targetTone === "boundaried" ? intensityBoost : 0))
    };
}
export function clampScore(value) {
    const numeric = typeof value === "number" && Number.isFinite(value) ? value : 50;
    return Math.max(0, Math.min(100, Math.round(numeric)));
}
