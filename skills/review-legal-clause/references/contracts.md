# Workflow contract

## Start input

```json
{
  "clauseText": "至少 20 个字符的合同条款",
  "userRole": "合同接收方",
  "contractType": "服务合同",
  "jurisdiction": "中国大陆",
  "outputLanguage": "zh-CN",
  "reviewGoal": "重点检查解除和赔偿",
  "reviewerNotes": "可选的初始备注",
  "model": "可选的已启用 gpt-* 型号"
}
```

The workflow calls the existing legal project's `/api/analyze` route. It does not query statutes, cases, regulations, or a jurisdictional knowledge base.

## Checkpoint: `analysis-review`

Submit:

```json
{
  "decision": "prepare-lawyer-review",
  "reviewerNotes": "对风险、证据和质量警告的人工复核备注"
}
```

## Action: `reanalyze`

Submit `additionalContext` and optional `reviewerNotes`. The adapter appends a new immutable analysis version and keeps the earlier disclaimer, warnings, evidence snippets, jurisdiction, timestamp, and notes.

## Checkpoint: `legal-review`

Complete with one of:

```json
{ "decision": "approved-for-reading", "reviewerNotes": "人工阅读边界与使用说明" }
```

```json
{ "decision": "needs-lawyer", "reviewerNotes": "需要律师重点审查的事项" }
```

Never use `legal-approved`. The result is an audit record and review packet, not legal advice.
