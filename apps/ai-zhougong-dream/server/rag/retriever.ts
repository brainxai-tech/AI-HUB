import type { RagCitation } from "../../shared/types";
import { extractHanNgrams, normalizeChinese } from "./normalize";
import { zhougongCorpus } from "./zhougongCorpus.generated";

interface ConceptRule {
  triggers: string[];
  terms: string[];
  categories?: string[];
}

const sourceTitle = "维基文库《周公解梦》";
const sourceUrl = "https://zh.wikisource.org/wiki/%E5%91%A8%E5%85%AC%E8%A7%A3%E5%A4%A2";
const sourceLicense = "Wikisource CC BY-SA 4.0; traditional source text may be public domain";

const conceptRules: ConceptRule[] = [
  {
    triggers: ["蛇", "蟒", "毒蛇"],
    terms: ["蛇", "龙蛇"],
    categories: ["龍蛇禽獸"]
  },
  {
    triggers: ["龙", "龍"],
    terms: ["龙", "龙蛇", "乘龙"],
    categories: ["龍蛇禽獸"]
  },
  {
    triggers: ["水", "河", "海", "湖", "雨", "洪水", "下雨"],
    terms: ["水", "河", "海", "雨", "阴雨", "行路逢雨"],
    categories: ["天地日月星辰", "地理山石樹木"]
  },
  {
    triggers: ["考试", "学校", "教室", "老师", "迟到", "写字", "读书"],
    terms: ["书", "学", "文", "笔", "官", "试", "读", "写"],
    categories: ["文書筆墨兵器"]
  },
  {
    triggers: ["牙", "牙齿", "掉牙"],
    terms: ["齿", "牙", "头", "面"],
    categories: ["身體面目齒髮"]
  },
  {
    triggers: ["房子", "家", "门", "屋", "房间"],
    terms: ["屋", "家", "门", "堂", "宅"],
    categories: ["宮室屋宇倉庫"]
  },
  {
    triggers: ["钱", "财富", "金", "银", "红包"],
    terms: ["钱", "财", "金", "银", "宝"],
    categories: ["金銀珠玉絹帛"]
  },
  {
    triggers: ["火", "烧", "烟"],
    terms: ["火", "烧", "烟"],
    categories: ["火焰燈燭"]
  },
  {
    triggers: ["死", "葬礼", "棺材", "坟"],
    terms: ["死", "丧", "葬", "棺", "坟"],
    categories: ["棺槨迎送死亡"]
  },
  {
    triggers: ["孩子", "婴儿", "怀孕", "生孩子"],
    terms: ["子", "儿", "妇", "怀", "孕"],
    categories: ["夫妻產孕交歡"]
  },
  {
    triggers: ["猫", "狗", "马", "鸟", "鱼", "动物"],
    terms: ["猫", "狗", "马", "鸟", "鱼", "鸡", "动物"],
    categories: ["龍蛇禽獸", "牛馬豬羊六畜", "龜鱉魚蝦昆蟲"]
  }
];

export function retrieveZhougongContext(dreamText: string, limit = 6): RagCitation[] {
  const query = normalizeChinese(dreamText);
  const grams = extractHanNgrams(dreamText);
  const conceptTerms = new Set<string>();
  const exactTriggers = new Set<string>();
  const categoryBoosts = new Set<string>();

  for (const rule of conceptRules) {
    if (rule.triggers.some((trigger) => query.includes(normalizeChinese(trigger)))) {
      rule.terms.forEach((term) => conceptTerms.add(normalizeChinese(term)));
      rule.triggers
        .filter((trigger) => query.includes(normalizeChinese(trigger)))
        .forEach((trigger) => exactTriggers.add(normalizeChinese(trigger)));
      rule.categories?.forEach((category) => categoryBoosts.add(normalizeChinese(category)));
    }
  }

  const scored = zhougongCorpus
    .map((entry) => {
      const text = normalizeChinese(entry.original);
      let score = 0;

      for (const trigger of exactTriggers) {
        if (trigger && text.includes(trigger)) {
          score += trigger.length === 1 ? 36 : 44;
        }
      }

      for (const term of conceptTerms) {
        if (term && text.includes(term)) {
          score += term.length === 1 ? 8 : 14;
        }
      }

      for (const gram of grams) {
        if (gram.length >= 2 && text.includes(gram)) {
          score += gram.length * 4;
        }
      }

      if (categoryBoosts.has(normalizeChinese(entry.category))) {
        score += 3;
      }

      return { entry, score };
    })
    .filter((item) => item.score >= 8)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .slice(0, limit);

  if (scored.length === 0) {
    return [
      {
        id: "zhougong-no-direct-hit",
        category: "未直接命中",
        original: "《周公解梦》本地语料未检索到直接对应条目。",
        sourceTitle,
        sourceUrl,
        sourceLicense,
        score: 0
      }
    ];
  }

  return scored.map(({ entry, score }) => ({
    id: entry.id,
    category: entry.category,
    original: entry.original,
    sourceTitle,
    sourceUrl,
    sourceLicense,
    score
  }));
}

export function formatRagContextForPrompt(hits: RagCitation[]) {
  return hits
    .map((hit, index) => {
      return `${index + 1}. [${hit.category}] ${hit.original}（来源：${hit.sourceTitle}）`;
    })
    .join("\n");
}
