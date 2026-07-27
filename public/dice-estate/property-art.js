(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DiceEstatePropertyArt = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DISTRICTS = Object.freeze({
    old: district("old", "cobble-lane", "鹅卵石与青瓦", "巷口石阶", "#78965d"),
    market: district("market", "awning-pocket", "木板与布篷", "货箱摊位", "#d7a33d"),
    academy: district("academy", "arched-court", "浅石与蓝砖", "拱门矮墙", "#4e8fb8"),
    harbor: district("harbor", "pier-deck", "木栈道与海水", "系船柱", "#3f9d90"),
    garden: district("garden", "petal-island", "草坪与浅石", "花圃边缘", "#6f9d63"),
    arts: district("arts", "stage-cut", "深砖与霓虹", "画框切角", "#b879a8"),
    tech: district("tech", "hex-circuit", "玻璃与金属", "电路针脚", "#6f8ec9"),
    finance: district("finance", "diamond-plaza", "深石与黄铜", "阶梯灯带", "#c7684c"),
    riverside: district("riverside", "crescent-bank", "水磨石与河水", "弧形栏杆", "#4aa6a8"),
    medical: district("medical", "healing-cross", "白石与绿玻璃", "药草花床", "#4e9b83"),
    sports: district("sports", "track-arc", "红胶与看台", "跑道弧线", "#d9784d"),
    maker: district("maker", "gear-workbench", "钢板与木台", "机械齿缘", "#4f79ad"),
    eco: district("eco", "leaf-wetland", "木栈道与植被", "有机分叉", "#74a84f"),
    luxury: district("luxury", "cloud-crown", "白石与紫玻璃", "金边云台", "#8f5f9d")
  });

  const rows = [
    [1, "榕树巷", "rongshu-lane", "old", "跨巷榕树与垂落气根", "榕", 1.08, -3, -8, -2],
    [3, "石桥路", "shiqiao-road", "old", "单拱石桥与窄水渠", "桥", 0.98, 1, -2, 2],
    [4, "钟楼巷", "zhonglou-alley", "old", "瘦高钟楼与长钟摆窗", "钟", 1.08, 1, -10, 0],
    [7, "集市西街", "market-west-street", "market", "条纹布篷与水果木箱", "果", 1.0, -2, -3, -3],
    [8, "集市南街", "market-south-street", "market", "蒸笼小吃摊与升起白汽", "蒸", 1.02, 0, -5, 2],
    [10, "集市北街", "market-north-street", "market", "双层灯笼牌楼与香料袋", "灯", 1.05, 2, -7, 0],
    [13, "学院南路", "academy-south-road", "academy", "图书馆拱门与翻开石书", "书", 1.01, -1, -4, -1],
    [15, "学院广场", "academy-plaza", "academy", "放射广场与中央校钟", "院", 0.98, 0, -2, 0],
    [40, "学院东路", "academy-east-road", "academy", "天文穹顶与小望远镜", "星", 1.05, 2, -7, 2],
    [17, "港湾二路", "harbor-second-road", "harbor", "蓝白渔屋与救生圈", "渔", 1.0, -3, -4, -2],
    [18, "港湾码头", "harbor-dock", "harbor", "长栈桥、系船柱与小艇", "舟", 1.07, 2, -5, 2],
    [20, "仓储街", "warehouse-street", "harbor", "锯齿仓库与吊货钩", "仓", 1.02, 0, -6, 0],
    [21, "花园东路", "garden-east-road", "garden", "玫瑰拱门与修剪树篱", "玫", 1.01, -2, -5, -2],
    [22, "花园西路", "garden-west-road", "garden", "玻璃温室与盆栽架", "温", 1.04, 1, -6, 1],
    [24, "湖畔街", "lakeside-street", "garden", "天鹅喷泉与弧形湖岸", "鹅", 1.0, 1, -3, 2],
    [26, "剧场街", "theater-street", "arts", "红帷幕剧院与面具灯箱", "剧", 1.06, -1, -8, -1],
    [29, "展览大道", "exhibition-avenue", "arts", "悬浮画框装置与展台", "展", 1.0, 0, -4, 1],
    [42, "画廊街", "gallery-street", "arts", "锯齿天窗画廊与巨型调色盘", "画", 1.04, 2, -6, 2],
    [31, "科技东路", "tech-east-road", "tech", "玻璃实验室与机械臂", "械", 1.02, -2, -5, -1],
    [32, "科技西路", "tech-west-road", "tech", "数据塔与环形信号带", "数", 1.06, 1, -8, 1],
    [33, "芯片街", "chip-street", "tech", "巨型芯片核心与发光针脚", "芯", 1.04, 1, -5, 0],
    [37, "金融大道", "finance-avenue", "finance", "黄铜牛雕像与阶梯塔楼", "牛", 1.02, -2, -6, -2],
    [38, "证券街", "securities-street", "finance", "行情光柱与交易大厅", "券", 1.04, 0, -6, 1],
    [39, "中央塔街", "central-tower-street", "finance", "中央尖塔与环形时钟", "塔", 1.1, 1, -11, 0],
    [44, "河岸步道", "riverwalk", "riverside", "柳树步道与连续栏杆", "柳", 1.02, -3, -4, -2],
    [45, "渡口街", "ferry-street", "riverside", "有顶渡船与斜坡码头", "渡", 1.04, 1, -4, 2],
    [47, "观景堤", "scenic-embankment", "riverside", "半圆观景台与望远镜", "望", 1.0, 2, -5, 1],
    [48, "杏林路", "xinglin-road", "medical", "杏树诊疗小屋与绿色十字窗", "杏", 1.02, -2, -6, -2],
    [49, "康养街", "wellness-street", "medical", "温泉庭院与竹制躺椅", "泉", 0.99, 0, -3, 1],
    [51, "生命广场", "life-plaza", "medical", "双螺旋雕塑与环形花园", "生", 1.05, 1, -6, 0],
    [53, "竞速路", "sprint-road", "sports", "发卡弯赛道与计时门", "速", 1.0, -2, -3, -3],
    [54, "冠军街", "champions-street", "sports", "巨型奖杯与领奖台", "冠", 1.05, 0, -7, 0],
    [56, "体育新城", "sports-new-town", "sports", "椭圆体育馆与照明塔", "场", 1.05, 2, -6, 2],
    [57, "工坊巷", "workshop-lane", "maker", "木匠工坊、锯轮与工具墙", "锯", 1.0, -2, -4, -2],
    [58, "创客大道", "maker-avenue", "maker", "机器人工作台与悬挂灯", "创", 1.02, 0, -5, 1],
    [60, "智造港", "smart-manufacturing-harbor", "maker", "龙门吊、传送带与机械舱", "造", 1.07, 2, -7, 2],
    [62, "林荫街", "tree-lined-street", "eco", "树冠隧道与自行车亭", "林", 1.02, -3, -5, -2],
    [63, "湿地路", "wetland-road", "eco", "芦苇湿地、曲折栈道与白鹭", "鹭", 1.02, 0, -4, 1],
    [65, "零碳社区", "zero-carbon-community", "eco", "太阳能屋顶、风轮与共享花园", "碳", 1.06, 2, -7, 2],
    [67, "星河湾", "galaxy-bay", "luxury", "弯月水湾与星光游艇会所", "湾", 1.03, -2, -5, -2],
    [68, "云顶大道", "cloudtop-avenue", "luxury", "云间双塔与空中连桥", "云", 1.08, 0, -10, 1],
    [69, "天际宫", "sky-palace", "luxury", "皇冠宫殿尖顶与悬空云台", "宫", 1.13, 1, -13, 0]
  ];

  const FIXED_RUNTIME_TILE_ART_IDS = new Set([
    1, 3, 4,
    7, 8, 10,
    13, 15, 40,
    17, 18, 20,
    21, 22, 24,
    26, 29, 42,
    31, 32, 33,
    37, 38, 39,
    44, 45, 47,
    48, 49, 51,
    53, 54, 56,
    57, 58, 60,
    62, 63, 65,
    67, 68, 69
  ]);

  const PROPERTIES = Object.freeze(Object.fromEntries(rows.map((row) => {
    const [id, name, slug, districtId, landmark, glyph, scale, x, y, rotate] = row;
    return [id, Object.freeze({
      id,
      name,
      slug,
      district: districtId,
      landmark,
      glyph,
      asset: FIXED_RUNTIME_TILE_ART_IDS.has(id)
        ? `assets/districts/${districtId}/${slug}-tile.webp`
        : `assets/property-art/${districtId}/${slug}.webp`,
      scale,
      x,
      y,
      rotate
    })];
  })));

  function district(id, shape, material, edge, accent) {
    return Object.freeze({
      shape,
      material,
      edge,
      accent
    });
  }

  function get(tileId) {
    return PROPERTIES[Number(tileId)] || null;
  }

  return Object.freeze({ DISTRICTS, PROPERTIES, get });
});
