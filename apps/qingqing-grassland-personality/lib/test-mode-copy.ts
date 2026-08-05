import type { TestMode } from "../data/personality-test.ts";

export function buildModeHelperLine(mode: TestMode): string {
  return `预计 ${mode.estimatedTime.trim()}完成，结果可重新测试并复制分享文案。`;
}
