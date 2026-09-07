"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Trash2 } from "lucide-react";
import type { CircleMarker, LeafletMouseEvent, Map as LeafletMap } from "leaflet";

type Props = {
  latitude: number | null;
  longitude: number | null;
  disabled?: boolean;
  onChange: (latitude: number | null, longitude: number | null) => void;
};

const PERU_CENTER: [number, number] = [-9.19, -75.0152];

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function hasCoordinates(latitude: number | null, longitude: number | null) {
  return latitude !== null && longitude !== null;
}

export function StoreLocationPicker({ latitude, longitude, disabled = false, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const pointRef = useRef<CircleMarker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const [geoPending, setGeoPending] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    let disposed = false;

    async function initializeMap() {
      if (!containerRef.current || mapRef.current) return;

      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;

      leafletRef.current = L;
      const located = hasCoordinates(latitude, longitude);
      const center: [number, number] = located ? [latitude as number, longitude as number] : PERU_CENTER;
      const map = L.map(containerRef.current, {
        center,
        zoom: located ? 17 : 5,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      if (located) {
        pointRef.current = L.circleMarker(center, {
          radius: 9,
          weight: 3,
          fillOpacity: 0.8,
        }).addTo(map);
      }

      map.on("click", (event: LeafletMouseEvent) => {
        if (disabledRef.current) return;
        onChangeRef.current(roundCoordinate(event.latlng.lat), roundCoordinate(event.latlng.lng));
      });

      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 0);
    }

    void initializeMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      pointRef.current = null;
      leafletRef.current = null;
    };
    // El mapa se inicializa una sola vez; los cambios de coordenadas se sincronizan en el efecto siguiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (!hasCoordinates(latitude, longitude)) {
      pointRef.current?.remove();
      pointRef.current = null;
      return;
    }

    const point: [number, number] = [latitude as number, longitude as number];
    if (pointRef.current) {
      pointRef.current.setLatLng(point);
    } else {
      pointRef.current = L.circleMarker(point, {
        radius: 9,
        weight: 3,
        fillOpacity: 0.8,
      }).addTo(map);
    }

    map.setView(point, Math.max(map.getZoom(), 15));
  }, [latitude, longitude]);

  function useCurrentLocation() {
    if (disabled || geoPending) return;

    if (!navigator.geolocation) {
      setGeoError("Este navegador no permite obtener la ubicación actual.");
      return;
    }

    setGeoPending(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange(
          roundCoordinate(position.coords.latitude),
          roundCoordinate(position.coords.longitude),
        );
        setGeoPending(false);
      },
      () => {
        setGeoError("No se pudo obtener la ubicación. Revisa el permiso de ubicación del navegador.");
        setGeoPending(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
        <div ref={containerRef} className="h-72 w-full" aria-label="Mapa para seleccionar la ubicación de la tienda" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={disabled || geoPending}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Crosshair className="h-3.5 w-3.5" />
            {geoPending ? "Obteniendo ubicación..." : "Usar mi ubicación"}
          </button>

          {hasCoordinates(latitude, longitude) && (
            <button
              type="button"
              onClick={() => onChange(null, null)}
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Quitar punto
            </button>
          )}
        </div>

        <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5" />
          Haz clic sobre el mapa para fijar el punto
        </div>
      </div>

      {geoError && <p className="text-xs text-rose-600">{geoError}</p>}
    </div>
  );
}
