"use client";
// Small map for moving the report location. Click to drop the pin, or pan and use "Use the map centre" (keyboard friendly).
import "leaflet/dist/leaflet.css";
import { useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function PinPicker({
  lat, lng, onPick,
}: {
  lat: number;
  lng: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const [map, setMap] = useState<L.Map | null>(null);
  return (
    <div className="space-y-2">
      <div role="region" aria-label="Pick the barrier location on a map" className="relative h-64 overflow-hidden rounded-[14px] border border-line">
        <MapContainer center={[lat, lng]} zoom={18} ref={setMap} className="absolute inset-0">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CircleMarker center={[lat, lng]} radius={10} pathOptions={{ color: "#A84A00", weight: 3, fillColor: "#A84A00", fillOpacity: 0.9 }} />
          <ClickToPick onPick={onPick} />
        </MapContainer>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={() => {
        const c = map?.getCenter();
        if (c) onPick(c.lat, c.lng);
      }}>
        Use the map centre
      </Button>
    </div>
  );
}
