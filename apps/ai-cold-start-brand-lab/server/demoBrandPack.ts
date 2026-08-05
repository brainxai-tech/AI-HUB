import type { BrandPack, GenerateBrandPackRequest } from "../src/shared/contracts.js";

export function buildDemoBrandPack(request: GenerateBrandPackRequest): BrandPack {
  const { input } = request;
  const audience = input.targetAudience || "独立开发者和 AI 创业者";
  const market = input.market || "早期 SaaS / AI 工具";
  const idea = cleanSentence(input.idea);
  const productNoun = inferProductNoun(idea);

  return {
    brandNames: [
      {
        name: "FirstSignal",
        tagline: "让想法先被市场听见",
        rationale: "强调冷启动阶段最重要的不是完整品牌，而是找到第一批真实信号。",
        fit: "SAFE"
      },
      {
        name: "LaunchCopy AI",
        tagline: "从产品想法到首屏文案",
        rationale: "直接绑定用户任务，适合转化导向的工具定位。",
        fit: "TECHNICAL"
      },
      {
        name: "起势实验室",
        tagline: "把模糊想法打成可测试品牌包",
        rationale: "中文名更有创业感，适合面向国内独立开发者和增长团队。",
        fit: "BOLD"
      }
    ],
    positioning: {
      oneLiner: `一个面向${audience}的 AI 冷启动品牌实验室，把“${idea}”快速转成可测试的命名、定位和落地页文案。`,
      category: `${market} 的品牌验证工具`,
      targetUser: audience,
      primaryPromise: `在还没有完整品牌团队时，先拿到一套可以发给用户、投广告或做 fake door 测试的${productNoun}品牌包。`,
      differentiation: "不是泛泛写文案，而是同时输出定位假设、用户画像、落地页方向和可复制页面文案。",
      proofIdea: "每次生成都保留关键假设和验证指标，方便用户用真实点击、访谈和转化率校准。",
      assumptions: [
        `目标用户愿意用 1 个产品想法启动${productNoun}品牌探索。`,
        "用户更在意首版可测试素材，而不是完整品牌咨询报告。",
        "可复制 landing page 文案是最直接的价值交付物。",
        "早期用户接受 AI 输出后再人工微调的工作方式。"
      ]
    },
    taglines: [
      { style: "RATIONAL", line: "输入一个想法，输出一套可测试品牌包。" },
      { style: "RATIONAL", line: "把冷启动品牌工作压缩到一次生成。" },
      { style: "RATIONAL", line: "定位、画像、首页文案，一次生成到位。" },
      { style: "EMOTIONAL", line: "别让好想法卡在第一句话。" },
      { style: "EMOTIONAL", line: "让你的产品先拥有被理解的样子。" },
      { style: "EMOTIONAL", line: "从模糊灵感，到可以发布的首屏。" },
      { style: "CONVERSION", line: "今天就生成你的第一版 landing page。" },
      { style: "CONVERSION", line: "复制文案，开始测试第一个用户信号。" },
      { style: "CONVERSION", line: "用 2 分钟完成一次品牌冷启动。" }
    ],
    personas: [
      {
        name: "周岩，独立开发者",
        segment: "有产品原型，但缺少表达和首批用户测试材料",
        context: "晚上和周末做 AI 小工具，希望尽快发到社群和 Product Hunt 预热。",
        pains: ["不会写清楚价值主张", "每次起名都拖很久", "landing page 第一屏反复改"],
        trigger: "准备发第一个等待名单页面，需要一套能复制粘贴的首页文案。",
        objection: "担心 AI 输出太空泛，无法体现真实差异。",
        acquisitionChannel: "独立开发者社群、X/Twitter、Product Hunt 备战内容"
      },
      {
        name: "林棠，早期 AI 创业者",
        segment: "同时测试多个产品方向，需要快速比较定位",
        context: "每周和潜在用户访谈，用小 landing page 收集预约和邮箱。",
        pains: ["方向多但表达不统一", "团队讨论缺少共同文本", "不确定哪个切入点更能转化"],
        trigger: "要为 3 个细分场景各做一个 fake door 页面。",
        objection: "担心单次生成不能沉淀成长期品牌资产。",
        acquisitionChannel: "创业者社区、AI 产品经理内容、增长实验案例"
      },
      {
        name: "许诺，增长运营",
        segment: "负责新功能上线和广告测试",
        context: "需要在短时间内给设计和投放同事一版可执行文案。",
        pains: ["文案产能不稳定", "用户画像和广告语脱节", "首页文案缺少可测试角度"],
        trigger: "新功能上线前，要快速产出 3 个落地页方向做 A/B 测试。",
        objection: "担心输出不符合品牌语气，需要二次编辑。",
        acquisitionChannel: "增长黑客社区、B2B SaaS 运营内容、营销工具榜单"
      }
    ],
    landingPageDirections: [
      {
        name: "问题驱动型",
        angle: "从用户卡住的瞬间切入：想法有了，但第一版品牌表达迟迟出不来。",
        bestFor: "独立开发者和早期创业者",
        heroHeadline: "别让产品想法卡在第一句文案",
        sectionPlan: ["痛点场景", "AI 生成品牌包", "结果示例", "用户画像", "复制文案", "等待名单 CTA"]
      },
      {
        name: "效率收益型",
        angle: "强调把命名、定位、广告语、首屏文案打包成一次可测试输出。",
        bestFor: "增长运营和小团队",
        heroHeadline: "2 分钟生成一套冷启动品牌素材",
        sectionPlan: ["效率承诺", "输入到输出流程", "模块清单", "A/B 测试方向", "团队协作", "立即生成 CTA"]
      },
      {
        name: "身份愿景型",
        angle: "把用户从“不会包装产品的人”带到“能持续测试市场信号的人”。",
        bestFor: "个人创作者和 AI 创业者",
        heroHeadline: "让你的产品先拥有被理解的样子",
        sectionPlan: ["愿景开场", "冷启动障碍", "品牌实验室", "成功信号", "案例化输出", "开始实验 CTA"]
      }
    ],
    landingPageCopy: {
      hero: {
        headline: `把“${idea}”变成第一版可测试品牌包`,
        subheadline: `AI 为${audience}生成品牌名、定位、广告语、用户画像和完整 landing page 文案，让冷启动不再停在空白文档里。`,
        primaryCta: "生成品牌包",
        secondaryCta: "复制首页文案"
      },
      problemSection: {
        title: "产品想法最容易卡在发布前的表达层",
        bullets: [
          "知道要做什么，却说不清用户为什么现在需要它。",
          "命名、定位、广告语和首页文案彼此割裂。",
          "每次测试新方向都要从空白文档重新开始。",
          "团队讨论很多，但缺少一份可以直接验证的页面文案。"
        ]
      },
      solutionSection: {
        title: "一次生成冷启动所需的完整品牌素材",
        body: "输入产品想法和目标用户，系统会先拆解定位假设，再生成命名、画像、落地页方向和可复制文案。你拿到的不是一段漂亮话，而是一套能立刻拿去测试的市场表达。"
      },
      featureBlocks: [
        {
          title: "品牌名候选",
          body: "输出 3-5 个名字，每个都附命名逻辑和适配场景。"
        },
        {
          title: "定位与画像",
          body: "明确目标用户、核心承诺、差异点和第一批可能转化的人群。"
        },
        {
          title: "三种落地页方向",
          body: "从问题、收益和身份愿景三个角度生成可对比的页面路线。"
        },
        {
          title: "可复制首页文案",
          body: "Hero、痛点、方案、功能、FAQ 和 CTA 结构化输出。"
        }
      ],
      socialProof: {
        title: "先测试信号，再打磨品牌",
        body: "适合发给 10 个潜在用户、上线等待名单页面，或作为广告素材的第一版假设。"
      },
      faq: [
        {
          question: "这会替代完整品牌咨询吗？",
          answer: "不会。它适合冷启动阶段快速形成可测试版本，后续仍需要结合真实用户反馈迭代。"
        },
        {
          question: "生成结果可以直接用吗？",
          answer: "可以作为 landing page 初稿、广告测试素材和团队讨论基线，建议上线前按真实产品事实微调。"
        },
        {
          question: "这个项目需要单独填写 API Key 吗？",
          answer: "不需要。Routing Key 只在 AI Hub 配置一次，本项目通过项目级代理调用所选 GPT 型号。"
        }
      ],
      finalCta: {
        headline: "用一个想法，换一套可以验证的品牌起点",
        button: "开始冷启动实验"
      }
    },
    validationPlan: {
      northStarMetric: "生成后 24 小时内，用户是否复制 landing page 文案并用于一次真实测试。",
      firstExperiment: "让 10 位独立开发者输入当前产品想法，观察他们是否愿意复制输出并继续调整。",
      successSignals: [
        "用户复制完整 landing page 文案。",
        "用户连续生成 2 个以上方向做比较。",
        "用户愿意把结果发给团队或潜在用户。",
        "用户能指出某个品牌名或定位明显优于自己原稿。"
      ],
      risks: [
        "模型输出可能过于模板化。",
        "品牌名未做商标或域名可用性检查。",
        "用户输入太短时，定位假设可能偏离真实业务。",
        "不同模型对 JSON 结构遵循程度不一致。"
      ]
    }
  };
}

function cleanSentence(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 80);
}

function inferProductNoun(idea: string) {
  if (/课程|教育|学习|coach/i.test(idea)) return "教育产品";
  if (/SaaS|工具|平台|系统|app|应用/i.test(idea)) return "工具";
  if (/品牌|文案|营销|广告/i.test(idea)) return "增长产品";
  return "产品";
}
