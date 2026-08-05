import type { QuizOption, QuizQuestion } from "./types";

export const requiredDimensions = [
  "颜值审美",
  "舞台偏好",
  "作品偏好",
  "性格吸引点",
  "陪伴需求",
  "反差感偏好",
  "追星消费倾向",
  "饭圈互动方式"
] as const;

const option = (
  id: string,
  label: string,
  tags: string[],
  weights: Record<string, number>
): QuizOption => ({
  id,
  label,
  tags,
  weights
});

const authoredQuizQuestions: QuizQuestion[] = [
  {
    id: "visual-01",
    dimension: "颜值审美",
    text: "第一眼刷到陌生爱豆时，哪种脸最容易让你停住？",
    options: [
      option("visual-01-a", "清冷疏离，像隔着玻璃也有故事", ["清冷", "高级感"], { 清冷: 4, 高级感: 3 }),
      option("visual-01-b", "甜酷锋利，漂亮但带一点不好惹", ["甜酷", "反差型"], { 甜酷: 4, 反差型: 2 }),
      option("visual-01-c", "明媚元气，一笑就把画面点亮", ["明媚", "温柔"], { 明媚: 4, 温柔: 2 }),
      option("visual-01-d", "成熟贵气，越看越有氛围和质感", ["高级感", "演员型"], { 高级感: 4, 演员型: 2 })
    ]
  },
  {
    id: "visual-02",
    dimension: "颜值审美",
    text: "你更吃哪种造型记忆点？",
    options: [
      option("visual-02-a", "黑白极简、湿发、冷调灯光", ["清冷", "舞台型"], { 清冷: 3, 舞台型: 2 }),
      option("visual-02-b", "亮色挑染、机能风、舞台妆很敢", ["甜酷", "热血"], { 甜酷: 3, 热血: 2 }),
      option("visual-02-c", "校园感、毛衣、日常照也舒服", ["陪伴型", "温柔"], { 陪伴型: 3, 温柔: 3 }),
      option("visual-02-d", "西装、长镜头、红毯状态在线", ["高级感", "演员型"], { 高级感: 3, 演员型: 3 })
    ]
  },
  {
    id: "visual-03",
    dimension: "颜值审美",
    text: "一组物料里你最容易收藏哪张？",
    options: [
      option("visual-03-a", "不看镜头的侧脸和背影", ["清冷", "佛系"], { 清冷: 3, 佛系: 2 }),
      option("visual-03-b", "舞台汗水、眼神很强的定格", ["舞台型", "热血"], { 舞台型: 3, 热血: 3 }),
      option("visual-03-c", "笑到没包袱的花絮图", ["搞笑", "陪伴型"], { 搞笑: 3, 陪伴型: 2 }),
      option("visual-03-d", "杂志大片，构图和服装都很完整", ["高级感", "收藏型"], { 高级感: 3, 收藏型: 2 })
    ]
  },
  {
    id: "visual-04",
    dimension: "颜值审美",
    text: "你心里的“神图”更像什么？",
    options: [
      option("visual-04-a", "冷感电影截图，安静但冲击力很强", ["清冷", "演员型"], { 清冷: 4, 演员型: 2 }),
      option("visual-04-b", "大舞台中心位，动作和表情都踩点", ["舞台型", "实力派"], { 舞台型: 4, 实力派: 2 }),
      option("visual-04-c", "生活感抓拍，像能陪你过一天", ["陪伴型", "温柔"], { 陪伴型: 4, 温柔: 2 }),
      option("visual-04-d", "风格实验很强，换概念也不违和", ["反差型", "甜酷"], { 反差型: 3, 甜酷: 3 })
    ]
  },
  {
    id: "visual-05",
    dimension: "颜值审美",
    text: "如果只看五秒短视频，你会被什么吸引？",
    options: [
      option("visual-05-a", "眼神有距离感，越品越上头", ["清冷", "高级感"], { 清冷: 3, 高级感: 3 }),
      option("visual-05-b", "表情管理很会，镜头一来就抓人", ["舞台型", "甜酷"], { 舞台型: 3, 甜酷: 3 }),
      option("visual-05-c", "自然亲和，像朋友一样可爱", ["陪伴型", "明媚"], { 陪伴型: 3, 明媚: 3 }),
      option("visual-05-d", "角色感强，像刚从作品里走出来", ["演员型", "高级感"], { 演员型: 4, 高级感: 2 })
    ]
  },
  {
    id: "stage-01",
    dimension: "舞台偏好",
    text: "你最愿意反复刷哪类舞台？",
    options: [
      option("stage-a", "爆发力强的唱跳舞台，越燃越好", ["舞台型", "热血", "实力派"], { 舞台型: 5, 热血: 4, 实力派: 3 }),
      option("stage-01-b", "情绪很满的慢歌现场，声音能托住人", ["实力派", "温柔"], { 实力派: 4, 温柔: 3 }),
      option("stage-01-c", "概念完整的群舞，队形和叙事都好看", ["养成系", "舞台型"], { 养成系: 3, 舞台型: 4 }),
      option("stage-01-d", "镜头感细腻的个人舞台，细节控狂喜", ["清冷", "舞台型"], { 清冷: 3, 舞台型: 3 })
    ]
  },
  {
    id: "stage-02",
    dimension: "舞台偏好",
    text: "你判断舞台好不好，最看重什么？",
    options: [
      option("stage-b", "live 稳、动作准，实力经得起放大", ["舞台型", "实力派"], { 舞台型: 4, 实力派: 5 }),
      option("stage-02-b", "氛围压得住，全场目光自然被吸过去", ["高级感", "舞台型"], { 高级感: 3, 舞台型: 4 }),
      option("stage-02-c", "成员成长明显，每次回归都有新惊喜", ["养成系", "热血"], { 养成系: 4, 热血: 2 }),
      option("stage-02-d", "台上台下完全不同，反差越大越好", ["反差型", "舞台型"], { 反差型: 4, 舞台型: 3 })
    ]
  },
  {
    id: "stage-03",
    dimension: "舞台偏好",
    text: "一支直拍让你入坑，通常是因为？",
    options: [
      option("stage-03-a", "动作干净，卡点像本能", ["实力派", "舞台型"], { 实力派: 4, 舞台型: 3 }),
      option("stage-03-b", "眼神和表情会讲故事", ["演员型", "舞台型"], { 演员型: 3, 舞台型: 3 }),
      option("stage-03-c", "笑场或小互动很可爱", ["搞笑", "陪伴型"], { 搞笑: 3, 陪伴型: 2 }),
      option("stage-03-d", "整个人像发光，少年热气扑面来", ["热血", "明媚"], { 热血: 4, 明媚: 2 })
    ]
  },
  {
    id: "stage-04",
    dimension: "舞台偏好",
    text: "你更喜欢哪种演唱会片段？",
    options: [
      option("stage-04-a", "全场大合唱，情绪顶到最高点", ["热血", "线下应援型"], { 热血: 3, 线下应援型: 4 }),
      option("stage-04-b", "安静讲话，像把心事讲给粉丝听", ["陪伴型", "温柔"], { 陪伴型: 4, 温柔: 3 }),
      option("stage-04-c", "solo 舞台，个人能力非常明确", ["实力派", "舞台型"], { 实力派: 4, 舞台型: 3 }),
      option("stage-04-d", "即兴玩梗，全场笑成一片", ["搞笑", "饭圈互动型"], { 搞笑: 4, 饭圈互动型: 2 })
    ]
  },
  {
    id: "stage-05",
    dimension: "舞台偏好",
    text: "你会更期待哪种回归概念？",
    options: [
      option("stage-05-a", "暗色电影感，故事和造型都高级", ["清冷", "高级感"], { 清冷: 3, 高级感: 4 }),
      option("stage-05-b", "强节奏舞曲，舞台传播性很强", ["舞台型", "热血"], { 舞台型: 4, 热血: 3 }),
      option("stage-05-c", "明亮青春，适合循环一整天", ["明媚", "陪伴型"], { 明媚: 3, 陪伴型: 3 }),
      option("stage-05-d", "风格大转弯，越不像过去越刺激", ["反差型", "甜酷"], { 反差型: 4, 甜酷: 2 })
    ]
  },
  {
    id: "works-01",
    dimension: "作品偏好",
    text: "舞台之外，你最愿意从哪里认识一个爱豆？",
    options: [
      option("works-01-a", "影视角色，先被作品和人物打动", ["演员型", "作品型"], { 演员型: 5, 作品型: 3 }),
      option("works-01-b", "原创音乐，词曲制作能看到表达", ["创作型", "实力派"], { 创作型: 5, 实力派: 3 }),
      option("works-01-c", "综艺片段，真实反应最有意思", ["综艺型", "搞笑"], { 综艺型: 4, 搞笑: 3 }),
      option("works-01-d", "纪录片或练习室，成长线很完整", ["养成系", "热血"], { 养成系: 4, 热血: 2 })
    ]
  },
  {
    id: "works-02",
    dimension: "作品偏好",
    text: "哪种作品履历会增加你的好感？",
    options: [
      option("works-02-a", "角色跨度大，能演不同类型人物", ["演员型", "反差型"], { 演员型: 4, 反差型: 2 }),
      option("works-02-b", "稳定发歌，每张专辑都有个人表达", ["创作型", "实力派"], { 创作型: 4, 实力派: 3 }),
      option("works-02-c", "舞台出圈多，直拍和现场能打", ["舞台型", "实力派"], { 舞台型: 4, 实力派: 3 }),
      option("works-02-d", "常驻综艺表现舒服，能接住场子", ["综艺型", "饭圈互动型"], { 综艺型: 4, 饭圈互动型: 2 })
    ]
  },
  {
    id: "works-03",
    dimension: "作品偏好",
    text: "你更愿意安利朋友哪种素材？",
    options: [
      option("works-03-a", "三分钟高光舞台合集", ["舞台型", "安利型"], { 舞台型: 3, 安利型: 3 }),
      option("works-03-b", "角色混剪和台词片段", ["演员型", "作品型"], { 演员型: 4, 作品型: 3 }),
      option("works-03-c", "采访金句和创作幕后", ["创作型", "清冷"], { 创作型: 3, 清冷: 2 }),
      option("works-03-d", "综艺名场面，先让对方笑出来", ["综艺型", "搞笑"], { 综艺型: 4, 搞笑: 3 })
    ]
  },
  {
    id: "works-04",
    dimension: "作品偏好",
    text: "看到长期路线规划时，你会偏向？",
    options: [
      option("works-04-a", "舞台核心，持续升级唱跳和现场", ["舞台型", "实力派"], { 舞台型: 4, 实力派: 3 }),
      option("works-04-b", "影视发展，靠角色沉淀大众认知", ["演员型", "高级感"], { 演员型: 4, 高级感: 2 }),
      option("works-04-c", "音乐表达，作品里能听到本人", ["创作型", "温柔"], { 创作型: 4, 温柔: 2 }),
      option("works-04-d", "综艺和直播，陪伴感更稳定", ["综艺型", "陪伴型"], { 综艺型: 3, 陪伴型: 4 })
    ]
  },
  {
    id: "works-05",
    dimension: "作品偏好",
    text: "你能接受作品空窗期吗？",
    options: [
      option("works-05-a", "可以，只要每次回归质量高", ["佛系", "实力派"], { 佛系: 3, 实力派: 3 }),
      option("works-05-b", "希望舞台和物料稳定更新", ["舞台型", "陪伴型"], { 舞台型: 3, 陪伴型: 3 }),
      option("works-05-c", "只要有日常营业就能等", ["饭圈互动型", "陪伴型"], { 饭圈互动型: 3, 陪伴型: 3 }),
      option("works-05-d", "更想看成长过程，空窗也能补档", ["养成系", "收藏型"], { 养成系: 3, 收藏型: 2 })
    ]
  },
  {
    id: "personality-01",
    dimension: "性格吸引点",
    text: "你最容易被哪种性格击中？",
    options: [
      option("personality-01-a", "温柔细腻，照顾别人也照顾情绪", ["温柔", "陪伴型"], { 温柔: 5, 陪伴型: 3 }),
      option("personality-01-b", "热血真诚，有目标就一直往前冲", ["热血", "养成系"], { 热血: 5, 养成系: 2 }),
      option("personality-01-c", "冷静克制，不多说但很有分寸", ["清冷", "佛系"], { 清冷: 4, 佛系: 3 }),
      option("personality-01-d", "搞笑松弛，能把尴尬变成名场面", ["搞笑", "综艺型"], { 搞笑: 5, 综艺型: 2 })
    ]
  },
  {
    id: "personality-02",
    dimension: "性格吸引点",
    text: "看到采访时，你会更喜欢哪种表达？",
    options: [
      option("personality-02-a", "真诚直接，讲目标不绕弯", ["热血", "实力派"], { 热血: 3, 实力派: 2 }),
      option("personality-02-b", "回答有边界，留白反而更迷人", ["清冷", "高级感"], { 清冷: 4, 高级感: 2 }),
      option("personality-02-c", "接梗快，临场反应很好笑", ["搞笑", "综艺型"], { 搞笑: 4, 综艺型: 3 }),
      option("personality-02-d", "讲话柔软，像认真听你说完", ["温柔", "陪伴型"], { 温柔: 4, 陪伴型: 3 })
    ]
  },
  {
    id: "personality-03",
    dimension: "性格吸引点",
    text: "你更相信哪种魅力会长久？",
    options: [
      option("personality-03-a", "稳定专业，实力让人安心", ["实力派", "佛系"], { 实力派: 4, 佛系: 2 }),
      option("personality-03-b", "一直成长，看见努力被兑现", ["养成系", "热血"], { 养成系: 4, 热血: 3 }),
      option("personality-03-c", "情绪价值高，低谷时也能被安慰", ["陪伴型", "温柔"], { 陪伴型: 4, 温柔: 3 }),
      option("personality-03-d", "个性鲜明，不会轻易被替代", ["反差型", "清冷"], { 反差型: 3, 清冷: 3 })
    ]
  },
  {
    id: "personality-04",
    dimension: "性格吸引点",
    text: "你对“营业感”的接受程度是？",
    options: [
      option("personality-04-a", "喜欢自然互动，热闹一点也没关系", ["饭圈互动型", "陪伴型"], { 饭圈互动型: 4, 陪伴型: 3 }),
      option("personality-04-b", "更喜欢低调，少但真就够了", ["佛系", "清冷"], { 佛系: 4, 清冷: 3 }),
      option("personality-04-c", "只要有作品和舞台，营业不重要", ["实力派", "作品型"], { 实力派: 3, 作品型: 3 }),
      option("personality-04-d", "希望会玩梗，互动越有梗越好", ["搞笑", "饭圈互动型"], { 搞笑: 4, 饭圈互动型: 3 })
    ]
  },
  {
    id: "personality-05",
    dimension: "性格吸引点",
    text: "如果他/她遇到压力，你最想看到什么？",
    options: [
      option("personality-05-a", "用更好的舞台回应", ["舞台型", "热血"], { 舞台型: 3, 热血: 4 }),
      option("personality-05-b", "坦诚沟通，让粉丝知道状态", ["陪伴型", "温柔"], { 陪伴型: 4, 温柔: 3 }),
      option("personality-05-c", "安静消化，拿作品说话", ["清冷", "作品型"], { 清冷: 3, 作品型: 3 }),
      option("personality-05-d", "用幽默化解，别让大家太沉重", ["搞笑", "综艺型"], { 搞笑: 4, 综艺型: 2 })
    ]
  },
  {
    id: "companionship-01",
    dimension: "陪伴需求",
    text: "你追星时最需要哪种陪伴感？",
    options: [
      option("companionship-01-a", "像固定充电站，累了能看一眼恢复", ["陪伴型", "温柔"], { 陪伴型: 5, 温柔: 3 }),
      option("companionship-01-b", "像共同进步的伙伴，跟着他也想努力", ["热血", "养成系"], { 热血: 4, 养成系: 3 }),
      option("companionship-01-c", "像稳定审美出口，安静欣赏就好", ["清冷", "佛系"], { 清冷: 3, 佛系: 4 }),
      option("companionship-01-d", "像快乐开关，随时能看物料放松", ["搞笑", "综艺型"], { 搞笑: 4, 综艺型: 3 })
    ]
  },
  {
    id: "companionship-02",
    dimension: "陪伴需求",
    text: "你更喜欢哪种日常物料？",
    options: [
      option("companionship-02-a", "vlog、直播、练习室日常", ["陪伴型", "饭圈互动型"], { 陪伴型: 4, 饭圈互动型: 3 }),
      option("companionship-02-b", "幕后训练，能看到真实投入", ["养成系", "实力派"], { 养成系: 3, 实力派: 3 }),
      option("companionship-02-c", "杂志花絮，质感和审美在线", ["高级感", "收藏型"], { 高级感: 3, 收藏型: 2 }),
      option("companionship-02-d", "综艺reaction，真实好笑最重要", ["搞笑", "综艺型"], { 搞笑: 4, 综艺型: 3 })
    ]
  },
  {
    id: "companionship-03",
    dimension: "陪伴需求",
    text: "你最容易在什么时候打开他的物料？",
    options: [
      option("companionship-03-a", "疲惫时，想要被轻轻接住", ["陪伴型", "温柔"], { 陪伴型: 4, 温柔: 4 }),
      option("companionship-03-b", "低动力时，需要被点燃一下", ["热血", "舞台型"], { 热血: 4, 舞台型: 2 }),
      option("companionship-03-c", "想提升审美时，刷造型和大片", ["高级感", "收藏型"], { 高级感: 4, 收藏型: 2 }),
      option("companionship-03-d", "需要笑一笑时，补综艺名场面", ["搞笑", "综艺型"], { 搞笑: 4, 综艺型: 3 })
    ]
  },
  {
    id: "companionship-04",
    dimension: "陪伴需求",
    text: "粉丝关系里你更看重什么？",
    options: [
      option("companionship-04-a", "真诚表达，彼此知道在陪伴", ["陪伴型", "温柔"], { 陪伴型: 4, 温柔: 3 }),
      option("companionship-04-b", "边界清楚，各自生活但互相欣赏", ["佛系", "清冷"], { 佛系: 4, 清冷: 3 }),
      option("companionship-04-c", "一起见证成长，过程比结果更珍贵", ["养成系", "热血"], { 养成系: 4, 热血: 2 }),
      option("companionship-04-d", "互动有趣，饭圈氛围别太沉重", ["饭圈互动型", "搞笑"], { 饭圈互动型: 4, 搞笑: 3 })
    ]
  },
  {
    id: "companionship-05",
    dimension: "陪伴需求",
    text: "如果只能保留一种内容更新，你选？",
    options: [
      option("companionship-05-a", "稳定舞台和现场", ["舞台型", "实力派"], { 舞台型: 4, 实力派: 3 }),
      option("companionship-05-b", "日常碎片和直播", ["陪伴型", "饭圈互动型"], { 陪伴型: 4, 饭圈互动型: 3 }),
      option("companionship-05-c", "作品预告和幕后", ["演员型", "作品型"], { 演员型: 3, 作品型: 3 }),
      option("companionship-05-d", "综艺和短视频", ["综艺型", "搞笑"], { 综艺型: 4, 搞笑: 3 })
    ]
  },
  {
    id: "contrast-01",
    dimension: "反差感偏好",
    text: "你最吃哪种反差？",
    options: [
      option("contrast-01-a", "台上攻击性强，台下很软", ["反差型", "甜酷"], { 反差型: 5, 甜酷: 3 }),
      option("contrast-01-b", "外表清冷，熟了其实很温柔", ["反差型", "清冷", "温柔"], { 反差型: 4, 清冷: 3, 温柔: 2 }),
      option("contrast-01-c", "综艺很搞笑，作品里很认真", ["反差型", "搞笑", "演员型"], { 反差型: 4, 搞笑: 3, 演员型: 2 }),
      option("contrast-01-d", "平时低调，关键舞台直接爆发", ["反差型", "舞台型", "实力派"], { 反差型: 4, 舞台型: 3, 实力派: 2 })
    ]
  },
  {
    id: "contrast-02",
    dimension: "反差感偏好",
    text: "你更愿意为哪种隐藏面入坑？",
    options: [
      option("contrast-02-a", "不爱多说，但每次准备都很认真", ["清冷", "实力派"], { 清冷: 3, 实力派: 3 }),
      option("contrast-02-b", "看起来乖，舞台上很敢", ["甜酷", "舞台型"], { 甜酷: 4, 舞台型: 3 }),
      option("contrast-02-c", "平时爱玩，正事上非常靠谱", ["搞笑", "实力派"], { 搞笑: 3, 实力派: 3 }),
      option("contrast-02-d", "成熟外表下有少年感", ["明媚", "反差型"], { 明媚: 3, 反差型: 3 })
    ]
  },
  {
    id: "contrast-03",
    dimension: "反差感偏好",
    text: "你对人设的偏好更接近？",
    options: [
      option("contrast-03-a", "少一点人设，多一点真实留白", ["佛系", "清冷"], { 佛系: 4, 清冷: 3 }),
      option("contrast-03-b", "明确风格标签，越鲜明越好记", ["甜酷", "安利型"], { 甜酷: 3, 安利型: 3 }),
      option("contrast-03-c", "能不断刷新认知，不被单一标签困住", ["反差型", "演员型"], { 反差型: 4, 演员型: 2 }),
      option("contrast-03-d", "稳定暖心，知道他是什么样就安心", ["温柔", "陪伴型"], { 温柔: 4, 陪伴型: 3 })
    ]
  },
  {
    id: "contrast-04",
    dimension: "反差感偏好",
    text: "看到哪种剪辑标题你会点开？",
    options: [
      option("contrast-04-a", "“别被他的冷脸骗了”", ["清冷", "反差型"], { 清冷: 3, 反差型: 4 }),
      option("contrast-04-b", "“这个舞台把我燃醒了”", ["热血", "舞台型"], { 热血: 4, 舞台型: 3 }),
      option("contrast-04-c", "“综艺感原来是天生的”", ["搞笑", "综艺型"], { 搞笑: 4, 综艺型: 3 }),
      option("contrast-04-d", "“从新人到现在的成长线”", ["养成系", "热血"], { 养成系: 4, 热血: 2 })
    ]
  },
  {
    id: "contrast-05",
    dimension: "反差感偏好",
    text: "你希望一个爱豆最难被替代的点是？",
    options: [
      option("contrast-05-a", "舞台人格一出来就变了一个人", ["反差型", "舞台型"], { 反差型: 4, 舞台型: 4 }),
      option("contrast-05-b", "作品里每个角色都不像本人", ["演员型", "反差型"], { 演员型: 4, 反差型: 3 }),
      option("contrast-05-c", "温柔和幽默并存，情绪价值很稳定", ["温柔", "搞笑", "陪伴型"], { 温柔: 3, 搞笑: 2, 陪伴型: 3 }),
      option("contrast-05-d", "审美路线独特，气质很难复制", ["高级感", "清冷"], { 高级感: 4, 清冷: 3 })
    ]
  },
  {
    id: "spend-01",
    dimension: "追星消费倾向",
    text: "你最愿意把预算花在哪里？",
    options: [
      option("spend-01-a", "演唱会、见面会，真实见到最重要", ["线下应援型", "舞台型"], { 线下应援型: 5, 舞台型: 3 }),
      option("spend-01-b", "专辑、小卡、周边，喜欢收集实体感", ["收藏型", "消费支持型"], { 收藏型: 5, 消费支持型: 3 }),
      option("spend-01-c", "会员、音源、作品支持，花得更理性", ["作品型", "消费支持型"], { 作品型: 3, 消费支持型: 4 }),
      option("spend-01-d", "少花钱，多看物料和免费内容", ["佛系", "陪伴型"], { 佛系: 5, 陪伴型: 2 })
    ]
  },
  {
    id: "spend-02",
    dimension: "追星消费倾向",
    text: "新品周边上线，你通常会？",
    options: [
      option("spend-02-a", "先看设计和质感，喜欢才买", ["收藏型", "高级感"], { 收藏型: 3, 高级感: 3 }),
      option("spend-02-b", "看是不是能支持作品或舞台", ["消费支持型", "实力派"], { 消费支持型: 4, 实力派: 2 }),
      option("spend-02-c", "只买最有纪念意义的一两件", ["佛系", "收藏型"], { 佛系: 3, 收藏型: 2 }),
      option("spend-02-d", "和同担一起拼，热闹也开心", ["饭圈互动型", "消费支持型"], { 饭圈互动型: 3, 消费支持型: 3 })
    ]
  },
  {
    id: "spend-03",
    dimension: "追星消费倾向",
    text: "你对打榜/数据的态度是？",
    options: [
      option("spend-03-a", "愿意参与，关键时期想帮他冲一下", ["数据型", "热血"], { 数据型: 5, 热血: 2 }),
      option("spend-03-b", "了解规则但不高强度参与", ["佛系", "数据型"], { 佛系: 3, 数据型: 2 }),
      option("spend-03-c", "更想用作品反馈支持", ["作品型", "消费支持型"], { 作品型: 3, 消费支持型: 3 }),
      option("spend-03-d", "主要在线下活动和演出支持", ["线下应援型", "舞台型"], { 线下应援型: 4, 舞台型: 3 })
    ]
  },
  {
    id: "spend-04",
    dimension: "追星消费倾向",
    text: "你最能接受哪种追星节奏？",
    options: [
      option("spend-04-a", "高频上线，活动期一起冲刺", ["数据型", "饭圈互动型"], { 数据型: 3, 饭圈互动型: 3 }),
      option("spend-04-b", "稳定支持，不把追星变压力", ["佛系", "陪伴型"], { 佛系: 4, 陪伴型: 3 }),
      option("spend-04-c", "有大舞台或巡演时集中投入", ["线下应援型", "舞台型"], { 线下应援型: 4, 舞台型: 3 }),
      option("spend-04-d", "看到好内容就愿意自发安利", ["安利型", "作品型"], { 安利型: 4, 作品型: 2 })
    ]
  },
  {
    id: "spend-05",
    dimension: "追星消费倾向",
    text: "你觉得“值得粉”的证明更像什么？",
    options: [
      option("spend-05-a", "花钱花时间后，作品质量确实回馈我", ["作品型", "实力派"], { 作品型: 4, 实力派: 3 }),
      option("spend-05-b", "现场体验足够震撼，记忆能留很久", ["线下应援型", "舞台型"], { 线下应援型: 4, 舞台型: 3 }),
      option("spend-05-c", "饭圈氛围舒服，互动让人有归属感", ["饭圈互动型", "陪伴型"], { 饭圈互动型: 4, 陪伴型: 3 }),
      option("spend-05-d", "不用投入很多，也能获得持续快乐", ["佛系", "搞笑"], { 佛系: 4, 搞笑: 2 })
    ]
  },
  {
    id: "interaction-01",
    dimension: "饭圈互动方式",
    text: "你在饭圈里更像哪种人？",
    options: [
      option("interaction-a", "会剪视频、写安利、主动把好内容推出去", ["饭圈互动型", "安利型", "数据型"], { 饭圈互动型: 5, 安利型: 4, 数据型: 2 }),
      option("interaction-01-b", "潜水收藏型，自己默默快乐就好", ["佛系", "收藏型"], { 佛系: 4, 收藏型: 3 }),
      option("interaction-01-c", "评论区气氛组，喜欢接梗互动", ["搞笑", "饭圈互动型"], { 搞笑: 3, 饭圈互动型: 4 }),
      option("interaction-01-d", "线下搭子，演出和快闪更有参与感", ["线下应援型", "陪伴型"], { 线下应援型: 4, 陪伴型: 2 })
    ]
  },
  {
    id: "interaction-02",
    dimension: "饭圈互动方式",
    text: "你更喜欢什么样的同担氛围？",
    options: [
      option("interaction-02-a", "审美一致，产出漂亮又会讲故事", ["安利型", "高级感"], { 安利型: 3, 高级感: 3 }),
      option("interaction-02-b", "热血团结，关键时刻能一起冲", ["数据型", "热血"], { 数据型: 4, 热血: 3 }),
      option("interaction-02-c", "轻松好笑，别太内耗", ["搞笑", "佛系"], { 搞笑: 4, 佛系: 3 }),
      option("interaction-02-d", "温和稳定，尊重边界也彼此陪伴", ["温柔", "陪伴型"], { 温柔: 3, 陪伴型: 4 })
    ]
  },
  {
    id: "interaction-03",
    dimension: "饭圈互动方式",
    text: "看到争议话题时，你通常会？",
    options: [
      option("interaction-03-a", "先看事实和作品，不急着下场", ["佛系", "清冷"], { 佛系: 4, 清冷: 2 }),
      option("interaction-03-b", "愿意整理信息，帮路人看懂重点", ["安利型", "数据型"], { 安利型: 3, 数据型: 3 }),
      option("interaction-03-c", "尽量维持轻松氛围，不想被消耗", ["搞笑", "陪伴型"], { 搞笑: 3, 陪伴型: 2 }),
      option("interaction-03-d", "和同担一起守住重要阵地", ["饭圈互动型", "热血"], { 饭圈互动型: 4, 热血: 3 })
    ]
  },
  {
    id: "interaction-04",
    dimension: "饭圈互动方式",
    text: "你最想参与哪种饭圈产出？",
    options: [
      option("interaction-04-a", "舞台混剪和直拍推荐", ["舞台型", "安利型"], { 舞台型: 3, 安利型: 4 }),
      option("interaction-04-b", "角色分析和作品repo", ["演员型", "作品型", "安利型"], { 演员型: 3, 作品型: 3, 安利型: 2 }),
      option("interaction-04-c", "物料整理、时间线和成长记录", ["养成系", "收藏型"], { 养成系: 4, 收藏型: 3 }),
      option("interaction-04-d", "表情包、梗图和综艺切片", ["搞笑", "综艺型"], { 搞笑: 4, 综艺型: 3 })
    ]
  },
  {
    id: "interaction-05",
    dimension: "饭圈互动方式",
    text: "你希望推荐结果给你的第一条入坑路径是？",
    options: [
      option("interaction-05-a", "先看最出圈舞台，一眼判断有没有化学反应", ["舞台型", "热血"], { 舞台型: 4, 热血: 2 }),
      option("interaction-05-b", "先看代表作品，靠角色或音乐慢慢入坑", ["作品型", "演员型"], { 作品型: 4, 演员型: 2 }),
      option("interaction-05-c", "先看综艺日常，确认性格是不是对味", ["综艺型", "搞笑", "陪伴型"], { 综艺型: 3, 搞笑: 2, 陪伴型: 2 }),
      option("interaction-05-d", "先看成长线和粉丝向长文，理解为什么值得", ["养成系", "安利型"], { 养成系: 3, 安利型: 3 })
    ]
  }
];

