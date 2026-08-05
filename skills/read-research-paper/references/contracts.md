# Workflow contract

## Start input

```json
{
  "source": { "kind": "text|url", "value": "论文正文或 arXiv/DOI/PDF 链接" },
  "model": "可选的已启用 gpt-* 型号",
  "userLevel": "beginner|graduate|reviewer",
  "outputLanguage": "zh-CN|en"
}
```

Pasted text must contain at least a meaningful abstract or section. The current workflow API accepts text and links; use the project UI when a local PDF must be uploaded directly.

## Checkpoint: `paper-task`

Submit one of:

- `{ "task": "qa", "question": "..." }`
- `{ "task": "section_explain", "sectionId": "...", "question": "可选" }`
- `{ "task": "quiz", "question": "可选的复习重点" }`
- `{ "finish": true }`

Every generated session records the paragraph citations retrieved for that task. A citation list may be empty only when the adapter found no relevant text, in which case the model must retain uncertainty.
