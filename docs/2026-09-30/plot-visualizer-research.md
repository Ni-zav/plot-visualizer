# Plot visualizer research and implementation direction

Date: 2026-09-30

## Problem

A developer has a static site-plan PDF/JPG/CAD drawing and needs a buyer-facing web experience where each parcel can be explored, filtered, inspected, and kept in sync with real inventory. The desirable end state is similar to Plotex and other interactive masterplan products, but implemented as a reusable open web tool rather than a per-project Unity scene.

The important architectural decision is to separate **geometry**, **inventory**, and **presentation**:

1. Geometry: parcel polygons, roads, amenities, buildings, project boundary.
2. Inventory: plot id, price, area, facing, status, product/house options.
3. Presentation: 2D map, 3D map, labels, filtering, enquiry UI, camera, branding.

Do not encode availability colors or prices into an image/SVG/GLB. They must remain data so an inventory update does not require rebuilding the visual asset.

---

## Plotex teardown

Sources:

- https://plotex.in/
- https://plotex.in/interactive-site-plan
- https://plotex.in/terms-of-service
- https://plotex.in/about
- https://theheritage.plotex.in/

Observed product surface:

- 2D drawing/PDF is converted to an interactive 3D site plan.
- Parcel click/tap reveals number, dimensions, area, status and enquiry actions.
- Availability has multiple live states.
- Orbit/pan/zoom plus first-person exploration.
- Measurement, plot filtering, sharing, screenshots, gallery and location links.
- Lead capture, view analytics, notifications, WhatsApp and CRM functionality.
- Offline/PWA behaviour is marketed for the live viewer.

Important implementation finding:

- Plotex's Terms of Service currently state that conversion is manually performed by their team.
- Plotex says its buyer viewer uses Unity WebGL.

This means automatic PDF understanding is not required to reproduce the core buyer value. A strong authoring/tracing workflow can deliver the same core interactive-inventory result first, with automation added later.

---

## Comparable products / product patterns

These are useful for feature benchmarking, not code reuse:

- PlotAtlas — https://plotatlas.io/
  - image/site-plan based authoring, live lot status, lead capture.
- Planpoint — https://www.planpoint.io/types/interactive-site-plan
  - interactive SVG, live inventory, pricing, 3D/360 integrations.
- Plotforms — https://plotforms.com/
  - CAD/PDF masterplan conversion and interactive plot inventory.
- LotTrackr — https://www.lottrackr.com.au/
  - masterplan inventory, lot dimensions, enquiries and house/land matching.
- Atisbo — https://atisbo.app/en
  - masterplan → building/unit exploration plus 360 and sales intelligence.
- Webverse — https://spimwebverse.com/
  - reusable project platform; uploaded SVG bound to inventory.

The reusable pattern is consistent: **author once, bind to structured inventory, publish many times**.

---

## Open-source projects worth studying

### Site Feasibility Sandbox
https://github.com/desenlin/site-feasibility-sandbox

MIT-licensed code for browser-based site/building geometry editing. It demonstrates a useful zero-backend pattern: local geometry editing, metrics, prepared study areas, and static hosting. It is not a plot-sales platform, but its geometry-tool separation is directly relevant.

### 3D Cadastre Nexus
https://github.com/GeoTecHub/3D-Cadastre

Public source showing Three.js parcel/building visualization, raycasting, GeoJSON parcel data, OSM context, CRS conversion, CityJSON and IFC integration. Its README says the project itself is private/no reusable license, so treat it as architecture research only unless licensing is clarified.

### No complete open-source Plotex clone found

Current searches did not surface a mature, clearly licensed project that combines:
- masterplan authoring,
- plot inventory,
- 2D/3D buyer viewer,
- lead capture,
- CRM,
- and production publishing.

The practical path is therefore composition from established open-source geometry/rendering libraries rather than forking one monolithic application.

---

## Recommended open-source building blocks

### Three.js — chosen for MVP 3D
https://threejs.org/

Why:
- MIT licensed.
- `ExtrudeGeometry` can turn any parcel polygon into a shallow 3D solid.
- `Raycaster` supports click/tap picking.
- OrbitControls gives the expected sales-viewer camera immediately.
- GLTF assets can later add gates, houses, trees, signage and amenities.
- It works with local project coordinates; no geospatial projection is required.

Use it when the source is a drawing/site plan and 3D presentation matters more than a real-world basemap.

### OpenLayers — candidate for advanced 2D authoring
https://openlayers.org/

Its Draw, Modify and Snap interactions are mature and can replace the custom MVP SVG editor when shared-boundary editing, snapping and more GIS-like tooling becomes important.

### MapLibre GL JS — candidate for georeferenced projects
https://maplibre.org/maplibre-gl-js/

Use it when:
- the project must sit on a real basemap,
- coordinates are longitude/latitude,
- nearby roads/POIs matter,
- aerial/satellite context is desired,
- or the client needs conventional GIS navigation.

MapLibre supports fill extrusion and custom Three.js layers. It should be an adapter/view mode, not the canonical plot data model.

### deck.gl — candidate for large geospatial inventories
https://deck.gl/

Its PolygonLayer/GeoJsonLayer can render pickable and extruded polygons efficiently. It is attractive for thousands of plots or multiple developments on one regional map.

### Turf.js — geometry analytics
https://turfjs.org/

Useful once data is georeferenced:
- polygon area,
- centroid,
- distance,
- buffering,
- point-in-polygon,
- intersections.

For the MVP's local planar coordinates, simple shoelace area/centroid calculations avoid unnecessary geodesic semantics.

---

## Why not start with a full GIS stack?

A subdivision/masterplan sales drawing is often an arbitrary local drawing with no CRS. Requiring users to georeference every plan before they can publish creates unnecessary work.

