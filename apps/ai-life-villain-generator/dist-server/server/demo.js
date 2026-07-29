const seeds = {
    procrastination: {
        archetype: "拖延",
        name: "灰烬拖延王",
        element: "时间吞噬 / 假性准备",
        catchphrase: "等状态好了再开始。",
        disguise: "再查一点资料，这样开始会更稳。",
        hiddenFear: "一旦开始，就必须面对作品不完美的事实。"
    },
    pleasing: {
        archetype: "讨好",
        name: "糖衣和事佬",
        element: "边界融化 / 过度解释",
        catchphrase: "先别让别人失望。",
        disguise: "我只是想把关系处理好。",
        hiddenFear: "拒绝别人之后，自己会被讨厌或抛下。"
    },
    perfectionism: {
        archetype: "完美主义",
        name: "白银审判官",
        element: "标准冻结 / 首版处刑",
        catchphrase: "这还不够好，不能交出去。",
        disguise: "我对自己要求高。",
        hiddenFear: "不完美的版本会暴露自己其实普通。"
    },
    anxiety: {
        archetype: "焦虑",
        name: "警报先知",
        element: "灾难预演 / 注意力劫持",
        catchphrase: "万一出事怎么办？",
        disguise: "我是在提前规划风险。",
        hiddenFear: "如果不一直警戒，就会失控。"
    }
};
export function buildDemoResult(input) {
    const seed = pickSeed(input);
    const goal = input.goal.trim();
    const level = Math.min(88, Math.max(19, 28 + goal.length + (input.blockerHint?.length || 0) % 29));
    return {
        goal,
        title: `你的年度反派：${seed.name}`,
        villainName: seed.name,
        archetype: seed.archetype,
        level,
        element: seed.element,
        catchphrase: seed.catchphrase,
        hiddenFear: seed.hiddenFear,
        disguise: seed.disguise,
        spawnScenes: [
            `打开和“${shortGoal(goal)}”有关的文件，却先去整理桌面。`,
            "把一个 20 分钟动作伪装成宏大人生工程。",
            input.blockerHint ? `在“${input.blockerHint.slice(0, 24)}”出现时立刻强化。` : "深夜收藏教程，第二天忘记入口。"
        ],
        attributes: [
            { label: "阻力场", value: 78, note: "它会把小任务放大成 Boss 战。" },
            { label: "伪努力", value: 72, note: "看起来忙，其实在绕开交付。" },
            { label: "自我消耗", value: 64, note: "想得越久，启动电量越低。" },
            { label: "破防窗口", value: 43, note: "只要开局够小，它会明显变弱。" }
        ],
        skills: [
            {
                name: "无限准备",
                trigger: "你准备开始做正事前",
                effect: "让你多开三个资料页，把开始时间拖到明天。",
                counter: "只允许打开一个必要工具，先产出 10 行粗糙版本。"
            },
            {
                name: "标准升天",
                trigger: "第一版刚出现时",
                effect: "把“能交付”改成“必须惊艳”，然后冻结行动。",
                counter: "给第一版命名为丑版 v0，并设定 25 分钟后必须留下截图或文件。"
            },
            {
                name: "情绪烟雾",
                trigger: "你感觉自己状态不好时",
                effect: "让你误以为必须先有动力，才能行动。",
                counter: "把任务降到不需要动力的大小：打开文件，改一处，保存。"
            }
        ],
        ultimate: "把今天的一个小动作包装成“我整个人生到底行不行”的终极审判。",
        weakness: ["2 分钟启动", "公开一个小承诺", "低质量第一版", "可见完成证据"],
        loot: ["自我信任 +5", "完成感碎片 x3", "下一次启动阻力 -12%"],
        strategy: {
            todayQuest: `今天只做“${shortGoal(goal)}”的一个丑版本，并留下截图、文件或发送记录作为证据。`,
            antiSkill: "别跟它辩论意义，直接缩小动作。",
            environmentRule: "生成后 30 分钟内只保留一个任务窗口，关掉资料页和社交软件。",
            recoveryPlan: "如果失败，不复盘人格，只记录触发场景，并把任务再砍半。",
            bossFightPlan: [
                "写下今天唯一要留下的可见证据。",
                "开 25 分钟计时，只做丑版，不优化标题和排版。",
                "保存或发送结果，并给它命名为 v0。",
                "记录反派这次用了哪个技能。"
            ]
        },
        imagePrompt: `${seed.name}，${seed.element}属性的人格化反派，半身角色卡，夸张轮廓，带有“${shortGoal(goal)}”相关道具，暗色边框，清晰技能图标，中文游戏卡牌设计。`,
        shareCopy: `我的人生反派是「${seed.name}」。它最爱说：${seed.catchphrase} 今日通关任务：先交一个丑版。`,
        boundary: "这是一张行为模式角色卡，不是心理诊断；如果目标涉及健康、法律、财务或危机，请同时寻求专业帮助。",
        safetyMode: false
    };
}
function pickSeed(input) {
    const text = `${input.goal} ${input.blockerHint}`.toLowerCase();
    if (/讨好|拒绝|关系|别人|失望|冲突/.test(text))
        return seeds.pleasing;
    if (/完美|不够好|丢脸|标准|交付|作品/.test(text))
        return seeds.perfectionism;
    if (/焦虑|担心|害怕|万一|紧张|失控/.test(text))
        return seeds.anxiety;
    return seeds.procrastination;
}
function shortGoal(goal) {
    const trimmed = goal.replace(/\s+/g, "");
    return trimmed.length > 16 ? `${trimmed.slice(0, 16)}...` : trimmed;
}
