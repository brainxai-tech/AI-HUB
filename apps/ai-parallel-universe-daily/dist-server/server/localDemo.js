export function demoParallelDaily(input) {
    const activity = input.activity.trim();
    const goal = input.goal.trim() || "让今天的行动不只停在今天";
    const minutes = Math.min(input.tomorrowMinutes, 35);
    return {
        originalInput: activity,
        issueTitle: "三座城市同时刊印了你的明天",
        editorialBrief: `本期编辑部把“${activity}”视为一个微小但可追踪的行动信号。目标不是给你判定输赢，而是看见坚持、放弃和走偏各自会带来的账单。`,
        reports: [
            {
                universe: "persisted",
                label: "你坚持了",
                masthead: "复利晨报",
                dateline: "坚持宇宙 第 1 版",
                headline: "一件小事没有停下，生活开始留下连续的证据",
                subheadline: `围绕“${goal}”，你把今天的动作变成了明天的最低配版本。`,
                lead: "最先变化的不是结果，而是你对自己能否继续的判断。",
                frontPageStory: "在这个宇宙里，你没有把一次行动当作灵感闪现，而是把它降级成可以重复的流程。几天后，阻力并没有消失，但你开始知道什么时候最容易断、用什么方式能接上。",
                editorialNote: "真正的坚持通常不热血，它更像每天给未来留一张收据。",
                signal: "如果你愿意把标准调小，连续性会比强度更早出现。",
                actionAdvice: `明天只做 ${minutes} 分钟同方向动作，并在结束时写下一句“下一次从哪里继续”。`
            },
            {
                universe: "quit",
                label: "你放弃了",
                masthead: "停刊晚报",
                dateline: "放弃宇宙 第 1 版",
                headline: "行动中断后，真正消失的是下一次启动的入口",
                subheadline: "这不是失败报道，而是一份补救窗口提醒。",
                lead: "放弃往往不是突然发生的，它通常从一次没有命名的跳过开始。",
                frontPageStory: "在这个宇宙里，你把今天的事留在了今天。短期内会轻松一点，但过几天后，任务重新出现时会变得更大、更模糊，也更容易被你解释成“可能不适合我”。",
                editorialNote: "中断不可怕，可怕的是把中断误读成自己不行。",
                signal: "你需要的也许不是重新立誓，而是设计一个断了也能接回来的机制。",
                actionAdvice: "明天做一个 5 分钟补票动作：打开材料、写一句、整理一步，重点是恢复入口。"
            },
            {
                universe: "drifted",
                label: "你走偏了",
                masthead: "岔路时报",
                dateline: "走偏宇宙 第 1 版",
                headline: "努力继续上涨，但方向悄悄偏离原来的问题",
                subheadline: "忙碌成为烟雾，真正目标被挤到版面角落。",
                lead: "走偏的危险在于，它看起来比放弃更像进步。",
                frontPageStory: "在这个宇宙里，你继续围绕这件事投入时间，却慢慢开始追求更容易展示的部分。你可能花很多力气优化形式、比较别人、堆工具，却减少了真正推进目标的动作。",
                editorialNote: "不是所有努力都在靠近目标，有些努力只是让焦虑看起来比较体面。",
                signal: "如果一个动作无法回答“它让目标前进了什么”，它可能只是替代性忙碌。",
                actionAdvice: `明天开始前写下唯一判据：${goal} 今天前进 1 厘米会是什么样。`
            }
        ],
        actionPlan: {
            mainAction: `把“${activity}”缩成一个明天能完成的小动作，并设定结束线。`,
            antiDriftReminder: "先问目标，再选工具；先做核心动作，再做包装动作。",
            fallbackAction: "如果状态很差，只保留 5 分钟版本，目的是不断线。",
            firstStepMinutes: minutes
        },
        disclaimer: "这是一份基于输入信息的可能性推演，不是命运预测，也不能替代医疗、法律、金融或其他专业建议。"
    };
}
