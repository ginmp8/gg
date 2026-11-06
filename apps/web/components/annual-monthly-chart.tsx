"use client";

import type { AnnualMonthly } from "@gg/core";
import * as echarts from "echarts";
import { useEffect, useMemo, useRef, useState } from "react";

import { bindChartTheme } from "@/lib/chart-theme";

type Metric = "commits" | "adjustedChurn" | "reviewableChurn" | "testTouchedCommits";

export function AnnualMonthlyChart({
  data, year, email
}: { data: AnnualMonthly[]; year: number; email: string | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [metric, setMetric] = useState<Metric>("commits");
  const rows = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of data) {
      if (email && email !== row.email) continue;
      totals.set(row.month, (totals.get(row.month) ?? 0) + row[metric]);
    }
    return Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      return { month, value: totals.get(month) ?? 0 };
    });
  }, [data, year, email, metric]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    chart.setOption({
      color: ["#0f86c6"],
      tooltip: { trigger: "axis" },
      grid: { top: 12, left: 55, right: 22, bottom: 35 },
      xAxis: { type: "category", data: rows.map((row) => row.month.slice(5)) },
      yAxis: { type: "value", minInterval: 1 },
      series: [{
        name: metric === "commits" ? "Integrated commits"
          : metric === "adjustedChurn" ? "Adjusted churn"
          : metric === "reviewableChurn" ? "Reviewable churn" : "Commits touching tests",
        type: "bar", barMaxWidth: 28, data: rows.map((row) => row.value)
      }]
    });
    const unbindTheme = bindChartTheme(chart);
    return () => { unbindTheme(); observer.disconnect(); chart.dispose(); };
  }, [rows, metric]);

  return (
    <section className="grid gap-3 rounded-md border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Monthly contribution trend</h3>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Measure
          <select
            aria-label="Monthly metric"
            value={metric}
            onChange={(event) => setMetric(event.target.value as Metric)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="commits">Integrated commits</option>
            <option value="adjustedChurn">Whitespace-adjusted churn</option>
            <option value="reviewableChurn">Reviewable code/test churn</option>
            <option value="testTouchedCommits">Commits touching tests</option>
          </select>
        </label>
      </div>
      <div ref={ref} role="img" aria-label="Monthly contribution activity" className="h-60 w-full" />
    </section>
  );
}
