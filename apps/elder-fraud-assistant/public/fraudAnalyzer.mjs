const RISK_RULES = [
  {
    id: "urgent_money",
    label: "催你马上转钱",
    weight: 5,
    patterns: [
      /马上(转账|付款|打款|缴费|支付)/,
      /立即(转账|付款|打款|缴费|支付)/,
      /限时.{0,8}(付款|缴费|转账|支付)/,
      /保证金|解冻金|认证金|手续费|刷流水|补缴|垫付|安全账户/
    ],
    plain: "对方在催你交钱、转账或先垫钱，诈骗里很常见。",
    advice: "先不要转账，也不要继续按对方说的操作。"
  },
  {
    id: "secrecy",
    label: "不让告诉家人",
    weight: 5,
    patterns: [
      /不要.{0,8}(告诉|联系|问).{0,8}(家人|子女|儿子|女儿|老伴|朋友)/,
      /别.{0,8}(告诉|联系|问).{0,8}(家人|子女|儿子|女儿|老伴|朋友)/,
      /保密|不能外传|单独联系|私下处理|不要报警|别报警/
    ],
    plain: "真正靠谱的事不会怕你问家人；不让你问，通常就是想把你单独骗住。",
    advice: "立刻把消息发给家人确认。"
  },
  {
    id: "authority",
    label: "冒充官方或公检法",
    weight: 5,
    patterns: [
      /公安|警官|派出所|检察院|法院|通缉|涉案|洗钱|逮捕|传唤/,
      /冻结.{0,8}(银行卡|账户|资金)/,
      /配合调查|资金清查|安全审查/
    ],
    plain: "公检法不会在短信、电话或聊天里让你转钱到所谓安全账户。",
    advice: "挂断或停止聊天，自己拨打 110 或官方电话核实。"
  },
  {
    id: "investment",
    label: "投资高收益承诺",
    weight: 4,
    patterns: [
      /稳赚|保本|高收益|内幕|带单|老师.{0,6}指导|跟着买|涨停|翻倍/,
      /投资群|理财群|荐股|数字货币|虚拟币|量化|返利|日收益|月收益/
    ],
    plain: "凡是陌生人承诺稳赚、高收益、老师带单，都要当成高危。",
    advice: "不要入金，不要下载对方给的投资软件。"
  },
  {
    id: "remote_control",
    label: "要求下载软件或共享屏幕",
    weight: 5,
    patterns: [
      /下载.{0,12}(App|APP|软件|客户端|会议|远程)/,
      /屏幕共享|共享屏幕|远程协助|远程控制|腾讯会议|会议号|向日葵|AnyDesk|TeamViewer|ToDesk/
    ],
    plain: "让你共享屏幕或装远程软件，很可能是为了偷看验证码、银行卡和密码。",
    advice: "不要共享屏幕，不要安装对方发的软件。"
  },
  {
    id: "private_info",
    label: "索要验证码或个人信息",
    weight: 4,
    patterns: [
      /验证码|短信码|动态码|银行卡号|身份证号|支付密码|登录密码|取款密码/,
      /把.{0,8}(验证码|短信码|密码).{0,8}(发|告诉|报给)/,
      /点击.{0,10}(链接|网址)|打开.{0,10}(链接|网址)/
    ],
    plain: "验证码、密码、银行卡和身份证信息不能给陌生人。",
    advice: "不要点链接，不要把验证码发给任何人。"
  },
  {
    id: "refund_service",
    label: "冒充客服退款理赔",
    weight: 3,
    patterns: [
      /客服|售后|快递|物流|理赔|退款|退费|取消会员|关闭扣费|百万保障/,
      /订单异常|账户异常|赔付|补偿/
    ],
    plain: "退款、理赔、取消会员常被骗子拿来开头，后面往往会诱导转账或下载软件。",
    advice: "自己打开官方 App 或拨打官方客服电话核实。"
  },
  {
    id: "prize_subsidy",
    label: "中奖补贴诱导",
    weight: 3,
    patterns: [
      /中奖|抽中|补贴|退税|福利金|养老补助|红包|免费领取/,
      /先交.{0,8}(税|费|保证金)|激活费|领取资格/
    ],
    plain: "天上掉下来的中奖、补贴、福利，很多是先骗你交钱或填资料。",
    advice: "不要为了领奖先交钱。"
  },
  {
    id: "contact_shift",
    label: "引导去私聊或加新号",
    weight: 2,
    patterns: [
      /加我.{0,8}(微信|QQ|好友)|私聊|进群|扫码进群|扫二维码|备用号/,
      /不要在这里说|换个号联系/
    ],
    plain: "把你拉到私聊或新群里，常常是为了躲开平台提醒和家人发现。",
    advice: "不要随便扫码进群或加陌生账号。"
  },
  {
    id: "pressure",
    label: "制造紧张和害怕",
    weight: 2,
    patterns: [
      /最后通知|逾期|拉黑|征信|坐牢|起诉|封号|停机|马上失效|后果自负/,
      /不处理.{0,8}(后果|责任|影响)/
    ],
    plain: "骗子常用吓人的话让你来不及思考。",
    advice: "先停下来，等家人一起看。"
  }
];

