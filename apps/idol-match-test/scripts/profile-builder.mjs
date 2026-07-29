const tagKeywordMap = [
  ["清冷", ["清冷", "高冷", "冷感", "疏离", "安静", "克制"]],
  ["热血", ["热血", "燃", "爆发", "冲劲", "少年感", "拼"]],
  ["温柔", ["温柔", "治愈", "体贴", "细腻", "暖", "柔软"]],
  ["搞笑", ["搞笑", "综艺", "接梗", "幽默", "喜剧", "好笑"]],
  ["实力派", ["实力", "唱功", "vocal", "rap", "舞蹈", "编舞", "live", "全能", "稳定"]],
  ["养成系", ["养成", "成长", "练习生", "新人", "少年", "团魂"]],
  ["舞台型", ["舞台", "直拍", "performance", "live", "演唱会", "唱跳", "现场"]],
  ["演员型", ["演员", "影视", "作品", "角色", "剧", "电影", "表演"]],
  ["陪伴型", ["陪伴", "日常", "直播", "vlog", "粉丝", "互动", "营业"]],
  ["反差型", ["反差", "台上", "台下", "可盐可甜", "双面", "隐藏面"]],
  ["甜酷", ["甜酷", "酷甜", "女团", "辣", "锋利"]],
  ["明媚", ["明媚", "元气", "阳光", "青春", "可爱"]],
  ["高级感", ["高级", "时尚", "氛围", "大片", "红毯", "贵气"]],
  ["创作型", ["创作", "作词", "作曲", "制作", "原创", "音乐人"]],
  ["综艺型", ["综艺", "真人秀", "reaction", "名场面", "接梗"]],
  ["饭圈互动型", ["互动", "营业", "粉丝", "评论", "直播", "亲切", "同担"]],
  ["佛系", ["佛系", "低调", "慢热", "边界", "安静"]],
  ["数据型", ["数据", "打榜", "控评", "冲榜", "投票"]],
  ["线下应援型", ["演唱会", "见面会", "巡演", "快闪", "线下"]],
  ["收藏型", ["周边", "专辑", "小卡", "收藏", "实体"]],
  ["消费支持型", ["购买", "消费", "支持", "销量", "会员"]],
  ["安利型", ["安利", "剪辑", "repo", "推荐", "产出", "混剪"]]
];

const genericHeadingTerms = [
  "清单",
  "目录",
  "说明",
  "明星对话",
  "资料",
  "分类",
  "总览",
  "RAG",
  "复核建议"
];

const knownRoles = ["演员", "歌手", "舞者", "爱豆", "音乐人", "主持人", "模特", "rapper"];

export const slugify = (value) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export const pickProfileTags = (text) => {
  const lowerText = text.toLowerCase();
  const tags = [];

  for (const [tag, keywords] of tagKeywordMap) {
    if (keywords.some((keyword) => lowerText.includes(keyword.toLowerCase()))) {
      tags.push(tag);
    }
  }

  return tags.length > 0 ? tags : ["养成系"];
};

export const traitsFromTags = (tags, text) => {
  const lowerText = text.toLowerCase();
  const traits = {};

  for (const tag of tags) {
    const keywords = tagKeywordMap.find(([mappedTag]) => mappedTag === tag)?.[1] ?? [];
    const hits = keywords.filter((keyword) => lowerText.includes(keyword.toLowerCase())).length;
    traits[tag] = Math.min(5, 2 + hits);
  }

  return traits;
};

const cleanName = (rawName) =>
  rawName
    .replace(/^#+\s*/, "")
    .replace(/^\d+[.)、-]?\s*/, "")
    .replace(/\*\*/g, "")
    .split(/[|｜:：/]/)[0]
    .trim();

const looksLikeProfileName = (name) => {
  if (!name || name.length < 2 || name.length > 40) {
    return false;
  }

  if (genericHeadingTerms.includes(name)) {
    return false;
  }

  if (genericHeadingTerms.some((term) => name.includes(term)) && name.length > 8) {
    return false;
  }

  return /[\p{Script=Han}a-zA-Z0-9]/u.test(name);
};

