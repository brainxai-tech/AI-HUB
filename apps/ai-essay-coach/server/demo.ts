import type {
  AnalysisResult,
  ComposeRequest,
  EssayFeedback,
  EssayInput,
  EssayOutline,
  EssayResult,
  MaterialAnswers,
  OutlineResult
} from "../src/shared/contracts.js";
import { countEssayLength, fitEssayLength } from "../src/shared/contracts.js";

function cleanPrompt(prompt: string) {
  return prompt.replace(/\s+/g, " ").trim();
}

function shortTheme(prompt: string) {
  const quoted = prompt.match(/[《“「](.+?)[》”」]/u)?.[1];
  if (quoted) return quoted.slice(0, 18);
  const cleaned = cleanPrompt(prompt)
    .replace(/请以/u, "")
    .replace(/为题.*$/u, "")
    .replace(/写一篇.*$/u, "")
    .replace(/作文.*$/u, "");
  return cleaned.slice(0, 18) || "一次真实的成长";
}

export function buildDemoAnalysis(input: EssayInput): AnalysisResult {
  const theme = shortTheme(input.prompt);
  const isArgument = input.genre !== "记叙文";

  return {
    theme,
    task: isArgument
      ? `围绕“${theme}”提出清楚观点，用具体事实把道理讲明白。`
      : `围绕“${theme}”写一件有变化的真实小事，让读者看见你的感受。`,
    requirements: [
      `使用${input.genre}的基本结构，不偏离题目关键词`,
      `语言符合${input.grade}表达水平，不堆砌生僻词`,
      `全文控制在约 ${input.targetLength} 字，中心前后一致`
    ],
    avoid: isArgument
      ? ["只喊口号，没有具体事实", "堆很多名人名言却不分析"]
      : ["从头到尾都是概括，没有动作和细节", "为了感人而编造过度戏剧化情节"],
    angles: isArgument
      ? ["从一次亲身经历切入", "先承认反方顾虑再回应", "用小现象说明大观点"]
      : ["用一个物件串起前后变化", "从最安静的一刻写起", "让一个动作代替直接抒情"],
    questions: isArgument
      ? ["你对这个题目最真实的观点是什么？", "哪件亲身经历或身边小事能证明它？", "别人可能不同意什么？你会怎样回应？"]
      : ["你想到的是哪件亲身经历？", "当时哪个动作、声音或物件最清楚？", "事情结束后，你的想法发生了什么变化？"]
  };
}

function allocateLengths(target: number) {
  const weights = [0.14, 0.2, 0.3, 0.22, 0.14];
  return weights.map((weight) => Math.round(target * weight));
}

