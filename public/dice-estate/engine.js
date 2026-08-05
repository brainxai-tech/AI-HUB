(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DiceEstateEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const GAME_VERSION = 20;
  const STARTING_CASH = 1500;
  const PASS_START_REWARD = 1000;
  const MAX_ROUNDS = 36;
  const STANDARD_RULESET = "standard";
  const SHORT_RULESET = "short";
  const ROUND_LIMIT_END_CONDITION = "round-limit";
  const HUMAN_SURVIVAL_END_CONDITION = "human-vs-agents-bankruptcy";
  const SHORT_INITIAL_DEEDS = 3;
  const STANDARD_LANDMARK_LEVEL = 5;
  const SHORT_LANDMARK_LEVEL = 4;
  const CONTROL_ZONE_INDEX = 11;
  const CONTROL_RELEASE_FEE = 50;
  const MAX_CONTROL_ATTEMPTS = 3;
  const BANK_HOUSE_LIMIT = 32;
  const BANK_LANDMARK_LIMIT = 12;
  const RENT_MULTIPLIERS = [1, 1.8, 2.8, 5.2, 6.4, 10.5];
  const RENT_SPIKE_LEVELS = [3, 5];
  const BUILD_COST_STEPS = [1, 1.15, 1.35, 1.6, 2.05];
  const PURCHASABLE_TYPES = ["property", "station", "utility"];
  const STATION_RENTS = [25, 50, 100, 200];
  const UTILITY_RENT_MULTIPLIERS = [4, 10];
  const INCOME_TAX_FIXED_AMOUNT = 200;
  const INCOME_TAX_RATE = 0.1;
  const AUCTION_START_BID = 10;
  const AUCTION_MIN_INCREMENT = 1;

  const RENT_CURVES = {
    entry: [1, 1.65, 2.45, 4.1, 5.4, 8.4],
    cashflow: [1, 1.55, 2.25, 3.7, 5, 7.8],
    builder: [1, 1.9, 3.05, 5.7, 7.2, 11.4],
    steady: [1, 1.75, 2.7, 4.8, 6.2, 9.6],
    spike: [1, 1.7, 2.55, 6.15, 7.7, 12.7],
    growth: [1, 1.7, 2.75, 5.1, 7.5, 13.2],
    landmark: [1, 1.6, 2.4, 4.65, 6.4, 15]
  };

  const GROUPS = {
    old: group("老城区", "#78a55a", 70, 1, "⌂", "低价成套", "入门型", "entry", 0.86),
    market: group("市场街", "#d6a43e", 85, 2, "▣", "空地现金流", "现金流型", "cashflow", 1),
    academy: group("学院区", "#4e8fb8", 105, 3, "△", "低成本升级", "建造型", "builder", 0.8),
    harbor: group("港湾区", "#3f9d90", 120, 4, "⚓", "攻守均衡", "均衡型", "steady", 1),
    garden: group("花园新城", "#6f9d63", 135, 4, "✦", "平滑保值", "稳健型", "steady", 0.92),
    arts: group("文创街区", "#b879a8", 145, 5, "◆", "三房跳涨", "爆发型", "spike", 1),
    tech: group("科技园", "#6f8ec9", 165, 6, "◈", "后期成长", "成长型", "growth", 1.06),
    finance: group("金融中心", "#c7684c", 210, 7, "▰", "地标高租", "地标型", "landmark", 1.15),
    riverside: group("滨水带", "#4aa6a8", 105, 3, "≋", "轻资产回款", "现金流型", "cashflow", 0.95),
    medical: group("健康城", "#4e9b83", 125, 4, "✚", "稳定收租", "稳健型", "steady", 0.9),
    sports: group("活力区", "#d9784d", 150, 5, "★", "中盘爆发", "爆发型", "spike", 1),
    maker: group("智造区", "#4f79ad", 155, 5, "⚙", "低成本建造", "建造型", "builder", 0.82),
    eco: group("生态城", "#74a84f", 175, 6, "♧", "四房成长", "成长型", "growth", 0.92),
    luxury: group("天际区", "#8f5f9d", 240, 8, "♛", "终局地标", "地标型", "landmark", 1.2)
  };

  const PROPERTY_FEATURES = {
    1: "低价入场", 3: "稳定回本", 4: "成套核心",
    7: "人流现金流", 8: "中段收租", 10: "商圈旗舰",
    13: "低成本升级", 15: "成长中枢", 40: "成套补位",
    17: "均衡入场", 18: "港口客流", 20: "仓储旗舰",
    21: "平滑成长", 22: "稳健补位", 24: "湖畔旗舰",
    26: "三房跳涨", 29: "展会爆发", 42: "街区旗舰",
    31: "后期成长", 32: "四房蓄力", 33: "地标核心",
    37: "高价门槛", 38: "高租预热", 39: "金融地标",
    44: "低价引流", 45: "稳定收租", 47: "滨水旗舰",
    48: "低风险入场", 49: "平滑成长", 51: "健康地标",
    53: "爆发起点", 54: "三房跳涨", 56: "冠军地标",
    57: "低成本建造", 58: "中盘成长", 60: "智造旗舰",
    62: "中价入场", 63: "四房成长", 65: "零碳地标",
    67: "高价门槛", 68: "地标预热", 69: "终局核心"
  };

  const BOARD_TEMPLATE = [
    special(0, "start", "起点广场", 1, 8),
    prop(1, "榕树巷", "old", 110, 11, 2, 8),
    special(2, "event", "机会牌", 3, 8, { deck: "chance" }),
    prop(3, "石桥路", "old", 125, 13, 4, 8),
    prop(4, "钟楼巷", "old", 135, 14, 5, 8),
    special(5, "tax", "城市服务费", 6, 8, { amount: 110 }),
    station(6, "集市总站", 200, 7, 8),
    prop(7, "集市西街", "market", 160, 17, 8, 8),
    prop(8, "集市南街", "market", 170, 18, 9, 8),
    special(9, "event", "街口事件", 10, 7),
    prop(10, "集市北街", "market", 180, 20, 10, 6),
    special(11, "rest", "交通管制区", 9, 6),
    utility(12, "城市电网", 150, 8, 6),
    prop(13, "学院南路", "academy", 205, 23, 7, 6),
    special(14, "event", "校区机会", 6, 5, { deck: "chance" }),
    prop(15, "学院广场", "academy", 220, 26, 5, 5),
    station(16, "港湾客运站", 200, 4, 6),
    prop(17, "港湾二路", "harbor", 245, 29, 3, 6),
    prop(18, "港湾码头", "harbor", 260, 32, 2, 6),
    special(19, "tax", "桥梁维护费", 1, 5, { amount: 130 }),
    prop(20, "仓储街", "harbor", 250, 31, 2, 4),
    prop(21, "花园东路", "garden", 260, 32, 3, 4),
    prop(22, "花园西路", "garden", 275, 34, 4, 4),
    special(23, "event", "中央事件", 5, 4),
    prop(24, "湖畔街", "garden", 290, 36, 6, 4),
    station(25, "绿轴换乘站", 200, 7, 4),
    prop(26, "剧场街", "arts", 315, 41, 8, 4),
    special(27, "rest", "换乘枢纽", 9, 4),
    utility(28, "供水中心", 150, 10, 3),
    prop(29, "展览大道", "arts", 345, 47, 9, 2),
    special(30, "event", "高架事件", 8, 2, { deck: "chance" }),
    prop(31, "科技东路", "tech", 360, 50, 7, 2),
    prop(32, "科技西路", "tech", 375, 53, 6, 2),
    prop(33, "芯片街", "tech", 390, 56, 5, 2),
    special(34, "tax", "所得税", 4, 2, { incomeTax: true, fixedAmount: INCOME_TAX_FIXED_AMOUNT, percent: INCOME_TAX_RATE }),
    station(35, "云端快线站", 200, 3, 2),
    special(36, "event", "金融风暴", 2, 2),
    prop(37, "金融大道", "finance", 430, 66, 1, 3),
    prop(38, "证券街", "finance", 455, 72, 1, 5),
    prop(39, "中央塔街", "finance", 490, 82, 1, 7),
    prop(40, "学院东路", "academy", 230, 28, 0, 0),
    special(41, "event", "夜市灯会", 0, 0),
    prop(42, "画廊街", "arts", 360, 50, 0, 0),
    station(43, "环城北站", 200, 0, 0),
    prop(44, "河岸步道", "riverside", 215, 30, 0, 0),
    prop(45, "渡口街", "riverside", 230, 32, 0, 0),
    special(46, "event", "城市更新", 0, 0),
    prop(47, "观景堤", "riverside", 250, 35, 0, 0),
    prop(48, "杏林路", "medical", 275, 37, 0, 0),
    prop(49, "康养街", "medical", 290, 40, 0, 0),
    special(50, "event", "健康博览", 0, 0, { deck: "chance" }),
    prop(51, "生命广场", "medical", 310, 43, 0, 0),
    utility(52, "城市数据中心", 150, 0, 0),
    prop(53, "竞速路", "sports", 330, 45, 0, 0),
    prop(54, "冠军街", "sports", 350, 49, 0, 0),
    special(55, "event", "总决赛之夜", 0, 0),
    prop(56, "体育新城", "sports", 375, 53, 0, 0),
    prop(57, "工坊巷", "maker", 345, 47, 0, 0),
    prop(58, "创客大道", "maker", 365, 51, 0, 0),
    special(59, "event", "创业路演", 0, 0, { deck: "chance" }),
    prop(60, "智造港", "maker", 390, 56, 0, 0),
    station(61, "机场快线站", 200, 0, 0),
    prop(62, "林荫街", "eco", 395, 58, 0, 0),
    prop(63, "湿地路", "eco", 420, 62, 0, 0),
    special(64, "event", "暴雨预警", 0, 0, { deck: "chance" }),
    prop(65, "零碳社区", "eco", 445, 67, 0, 0),
    special(66, "rest", "产权交易所", 0, 0, { tradeHub: true }),
    prop(67, "星河湾", "luxury", 500, 84, 0, 0),
    prop(68, "云顶大道", "luxury", 535, 92, 0, 0),
    prop(69, "天际宫", "luxury", 575, 104, 0, 0)
  ].map((tile) => ({ ...tile, ...boardCoordinate(tile.id) }));

  const EVENT_CARDS = [
    cash("subsidy-120", "城市补贴", "城市基金到账，获得 120 金币。", 120, "opportunity"),
    cash("subsidy-90", "街区奖励", "本地商户赞助，获得 90 金币。", 90, "opportunity"),
    cash("bonus-160", "季度分红", "一笔投资到账，获得 160 金币。", 160, "opportunity"),
    cash("refund-80", "税费返还", "财务系统返还 80 金币。", 80, "opportunity"),
    { id: "build-discount-1", title: "免费装修券", type: "opportunity", description: "本回合下一次建房费用减半。", kind: "buildDiscount", value: 0.5 },
    { id: "rent-shield-1", title: "租金调解", type: "opportunity", description: "下次向对手支付租金时减免 50%。", kind: "rentShield", value: 0.5 },
    { id: "control-pass-1", title: "通行备案", type: "opportunity", description: "保留此卡；下次被交通管制时可免费离开。", kind: "controlPass" },
    { id: "market-boost-1", title: "商圈升温", type: "market", description: "你的一组街区下次收租 +50%。", kind: "groupRentBoost", value: 1.5 },
    { id: "market-boost-2", title: "假日客流", type: "market", description: "你的一组街区下次收租 +50%。", kind: "groupRentBoost", value: 1.5 },
    { id: "nearest-empty-1", title: "看房专车", type: "move", description: "前进到最近的无人地块。", kind: "nearestEmpty" },
    { id: "nearest-empty-2", title: "城市导览", type: "move", description: "前进到最近的无人地块。", kind: "nearestEmpty" },
    fee("repair-100", "路面维修", "支付 100 金币维修费。", 100, false),
    fee("fee-90", "临时税费", "支付 90 金币临时费用。", 90, false),
    fee("fine-120", "违规停车", "支付 120 金币罚金。", 120, false),
    fee("audit-150", "财务审计", "支付 150 金币审计费用。", 150, true),
    { id: "maintenance-1", title: "房屋维护", type: "trouble", description: "每栋房屋或地标支付 20 金币维护费。", kind: "maintenance", value: 20 },
    { id: "maintenance-2", title: "物业巡检", type: "trouble", description: "每栋房屋或地标支付 25 金币维护费。", kind: "maintenance", value: 25 },
    { id: "move-back-3", title: "临时限行", type: "move", description: "后退 3 格。", kind: "move", value: -3 },
    { id: "move-back-2", title: "施工绕行", type: "move", description: "后退 2 格。", kind: "move", value: -2 },
    { id: "move-forward-4", title: "快速公交", type: "move", description: "前进 4 格。", kind: "move", value: 4 },
    { id: "move-forward-6", title: "直达班车", type: "move", description: "前进 6 格。", kind: "move", value: 6 },
    { id: "move-start", title: "城市庆典", type: "move", description: "前进到起点广场并领取工资。", kind: "moveTo", value: 0 },
    { id: "move-control", title: "道路抽检", type: "move", description: "被送往交通管制区。", kind: "moveTo", value: CONTROL_ZONE_INDEX },
    fee("market-cool-80", "商圈降温", "支付 80 金币广告费稳定客流。", 80, false),
    fee("insurance-70", "保险续费", "支付 70 金币保险费。", 70, false),
    cash("lucky-60", "小额中奖", "获得 60 金币。", 60, "opportunity"),
    cash("partner-110", "合作收益", "获得 110 金币。", 110, "opportunity"),
    {
      id: "choice-invest",
      title: "投资机会",
      type: "choice",
      description: "选择稳健补贴，或支付 80 金币搏一次高回报。",
      kind: "choice",
      choices: [
        { label: "稳健补贴 +70", kind: "cash", value: 70 },
        { label: "投资 80，回收 190", kind: "cashAfterFee", fee: 80, value: 190 }
      ]
    },
    {
      id: "choice-inspection",
      title: "物业检查",
      type: "choice",
      description: "支付费用，或抵押一块低收益地块。",
      kind: "choice",
      choices: [
        { label: "支付 120", kind: "fee", value: 120 },
        { label: "抵押低收益地块", kind: "mortgageCheapest" }
      ]
    },
    {
      id: "choice-build",
      title: "装修档期",
      type: "choice",
      description: "选择拿现金，或让下一次建房半价。",
      kind: "choice",
      choices: [
        { label: "现金 +90", kind: "cash", value: 90 },
        { label: "建房半价", kind: "buildDiscount", value: 0.5 }
      ]
    },
    {
      id: "choice-rent",
      title: "租约谈判",
      type: "choice",
      description: "保护自己，或提高下一次收租。",
      kind: "choice",
      choices: [
        { label: "下次付租减半", kind: "rentShield", value: 0.5 },
        { label: "街区下次收租 +50%", kind: "groupRentBoost", value: 1.5 }
      ]
    }
  ];

  EVENT_CARDS.push(
    cash("festival-130", "城市巡游", "街区活动带来人流，获得 130 金币。", 130, "opportunity"),
    cash("planning-bonus-180", "规划红利", "城市更新计划公布，获得 180 金币。", 180, "opportunity"),
    cash("startup-market-100", "创业市集", "临时摊位收益到账，获得 100 金币。", 100, "opportunity"),
    fee("public-repair-140", "公共维修", "道路和照明共同维修，支付 140 金币。", 140, true),
    fee("security-upgrade-95", "安保升级", "街区安保临时加固，支付 95 金币。", 95, false),
    { id: "hot-district-boost", title: "热门街区", type: "market", description: "你的一组街区下次收租 +75%。", kind: "groupRentBoost", value: 1.75 },
    { id: "road-closure-4", title: "临时封路", type: "move", description: "后退 4 格。", kind: "move", value: -4 },
    { id: "express-pass-5", title: "快线通行", type: "move", description: "前进 5 格。", kind: "move", value: 5 },
    { id: "empty-lot-pitch", title: "空地推介", type: "move", description: "前进到最近的无人地块。", kind: "nearestEmpty" },
    { id: "asset-insurance", title: "资产保险", type: "opportunity", description: "下次向对手支付租金时减免 50%。", kind: "rentShield", value: 0.5 },
    { id: "construction-delay", title: "建筑工期", type: "trouble", description: "每栋房屋或地标支付 30 金币追加工期费。", kind: "maintenance", value: 30 },
    { id: "chance-window", title: "机会窗口", type: "chance", description: "立刻抽取一张机遇卡。", kind: "drawChance" },
    { id: "street-rumor", title: "街头传闻", type: "chance", description: "听到一条投资消息，立刻抽取一张机遇卡。", kind: "drawChance" },
    {
      id: "choice-risk-survey",
      title: "风险调查",
      type: "choice",
      description: "选择直接拿补贴，或押注一张机遇卡。",
      kind: "choice",
      choices: [
        { label: "保守补贴 +100", kind: "cash", value: 100 },
        { label: "抽取机遇卡", kind: "drawChance" }
      ]
    },
    cash("night-market-dividend", "夜市分红", "夜间客流带来摊位分红，获得 140 金币。", 140, "opportunity"),
    fee("renewal-assessment", "更新评估", "城市更新评估与临时搬迁，支付 85 金币。", 85, false),
    cash("championship-traffic", "冠军客流", "总决赛带动街区消费，获得 110 金币。", 110, "opportunity")
  );

  const CHANCE_CARDS = [
    { id: "chance-land-coupon", title: "土地折扣券", type: "opportunity", description: "下一次建房费用降低 60%。", kind: "buildDiscount", value: 0.4 },
    { id: "chance-rent-talk", title: "免租谈判", type: "opportunity", description: "下次向对手支付租金时只付 25%。", kind: "rentShield", value: 0.25 },
    { id: "chance-control-pass", title: "管制通行证", type: "opportunity", description: "保留此卡；下次被交通管制时可免费离开。", kind: "controlPass" },
    { id: "chance-commercial-hit", title: "商业爆点", type: "market", description: "你的一组街区下次收租翻倍。", kind: "groupRentBoost", value: 2 },
    cash("chance-city-fund-200", "城市基金", "专项基金到账，获得 200 金币。", 200, "opportunity"),
    cash("chance-tax-relief-150", "税务减免", "本季税务减免，获得 150 金币。", 150, "opportunity"),
    cash("chance-opponent-mistake-120", "对手误判", "你抓住价格差，获得 120 金币。", 120, "opportunity"),
    cash("chance-property-agent-90", "物业代管", "代管收益到账，获得 90 金币。", 90, "opportunity"),
    fee("chance-legal-fee-110", "合规顾问", "聘请顾问处理文件，支付 110 金币。", 110, false),
    fee("chance-emergency-160", "突发维修", "核心资产紧急维修，支付 160 金币。", 160, true),
    { id: "chance-fast-commute", title: "快速通勤", type: "move", description: "前进 3 格。", kind: "move", value: 3 },
    { id: "chance-shortcut-7", title: "城市捷径", type: "move", description: "前进 7 格。", kind: "move", value: 7 },
    { id: "chance-detour-2", title: "临时改道", type: "move", description: "后退 2 格。", kind: "move", value: -2 },
    { id: "chance-empty-priority", title: "空地优先看房", type: "move", description: "前进到最近的无人地块。", kind: "nearestEmpty" },
    { id: "chance-brand-week", title: "品牌周", type: "market", description: "你的一组街区下次收租 +80%。", kind: "groupRentBoost", value: 1.8 },
    { id: "chance-build-team", title: "施工队加班", type: "opportunity", description: "下一次建房费用降低 70%。", kind: "buildDiscount", value: 0.3 },
    { id: "chance-rent-buffer", title: "租金缓冲", type: "opportunity", description: "下次向对手支付租金时减免 60%。", kind: "rentShield", value: 0.4 },
    {
      id: "chance-bold-bid",
      title: "大胆报价",
      type: "choice",
      description: "选择立刻拿现金，或换取一次更强的收租爆发。",
      kind: "choice",
      choices: [
        { label: "现金 +120", kind: "cash", value: 120 },
        { label: "下次收租翻倍", kind: "groupRentBoost", value: 2 }
      ]
    },
    {
      id: "chance-build-or-cash",
      title: "材料批发",
      type: "choice",
      description: "选择材料折扣，或转卖材料获得现金。",
      kind: "choice",
      choices: [
        { label: "建房 3 折", kind: "buildDiscount", value: 0.3 },
        { label: "现金 +110", kind: "cash", value: 110 }
      ]
    },
    { id: "chance-maker-grant", title: "智造补贴", type: "opportunity", description: "下一次建房费用降低 65%。", kind: "buildDiscount", value: 0.35 },
    { id: "chance-health-cover", title: "租约保障", type: "opportunity", description: "下次向对手支付租金时减免 55%。", kind: "rentShield", value: 0.45 },
    { id: "chance-river-shuttle", title: "滨水接驳", type: "move", description: "前进到最近的无人地块。", kind: "nearestEmpty" }
  ];

  function group(name, color, buildCost, tier, symbol, strategy, growthLabel, rentCurve, buildMultiplier) {
    return { name, color, buildCost, tier, symbol, strategy, growthLabel, rentCurve, buildMultiplier };
  }

  function boardCoordinate(id) {
    const index = Math.max(0, Math.min(69, Math.floor(Number(id) || 0)));
    if (index < 23) return { x: index, y: 13 };
    if (index < 36) return { x: 22, y: 12 - (index - 23) };
    if (index < 58) return { x: 21 - (index - 36), y: 0 };
    return { x: 0, y: 1 + (index - 58) };
  }

  function prop(id, name, groupId, price, baseRent, x, y) {
    const groupConfig = GROUPS[groupId];
    const buildCost = getBaseBuildCost(price, baseRent, groupConfig.tier, groupConfig.buildMultiplier);
    return {
      id,
      type: "property",
      name,
      groupId,
      price,
      baseRent,
      feature: PROPERTY_FEATURES[id] || groupConfig.strategy,
      landmarkName: `${name}地标`,
      x,
      y,
      buildCost,
      buildCosts: buildCostTable(buildCost),
      rentTable: rentTable(price, baseRent, groupConfig.tier, groupConfig.rentCurve)
    };
  }

  function station(id, name, price, x, y) {
    return {
      id,
      type: "station",
      name,
      price,
      baseRent: STATION_RENTS[0],
      x,
      y,
      rentTable: STATION_RENTS.slice()
    };
  }

  function utility(id, name, price, x, y) {
    return {
      id,
      type: "utility",
      name,
      price,
      x,
      y
    };
  }

  function getBaseBuildCost(price, baseRent, tier, buildMultiplier = 1) {
    return roundToFive((price * 0.32 + baseRent * (1.2 + tier * 0.08)) * buildMultiplier);
  }

  function buildCostTable(baseCost) {
    return BUILD_COST_STEPS.map((multiplier) => roundToFive(baseCost * multiplier));
  }

  function rentTable(price, baseRent, tier, curveId = "steady") {
    const curve = RENT_CURVES[curveId] || RENT_MULTIPLIERS;
    return curve.map((multiplier, level) => {
      if (level === 0) return baseRent;
      const premium = price * (0.012 + level * 0.003) + tier * level * 2;
      const spikePremium = RENT_SPIKE_LEVELS.includes(level) ? price * (level === 5 ? 0.04 : 0.025) : 0;
      return roundToFive(baseRent * multiplier + premium + spikePremium);
    });
  }

  function roundToFive(value) {
    return Math.max(5, Math.round(value / 5) * 5);
  }

  function special(id, type, name, x, y, extra = {}) {
    return { id, type, name, x, y, ...extra };
  }

  function cash(id, title, description, value, type) {
    return { id, title, description, value, type, kind: "cash" };
  }

  function fee(id, title, description, value, severe) {
    return { id, title, description, value, type: "trouble", kind: "fee", severe: !!severe };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createGame(options = {}) {
    const seed = normalizeSeed(options.seed);
    const ruleset = normalizeRuleset(options.ruleset);
    const playerConfigs = normalizePlayerConfigs(options.players);
    const turnOrder = playerConfigs.map((player) => player.id);
    const state = {
      version: GAME_VERSION,
      ruleset,
      status: "playing",
      phase: "ready",
      roundNumber: 1,
      maxRounds: normalizeMaxRounds(options.maxRounds),
      endCondition: normalizeEndCondition(options.endCondition),
      turnOrder,
      activeTurnIndex: 0,
      activePlayerId: turnOrder[0],
      rngSeed: seed,
      rngState: seed,
      selectedTileId: 0,
      lastDice: null,
      lastMovePath: [],
      pending: null,
      marketEffects: [],
      eventDeck: [],
      discardPile: [],
      chanceDeck: [],
      chanceDiscardPile: [],
      logs: [],
      tutorial: {
        buy: false,
        build: false,
        debt: false,
        ai: false
      },
      result: null,
      players: playerConfigs.map((player) => createPlayer(player.id, player.name, player.controller, player.profileId)),
      tiles: BOARD_TEMPLATE.map((tile) => ({
        ...clone(tile),
        ownerId: null,
        houseLevel: 0,
        isMortgaged: false
      }))
    };

    state.rules = getRulesForState(state);
    state.eventDeck = shuffle(EVENT_CARDS.map((event) => event.id), state);
    state.chanceDeck = shuffle(CHANCE_CARDS.map((card) => card.id), state);
    if (isShortGame(state)) dealInitialShortGameProperties(state);
    const openingPlayers = Array.isArray(options.players) && options.players.length
      ? state.players.map((player) => player.name).join("、")
      : "你和 AI";
    log(state, `对局开始。${openingPlayers} 各有 ${STARTING_CASH} 金币。${isShortGame(state) ? "短局规则已启用。" : ""}`);
    return state;
  }

  function normalizeMaxRounds(value) {
    const normalized = Math.floor(Number(value));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : MAX_ROUNDS;
  }

  function normalizeEndCondition(value) {
    return value === HUMAN_SURVIVAL_END_CONDITION ? HUMAN_SURVIVAL_END_CONDITION : ROUND_LIMIT_END_CONDITION;
  }

  function normalizePlayerConfigs(players) {
    const source = Array.isArray(players) && players.length
      ? players
      : [
          { id: "player", name: "你", controller: "human", profileId: "human" },
          { id: "ai", name: "AI 地产商", controller: "ai", profileId: "default" }
        ];
    if (source.length < 2 || source.length > 4) {
      throw new Error("Game requires between 2 and 4 players");
    }

    const seenIds = new Set();
    return source.map((entry, index) => {
      const config = typeof entry === "string" ? { id: entry } : entry || {};
      const id = String(config.id || `player_${index + 1}`).trim();
      if (!id || seenIds.has(id)) throw new Error("Player ids must be unique");
      seenIds.add(id);

      const controller = config.controller === "human" || config.type === "human" ? "human" : "ai";
      return {
        id,
        name: String(config.name || (controller === "human" ? "你" : `AI 玩家 ${index}`)),
        controller,
        profileId: String(config.profileId || (controller === "human" ? "human" : id))
      };
    });
  }

  function normalizeRuleset(ruleset) {
    return ruleset === SHORT_RULESET ? SHORT_RULESET : STANDARD_RULESET;
  }

  function isShortGame(state) {
    return state && state.ruleset === SHORT_RULESET;
  }

  function getLandmarkLevel(state) {
    return isShortGame(state) ? SHORT_LANDMARK_LEVEL : STANDARD_LANDMARK_LEVEL;
  }

  function getHouseRequirementForLandmark(state) {
    return getLandmarkLevel(state) - 1;
  }

  function getRulesForState(state) {
    return {
      ruleset: state.ruleset || STANDARD_RULESET,
      shortGame: isShortGame(state),
      initialDeeds: isShortGame(state) ? SHORT_INITIAL_DEEDS : 0,
      landmarkLevel: getLandmarkLevel(state),
      houseRequirementForLandmark: getHouseRequirementForLandmark(state)
    };
  }

  function dealInitialShortGameProperties(state) {
    const deedIds = shuffle(state.tiles.filter((tile) => isPurchasableTile(tile)).map((tile) => tile.id), state);
    state.players.forEach((player) => {
      const dealtNames = [];
      for (let index = 0; index < SHORT_INITIAL_DEEDS; index += 1) {
        const tile = getTile(state, deedIds.shift());
        if (!tile) continue;
        tile.ownerId = player.id;
        dealtNames.push(tile.name);
      }
      if (dealtNames.length) log(state, `短局开局：${player.name} 免费获得 ${dealtNames.join("、")}。`);
    });
  }

  function createPlayer(id, name, controller, profileId) {
    return {
      id,
      name,
      type: controller,
      controller,
      profileId,
      status: "active",
      eliminatedAtRound: null,
      cash: STARTING_CASH,
      position: 0,
      consecutiveDoubles: 0,
      extraRoll: false,
      skipTurns: 0,
      inControl: false,
      controlAttempts: 0,
      controlPassCards: [],
      nextRentDiscount: 0,
      buildDiscount: 0,
      stats: {
        rentPaid: 0,
        rentCollected: 0,
        highestRent: 0,
        events: 0,
        propertiesBought: 0,
        housesBuilt: 0
      }
    };
  }

  function normalizeSeed(seed) {
    if (Number.isFinite(seed)) return seed >>> 0 || 1;
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0 || 1;
  }

  function random(state) {
    state.rngState = (1664525 * state.rngState + 1013904223) >>> 0;
    return state.rngState / 0x100000000;
  }

  function rollDie(state) {
    return Math.floor(random(state) * 6) + 1;
  }

  function shuffle(items, state) {
    const copy = items.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random(state) * (index + 1));
      const temp = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = temp;
    }
    return copy;
  }

  function getPlayer(state, playerId) {
    return state.players.find((player) => player.id === playerId);
  }

  function getNormalizedTurnOrder(state) {
    const players = Array.isArray(state && state.players) ? state.players : [];
    const playerIds = new Set(players.map((player) => player.id));
    const order = [];
    const configuredOrder = Array.isArray(state && state.turnOrder) ? state.turnOrder : [];
    configuredOrder.forEach((playerId) => {
      if (playerIds.has(playerId) && !order.includes(playerId)) order.push(playerId);
    });
    players.forEach((player) => {
      if (!order.includes(player.id)) order.push(player.id);
    });
    return order;
  }

  function isPlayerActive(player) {
    return !!player && player.status !== "eliminated";
  }

  function getActivePlayers(state) {
    return getNormalizedTurnOrder(state)
      .map((playerId) => getPlayer(state, playerId))
      .filter((player) => isPlayerActive(player));
  }

  function getNextPlayerId(state, currentId) {
    const order = getNormalizedTurnOrder(state);
    if (!order.length) return null;
    const currentIndex = order.indexOf(currentId);
    if (currentIndex < 0) {
      const firstActive = getActivePlayers(state)[0];
      return firstActive ? firstActive.id : null;
    }

    for (let offset = 1; offset <= order.length; offset += 1) {
      const candidateId = order[(currentIndex + offset) % order.length];
      if (isPlayerActive(getPlayer(state, candidateId))) return candidateId;
    }
    return null;
  }

  function advanceTurn(state) {
    const order = getNormalizedTurnOrder(state);
    const currentId = state.activePlayerId || order[state.activeTurnIndex] || null;
    const currentIndex = order.indexOf(currentId);
    const nextPlayerId = getNextPlayerId(state, currentId);
    if (!nextPlayerId) return state;

    const nextIndex = order.indexOf(nextPlayerId);
    if (currentIndex >= 0 && nextIndex <= currentIndex && nextPlayerId !== currentId) {
      state.roundNumber += 1;
    }
    state.turnOrder = order;
    state.activeTurnIndex = nextIndex;
    state.activePlayerId = nextPlayerId;
    return state;
  }

  function getOpponent(state, playerId) {
    return state.players.find((player) => player.id !== playerId);
  }

  function isPurchasableTile(tile) {
    return !!tile && PURCHASABLE_TYPES.includes(tile.type);
  }

  function getTilesByType(state, type) {
    return state.tiles.filter((tile) => tile.type === type);
  }

  function countOwnedByType(state, playerId, type) {
    return getTilesByType(state, type).filter((tile) => tile.ownerId === playerId).length;
  }

  function isLandmarkLevel(state, tile) {
    return tile && tile.type === "property" && tile.houseLevel >= getLandmarkLevel(state);
  }

  function getEffectiveRentLevel(state, tile) {
    if (!tile || tile.type !== "property") return 0;
    if (isLandmarkLevel(state, tile)) return STANDARD_LANDMARK_LEVEL;
    return Math.max(0, Math.min(tile.houseLevel || 0, STANDARD_LANDMARK_LEVEL));
  }

  function getHouseComponentCount(state, tile) {
    if (!tile || tile.type !== "property") return 0;
    if (isLandmarkLevel(state, tile)) return 0;
    return Math.max(0, Math.min(tile.houseLevel || 0, getHouseRequirementForLandmark(state)));
  }

  function getLandmarkComponentCount(state, tile) {
    return isLandmarkLevel(state, tile) ? 1 : 0;
  }

  function getBuildingStock(state) {
    const usedHouses = state.tiles.reduce((sum, tile) => sum + getHouseComponentCount(state, tile), 0);
    const usedLandmarks = state.tiles.reduce((sum, tile) => sum + getLandmarkComponentCount(state, tile), 0);
    return {
      houseLimit: BANK_HOUSE_LIMIT,
      landmarkLimit: BANK_LANDMARK_LIMIT,
      usedHouses,
      usedLandmarks,
      availableHouses: Math.max(0, BANK_HOUSE_LIMIT - usedHouses),
      availableLandmarks: Math.max(0, BANK_LANDMARK_LIMIT - usedLandmarks)
    };
  }

  function getOwnedBuildingCounts(state, playerId) {
    return getOwnedProperties(state, playerId).reduce(
      (counts, tile) => {
        counts.houses += getHouseComponentCount(state, tile);
        counts.landmarks += getLandmarkComponentCount(state, tile);
        return counts;
      },
      { houses: 0, landmarks: 0 }
    );
  }

  function hasBankStockForBuild(state, tile) {
    const stock = getBuildingStock(state);
    const houseRequirement = getHouseRequirementForLandmark(state);
    if (tile.houseLevel < houseRequirement) return stock.availableHouses > 0;
    if (tile.houseLevel === houseRequirement) return stock.availableLandmarks > 0;
    return false;
  }

  function hasBankStockForSell(state, tile) {
    if (!isLandmarkLevel(state, tile)) return true;
    return getBuildingStock(state).availableHouses >= getHouseRequirementForLandmark(state);
  }

  function getLastDiceTotal(state) {
    return Array.isArray(state.lastDice) ? state.lastDice.reduce((sum, value) => sum + value, 0) : 0;
  }

  function getControlPassCards(player) {
    if (!player) return [];
    if (!Array.isArray(player.controlPassCards)) player.controlPassCards = [];
    return player.controlPassCards;
  }

  function getControlPassCount(player) {
    return getControlPassCards(player).length;
  }

  function getActivePlayer(state) {
    const current = getPlayer(state, state.activePlayerId);
    return isPlayerActive(current) ? current : getActivePlayers(state)[0] || null;
  }

  function getTile(state, tileId) {
    return state.tiles[tileId];
  }

  function getEvent(cardId) {
    return EVENT_CARDS.find((event) => event.id === cardId);
  }

  function getChanceCard(cardId) {
    return CHANCE_CARDS.find((card) => card.id === cardId);
  }

  function getCardById(cardId, deckType = "event") {
    return deckType === "chance" ? getChanceCard(cardId) : getEvent(cardId);
  }

  function getDeckConfig(state, deckType = "event") {
    if (deckType === "chance") {
      return {
        type: "chance",
        label: "机遇卡",
        cards: CHANCE_CARDS,
        deckKey: "chanceDeck",
        discardKey: "chanceDiscardPile"
      };
    }
    return {
      type: "event",
      label: "城市事件",
      cards: EVENT_CARDS,
      deckKey: "eventDeck",
      discardKey: "discardPile"
    };
  }

  function log(state, message) {
    state.logs.unshift({
      id: `${Date.now()}-${state.logs.length}-${Math.floor(Math.random() * 1000)}`,
      round: state.roundNumber,
      message
    });
    state.logs = state.logs.slice(0, 80);
  }

  function startTurn(state) {
    if (state.status !== "playing") return state;
    const player = getActivePlayer(state);
    if (!player) return state;
    state.activePlayerId = player.id;
    state.activeTurnIndex = getNormalizedTurnOrder(state).indexOf(player.id);
    state.pending = null;
    state.lastDice = null;
    state.lastMovePath = [];
    state.selectedTileId = player.position;

    if (player.inControl) {
      player.consecutiveDoubles = 0;
      player.extraRoll = false;
      state.phase = "control";
      state.pending = { type: "control", playerId: player.id };
      const passText = getControlPassCount(player) > 0 ? "可使用通行证、" : "";
      log(state, `${player.name} 正在交通管制区，${passText}可缴费 ${CONTROL_RELEASE_FEE} 或尝试掷出对子离开。`);
      return state;
    }

    state.phase = "ready";
    log(state, `第 ${state.roundNumber} 轮，${player.name} 的回合。`);
    return state;
  }

  function rollActivePlayer(state) {
    if (state.status !== "playing" || state.phase !== "ready") return state;
    const player = getActivePlayer(state);
    const dice = [rollDie(state), rollDie(state)];
    const total = dice[0] + dice[1];
    const isDouble = dice[0] === dice[1];
    state.lastDice = dice;

    if (isDouble) {
      player.consecutiveDoubles += 1;
      player.extraRoll = true;
    } else {
      player.consecutiveDoubles = 0;
      player.extraRoll = false;
    }

    log(state, `${player.name} 掷出 ${dice[0]} + ${dice[1]}，前进 ${total} 格。`);

    if (player.consecutiveDoubles >= 3) {
      return sendToControl(state, player.id, "连续三次对子");
    }

    movePlayer(state, player.id, total);
    settleCurrentTile(state, player.id);
    return state;
  }

  function movePlayer(state, playerId, steps) {
    const player = getPlayer(state, playerId);
    const boardLength = state.tiles.length;
    const path = [];
    let current = player.position;
    const direction = steps >= 0 ? 1 : -1;

    for (let i = 0; i < Math.abs(steps); i += 1) {
      current = (current + direction + boardLength) % boardLength;
      path.push(current);
      if (direction > 0 && current === 0) {
        player.cash += PASS_START_REWARD;
        log(state, `${player.name} 路过起点，获得 ${PASS_START_REWARD} 金币。`);
      }
    }

    player.position = current;
    state.selectedTileId = current;
    state.lastMovePath = path;
  }

  function moveToTile(state, playerId, tileId) {
    const player = getPlayer(state, playerId);
    const boardLength = state.tiles.length;
    const from = player.position;
    const forwardSteps = (tileId - from + boardLength) % boardLength;
    movePlayer(state, playerId, forwardSteps);
    if (tileId === 0 && from !== 0 && forwardSteps === 0) {
      player.cash += PASS_START_REWARD;
    }
  }

  function settleCurrentTile(state, playerId, options = {}) {
    if (state.status !== "playing") return state;
    const player = getPlayer(state, playerId);
    const tile = getTile(state, player.position);
    state.selectedTileId = tile.id;

    if (tile.type === "start") {
      state.phase = "management";
      log(state, `${player.name} 停在起点广场。`);
      return state;
    }

    if (isPurchasableTile(tile)) {
      return settleProperty(state, playerId, tile);
    }

    if (tile.type === "event") {
      if (options.noEventChain) {
        state.phase = "management";
        log(state, `${player.name} 停在事件格，事件移动不连锁抽牌。`);
        return state;
      }
      return tile.deck === "chance" ? drawChanceCard(state, playerId, tile.name) : drawEvent(state, playerId);
    }

    if (tile.type === "tax") {
      if (tile.incomeTax) {
        state.phase = "tax-choice";
        state.pending = { type: "tax-choice", playerId, tileId: tile.id };
        log(state, `${player.name} 来到 ${tile.name}，需选择支付固定税或总资产比例税。`);
        return state;
      }

      const amount = tile.percent
        ? Math.min(tile.max, Math.max(tile.min, Math.floor(getNetWorth(state, playerId) * tile.percent)))
        : tile.amount;
      player.cash -= amount;
      log(state, `${player.name} 在 ${tile.name} 支付 ${amount} 金币。`);
      state.phase = "management";
      return checkDebt(state, playerId);
    }

    if (tile.type === "rest") {
      state.phase = "management";
      log(
        state,
        tile.tradeHub
          ? `${player.name} 来到 ${tile.name}，可在资产页发起地产与资金交易。`
          : `${player.name} 停在 ${tile.name}，只是临时停靠，不受管制影响。`
      );
      return state;
    }

    state.phase = "management";
    return state;
  }

  function settleProperty(state, playerId, tile) {
    const player = getPlayer(state, playerId);

    if (!tile.ownerId) {
      state.phase = "purchase";
      state.pending = { type: "purchase", playerId, tileId: tile.id };
      if (player.cash >= tile.price) {
        log(state, `${player.name} 来到无人地块 ${tile.name}，标价 ${tile.price}。`);
      } else {
        log(state, `${player.name} 现金不足，${tile.name} 进入竞拍。`);
        startAuction(state, tile.id, playerId);
      }
      return state;
    }

    if (tile.ownerId === playerId) {
      state.phase = "management";
      log(state, `${player.name} 来到自己的 ${tile.name}。`);
      return state;
    }

    if (tile.isMortgaged) {
      state.phase = "management";
      log(state, `${tile.name} 已抵押，本次不收租。`);
      return state;
    }

    return startRentDemand(state, playerId, tile);
  }

  function startRentDemand(state, payerId, tile) {
    const payer = getPlayer(state, payerId);
    const owner = getPlayer(state, tile.ownerId);
    const rent = calculateRent(state, tile.id);
    state.phase = "rent-demand";
    state.pending = {
      type: "rent-demand",
      payerId,
      ownerId: tile.ownerId,
      tileId: tile.id,
      rent
    };
    log(state, `${payer.name} 来到 ${owner.name} 的 ${tile.name}，等待业主要求收租 ${rent}。`);
    return state;
  }

  function payRent(state, payerId, tile, rentAmount = null) {
    const payer = getPlayer(state, payerId);
    const owner = getPlayer(state, tile.ownerId);
    let rent = rentAmount === null ? calculateRent(state, tile.id) : Math.max(0, Math.floor(Number(rentAmount) || 0));

    if (payer.nextRentDiscount > 0) {
      const discount = payer.nextRentDiscount;
      rent = Math.floor(rent * discount);
      payer.nextRentDiscount = 0;
      log(state, `${payer.name} 使用租金调解，租金减免。`);
    }

    payer.cash -= rent;
    owner.cash += rent;
    payer.stats.rentPaid += rent;
    owner.stats.rentCollected += rent;
    owner.stats.highestRent = Math.max(owner.stats.highestRent, rent);
    state.phase = "management";
    state.pending = null;
    log(state, `${payer.name} 向 ${owner.name} 支付 ${tile.name} 租金 ${rent}。`);
    consumeRentEffect(state, tile);
    return checkDebt(state, payerId, { creditorId: tile.ownerId, creditedAmount: rent });
  }

  function demandRent(state, ownerId) {
    if (state.phase !== "rent-demand" || !state.pending || state.pending.type !== "rent-demand") return false;
    const pending = state.pending;
    const tile = getTile(state, pending.tileId);
    if (!tile || tile.ownerId !== ownerId || pending.ownerId !== ownerId || tile.isMortgaged) return false;
    payRent(state, pending.payerId, tile, pending.rent);
    return true;
  }

  function waiveRent(state, ownerId) {
    if (state.phase !== "rent-demand" || !state.pending || state.pending.type !== "rent-demand") return false;
    const pending = state.pending;
    if (pending.ownerId !== ownerId) return false;
    const owner = getPlayer(state, ownerId);
    const payer = getPlayer(state, pending.payerId);
    const tile = getTile(state, pending.tileId);
    state.phase = "management";
    state.pending = null;
    log(state, `${owner.name} 放弃向 ${payer.name} 收取 ${tile.name} 本次租金。`);
    return true;
  }

  function calculateRent(state, tileId) {
    const tile = getTile(state, tileId);
    if (!isPurchasableTile(tile) || !tile.ownerId || tile.isMortgaged) return 0;

    if (tile.type === "station") {
      const count = countOwnedByType(state, tile.ownerId, "station");
      return STATION_RENTS[Math.max(0, Math.min(count - 1, STATION_RENTS.length - 1))] || 0;
    }

    if (tile.type === "utility") {
      const count = countOwnedByType(state, tile.ownerId, "utility");
      const multiplier = UTILITY_RENT_MULTIPLIERS[Math.max(0, Math.min(count - 1, UTILITY_RENT_MULTIPLIERS.length - 1))] || 0;
      return getLastDiceTotal(state) * multiplier;
    }

    const houseLevel = getEffectiveRentLevel(state, tile);
    let rent = getRentAtLevel(tile, houseLevel);
    if (houseLevel === 0 && isGroupComplete(state, tile.ownerId, tile.groupId)) {
      rent *= 2;
    }
    const effect = state.marketEffects.find(
      (item) => item.ownerId === tile.ownerId && item.groupId === tile.groupId && item.uses > 0
    );
    if (effect) rent = Math.floor(rent * effect.multiplier);
    return Math.max(10, rent);
  }

  function getRentAtLevel(tile, level) {
    if (!tile || tile.type !== "property") return 0;
    const safeLevel = Math.max(0, Math.min(level, RENT_MULTIPLIERS.length - 1));
    if (Array.isArray(tile.rentTable) && tile.rentTable[safeLevel]) return tile.rentTable[safeLevel];
    return Math.floor(tile.baseRent * RENT_MULTIPLIERS[safeLevel]);
  }

  function isRentSpikeLevel(level) {
    return RENT_SPIKE_LEVELS.includes(level);
  }

  function consumeRentEffect(state, tile) {
    const effect = state.marketEffects.find(
      (item) => item.ownerId === tile.ownerId && item.groupId === tile.groupId && item.uses > 0
    );
    if (!effect) return;
    effect.uses -= 1;
    state.marketEffects = state.marketEffects.filter((item) => item.uses > 0);
  }

  function drawEvent(state, playerId) {
    return drawCard(state, playerId, "event");
  }

  function drawChanceCard(state, playerId, source = "机遇卡") {
    log(state, `${getPlayer(state, playerId).name} 触发${source}抽取。`);
    return drawCard(state, playerId, "chance");
  }

  function drawCard(state, playerId, deckType) {
    const player = getPlayer(state, playerId);
    const config = getDeckConfig(state, deckType);
    if (!Array.isArray(state[config.deckKey])) state[config.deckKey] = [];
    if (!Array.isArray(state[config.discardKey])) state[config.discardKey] = [];

    if (state[config.deckKey].length === 0) {
      state[config.deckKey] = shuffle(state[config.discardKey], state);
      state[config.discardKey] = [];
    }

    let cardId = state[config.deckKey].shift();
    let card = getCardById(cardId, config.type);
    let guard = 0;
    while (state.roundNumber <= 3 && card && card.severe && guard < config.cards.length) {
      state[config.deckKey].push(cardId);
      cardId = state[config.deckKey].shift();
      card = getCardById(cardId, config.type);
      guard += 1;
    }

    if (!card) {
      state.phase = "management";
      return state;
    }

    player.stats.events += 1;
    log(state, `${player.name} 抽到${config.label}：${card.title}。`);
    if (card.kind === "choice") {
      state.phase = "choice";
      state.pending = { type: "choice", playerId, cardId: card.id, deck: config.type };
      return state;
    }

    applyEvent(state, playerId, card, null, config.type);
    if (card.kind !== "controlPass") state[config.discardKey].push(card.id);
    if (
      state.phase !== "purchase" &&
      state.phase !== "auction" &&
      !(state.phase === "choice" && state.pending) &&
      state.phase !== "debt" &&
      state.status === "playing"
    ) {
      state.phase = "management";
    }
    return state;
  }

  function applyEvent(state, playerId, card, choice, deckType = "event") {
    const player = getPlayer(state, playerId);
    const selected = choice || card;

    if (selected.kind === "cash") {
      player.cash += selected.value;
      log(state, `${player.name} 获得 ${selected.value} 金币。`);
      return state;
    }

    if (selected.kind === "cashAfterFee") {
      player.cash -= selected.fee;
      player.cash += selected.value;
      log(state, `${player.name} 投入 ${selected.fee}，回收 ${selected.value} 金币。`);
      return checkDebt(state, playerId);
    }

    if (selected.kind === "fee") {
      const amount = capLossIfNeeded(state, playerId, selected.value, card.severe);
      player.cash -= amount;
      log(state, `${player.name} 支付 ${amount} 金币。`);
      return checkDebt(state, playerId);
    }

    if (selected.kind === "maintenance") {
      const buildingCounts = getOwnedBuildingCounts(state, playerId);
      const buildings = buildingCounts.houses + buildingCounts.landmarks;
      const amount = Math.min(capLossIfNeeded(state, playerId, buildings * selected.value, true), buildings * selected.value);
      player.cash -= amount;
      log(state, `${player.name} 为 ${buildings} 栋建筑支付 ${amount} 金币维护费。`);
      return checkDebt(state, playerId);
    }

    if (selected.kind === "move") {
      movePlayer(state, playerId, selected.value);
      log(state, `${player.name} 因事件移动到 ${getTile(state, player.position).name}。`);
      return settleCurrentTile(state, playerId, { noEventChain: true });
    }

    if (selected.kind === "moveTo") {
      if (selected.value === CONTROL_ZONE_INDEX) {
        return sendToControl(state, playerId, card.title);
      }
      moveToTile(state, playerId, selected.value);
      log(state, `${player.name} 因事件移动到 ${getTile(state, player.position).name}。`);
      return settleCurrentTile(state, playerId, { noEventChain: true });
    }

    if (selected.kind === "nearestEmpty") {
      const next = findNearestEmptyProperty(state, player.position);
      if (next) {
        moveToTile(state, playerId, next.id);
        log(state, `${player.name} 前往最近的无人地块 ${next.name}。`);
        return settleCurrentTile(state, playerId, { noEventChain: true });
      }
      player.cash += 100;
      log(state, "没有无人地块，事件改为获得 100 金币。");
      return state;
    }

    if (selected.kind === "buildDiscount") {
      player.buildDiscount = selected.value;
      log(state, `${player.name} 获得下一次建房半价。`);
      return state;
    }

    if (selected.kind === "rentShield") {
      player.nextRentDiscount = selected.value;
      log(state, `${player.name} 获得下次付租减免。`);
      return state;
    }

    if (selected.kind === "controlPass") {
      getControlPassCards(player).push({ deck: deckType, cardId: card.id });
      log(state, `${player.name} 保留一张交通管制通行证，可在管制阶段免费离开。`);
      return state;
    }

    if (selected.kind === "groupRentBoost") {
      const groupId = pickBestOwnedGroup(state, playerId);
      if (!groupId) {
        player.cash += 80;
        log(state, `${player.name} 暂无街区，事件改为获得 80 金币。`);
        return state;
      }
      state.marketEffects.push({ ownerId: playerId, groupId, multiplier: selected.value, uses: 1 });
      log(state, `${player.name} 的${GROUPS[groupId].name}下次收租提升。`);
      return state;
    }

    if (selected.kind === "drawChance") {
      return drawChanceCard(state, playerId, "城市事件");
    }

    if (selected.kind === "mortgageCheapest") {
      const tile = getCheapestMortgageCandidate(state, playerId);
      if (tile) {
        mortgageProperty(state, tile.id, playerId, true);
      } else {
        player.cash -= 80;
        log(state, `${player.name} 无可抵押地块，改为支付 80 金币。`);
        checkDebt(state, playerId);
      }
    }

    return state;
  }

  function capLossIfNeeded(state, playerId, amount, severe) {
    if (!severe && state.roundNumber > 3) return amount;
    const maxLoss = Math.max(40, Math.floor(getNetWorth(state, playerId) * 0.2));
    return Math.min(amount, maxLoss);
  }

  function normalizeTaxChoice(choice) {
    return choice === 1 || choice === "percent" || choice === "rate" ? "percent" : "fixed";
  }

  function calculateIncomeTaxAmount(state, playerId, tile, choice) {
    if (choice === "percent") {
      const rate = Number.isFinite(tile.percent) ? tile.percent : INCOME_TAX_RATE;
      return Math.floor(getNetWorth(state, playerId) * rate);
    }
    return Number.isFinite(tile.fixedAmount) ? tile.fixedAmount : INCOME_TAX_FIXED_AMOUNT;
  }

  function resolveTaxChoice(state, choiceKind) {
    if (state.phase !== "tax-choice" || !state.pending || state.pending.type !== "tax-choice") return state;
    const pending = state.pending;
    const player = getPlayer(state, pending.playerId);
    const tile = getTile(state, pending.tileId);
    const choice = normalizeTaxChoice(choiceKind);
    const amount = calculateIncomeTaxAmount(state, pending.playerId, tile, choice);
    const choiceLabel = choice === "percent" ? "总资产 10%" : `固定 ${amount}`;

    player.cash -= amount;
    state.pending = null;
    log(state, `${player.name} 在 ${tile.name} 选择${choiceLabel}，支付 ${amount} 金币。`);
    state.phase = "management";
    return checkDebt(state, pending.playerId);
  }

  function resolveAiTaxChoice(state) {
    if (state.phase !== "tax-choice" || !state.pending || state.pending.type !== "tax-choice") return state;
    const pending = state.pending;
    const tile = getTile(state, pending.tileId);
    const fixedAmount = calculateIncomeTaxAmount(state, pending.playerId, tile, "fixed");
    const percentAmount = calculateIncomeTaxAmount(state, pending.playerId, tile, "percent");
    return resolveTaxChoice(state, percentAmount < fixedAmount ? "percent" : "fixed");
  }

  function resolveChoice(state, choiceIndex) {
    if (state.phase !== "choice" || !state.pending) return state;
    const pending = state.pending;
    const deckType = pending.deck || "event";
    const config = getDeckConfig(state, deckType);
    const card = getCardById(pending.cardId, deckType);
    const choice = card.choices[choiceIndex] || card.choices[0];
    state.pending = null;
    log(state, `${getPlayer(state, pending.playerId).name} 选择：${choice.label}。`);
    applyEvent(state, pending.playerId, card, choice, deckType);
    state[config.discardKey].push(card.id);
    if (
      state.phase !== "purchase" &&
      state.phase !== "auction" &&
      !(state.phase === "choice" && state.pending) &&
      state.phase !== "debt" &&
      state.status === "playing"
    ) {
      state.phase = "management";
    }
    return state;
  }

  function resolveAiChoice(state) {
    if (state.phase !== "choice" || !state.pending) return state;
    const card = getCardById(state.pending.cardId, state.pending.deck || "event");
    const playerId = state.pending.playerId;
    let bestIndex = 0;
    let bestScore = -Infinity;
    card.choices.forEach((choice, index) => {
      const score = scoreChoice(state, playerId, choice);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    return resolveChoice(state, bestIndex);
  }

  function scoreChoice(state, playerId, choice) {
    const player = getPlayer(state, playerId);
    if (choice.kind === "cash") return choice.value;
    if (choice.kind === "cashAfterFee") return choice.value - choice.fee;
    if (choice.kind === "fee") return -choice.value;
    if (choice.kind === "buildDiscount") return getOwnedProperties(state, playerId).some((tile) => tile.houseLevel < getLandmarkLevel(state)) ? 130 : 50;
    if (choice.kind === "rentShield") return player.cash < 350 ? 140 : 80;
    if (choice.kind === "groupRentBoost") return getOwnedProperties(state, playerId).length * 30;
    if (choice.kind === "drawChance") return 115;
    if (choice.kind === "mortgageCheapest") return player.cash < 200 ? 70 : -20;
    return 0;
  }

  function sendToControl(state, playerId, reason) {
    const player = getPlayer(state, playerId);
    player.position = CONTROL_ZONE_INDEX;
    player.inControl = true;
    player.controlAttempts = 0;
    player.consecutiveDoubles = 0;
    player.extraRoll = false;
    player.skipTurns = 0;
    state.selectedTileId = CONTROL_ZONE_INDEX;
    state.pending = null;
    state.phase = "management";
    log(state, `${player.name} 因${reason}被送往交通管制区，不能领取经过起点奖励。`);
    return state;
  }

  function releaseFromControl(player) {
    player.inControl = false;
    player.controlAttempts = 0;
    player.consecutiveDoubles = 0;
    player.extraRoll = false;
    player.skipTurns = 0;
  }

  function payControlFee(state, playerId) {
    const player = getPlayer(state, playerId);
    if (!player || !player.inControl || player.cash < CONTROL_RELEASE_FEE) return false;
    player.cash -= CONTROL_RELEASE_FEE;
    releaseFromControl(player);
    state.phase = "ready";
    state.pending = null;
    log(state, `${player.name} 缴纳 ${CONTROL_RELEASE_FEE} 金币，离开交通管制区。`);
    return true;
  }

  function useControlPass(state, playerId) {
    const player = getPlayer(state, playerId);
    const passes = getControlPassCards(player);
    if (!player || !player.inControl || passes.length === 0) return false;
    const pass = passes.shift();
    const config = getDeckConfig(state, pass.deck || "chance");
    if (!Array.isArray(state[config.discardKey])) state[config.discardKey] = [];
    if (pass.cardId) state[config.discardKey].push(pass.cardId);
    releaseFromControl(player);
    state.phase = "ready";
    state.pending = null;
    log(state, `${player.name} 使用交通管制通行证，免费离开管制区。`);
    return true;
  }

  function rollForControlRelease(state, playerId) {
    const player = getPlayer(state, playerId);
    if (!player || !player.inControl || state.phase !== "control") return state;
    const dice = [rollDie(state), rollDie(state)];
    const total = dice[0] + dice[1];
    const isDouble = dice[0] === dice[1];
    state.lastDice = dice;
    player.controlAttempts += 1;
    player.extraRoll = false;

    if (isDouble) {
      releaseFromControl(player);
      log(state, `${player.name} 在交通管制区掷出对子 ${dice[0]} + ${dice[1]}，立刻离开并移动 ${total} 格。`);
      movePlayer(state, playerId, total);
      settleCurrentTile(state, playerId);
      return state;
    }

    if (player.controlAttempts >= MAX_CONTROL_ATTEMPTS) {
      player.cash -= CONTROL_RELEASE_FEE;
      releaseFromControl(player);
      log(state, `${player.name} 第 ${MAX_CONTROL_ATTEMPTS} 次仍未掷出对子，缴纳 ${CONTROL_RELEASE_FEE} 金币后按 ${total} 格移动。`);
      movePlayer(state, playerId, total);
      settleCurrentTile(state, playerId);
      return checkDebt(state, playerId);
    }

    state.phase = "control";
    state.pending = { type: "control", playerId };
    log(state, `${player.name} 未掷出对子，仍在交通管制区（${player.controlAttempts}/${MAX_CONTROL_ATTEMPTS}）。`);
    return state;
  }

  function findNearestEmptyProperty(state, fromPosition) {
    for (let step = 1; step <= state.tiles.length; step += 1) {
      const tile = getTile(state, (fromPosition + step) % state.tiles.length);
      if (isPurchasableTile(tile) && !tile.ownerId) return tile;
    }
    return null;
  }

  function buyProperty(state, tileId, playerId) {
    const tile = getTile(state, tileId);
    const player = getPlayer(state, playerId);
    if (!isPurchasableTile(tile) || tile.ownerId || player.cash < tile.price) return false;
    player.cash -= tile.price;
    tile.ownerId = playerId;
    player.stats.propertiesBought += 1;
    state.pending = null;
    state.phase = "management";
    log(state, `${player.name} 购买 ${tile.name}，支付 ${tile.price} 金币。`);
    if (tile.type === "property" && isGroupComplete(state, playerId, tile.groupId)) {
      log(state, `${player.name} 集齐${GROUPS[tile.groupId].name}，未建房租金翻倍，并解锁均匀建房。`);
    }
    return true;
  }

  function startAuction(state, tileId, actorId) {
    const tile = getTile(state, tileId);
    if (!isPurchasableTile(tile) || tile.ownerId) return state;
    const participants = getActivePlayers(state).map((player) => player.id);
    if (!participants.length) return state;
    const firstBidderId = participants.includes(actorId) ? actorId : participants[0];
    state.phase = "auction";
    state.pending = {
      type: "auction",
      tileId,
      actorId,
      participants,
      activeBidderId: firstBidderId,
      highBidderId: null,
      currentBid: 0,
      passedIds: []
    };
    log(state, `${tile.name} 进入拍卖，起价 ${AUCTION_START_BID} 金币，每次至少加价 ${AUCTION_MIN_INCREMENT}。`);
    return state;
  }

  function getAuctionMinimumBid(state) {
    if (state.phase !== "auction" || !state.pending || state.pending.type !== "auction") return AUCTION_START_BID;
    return state.pending.currentBid > 0 ? state.pending.currentBid + AUCTION_MIN_INCREMENT : AUCTION_START_BID;
  }

  function getAuctionParticipants(state, pending) {
    const participants = Array.isArray(pending.participants) && pending.participants.length
      ? pending.participants
      : getActivePlayers(state).map((player) => player.id);
    return participants.filter((playerId, index) => {
      const player = getPlayer(state, playerId);
      return isPlayerActive(player) && participants.indexOf(playerId) === index;
    });
  }

  function getAuctionPassedIds(pending) {
    if (!Array.isArray(pending.passedIds)) pending.passedIds = [];
    return pending.passedIds;
  }

  function getNextAuctionBidder(state, fromPlayerId) {
    const pending = state.pending;
    const participants = getAuctionParticipants(state, pending);
    const passedIds = getAuctionPassedIds(pending);
    const startIndex = Math.max(0, participants.indexOf(fromPlayerId));

    for (let offset = 1; offset <= participants.length; offset += 1) {
      const candidateId = participants[(startIndex + offset) % participants.length];
      if (candidateId === pending.highBidderId) continue;
      if (passedIds.includes(candidateId)) continue;
      if (!isPlayerActive(getPlayer(state, candidateId))) continue;
      return candidateId;
    }
    return null;
  }

  function finalizeAuction(state) {
    if (state.phase !== "auction" || !state.pending) return state;
    const pending = state.pending;
    const tile = getTile(state, pending.tileId);
    const winnerId = pending.highBidderId;
    const winningBid = Math.max(0, Math.floor(pending.currentBid || 0));

    if (winnerId && winningBid > 0 && isPlayerActive(getPlayer(state, winnerId)) && isPurchasableTile(tile) && !tile.ownerId) {
      const winner = getPlayer(state, winnerId);
      winner.cash -= winningBid;
      tile.ownerId = winnerId;
      winner.stats.propertiesBought += 1;
      log(state, `${winner.name} 以 ${winningBid} 金币竞得 ${tile.name}。`);
      if (tile.type === "property" && isGroupComplete(state, winnerId, tile.groupId)) {
        log(state, `${winner.name} 集齐${GROUPS[tile.groupId].name}，未建房租金翻倍，并解锁均匀建房。`);
      }
    } else {
      log(state, `${tile.name} 无人出价，留在银行。`);
    }

    state.pending = null;
    state.phase = "management";
    return state;
  }

  function placeAuctionBid(state, playerId, bidValue) {
    if (state.phase !== "auction" || !state.pending || state.pending.type !== "auction") return false;
    const pending = state.pending;
    const tile = getTile(state, pending.tileId);
    const player = getPlayer(state, playerId);
    const amount = Math.floor(Number(bidValue) || 0);
    const minimumBid = getAuctionMinimumBid(state);
    if (!isPlayerActive(player) || !isPurchasableTile(tile) || tile.ownerId) return false;
    if (pending.activeBidderId !== playerId || pending.highBidderId === playerId) return false;
    if (getAuctionPassedIds(pending).includes(playerId)) return false;
    if (amount < minimumBid || amount > player.cash) return false;

    pending.currentBid = amount;
    pending.highBidderId = playerId;
    log(state, `${player.name} 为 ${tile.name} 出价 ${amount} 金币。`);

    const nextBidderId = getNextAuctionBidder(state, playerId);
    if (nextBidderId) pending.activeBidderId = nextBidderId;
    else finalizeAuction(state);
    return true;
  }

  function passAuction(state, playerId) {
    if (state.phase !== "auction" || !state.pending || state.pending.type !== "auction") return false;
    const pending = state.pending;
    const player = getPlayer(state, playerId);
    if (!isPlayerActive(player) || pending.activeBidderId !== playerId || pending.highBidderId === playerId) return false;
    const passedIds = getAuctionPassedIds(pending);
    if (!passedIds.includes(playerId)) passedIds.push(playerId);
    log(state, `${player.name} 放弃继续竞价。`);

    const nextBidderId = getNextAuctionBidder(state, playerId);
    if (nextBidderId) pending.activeBidderId = nextBidderId;
    else finalizeAuction(state);
    return true;
  }

  function runAuction(state, humanBidValue) {
    placeAuctionBid(state, "player", humanBidValue);
    return state;
  }

  function aiHandleAuction(state) {
    if (state.phase !== "auction" || !state.pending || state.pending.activeBidderId !== "ai") return state;
    const tile = getTile(state, state.pending.tileId);
    const minimumBid = getAuctionMinimumBid(state);
    const maxBid = Math.max(0, Math.min(aiMaxBid(state, tile.id), getPlayer(state, "ai").cash));
    if (minimumBid <= maxBid) placeAuctionBid(state, "ai", minimumBid);
    else passAuction(state, "ai");
    return state;
  }

  function aiHandlePurchase(state) {
    if (state.phase !== "purchase" || !state.pending) return state;
    const pending = state.pending;
    const tile = getTile(state, pending.tileId);
    if (pending.playerId !== "ai") return state;
    if (aiShouldBuy(state, tile.id)) {
      buyProperty(state, tile.id, "ai");
      log(state, `AI 解释：购买后仍有安全现金，且 ${tile.name} 有组地价值。`);
      state.tutorial.ai = true;
      return state;
    }
    log(state, `AI 解释：现金安全线不足，放弃按标价购买 ${tile.name}。`);
    return startAuction(state, tile.id, "ai");
  }

  function aiShouldBuy(state, tileId) {
    const tile = getTile(state, tileId);
    const ai = getPlayer(state, "ai");
    const safety = getAiSafetyLine(state);
    const completionBonus =
      tile.type === "property" && groupCompletionCount(state, "ai", tile.groupId) >= getGroupTiles(state, tile.groupId).length - 1;
    if (completionBonus && ai.cash >= tile.price + 120) return true;
    return ai.cash - tile.price >= safety && estimatePropertyValue(state, "ai", tileId) >= tile.price * 0.86;
  }

  function getAiSafetyLine(state) {
    return state.roundNumber < 8 ? 250 : 180;
  }

  function aiMaxBid(state, tileId) {
    const tile = getTile(state, tileId);
    const ai = getPlayer(state, "ai");
    const safety = getAiSafetyLine(state);
    const available = Math.max(0, ai.cash - safety);
    return Math.floor(Math.min(available, estimatePropertyValue(state, "ai", tileId) * 0.85, tile.price * 1.15));
  }

  function estimatePropertyValue(state, playerId, tileId) {
    const tile = getTile(state, tileId);
    if (tile.type === "station") {
      const stations = getTilesByType(state, "station");
      const owned = countOwnedByType(state, playerId, "station");
      const opponentOwned = stations.filter((item) => item.ownerId && item.ownerId !== playerId).length;
      let value = tile.price + owned * 55;
      if (owned === stations.length - 1) value += 90;
      if (opponentOwned > 0) value -= tile.price * 0.2;
      return Math.max(tile.price * 0.45, value);
    }

    if (tile.type === "utility") {
      const utilities = getTilesByType(state, "utility");
      const owned = countOwnedByType(state, playerId, "utility");
      const opponentOwned = utilities.filter((item) => item.ownerId && item.ownerId !== playerId).length;
      let value = tile.price + owned * 45;
      if (owned === utilities.length - 1) value += 60;
      if (opponentOwned > 0) value -= tile.price * 0.2;
      return Math.max(tile.price * 0.45, value);
    }

    const groupTiles = getGroupTiles(state, tile.groupId);
    const ownedInGroup = groupCompletionCount(state, playerId, tile.groupId);
    const opponentOwned = groupTiles.filter((item) => item.ownerId && item.ownerId !== playerId).length;
    let value = tile.price;
    value += ownedInGroup * 45;
    value += GROUPS[tile.groupId].tier * 12;
    if (ownedInGroup === groupTiles.length - 1) value += tile.price * 0.35;
    if (opponentOwned > 0) value -= tile.price * 0.3;
    return Math.max(tile.price * 0.45, value);
  }

  function getGroupTiles(state, groupId) {
    return state.tiles.filter((tile) => tile.type === "property" && tile.groupId === groupId);
  }

  function groupCompletionCount(state, playerId, groupId) {
    return getGroupTiles(state, groupId).filter((tile) => tile.ownerId === playerId).length;
  }

  function isGroupComplete(state, playerId, groupId) {
    const groupTiles = getGroupTiles(state, groupId);
    return groupTiles.length > 0 && groupTiles.every((tile) => tile.ownerId === playerId);
  }

  function hasDistrictControl(state, playerId, groupId) {
    const groupTiles = getGroupTiles(state, groupId);
    const required = Math.max(2, Math.ceil(groupTiles.length * 2 / 3));
    return groupTiles.length > 0 && groupCompletionCount(state, playerId, groupId) >= required;
  }

  function ownsCompleteGroup(state, playerId) {
    return Object.keys(GROUPS).some((groupId) => isGroupComplete(state, playerId, groupId));
  }

  function getOwnedProperties(state, playerId) {
    return state.tiles.filter((tile) => isPurchasableTile(tile) && tile.ownerId === playerId);
  }

  function hasGroupMortgage(state, playerId, groupId) {
    return getGroupTiles(state, groupId).some((tile) => tile.ownerId === playerId && tile.isMortgaged);
  }

  function hasGroupBuildings(state, playerId, groupId) {
    return getGroupTiles(state, groupId).some((tile) => tile.ownerId === playerId && tile.houseLevel > 0);
  }

  function getGroupHouseLevels(state, playerId, groupId) {
    return getGroupTiles(state, groupId)
      .filter((tile) => tile.ownerId === playerId)
      .map((tile) => tile.houseLevel || 0);
  }

  function canBuildEvenlyOnTile(state, tile, playerId) {
    const levels = getGroupHouseLevels(state, playerId, tile.groupId);
    if (!levels.length) return false;
    return tile.houseLevel === Math.min(...levels);
  }

  function canSellEvenlyFromTile(state, tile, playerId) {
    const levels = getGroupHouseLevels(state, playerId, tile.groupId);
    if (!levels.length) return false;
    return tile.houseLevel === Math.max(...levels);
  }

  function canBuildOnTile(state, tileId, playerId) {
    const tile = getTile(state, tileId);
    const player = getPlayer(state, playerId);
    if (!tile || tile.type !== "property" || tile.ownerId !== playerId) return false;
    if (tile.isMortgaged || tile.houseLevel >= getLandmarkLevel(state)) return false;
    if (!hasDistrictControl(state, playerId, tile.groupId)) return false;
    if (hasGroupMortgage(state, playerId, tile.groupId)) return false;
    if (!canBuildEvenlyOnTile(state, tile, playerId)) return false;
    if (!hasBankStockForBuild(state, tile)) return false;
    const cost = getBuildCost(state, tileId, playerId);
    return player.cash >= cost;
  }

  function getBuildCost(state, tileId, playerId) {
    const tile = getTile(state, tileId);
    const player = getPlayer(state, playerId);
    const discount = player && player.buildDiscount ? player.buildDiscount : 1;
    return Math.max(1, Math.floor(getRawBuildCost(tile, getNextBuildCostLevel(state, tile)) * discount));
  }

  function getNextBuildCostLevel(state, tile) {
    if (!tile || tile.type !== "property") return 0;
    return tile.houseLevel >= getHouseRequirementForLandmark(state) ? 4 : tile.houseLevel;
  }

  function getSoldBuildCostLevel(state, tile) {
    if (!tile || tile.type !== "property") return 0;
    return isLandmarkLevel(state, tile) ? 4 : tile.houseLevel - 1;
  }

  function getBuildCostLevelsForTile(state, tile) {
    if (!tile || tile.type !== "property" || tile.houseLevel <= 0) return [];
    const houseCount = Math.min(tile.houseLevel, getHouseRequirementForLandmark(state));
    const levels = Array.from({ length: houseCount }, (_, index) => index);
    if (isLandmarkLevel(state, tile)) levels.push(4);
    return levels;
  }

  function getRawBuildCost(tile, level) {
    if (!tile || tile.type !== "property") return 0;
    const safeLevel = Math.max(0, Math.min(level, 4));
    if (Array.isArray(tile.buildCosts) && tile.buildCosts[safeLevel]) return tile.buildCosts[safeLevel];
    return Math.max(1, Math.floor(tile.buildCost * BUILD_COST_STEPS[safeLevel]));
  }

  function buildHouse(state, tileId, playerId) {
    if (!canBuildOnTile(state, tileId, playerId)) return false;
    const tile = getTile(state, tileId);
    const player = getPlayer(state, playerId);
    const cost = getBuildCost(state, tileId, playerId);
    player.cash -= cost;
    player.buildDiscount = 0;
    tile.houseLevel += 1;
    player.stats.housesBuilt += 1;
    log(state, `${player.name} 在 ${tile.name} 建设${isLandmarkLevel(state, tile) ? "地标建筑" : "房屋"}，支付 ${cost}。`);
    return checkDebt(state, playerId);
  }

  function canSellHouse(state, tileId, playerId) {
    const tile = getTile(state, tileId);
    if (!tile || tile.type !== "property" || tile.ownerId !== playerId || tile.houseLevel <= 0) return false;
    if (!hasBankStockForSell(state, tile)) return false;
    return canSellEvenlyFromTile(state, tile, playerId);
  }

  function sellHouse(state, tileId, playerId) {
    if (!canSellHouse(state, tileId, playerId)) return false;
    const tile = getTile(state, tileId);
    const player = getPlayer(state, playerId);
    const soldLandmark = isLandmarkLevel(state, tile);
    const refund = Math.floor(getRawBuildCost(tile, getSoldBuildCostLevel(state, tile)) * 0.5);
    tile.houseLevel -= 1;
    player.cash += refund;
    log(state, `${player.name} 卖出 ${tile.name} 的${soldLandmark ? "地标建筑" : "一层建筑"}，回收 ${refund} 金币。`);
    if (state.phase === "debt" && player.cash >= 0) state.phase = "management";
    return true;
  }

  function canMortgageProperty(state, tileId, playerId) {
    const tile = getTile(state, tileId);
    if (!isPurchasableTile(tile) || tile.ownerId !== playerId) return false;
    if (tile.type !== "property") return !tile.isMortgaged;
    return !tile.isMortgaged && tile.houseLevel === 0 && !hasGroupBuildings(state, playerId, tile.groupId);
  }

  function mortgageProperty(state, tileId, playerId, silent) {
    if (!canMortgageProperty(state, tileId, playerId)) return false;
    const tile = getTile(state, tileId);
    const player = getPlayer(state, playerId);
    const amount = Math.floor(tile.price * 0.5);
    tile.isMortgaged = true;
    player.cash += amount;
    if (!silent) log(state, `${player.name} 抵押 ${tile.name}，获得 ${amount} 金币。`);
    if (silent) log(state, `${player.name} 抵押 ${tile.name}。`);
    if (state.phase === "debt" && player.cash >= 0) state.phase = "management";
    return true;
  }

  function canRedeemProperty(state, tileId, playerId) {
    const tile = getTile(state, tileId);
    const player = getPlayer(state, playerId);
    if (!isPurchasableTile(tile) || tile.ownerId !== playerId || !tile.isMortgaged) return false;
    return player.cash >= getRedeemCost(tile);
  }

  function redeemProperty(state, tileId, playerId) {
    if (!canRedeemProperty(state, tileId, playerId)) return false;
    const tile = getTile(state, tileId);
    const player = getPlayer(state, playerId);
    const cost = getRedeemCost(tile);
    player.cash -= cost;
    tile.isMortgaged = false;
    log(state, `${player.name} 赎回 ${tile.name}，支付 ${cost} 金币。`);
    return true;
  }

  function getRedeemCost(tile) {
    return Math.ceil(tile.price * 0.55);
  }

  function getMortgageValue(tile) {
    return Math.floor(tile.price * 0.5);
  }

  function getMortgageTransferFee(tile) {
    return Math.ceil(getMortgageValue(tile) * 0.1);
  }

  function normalizeTradeMortgageOption(option) {
    return option === "redeem" ? "redeem" : "keep";
  }

  function getTradeMortgageCost(tile, option) {
    if (!tile || !tile.isMortgaged) return 0;
    return normalizeTradeMortgageOption(option) === "redeem" ? getRedeemCost(tile) : getMortgageTransferFee(tile);
  }

  function canTradeProperty(state, tileId, fromPlayerId, toPlayerId, price, mortgageOption = "keep") {
    const tile = getTile(state, tileId);
    const seller = getPlayer(state, fromPlayerId);
    const buyer = getPlayer(state, toPlayerId);
    const amount = Math.floor(Number(price) || 0);
    if (state.status !== "playing") return false;
    if (!isPurchasableTile(tile) || tile.ownerId !== fromPlayerId) return false;
    if (!seller || !buyer || fromPlayerId === toPlayerId) return false;
    if (amount < 0) return false;
    if (tile.type === "property" && hasGroupBuildings(state, fromPlayerId, tile.groupId)) return false;
    return buyer.cash >= amount + getTradeMortgageCost(tile, mortgageOption);
  }

  function tradeProperty(state, tileId, fromPlayerId, toPlayerId, price, mortgageOption = "keep") {
    if (!canTradeProperty(state, tileId, fromPlayerId, toPlayerId, price, mortgageOption)) return false;
    const tile = getTile(state, tileId);
    const seller = getPlayer(state, fromPlayerId);
    const buyer = getPlayer(state, toPlayerId);
    const amount = Math.floor(Number(price) || 0);
    const option = normalizeTradeMortgageOption(mortgageOption);

    buyer.cash -= amount;
    seller.cash += amount;
    tile.ownerId = toPlayerId;

    if (tile.isMortgaged) {
      const mortgageCost = getTradeMortgageCost(tile, option);
      buyer.cash -= mortgageCost;
      if (option === "redeem") {
        tile.isMortgaged = false;
        log(state, `${buyer.name} 交易取得 ${tile.name}，并立刻支付 ${mortgageCost} 金币赎回抵押。`);
      } else {
        log(state, `${buyer.name} 交易取得抵押中的 ${tile.name}，向银行支付 ${mortgageCost} 金币手续费。`);
      }
    }

    log(state, `${seller.name} 将 ${tile.name} 以 ${amount} 金币交易给 ${buyer.name}。`);
    if (state.phase === "debt" && seller.cash >= 0) state.phase = "management";
    return true;
  }

  function normalizeTradeProposal(proposal = {}) {
    const normalizeTileId = (value) => {
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      return Number.isInteger(number) ? number : null;
    };
    const normalizeCash = (value) => Math.max(0, Math.floor(Number(value) || 0));
    return {
      fromPlayerId: String(proposal.fromPlayerId || ""),
      toPlayerId: String(proposal.toPlayerId || ""),
      offeredTileId: normalizeTileId(proposal.offeredTileId),
      requestedTileId: normalizeTileId(proposal.requestedTileId),
      offeredCash: normalizeCash(proposal.offeredCash),
      requestedCash: normalizeCash(proposal.requestedCash)
    };
  }

  function isTradeableTileForOwner(state, tileId, ownerId) {
    if (tileId === null) return true;
    const tile = getTile(state, tileId);
    if (!isPurchasableTile(tile) || tile.ownerId !== ownerId) return false;
    if (tile.type === "property" && hasGroupBuildings(state, ownerId, tile.groupId)) return false;
    return true;
  }

  function canExecuteTrade(state, proposal) {
    const trade = normalizeTradeProposal(proposal);
    const from = getPlayer(state, trade.fromPlayerId);
    const to = getPlayer(state, trade.toPlayerId);
    if (!state || state.status !== "playing" || !isPlayerActive(from) || !isPlayerActive(to)) return false;
    if (from.id === to.id) return false;
    if (
      trade.offeredTileId === null &&
      trade.requestedTileId === null &&
      trade.offeredCash === 0 &&
      trade.requestedCash === 0
    ) return false;
    if (trade.offeredTileId !== null && trade.offeredTileId === trade.requestedTileId) return false;
    if (!isTradeableTileForOwner(state, trade.offeredTileId, from.id)) return false;
    if (!isTradeableTileForOwner(state, trade.requestedTileId, to.id)) return false;

    const offeredTile = trade.offeredTileId === null ? null : getTile(state, trade.offeredTileId);
    const requestedTile = trade.requestedTileId === null ? null : getTile(state, trade.requestedTileId);
    const fromMortgageFee = requestedTile && requestedTile.isMortgaged ? getMortgageTransferFee(requestedTile) : 0;
    const toMortgageFee = offeredTile && offeredTile.isMortgaged ? getMortgageTransferFee(offeredTile) : 0;
    const fromFinalCash = from.cash - trade.offeredCash + trade.requestedCash - fromMortgageFee;
    const toFinalCash = to.cash - trade.requestedCash + trade.offeredCash - toMortgageFee;
    return fromFinalCash >= 0 && toFinalCash >= 0;
  }

  function getTradeAcceptanceMargin(player) {
    const profileId = String(player && player.profileId || "");
    if (["aggressive", "red"].includes(profileId)) return -0.04;
    if (["conservative", "stone"].includes(profileId)) return 0.12;
    if (["opportunist", "weaver"].includes(profileId)) return 0.03;
    return 0.06;
  }

  function evaluateTradeProposal(state, proposal) {
    const trade = normalizeTradeProposal(proposal);
    if (!canExecuteTrade(state, trade)) {
      return { accepted: false, score: -Infinity, reason: "报价无效、资产不可交易或结算后现金不足。" };
    }
    const recipient = getPlayer(state, trade.toPlayerId);
    const offeredTile = trade.offeredTileId === null ? null : getTile(state, trade.offeredTileId);
    const requestedTile = trade.requestedTileId === null ? null : getTile(state, trade.requestedTileId);
    const incomingPropertyValue = offeredTile ? estimatePropertyValue(state, recipient.id, offeredTile.id) : 0;
    const outgoingPropertyValue = requestedTile ? estimatePropertyValue(state, recipient.id, requestedTile.id) : 0;
    const incomingMortgageFee = offeredTile && offeredTile.isMortgaged ? getMortgageTransferFee(offeredTile) : 0;
    const incomingValue = trade.offeredCash + incomingPropertyValue - incomingMortgageFee;
    const outgoingValue = trade.requestedCash + outgoingPropertyValue;
    const requiredValue = outgoingValue * (1 + getTradeAcceptanceMargin(recipient));
    const score = Math.floor(incomingValue - requiredValue);
    const accepted = incomingValue > 0 && score >= 0;
    const reason = accepted
      ? `${recipient.name}认为收到的价值足以覆盖让出的资产。`
      : `${recipient.name}认为报价还差约 ${Math.max(1, Math.ceil(-score))} 金币价值。`;
    return { accepted, score, reason, incomingValue: Math.floor(incomingValue), outgoingValue: Math.floor(outgoingValue) };
  }

  function executeTrade(state, proposal) {
    const trade = normalizeTradeProposal(proposal);
    if (!canExecuteTrade(state, trade)) return false;
    const from = getPlayer(state, trade.fromPlayerId);
    const to = getPlayer(state, trade.toPlayerId);
    const offeredTile = trade.offeredTileId === null ? null : getTile(state, trade.offeredTileId);
    const requestedTile = trade.requestedTileId === null ? null : getTile(state, trade.requestedTileId);
    const fromMortgageFee = requestedTile && requestedTile.isMortgaged ? getMortgageTransferFee(requestedTile) : 0;
    const toMortgageFee = offeredTile && offeredTile.isMortgaged ? getMortgageTransferFee(offeredTile) : 0;

    from.cash = from.cash - trade.offeredCash + trade.requestedCash - fromMortgageFee;
    to.cash = to.cash - trade.requestedCash + trade.offeredCash - toMortgageFee;
    if (offeredTile) offeredTile.ownerId = to.id;
    if (requestedTile) requestedTile.ownerId = from.id;

    const fromParts = [offeredTile && offeredTile.name, trade.offeredCash > 0 && `${trade.offeredCash} 金币`].filter(Boolean);
    const toParts = [requestedTile && requestedTile.name, trade.requestedCash > 0 && `${trade.requestedCash} 金币`].filter(Boolean);
    log(state, `${from.name} 与 ${to.name} 完成交易：${fromParts.join(" + ") || "无"} ⇄ ${toParts.join(" + ") || "无"}。`);
    if (fromMortgageFee > 0) log(state, `${from.name} 为接手抵押地产支付 ${fromMortgageFee} 金币手续费。`);
    if (toMortgageFee > 0) log(state, `${to.name} 为接手抵押地产支付 ${toMortgageFee} 金币手续费。`);
    if (state.phase === "debt" && from.cash >= 0) state.phase = "management";
    return true;
  }

  function getAiTradeOffer(state, tileId, fromPlayerId = "player", mortgageOption = "keep") {
    const tile = getTile(state, tileId);
    const seller = getPlayer(state, fromPlayerId);
    const ai = getPlayer(state, "ai");
    if (!seller || !ai || !isPurchasableTile(tile) || tile.ownerId !== fromPlayerId) return 0;
    if (fromPlayerId === "ai") return 0;
    if (tile.type === "property" && hasGroupBuildings(state, fromPlayerId, tile.groupId)) return 0;

    const mortgageCost = getTradeMortgageCost(tile, mortgageOption);
    const reserve = getAiSafetyLine(state);
    const maxAffordable = Math.max(0, ai.cash - reserve - mortgageCost);
    if (maxAffordable <= 0) return 0;

    const valuation = estimatePropertyValue(state, "ai", tileId);
    const mortgageDiscount = tile.isMortgaged ? getMortgageValue(tile) * 0.45 : 0;
    const fairOffer = Math.max(0, Math.floor(valuation * 0.74 - mortgageDiscount));
    const offer = Math.floor(Math.min(maxAffordable, fairOffer, tile.price * 0.95));
    return canTradeProperty(state, tileId, fromPlayerId, "ai", offer, mortgageOption) ? offer : 0;
  }

  function sellPropertyToAi(state, tileId, mortgageOption = "keep") {
    const offer = getAiTradeOffer(state, tileId, "player", mortgageOption);
    if (offer <= 0) return false;
    return tradeProperty(state, tileId, "player", "ai", offer, mortgageOption);
  }

  function canTradeControlPass(state, fromPlayerId, toPlayerId, price) {
    const seller = getPlayer(state, fromPlayerId);
    const buyer = getPlayer(state, toPlayerId);
    const amount = Math.floor(Number(price) || 0);
    if (state.status !== "playing") return false;
    if (!seller || !buyer || fromPlayerId === toPlayerId) return false;
    if (amount < 0) return false;
    if (getControlPassCount(seller) <= 0) return false;
    return buyer.cash >= amount;
  }

  function tradeControlPass(state, fromPlayerId, toPlayerId, price) {
    if (!canTradeControlPass(state, fromPlayerId, toPlayerId, price)) return false;
    const seller = getPlayer(state, fromPlayerId);
    const buyer = getPlayer(state, toPlayerId);
    const amount = Math.floor(Number(price) || 0);
    const pass = getControlPassCards(seller).shift();

    buyer.cash -= amount;
    seller.cash += amount;
    getControlPassCards(buyer).push(pass);
    log(state, `${seller.name} 将交通管制通行证以 ${amount} 金币交易给 ${buyer.name}。`);
    if (state.phase === "debt" && seller.cash >= 0) state.phase = "management";
    return true;
  }

  function getAiControlPassOffer(state, fromPlayerId = "player") {
    const seller = getPlayer(state, fromPlayerId);
    const ai = getPlayer(state, "ai");
    if (!seller || !ai || fromPlayerId === "ai" || getControlPassCount(seller) <= 0) return 0;

    const maxAffordable = Math.max(0, ai.cash - getAiSafetyLine(state));
    const fairOffer = Math.floor(CONTROL_RELEASE_FEE * 0.9);
    const offer = Math.floor(Math.min(maxAffordable, fairOffer));
    return canTradeControlPass(state, fromPlayerId, "ai", offer) ? offer : 0;
  }

  function sellControlPassToAi(state) {
    const offer = getAiControlPassOffer(state, "player");
    if (offer <= 0) return false;
    return tradeControlPass(state, "player", "ai", offer);
  }

  function checkDebt(state, playerId, options = {}) {
    const player = getPlayer(state, playerId);
    if (player.cash >= 0 || state.status !== "playing") return state;
    const creditorId = options.creditorId || null;
    const creditedAmount = Math.max(0, options.creditedAmount || 0);
    if (canLiquidate(state, playerId)) {
      state.phase = "debt";
      state.pending = { type: "debt", playerId, creditorId, creditedAmount };
      log(state, `${player.name} 现金不足，需要卖房或抵押。`);
      if (playerId === "player" && !state.tutorial.debt) {
        log(state, "提示：卖房或抵押地块可以偿还欠款。");
        state.tutorial.debt = true;
      }
      return state;
    }
    return bankrupt(state, playerId, "无法偿还债务", creditorId, creditedAmount);
  }

  function canLiquidate(state, playerId) {
    return getOwnedProperties(state, playerId).some(
      (tile) => canSellHouse(state, tile.id, playerId) || canMortgageProperty(state, tile.id, playerId)
    );
  }

  function autoResolveDebt(state, playerId) {
    const player = getPlayer(state, playerId);
    const pendingDebt =
      state.pending && state.pending.type === "debt" && state.pending.playerId === playerId ? state.pending : {};
    const creditorId = pendingDebt.creditorId || null;
    const creditedAmount = Math.max(0, pendingDebt.creditedAmount || 0);
    let guard = 0;
    while (player.cash < 0 && canLiquidate(state, playerId) && guard < 80) {
      guard += 1;
      const houseTile = getOwnedProperties(state, playerId)
        .filter((tile) => canSellHouse(state, tile.id, playerId))
        .sort((a, b) => b.houseLevel - a.houseLevel || a.price - b.price)[0];
      if (houseTile) {
        sellHouse(state, houseTile.id, playerId);
        continue;
      }
      const mortgageTile = getCheapestMortgageCandidate(state, playerId);
      if (mortgageTile) {
        mortgageProperty(state, mortgageTile.id, playerId);
        continue;
      }
      break;
    }
    if (player.cash < 0) bankrupt(state, playerId, "无法偿还债务", creditorId, creditedAmount);
    else state.phase = "management";
    return state;
  }

  function getCheapestMortgageCandidate(state, playerId) {
    return getOwnedProperties(state, playerId)
      .filter((tile) => canMortgageProperty(state, tile.id, playerId))
      .sort((a, b) => estimatePropertyValue(state, playerId, a.id) - estimatePropertyValue(state, playerId, b.id))[0];
  }

  function aiManageAssets(state) {
    return autoManageAssets(state, "ai");
  }

  function autoManageAssets(state, playerId) {
    const player = getPlayer(state, playerId);
    const reserve = playerId === "ai" ? 220 : 180;
    const redeemCandidate = getOwnedProperties(state, playerId)
      .filter((tile) => tile.isMortgaged && player.cash - getRedeemCost(tile) > reserve + 120)
      .sort((a, b) => estimatePropertyValue(state, playerId, b.id) - estimatePropertyValue(state, playerId, a.id))[0];
    if (redeemCandidate) redeemProperty(state, redeemCandidate.id, playerId);

    let built = false;
    const candidates = getOwnedProperties(state, playerId)
      .filter((tile) => canBuildOnTile(state, tile.id, playerId))
      .sort((a, b) => getBuildValueScore(state, b) - getBuildValueScore(state, a));

    for (const tile of candidates) {
      const cost = getBuildCost(state, tile.id, playerId);
      if (player.cash - cost >= reserve) {
        buildHouse(state, tile.id, playerId);
        built = true;
        break;
      }
    }

    if (built && playerId === "ai") log(state, "AI 解释：该地块升级后的租金增量较高，且仍保留安全现金，因此建房提高租金。");
    return state;
  }

  function getBuildValueScore(state, tile) {
    if (!tile || tile.type !== "property" || tile.houseLevel >= getLandmarkLevel(state)) return -Infinity;
    const nextCost = getRawBuildCost(tile, getNextBuildCostLevel(state, tile));
    const nextLevel = tile.houseLevel + 1 >= getLandmarkLevel(state) ? STANDARD_LANDMARK_LEVEL : tile.houseLevel + 1;
    const rentGain = getRentAtLevel(tile, nextLevel) - getRentAtLevel(tile, getEffectiveRentLevel(state, tile));
    const groupBonus = GROUPS[tile.groupId].tier * 0.015;
    return rentGain / Math.max(1, nextCost) + groupBonus;
  }

  function endTurn(state) {
    if (state.status !== "playing") return state;
    const player = getActivePlayer(state);
    if (!player) return state;
    if (player.cash < 0) {
      return checkDebt(state, player.id);
    }

    state.pending = null;
    if (player.extraRoll) {
      player.extraRoll = false;
      state.phase = "ready";
      log(state, `${player.name} 掷出对子，获得额外行动。`);
      return startTurn(state);
    }

    player.consecutiveDoubles = 0;
    advanceTurn(state);
    state.maxRounds = normalizeMaxRounds(state.maxRounds);
    if (state.endCondition !== HUMAN_SURVIVAL_END_CONDITION && state.roundNumber > state.maxRounds) {
      return finishByNetWorth(state);
    }
    return startTurn(state);
  }

  function compareStandingMetrics(a, b) {
    return (
      b.netWorth - a.netWorth ||
      b.cash - a.cash ||
      b.rentCollected - a.rentCollected ||
      b.propertyCount - a.propertyCount
    );
  }

  function buildStandings(state) {
    const order = getNormalizedTurnOrder(state);
    return order
      .map((playerId) => getPlayer(state, playerId))
      .filter(Boolean)
      .map((player) => ({
        playerId: player.id,
        name: player.name,
        controller: player.controller || player.type || "ai",
        profileId: player.profileId || player.id,
        status: player.status || "active",
        eliminatedAtRound: player.eliminatedAtRound ?? null,
        netWorth: getNetWorth(state, player.id),
        cash: player.cash,
        rentCollected: player.stats && Number.isFinite(player.stats.rentCollected) ? player.stats.rentCollected : 0,
        propertyCount: getOwnedProperties(state, player.id).length
      }))
      .sort((a, b) => {
        const aActive = a.status !== "eliminated";
        const bActive = b.status !== "eliminated";
        if (aActive !== bActive) return aActive ? -1 : 1;
        if (!aActive && a.eliminatedAtRound !== b.eliminatedAtRound) {
          return (b.eliminatedAtRound || 0) - (a.eliminatedAtRound || 0);
        }
        return compareStandingMetrics(a, b) || order.indexOf(a.playerId) - order.indexOf(b.playerId);
      })
      .map((standing, index) => ({ ...standing, rank: index + 1 }));
  }

  function getCompatibilityWorth(state, playerId, controller) {
    const exactPlayer = getPlayer(state, playerId);
    const fallbackPlayer = exactPlayer || state.players.find((player) => (player.controller || player.type) === controller);
    return fallbackPlayer ? getNetWorth(state, fallbackPlayer.id) : 0;
  }

  function finishByNetWorth(state) {
    state.maxRounds = normalizeMaxRounds(state.maxRounds);
    const standings = buildStandings(state);
    const first = standings[0] || null;
    const second = standings[1] || null;
    const winnerId = first && (!second || compareStandingMetrics(first, second) !== 0) ? first.playerId : null;
    const playerWorth = getCompatibilityWorth(state, "player", "human");
    const aiWorth = getCompatibilityWorth(state, "ai", "ai");

    state.status = "game-over";
    state.phase = "game-over";
    state.result = {
      reason: `达到 ${state.maxRounds} 轮，按净资产结算`,
      winnerId,
      playerWorth,
      aiWorth,
      standings
    };
    log(state, winnerId ? `${getPlayer(state, winnerId).name} 净资产更高，赢得对局。` : "净资产完全相同，本局平局。");
    return state;
  }

  function returnControlPassToDeck(state, pass) {
    if (!pass || !pass.cardId) return false;
    const config = getDeckConfig(state, pass.deck || "chance");
    if (!Array.isArray(state[config.discardKey])) state[config.discardKey] = [];
    state[config.discardKey].push(pass.cardId);
    return true;
  }

  function settleBankruptcyAssets(state, loserId, creditorId, creditedAmount, returnAssetsToBank = false) {
    const loser = getPlayer(state, loserId);
    const creditor = creditorId ? getPlayer(state, creditorId) : null;
    const assetCreditor = returnAssetsToBank ? null : creditor;
    const ownedTiles = getOwnedProperties(state, loserId);
    const passes = getControlPassCards(loser).splice(0);
    const settlement = {
      creditorId: assetCreditor ? assetCreditor.id : null,
      transferredTiles: 0,
      returnedTiles: 0,
      transferredPasses: 0,
      returnedPasses: 0,
      mortgageTransferFees: 0
    };

    const unpaidDeficit = Math.max(0, -loser.cash);
    const creditedCorrection = creditor ? Math.min(unpaidDeficit, Math.max(0, creditedAmount || 0)) : 0;
    if (creditedCorrection > 0) creditor.cash -= creditedCorrection;

    if (assetCreditor) {
      if (loser.cash > 0) assetCreditor.cash += loser.cash;
      loser.cash = 0;

      ownedTiles.forEach((tile) => {
        tile.ownerId = assetCreditor.id;
        settlement.transferredTiles += 1;
        if (tile.isMortgaged) settlement.mortgageTransferFees += getMortgageTransferFee(tile);
      });

      if (settlement.mortgageTransferFees > 0) {
        assetCreditor.cash -= settlement.mortgageTransferFees;
        log(state, `${assetCreditor.name} 接收抵押地契，向银行支付 ${settlement.mortgageTransferFees} 金币手续费。`);
      }

      if (passes.length) {
        getControlPassCards(assetCreditor).push(...passes);
        settlement.transferredPasses = passes.length;
      }

      if (settlement.transferredTiles || settlement.transferredPasses) {
        log(state, `${loser.name} 的剩余资产转给 ${assetCreditor.name}。`);
      }
      return settlement;
    }

    ownedTiles.forEach((tile) => {
      tile.ownerId = null;
      tile.houseLevel = 0;
      tile.isMortgaged = false;
      settlement.returnedTiles += 1;
    });

    passes.forEach((pass) => {
      if (returnControlPassToDeck(state, pass)) settlement.returnedPasses += 1;
    });
    loser.cash = 0;

    if (settlement.returnedTiles || settlement.returnedPasses) {
      log(state, `${loser.name} 的资产交还银行，抵押取消，通行证回到牌堆。`);
    }
    return settlement;
  }

  function bankrupt(state, loserId, reason, creditorId = null, creditedAmount = 0) {
    const loser = getPlayer(state, loserId);
    if (!loser || loser.status === "eliminated") return state;
    const survivalMode = state.endCondition === HUMAN_SURVIVAL_END_CONDITION;
    const loserIsHuman = loser.controller === "human" || loser.type === "human";
    const settlement = settleBankruptcyAssets(
      state,
      loserId,
      creditorId,
      creditedAmount,
      survivalMode && loserIsHuman
    );
    loser.status = "eliminated";
    loser.eliminatedAtRound = state.roundNumber;
    loser.extraRoll = false;
    loser.consecutiveDoubles = 0;
    state.pending = null;
    const activePlayers = getActivePlayers(state);

    if (survivalMode) {
      const activeHuman = activePlayers.find((player) => player.controller === "human" || player.type === "human") || null;
      const activeAgents = activePlayers.filter((player) => player.controller !== "human" && player.type !== "human");
      const triggeringCreditor = creditorId ? getPlayer(state, creditorId) : null;
      const winner = loserIsHuman
        ? (triggeringCreditor && activeAgents.some((player) => player.id === triggeringCreditor.id)
            ? triggeringCreditor
            : activeAgents.slice().sort((a, b) => getNetWorth(state, b.id) - getNetWorth(state, a.id))[0] || null)
        : activeAgents.length === 0
          ? activeHuman
          : null;

      if (loserIsHuman || activeAgents.length === 0) {
        state.status = "game-over";
        state.phase = "game-over";
        state.result = {
          reason: loserIsHuman
            ? `${loser.name}${reason}并破产，名下财产已全部归还银行。`
            : "所有 Agent 均已破产，玩家获胜。",
          winnerId: winner ? winner.id : null,
          bankruptcyCreditorId: creditorId,
          bankruptcyAssetSettlement: settlement,
          playerWorth: getCompatibilityWorth(state, "player", "human"),
          aiWorth: getCompatibilityWorth(state, "ai", "ai"),
          standings: buildStandings(state)
        };
        log(
          state,
          loserIsHuman
            ? `${loser.name} 破产，财产全部归还银行，Agent 阵营获胜。`
            : `${loser.name} 破产，所有 Agent 均已淘汰，${winner ? winner.name : "玩家"} 获胜。`
        );
        return state;
      }
    }

    if (!survivalMode && activePlayers.length <= 1) {
      const winner = activePlayers[0] || null;
      state.status = "game-over";
      state.phase = "game-over";
      state.result = {
        reason: `${loser.name}${reason}`,
        winnerId: winner ? winner.id : null,
        bankruptcyCreditorId: settlement.creditorId,
        bankruptcyAssetSettlement: settlement,
        playerWorth: getCompatibilityWorth(state, "player", "human"),
        aiWorth: getCompatibilityWorth(state, "ai", "ai"),
        standings: buildStandings(state)
      };
      log(state, winner ? `${loser.name} 破产，${winner.name} 获胜。` : `${loser.name} 破产，对局结束。`);
      return state;
    }

    log(state, `${loser.name} 破产并被淘汰，对局继续。`);
    if (state.activePlayerId === loserId) {
      advanceTurn(state);
      state.maxRounds = normalizeMaxRounds(state.maxRounds);
      if (!survivalMode && state.roundNumber > state.maxRounds) return finishByNetWorth(state);
      return startTurn(state);
    }
    state.phase = "management";
    return state;
  }

  function getNetWorth(state, playerId) {
    const player = getPlayer(state, playerId);
    if (!player) return 0;
    return Math.floor(
      player.cash +
        getOwnedProperties(state, playerId).reduce((sum, tile) => {
          if (tile.isMortgaged) return sum;
          const buildingWorth = getBuildCostLevelsForTile(state, tile).reduce(
            (subtotal, level) => subtotal + Math.floor(getRawBuildCost(tile, level) * 0.5),
            0
          );
          return sum + tile.price + buildingWorth;
        }, 0)
    );
  }

  function pickBestOwnedGroup(state, playerId) {
    const completed = Object.keys(GROUPS)
      .map((groupId) => ({
        groupId,
        tiles: getGroupTiles(state, groupId).filter((tile) => tile.ownerId === playerId)
      }))
      .filter((item) => item.tiles.length > 0)
      .sort((a, b) => {
        const aScore = a.tiles.reduce((sum, tile) => sum + calculateRent(state, tile.id), 0);
        const bScore = b.tiles.reduce((sum, tile) => sum + calculateRent(state, tile.id), 0);
        return bScore - aScore;
      });
    return completed[0] ? completed[0].groupId : null;
  }

  function serialize(state) {
    return JSON.stringify(state);
  }

  function hydrate(serialized) {
    const state = typeof serialized === "string" ? JSON.parse(serialized) : serialized;
    if (!state || !state.version || !Array.isArray(state.players) || !Array.isArray(state.tiles)) {
      throw new Error("Invalid saved game");
    }

    state.players.forEach((player) => {
      player.controller = player.controller === "human" || player.type === "human" ? "human" : "ai";
      player.type = player.type || player.controller;
      player.profileId = String(player.profileId || (player.controller === "human" ? "human" : player.id));
      player.status = player.status === "eliminated" ? "eliminated" : "active";
      player.eliminatedAtRound = player.status === "eliminated"
        ? (Number.isFinite(player.eliminatedAtRound) ? player.eliminatedAtRound : state.roundNumber || null)
        : null;
    });

    state.version = GAME_VERSION;
    state.maxRounds = normalizeMaxRounds(state.maxRounds);
    state.endCondition = normalizeEndCondition(state.endCondition);
    state.turnOrder = getNormalizedTurnOrder(state);
    const activePlayers = getActivePlayers(state);
    let activePlayer = getPlayer(state, state.activePlayerId);
    if (!isPlayerActive(activePlayer)) activePlayer = activePlayers[0] || null;
    if (activePlayer) state.activePlayerId = activePlayer.id;
    state.activeTurnIndex = activePlayer ? state.turnOrder.indexOf(activePlayer.id) : -1;

    if (state.pending && state.pending.type === "auction") {
      state.pending.participants = getAuctionParticipants(state, state.pending);
      if (!state.pending.participants.includes(state.pending.activeBidderId)) {
        const passedIds = getAuctionPassedIds(state.pending);
        state.pending.activeBidderId = state.pending.participants.find(
          (playerId) => playerId !== state.pending.highBidderId && !passedIds.includes(playerId)
        ) || state.pending.highBidderId || state.pending.participants[0] || null;
      }
    }
    return state;
  }

  return {
    GAME_VERSION,
    STARTING_CASH,
    PASS_START_REWARD,
    MAX_ROUNDS,
    STANDARD_RULESET,
    SHORT_RULESET,
    ROUND_LIMIT_END_CONDITION,
    HUMAN_SURVIVAL_END_CONDITION,
    SHORT_INITIAL_DEEDS,
    STANDARD_LANDMARK_LEVEL,
    SHORT_LANDMARK_LEVEL,
    CONTROL_ZONE_INDEX,
    CONTROL_RELEASE_FEE,
    MAX_CONTROL_ATTEMPTS,
    BANK_HOUSE_LIMIT,
    BANK_LANDMARK_LIMIT,
    RENT_MULTIPLIERS,
    RENT_SPIKE_LEVELS,
    STATION_RENTS,
    UTILITY_RENT_MULTIPLIERS,
    INCOME_TAX_FIXED_AMOUNT,
    INCOME_TAX_RATE,
    AUCTION_START_BID,
    AUCTION_MIN_INCREMENT,
    GROUPS,
    BOARD_TEMPLATE,
    EVENT_CARDS,
    CHANCE_CARDS,
    createGame,
    hydrate,
    serialize,
    isShortGame,
    getLandmarkLevel,
    getHouseRequirementForLandmark,
    getPlayer,
    getOpponent,
    getActivePlayer,
    getActivePlayers,
    getNextPlayerId,
    advanceTurn,
    getControlPassCount,
    getBuildingStock,
    getOwnedBuildingCounts,
    isPurchasableTile,
    getTile,
    getCardById,
    getOwnedProperties,
    getGroupTiles,
    hasDistrictControl,
    getNetWorth,
    calculateRent,
    getRentAtLevel,
    isRentSpikeLevel,
    canBuildOnTile,
    getBuildCost,
    canSellHouse,
    canMortgageProperty,
    canRedeemProperty,
    getRedeemCost,
    getMortgageTransferFee,
    canTradeProperty,
    tradeProperty,
    normalizeTradeProposal,
    canExecuteTrade,
    evaluateTradeProposal,
    executeTrade,
    getAiTradeOffer,
    sellPropertyToAi,
    canTradeControlPass,
    tradeControlPass,
    getAiControlPassOffer,
    sellControlPassToAi,
    rollActivePlayer,
    sendToControl,
    payControlFee,
    useControlPass,
    rollForControlRelease,
    settleCurrentTile,
    demandRent,
    waiveRent,
    buyProperty,
    startAuction,
    getAuctionMinimumBid,
    placeAuctionBid,
    passAuction,
    runAuction,
    aiHandleAuction,
    aiHandlePurchase,
    aiManageAssets,
    autoManageAssets,
    autoResolveDebt,
    resolveTaxChoice,
    resolveAiTaxChoice,
    resolveChoice,
    resolveAiChoice,
    buildHouse,
    sellHouse,
    mortgageProperty,
    redeemProperty,
    endTurn,
    startTurn,
    log,
    random
  };
});
