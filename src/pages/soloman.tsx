import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  MapContainer,
  Marker,
  Tooltip,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
  LayersControl,
  LayerGroup,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat";

// ==========================
// GLOBAL CSS INJECTION
// ==========================
const injectCSS = () => {
  if (document.getElementById("soloman-styles")) return;
  const style = document.createElement("style");
  style.id = "soloman-styles";
  style.innerHTML = `
    @keyframes pulse-ring {
      0% { transform: scale(0.9); opacity: 0.5; }
      50% { transform: scale(1.15); opacity: 0.15; }
      100% { transform: scale(0.9); opacity: 0.5; }
    }

    @keyframes pulse-dot {
      0% { transform: scale(1); }
      50% { transform: scale(1.08); }
      100% { transform: scale(1); }
    }

  .leaflet-marker-pane {
      z-index: 650!important;
    }

  .leaflet-pane.leaflet-tooltip-pane {
      z-index: 1000!important;
    }

  .leaflet-tooltip {
      overflow: visible!important;
      z-index: 1000!important;
    }

  .soloman-tooltip-pane {
      background: transparent!important;
      border: none!important;
      box-shadow: none!important;
      padding: 0!important;
      overflow: visible!important;
      z-index: 1000!important;
    }

  .soloman-tooltip-pane::before {
      display: none!important;
    }

  .pulse-marker-wrap {
      pointer-events: auto;
      z-index: 600;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

  .pulse-marker-ring {
      position: absolute;
      border-radius: 50%;
      animation: pulse-ring 3.2s ease-in-out infinite;
      z-index: 1;
      pointer-events: none;
      opacity: 0.4;
    }

  .pulse-marker-dot {
      border-radius: 50%;
      border: 1.5px solid rgba(255,255,255,0.85);
      animation: pulse-dot 3.2s ease-in-out infinite;
      position: relative;
      z-index: 2;
      pointer-events: none;
      opacity: 0.9;
    }

  .leaflet-div-icon {
      background: transparent!important;
      border: none!important;
    }

  .custom-marker {
      background: transparent!important;
      border: none!important;
    }
  `;
  document.head.appendChild(style);
};

// ==========================
// TYPES
// ==========================
type HeatPoint = [number, number, number];

type Feature = {
  geometry: {
    coordinates: [number, number];
  };
  properties: {
    NDVI: number;
    LULC: number;
    SOIL: number;
    WATER: number;
  };
};

type DensePoint = {
  lat: number;
  lng: number;
  feature: Feature;
};

// ==========================
// LABELS
// ==========================
const LULC_LABELS: Record<number, string> = {
  10: "Tree Cover",
  20: "Shrubland",
  30: "Grassland",
  40: "Cropland",
  50: "Built-up",
  60: "Bare",
  80: "Water",
};

const SOIL_LABELS: Record<number, string> = {
  1: "Sand",
  2: "Loamy Sand",
  3: "Sandy Loam",
  4: "Loam",
  5: "Silt Loam",
  6: "Clay",
};

const LULC_WEIGHT: Record<number, number> = {
  10: 1.0,
  20: 0.8,
  30: 0.6,
  40: 0.5,
  50: 0.3,
  60: 0.2,
  80: 0.1,
};

const SOIL_WEIGHT: Record<number, number> = {
  6: 1.0,
  5: 0.8,
  4: 0.7,
  3: 0.5,
  2: 0.3,
  1: 0.2,
};

// ==========================
// GRADIENTS
// ==========================
const GRADIENTS: Record<string, Record<string, string>> = {
  ndvi: {
    "0.0": "blue",
    "0.3": "cyan",
    "0.5": "yellow",
    "0.7": "orange",
    "1.0": "red",
  },
  lulc: {
    "0.0": "#d9f99d",
    "0.5": "#65a30d",
    "1.0": "#14532d",
  },
  soil: {
    "0.0": "#fef3c7",
    "0.5": "#d97706",
    "1.0": "#78350f",
  },
  water: {
    "0.0": "#bfdbfe",
    "0.5": "#3b82f6",
    "1.0": "#1e3a8a",
  },
};

// ==========================
// NDVI COLORS
// ==========================
const getNDVIColor = (ndvi: number): string => {
  if (ndvi >= 0.75) return "#10b981";
  if (ndvi >= 0.55) return "#34d399";
  if (ndvi >= 0.35) return "#facc15";
  if (ndvi >= 0.15) return "#fb923c";
  return "#ef4444";
};