export function buildDemoOutlines(input: EssayInput, materials: MaterialAnswers): OutlineResult {
  const theme = shortTheme(input.prompt);
  const detail = materials.detail.trim() || "一个能被看见或听见的细节";
  const insight = materials.insight.trim() || "由犹豫走向理解的变化";
  const personalTitle = /水滴|水池|水声|声音/u.test(detail)
    ? "水声停下之后"
    : /课桌|桌面|桌子/u.test(detail)
      ? "那张旧课桌"
      : "那一刻之后";
  const lengths = allocateLengths(input.targetLength);
  const isArgument = input.genre !== "记叙文";

  const definitions = isArgument
    ? [
        {
          id: "steady",
          style: "稳妥型" as const,
          title: `${theme}，要从行动开始`,
          thesis: insight,
          highlight: "观点—事实—分析—回应，结构最清楚",
          headings: ["现象切入", "提出观点", "亲历证明", "回应质疑", "回扣主题"]
        },
        {
          id: "personal",
          style: "个性型" as const,
          title: `我在${theme}中看见的答案`,
          thesis: `用“${detail.slice(0, 22)}”这个小细节说明：${insight}`,
          highlight: "从个人观察出发，避免空泛套话",
          headings: ["细节开场", "提出疑问", "经历与分析", "另一种声音", "我的答案"]
        },
        {
          id: "advanced",
          style: "提分型" as const,
          title: `${theme}的远处与近处`,
          thesis: insight,
          highlight: "先让步再推进，观点更有层次",
          headings: ["反常识开场", "承认顾虑", "事实转折", "推进观点", "留有余味"]
        }
      ]
    : [
        {
          id: "steady",
          style: "稳妥型" as const,
          title: theme,
          thesis: insight,
          highlight: "按事情发展写清起因、转折和变化",
          headings: ["眼前物件", "事情起因", "关键经过", "态度变化", "物件呼应"]
        },
        {
          id: "personal",
          style: "个性型" as const,
          title: personalTitle,
          thesis: insight,
          highlight: "从一个细节切入，让文章更像你的经历",
          headings: ["细节特写", "时间回退", "矛盾升高", "安静转折", "回到此刻"]
        },
        {
          id: "advanced",
          style: "提分型" as const,
          title: `那道没有说出口的答案`,
          thesis: insight,
          highlight: "双线呼应，用动作替代直接说理",
          headings: ["悬念开场", "表层事件", "内心暗线", "两线交汇", "含蓄收束"]
        }
      ];

  const purposes = ["迅速进入情境", "交代背景与矛盾", "写足关键细节", "呈现认识变化", "照应题目并收束"];

  return {
    outlines: definitions.map((definition) => ({
      ...definition,
      sections: definition.headings.map((heading, index) => ({
        heading,
        purpose: purposes[index],
        targetLength: lengths[index]
      }))
    }))
  };
}

function buildNarrativeEssay(input: EssayInput, materials: MaterialAnswers, outline: EssayOutline) {
  const theme = shortTheme(input.prompt);
  const experience = materials.experience.trim() || "那天下午，我留下来整理教室，本来只想快点完成值日回家";
  const detail = materials.detail.trim() || "窗边一张翘起的旧课桌上，留着一道浅浅的粉笔印";
  const insight = materials.insight.trim() || "真正的成长不是突然变得厉害，而是愿意把眼前的小事认真做好";

  const essay = `放学铃声散去以后，教室忽然安静下来。${detail}。我站在门口看了一会儿，心里却只惦记着快些回家。那时的我还不知道，关于“${theme}”的答案，正藏在这段不起眼的时间里。

${experience}。同学们的脚步声已经远了，走廊尽头偶尔传来篮球落地的闷响。我抓起抹布，随手在桌面上划了几下，灰尘被推到桌角，像一团不肯离开的云。我想，这样大概也算做完了。

转身时，我又看见了${detail}。它没有催促我，也没有人站在旁边检查，可我忽然想起早晨坐在这里的同学：他把练习本摊得很平，写错一个字也会认真擦掉。那一刻，我手里的抹布像重了一点。不是因为这张桌子有多重要，而是因为我第一次认真看见了别人每天使用它的样子。

我重新接了一盆水，把抹布洗净、拧干。水从指缝落下，敲在水池边，发出很轻的声音。我先沿桌缝一点点擦，再用指甲挑出卡住的纸屑。那道旧印比想象中顽固，我擦了几次，它仍淡淡地留在那里。我有些烦，却没有像刚才一样转身离开。

窗外的天色慢慢沉下来，玻璃上浮着一层浅蓝。我换了一个方向继续擦，终于看见木纹重新显出来。桌面没有变得崭新，那道印也没有完全消失，可它干净、平整，像终于能让人安心放下一本书。我把椅子推回原处，忽然觉得教室也亮了一点。

后来值日生检查时，只说了一句“今天挺干净”。我没有解释自己多花了多少时间，也没有等一句特别的表扬。走出教学楼，我才发现刚才那点不情愿已经不见了。风吹过操场，树叶沙沙作响，我第一次觉得，把一件没人盯着的小事做好，也会让脚步变得踏实。

过去我总把成长想成一次惊人的成绩、一场响亮的胜利，仿佛只有站在掌声里才算改变。可那张课桌告诉我，改变也可以很安静：是在想要敷衍时停一下，是在没人看见时仍愿意认真，是让自己的动作配得上心里的答案。

第二天早晨，我经过那张桌子，看见阳光落在清楚的木纹上。${insight}。我没有停下，只轻轻把微微歪着的椅子推正。那一刻我知道，${outline.thesis}。`;

  const expansions = [
    `我也想起许多曾经被自己忽略的瞬间：借来的书有没有放回原处，答应别人的事情有没有认真完成，看到地上的纸团时是否总等着别人弯腰。它们都很小，却在一次次选择里，悄悄写下一个人真正的样子。`,
    `认真并不会立刻带来掌声，它甚至常常显得缓慢。但当我愿意再多看一眼、多做一步，原本普通的事情就有了重量。我开始明白，我们改变周围的方式，也在反过来塑造自己。`,
    `那天之后，我仍会有想偷懒的时候。不同的是，我能更早听见心里那个提醒：别急着交差，先看看这件事本来应该是什么样子。这个提醒很轻，却足以让我停下来。`,
    `如果一定要为成长寻找一个清楚的刻度，我想它不是奖状的数量，而是无人提醒时的选择。每一次把小事做好，都像在心里添上一笔，最后才慢慢写成今天的自己。`
  ];

  return fitEssayLength(essay, input.targetLength, input.includePunctuation, expansions);
}

