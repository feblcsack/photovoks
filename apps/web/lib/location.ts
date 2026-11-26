/**
 * Photovoks event location — fixed to Universitas Indonesia, Depok (not
 * editable per event). Coordinates from OpenStreetMap (UI campus).
 */
export const LOCATION = {
  name: 'Universitas Indonesia',
  area: 'Depok, Jawa Barat',
  address: 'Jl. Prof. Dr. Sudjono D. Pusponegoro, Pondok Cina, Beji, Depok 16424',
  lat: -6.3603157,
  lng: 106.8271856,
  /** Map view around the campus: [west, south, east, north]. */
  bbox: [106.8125, -6.3745, 106.8418, -6.3462] as const,
} as const;

/** Interactive OpenStreetMap embed (no API key) with a marker on campus. */
export function osmEmbedUrl(loc = LOCATION): string {
  const [w, s, e, n] = loc.bbox;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${w}%2C${s}%2C${e}%2C${n}&layer=mapnik&marker=${loc.lat}%2C${loc.lng}`;
}

export function osmUrl(loc = LOCATION): string {
  return `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=16/${loc.lat}/${loc.lng}`;
}

export function googleMapsUrl(loc = LOCATION): string {
  return `https://www.google.com/maps/search/?api=1&query=${loc.lat}%2C${loc.lng}`;
}

export function directionsUrl(loc = LOCATION): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${loc.lat}%2C${loc.lng}`;
}

/** Origin of the map iframe — must be allowed in the CSP `frame-src`. */
export const MAP_FRAME_ORIGIN = 'https://www.openstreetmap.org';