const getNDVIGlow = (ndvi: number): string => {
  if (ndvi >= 0.75) return "rgba(16,185,129,0.18)";
  if (ndvi >= 0.55) return "rgba(52,211,153,0.16)";
  if (ndvi >= 0.35) return "rgba(250,204,21,0.14)";
  if (ndvi >= 0.15) return "rgba(251,146,60,0.12)";
  return "rgba(239,68,68,0.10)";
};

// ==========================
// MARKER SIZE BY ZOOM (FIXED SCALING)
// ==========================
const getMarkerSize = (zoom: number): number => {
  if (zoom < 6) return 18;
  if (zoom < 8) return 20;
  if (zoom < 10) return 24;
  if (zoom < 12) return 28;
  if (zoom < 14) return 32;
  if (zoom < 16) return 36;
  if (zoom < 18) return 42;
  return 48;
};

// ==========================
// CUSTOM MARKER ICON
// ==========================
const iconCache = new Map<string, L.DivIcon>();

const getMarkerIcon = (ndvi: number, size: number): L.DivIcon => {
  const color = getNDVIColor(ndvi);
  const cacheKey = `${color}-${size}`;

  if (iconCache.has(cacheKey)) return iconCache.get(cacheKey)!;

  const glow = getNDVIGlow(ndvi);
  const ringSize = Math.round(size * 3.5);
  const half = Math.round(ringSize / 2);

  const icon = L.divIcon({
    className: "custom-marker",
    html: `
<div class="pulse-marker-wrap" style="width:${ringSize}px;height:${ringSize}px;">

  <div class="pulse-marker-ring"
    style="
      width:${ringSize}px;
      height:${ringSize}px;
      background:${glow};
      box-shadow: 0 0 ${size * 0.6}px ${glow};
    ">
  </div>

  <div class="pulse-marker-dot"
    style="
      width:${size}px;
      height:${size}px;
      background:${color};
      box-shadow: 0 0 ${size * 0.4}px ${color}, 0 0 ${size * 0.8}px ${glow};
    ">
  </div>

</div>
`,
    iconSize: [ringSize, ringSize],
    iconAnchor: [half, half],
    tooltipAnchor: [half + 4, 0],
  });

  iconCache.set(cacheKey, icon);
  return icon;
};

// ==========================
// SEEDED JITTER
// ==========================
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDensePoints(features: Feature[]): DensePoint[] {
  const points: DensePoint[] = [];
  const COPIES = 8;
  const OFFSET = 0.02;

  features.forEach((f, fi) => {
    const [lng, lat] = f.geometry.coordinates;
    points.push({ lat, lng, feature: f });
    for (let c = 0; c < COPIES; c++) {
      const seed1 = fi * 100 + c * 7;
      const seed2 = fi * 100 + c * 13 + 1;
      const jLat = lat + (seededRandom(seed1) - 0.5) * OFFSET * 2;
      const jLng = lng + (seededRandom(seed2) - 0.5) * OFFSET * 2;
      points.push({ lat: jLat, lng: jLng, feature: f });
    }
  });

  return points;
}

// ==========================
// PANES
// ==========================
function MapPanes() {
  const map = useMap();

  if (!map.getPane("tooltipPaneCustom")) {
    const pane = map.createPane("tooltipPaneCustom");
    pane.style.zIndex = "1000";
  }
  useEffect(() => {
    if (!map.getPane("heatmap")) {
      const p = map.createPane("heatmap");
      p.style.zIndex = "350";
    }
    if (!map.getPane("boundary")) {
      const p = map.createPane("boundary");
      p.style.zIndex = "400";
    }
    if (!map.getPane("markers")) {
      const p = map.createPane("markers");
      p.style.zIndex = "650";
    }
  }, [map]);
  return null;
}

// ==========================
// HEATMAP LAYER (FIXED)
// ==========================
function HeatmapLayer({
  points,
  gradient,
  opacity,
}: {
  points: HeatPoint[];
  gradient: Record<string, string>;
  opacity: number;
}) {
  const map = useMap();
  const heatRef = useRef<any>(null);

  useEffect(() => {
    if (!points.length) return;
    const heat = (L as any).heatLayer(points, {
      radius: 50,
      blur: 40,
      maxZoom: 14,
      minOpacity: 0.5,
      gradient,
      pane: "heatmap",
    });
    heatRef.current = heat;
    heat.addTo(map);
    return () => {
      map.removeLayer(heat);
      heatRef.current = null;
    };
  }, [points, map, gradient]);

  useEffect(() => {
    const pane = map.getPane("heatmap");
    if (pane) {
      pane.style.opacity = String(opacity);
      pane.style.display = opacity > 0? "" : "none";
    }
  }, [opacity, map]);

  return null;
}

