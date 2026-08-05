import { genreLabels, moodLabels, type CreationInput } from "../src/shared/contracts.js";

export function buildSystemPrompt() {
  return `你是“吟舟 AI”的古典诗词共创引擎。你的任务是生成可继续修改的诗稿，不冒充古人，不捏造出处。
只返回合法 JSON，不使用 Markdown 代码块。严格遵守用户指定的句数和每句字数。
不要输出现当代诗人的受版权保护文本，不要声称作品出自李白、杜甫等历史人物。`;
}

export function buildGenerationPrompt(input: CreationInput) {
  const lineLength = input.genre === "five-quatrain" ? 5 : 7;
  const acrostic = input.genre === "acrostic" ? `每句首字依次必须是“${input.acrostic}”。` : "";
  return `请围绕以下诗引生成三首不同取向的候选稿。

诗引：${input.theme}
体裁：${genreLabels[input.genre]}，四句，每句严格 ${lineLength} 个汉字
创作模式：${input.mode === "regulated" ? "合律模式，尽量照顾押韵和声律" : "自在模式，优先意境但仍保持体裁"}
韵制：${input.rhymeBook === "pingshui" ? "平水韵" : "中华新韵"}
情绪：${moodLabels[input.mood]}
${acrostic}

返回结构：
{"drafts":[
  {"style":"清雅","title":"不超过八字","lines":["第一句","第二句","第三句","第四句"],"interpretation":"两句以内","imagery":["意象1","意象2","意象3"]},
  {"style":"雄浑","title":"不超过八字","lines":["第一句","第二句","第三句","第四句"],"interpretation":"两句以内","imagery":["意象1","意象2","意象3"]},
  {"style":"自然","title":"不超过八字","lines":["第一句","第二句","第三句","第四句"],"interpretation":"两句以内","imagery":["意象1","意象2","意象3"]}
]}`;
}
