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

    @keyframes bar-fill {
      from { height: 0%; opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes fade-slide-in {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    @keyframes shimmer {
      0%   { background-position: -200% center; }
      100% { background-position:  200% center; }
    }

    .leaflet-marker-pane { z-index: 650!important; }
    .leaflet-pane.leaflet-tooltip-pane { z-index: 1000!important; }
    .leaflet-tooltip { overflow: visible!important; z-index: 1000!important; }
    .soloman-tooltip-pane {
      background: transparent!important;
      border: none!important;
      box-shadow: none!important;
      padding: 0!important;
      overflow: visible!important;
      z-index: 1000!important;
    }
    .soloman-tooltip-pane::before { display: none!important; }

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
    .leaflet-div-icon { background: transparent!important; border: none!important; }
    .custom-marker { background: transparent!important; border: none!important; }

    /* ---- Indicator Panel ---- */
    .indicator-panel {
      position: absolute;
      bottom: 36px;
      left: 16px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }

    .indicator-card {
      pointer-events: auto;
      width: 152px;
      background: rgba(8, 8, 16, 0.78);
      backdrop-filter: blur(18px) saturate(1.4);
      -webkit-backdrop-filter: blur(18px) saturate(1.4);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 14px;
      padding: 12px 12px 10px 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07);
      animation: fade-slide-in 0.35s ease both;
      transition: border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .indicator-card:hover {
      border-color: rgba(255,255,255,0.22);
      box-shadow: 0 12px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1);
    }

    .indicator-title {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.55);
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .indicator-title-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* ---- Card value / status block ---- */
    .card-value-block {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 10px;
    }

    .bar-value {
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
      transition: color 0.4s ease;
    }

    .bar-unit {
      font-size: 10px;
      color: rgba(255,255,255,0.35);
      font-weight: 500;
      margin-top: 1px;
    }

    .bar-status {
      margin-top: 5px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 4px;
      display: inline-block;
      transition: background 0.4s ease, color 0.4s ease;
    }

    .status-good   { background: rgba(52,211,153,0.15); color: #34d399; }
    .status-medium { background: rgba(253,224,71,0.14);  color: #fde047; }
    .status-bad    { background: rgba(248,113,113,0.14); color: #f87171; }

    /* Active layer accent glow on card */
    .card-active-ndvi  { border-color: rgba(52,211,153,0.35); box-shadow: 0 0 16px rgba(52,211,153,0.12), 0 8px 32px rgba(0,0,0,0.55); }
    .card-active-lulc  { border-color: rgba(74,222,128,0.35); box-shadow: 0 0 16px rgba(74,222,128,0.12), 0 8px 32px rgba(0,0,0,0.55); }
    .card-active-soil  { border-color: rgba(251,191,36,0.35);  box-shadow: 0 0 16px rgba(251,191,36,0.12),  0 8px 32px rgba(0,0,0,0.55); }
    .card-active-water { border-color: rgba(96,165,250,0.35);  box-shadow: 0 0 16px rgba(96,165,250,0.12),  0 8px 32px rgba(0,0,0,0.55); }

    /* ---- Horizontal segmented bar ---- */
    .horizontal-bar {
      width: 100%;
      height: 8px;
      display: flex;
      border-radius: 6px;
      overflow: hidden;
      margin-top: 8px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.08);
    }

    .bar-segment {
      height: 100%;
      transition: width 0.6s ease;
      min-width: 0;
    }
    .bar-segment.green  { background: #34d399; }
    .bar-segment.yellow { background: #fde047; }
    .bar-segment.red    { background: #f87171; }
  `;
  document.head.appendChild(style);
};

// ==========================
// TYPES & CONSTANTS
// ==========================
type LayerType = "ndvi" | "lulc" | "soil" | "water";
type HeatPoint = [number, number, number];

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: { NDVI: number; LULC: number; SOIL: number; WATER: number };
};

type DensePoint = { lat: number; lng: number; feature: Feature };

const LULC_LABELS: Record<number, string> = {
  10: "Tree Cover", 20: "Shrubland", 30: "Grassland",
  40: "Cropland", 50: "Built-up", 60: "Bare", 80: "Water",
};

const SOIL_LABELS: Record<number, string> = {
  1: "Sand", 2: "Loamy Sand", 3: "Sandy Loam", 4: "Loam", 5: "Silt Loam", 6: "Clay",
};

const LULC_WEIGHT: Record<number, number> = {
  10: 1.0, 20: 0.8, 30: 0.6, 40: 0.5, 50: 0.3, 60: 0.2, 80: 0.1,
};

const SOIL_WEIGHT: Record<number, number> = {
  6: 1.0, 5: 0.8, 4: 0.7, 3: 0.5, 2: 0.3, 1: 0.2,
};

const GRADIENTS: Record<string, Record<string, string>> = {
  ndvi:  { "0.0": "blue", "0.3": "cyan", "0.5": "yellow", "0.7": "orange", "1.0": "red" },
  lulc:  { "0.0": "#d9f99d", "0.5": "#65a30d", "1.0": "#14532d" },
  soil:  { "0.0": "#fef3c7", "0.5": "#d97706", "1.0": "#78350f" },
  water: { "0.0": "#bfdbfe", "0.5": "#3b82f6", "1.0": "#1e3a8a" },
};

// Per-layer accent colours used for bar fills & title dots
const LAYER_ACCENT: Record<LayerType, { from: string; to: string; dot: string }> = {
  ndvi:  { from: "#065f46", to: "#34d399", dot: "#34d399" },
  lulc:  { from: "#14532d", to: "#4ade80", dot: "#4ade80" },
  soil:  { from: "#78350f", to: "#fbbf24", dot: "#fbbf24" },
  water: { from: "#1e3a8a", to: "#60a5fa", dot: "#60a5fa" },
};

// ==========================
// STATUS COUNTS TYPE
// ==========================
type StatusCounts = { good: number; medium: number; bad: number; total: number };
type AllCounts = Record<LayerType, StatusCounts>;

// Per-layer human-readable legend copy
const LAYER_LEGEND: Record<LayerType, { green: string; yellow: string; red: string }> = {
  ndvi:  { green: "Dense vegetation",    yellow: "Moderate vegetation", red: "Sparse vegetation"   },
  water: { green: "High water availability", yellow: "Medium water",    red: "Low water"           },
  soil:  { green: "Fertile soil",         yellow: "Moderate soil",      red: "Poor soil"           },
  lulc:  { green: "Natural land (forest)", yellow: "Semi-natural",      red: "Built-up / degraded" },
};

// Silence unused-variable warning for LAYER_LEGEND while keeping it available
void LAYER_LEGEND;

// ==========================
// STATUS HELPERS
// ==========================
type StatusInfo = { label: "Good" | "Medium" | "Bad"; cls: string; color: string; fillPct: number };

/**
 * Normalise any raw value to 0-1 and derive status.
 */
function getStatusInfo(rawValue: number, type: LayerType): StatusInfo {
  let norm: number;
  if (type === "ndvi") {
    norm = Math.min(Math.max(rawValue ?? 0, 0), 1);
    if (norm >= 0.6) return { label: "Good",   cls: "status-good",   color: "#34d399", fillPct: norm * 100 };
    if (norm >= 0.3) return { label: "Medium", cls: "status-medium", color: "#fde047", fillPct: norm * 100 };
    return           { label: "Bad",    cls: "status-bad",    color: "#f87171", fillPct: norm * 100 };
  }
  if (type === "water") {
    norm = Math.min(Math.max(rawValue ?? 0, 0), 100) / 100;
    if (norm >= 0.7) return { label: "Good",   cls: "status-good",   color: "#34d399", fillPct: norm * 100 };
    if (norm >= 0.3) return { label: "Medium", cls: "status-medium", color: "#fde047", fillPct: norm * 100 };
    return           { label: "Bad",    cls: "status-bad",    color: "#f87171", fillPct: norm * 100 };
  }
  // lulc / soil — value already 0-1 weight
  norm = Math.min(Math.max(rawValue ?? 0, 0), 1);
  if (norm >= 0.7) return { label: "Good",   cls: "status-good",   color: "#34d399", fillPct: norm * 100 };
  if (norm >= 0.4) return { label: "Medium", cls: "status-medium", color: "#fde047", fillPct: norm * 100 };
  return           { label: "Bad",    cls: "status-bad",    color: "#f87171", fillPct: norm * 100 };
}

const getStatusColor = (val: number, type: LayerType): string => getStatusInfo(val, type).color;

const getStatusGlow = (val: number, type: LayerType): string => {
  const color = getStatusColor(val, type);
  return color === "#34d399" ? "rgba(52,211,153,0.2)" :
         color === "#fde047" ? "rgba(250,204,21,0.18)" : "rgba(239,68,68,0.15)";
};

// ==========================
// SEGMENT BAR HELPERS
// ==========================

/**
 * Distributes three counts into pixel-safe percentages that:
 *   1. Always sum to exactly 100 when total > 0.
 *   2. Give every non-zero bucket at least MIN_PCT width so segments are visible.
 *   3. Return [0, 0, 0] when total === 0 (shows only the grey background track).
 */
const MIN_PCT = 4; // minimum visible width in %

function calcBarWidths(
  good: number,
  medium: number,
  bad: number,
  total: number
): [number, number, number] {
  if (total === 0) return [0, 0, 0];

  // Raw proportions
  const rawG = (good   / total) * 100;
  const rawM = (medium / total) * 100;
  const rawB = (bad    / total) * 100;

  // Elevate non-zero buckets to at least MIN_PCT
  const adjG = good   > 0 ? Math.max(rawG, MIN_PCT) : 0;
  const adjM = medium > 0 ? Math.max(rawM, MIN_PCT) : 0;
  const adjB = bad    > 0 ? Math.max(rawB, MIN_PCT) : 0;

  const sum = adjG + adjM + adjB;

  // Normalise so they sum to exactly 100
  const factor = 100 / sum;
  const finalG = parseFloat((adjG * factor).toFixed(2));
  const finalM = parseFloat((adjM * factor).toFixed(2));
  // Give remainder to bad to avoid floating-point drift
  const finalB = parseFloat((100 - finalG - finalM).toFixed(2));

  return [finalG, finalM, finalB];
}

// ==========================
// INDICATOR CARD COMPONENT
// ==========================
type IndicatorCardProps = {
  id: LayerType;
  label: string;
  displayValue: string;
  unit?: string;
  rawForStatus: number;
  isActive: boolean;
  counts: StatusCounts;
};

const IndicatorCard = ({
  id, label, displayValue, unit, rawForStatus, isActive, counts,
}: IndicatorCardProps) => {
  const status     = getStatusInfo(rawForStatus, id);
  const accent     = LAYER_ACCENT[id];
  const { good, medium, bad, total } = counts;

  const activeClass = isActive ? `card-active-${id}` : "";

  const [wG, wM, wB] = calcBarWidths(good, medium, bad, total);

  return (
    <div className={`indicator-card ${activeClass}`}>

      {/* ── Title ── */}
      <div className="indicator-title">
        <span className="indicator-title-dot" style={{ background: accent.dot }} />
        {label}
      </div>

      {/* ── Value + status ── */}
      <div className="card-value-block">
        <span className="bar-value" style={{ color: status.color }}>{displayValue}</span>
        {unit && <span className="bar-unit">{unit}</span>}
        <span className={`bar-status ${status.cls}`}>{status.label}</span>
      </div>

      {/* ── Horizontal segmented bar ── */}
      <div
        className="horizontal-bar"
        title={`Good: ${wG.toFixed(0)}% | Medium: ${wM.toFixed(0)}% | Bad: ${wB.toFixed(0)}%`}
      >
        {total > 0 ? (
          <>
            <div className="bar-segment green"  style={{ width: `${wG}%` }} />
            <div className="bar-segment yellow" style={{ width: `${wM}%` }} />
            <div className="bar-segment red"    style={{ width: `${wB}%` }} />
          </>
        ) : (
          /* No data yet — render a subtle full-width placeholder */
          <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.06)" }} />
        )}
      </div>

    </div>
  );
};

// ==========================
// DYNAMIC INDICATOR PANEL
// ==========================
type IndicatorPanelProps = {
  activeLayers: Set<LayerType>;
  activeLayer: LayerType;
  avgNDVI: number;
  avgWATER: number;
  avgLULC: number;
  avgSOIL: number;
  counts: AllCounts;
};

const IndicatorPanel = ({
  activeLayers,
  activeLayer,
  avgNDVI,
  avgWATER,
  avgLULC,
  avgSOIL,
  counts,
}: IndicatorPanelProps) => {
  const cards: {
    id: LayerType;
    label: string;
    displayValue: string;
    unit?: string;
    rawForStatus: number;
  }[] = [
    { id: "ndvi",  label: "NDVI",      displayValue: avgNDVI.toFixed(2),  unit: "index",          rawForStatus: avgNDVI  },
    { id: "lulc",  label: "Land Use",  displayValue: avgLULC.toFixed(2),  unit: "weight",         rawForStatus: avgLULC  },
    { id: "soil",  label: "Soil",      displayValue: avgSOIL.toFixed(2),  unit: "weight",         rawForStatus: avgSOIL  },
    { id: "water", label: "Water",     displayValue: avgWATER.toFixed(0), unit: "% availability", rawForStatus: avgWATER },
  ];

  const visibleCards = cards.filter((c) => activeLayers.has(c.id));
  if (!visibleCards.length) return null;

  return (
    <div className="indicator-panel">
      {visibleCards.map((card) => (
        <IndicatorCard
          key={card.id}
          {...card}
          isActive={card.id === activeLayer}
          counts={counts[card.id]}
        />
      ))}
    </div>
  );
};

// ==========================
// MARKER LOGIC
// ==========================
const getMarkerSize = (zoom: number): number => {
  if (zoom < 6) return 18; if (zoom < 8) return 20; if (zoom < 10) return 24;
  if (zoom < 12) return 28; if (zoom < 14) return 32; if (zoom < 16) return 36;
  if (zoom < 18) return 42; return 48;
};

const iconCache = new Map<string, L.DivIcon>();

const getMarkerIcon = (feature: Feature, size: number, activeLayer: LayerType): L.DivIcon => {
  const val = activeLayer === "ndvi"  ? feature.properties.NDVI  :
              activeLayer === "lulc"  ? feature.properties.LULC  :
              activeLayer === "soil"  ? feature.properties.SOIL  : feature.properties.WATER;

  const color = getStatusColor(val, activeLayer);
  const cacheKey = `${color}-${size}`;

  if (iconCache.has(cacheKey)) return iconCache.get(cacheKey)!;

  const glow = getStatusGlow(val, activeLayer);
  const ringSize = Math.round(size * 3.5);
  const half = Math.round(ringSize / 2);

  const icon = L.divIcon({
    className: "custom-marker",
    html: `
      <div class="pulse-marker-wrap" style="width:${ringSize}px;height:${ringSize}px;">
        <div class="pulse-marker-ring" style="width:${ringSize}px;height:${ringSize}px;background:${glow};box-shadow: 0 0 ${size * 0.6}px ${glow};"></div>
        <div class="pulse-marker-dot" style="width:${size}px;height:${size}px;background:${color};box-shadow: 0 0 ${size * 0.4}px ${color}, 0 0 ${size * 0.8}px ${glow};"></div>
      </div>`,
    iconSize: [ringSize, ringSize],
    iconAnchor: [half, half],
    tooltipAnchor: [half + 4, 0],
  });

  iconCache.set(cacheKey, icon);
  return icon;
};

// ==========================
// HELPER FUNCTIONS
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
// MAP HELPER COMPONENTS
// ==========================
function MapPanes() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane("tooltipPaneCustom")) map.createPane("tooltipPaneCustom").style.zIndex = "1000";
    if (!map.getPane("heatmap"))           map.createPane("heatmap").style.zIndex = "350";
    if (!map.getPane("boundary"))          map.createPane("boundary").style.zIndex = "400";
    if (!map.getPane("markers"))           map.createPane("markers").style.zIndex = "650";
  }, [map]);
  return null;
}

function HeatmapLayer({
  points, gradient, opacity,
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
      radius: 50, blur: 40, maxZoom: 14, minOpacity: 0.5, gradient, pane: "heatmap",
    });
    heatRef.current = heat;
    heat.addTo(map);
    return () => { map.removeLayer(heat); };
  }, [points, map, gradient]);

  useEffect(() => {
    const pane = map.getPane("heatmap");
    if (pane) {
      pane.style.opacity = String(opacity);
      pane.style.display = opacity > 0 ? "" : "none";
    }
  }, [opacity, map]);

  return null;
}

function ZoomTracker({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  useMapEvents({ zoomend: (e) => onZoomChange(e.target.getZoom()) });
  return null;
}

/**
 * Tracks both overlayadd AND overlayremove to maintain a full Set of active layers.
 */
function ActiveLayerController({
  onLayersChange,
}: {
  onLayersChange: (cb: (prev: Set<LayerType>) => Set<LayerType>) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const nameToLayer = (name: string): LayerType | null => {
      if (name === "NDVI Heatmap")  return "ndvi";
      if (name === "LULC Heatmap")  return "lulc";
      if (name === "Soil Heatmap")  return "soil";
      if (name === "Water Heatmap") return "water";
      return null;
    };

    const handleAdd = (e: any) => {
      const layer = nameToLayer(e.name);
      if (!layer) return;
      onLayersChange((prev) => new Set([...prev, layer]));
    };

    const handleRemove = (e: any) => {
      const layer = nameToLayer(e.name);
      if (!layer) return;
      onLayersChange((prev) => {
        const next = new Set(prev);
        next.delete(layer);
        return next;
      });
    };

    map.on("overlayadd",    handleAdd);
    map.on("overlayremove", handleRemove);
    return () => {
      map.off("overlayadd",    handleAdd);
      map.off("overlayremove", handleRemove);
    };
  }, [map, onLayersChange]);

  return null;
}

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
// TOOLTIP
// ==========================
function PointTooltip({ feature, lat, lng }: { feature: Feature; lat: number; lng: number }) {
  return (
    <div style={{
      background: "rgba(5,5,10,0.96)", backdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.15)", borderRadius: "10px",
      padding: "10px 13px", width: "185px", fontSize: "11px", color: "#fff",
      boxShadow: "0 10px 40px rgba(0,0,0,0.9)", lineHeight: 1.5, zIndex: 9999,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
        <span>📍</span><span style={{ fontWeight: 700 }}>Location</span>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: "10px", marginBottom: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Lat</span><span>{lat.toFixed(6)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Lng</span><span>{lng.toFixed(6)}</span>
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginBottom: "6px" }} />
      {[
        { icon: "🌱", label: "NDVI",     value: (feature.properties.NDVI ?? 0).toFixed(2), color: getStatusColor(feature.properties.NDVI ?? 0, "ndvi") },
        { icon: "🏗️", label: "Land Use", value: LULC_LABELS[feature.properties.LULC] || "Unknown" },
        { icon: "🪨", label: "Soil",     value: SOIL_LABELS[feature.properties.SOIL] || "Unknown" },
        { icon: "💧", label: "Water",    value: `${feature.properties.WATER ?? 0}%` },
      ].map(({ icon, label, value, color }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
          <span>{icon} {label}</span>
          <span style={{ fontWeight: 600, color: color || "#f3f4f6" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ==========================
// GEO POINTS LAYER
// ==========================
function GeoPointsLayer({
  densePoints, zoom, activeLayer,
}: {
  densePoints: DensePoint[];
  zoom: number;
  activeLayer: LayerType;
}) {
  const size = getMarkerSize(zoom);
  const markers = useMemo(
    () =>
      densePoints.map((pt, i) => (
        <Marker
          key={`m-${i}`}
          position={[pt.lat, pt.lng]}
          icon={getMarkerIcon(pt.feature, size, activeLayer)}
          pane="markers"
          riseOnHover
        >
          <Tooltip
            pane="tooltipPaneCustom"
            direction="top"
            offset={[0, -12]}
            sticky
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
    [densePoints, size, activeLayer]
  );
  return <>{markers}</>;
}

// ==========================
// MAIN COMPONENT
// ==========================
export default function Soloman() {
  const [data, setData]           = useState<Feature[]>([]);
  const [boundary, setBoundary]   = useState<any>(null);

  // The most recently activated layer (used for accent glow & heatmap display)
  const [activeLayer, setActiveLayer] = useState<LayerType>("ndvi");

  // Full set of currently-checked heatmap overlays
  const [activeLayers, setActiveLayers] = useState<Set<LayerType>>(new Set<LayerType>(["ndvi"]));

  const [zoom, setZoom] = useState(6);

  useEffect(() => { injectCSS(); }, []);

  // ------------------------------------------------------------------ //
  // FIX 1 — GeoJSON boundary fetch with response.ok guard and fallback  //
  // ------------------------------------------------------------------ //
  useEffect(() => {
    // Local point data
    fetch("/solomon_points_env.geojson")
      .then((r) => {
        if (!r.ok) throw new Error(`Points fetch failed: ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((j) => {
        if (j?.features && Array.isArray(j.features)) {
          setData(j.features as Feature[]);
        } else {
          console.warn("[Soloman] Unexpected points GeoJSON structure", j);
        }
      })
      .catch((err) => {
        console.warn("[Soloman] Could not load point data:", err.message);
        // Dashboard remains functional — maps render without points
      });

    // Boundary — use the known-working johan/world.geo.json URL
    fetch(
      "https://raw.githubusercontent.com/johan/world.geo.json/master/countries/SLB.geo.json"
    )
      .then((r) => {
        if (!r.ok) throw new Error(`Boundary fetch failed: ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((j) => {
        if (j?.type) {
          setBoundary(j);
        } else {
          console.warn("[Soloman] Unexpected boundary GeoJSON structure", j);
        }
      })
      .catch((err) => {
        console.warn("[Soloman] Boundary could not be loaded, skipping overlay:", err.message);
        // Map renders fine without the boundary outline
      });
  }, []);

  const densePoints = useMemo(() => generateDensePoints(data), [data]);

  // ---- Aggregate averages ----
  const avgNDVI = useMemo(() => {
    if (!data.length) return 0;
    return data.reduce((acc, f) => acc + (f.properties.NDVI ?? 0), 0) / data.length;
  }, [data]);

  const avgWATER = useMemo(() => {
    if (!data.length) return 0;
    return data.reduce((acc, f) => acc + (f.properties.WATER ?? 0), 0) / data.length;
  }, [data]);

  const avgLULC = useMemo(() => {
    if (!data.length) return 0;
    return data.reduce((acc, f) => acc + (LULC_WEIGHT[f.properties.LULC] ?? 0), 0) / data.length;
  }, [data]);

  const avgSOIL = useMemo(() => {
    if (!data.length) return 0;
    return data.reduce((acc, f) => acc + (SOIL_WEIGHT[f.properties.SOIL] ?? 0), 0) / data.length;
  }, [data]);

  // ---- Status counts per layer ----
  const counts = useMemo((): AllCounts => {
    const empty = (): StatusCounts => ({ good: 0, medium: 0, bad: 0, total: 0 });
    const result: AllCounts = { ndvi: empty(), lulc: empty(), soil: empty(), water: empty() };

    for (const f of data) {
      const p = f.properties;

      // NDVI
      const ndviStatus = getStatusInfo(p.NDVI ?? 0, "ndvi");
      result.ndvi.total++;
      if (ndviStatus.label === "Good")        result.ndvi.good++;
      else if (ndviStatus.label === "Medium") result.ndvi.medium++;
      else                                    result.ndvi.bad++;

      // WATER
      const waterStatus = getStatusInfo(p.WATER ?? 0, "water");
      result.water.total++;
      if (waterStatus.label === "Good")        result.water.good++;
      else if (waterStatus.label === "Medium") result.water.medium++;
      else                                     result.water.bad++;

      // LULC (pass weight, not raw code)
      const lulcVal    = LULC_WEIGHT[p.LULC] ?? 0;
      const lulcStatus = getStatusInfo(lulcVal, "lulc");
      result.lulc.total++;
      if (lulcStatus.label === "Good")        result.lulc.good++;
      else if (lulcStatus.label === "Medium") result.lulc.medium++;
      else                                    result.lulc.bad++;

      // SOIL (pass weight, not raw code)
      const soilVal    = SOIL_WEIGHT[p.SOIL] ?? 0;
      const soilStatus = getStatusInfo(soilVal, "soil");
      result.soil.total++;
      if (soilStatus.label === "Good")        result.soil.good++;
      else if (soilStatus.label === "Medium") result.soil.medium++;
      else                                    result.soil.bad++;
    }

    return result;
  }, [data]);

  // ---- Heatmap heat-points for currently active single layer ----
  const activeHeatPoints = useMemo((): HeatPoint[] => {
    return data.map((f) => {
      const coords: [number, number] = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
      if (activeLayer === "ndvi")  return [...coords, f.properties.NDVI  ?? 0] as HeatPoint;
      if (activeLayer === "lulc")  return [...coords, LULC_WEIGHT[f.properties.LULC] ?? 0] as HeatPoint;
      if (activeLayer === "soil")  return [...coords, SOIL_WEIGHT[f.properties.SOIL] ?? 0] as HeatPoint;
      return [...coords, (f.properties.WATER ?? 0) / 100] as HeatPoint;
    });
  }, [activeLayer, data]);

  // Callback that handles both add / remove events
  const handleLayersChange = useCallback(
    (cb: (prev: Set<LayerType>) => Set<LayerType>) => {
      setActiveLayers((prev) => {
        const next = cb(prev);
        // Update the "primary" single activeLayer to the most-recently added one
        const added = [...next].filter((l) => !prev.has(l));
        if (added.length > 0) setActiveLayer(added[added.length - 1]);
        return next;
      });
    },
    []
  );

  const handleZoomChange = useCallback((z: number) => { setZoom(z); }, []);

  const heatmapOpacity = useMemo(() => {
    if (zoom < 8)  return 1.0;
    if (zoom <= 10) return 0.6;
    if (zoom <= 13) return 0.3;
    return 0.15;
  }, [zoom]);

  return (
    <div className="h-screen w-full bg-black relative">

      {/* ── Dynamic Indicator Panel (bottom-left, outside MapContainer) ── */}
      <IndicatorPanel
        activeLayers={activeLayers}
        activeLayer={activeLayer}
        avgNDVI={avgNDVI}
        avgWATER={avgWATER}
        avgLULC={avgLULC}
        avgSOIL={avgSOIL}
        counts={counts}
      />

      <MapContainer
        center={[-9.5, 160]}
        zoom={6}
        maxZoom={22}
        className="h-full w-full"
        preferCanvas
      >
        <MapPanes />
        <ZoomTracker onZoomChange={handleZoomChange} />
        <ActiveLayerController onLayersChange={handleLayersChange} />

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

          <LayersControl.Overlay checked name="NDVI Heatmap"><LayerGroup /></LayersControl.Overlay>
          <LayersControl.Overlay         name="LULC Heatmap"><LayerGroup /></LayersControl.Overlay>
          <LayersControl.Overlay         name="Soil Heatmap"><LayerGroup /></LayersControl.Overlay>
          <LayersControl.Overlay         name="Water Heatmap"><LayerGroup /></LayersControl.Overlay>

          <LayersControl.Overlay checked name="Geo Points">
            <LayerGroup>
              <GeoPointsLayer
                densePoints={densePoints}
                zoom={zoom}
                activeLayer={activeLayer}
              />
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
                  fillColor: avgNDVI < 0.3 ? "#1e3a8a" : avgNDVI < 0.6 ? "#10b981" : "#ef4444",
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
