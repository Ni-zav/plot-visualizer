import type { PlotProject, PlotRecord, PlotStatus } from "./types";

function plot(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  status: PlotStatus,
  price: number,
  facing: string,
): PlotRecord {
  return {
    id,
    label: id,
    status,
    polygon: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    areaM2: width * height,
    price,
    facing,
    dimensions: `${width} × ${height} m`,
    extrusionM: 0.6,
  };
}

export const sampleProject: PlotProject = {
  id: "demo-garden-residence",
  name: "Garden Residence — Demo",
  currency: "IDR",
  unitScaleM: 1,
  plots: [
    plot("A-01", 0, 0, 12, 20, "available", 840_000_000, "North"),
    plot("A-02", 12.5, 0, 12, 20, "reserved", 860_000_000, "North"),
    plot("A-03", 25, 0, 12, 20, "available", 880_000_000, "North"),
    plot("A-04", 37.5, 0, 12, 20, "sold", 900_000_000, "North"),
    plot("B-01", 0, 30, 12, 20, "booked", 820_000_000, "South"),
    plot("B-02", 12.5, 30, 12, 20, "available", 830_000_000, "South"),
    plot("B-03", 25, 30, 12, 20, "available", 850_000_000, "South"),
    plot("B-04", 37.5, 30, 12, 20, "reserved", 870_000_000, "South"),
  ],
};
