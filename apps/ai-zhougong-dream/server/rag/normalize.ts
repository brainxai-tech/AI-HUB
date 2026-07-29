const traditionalToSimplified: Record<string, string> = {
  門: "门",
  貴: "贵",
  薦: "荐",
  預: "预",
  莊: "庄",
  虛: "虚",
  貴子: "贵子",
  黃: "黄",
  梁: "梁",
  峽: "峡",
  窮: "穷",
  婦: "妇",
  龍: "龙",
  飛: "飞",
  憂: "忧",
  兒: "儿",
  侯: "侯",
  職: "职",
  啣: "衔",
  禮: "礼",
  燒: "烧",
  雲: "云",
  陰: "阴",
  雷聲: "雷声",
  電: "电",
  風: "风",
  號: "号",
  遠: "远",
  遷: "迁",
  聳: "耸",
  壽: "寿",
  齒: "齿",
  髮: "发",
  鬚: "须",
  頭: "头",
  麵: "面",
  錢: "钱",
  財: "财",
  寶: "宝",
  樹: "树",
  園: "园",
  發: "发",
  開: "开",
  夢: "梦",
  懷: "怀",
  應: "应",
  須: "须",
  病癒: "病愈",
  書: "书",
  筆: "笔",
  學: "学",
  試: "试",
  遲: "迟",
  寫: "写",
  寢: "寝",
  龜: "龟",
  鳥: "鸟",
  雞: "鸡",
  鴨: "鸭",
  貓: "猫",
  馬: "马",
  驢: "驴",
  魚: "鱼",
  蛇: "蛇",
  蟲: "虫",
  喪: "丧",
  嬰: "婴",
  懷孕: "怀孕",
  閨: "闺",
  親: "亲",
  鬼: "鬼",
  神: "神",
  廟: "庙",
  廁: "厕",
  廚: "厨",
  廳: "厅",
  廊: "廊",
  齋: "斋",
  藥: "药",
  醫: "医",
  飲: "饮",
  飯: "饭",
  餅: "饼",
  鹽: "盐",
  見: "见",
  與: "与",
  眾: "众",
  戰: "战",
  軍: "军",
  盜: "盗",
  賊: "贼",
  官: "官",
  訟: "讼",
  獄: "狱",
  殺: "杀",
  死: "死",
  墳: "坟",
  葬: "葬",
  棺: "棺",
  血: "血",
  火: "火",
  雨: "雨",
  雪: "雪",
  水: "水",
  河: "河",
  海: "海",
  日: "日",
  月: "月",
  星: "星"
};

const phraseEntries = Object.entries(traditionalToSimplified).sort(
  ([a], [b]) => b.length - a.length
);

export function normalizeChinese(value: string) {
  let normalized = value.toLowerCase();

  for (const [source, target] of phraseEntries) {
    normalized = normalized.replaceAll(source, target);
  }

  return normalized.replace(/[^\p{Script=Han}a-z0-9]+/gu, "");
}

export function extractHanNgrams(value: string) {
  const normalized = normalizeChinese(value);
  const grams = new Set<string>();

  for (const size of [2, 3]) {
    for (let index = 0; index <= normalized.length - size; index += 1) {
      grams.add(normalized.slice(index, index + size));
    }
  }

  return grams;
}
