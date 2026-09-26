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
  "B-6141": {
    name: "云南孔雀（橙色）",
    rarity: "少见",
    airline: "中国东方航空",
    source: "Planespotters aircraft record"
  },
  "B-5276": {
    name: "云南孔雀（橙色）",
    rarity: "少见",
    airline: "中国东方航空",
    source: "Planespotters aircraft record"
  },
  "B-657X": {
    name: "广汽传祺",
    rarity: "稀有",
    airline: "中国南方航空",
    source: "Planespotters photo record"
  },
  "B-658W": {
    name: "第十五届全运会·活力湾区",
    rarity: "稀有",
    airline: "中国南方航空",
    source: "Planespotters production record"
  },
  "B-7882": {
    name: "中国国家博物馆",
    rarity: "稀有",
    airline: "中国东方航空",
    source: "Planespotters photo record"
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
