// Verified aircraft assignments for specific flight instances.
// These are date/airport/direction-specific because scheduled aircraft can differ from the aircraft actually operated.
export const AIRCRAFT_OVERRIDES = {
  "KMG|2026-09-26|dep|MU5811": {
    model: "Boeing 737-8 MAX",
    registration: "B-1380",
    source: "Flightradar24"
  }
};

export function aircraftOverrideFor(airport, date, direction, number) {
  return AIRCRAFT_OVERRIDES[
    [airport, date, direction, String(number || "").replace(/\\s+/g, "").toUpperCase()].join("|")
  ] || null;
}
