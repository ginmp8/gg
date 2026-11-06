"use client";

import type { ActivityBucket } from "@gita/core";
import * as echarts from "echarts";
import { useEffect, useRef } from "react";

import { bindChartTheme } from "@/lib/chart-theme";

export function ActivityChart({ data }: { data: ActivityBucket[] }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const chart = echarts.init(ref.current);
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(ref.current);
    let cumulativeNet = 0;
    const cumulativeNetData = data.map((bucket) => {
      cumulativeNet += bucket.insertions - bucket.deletions;
      return cumulativeNet;
    });

    chart.setOption({
      color: ["#0f86c6", "#248f5f", "#c26a16", "#7c3aed"],
      tooltip: {
        trigger: "axis"
      },
      grid: {
        top: 28,
        right: 20,
        bottom: 36,
        left: 44
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: {
          color: "#475569"
        }
      },
      xAxis: {
        type: "category",
        data: data.map((bucket) => bucket.date),
        axisLine: { lineStyle: { color: "#cbd5e1" } },
        axisLabel: { color: "#64748b" }
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "#e2e8f0" } },
        axisLabel: { color: "#64748b" }
      },
      series: [
        {
          name: "Commits",
          type: "bar",
          barMaxWidth: 18,
          data: data.map((bucket) => bucket.commits)
        },
        {
          name: "Insertions",
          type: "line",
          smooth: true,
          data: data.map((bucket) => bucket.insertions)
        },
        {
          name: "Deletions",
          type: "line",
          smooth: true,
          data: data.map((bucket) => bucket.deletions)
        },
        {
          name: "Cumulative NET",
          type: "line",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 3 },
          data: cumulativeNetData
        }
      ]
    });

    const unbindTheme = bindChartTheme(chart);

    return () => {
      unbindTheme();
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [data]);

  return <div ref={ref} className="chart-host" role="img" aria-label="Activity over time" />;
}
