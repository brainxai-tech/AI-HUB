const crisisPatterns = [
    /自杀|轻生|不想活|结束生命|活不下去|想死|去死/i,
    /suicide|kill myself|end my life|want to die/i,
    /伤害自己|自残|割腕|吞药/i
];
export function needsSafetyMode(input) {
    return crisisPatterns.some((pattern) => pattern.test(`${input.goal} ${input.blockerHint}`));
}
export function buildSafetyResult(input) {
    return {
        goal: input.goal,
        title: "这不是适合反派化的时刻",
        villainName: "危险警报",
        archetype: "安全优先",
        level: 99,
        element: "紧急支持 / 现实求助",
        catchphrase: "先活过这一刻，别一个人扛。",
        hiddenFear: "你现在可能处在需要真人支持的危险状态。",
        disguise: "这不是懒惰、脆弱或失败。",
        spawnScenes: ["强烈自伤念头出现时", "独处并靠近危险物品时", "觉得无人可联系时"],
        attributes: [
            { label: "危险信号", value: 95, note: "输入里出现了需要严肃处理的危机词。" },
            { label: "独处风险", value: 88, note: "此刻最重要的是不要独自承受。" },
            { label: "行动窗口", value: 40, note: "只需要先完成一个求助动作。" },
            { label: "安全优先", value: 100, note: "任何建议都让位于现实安全。" }
        ],
        skills: [
            {
                name: "孤立结界",
                trigger: "你想独自忍过去时",
                effect: "让危险念头无人打断。",
                counter: "立刻联系一个真实的人，明确说“我现在不安全，需要你陪我”。"
            },
            {
                name: "沉默扩大",
                trigger: "你觉得说出口会麻烦别人时",
                effect: "让风险继续上升。",
                counter: "先发一条短消息，不解释全部，只请求陪伴。"
            },
            {
                name: "环境诱导",
                trigger: "危险物品或地点就在身边时",
                effect: "降低你等待帮助的安全性。",
                counter: "把危险物品放远，移动到有人、明亮、开放的位置。"
            }
        ],
        ultimate: "让你误以为必须一个人撑完这一刻。",
        weakness: ["联系真人", "离开危险环境", "拨打当地紧急服务", "让别人陪你"],
        loot: ["多 10 分钟安全时间", "一个现实连接", "下一步求助路径"],
        strategy: {
            todayQuest: "现在先联系一个可信任的人或当地紧急服务，并留下已拨通电话或已发送消息的证据。",
            antiSkill: "不和危险念头辩论，先让真人介入。",
            environmentRule: "离开让你更危险的位置，把可能伤害自己的东西放远。",
            recoveryPlan: "如果没人回复，继续联系第二个人或直接拨打当地紧急电话。",
            bossFightPlan: ["发出求助消息", "移动到更安全的位置", "等待真人回应时保持通话或文字连接"]
        },
        imagePrompt: "安全警报主题角色卡，不生成恐怖或自伤画面，画面中心是明亮出口、电话和保护屏障。",
        shareCopy: "这次不生成反派梗。先联系一个真人，安全优先。",
        boundary: "我不能替代紧急救助、医生或心理咨询师；如果你可能马上伤害自己，请立刻联系当地紧急服务或身边可信任的人。",
        safetyMode: true
    };
}
