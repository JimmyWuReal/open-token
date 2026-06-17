import { useEffect, useRef } from "react";

type ChartProps = {
  option: Record<string, unknown>;
  className?: string;
};

export function Chart({ option, className = "" }: ChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let disposed = false;
    let chart: { setOption: (option: Record<string, unknown>) => void; resize: () => void; dispose: () => void } | undefined;

    const resize = () => chart?.resize();
    import("echarts/dist/echarts.esm.min.mjs").then((echarts) => {
      if (!ref.current || disposed) return;
      chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
      chart.setOption(option);
      window.addEventListener("resize", resize);
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      chart?.dispose();
    };
  }, [option]);

  return (
    <div ref={ref} className={className}>
      <div className="flex h-full items-center justify-center text-xs font-medium uppercase text-muted">Loading chart engine</div>
    </div>
  );
}
