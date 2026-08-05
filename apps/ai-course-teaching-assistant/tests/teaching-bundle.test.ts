import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLocalTeachingBundle,
  formatBundleMarkdown,
  formatSelectedOutputMarkdown,
  validateTeachingRequest,
} from "../lib/teaching.ts";

describe("teaching bundle generation", () => {
  it("rejects empty knowledge points before any provider call", () => {
    const result = validateTeachingRequest({
      topic: "  ",
      audience: "初中数学",
      durationMinutes: 45,
      difficulty: "入门",
      teachingStyle: "互动",
      quizCount: 5,
      provider: "openai",
    });

    assert.equal(result.ok, false);
    assert.match(result.error.message, /知识点/);
  });

  it("builds a complete template teaching bundle for formatter coverage", () => {
    const request = validateTeachingRequest({
      topic: "一次函数的图像与性质",
      audience: "初二学生",
      durationMinutes: 45,
      difficulty: "基础巩固",
      teachingStyle: "互动探究",
      quizCount: 4,
      provider: "openai",
      includeExamples: true,
    });

    assert.equal(request.ok, true);
    if (!request.ok) {
      return;
    }

    const bundle = buildLocalTeachingBundle(request.data, "模板格式化覆盖。");

    assert.equal(bundle.request.topic, "一次函数的图像与性质");
    assert.equal(bundle.source, "local-fallback");
    assert.ok(bundle.sections.lecture.outline.length >= 4);
    assert.equal(bundle.sections.quiz.length, 4);
    assert.equal(bundle.sections.mistakeAnalysis.length, 4);
    assert.ok(bundle.sections.activities.length >= 3);
    assert.ok(bundle.teacherNotes.some((note) => note.includes("人工审核")));
  });

  it("preserves the selected output format in a validated request", () => {
    const request = validateTeachingRequest({
      topic: "客户旅程地图",
      audience: "企业内训学员",
      durationMinutes: 60,
      difficulty: "企业培训",
      teachingStyle: "案例导入",
      quizCount: 5,
      provider: "openai",
      outputFormat: "ppt",
    });

    assert.equal(request.ok, true);
    if (!request.ok) {
      return;
    }

    assert.equal(request.data.outputFormat, "ppt");
  });

  it("builds formatted Word, PPT, and mind-map outputs from the local bundle", () => {
    const request = validateTeachingRequest({
      topic: "牛顿第二定律",
      audience: "高中物理",
      durationMinutes: 50,
      difficulty: "考试复习",
      teachingStyle: "讲练结合",
      quizCount: 3,
      provider: "openai",
      outputFormat: "mind_map",
    });

    assert.equal(request.ok, true);
    if (!request.ok) {
      return;
    }

    const bundle = buildLocalTeachingBundle(request.data);

    assert.match(bundle.formattedOutputs.word, /Word 文档稿/);
    assert.match(bundle.formattedOutputs.ppt, /# Slide 1/);
    assert.match(bundle.formattedOutputs.mindMap, /mindmap/);
    assert.match(bundle.formattedOutputs.mindMap, /牛顿第二定律/);
    assert.match(formatSelectedOutputMarkdown(bundle, "mind_map"), /mindmap/);
  });

  it("exports all four artifact sections to markdown", () => {
    const request = validateTeachingRequest({
      topic: "牛顿第二定律",
      audience: "高中物理",
      durationMinutes: 50,
      difficulty: "考试复习",
      teachingStyle: "讲练结合",
      quizCount: 3,
      provider: "openai",
    });

    assert.equal(request.ok, true);
    if (!request.ok) {
      return;
    }

    const bundle = buildLocalTeachingBundle(request.data);
    const markdown = formatBundleMarkdown(bundle);

    assert.match(markdown, /## 讲义/);
    assert.match(markdown, /## 测验/);
    assert.match(markdown, /## 错题解析/);
    assert.match(markdown, /## 教学活动/);
  });

  it("rejects vendor providers and non-GPT models", () => {
    const vendor = validateTeachingRequest({
      topic: "一次函数",
      audience: "初二学生",
      provider: "gemini",
      model: "gemini-pro",
    });
    const model = validateTeachingRequest({
      topic: "一次函数",
      audience: "初二学生",
      provider: "openai",
      model: "claude-sonnet",
    });

    assert.equal(vendor.ok, false);
    assert.equal(model.ok, false);
  });
});
