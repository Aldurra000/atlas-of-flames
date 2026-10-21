import { feature, mesh } from "topojson-client";
import { geoBounds, geoContains } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, MultiLineString } from "geojson";
import topoRaw from "world-atlas/countries-110m.json";

export const DEG = Math.PI / 180;

/** Lat/lon (degrees) → xyz on a sphere matching three.js SphereGeometry equirectangular UVs. */
export function latLonToXYZ(lat: number, lon: number, r = 1): [number, number, number] {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

export function xyzToLatLon(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z);
  const lat = 90 - Math.acos(y / r) / DEG;
  let lon = Math.atan2(z, -x) / DEG - 180;
  if (lon < -180) lon += 360;
  return { lat, lon };
}

/** Great-circle angular distance in radians */
export function angularDistance(aLat: number, aLon: number, bLat: number, bLon: number) {
  const p1 = aLat * DEG, p2 = bLat * DEG, dl = (bLon - aLon) * DEG;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.acos(Math.min(1, Math.max(-1, c)));
}

type CountryProps = { name: string };
export type CountryFeature = Feature<Geometry, CountryProps>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const topo = topoRaw as any;
let _countries: { f: CountryFeature; b: [[number, number], [number, number]] }[] | null = null;

export function countries() {
  if (!_countries) {
    const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, CountryProps>;
    _countries = fc.features
      .filter((f) => f.properties.name !== "Antarctica" || true)
      .map((f) => ({ f, b: geoBounds(f) as [[number, number], [number, number]] }));
  }
  return _countries;
}

export const countryNames = () => countries().map((c) => c.f.properties.name).sort();
export const countryFeature = (name: string) => countries().find((c) => c.f.properties.name === name)?.f;

export function countryAt(lat: number, lon: number): string | null {
  for (const { f, b } of countries()) {
    const [[w, s], [e, n]] = b;
    if (lat < s - 0.01 || lat > n + 0.01) continue;
    if (w <= e && (lon < w - 0.01 || lon > e + 0.01)) continue;
    if (geoContains(f, [lon, lat])) return f.properties.name;
  }
  return null;
}

export function borderLines(): MultiLineString {
  return mesh(topo, topo.objects.countries) as unknown as MultiLineString;
}
