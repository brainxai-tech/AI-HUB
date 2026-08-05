# Workflow contract

## Start input

Submit only source metadata:

```json
{
  "goal": "按订单号去重并统一日期格式",
  "context": {
    "activeSourceId": "source-01",
    "sources": [
      {
        "id": "source-01",
        "name": "订单表",
        "fileName": "orders.xlsx",
        "sheetName": "Sheet1",
        "columns": ["订单号", "日期"],
        "rowCount": 100
      }
    ]
  }
}
```

Object keys named `rows`, `cells`, or `data` are rejected recursively. Values may contain those words. Source rows, cells, samples, hashes of cell contents, and exported workbooks remain in the browser.
Only the fields shown in the start, action, approval, and receipt contracts are retained; unknown fields are discarded before a run or pending command is persisted.

## Checkpoint: `review-plan`

Review the plan in TraceSheet with the actual browser-local sources and a diff preview. Every `DEDUP` operation is normalized to `HIGH` risk before validation, preview, or execution.

Approve with:

```json
{ "approved": true, "notes": "已核对字段、预览和高风险去重步骤" }
```

## Action: `revise-plan`

Create a new immutable plan revision:

```json
{ "goal": "按订单号去重，保留最后一条，并统一日期格式", "notes": "调整保留规则" }
```

## Checkpoint: `execution-receipt`

Execute the approved plan in the browser, then submit only:

```json
{
  "receipt": {
    "finalVersionId": "version-02",
    "inputRows": 100,
    "outputRows": 98,
    "changedRows": 2,
    "warnings": [],
    "auditHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

The completed workflow is an audit record, not a copy of the workbook.