type SimpleQuestionCopy = {
  text: string;
  options: Record<string, string>;
};

const simpleQuestionCopy: Record<string, SimpleQuestionCopy> = {
  "visual-01": {
    text: "你第一眼更喜欢哪种长相？",
    options: {
      "visual-01-a": "清冷有距离感",
      "visual-01-b": "甜酷有攻击力",
      "visual-01-c": "阳光爱笑",
      "visual-01-d": "成熟有质感"
    }
  },
  "visual-02": {
    text: "你更喜欢哪种造型？",
    options: {
      "visual-02-a": "黑白冷感",
      "visual-02-b": "亮色大胆",
      "visual-02-c": "校园日常",
      "visual-02-d": "西装红毯"
    }
  },
  "visual-03": {
    text: "你最想收藏哪种图？",
    options: {
      "visual-03-a": "侧脸背影",
      "visual-03-b": "舞台定格",
      "visual-03-c": "搞笑花絮",
      "visual-03-d": "杂志大片"
    }
  },
  "visual-04": {
    text: "哪种照片更像神图？",
    options: {
      "visual-04-a": "冷感截图",
      "visual-04-b": "舞台中心",
      "visual-04-c": "生活抓拍",
      "visual-04-d": "风格实验"
    }
  },
  "visual-05": {
    text: "短视频里你看什么？",
    options: {
      "visual-05-a": "眼神距离感",
      "visual-05-b": "镜头表现力",
      "visual-05-c": "自然亲和",
      "visual-05-d": "角色氛围"
    }
  },
  "stage-01": {
    text: "你最爱刷哪种舞台？",
    options: {
      "stage-a": "燃炸唱跳",
      "stage-01-b": "慢歌现场",
      "stage-01-c": "完整群舞",
      "stage-01-d": "个人直拍"
    }
  },
  "stage-02": {
    text: "你最看重舞台的什么？",
    options: {
      "stage-b": "实力稳定",
      "stage-02-b": "气场很强",
      "stage-02-c": "成长明显",
      "stage-02-d": "台上反差"
    }
  },
  "stage-03": {
    text: "直拍让你入坑的点是？",
    options: {
      "stage-03-a": "动作干净",
      "stage-03-b": "表情会演",
      "stage-03-c": "小互动可爱",
      "stage-03-d": "少年感强"
    }
  },
  "stage-04": {
    text: "你爱看哪种演唱会片段？",
    options: {
      "stage-04-a": "全场合唱",
      "stage-04-b": "安静讲话",
      "stage-04-c": "solo舞台",
      "stage-04-d": "即兴玩梗"
    }
  },
  "stage-05": {
    text: "你期待哪种回归风格？",
    options: {
      "stage-05-a": "暗色电影感",
      "stage-05-b": "强节奏舞曲",
      "stage-05-c": "明亮青春",
      "stage-05-d": "风格大转弯"
    }
  },
  "works-01": {
    text: "舞台外你想先看什么？",
    options: {
      "works-01-a": "影视角色",
      "works-01-b": "原创音乐",
      "works-01-c": "综艺片段",
      "works-01-d": "成长纪录"
    }
  },
  "works-02": {
    text: "哪种作品更加分？",
    options: {
      "works-02-a": "角色跨度大",
      "works-02-b": "稳定发歌",
      "works-02-c": "舞台常出圈",
      "works-02-d": "综艺表现好"
    }
  },
  "works-03": {
    text: "你会拿什么安利朋友？",
    options: {
      "works-03-a": "舞台合集",
      "works-03-b": "角色混剪",
      "works-03-c": "采访幕后",
      "works-03-d": "综艺名场面"
    }
  },
  "works-04": {
    text: "你希望他主攻什么？",
    options: {
      "works-04-a": "舞台唱跳",
      "works-04-b": "影视角色",
      "works-04-c": "音乐创作",
      "works-04-d": "综艺直播"
    }
  },
  "works-05": {
    text: "作品空窗期你能接受吗？",
    options: {
      "works-05-a": "质量高就行",
      "works-05-b": "想常看舞台",
      "works-05-c": "有日常就行",
      "works-05-d": "补成长线"
    }
  },
  "personality-01": {
    text: "你更吃哪种性格？",
    options: {
      "personality-01-a": "温柔细腻",
      "personality-01-b": "热血真诚",
      "personality-01-c": "冷静克制",
      "personality-01-d": "搞笑松弛"
    }
  },
  "personality-02": {
    text: "采访里你喜欢哪种人？",
    options: {
      "personality-02-a": "直接真诚",
      "personality-02-b": "有边界感",
      "personality-02-c": "很会接梗",
      "personality-02-d": "说话柔软"
    }
  },
  "personality-03": {
    text: "你觉得哪种魅力更久？",
    options: {
      "personality-03-a": "稳定专业",
      "personality-03-b": "一直成长",
      "personality-03-c": "情绪价值高",
      "personality-03-d": "个性鲜明"
    }
  },
  "personality-04": {
    text: "你喜欢哪种营业方式？",
    options: {
      "personality-04-a": "自然互动",
      "personality-04-b": "低调真实",
      "personality-04-c": "看作品就好",
      "personality-04-d": "互动玩梗"
    }
  },
  "personality-05": {
    text: "遇到压力时你想看他？",
    options: {
      "personality-05-a": "用舞台回应",
      "personality-05-b": "坦诚沟通",
      "personality-05-c": "拿作品说话",
      "personality-05-d": "幽默化解"
    }
  },
  "companionship-01": {
    text: "追星时你最需要什么？",
    options: {
      "companionship-01-a": "温柔安慰",
      "companionship-01-b": "热血鼓励",
      "companionship-01-c": "安静欣赏",
      "companionship-01-d": "获得快乐"
    }
  },
  "companionship-02": {
    text: "你喜欢哪种日常物料？",
    options: {
      "companionship-02-a": "vlog直播",
      "companionship-02-b": "训练幕后",
      "companionship-02-c": "杂志花絮",
      "companionship-02-d": "综艺反应"
    }
  },
  "companionship-03": {
    text: "什么时候会打开物料？",
    options: {
      "companionship-03-a": "很疲惫时",
      "companionship-03-b": "没动力时",
      "companionship-03-c": "想看美图时",
      "companionship-03-d": "想笑一下时"
    }
  },
  "companionship-04": {
    text: "粉丝关系你看重什么？",
    options: {
      "companionship-04-a": "真诚陪伴",
      "companionship-04-b": "边界清楚",
      "companionship-04-c": "见证成长",
      "companionship-04-d": "互动有趣"
    }
  },
  "companionship-05": {
    text: "只能保留一种更新？",
    options: {
      "companionship-05-a": "舞台现场",
      "companionship-05-b": "日常直播",
      "companionship-05-c": "作品幕后",
      "companionship-05-d": "综艺短视频"
    }
  },
  "contrast-01": {
    text: "你最喜欢哪种反差？",
    options: {
      "contrast-01-a": "台上强台下软",
      "contrast-01-b": "冷脸很温柔",
      "contrast-01-c": "搞笑又认真",
      "contrast-01-d": "低调会爆发"
    }
  },
  "contrast-02": {
    text: "哪种隐藏面最吸引你？",
    options: {
      "contrast-02-a": "默默认真",
      "contrast-02-b": "乖但很敢",
      "contrast-02-c": "爱玩也靠谱",
      "contrast-02-d": "成熟有少年感"
    }
  },
  "contrast-03": {
    text: "你喜欢哪种人设？",
    options: {
      "contrast-03-a": "真实留白",
      "contrast-03-b": "标签鲜明",
      "contrast-03-c": "经常变化",
      "contrast-03-d": "稳定暖心"
    }
  },
  "contrast-04": {
    text: "哪种标题你会点开？",
    options: {
      "contrast-04-a": "冷脸其实很软",
      "contrast-04-b": "舞台燃醒我",
      "contrast-04-c": "综艺感太强",
      "contrast-04-d": "成长线好完整"
    }
  },
  "contrast-05": {
    text: "你希望他最特别的是？",
    options: {
      "contrast-05-a": "舞台人格强",
      "contrast-05-b": "角色差异大",
      "contrast-05-c": "温柔又幽默",
      "contrast-05-d": "气质难复制"
    }
  },
  "spend-01": {
    text: "你愿意把钱花在哪？",
    options: {
      "spend-01-a": "演唱会见面会",
      "spend-01-b": "专辑小卡周边",
      "spend-01-c": "音源作品支持",
      "spend-01-d": "少花钱看物料"
    }
  },
  "spend-02": {
    text: "新周边上线你会？",
    options: {
      "spend-02-a": "看设计再买",
      "spend-02-b": "能支持就买",
      "spend-02-c": "只买纪念款",
      "spend-02-d": "和同担一起拼"
    }
  },
  "spend-03": {
    text: "你会参与打榜吗？",
    options: {
      "spend-03-a": "关键期会冲",
      "spend-03-b": "了解但少做",
      "spend-03-c": "主要支持作品",
      "spend-03-d": "主要看线下"
    }
  },
  "spend-04": {
    text: "你适合哪种追星节奏？",
    options: {
      "spend-04-a": "活动期冲刺",
      "spend-04-b": "稳定不压力",
      "spend-04-c": "巡演时投入",
      "spend-04-d": "看到好就安利"
    }
  },
  "spend-05": {
    text: "怎样才算值得粉？",
    options: {
      "spend-05-a": "作品质量好",
      "spend-05-b": "现场很震撼",
      "spend-05-c": "饭圈氛围好",
      "spend-05-d": "快乐不费力"
    }
  },
  "interaction-01": {
    text: "你在饭圈更像哪种人？",
    options: {
      "interaction-a": "主动安利",
      "interaction-01-b": "潜水收藏",
      "interaction-01-c": "评论接梗",
      "interaction-01-d": "线下搭子"
    }
  },
  "interaction-02": {
    text: "你喜欢哪种同担氛围？",
    options: {
      "interaction-02-a": "审美一致",
      "interaction-02-b": "热血团结",
      "interaction-02-c": "轻松好笑",
      "interaction-02-d": "温和稳定"
    }
  },
  "interaction-03": {
    text: "看到争议时你会？",
    options: {
      "interaction-03-a": "先看事实",
      "interaction-03-b": "整理信息",
      "interaction-03-c": "保持轻松",
      "interaction-03-d": "和同担守护"
    }
  },
  "interaction-04": {
    text: "你想做哪种饭圈产出？",
    options: {
      "interaction-04-a": "舞台推荐",
      "interaction-04-b": "角色分析",
      "interaction-04-c": "物料整理",
      "interaction-04-d": "表情包切片"
    }
  },
  "interaction-05": {
    text: "你想先看哪种入坑材料？",
    options: {
      "interaction-05-a": "出圈舞台",
      "interaction-05-b": "代表作品",
      "interaction-05-c": "综艺日常",
      "interaction-05-d": "成长线长文"
    }
  }
};

