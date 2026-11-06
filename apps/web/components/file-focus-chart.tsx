"use client";

import type { FileTypeAnalyticsRow } from "@gg/core";
import * as echarts from "echarts";
import { useEffect, useMemo, useRef } from "react";

import { bindChartTheme } from "@/lib/chart-theme";

type FileMetric = "files" | "lines" | "commits" | "insertions" | "deletions" | "netLines" | "churn";

export function FileFocusChart({
  data,
  metric
}: {
  data: FileTypeAnalyticsRow[];
  metric: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const normalizedMetric = normalizeMetric(metric);
  const chartData = useMemo(
    () =>
      [...data]
        .sort((left, right) => metricValue(right, normalizedMetric) - metricValue(left, normalizedMetric))
        .slice(0, 12)
        .reverse(),
    [data, normalizedMetric]
  );

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const chart = echarts.init(ref.current);
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(ref.current);

    chart.setOption({
      color: ["#0f86c6"],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" }
      },
      grid: {
        top: 12,
        right: 18,
        bottom: 24,
        left: 82
      },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
        axisLabel: { color: "#64748b" }
      },
      yAxis: {
        type: "category",
        data: chartData.map((row) => fileTypeLabel(row.extension)),
        axisLine: { lineStyle: { color: "#cbd5e1" } },
        axisLabel: { color: "#475569" }
      },
      series: [
        {
          name: metricLabel(normalizedMetric),
          type: "bar",
          barMaxWidth: 18,
          data: chartData.map((row) => metricValue(row, normalizedMetric))
        }
      ]
    });

    const unbindTheme = bindChartTheme(chart);

    return () => {
      unbindTheme();
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [chartData, normalizedMetric]);

  return <div ref={ref} className="chart-host" role="img" aria-label="File type breakdown" />;
}

export function fileTypeLabel(extension: string | null): string {
  return extension ? `.${extension}` : "No extension";
}

function normalizeMetric(metric: string): FileMetric {
  if (
    metric === "files" ||
    metric === "lines" ||
    metric === "commits" ||
    metric === "insertions" ||
    metric === "deletions" ||
    metric === "netLines" ||
    metric === "churn"
  ) {
    return metric;
  }

  return "churn";
}

function metricValue(row: FileTypeAnalyticsRow, metric: FileMetric): number {
  switch (metric) {
    case "files":
      return row.fileCount;
    case "lines":
      return row.lineCount;
    case "commits":
      return row.commits;
    case "insertions":
      return row.insertions;
    case "deletions":
      return row.deletions;
    case "netLines":
      return row.netLines;
    case "churn":
      return row.churn;
  }
}

function metricLabel(metric: FileMetric): string {
  switch (metric) {
    case "files":
      return "Files";
    case "lines":
      return "Lines";
    case "commits":
      return "Commits";
    case "insertions":
      return "Insertions";
    case "deletions":
      return "Deletions";
    case "netLines":
      return "Net lines";
    case "churn":
      return "Churn";
  }
}
