# Plot Visualizer

Browser-based authoring and sales viewer for interactive land/lot availability maps.

The long-term goal is a reusable alternative to one-off Plotex-style builds: trace a site plan once, bind each plot to structured inventory data, and publish a fast 2D/3D viewer that can later connect to a CRM, Supabase/Postgres, or a developer's existing inventory system.

## MVP

This repository starts with an intentionally small browser-first MVP:

- **2D plot editor** using one local coordinate system.
- **3D plot viewer** generated from the same polygon data with Three.js.
- Plot states: `available`, `reserved`, `booked`, `sold`.
- Click/tap a plot to inspect number, area, price, facing, dimensions, and status.
- Filter inventory by availability state.
- Draw new polygons in 2D.
- Edit selected plot metadata.
- Import/export a portable JSON project.
- Upload a plan image as a local tracing reference.
- Browser-only persistence for prototyping; no backend is required.

## Why local coordinates first?

Most sales masterplans begin as PDF/JPG/CAD drawings, not geospatial GIS datasets. The authoring model therefore uses simple project units (`x/y`, normally treated as metres). This makes PDF/image tracing and 3D extrusion straightforward.

A future GIS adapter can convert GeoJSON/longitude-latitude into the same internal model. See [the research and architecture notes](docs/2026-09-30/plot-visualizer-research.md).

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## Core data model

Every plot is a polygon plus sales metadata:

```ts
{
  id: "A-01",
  label: "A-01",
  status: "available",
  polygon: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 20 }, { x: 0, y: 20 }],
  areaM2: 240,
  price: 850000000,
  facing: "North",
  dimensions: "12 × 20 m",
  extrusionM: 0.45
}
```

That same record is rendered by both the 2D and 3D views. Status is data, not baked into an SVG or 3D model.

## Next milestones

1. Vertex drag/edit + snapping and shared-boundary tools.
2. PDF/SVG/DXF ingestion and assisted polygon extraction.
3. Roads, amenities, labels, phase boundaries, and landscaping layers.
4. GeoJSON/MapLibre mode for genuinely georeferenced developments.
5. Backend adapter (Supabase/Postgres) with live inventory updates.
6. Public share links, per-plot enquiry capture, analytics, and CRM hooks.
7. Optional GLTF buildings/landscape assets and cinematic camera presets.
8. Offline/PWA packaging.

## Research

The initial product/technology research is in:

- [docs/2026-09-30/plot-visualizer-research.md](docs/2026-09-30/plot-visualizer-research.md)
