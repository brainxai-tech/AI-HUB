import { analyzePoem, cleanPoemLine } from "./analyzer.js";
import { createId, genreLabels, moodLabels, styleOptions, type CreationInput, type PoemDraft, type PoemStyle } from "./contracts.js";

const fiveLineSets: Record<PoemStyle, string[]> = {
  清雅: ["疏雨入空庭", "微灯照晚晴", "一舟随月远", "心与暮云平"],
  雄浑: ["长风开远塞", "落日满孤城", "一棹横秋水", "高歌动雁声"],
  自然: ["溪云过短篱", "野渡晚风微", "童子归来后", "闲看白鹭飞"]
};

const sevenLineSets: Record<PoemStyle, string[]> = {
  清雅: ["一川烟雨入江南", "半卷疏帘对晚岚", "小艇不知春去处", "载将明月过晴潭"],
  雄浑: ["大漠长风卷暮云", "孤城落日照千军", "横刀欲问天边路", "一骑高歌入雁群"],
  自然: ["竹外新泉响石矶", "柴门半掩落花稀", "邻翁唤我同沽酒", "笑看斜阳带鹭归"]
};

const acrosticSuffixes: Record<PoemStyle, string[]> = {
  清雅: ["映清溪柳色新", "携明月过芳津", "随春水入诗卷", "伴长风不染尘"],
  雄浑: ["挽长风上碧空", "临沧海气如虹", "横孤剑开云路", "踏千山唱大风"],
  自然: ["过柴门竹影斜", "呼邻叟共煎茶", "随溪水听鱼跃", "看春泥长豆花"]
};

const imageryByStyle: Record<PoemStyle, string[]> = {
  清雅: ["疏雨", "微灯", "明月", "暮云"],
  雄浑: ["长风", "落日", "孤城", "秋水"],
  自然: ["竹影", "野渡", "邻翁", "白鹭"]
};

function titleFromTheme(theme: string) {
  const cleaned = cleanPoemLine(theme).slice(0, 8);
  return cleaned ? `咏${cleaned}` : "即景";
}

function acrosticCharacters(input: CreationInput) {
  const requested = cleanPoemLine(input.acrostic);
  const fallback = `${cleanPoemLine(input.theme)}春江花月吟舟`;
  return Array.from(`${requested}${fallback}`).slice(0, 4);
}

function linesForStyle(input: CreationInput, style: PoemStyle) {
  if (input.genre === "five-quatrain") return [...fiveLineSets[style]];
  if (input.genre === "seven-quatrain") return [...sevenLineSets[style]];
  const heads = acrosticCharacters(input);
  return acrosticSuffixes[style].map((suffix, index) => `${heads[index]}${suffix}`);
}

function interpretation(input: CreationInput, style: PoemStyle) {
  const mood = moodLabels[input.mood];
  const descriptions: Record<PoemStyle, string> = {
    清雅: "以近景起笔，把情绪藏进雨、灯与暮色之间，收束得轻而不弱。",
    雄浑: "以长风、落日和远景拓开空间，让主题获得更强的行进感。",
    自然: "用日常人事承接山水，不刻意拔高，保留一份可亲近的生气。"
  };
  return `围绕“${input.theme.trim()}”写成${genreLabels[input.genre]}，取${mood}之意。${descriptions[style]}`;
}

export function buildDemoDrafts(input: CreationInput): PoemDraft[] {
  return styleOptions.map((style) => {
    const lines = linesForStyle(input, style);
    return {
      id: createId(style),
      title: titleFromTheme(input.theme),
      style,
      lines,
      interpretation: interpretation(input, style),
      imagery: imageryByStyle[style],
      sources: [
        { label: "意象线索", note: "柳、月、归舟等是古典诗歌常见公共意象，本稿未声称引用某位诗人的原句。" },
        { label: "生成说明", note: "此稿由吟舟演示引擎按固定语料模板组合，适合体验工作流，不代表真实模型质量。" }
      ],
      report: analyzePoem(lines, input)
    };
  });
}

export function buildLineSuggestions(line: string, lineIndex: number, style: PoemStyle, preserveHead = false) {
  if (preserveHead) {
    const head = cleanPoemLine(line)[0] || "诗";
    return styleOptions.map((candidateStyle) => `${head}${acrosticSuffixes[candidateStyle][lineIndex]}`);
  }
  const pools: Record<PoemStyle, string[][]> = {
    清雅: [fiveLineSets.清雅, sevenLineSets.清雅],
    雄浑: [fiveLineSets.雄浑, sevenLineSets.雄浑],
    自然: [fiveLineSets.自然, sevenLineSets.自然]
  };
  const lengthIndex = cleanPoemLine(line).length === 5 ? 0 : 1;
  const currentPool = pools[style][lengthIndex];
  const otherStyles = styleOptions.filter((item) => item !== style);
  return [
    currentPool[lineIndex] || line,
    pools[otherStyles[0]][lengthIndex][lineIndex] || line,
    pools[otherStyles[1]][lengthIndex][lineIndex] || line
  ].filter((candidate, index, array) => array.indexOf(candidate) === index);
}
