import type { DreamDirectorOutput } from "./contracts.js";

export type VersionComparison = {
  fidelityDelta: number;
  addedElements: string[];
  removedElements: string[];
  changedShots: number;
  posterChanged: boolean;
  titleChanged: boolean;
  loglineChanged: boolean;
  summary: string;
};

export function createVersionComparison(base: DreamDirectorOutput, candidate: DreamDirectorOutput): VersionComparison {
  const baseElements = new Set(base.dreamElements.map((item) => item.label));
  const candidateElements = new Set(candidate.dreamElements.map((item) => item.label));
  const addedElements = [...candidateElements].filter((label) => !baseElements.has(label));
  const removedElements = [...baseElements].filter((label) => !candidateElements.has(label));
  const changedShots = candidate.shots.filter((shot, index) => {
    const baseShot = base.shots[index];
    if (!baseShot) return true;
    return (
      shot.image !== baseShot.image ||
      shot.action !== baseShot.action ||
      shot.videoPrompt !== baseShot.videoPrompt ||
      shot.composition !== baseShot.composition ||
      shot.lighting !== baseShot.lighting
    );
  }).length;
  const posterChanged = candidate.poster.prompt !== base.poster.prompt || candidate.poster.copy !== base.poster.copy;
  const fidelityDelta = candidate.fidelity.score - base.fidelity.score;

  return {
    fidelityDelta,
    addedElements,
    removedElements,
    changedShots,
    posterChanged,
    titleChanged: candidate.title !== base.title,
    loglineChanged: candidate.logline !== base.logline,
    summary: [
      `保真度 ${formatDelta(fidelityDelta)}`,
      addedElements.length ? `新增 ${addedElements.join(" / ")}` : "",
      removedElements.length ? `移除 ${removedElements.join(" / ")}` : "",
      changedShots ? `${changedShots} 个镜头发生变化` : "",
      posterChanged ? "海报 Prompt 已变化" : ""
    ]
      .filter(Boolean)
      .join("；")
  };
}

function formatDelta(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}
