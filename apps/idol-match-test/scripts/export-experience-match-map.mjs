#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { idolDataBundle } from "../data/idol-profiles.generated.ts";
import { buildUserPreferenceProfile, getTopUserTags, matchIdols } from "../lib/matcher.ts";
import { getQuizQuestionsForMode } from "../lib/quiz.ts";

export const choiceCodes = ["A", "B", "C", "D"];
export const maxDefaultSampleRows = 100000;

const modeConfigs = {
  experience: {
    name: "体验版",
    command: "export:experience-map",
    outputDir: "outputs/experience-match-map",
    exampleSignature: "ACDABCDABCDABCD"
  },
  professional: {
    name: "专业版",
    command: "export:professional-map",
    outputDir: "outputs/professional-match-map",
    exampleSignature: "ABCDABCDABCDABCDABCDABCDABCDABCDABCDABCD"
  }
};

const isSupportedMode = (mode) => Object.hasOwn(modeConfigs, mode);
const getModeQuestions = (mode = "experience") => getQuizQuestionsForMode(mode);
const getModeConfig = (mode = "experience") => {
  if (!isSupportedMode(mode)) {
    throw new Error(`不支持的模式：${mode}。可用模式：experience, professional。`);
  }

  return modeConfigs[mode];
};
const getModeCombinationCount = (mode = "experience") => 4n ** BigInt(getModeQuestions(mode).length);
const formatBigInt = (value) => value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const experienceQuestionCount = getModeQuestions("experience").length;
export const experienceCombinationCount = 4 ** experienceQuestionCount;
export const professionalQuestionCount = getModeQuestions("professional").length;
export const professionalCombinationCount = getModeCombinationCount("professional");
export const professionalCombinationCountText = formatBigInt(professionalCombinationCount);

const escapeCsvValue = (value) => {
  const text = String(value ?? "");

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
};

export const toCsv = (rows, columns) => [
  columns.join(","),
  ...rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(","))
].join("\n");

const normalizeSignature = (signature) =>
  String(signature ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s,|_-]+/g, "");

export const indexToSignature = (index, questionCount = experienceQuestionCount) => {
  const total = 4n ** BigInt(questionCount);
  let value = BigInt(index);

  if (value < 0n || value >= total) {
    throw new RangeError(`Combination index must be between 0 and ${total - 1n}.`);
  }

  const chars = Array.from({ length: questionCount }, () => "A");

  for (let cursor = questionCount - 1; cursor >= 0; cursor -= 1) {
    chars[cursor] = choiceCodes[Number(value % 4n)];
    value /= 4n;
  }

  return chars.join("");
};

export const codesToSelection = (signature, mode = "experience") => {
  const normalized = normalizeSignature(signature);
  const questions = getModeQuestions(mode);
  const config = getModeConfig(mode);

  if (normalized.length !== questions.length) {
    throw new Error(`${config.name}答案签名必须是 ${questions.length} 位 A/B/C/D，例如 ${config.exampleSignature}。`);
  }

  return questions.map((question, index) => {
    const code = normalized[index];
    const optionIndex = choiceCodes.indexOf(code);

    if (optionIndex < 0) {
      throw new Error(`答案签名第 ${index + 1} 位必须是 A/B/C/D，当前是 ${code}。`);
    }

    const option = question.options[optionIndex];

    return {
      questionIndex: index + 1,
      questionId: question.id,
      questionText: question.text,
      code,
      optionId: option.id,
      optionLabel: option.label
    };
  });
};

export const lookupMatch = (signature, { mode = "experience", idols = idolDataBundle.profiles } = {}) => {
  const selection = codesToSelection(signature, mode);
  const selectedOptionIds = selection.map((item) => item.optionId);
  const profile = buildUserPreferenceProfile(selectedOptionIds);
  const [topMatch] = matchIdols(profile, idols);

  if (!topMatch) {
    throw new Error("候选爱豆数据为空，无法生成匹配结果。");
  }

  return {
    answer_signature: selection.map((item) => item.code).join(""),
    selected_option_ids: selectedOptionIds.join("|"),
    top_idol_id: topMatch.idol.id,
    top_idol_name: topMatch.idol.name,
    score: topMatch.score,
    confidence: topMatch.confidence,
    matched_tags: topMatch.matchedTags.join("|"),
    top_user_tags: getTopUserTags(profile, 8).join("|")
  };
};

export const lookupExperienceMatch = (signature, idols = idolDataBundle.profiles) =>
  lookupMatch(signature, { mode: "experience", idols });

export const buildQuestionOptionRows = (mode = "experience") =>
  getModeQuestions(mode).flatMap((question, questionIndex) =>
    question.options.map((option, optionIndex) => ({
      question_no: questionIndex + 1,
      question_id: question.id,
      dimension: question.dimension,
      question_text: question.text,
      choice_code: choiceCodes[optionIndex],
      option_id: option.id,
      option_label: option.label,
      tags: option.tags.join("|"),
      weights: Object.entries(option.weights)
        .map(([tag, weight]) => `${tag}:${weight}`)
        .join("|")
    }))
  );

export const buildSampleRows = (sampleCount = 1024, mode = "experience") => {
  const count = Math.max(1, Math.min(Number(sampleCount), maxDefaultSampleRows));
  const questionCount = getModeQuestions(mode).length;
  const total = getModeCombinationCount(mode);
  const rows = [];

  for (let index = 0; index < count; index += 1) {
    const combinationIndex =
      count === 1 ? 0n : (BigInt(index) * (total - 1n)) / BigInt(count - 1);
    const signature = indexToSignature(combinationIndex, questionCount);
    const lookup = lookupMatch(signature, { mode });

    rows.push({
      combination_index: combinationIndex.toString(),
      ...Object.fromEntries(
        signature.split("").map((code, codeIndex) => [`q${String(codeIndex + 1).padStart(2, "0")}`, code])
      ),
      ...lookup
    });
  }

  return rows;
};

