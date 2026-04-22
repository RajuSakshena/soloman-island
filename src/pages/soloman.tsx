import { useEffect, useState, useMemo } from "react";
import {
  MapContainer,
  CircleMarker,
  Tooltip,
  TileLayer,
  GeoJSON,
  useMap,
  LayersControl,
  LayerGroup,
} from "react-leaflet";
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

// ==========================
// PANES (for correct layering)
// ==========================
function MapPanes() {
  const map = useMap();

  useEffect(() => {
    if (!map.getPane("heatmap")) {
      const heatmapPane = map.createPane("heatmap");
      heatmapPane.style.zIndex = "350";
    }

    if (!map.getPane("boundary")) {
      const boundaryPane = map.createPane("boundary");
      boundaryPane.style.zIndex = "400";
    }

    if (!map.getPane("markers")) {
      const markersPane = map.createPane("markers");
      markersPane.style.zIndex = "610";
    }
  }, [map]);

  return null;
}

// ==========================
// HEATMAP
// ==========================
function HeatmapLayer({ points }: { points: HeatPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;

    const heat = (L as any).heatLayer(points, {
      radius: 52,
      blur: 38,
      maxZoom: 11,
      minOpacity: 0.45,
      gradient: {
        0.0: "blue",
        0.3: "cyan",
        0.5: "yellow",
        0.7: "orange",
        1.0: "red",
      },
      pane: "heatmap",
    });

    heat.addTo(map);

    return () => {
      map.removeLayer(heat);
    };
  }, [points, map]);

  return null;
}

// ==========================
// FIT BOUNDS
// ==========================
const FitBounds = ({ data }: { data: Feature[] }) => {
  const map = useMap();

  useEffect(() => {
    if (!data.length) return;

    const bounds = L.latLngBounds(
      data.map((f) => [
        f.geometry.coordinates[1],
        f.geometry.coordinates[0],
      ])
    );

    map.fitBounds(bounds, { padding: [40, 40] });
  }, [data, map]);

  return null;
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
// MAIN
// ==========================
export default function Soloman() {
  const [data, setData] = useState<Feature[]>([]);
  const [boundary, setBoundary] = useState<any>(null);

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

  const heatPoints: HeatPoint[] = useMemo(() => {
    return data.map((f) => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
      f.properties.NDVI || 0,
    ]);
  }, [data]);

  const avgNDVI = useMemo(() => {
    if (!data.length) return 0;
    const total = data.reduce(
      (acc: number, f: Feature) => acc + (f.properties.NDVI || 0),
      0
    );
    return total / data.length;
  }, [data]);

  const getBoundaryColor = (ndvi: number): string => {
    if (ndvi < 0.3) return "#1e3a8a";
    if (ndvi < 0.5) return "#10b981";
    if (ndvi < 0.7) return "#eab308";
    return "#ef4444";
  };

  return (
    <div className="h-screen w-full bg-black">
      <MapContainer center={[-9.5, 160]} zoom={6} className="h-full w-full">
        <MapPanes />

        <LayersControl position="topright">
          {/* Base Map */}
          <LayersControl.BaseLayer checked name="Hybrid Map">
            <LayerGroup>
              <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" />
            </LayerGroup>
          </LayersControl.BaseLayer>

          {/* Heatmap */}
          <LayersControl.Overlay checked name="NDVI Heatmap">
            <LayerGroup>
              <HeatmapLayer points={heatPoints} />
            </LayerGroup>
          </LayersControl.Overlay>

          {/* Points with Improved Tooltip */}
          <LayersControl.Overlay checked name="Geo Points">
            <LayerGroup>
              {data.map((f, i) => {
                const [lng, lat] = f.geometry.coordinates;
                const center: [number, number] = [lat, lng];

                return (
                  <>
                    {/* Hit area with fixed right-side tooltip */}
                    <CircleMarker
                      key={`hit-${i}`}
                      center={center}
                      radius={12}
                      pathOptions={{
                        color: "transparent",
                        weight: 0,
                        fillOpacity: 0,
                      }}
                      interactive={true}
                      pane="markers"
                    >
                      <Tooltip
                        direction="right"
                        offset={[10, 0]}
                        sticky={true}
                        className="custom-tooltip"
                      >
                        <div className="bg-black/85 backdrop-blur-md border border-white/10 rounded-lg shadow-lg p-3 w-[180px] text-xs text-white">
                          {/* Location */}
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

                          <div className="border-t border-white/10 my-2"></div>

                          {/* NDVI */}
                          <div className="flex justify-between items-center py-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">🌿</span>
                              <span className="text-gray-400">NDVI</span>
                            </div>
                            <span
                              className="font-semibold"
                              style={{ color: getNDVIColor(f.properties.NDVI) }}
                            >
                              {f.properties.NDVI.toFixed(2)}
                            </span>
                          </div>

                          {/* Land Use */}
                          <div className="flex justify-between items-center py-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">🌍</span>
                              <span className="text-gray-400">Land Use</span>
                            </div>
                            <span className="font-medium text-right">
                              {f.properties.LULC} ({LULC_LABELS[f.properties.LULC] || "Unknown"})
                            </span>
                          </div>

                          {/* Soil Type */}
                          <div className="flex justify-between items-center py-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">🌱</span>
                              <span className="text-gray-400">Soil</span>
                            </div>
                            <span className="font-medium text-right">
                              {f.properties.SOIL} ({SOIL_LABELS[f.properties.SOIL] || "Unknown"})
                            </span>
                          </div>

                          {/* Water */}
                          <div className="flex justify-between items-center py-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">💧</span>
                              <span className="text-gray-400">Water</span>
                            </div>
                            <span className="font-semibold">
                              {f.properties.WATER}%
                            </span>
                          </div>
                        </div>
                      </Tooltip>
                    </CircleMarker>

                    {/* Visible marker */}
                    <CircleMarker
                      key={`vis-${i}`}
                      center={center}
                      radius={6}
                      pathOptions={{
                        color: "white",
                        weight: 2,
                        fillColor: "#00ffcc",
                        fillOpacity: 1,
                      }}
                      interactive={false}
                      pane="markers"
                    />
                  </>
                );
              })}
            </LayerGroup>
          </LayersControl.Overlay>

          {/* Boundary */}
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