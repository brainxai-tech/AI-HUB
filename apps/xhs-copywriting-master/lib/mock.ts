import type { CopywritingInput, CopywritingResult } from "@/lib/types";

const lengthHints = {
  短: "轻量短帖",
  中: "标准种草笔记",
  长: "信息更完整的深度笔记",
};

export function createMockResult(
  input: CopywritingInput,
  optimizeMode?: string,
): CopywritingResult {
  const product = input.productName || input.topic;
  const scenario = input.scenario || "日常真实使用";
  const modePrefix = optimizeMode ? `${optimizeMode}版：` : "";

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    input,
    titles: [
      `${modePrefix}${product}真的适合${input.targetAudience}吗？我认真试了`,
      `${modePrefix}${scenario}离不开它，原因比想象中简单`,
      `${modePrefix}别急着下单，先看完这篇${input.type}笔记`,
      `${modePrefix}${input.targetAudience}可以直接抄的${input.topic}思路`,
    ],
    body: [
      `最近一直在整理关于「${input.topic}」的内容，发现很多人不是不会选，而是不知道该从哪个角度判断。`,
      "",
      `我这次重点看的是：${input.sellingPoints}。放在${scenario}里，它的优势会更明显，尤其适合${input.targetAudience}。`,
      "",
      `如果你喜欢${input.tone}一点的表达，可以把它理解成：不用把选择过程想得太复杂，先看自己最在意的场景，再看卖点是不是刚好能解决问题。`,
      "",
      `我的建议是，先从一个小需求开始尝试，不要被过度包装带着走。适合自己，比看起来很厉害更重要。`,
      input.extraRequirements ? `\n补充注意：${input.extraRequirements}` : "",
      input.forbiddenWords ? `\n已避开这些表达：${input.forbiddenWords}` : "",
      `\n这篇属于${lengthHints[input.length]}，发布前可以再加 1-2 张真实场景图，整体会更自然。`,
    ]
      .filter(Boolean)
      .join("\n"),
    tags: [
      "小红书文案",
      input.type,
      input.topic,
      product,
      input.targetAudience,
      input.tone,
      "真实分享",
      "种草笔记",
      "内容运营",
      "新手友好",
      "干货分享",
      "生活方式",
    ].map((tag) => `#${tag.replace(/\s+/g, "")}`),
    suggestions: [
      "标题可以保留一个具体人群，让用户更快判断是否与自己相关。",
      "正文前两段建议加入真实使用场景，降低广告感。",
      "标签不要只堆大词，混合品类词、人群词和场景词更稳。",
      "发布前检查是否有绝对化承诺或夸大效果表达。",
    ],
  };
}