function buildArgumentEssay(input: EssayInput, materials: MaterialAnswers, outline: EssayOutline) {
  const theme = shortTheme(input.prompt);
  const experience = materials.experience.trim() || "一次小组任务中，我因为怕做不好而迟迟没有开始，直到同伴先完成了最小的一步";
  const detail = materials.detail.trim() || "草稿纸上那个并不漂亮、却真实存在的第一行字";
  const insight = materials.insight.trim() || "真正可靠的改变，往往不是等待完美时机，而是先完成一个具体行动";

  const essay = `我们常把“${theme}”想成一个宏大的词，似乎只有做出惊人的成绩，才配谈论它。但生活给出的答案往往更朴素：${insight}。与其等待一个万事俱备的时刻，不如先从眼前能够完成的一步开始。

${experience}。那时我想得很多：担心方向错，担心结果不够好，也担心自己的努力被比较。可越是反复设想，事情越停在原地。直到我看见${detail}，才突然意识到，行动也许不完美，却能带来下一步需要的证据；空想看似安全，实际上只会让问题保持原样。

从这件小事看，行动的第一个价值，是把模糊的焦虑变成具体的问题。没有开始时，我们害怕的是一个巨大的失败；真正动手后，困难会被拆成资料不足、时间不够、方法不熟等可以处理的小块。人不是因为完全准备好才行动，而是在行动中逐渐知道自己还要准备什么。

行动的第二个价值，是让信心有真实的来源。口号能短暂鼓舞人，却不能替代一次完成。${detail}也许并不起眼，但它证明事情已经从“我想做”变成“我正在做”。这种微小的确定感，会推动人继续修正、继续前进。所谓勇气，并非没有怀疑，而是怀疑仍在时，手上还有具体动作。

当然，强调行动并不等于盲目冲动。有人担心“先做再说”会造成错误，这种顾虑有道理。重要的区别在于：有效行动应当足够小、可以检查，也允许回头。先写一段再修改，先询问一个人再判断，先用一天验证一种方法，都比一次性押上全部更稳妥。

许多时候，我们不是缺少道理，而是把第一步想得太大。我们希望第一次表达就成熟，希望第一次尝试就被认可，于是用“再等等”保护自己。可是时间不会自动把想法变成能力。只有真实的尝试，才能暴露不足，也才能让别人的建议有落点。

回到“${theme}”，我更愿意把它理解为一种朴素的实践：知道自己为什么出发，也愿意在不确定中完成眼前的一小步。${outline.thesis}。这样的行动未必响亮，却能在一次次反馈里积累方向，让今天的自己比昨天更接近答案。

所以，当我们再次站在起点，不妨少问一句“我能不能一次做好”，多问一句“我现在能完成哪一步”。${insight}。当第一行字真正落在纸上，远处的目标才不再只是想象，而成为一条可以一步步走下去的路。`;

  const expansions = [
    `从个人成长到集体合作，道理都是相通的。一个团队如果只有漂亮目标却没有责任到人的下一步，热情很快就会消散；一项学习计划如果只有总分目标却没有今天的练习，也很难真正推进。`,
    `行动还让我们学会对结果负责。它要求人记录发生了什么，承认哪些判断不准确，再根据事实调整。正是在这种“尝试—反馈—修正”的循环里，能力才不再是一句自我评价。`,
    `世界上很少有毫无风险的选择，但我们可以让每次尝试更小、更清楚、更可回顾。这样一来，犯错不是终点，而是帮助下一次选择更准确的材料。`,
    `宏大的变化也许令人向往，真正支撑它的却常是日复一日的普通动作。今天写下的第一句、问出的第一个问题、完成的第一次练习，都会让明天拥有不同的起点。`
  ];

  return fitEssayLength(essay, input.targetLength, input.includePunctuation, expansions);
}

