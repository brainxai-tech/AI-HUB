const genericStrategyPatterns = [/保持积极/, /相信自己/, /提高自律/, /调整心态/, /不要想太多/, /坚持下去/];
const clinicalPatterns = [/抑郁症|焦虑症|人格障碍|强迫症|躁郁|双相|ADHD/i];
const visibleProofPatterns = [/截图|发送|提交|文件|草稿|记录|清单|删除|完成|上传|预约|报名|消息|作品|链接|版本|证据/];
const unsupportedAssumptions = [
    {
        output: /Google\s*Colab|Colab/i,
        input: /Google\s*Colab|Colab|Notebook/i,
        message: "输出凭空指定了 Google Colab。"
    },
    {
        output: /微信群|群里|发到群|发截图到群|发结果到群/,
        input: /微信群|群里|社群|群组|发到群|公开打卡/,
        message: "输出凭空指定了群聊或社群发布渠道。"
    },
    {
        output: /朋友圈|发朋友圈/,
        input: /朋友圈|公开发布|社交平台/,
        message: "输出凭空指定了朋友圈发布渠道。"
    },
    {
        output: /Notion|飞书|Figma/i,
        input: /Notion|飞书|Figma/i,
        message: "输出凭空指定了具体工具。"
    },
    {
        output: /天气\s*API|天气数据|天气查询/,
        input: /天气|气象/,
        message: "输出把目标替换成了未提到的天气 API 示例。"
    }
];
export function evaluateVillainCard(input, card) {
    if (card.safetyMode) {
        return { passed: true, score: 100, issues: [] };
    }
    const issues = [];
    const outputText = flattenCard(card);
    const strategyText = [
        card.strategy.todayQuest,
        card.strategy.antiSkill,
        card.strategy.environmentRule,
        card.strategy.recoveryPlan,
        ...card.strategy.bossFightPlan,
        ...card.skills.map((skill) => skill.counter)
    ].join("\n");
    if (!mentionsGoalSignal(input.goal, outputText)) {
        issues.push({
            code: "GOAL_SIGNAL_MISSING",
            message: "角色卡没有贴住用户目标里的关键词。"
        });
    }
    if (genericStrategyPatterns.some((pattern) => pattern.test(strategyText))) {
        issues.push({
            code: "GENERIC_STRATEGY",
            message: "通关策略出现空泛建议。"
        });
    }
    if (clinicalPatterns.some((pattern) => pattern.test(outputText))) {
        issues.push({
            code: "CLINICAL_LABEL",
            message: "输出使用了临床诊断标签。"
        });
    }
    const unsupported = findUnsupportedAssumption(input, outputText);
    if (unsupported) {
        issues.push({
            code: "UNSUPPORTED_ASSUMPTION",
            message: unsupported
        });
    }
    if (card.villainName.length < 4 || card.imagePrompt.length < 35 || card.skills.length < 3) {
        issues.push({
            code: "WEAK_CARD_FLAVOR",
            message: "反派设定或画面提示不够具体。"
        });
    }
    if (!visibleProofPatterns.some((pattern) => pattern.test(card.strategy.todayQuest))) {
        issues.push({
            code: "MISSING_VISIBLE_PROOF",
            message: "今日任务缺少可见完成证据。"
        });
    }
    if (card.skills.filter((skill) => skill.counter.length >= 8).length < 3) {
        issues.push({
            code: "TOO_FEW_COUNTERS",
            message: "技能反制动作不够具体。"
        });
    }
    const score = Math.max(0, 100 - issues.length * 16);
    return {
        passed: issues.length === 0,
        score,
        issues
    };
}
export function formatQualityIssues(issues) {
    return issues.map((issue, index) => `${index + 1}. ${issue.message}`).join("\n");
}
function flattenCard(card) {
    return [
        card.goal,
        card.title,
        card.villainName,
        card.archetype,
        card.element,
        card.catchphrase,
        card.hiddenFear,
        card.disguise,
        card.ultimate,
        card.imagePrompt,
        card.shareCopy,
        ...card.spawnScenes,
        ...card.weakness,
        ...card.loot,
        ...card.attributes.flatMap((item) => [item.label, item.note]),
        ...card.skills.flatMap((item) => [item.name, item.trigger, item.effect, item.counter]),
        card.strategy.todayQuest,
        card.strategy.antiSkill,
        card.strategy.environmentRule,
        card.strategy.recoveryPlan,
        ...card.strategy.bossFightPlan
    ].join("\n");
}
function mentionsGoalSignal(goal, outputText) {
    const signals = Array.from(new Set(goal
        .replace(/[，。！？、,.!?]/g, " ")
        .split(/\s+/)
        .flatMap((token) => splitChineseSignals(token))
        .filter((token) => token.length >= 2)));
    if (!signals.length)
        return true;
    return signals.some((signal) => outputText.includes(signal));
}
function findUnsupportedAssumption(input, outputText) {
    const inputText = `${input.goal} ${input.blockerHint} ${input.deadline}`;
    return unsupportedAssumptions.find((item) => item.output.test(outputText) && !item.input.test(inputText))?.message;
}
function splitChineseSignals(token) {
    const knownSignals = [
        "考研",
        "减肥",
        "健身",
        "写作",
        "创业",
        "学习",
        "英语",
        "作品集",
        "申请",
        "找工作",
        "自媒体",
        "论文",
        "项目",
        "拖延",
        "焦虑",
        "完美",
        "讨好"
    ];
    const matches = knownSignals.filter((signal) => token.includes(signal));
    return matches.length ? matches : [token];
}