const buildReadme = (outputDir, mode = "experience") => {
  const config = getModeConfig(mode);
  const questionCount = getModeQuestions(mode).length;
  const combinationCount = getModeCombinationCount(mode);

  return `# ${config.name} ${questionCount} 题答案映射表

本目录由 \`npm run ${config.command}\` 生成，用来记录 ${questionCount} 题${config.name}的选项编码和匹配查询规则。

## 为什么不直接生成全量表

${questionCount} 题、每题 4 个选项，完整排列组合是：

\`\`\`text
4^${questionCount} = ${formatBigInt(combinationCount)} 行
\`\`\`

这个规模不适合放进 Excel、CSV、Git 仓库或前端包。当前脚本默认生成可审计的小表，并支持对任意一种答案组合做精确查询。

## 文件

- \`question-options.csv\`：${questionCount} 道题、每题 A/B/C/D 对应的 option id、文案、标签和权重。
- \`sample-match-map.csv\`：从完整组合空间等距抽样出的答案签名和 Top1 爱豆结果。
- \`manifest.json\`：生成参数、候选爱豆数量、完整组合数和数据源。

## 查询任意一种结果

\`\`\`powershell
npm run ${config.command} -- --signature ${config.exampleSignature}
\`\`\`

答案签名长度必须是 ${questionCount} 位，每一位对应 \`question-options.csv\` 中同题号的 A/B/C/D。

## 重新生成

\`\`\`powershell
npm run ${config.command} -- --sample 2048 --output-dir ${outputDir}
\`\`\`
`;
};

export const writeDefaultArtifacts = async ({
  mode = "experience",
  outputDir,
  sampleCount = 1024
} = {}) => {
  const config = getModeConfig(mode);
  const targetOutputDir = outputDir ?? config.outputDir;
  const resolvedOutputDir = resolve(targetOutputDir);
  await mkdir(resolvedOutputDir, { recursive: true });

  const questionCount = getModeQuestions(mode).length;
  const combinationCount = getModeCombinationCount(mode);
  const questionRows = buildQuestionOptionRows(mode);
  const sampleRows = buildSampleRows(sampleCount, mode);
  const sampleColumns = [
    "combination_index",
    ...Array.from({ length: questionCount }, (_, index) => `q${String(index + 1).padStart(2, "0")}`),
    "answer_signature",
    "selected_option_ids",
    "top_idol_id",
    "top_idol_name",
    "score",
    "confidence",
    "matched_tags",
    "top_user_tags"
  ];
  const manifest = {
    mode,
    questionCount,
    choicesPerQuestion: choiceCodes.length,
    rawCombinationCount:
      combinationCount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(combinationCount) : combinationCount.toString(),
    rawCombinationCountText: formatBigInt(combinationCount),
    idolCount: idolDataBundle.profiles.length,
    dataMode: idolDataBundle.status.mode,
    dataSource: idolDataBundle.status.sourceLabel,
    sampleRows: sampleRows.length,
    fullExportDisabledByDefault: true,
    reason: `${questionCount} questions with 4 choices each create ${formatBigInt(
      combinationCount
    )} rows; use --signature for exact lookup instead of materializing the full table.`,
    files: ["question-options.csv", "sample-match-map.csv", "manifest.json", "README.md"]
  };

  await writeFile(
    resolve(resolvedOutputDir, "question-options.csv"),
    `${toCsv(questionRows, [
      "question_no",
      "question_id",
      "dimension",
      "question_text",
      "choice_code",
      "option_id",
      "option_label",
      "tags",
      "weights"
    ])}\n`,
    "utf8"
  );
  await writeFile(resolve(resolvedOutputDir, "sample-match-map.csv"), `${toCsv(sampleRows, sampleColumns)}\n`, "utf8");
  await writeFile(resolve(resolvedOutputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(resolve(resolvedOutputDir, "README.md"), buildReadme(targetOutputDir, mode), "utf8");

  return {
    outputDir: resolvedOutputDir,
    ...manifest
  };
};

const readOption = (args, name, fallback) => {
  const index = args.indexOf(name);

  if (index < 0) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
};

export const runCli = async (args = process.argv.slice(2)) => {
  const mode = readOption(args, "--mode", "experience");
  const config = getModeConfig(mode);

  if (args.includes("--full")) {
    const questionCount = getModeQuestions(mode).length;
    const combinationCount = getModeCombinationCount(mode);

    throw new Error(
      `拒绝生成全量 ${formatBigInt(combinationCount)} 行表格（${questionCount} 题）。请用 --signature 精确查询，或用 --sample N 生成抽样表。`
    );
  }

  const signature = readOption(args, "--signature");

  if (signature) {
    const lookup = lookupMatch(signature, { mode });
    console.log(JSON.stringify(lookup, null, 2));
    return lookup;
  }

  const sampleCount = Number(readOption(args, "--sample", "1024"));
  const outputDir = readOption(args, "--output-dir", config.outputDir);
  const result = await writeDefaultArtifacts({ mode, outputDir, sampleCount });
  console.log(`Generated ${mode} match map artifacts in ${result.outputDir}`);
  console.log(`Raw combinations: ${result.rawCombinationCountText}`);
  console.log(`Sample rows: ${result.sampleRows}`);
  return result;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
