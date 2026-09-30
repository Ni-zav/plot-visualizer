export const PLOT_STATUSES = ["available", "reserved", "booked", "sold"] as const;

export type PlotStatus = (typeof PLOT_STATUSES)[number];

export type Point2 = {
  x: number;
  y: number;
};

export type PlotRecord = {
  id: string;
  label: string;
  polygon: Point2[];
  status: PlotStatus;
  areaM2: number;
  price?: number;
  facing?: string;
  dimensions?: string;
  extrusionM?: number;
  notes?: string;
};

export type PlotProject = {
  id: string;
  name: string;
  currency: string;
  unitScaleM: number;
  backgroundImage?: string;
  plots: PlotRecord[];
};

export type Bounds2 = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
