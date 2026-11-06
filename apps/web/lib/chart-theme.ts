import type { ECharts } from "echarts";

/** Reapply canvas-only ECharts colors when the theme attribute changes. */
export function bindChartTheme(chart: ECharts): () => void {
  function update() {
    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => `hsl(${css.getPropertyValue(name).trim()})`;
    const foreground = color("--foreground");
    const muted = color("--muted-foreground");
    const border = color("--border");
    const panel = color("--panel");
    const existing = chart.getOption();
    chart.setOption({
      xAxis: { axisLine: { lineStyle: { color: border } }, axisLabel: { color: muted },
        splitLine: { lineStyle: { color: border } } },
      yAxis: { axisLine: { lineStyle: { color: border } }, axisLabel: { color: muted },
        splitLine: { lineStyle: { color: border } } },
      ...(existing.legend ? { legend: { textStyle: { color: foreground } } } : {}),
      tooltip: { backgroundColor: panel, borderColor: border, textStyle: { color: foreground } }
    });
  }
  update();
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
