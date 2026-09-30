import type { Bounds2, Point2, PlotProject } from "./types";

export function polygonArea(points: Point2[]): number {
  if (points.length < 3) return 0;

  let twiceArea = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }

  return Math.abs(twiceArea) / 2;
}

export function polygonCentroid(points: Point2[]): Point2 {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) {
    const total = points.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    return { x: total.x / points.length, y: total.y / points.length };
  }

  let signedAreaTimesTwo = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    signedAreaTimesTwo += cross;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }

  if (Math.abs(signedAreaTimesTwo) < 1e-8) {
    return polygonCentroid(points.slice(0, 2));
  }

  return {
    x: cx / (3 * signedAreaTimesTwo),
    y: cy / (3 * signedAreaTimesTwo),
  };
}

export function projectBounds(project: PlotProject): Bounds2 {
  const points = project.plots.flatMap((plot) => plot.polygon);

  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 70 };
  }

  return points.reduce<Bounds2>(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}

export function padBounds(bounds: Bounds2, ratio = 0.08): Bounds2 {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const padX = width * ratio;
  const padY = height * ratio;

  return {
    minX: bounds.minX - padX,
    minY: bounds.minY - padY,
    maxX: bounds.maxX + padX,
    maxY: bounds.maxY + padY,
  };
}

export function formatMoney(value: number | undefined, currency: string): string {
  if (value === undefined) return "Price on request";

  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}
