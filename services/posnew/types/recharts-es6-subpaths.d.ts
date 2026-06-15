/**
 * Runtime imports use `recharts/es6/...` entry files to avoid loading the full
 * `recharts` barrel (which pulls polar/Pie and can break Turbopack chunk graphs).
 * Recharts ships typings only for the package root; these shims map subpaths to those types.
 */
declare module "recharts/es6/cartesian/Area" {
  export { Area } from "recharts";
}
declare module "recharts/es6/cartesian/Bar" {
  export { Bar } from "recharts";
}
declare module "recharts/es6/cartesian/CartesianGrid" {
  export { CartesianGrid } from "recharts";
}
declare module "recharts/es6/cartesian/Line" {
  export { Line } from "recharts";
}
declare module "recharts/es6/cartesian/XAxis" {
  export { XAxis } from "recharts";
}
declare module "recharts/es6/cartesian/YAxis" {
  export { YAxis } from "recharts";
}
declare module "recharts/es6/chart/AreaChart" {
  export { AreaChart } from "recharts";
}
declare module "recharts/es6/chart/BarChart" {
  export { BarChart } from "recharts";
}
declare module "recharts/es6/chart/LineChart" {
  export { LineChart } from "recharts";
}
declare module "recharts/es6/component/LabelList" {
  export { LabelList } from "recharts";
}
declare module "recharts/es6/component/Legend" {
  export { Legend } from "recharts";
}
declare module "recharts/es6/component/ResponsiveContainer" {
  export { ResponsiveContainer } from "recharts";
}
declare module "recharts/es6/component/Tooltip" {
  export { Tooltip } from "recharts";
}
