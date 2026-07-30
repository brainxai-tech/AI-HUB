import type { CreationInput, QualityCheck, QualityReport } from "./contracts.js";

const ignoredRepeats = new Set(["一", "不", "人", "山", "水", "月", "风", "云"]);
const rhymeFamilies = [
  "东空红鸿穹中风钟松雄融宫",
  "江窗霜乡光阳香长凉章芳塘",
  "晴明清生声情城平庭青星",
  "秋流舟楼愁游洲幽休",
  "微归飞晖衣稀矶扉",
  "南岚潭含蓝三参",
  "津尘春人新真神邻",
  "斜茶花家霞华涯"
];

export function countHanCharacters(value: string) {
  return Array.from(value.normalize("NFC")).filter((character) => /\p{Script=Han}/u.test(character)).length;
}

export function cleanPoemLine(value: string) {
  return Array.from(value.normalize("NFC")).filter((character) => /\p{Script=Han}/u.test(character)).join("");
}

function expectedLineLength(input: CreationInput) {
  return input.genre === "five-quatrain" ? 5 : 7;
}

function checkStructure(lines: string[], input: CreationInput): QualityCheck {
  const expectedLength = expectedLineLength(input);
  const lineLengths = lines.map(countHanCharacters);
  const valid = lines.length === 4 && lineLengths.every((length) => length === expectedLength);
  return {
    label: "句式",
    status: valid ? "pass" : "warn",
    summary: valid ? `四句均为${expectedLength}字` : "句数或字数需要调整",
    detail: `当前字数：${lineLengths.join(" / ")}；目标为四句、每句 ${expectedLength} 字。`
  };
}

function rhymeFamilyOf(character: string) {
  return rhymeFamilies.findIndex((family) => family.includes(character));
}

function checkRhyme(lines: string[]): Pick<QualityReport, "rhyme" | "rhymeWords"> {
  const cleaned = lines.map(cleanPoemLine);
  const rhymeWords = [cleaned[1]?.at(-1), cleaned[3]?.at(-1)].filter((word): word is string => Boolean(word));
  if (rhymeWords.length < 2) {
    return {
      rhymeWords,
      rhyme: { label: "押韵", status: "warn", summary: "尚未形成双韵脚", detail: "绝句通常检查第二、四句末字。" }
    };
  }
  const families = rhymeWords.map(rhymeFamilyOf);
  const known = families.every((family) => family >= 0);
  const matches = known && families[0] === families[1];
  return {
    rhymeWords,
    rhyme: {
      label: "押韵",
      status: matches ? "pass" : known ? "warn" : "info",
      summary: matches ? `“${rhymeWords.join(" / ")}”同组` : known ? `“${rhymeWords.join(" / ")}”不在同一简表韵组` : "韵脚需进一步核对",
      detail: known
        ? "此处使用吟舟基础韵脚简表判断。"
        : "当前韵脚未完整收录在基础简表中，不能据此断言出韵。"
    }
  };
}

function checkRepetition(lines: string[]): Pick<QualityReport, "repetition" | "repeatedCharacters"> {
  const counts = new Map<string, number>();
  for (const character of cleanPoemLine(lines.join(""))) counts.set(character, (counts.get(character) || 0) + 1);
  const repeatedCharacters = [...counts.entries()]
    .filter(([character, count]) => count > 1 && !ignoredRepeats.has(character))
    .map(([character]) => character);
  return {
    repeatedCharacters,
    repetition: {
      label: "炼字",
      status: repeatedCharacters.length > 2 ? "warn" : "pass",
      summary: repeatedCharacters.length ? `留意重复：${repeatedCharacters.join("、")}` : "没有明显重复字",
      detail: repeatedCharacters.length ? "重复不一定是错误，可判断是否属于有意复沓。" : "用字分布较为疏朗。"
    }
  };
}

function checkAcrostic(lines: string[], input: CreationInput): QualityCheck | undefined {
  if (input.genre !== "acrostic") return undefined;
  const expected = cleanPoemLine(input.acrostic).slice(0, 4);
  const actual = lines.map((line) => cleanPoemLine(line)[0] || "").join("");
  const valid = expected.length === 4 && actual === expected;
  return {
    label: "藏头",
    status: valid ? "pass" : "warn",
    summary: valid ? `藏入“${expected}”` : "藏头字与设定不一致",
    detail: `设定：${expected || "未满四字"}；当前：${actual || "无"}。`
  };
}

export function analyzePoem(lines: string[], input: CreationInput): QualityReport {
  const structure = checkStructure(lines, input);
  const { rhyme, rhymeWords } = checkRhyme(lines);
  const { repetition, repeatedCharacters } = checkRepetition(lines);
  const acrostic = checkAcrostic(lines, input);
  const checks = [structure, rhyme, repetition, ...(acrostic ? [acrostic] : [])];
  const weights = acrostic ? [40, 25, 15, 20] : [50, 30, 20];
  const score = Math.round(checks.reduce((sum, check, index) => {
    const factor = check.status === "pass" ? 1 : check.status === "info" ? 0.72 : 0.45;
    return sum + weights[index] * factor;
  }, 0));

  return {
    score,
    structure,
    rhyme,
    repetition,
    acrostic,
    rhymeWords,
    repeatedCharacters,
    scopeNote: "基础校验覆盖句数、字数、简表韵脚、重复字与藏头；完整平仄和古音仍需权威韵书复核。"
  };
}
