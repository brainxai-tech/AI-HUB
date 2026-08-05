"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartRecommendation } from "@/lib/data-analysis";

const COLORS = ["#0f766e", "#2563eb", "#c2410c", "#7c3aed", "#ca8a04", "#be123c", "#047857", "#4338ca"];

type ChartPanelProps = {
  chart: ChartRecommendation;
};

export function ChartPanel({ chart }: ChartPanelProps) {
  return (
    <article className="chart-card">
      <div className="chart-card__header">
        <div>
          <h3>{chart.title}</h3>
          <p>{chart.explanation}</p>
        </div>
        <span className="chart-badge">{chartTypeLabel(chart.type)}</span>
      </div>
      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(chart)}
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function renderChart(chart: ChartRecommendation) {
  const yKey = chart.yKey ?? "记录数";

  if (chart.type === "line") {
    return (
      <LineChart data={chart.data} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} minTickGap={18} />
        <YAxis tick={{ fontSize: 11 }} width={54} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey={yKey} stroke="#0f766e" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    );
  }

  if (chart.type === "bar" || chart.type === "histogram") {
    return (
      <BarChart data={chart.data} margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} minTickGap={12} />
        <YAxis tick={{ fontSize: 11 }} width={54} />
        <Tooltip />
        <Bar dataKey={yKey} fill="#2563eb" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    );
  }

  if (chart.type === "pie") {
    return (
      <PieChart>
        <Tooltip />
        <Legend />
        <Pie
          data={chart.data}
          dataKey={yKey}
          nameKey={chart.xKey}
          cx="50%"
          cy="48%"
          outerRadius={88}
          innerRadius={44}
          paddingAngle={2}
          isAnimationActive={false}
        >
          {chart.data.map((_, index) => (
            <Cell key={`slice-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    );
  }

  return (
    <ScatterChart margin={{ top: 8, right: 18, bottom: 0, left: 0 }}>
      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
      <XAxis type="number" dataKey={chart.xKey} name={chart.xKey} tick={{ fontSize: 11 }} width={54} />
      <YAxis type="number" dataKey={yKey} name={yKey} tick={{ fontSize: 11 }} width={54} />
      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
      <Scatter data={chart.data} fill="#c2410c" isAnimationActive={false} />
    </ScatterChart>
  );
}

function chartTypeLabel(type: ChartRecommendation["type"]): string {
  return {
    line: "趋势",
    bar: "排行",
    pie: "占比",
    histogram: "分布",
    scatter: "关系",
  }[type];
}