The MVP should accept:

1. a reference image;
2. user-traced polygons in local project coordinates;
3. structured plot metadata.

Later we add an optional transform:

```
local plot coordinates
        ↓ calibration / georeference
GeoJSON / EPSG coordinates
        ↓
MapLibre / OpenLayers / deck.gl
```

The geometry/inventory object should survive that transition.

---

## MVP architecture

```
Project JSON
├── project metadata
├── plan/background metadata
└── plots[]
    ├── id / label
    ├── polygon [{x,y}, ...]
    ├── status
    ├── area
    ├── price
    ├── facing
    ├── dimensions
    └── extrusion

             ┌────────────┐
             │ app state  │
             └──────┬─────┘
                    │
        ┌───────────┴───────────┐
        ↓                       ↓
   2D editor/viewer         Three.js viewer
   SVG polygons             ExtrudeGeometry
   trace + select           raycast + orbit
```

### Canonical coordinate model

Use `x` and `y` in project units. For ordinary projects, authoring should treat one unit as one metre once the plan is calibrated.

The renderer owns axis conversion. Three.js can map local `x/y` to world `x/z`, keeping Y as height.

### Status model

MVP:
- available
- reserved
- booked
- sold

Later:
- unavailable
- hold
- coming-soon
- model/display
- custom status definitions per client

Color is a theme concern. Do not persist RGB values into each plot record.

---

## MVP authoring workflow

1. Open editor.
2. Upload JPG/PNG site plan as tracing reference.
3. Click **Draw plot**.
4. Click polygon vertices around a parcel.
5. Double-click or press Enter to finish.
6. Enter plot number / area / dimensions / price / facing / status.
7. Repeat.
8. Export project JSON.
9. Switch to 3D to inspect the exact same data.

For production, the editor becomes an authenticated internal route and the buyer viewer becomes read-only.

---

## Data ingestion roadmap

### Phase 1 — manual tracing
Most robust starting point. Works with scans and ugly PDFs.

### Phase 2 — SVG
Best next target:
- preserve vector paths,
- map SVG polygon/path ids to plot ids,
- simplify paths,
- let the user confirm detected plots.

### Phase 3 — DXF
Parse closed lightweight polylines from plot/layer conventions. Layer names and block attributes can help infer plot boundaries and labels.

### Phase 4 — PDF vector extraction
If the PDF contains vector geometry, convert/extract paths rather than rasterizing. Text labels can be spatially associated with polygons.

### Phase 5 — raster-assisted extraction
Computer vision can suggest contours, but must remain a human-confirmed workflow because plot drawings contain:
- roads,
- hatching,
- dimensions,
- title blocks,
- overlapping text,
- broken linework,
- scanned distortion.

Avoid promising "AI conversion" before there is a measurable confidence/verification workflow.

---

## Production backend

A useful schema:

```
projects
  id, slug, name, currency, coordinate_mode, published_version

plots
  id, project_id, external_id, label, polygon_json, area_m2,
  price, facing, dimensions, status, version

plot_events
  id, plot_id, visitor_id, event_type, created_at, metadata

leads
  id, project_id, plot_id, name, phone, email, source, status

project_versions
  id, project_id, geometry_json, created_at, published_at
```

Supabase/Postgres is a reasonable first backend, but the public viewer should fetch one cacheable project payload rather than querying each plot independently. This also reduces egress and makes offline/PWA support easier.

Use optimistic concurrency or a server-side transaction when changing `available → reserved/booked` so two salespeople cannot reserve the same plot simultaneously.

---

## Public viewer UX

Minimum buyer view:
- fast initial bird's-eye camera;
- obvious availability legend;
- availability filters;
- plot tap opens one consistent detail sheet;
- deep-link to a plot;
- share/enquire action;
- mobile-first controls;
- optional 2D/3D switch;
- optional north marker and scale;
- no editor controls.

Useful next layer:
- price/area/facing filters;
- compare plots;
- favourites/shortlist;
- measurements;
- amenity proximity;
- house design compatibility;
- gallery and 360;
- cinematic tour mode;
- live sales-agent presence/assistance.

---

## Performance rules

- Keep plot geometry simple; do not model curbs/trees as unique high-poly meshes.
- Reuse materials.
- Use instancing for repeated trees, lamps and houses.
- Compress GLTF with Meshopt/Draco/KTX2 when decorative 3D is introduced.
- Lazy-load decoration after the plot inventory is interactive.
- On mobile, render availability and selection before visual polish.
- Avoid Unity-sized bundles for projects that only need polygon extrusion.
- Keep 2D usable even when WebGL is unavailable.

---

## MVP acceptance criteria

- Runs locally with `npm install && npm run dev`.
- Sample project is visible immediately.
- User can select parcels in both 2D and 3D.
- Selected plot shows its inventory metadata.
- Status filtering works.
- User can change a plot's status/metadata.
- User can draw a new plot in 2D.
- User can upload an image reference for tracing.
- Project can be exported/imported as JSON.
- 3D is generated from the exact same polygon data rather than maintained separately.

---

## Decision

Build the first product as a **masterplan authoring + inventory visualization engine**, not as a GIS app and not as a bespoke Three.js scene.

- **MVP renderer:** custom SVG 2D + Three.js 3D.
- **Canonical format:** local-coordinate project JSON.
- **Next authoring engine if needed:** OpenLayers.
- **Real-world map adapter:** MapLibre GL JS.
- **Large geospatial rendering:** deck.gl.
- **Spatial calculations after georeferencing:** Turf.js.
- **Backend later:** Postgres/Supabase adapter behind a cacheable project endpoint.

This provides the shortest path from a client's static plot map to a maintainable, editable and sellable interactive product.
