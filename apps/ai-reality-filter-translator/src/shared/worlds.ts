import type { World } from "./contracts.js";

export type WorldPreset = {
  id: World;
  label: string;
  shortLabel: string;
  premise: string;
  promptRules: string[];
  visual: {
    camera: string;
    lighting: string;
    palette: string[];
    composition: string;
    texture: string;
  };
};

export const worldPresets: Record<World, WorldPreset> = {
  cyber_city: {
    id: "cyber_city",
    label: "赛博都市",
    shortLabel: "霓虹雨夜",
    premise: "把日常地点翻译成高密度未来城市里的边缘场景，保留原图物体和空间关系。",
    promptRules: [
      "加入霓虹反光、雨夜街区、低层商业、电缆、屏幕、街头生活感。",
      "不要把照片改成宏大城市天际线，重点保留原图地点的尺度。",
      "故事语气冷静、带一点未解任务感。"
    ],
    visual: {
      camera: "35mm street photography, human-scale wide shot",
      lighting: "neon reflections on wet surfaces, mixed practical lights",
      palette: ["cyan", "magenta", "sodium amber", "wet asphalt"],
      composition: "keep the original subject placement, add dense signage around it",
      texture: "rain mist, reflective glass, brushed metal, cable clutter"
    }
  },
  gentle_animation: {
    id: "gentle_animation",
    label: "暖风手绘日常",
    shortLabel: "午后微风",
    premise: "把现实照片翻译成温柔、生活化、手绘动画感的日常场景，不模仿任何具体在世艺术家。",
    promptRules: [
      "使用温柔手绘动画、水彩背景、自然光、生活物件、安静情绪。",
      "不要使用具体艺术家姓名或直接风格复刻。",
      "故事要像一段平凡但被认真看见的下午。"
    ],
    visual: {
      camera: "eye-level medium-wide frame, quiet observational angle",
      lighting: "soft afternoon light, warm ambient bounce",
      palette: ["leaf green", "warm cream", "sky blue", "soft terracotta"],
      composition: "open breathing room around the main subject, small lived-in details",
      texture: "hand-painted background, watercolor wash, pencil line softness"
    }
  },
  detective_scene: {
    id: "detective_scene",
    label: "侦探现场",
    shortLabel: "案发线索",
    premise: "把照片翻译成虚构调查现场，让普通物件成为线索，但不指控真实人物。",
    promptRules: [
      "加入证据标记、斜切光线、旧胶片颗粒、观察视角和可疑细节。",
      "所有人物都必须保持虚构，不做真实犯罪判断。",
      "故事像案件记录摘要，克制、具体、留白。"
    ],
    visual: {
      camera: "50mm investigative still, slightly off-center composition",
      lighting: "hard side light, flashlight beam, low contrast shadows",
      palette: ["tobacco brown", "muted teal", "paper white", "bloodless red marker"],
      composition: "foreground clue, midground original subject, numbered evidence tags",
      texture: "film grain, paper labels, dust, fingerprint powder"
    }
  },
  apocalypse_shelter: {
    id: "apocalypse_shelter",
    label: "末日避难所",
    shortLabel: "幸存据点",
    premise: "把现实地点翻译成资源紧张但仍有人生活的避难所角落。",
    promptRules: [
      "加入临时加固、手写标记、储备物资、过滤设备、低电量照明。",
      "不要只做废墟，要有幸存秩序和生活痕迹。",
      "故事要有物资、规则、守望和下一次外出的压力。"
    ],
    visual: {
      camera: "documentary survival still, wide but intimate interior framing",
      lighting: "battery lanterns, dusty shafts of light, low emergency glow",
      palette: ["oxidized green", "warning yellow", "dust gray", "canvas beige"],
      composition: "barricaded edges, supplies grouped near the original focal point",
      texture: "tarps, worn labels, rust, dust, taped seams"
    }
  }
};

export const worldOrder: World[] = [
  "cyber_city",
  "gentle_animation",
  "detective_scene",
  "apocalypse_shelter"
];