// ==========================
// ZOOM TRACKER
// ==========================
function ZoomTracker({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  useMapEvents({
    zoomend: (e) => onZoomChange(e.target.getZoom()),
  });
  return null;
}

// ==========================
// ACTIVE LAYER CONTROLLER
// ==========================
function ActiveLayerController({ onLayerChange }: { onLayerChange: (layer: string) => void }) {
  const map = useMap();
  useEffect(() => {
    const handleOverlayAdd = (e: any) => {
      const n = e.name;
      if (n === "NDVI Heatmap") onLayerChange("ndvi");
      else if (n === "LULC Heatmap") onLayerChange("lulc");
      else if (n === "Soil Heatmap") onLayerChange("soil");
      else if (n === "Water Heatmap") onLayerChange("water");
    };
    map.on("overlayadd", handleOverlayAdd);
    return () => { map.off("overlayadd", handleOverlayAdd); };
  }, [map, onLayerChange]);
  return null;
}

// ==========================
// FIT BOUNDS
// ==========================
function FitBounds({ data }: { data: Feature[] }) {
  const map = useMap();
  useEffect(() => {
    if (!data.length) return;
    const bounds = L.latLngBounds(
      data.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]])
    );
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [data, map]);
  return null;
}

// ==========================
// TOOLTIP CONTENT
// ==========================
function PointTooltip({ feature, lat, lng }: { feature: Feature; lat: number; lng: number }) {
  return (
    <div style={{
      background: "rgba(5,5,10,0.96)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: "10px",
      padding: "10px 13px",
      width: "185px",
      fontSize: "11px",
      color: "#fff",
      boxShadow: "0 10px 40px rgba(0,0,0,0.9)",
      lineHeight: 1.5,
      isolation: "isolate",
      position: "relative",
      zIndex: 9999,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
        <span>📍</span>
        <span style={{ fontWeight: 700, letterSpacing: "0.04em", fontSize: "12px" }}>Location</span>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: "10px", marginBottom: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#6b7280" }}>Lat</span>
          <span style={{ color: "#e5e7eb" }}>{lat.toFixed(6)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#6b7280" }}>Lng</span>
          <span style={{ color: "#e5e7eb" }}>{lng.toFixed(6)}</span>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginBottom: "6px" }} />
      {[
        { icon: "🌿", label: "NDVI", value: feature.properties.NDVI.toFixed(2), color: getNDVIColor(feature.properties.NDVI) },
        { icon: "🌍", label: "Land Use", value: LULC_LABELS[feature.properties.LULC] || "Unknown" },
        { icon: "🌱", label: "Soil", value: SOIL_LABELS[feature.properties.SOIL] || "Unknown" },
        { icon: "💧", label: "Water", value: `${feature.properties.WATER}%` },
      ].map(({ icon, label, value, color }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span>{icon}</span>
            <span style={{ color: "#9ca3af" }}>{label}</span>
          </span>
          <span style={{ fontWeight: 600, color: color || "#f3f4f6", textAlign: "right", maxWidth: "95px" }}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ==========================
// GEO POINTS LAYER (NO CLUSTERING)
// ==========================
function GeoPointsLayer({ densePoints, zoom }: { densePoints: DensePoint[]; zoom: number }) {
  const size = getMarkerSize(zoom);

  const markers = useMemo(() =>
    densePoints.map((pt, i) => (
      <Marker
        key={`m-${i}`}
        position={[pt.lat, pt.lng]}
        icon={getMarkerIcon(pt.feature.properties.NDVI, size)}
        pane="markers"
        riseOnHover={true}
        riseOffset={1000}
      >
        <Tooltip
          pane="tooltipPaneCustom"
          direction="top"
          offset={[0, -12]}
          opacity={1}
          permanent={false}
          sticky={true}
          className="soloman-tooltip-pane"
        >
          <PointTooltip
            feature={pt.feature}
            lat={pt.feature.geometry.coordinates[1]}
            lng={pt.feature.geometry.coordinates[0]}
          />
        </Tooltip>
      </Marker>
    )),
    [densePoints, size]
  );

  return <>{markers}</>;
}

// ==========================
// MAIN
// ==========================
export default function Soloman() {
  const [data, setData] = useState<Feature[]>([]);
  const [boundary, setBoundary] = useState<any>(null);
  const [activeLayer, setActiveLayer] = useState<"ndvi" | "lulc" | "soil" | "water">("ndvi");
  const [zoom, setZoom] = useState(6);

  useEffect(() => { injectCSS(); }, []);

  useEffect(() => {
    fetch("/solomon_points_env.geojson")
   .then((r) => r.json())
   .then((j) => setData(j.features));
    fetch("https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries/SLB.geojson")
   .then((r) => r.json())
   .then((j) => setBoundary(j));
  }, []);

  const densePoints = useMemo(() => generateDensePoints(data), [data]);

  const heatPoints: HeatPoint[] = useMemo(() =>
    data.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0], f.properties.NDVI || 0]),
    [data]);
  const lulcPoints: HeatPoint[] = useMemo(() =>
    data.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0], LULC_WEIGHT[f.properties.LULC]?? 0]),
    [data]);
  const soilPoints: HeatPoint[] = useMemo(() =>
    data.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0], SOIL_WEIGHT[f.properties.SOIL]?? 0]),
    [data]);
  const waterPoints: HeatPoint[] = useMemo(() =>
    data.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0], (f.properties.WATER || 0) / 100]),
    [data]);

  const activeHeatPoints = useMemo(() => {
    if (activeLayer === "ndvi") return heatPoints;
    if (activeLayer === "lulc") return lulcPoints;
    if (activeLayer === "soil") return soilPoints;
    return waterPoints;
  }, [activeLayer, heatPoints, lulcPoints, soilPoints, waterPoints]);

  const avgNDVI = useMemo(() => {
    if (!data.length) return 0;
    return data.reduce((acc, f) => acc + (f.properties.NDVI || 0), 0) / data.length;
  }, [data]);

  const getBoundaryColor = (ndvi: number) => {
    if (ndvi < 0.3) return "#1e3a8a";
    if (ndvi < 0.5) return "#10b981";
    if (ndvi < 0.7) return "#eab308";
    return "#ef4444";
  };

  const handleLayerChange = useCallback((layer: string) => {
    setActiveLayer(layer as "ndvi" | "lulc" | "soil" | "water");
  }, []);

  const handleZoomChange = useCallback((z: number) => { setZoom(z); }, []);

  const heatmapOpacity = useMemo(() => {
    if (zoom < 8) return 1.0;
    if (zoom <= 10) return 0.6;
    if (zoom <= 13) return 0.3;
    return 0.15;
  }, [zoom]);

  return (
    <div className="h-screen w-full bg-black">
      <MapContainer
        center={[-9.5, 160]}
        zoom={6}
        maxZoom={22}
        className="h-full w-full"
        preferCanvas={true}
      >
        <MapPanes />
        <ZoomTracker onZoomChange={handleZoomChange} />
        <ActiveLayerController onLayerChange={handleLayerChange} />

        <HeatmapLayer
          points={activeHeatPoints}
          gradient={GRADIENTS[activeLayer]}
          opacity={heatmapOpacity}
        />

        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Hybrid Map">
            <LayerGroup>
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={22}
                maxNativeZoom={19}
              />
              <TileLayer
                url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                maxZoom={22}
                maxNativeZoom={19}
              />
            </LayerGroup>
          </LayersControl.BaseLayer>

          <LayersControl.Overlay checked name="NDVI Heatmap">
            <LayerGroup />
          </LayersControl.Overlay>
          <LayersControl.Overlay name="LULC Heatmap">
            <LayerGroup />
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Soil Heatmap">
            <LayerGroup />
          </LayersControl.Overlay>
          <LayersControl.Overlay name="Water Heatmap">
            <LayerGroup />
          </LayersControl.Overlay>

          <LayersControl.Overlay checked name="Geo Points">
            <LayerGroup>
              <GeoPointsLayer densePoints={densePoints} zoom={zoom} />
            </LayerGroup>
          </LayersControl.Overlay>

          {boundary && (
            <LayersControl.Overlay checked name="Boundary">
              <GeoJSON
                data={boundary}
                pane="boundary"
                style={() => ({
                  color: "#ffffff",
                  weight: 2.5,
                  fillColor: getBoundaryColor(avgNDVI),
                  fillOpacity: 0.16,
                })}
              />
            </LayersControl.Overlay>
          )}
        </LayersControl>

        <FitBounds data={data} />
      </MapContainer>
    </div>
  );
}
