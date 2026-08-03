# Workflow contract

## Start input

```json
{
  "essay": {
    "prompt": "作文题目和完整材料",
    "grade": "初一|初二|初三|高一|高二|高三",
    "genre": "记叙文|议论文|材料作文",
    "targetLength": 800,
    "includePunctuation": true,
    "scene": "日常练习|课堂作业|考前训练"
  }
}
```

## Checkpoint: `collect-materials`

Submit `materials.experience`, `materials.detail`, and `materials.insight`. Use the learner's own facts; do not fabricate an experience to satisfy the schema.

## Checkpoint: `select-outline`

Submit either `outlineId` from the generated options or the complete unmodified `outline` object.

## Completion

The result contains analysis, supplied materials, all outline candidates, the selected outline, and the final essay response with five-dimension feedback.
