import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  MapContainer,
  CircleMarker,
  Tooltip,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
  LayersControl,
  LayerGroup,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import "leaflet.heat";

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
// NDVI COLOR HELPER
// ==========================
const getNDVIColor = (ndvi: number): string => {
  if (ndvi >= 0.75) return "#10b981";
  if (ndvi >= 0.55) return "#34d399";
  if (ndvi >= 0.35) return "#facc15";
  if (ndvi >= 0.15) return "#fb923c";
  return "#ef4444";
};

// ==========================
// NDVI FILL COLOR (for markers)
// ==========================
const getNDVIFill = (ndvi: number): string => {
  if (ndvi >= 0.75) return "#00ffcc";
  if (ndvi >= 0.55) return "#34d399";
  if (ndvi >= 0.35) return "#facc15";
  if (ndvi >= 0.15) return "#fb923c";
  return "#ef4444";
};

// ==========================
// SEEDED JITTER (stable across renders)
// ==========================
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function generateDensePoints(features: Feature[]): DensePoint[] {
  const points: DensePoint[] = [];
  const COPIES = 4;
  const OFFSET = 0.01;

  features.forEach((f, fi) => {
    const [lng, lat] = f.geometry.coordinates;
    // Original point
    points.push({ lat, lng, feature: f });
    // Jittered copies with stable seed
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
// HEATMAP
// ==========================
function HeatmapLayer({
  points,
  gradient,
  visible,
}: {
  points: HeatPoint[];
  gradient: Record<string, string>;
  visible: boolean;
}) {
  const map = useMap();
  const heatRef = useRef<any>(null);

  useEffect(() => {
    if (!points.length) return;

    const heat = (L as any).heatLayer(points, {
      radius: 25,
      blur: 20,
      maxZoom: 9,
      minOpacity: 0.2,
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
    if (!heatRef.current) return;
    const pane = map.getPane("heatmap");
    if (pane) {
      pane.style.display = visible ? "" : "none";
    }
  }, [visible, map]);

  return null;
}

// ==========================
// ZOOM TRACKER
// ==========================
function ZoomTracker({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  useMapEvents({
    zoomend: (e) => {
      onZoomChange(e.target.getZoom());
    },
  });
  return null;
}

// ==========================
// ACTIVE LAYER CONTROLLER
// ==========================
function ActiveLayerController({
  onLayerChange,
}: {
  onLayerChange: (layer: string) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const handleOverlayAdd = (e: any) => {
      const name = e.name;
      if (name === "NDVI Heatmap") onLayerChange("ndvi");
      else if (name === "LULC Heatmap") onLayerChange("lulc");
      else if (name === "Soil Heatmap") onLayerChange("soil");
      else if (name === "Water Heatmap") onLayerChange("water");
    };
    map.on("overlayadd", handleOverlayAdd);
    return () => {
      map.off("overlayadd", handleOverlayAdd);
    };
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
function PointTooltip({
  feature,
  lat,
  lng,
}: {
  feature: Feature;
  lat: number;
  lng: number;
}) {
  return (
    <div className="bg-black/85 backdrop-blur-md border border-white/10 rounded-lg shadow-lg p-3 w-[180px] text-xs text-white">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">📍</span>
        <span className="font-semibold tracking-tight">Location</span>
      </div>
      <div className="space-y-0.5 mb-3 text-[10px] font-mono">
        <div className="flex justify-between">
          <span className="text-gray-400">Lat</span>
          <span className="text-white">{lat.toFixed(6)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Lng</span>
          <span className="text-white">{lng.toFixed(6)}</span>
        </div>
      </div>

      <div className="border-t border-white/10 my-2" />

      <div className="flex justify-between items-center py-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🌿</span>
          <span className="text-gray-400">NDVI</span>
        </div>
        <span className="font-semibold" style={{ color: getNDVIColor(feature.properties.NDVI) }}>
          {feature.properties.NDVI.toFixed(2)}
        </span>
      </div>

      <div className="flex justify-between items-center py-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🌍</span>
          <span className="text-gray-400">Land Use</span>
        </div>
        <span className="font-medium text-right">
          {feature.properties.LULC} ({LULC_LABELS[feature.properties.LULC] || "Unknown"})
        </span>
      </div>

      <div className="flex justify-between items-center py-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🌱</span>
          <span className="text-gray-400">Soil</span>
        </div>
        <span className="font-medium text-right">
          {feature.properties.SOIL} ({SOIL_LABELS[feature.properties.SOIL] || "Unknown"})
        </span>
      </div>

      <div className="flex justify-between items-center py-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">💧</span>
          <span className="text-gray-400">Water</span>
        </div>
        <span className="font-semibold">{feature.properties.WATER}%</span>
      </div>
    </div>
  );
}

// ==========================
// GEO POINTS LAYER
// ==========================
function GeoPointsLayer({
  densePoints,
  zoom,
}: {
  densePoints: DensePoint[];
  zoom: number;
}) {
  if (zoom < 7) return null;

  const markers = densePoints.map((pt, i) => (
    <CircleMarker
      key={`pt-${i}`}
      center={[pt.lat, pt.lng]}
      radius={zoom > 10 ? 4 : 5}
      pathOptions={{
        stroke: false,
        fillColor: getNDVIFill(pt.feature.properties.NDVI),
        fillOpacity: 0.88,
      }}
      pane="markers"
    >
      <Tooltip
        direction="right"
        offset={[8, 0]}
        sticky={true}
        className="custom-tooltip"
      >
        <PointTooltip
          feature={pt.feature}
          lat={pt.feature.geometry.coordinates[1]}
          lng={pt.feature.geometry.coordinates[0]}
        />
      </Tooltip>
    </CircleMarker>
  ));

  if (zoom > 10) {
    return <>{markers}</>;
  }

  return (
    <MarkerClusterGroup
      chunkedLoading
      disableClusteringAtZoom={10}
      spiderfyOnMaxZoom={true}
      showCoverageOnHover={false}
      maxClusterRadius={60}
    >
      {markers}
    </MarkerClusterGroup>
  );
}

// ==========================
// MAIN
// ==========================
export default function Soloman() {
  const [data, setData] = useState<Feature[]>([]);
  const [boundary, setBoundary] = useState<any>(null);
  const [activeLayer, setActiveLayer] = useState<"ndvi" | "lulc" | "soil" | "water">("ndvi");
  const [zoom, setZoom] = useState(6);

  useEffect(() => {
    fetch("/solomon_points_env.geojson")
      .then((res) => res.json())
      .then((json) => setData(json.features));

    fetch(
      "https://raw.githubusercontent.com/datasets/geo-boundaries-world-110m/master/countries/SLB.geojson"
    )
      .then((res) => res.json())
      .then((json) => setBoundary(json));
  }, []);

  const densePoints = useMemo(() => generateDensePoints(data), [data]);

  const heatPoints: HeatPoint[] = useMemo(() =>
    data.map((f) => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
      f.properties.NDVI || 0,
    ]), [data]);

  const lulcPoints: HeatPoint[] = useMemo(() =>
    data.map((f) => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
      LULC_WEIGHT[f.properties.LULC] ?? 0,
    ]), [data]);

  const soilPoints: HeatPoint[] = useMemo(() =>
    data.map((f) => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
      SOIL_WEIGHT[f.properties.SOIL] ?? 0,
    ]), [data]);

  const waterPoints: HeatPoint[] = useMemo(() =>
    data.map((f) => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
      (f.properties.WATER || 0) / 100,
    ]), [data]);

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

  const getBoundaryColor = (ndvi: number): string => {
    if (ndvi < 0.3) return "#1e3a8a";
    if (ndvi < 0.5) return "#10b981";
    if (ndvi < 0.7) return "#eab308";
    return "#ef4444";
  };

  const handleLayerChange = useCallback((layer: string) => {
    setActiveLayer(layer as "ndvi" | "lulc" | "soil" | "water");
  }, []);

  const handleZoomChange = useCallback((z: number) => {
    setZoom(z);
  }, []);

  // Show heatmap only when zoom < 10
  const heatmapVisible = zoom < 10;

  return (
    <div className="h-screen w-full bg-black">
      <MapContainer
        center={[-9.5, 160]}
        zoom={6}
        className="h-full w-full"
        preferCanvas={true}
      >
        <MapPanes />
        <ZoomTracker onZoomChange={handleZoomChange} />
        <ActiveLayerController onLayerChange={handleLayerChange} />

        <HeatmapLayer
          points={activeHeatPoints}
          gradient={GRADIENTS[activeLayer]}
          visible={heatmapVisible}
        />

        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Hybrid Map">
            <LayerGroup>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
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
