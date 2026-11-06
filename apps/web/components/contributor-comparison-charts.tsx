"use client";

import type { ContributorFileTypeRow, ContributorLeaderboardRow } from "@gg/core";
import * as echarts from "echarts";
import { useEffect, useMemo, useRef } from "react";

import { bindChartTheme } from "@/lib/chart-theme";

import { fileTypeLabel } from "@/components/file-focus-chart";

type ContributorMetric = "commits" | "churn" | "insertions" | "deletions" | "netLines" | "files" | "lines";

const contributorPalette = [
  "#0f86c6",
  "#d9485f",
  "#248f5f",
  "#c26a16",
  "#7c3aed",
  "#0f766e",
  "#b42318",
  "#475569"
];

export function ContributorComparisonChart({
  data,
  metric
}: {
  data: ContributorLeaderboardRow[];
  metric: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const normalizedMetric = normalizeMetric(metric);
  const chartData = useMemo(
    () =>
      [...data]
        .sort((left, right) => contributorMetricValue(right, normalizedMetric) - contributorMetricValue(left, normalizedMetric))
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
      color: [contributorPalette[0]],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" }
      },
      grid: {
        top: 12,
        right: 20,
        bottom: 28,
        left: 112
      },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
        axisLabel: { color: "#64748b" }
      },
      yAxis: {
        type: "category",
        data: chartData.map((row) => row.displayName),
        axisLine: { lineStyle: { color: "#cbd5e1" } },
        axisLabel: { color: "#475569" }
      },
      series: [
        {
          name: metricLabel(normalizedMetric),
          type: "bar",
          barMaxWidth: 18,
          data: chartData.map((row) => contributorMetricValue(row, normalizedMetric))
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

  return <div ref={ref} className="chart-host" role="img" aria-label="Contributor comparison" />;
}

export function ContributorFileTypeShareChart({
  data,
  metric
}: {
  data: ContributorFileTypeRow[];
  metric: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const normalizedMetric = normalizeMetric(metric);
  const chartModel = useMemo(() => buildShareModel(data, normalizedMetric), [data, normalizedMetric]);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const chart = echarts.init(ref.current);
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(ref.current);

    chart.setOption({
      color: contributorPalette,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        valueFormatter: (value: number) => `${value.toFixed(1)}%`
      },
      legend: {
        top: 0,
        right: 0,
        type: "scroll",
        textStyle: { color: "#475569" }
      },
      grid: {
        top: 36,
        right: 20,
        bottom: 30,
        left: 82
      },
      xAxis: {
        type: "value",
        max: 100,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
        axisLabel: {
          color: "#64748b",
          formatter: "{value}%"
        }
      },
      yAxis: {
        type: "category",
        data: chartModel.fileTypes,
        axisLine: { lineStyle: { color: "#cbd5e1" } },
        axisLabel: { color: "#475569" }
      },
      series: chartModel.series.map((series) => ({
        name: series.name,
        type: "bar",
        stack: "contributors",
        emphasis: { focus: "series" },
        data: series.values
      }))
    });

    const unbindTheme = bindChartTheme(chart);

    return () => {
      unbindTheme();
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [chartModel]);

  return <div ref={ref} className="chart-host" role="img" aria-label="Contributor share by file type" />;
}

function buildShareModel(data: ContributorFileTypeRow[], metric: ContributorMetric): {
  fileTypes: string[];
  series: Array<{ name: string; values: number[] }>;
} {
  const totalsByType = new Map<string, number>();
  const rowsByType = new Map<string, ContributorFileTypeRow[]>();

  for (const row of data) {
    const key = row.extension ?? "";
    const value = shareMetricValue(row, metric);
    totalsByType.set(key, (totalsByType.get(key) ?? 0) + value);
    rowsByType.set(key, [...(rowsByType.get(key) ?? []), row]);
  }

  const topTypes = [...totalsByType.entries()]
    .filter(([, value]) => value > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([extension]) => extension);

  const contributorTotals = new Map<string, { name: string; value: number }>();
  for (const extension of topTypes) {
    for (const row of rowsByType.get(extension) ?? []) {
      const current = contributorTotals.get(row.contributorId) ?? { name: row.displayName, value: 0 };
      current.value += shareMetricValue(row, metric);
      contributorTotals.set(row.contributorId, current);
    }
  }

  const topContributors = [...contributorTotals.entries()]
    .sort((left, right) => right[1].value - left[1].value)
    .slice(0, 6);
  const contributorIds = new Set(topContributors.map(([id]) => id));
  const series = topContributors.map(([id, contributor]) => ({
    id,
    name: contributor.name,
    values: [] as number[]
  }));
  const otherSeries = { id: "__other", name: "Other", values: [] as number[] };

  for (const extension of topTypes) {
    const rows = rowsByType.get(extension) ?? [];
    const total = rows.reduce((sum, row) => sum + shareMetricValue(row, metric), 0);
    const valuesByContributor = new Map<string, number>();
    let otherValue = 0;

    for (const row of rows) {
      const value = shareMetricValue(row, metric);
      if (contributorIds.has(row.contributorId)) {
        valuesByContributor.set(row.contributorId, (valuesByContributor.get(row.contributorId) ?? 0) + value);
      } else {
        otherValue += value;
      }
    }

    for (const item of series) {
      item.values.push(total === 0 ? 0 : ((valuesByContributor.get(item.id) ?? 0) / total) * 100);
    }
    otherSeries.values.push(total === 0 ? 0 : (otherValue / total) * 100);
  }

  return {
    fileTypes: topTypes.map((extension) => fileTypeLabel(extension || null)),
    series: otherSeries.values.some((value) => value > 0) ? [...series, otherSeries] : series
  };
}

function normalizeMetric(metric: string): ContributorMetric {
  if (
    metric === "commits" ||
    metric === "churn" ||
    metric === "insertions" ||
    metric === "deletions" ||
    metric === "netLines" ||
    metric === "files" ||
    metric === "lines"
  ) {
    return metric;
  }

  return "churn";
}

function contributorMetricValue(row: ContributorLeaderboardRow, metric: ContributorMetric): number {
  switch (metric) {
    case "commits":
      return row.commits;
    case "insertions":
      return row.insertions;
    case "deletions":
      return row.deletions;
    case "netLines":
      return row.netLines;
    case "files":
      return row.filesChanged;
    case "lines":
    case "churn":
      return row.insertions + row.deletions;
  }
}

function fileTypeMetricValue(row: ContributorFileTypeRow, metric: ContributorMetric): number {
  switch (metric) {
    case "commits":
      return row.commits;
    case "insertions":
      return row.insertions;
    case "deletions":
      return row.deletions;
    case "netLines":
      return row.netLines;
    case "files":
      return row.touchedFiles;
    case "lines":
    case "churn":
      return row.churn;
  }
}

function shareMetricValue(row: ContributorFileTypeRow, metric: ContributorMetric): number {
  const value = fileTypeMetricValue(row, metric);
  return metric === "netLines" ? Math.abs(value) : Math.max(0, value);
}

function metricLabel(metric: ContributorMetric): string {
  switch (metric) {
    case "commits":
      return "Commits";
    case "insertions":
      return "Insertions";
    case "deletions":
      return "Deletions";
    case "netLines":
      return "Net lines";
    case "files":
      return "Files changed";
    case "lines":
      return "Changed lines";
    case "churn":
      return "Churn";
  }
}