function buildFeedback(materials: MaterialAnswers, essay: string): EssayFeedback {
  const evidence = (materials.detail || essay).replace(/\s+/g, "").slice(0, 28);
  return {
    totalScore: 86,
    dimensions: [
      { name: "审题", score: 18, max: 20, comment: "全文持续回应题目关键词，没有中途换题。", evidence: "结尾再次回扣中心，形成完整回应。" },
      { name: "立意", score: 17, max: 20, comment: "从普通经历中提炼出可理解的认识。", evidence: "改变不是口号，而是一次具体选择。" },
      { name: "结构", score: 18, max: 20, comment: "开头设问，中段展开，结尾呼应，推进清楚。", evidence: "转折前后形成了态度变化。" },
      { name: "内容", score: 17, max: 20, comment: "使用了个人素材，关键段落有画面。", evidence: evidence || "动作、声音和物件让经历更具体。" },
      { name: "语言", score: 16, max: 20, comment: "整体自然，少量句子仍可再短一些。", evidence: "长句可以拆分，让重点更有力量。" }
    ],
    strengths: ["题目关键词在开头和结尾都有回应", "关键转折由动作推动，不只依靠直接抒情"],
    priority: "下一轮只改一件事：删掉两处解释性句子，换成当时能看见或听见的细节。",
    nextExercise: "用 80 字重写文中最关键的一刻，只写动作、声音和物件，不直接写心情。"
  };
}

export function buildDemoEssay(request: ComposeRequest): EssayResult {
  const essay = request.input.genre === "记叙文"
    ? buildNarrativeEssay(request.input, request.materials, request.outline)
    : buildArgumentEssay(request.input, request.materials, request.outline);
  const detail = request.materials.detail.trim();

  return {
    title: request.outline.title,
    essay,
    characterCount: countEssayLength(essay, request.input.includePunctuation),
    annotations: [
      {
        quote: detail ? detail.slice(0, 34) : essay.replace(/\s+/g, "").slice(0, 34),
        note: "这是全文最像你的地方，可以再补一个动作。",
        tone: "good"
      },
      {
        quote: "我开始明白",
        note: "如果前文已经用行动表现变化，这类解释可以更克制。",
        tone: "revise"
      }
    ],
    feedback: buildFeedback(request.materials, essay),
    safetyNote: "这是一份练习初稿。请核对事实，并用自己的语言继续修改后再使用。"
  };
}
