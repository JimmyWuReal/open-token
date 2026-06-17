declare module "echarts/dist/echarts.esm.min.mjs" {
  export function init(
    element: HTMLElement,
    theme?: string,
    options?: { renderer?: "canvas" | "svg" },
  ): {
    setOption: (option: Record<string, unknown>) => void;
    resize: () => void;
    dispose: () => void;
  };
}
