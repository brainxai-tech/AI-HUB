---
name: operate-trace-sheet
description: Plan and audit spreadsheet transformations through TraceSheet while keeping source rows and cells in the browser. Use when a user wants an AI-generated table-operation plan, a human approval checkpoint, a revised plan, or a bounded execution receipt based only on workbook metadata; never send raw spreadsheet data to the workflow server.
---

# Operate Trace Sheet

1. Load CSV or XLSX content only in the TraceSheet browser application.
2. Send the workflow only the goal and source metadata: IDs, file and sheet names, column names, and row counts.
3. Review the generated plan and its browser-local diff preview. Treat every `DEDUP` step as `HIGH` risk regardless of the model response.
4. Use `revise-plan` when the plan needs changes. Preserve prior plan revisions.
5. Approve the plan before executing it in the browser.
6. Submit only the bounded execution receipt: final version ID, input/output/changed row counts, warnings, and audit hash.

Reject `rows`, `cells`, or `data` as object keys anywhere in workflow input. Do not send cell values, row samples, workbook contents, or exported files to the workflow runtime.

Read [references/contracts.md](references/contracts.md) for the exact metadata, checkpoint, action, and receipt fields.