export const quizQuestions: QuizQuestion[] = authoredQuizQuestions.map((question) => {
  const copy = simpleQuestionCopy[question.id];
  if (!copy) {
    return question;
  }

  return {
    ...question,
    text: copy.text,
    options: question.options.map((item) => ({
      ...item,
      label: copy.options[item.id] ?? item.label
    }))
  };
});

export type QuizModeId = "experience" | "professional";

const experienceQuestionIds = [
  "visual-01",
  "visual-03",
  "stage-01",
  "stage-03",
  "works-01",
  "works-03",
  "personality-01",
  "personality-03",
  "companionship-01",
  "companionship-03",
  "contrast-01",
  "contrast-04",
  "spend-01",
  "interaction-01",
  "interaction-05"
] as const;

export const quizModes: Record<
  QuizModeId,
  {
    id: QuizModeId;
    name: string;
    shortName: string;
    questionCount: number;
    summary: string;
  }
> = {
  experience: {
    id: "experience",
    name: "体验版",
    shortName: "15题",
    questionCount: 15,
    summary: "更快完成，适合先玩一轮。"
  },
  professional: {
    id: "professional",
    name: "专业版",
    shortName: "40题",
    questionCount: 40,
    summary: "画像更细，推荐解释更完整。"
  }
};

const quizQuestionsById = new Map(quizQuestions.map((question) => [question.id, question]));

export const getQuizQuestionsForMode = (mode: QuizModeId): QuizQuestion[] => {
  if (mode === "professional") {
    return quizQuestions;
  }

  return experienceQuestionIds.map((id) => {
    const question = quizQuestionsById.get(id);
    if (!question) {
      throw new Error(`Missing experience mode question: ${id}`);
    }

    return question;
  });
};

export const quizOptionsById = new Map<string, QuizOption>(
  quizQuestions.flatMap((question) => question.options.map((item) => [item.id, item]))
);
