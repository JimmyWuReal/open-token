import { useEffect, useRef } from "react";
import * as echarts from "echarts";

type ChartProps = {
  option: Record<string, unknown>;
  className?: string;
};

export function Chart({ option, className = "" }: ChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.setOption(option);

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [option]);

  return <div ref={ref} className={className} />;
}