const SAFE_ACTIONS = [
  "先不要转账、付款或充值。",
  "不要点链接，不要扫陌生二维码。",
  "不要共享屏幕，不要下载对方发的软件。",
  "把原消息发给子女或可信家人确认。",
  "需要核实时，只用官方 App、官方客服电话或 110。"
];

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function findEvidence(text, patterns) {
  const evidence = [];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) {
      evidence.push(match[0].slice(0, 28));
    }
  }

  return unique(evidence);
}

function buildSummary(level, matchedRules) {
  if (matchedRules.length === 0) {
    return "目前没看到特别明显的诈骗话术，但遇到转账、验证码、下载软件时还是要先问家人。";
  }

  const labels = matchedRules.slice(0, 3).map((rule) => rule.label).join("、");

  if (level.key === "stop") {
    return `这个很危险，主要问题是：${labels}。先别转账，也别继续操作。`;
  }

  if (level.key === "suspicious") {
    return `这个很可疑，里面出现了${labels}。建议先让家人帮你看。`;
  }

  return `这个暂时不像特别明显的诈骗，但出现了${labels}，最好还是确认一下。`;
}

function chooseLevel(score, matchedRules) {
  const ids = new Set(matchedRules.map((rule) => rule.id));
  const hasHardStop =
    ids.has("authority") ||
    ids.has("remote_control") ||
    (ids.has("urgent_money") && ids.has("secrecy")) ||
    (ids.has("urgent_money") && ids.has("private_info")) ||
    (ids.has("investment") && ids.has("remote_control"));

  if (hasHardStop || score >= 8) {
    return {
      key: "stop",
      label: "先别动",
      severity: "high",
      score: Math.min(100, 70 + score * 3)
    };
  }

  if (score >= 4) {
    return {
      key: "suspicious",
      label: "很可疑",
      severity: "medium",
      score: Math.min(88, 42 + score * 5)
    };
  }

  return {
    key: "check",
    label: "基本正常但要确认",
    severity: "low",
    score: Math.max(18, score * 8)
  };
}

function buildChildMessage(text, level, matchedRules) {
  const labels = matchedRules.slice(0, 3).map((rule) => rule.label);
  const concern = labels.length > 0 ? `它里面有“${labels.join("、")}”这些地方` : "我有点拿不准";
  const excerpt = text.length > 220 ? `${text.slice(0, 220)}...` : text;

  return [
    "我收到下面这段消息，想让你帮我确认一下是不是诈骗。",
    `${concern}。我现在先不转账、不点链接、不下载软件，也不把验证码告诉别人。`,
    "",
    `AI 提醒：${level.label}`,
    "",
    `原文：${excerpt || "我还没粘贴原文，先发你看看这个情况。"}`
  ].join("\n");
}

function buildReplyForChild(level, matchedRules) {
  if (level.key === "stop") {
    return "先别操作。不要转账、不要点链接、不要共享屏幕。把电话挂掉或先退出聊天，我来帮你核实官方渠道。";
  }

  if (level.key === "suspicious") {
    return "这个不放心，先别按他说的做。你把完整截图发我，我帮你一起看；要核实也只用官方电话或官方 App。";
  }

  return "先别着急操作。你把完整内容和对方号码发我，我帮你确认一下；只要涉及钱、验证码、下载软件，都先停。";
}

export function analyzeMessage(input) {
  const text = normalizeText(input);
  const matchedRules = RISK_RULES.map((rule) => ({
    ...rule,
    evidence: findEvidence(text, rule.patterns)
  })).filter((rule) => rule.evidence.length > 0);

  const score = matchedRules.reduce((total, rule) => total + rule.weight, 0);
  const level = chooseLevel(score, matchedRules);
  const summary = buildSummary(level, matchedRules);
  const actions = level.key === "check" ? SAFE_ACTIONS.slice(3) : SAFE_ACTIONS;

  return {
    level,
    summary,
    matchedRules: matchedRules.map(({ id, label, weight, plain, advice, evidence }) => ({
      id,
      label,
      weight,
      plain,
      advice,
      evidence
    })),
    actions,
    childMessage: buildChildMessage(text, level, matchedRules),
    childReply: buildReplyForChild(level, matchedRules)
  };
}

export const sampleMessages = [
  {
    id: "investment",
    label: "投资群",
    text: "王姐，今天老师带单，内部名额有限，保证稳赚。先下载这个量化 APP 入金 30000，晚上统一拉升，收益翻倍。不要在群里问，私聊我处理。"
  },
  {
    id: "authority",
    label: "冒充警官",
    text: "这里是市公安局，你的银行卡涉嫌洗钱，需要配合资金清查。马上把钱转入安全账户，不要告诉家人，否则会影响调查。"
  },
  {
    id: "refund",
    label: "客服退款",
    text: "您好，我是平台客服，您的快递丢失可以理赔 300 元。请点击链接填写银行卡号和验证码，逾期将无法赔付。"
  }
];
