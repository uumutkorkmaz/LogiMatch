'use client';

import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
  color?: string;
  href?: string;
}

const STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty';

/**
 * MapLibre GL + açık kaynak tile (API key yok). WebGL yoksa (headless test, eski tarayıcı)
 * sessizce koordinat listesine düşer.
 */
export function MapView({
  markers,
  line,
  onPick,
  height = 320,
  center,
}: {
  markers: MapMarker[];
  line?: boolean;
  onPick?: (p: { lat: number; lng: number }) => void;
  height?: number;
  center?: { lat: number; lng: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const mapRef = useRef<MlMap | null>(null);
  const markerRefs = useRef<MlMarker[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const maplibre = (await import('maplibre-gl')).default;
        if (cancelled || !ref.current) return;
        const map = new maplibre.Map({
          container: ref.current,
          style: STYLE,
          center: center ? [center.lng, center.lat] : [32.5, 39.2],
          zoom: center ? 8 : 4.6,
          attributionControl: { compact: true },
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        map.on('error', () => undefined);
        if (onPick) {
          map.getCanvas().style.cursor = 'crosshair';
          map.on('click', (e) =>
            onPick({
              lat: Math.round(e.lngLat.lat * 1e5) / 1e5,
              lng: Math.round(e.lngLat.lng * 1e5) / 1e5,
            }),
          );
        }
        mapRef.current = map;
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Harita bir kez kurulur; işaretçiler aşağıdaki efektte güncellenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    void (async () => {
      const maplibre = (await import('maplibre-gl')).default;
      markerRefs.current.forEach((m) => m.remove());
      markerRefs.current = markers.map((m) => {
        const mk = new maplibre.Marker({ color: m.color ?? '#1d4ed8' }).setLngLat([m.lng, m.lat]);
        if (m.label)
          mk.setPopup(
            new maplibre.Popup({ offset: 20 }).setHTML(
              m.href ? `<a href="${m.href}">${m.label}</a>` : m.label,
            ),
          );
        return mk.addTo(map);
      });
      const draw = () => {
        const id = 'route-line';
        if (map.getSource(id)) {
          map.removeLayer(id);
          map.removeSource(id);
        }
        if (line && markers.length >= 2) {
          map.addSource(id, {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: markers.map((m) => [m.lng, m.lat]) },
            },
          });
          map.addLayer({
            id,
            type: 'line',
            source: id,
            paint: { 'line-color': '#1d4ed8', 'line-width': 3, 'line-dasharray': [2, 1.5] },
          });
        }
        if (markers.length > 1) {
          const lngs = markers.map((m) => m.lng);
          const lats = markers.map((m) => m.lat);
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 48, maxZoom: 9, duration: 0 },
          );
        } else if (markers.length === 1) {
          map.jumpTo({ center: [markers[0]!.lng, markers[0]!.lat], zoom: 8 });
        }
      };
      if (map.isStyleLoaded()) draw();
      else void map.once('load', draw);
    })();
  }, [markers, line]);

  if (failed) {
    return (
      <div
        className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground"
        style={{ minHeight: 80 }}
      >
        {markers.map((m, i) => (
          <div key={i}>
            {m.label ?? 'Nokta'}: {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className="w-full overflow-hidden rounded-lg border border-border"
      style={{ height }}
      data-testid="map"
    />
  );
}
