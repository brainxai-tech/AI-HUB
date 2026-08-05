# Workflow contract

## Start input

```json
{
  "request": {
    "topic": "主题",
    "audience": "授课对象",
    "durationMinutes": 45,
    "difficulty": "基础",
    "teachingStyle": "讲练结合",
    "quizCount": 5,
    "outputFormat": "teaching_bundle|word|ppt|mind_map",
    "includeExamples": true,
    "extraRequirements": "可选",
    "model": "可选的已启用 gpt-* 型号"
  },
  "knowledgeSources": [
    { "sourceId": "course-01", "title": "资料名称", "excerpt": "授权使用的短摘录" }
  ]
}
```

The adapter limits injected excerpts and retains their source IDs separately as citations. Do not submit secrets or unlicensed full books.

## Checkpoint: `teacher-review`

- Approve: `{ "approved": true }`
- Revise: `{ "approved": false, "revisionNotes": "明确、可验证的修改要求" }`

The completion result includes the final bundle, deterministic consistency checks, source citations, and every revision attempt.