const compactSummary = (text) =>
  text
    .replace(/[#>*_\-[\]()`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

const extractAge = (text) => {
  const match = text.match(/(?:^|[^\d])(\d{2})(?:岁|。)/u);
  return match ? Number(match[1]) : undefined;
};

const extractRegion = (text) => {
  const match = text.match(/[男女]\s*\/\s*([^。|｜\s]+)/u);
  return match?.[1];
};

const extractRoles = (text) => {
  const lowerText = text.toLowerCase();

  return knownRoles.filter((role) => lowerText.includes(role.toLowerCase()));
};

const scoreProfileConfidence = ({ tags, roles, age, region, summary }) => {
  let score = 40;
  if (tags.length >= 2) score += 20;
  if (roles.length > 0) score += 15;
  if (age) score += 10;
  if (region) score += 10;
  if (summary.length >= 40) score += 5;
  return Math.min(100, score);
};

const entryReasonsFromTags = (tags) => {
  const reasons = [];

  if (tags.includes("舞台型") || tags.includes("实力派")) {
    reasons.push("出圈舞台直拍");
  }
  if (tags.includes("演员型") || tags.includes("作品型")) {
    reasons.push("代表作品/角色混剪");
  }
  if (tags.includes("综艺型") || tags.includes("搞笑")) {
    reasons.push("综艺名场面切片");
  }
  if (tags.includes("陪伴型") || tags.includes("温柔")) {
    reasons.push("日常直播和采访");
  }
  if (tags.includes("养成系")) {
    reasons.push("成长线补档");
  }

  return reasons.length > 0 ? reasons : ["资料关键词补档", "代表舞台/作品合集"];
};

const createProfile = (name, body, source) => {
  const fullText = `${name}\n${body}`;
  const tags = pickProfileTags(fullText);
  const roles = extractRoles(fullText);
  const age = extractAge(body);
  const region = extractRegion(body);
  const summary = compactSummary(body) || "知识库中提取到的候选爱豆资料。";

  return {
    id: slugify(name) || `idol-${Math.abs(name.length * 13)}`,
    name,
    source,
    summary,
    tags,
    traits: traitsFromTags(tags, body),
    entryReasons: entryReasonsFromTags(tags),
    roles,
    region,
    age,
    confidence: scoreProfileConfidence({ tags, roles, age, region, summary })
  };
};

const extractFromHeadings = (markdown, source) => {
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);

    if (heading) {
      if (current) {
        sections.push(current);
      }
      current = {
        name: cleanName(heading[2]),
        body: []
      };
      continue;
    }

    if (current) {
      current.body.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections
    .filter((section) => looksLikeProfileName(section.name))
    .map((section) => createProfile(section.name, section.body.join("\n"), source));
};

const extractFromTables = (markdown, source) => {
  const profiles = [];
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    if (!line.includes("|") || /^[-|\s:]+$/.test(line)) {
      continue;
    }

    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean);

    if (cells.length < 2) {
      continue;
    }

    if (/^(序号|标签|姓名)$/u.test(cells[0])) {
      continue;
    }

    const hasNumericIndex = /^\d+$/.test(cells[0]);
    if (!hasNumericIndex) {
      continue;
    }

    const name = cleanName(cells[1]);
    const body = cells.slice(2).join("。");

    if (looksLikeProfileName(name) && body.length >= 8) {
      profiles.push(createProfile(name, body, source));
    }
  }

  return profiles;
};

const extractFromListItems = (markdown, source) => {
  const profiles = [];
  const lines = markdown.split(/\r?\n/);
  const listPattern =
    /^\s*(?:[-*]\s*)?(?:\d+[.)、-]?\s*)?([^:：｜]{2,40})\s*[:：｜]\s*(.{8,})$/u;

  for (const line of lines) {
    const match = line.match(listPattern);
    if (!match) {
      continue;
    }

    const name = cleanName(match[1]);
    const body = match[2].trim();
    if (looksLikeProfileName(name) && body.length >= 8) {
      profiles.push(createProfile(name, body, source));
    }
  }

  return profiles;
};

export const extractProfilesFromMarkdown = (markdown, source) => {
  const byHeading = extractFromHeadings(markdown, source);
  const byTable = extractFromTables(markdown, source);
  const byListItems = extractFromListItems(markdown, source);
  const unique = new Map();

  for (const profile of [...byHeading, ...byTable, ...byListItems]) {
    if (!unique.has(profile.name)) {
      unique.set(profile.name, profile);
    }
  }

  return [...unique.values()];
};

export const buildMockProfiles = () => [
  createProfile(
    "王一博",
    "内置 mock：舞台型、清冷、实力派，舞蹈和现场表现有强记忆点，也适合从角色作品补档。",
    "mock demo fallback"
  ),
  createProfile(
    "易烊千玺",
    "内置 mock：演员型、作品型、清冷，高级感和成长线并重，适合从影视角色与舞台补档。",
    "mock demo fallback"
  ),
  createProfile(
    "张艺兴",
    "内置 mock：创作型、实力派、舞台型，音乐制作、唱跳舞台和专业投入感突出。",
    "mock demo fallback"
  ),
  createProfile(
    "蔡徐坤",
    "内置 mock：舞台型、甜酷、高级感，时尚表达和舞台镜头感强，适合刷直拍和舞台混剪。",
    "mock demo fallback"
  ),
  createProfile(
    "周深",
    "内置 mock：实力派、温柔、综艺型，声音辨识度、治愈感和综艺反应都容易入坑。",
    "mock demo fallback"
  ),
  createProfile(
    "Lisa",
    "内置 mock：舞台型、甜酷、实力派，女团舞台、直拍和时尚表现都有高传播度。",
    "mock demo fallback"
  ),
  createProfile(
    "Jung Kook",
    "内置 mock：实力派、舞台型、热血，live、唱跳和成长线都适合从舞台开始补档。",
    "mock demo fallback"
  ),
  createProfile(
    "IU",
    "内置 mock：创作型、温柔、演员型，音乐作品、影视角色和陪伴感都比较强。",
    "mock demo fallback"
  ),
  createProfile(
    "Karina",
    "内置 mock：甜酷、舞台型、高级感，概念感强，适合从舞台和造型物料入坑。",
    "mock demo fallback"
  ),
  createProfile(
    "Rosé",
    "内置 mock：创作型、温柔、高级感，音色、舞台气质和时尚大片都有辨识度。",
    "mock demo fallback"
  )
];
