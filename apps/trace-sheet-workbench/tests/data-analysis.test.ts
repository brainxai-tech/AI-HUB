import { describe, expect, it } from "vitest";
import { analyzeDataset, buildLlmAnalysisPacket, rowsFromGrid } from "../src/lib/data-analysis";

describe("rowsFromGrid", () => {
  it("uses the first non-empty row as headers and deduplicates repeated names", () => {
    const rows = rowsFromGrid([
      [null, null, null],
      ["Date", "Revenue", "Revenue"],
      ["2026-01-01", "100", "Online"],
    ]);

    expect(rows).toEqual([
      {
        Date: "2026-01-01",
        Revenue: "100",
        "Revenue 2": "Online",
      },
    ]);
  });
});

describe("analyzeDataset", () => {
  const rows = [
    { Date: "2026-01-01", Channel: "Search", Revenue: "100", Orders: "10" },
    { Date: "2026-01-02", Channel: "Search", Revenue: "120", Orders: "12" },
    { Date: "2026-01-03", Channel: "Social", Revenue: "95", Orders: "9" },
    { Date: "2026-01-04", Channel: "Email", Revenue: "5000", Orders: "11" },
    { Date: "2026-01-04", Channel: "Email", Revenue: "5000", Orders: "11" },
    { Date: "2026-01-05", Channel: "", Revenue: null, Orders: "8" },
  ];

  it("infers schema, quality, anomalies, charts, and deterministic insights", () => {
    const analysis = analyzeDataset(rows);

    expect(analysis.rowCount).toBe(6);
    expect(analysis.columns.find((column) => column.name === "Date")?.type).toBe("date");
    expect(analysis.columns.find((column) => column.name === "Revenue")?.type).toBe("number");
    expect(analysis.columns.find((column) => column.name === "Channel")?.type).toBe("category");
    expect(analysis.duplicateRowCount).toBe(1);
    expect(analysis.qualityScore).toBeLessThan(100);
    expect(analysis.anomalies.some((anomaly) => anomaly.type === "outlier")).toBe(true);
    expect(analysis.charts.map((chart) => chart.type)).toEqual(expect.arrayContaining(["line", "bar", "pie", "histogram", "scatter"]));
    expect(analysis.insights.length).toBeGreaterThan(0);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  it("builds a compact LLM packet without preview rows or raw source data", () => {
    const packet = buildLlmAnalysisPacket(analyzeDataset(rows));

    expect(packet.rowCount).toBe(6);
    expect(packet.columns[0]).toHaveProperty("name");
    expect(packet).not.toHaveProperty("previewRows");
  });
});
