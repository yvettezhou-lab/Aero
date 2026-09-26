// Aircraft-registration-based special livery registry.
// Only add an entry when the registration/livery pairing has a source or has been manually verified.
// rarity is intentionally simple: 稀有 / 少见 / 常见.

export const LIVERIES = {
  "B-20A9": {
    name: "鄂尔多斯号",
    rarity: "少见",
    airline: "中国联合航空",
    source: "Flightradar24 aircraft record"
  },
  "B-8986": {
    name: "坦博尔",
    rarity: "少见",
    airline: "青岛航空",
    source: "Planespotters / JetPhotos"
  },
  "B-9923": {
    name: "WiFi包",
    rarity: "稀有",
    airline: "中国国际航空",
    source: "manually verified"
  }
};

export function normalizeRegistration(value = "") {
  return String(value).replace(/\s+/g, "").toUpperCase();
}

export function liveryForRegistration(registration) {
  return LIVERIES[normalizeRegistration(registration)] || null;
}
