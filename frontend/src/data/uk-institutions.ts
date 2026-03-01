/**
 * UK Research Institutions with accurate geographic coordinates
 * Coordinates are in decimal degrees (WGS84)
 */

export interface InstitutionData {
  name: string;
  lat: number; // Latitude
  lon: number; // Longitude
  aliases: string[]; // Common name variations for matching
}

export const UK_INSTITUTIONS: Record<string, InstitutionData> = {
  // London institutions
  imperial: {
    name: "Imperial College London",
    lat: 51.4988,
    lon: -0.1749,
    aliases: ["imperial", "imperial college", "ic london"],
  },
  ucl: {
    name: "University College London",
    lat: 51.5246,
    lon: -0.1340,
    aliases: ["ucl", "university college london"],
  },
  "kings-london": {
    name: "King's College London",
    lat: 51.5114,
    lon: -0.1160,
    aliases: ["kings", "king's college", "kcl"],
  },
  lse: {
    name: "London School of Economics",
    lat: 51.5144,
    lon: -0.1167,
    aliases: ["lse", "london school of economics"],
  },
  "queen-mary": {
    name: "Queen Mary University of London",
    lat: 51.5243,
    lon: -0.0403,
    aliases: ["queen mary", "qmul"],
  },

  // Oxbridge
  oxford: {
    name: "University of Oxford",
    lat: 51.7548,
    lon: -1.2544,
    aliases: ["oxford", "oxford university"],
  },
  cambridge: {
    name: "University of Cambridge",
    lat: 52.2054,
    lon: 0.1218,
    aliases: ["cambridge", "cambridge university"],
  },

  // Scotland
  edinburgh: {
    name: "University of Edinburgh",
    lat: 55.9445,
    lon: -3.1892,
    aliases: ["edinburgh", "edinburgh university"],
  },
  glasgow: {
    name: "University of Glasgow",
    lat: 55.8719,
    lon: -4.2884,
    aliases: ["glasgow", "glasgow university"],
  },
  "st-andrews": {
    name: "University of St Andrews",
    lat: 56.3398,
    lon: -2.7967,
    aliases: ["st andrews", "st. andrews"],
  },
  aberdeen: {
    name: "University of Aberdeen",
    lat: 57.1653,
    lon: -2.1009,
    aliases: ["aberdeen", "aberdeen university"],
  },
  strathclyde: {
    name: "University of Strathclyde",
    lat: 55.8617,
    lon: -4.2429,
    aliases: ["strathclyde"],
  },
  dundee: {
    name: "University of Dundee",
    lat: 56.4570,
    lon: -2.9874,
    aliases: ["dundee"],
  },

  // Northern England
  manchester: {
    name: "University of Manchester",
    lat: 53.4668,
    lon: -2.2339,
    aliases: ["manchester", "manchester university"],
  },
  liverpool: {
    name: "University of Liverpool",
    lat: 53.4064,
    lon: -2.9664,
    aliases: ["liverpool", "liverpool university"],
  },
  leeds: {
    name: "University of Leeds",
    lat: 53.8067,
    lon: -1.5550,
    aliases: ["leeds", "leeds university"],
  },
  sheffield: {
    name: "University of Sheffield",
    lat: 53.3811,
    lon: -1.4879,
    aliases: ["sheffield", "sheffield university"],
  },
  newcastle: {
    name: "Newcastle University",
    lat: 54.9783,
    lon: -1.6178,
    aliases: ["newcastle", "newcastle university"],
  },
  york: {
    name: "University of York",
    lat: 53.9481,
    lon: -1.0531,
    aliases: ["york", "york university"],
  },
  durham: {
    name: "Durham University",
    lat: 54.7753,
    lon: -1.5849,
    aliases: ["durham", "durham university"],
  },
  lancaster: {
    name: "Lancaster University",
    lat: 54.0104,
    lon: -2.7877,
    aliases: ["lancaster"],
  },

  // Midlands
  nottingham: {
    name: "University of Nottingham",
    lat: 52.9399,
    lon: -1.1965,
    aliases: ["nottingham", "nottingham university"],
  },
  birmingham: {
    name: "University of Birmingham",
    lat: 52.4508,
    lon: -1.9305,
    aliases: ["birmingham", "birmingham university"],
  },
  warwick: {
    name: "University of Warwick",
    lat: 52.3793,
    lon: -1.5615,
    aliases: ["warwick", "warwick university"],
  },
  leicester: {
    name: "University of Leicester",
    lat: 52.6215,
    lon: -1.1239,
    aliases: ["leicester"],
  },
  loughborough: {
    name: "Loughborough University",
    lat: 52.7650,
    lon: -1.2379,
    aliases: ["loughborough"],
  },

  // South & Southwest England
  bristol: {
    name: "University of Bristol",
    lat: 51.4585,
    lon: -2.6030,
    aliases: ["bristol", "bristol university"],
  },
  exeter: {
    name: "University of Exeter",
    lat: 50.7353,
    lon: -3.5350,
    aliases: ["exeter"],
  },
  bath: {
    name: "University of Bath",
    lat: 51.3811,
    lon: -2.3269,
    aliases: ["bath"],
  },
  southampton: {
    name: "University of Southampton",
    lat: 50.9344,
    lon: -1.3968,
    aliases: ["southampton"],
  },
  reading: {
    name: "University of Reading",
    lat: 51.4414,
    lon: -0.9418,
    aliases: ["reading"],
  },
  surrey: {
    name: "University of Surrey",
    lat: 51.2433,
    lon: -0.5890,
    aliases: ["surrey"],
  },
  sussex: {
    name: "University of Sussex",
    lat: 50.8676,
    lon: -0.0887,
    aliases: ["sussex"],
  },

  // Wales
  cardiff: {
    name: "Cardiff University",
    lat: 51.4875,
    lon: -3.1793,
    aliases: ["cardiff", "cardiff university"],
  },
  swansea: {
    name: "Swansea University",
    lat: 51.6088,
    lon: -3.9790,
    aliases: ["swansea"],
  },

  // Northern Ireland
  "queens-belfast": {
    name: "Queen's University Belfast",
    lat: 54.5844,
    lon: -5.9349,
    aliases: ["belfast", "queens belfast", "qub", "queen's belfast"],
  },
};

/**
 * Find institution data by matching against name or aliases
 */
export function findInstitution(institutionName: string): InstitutionData | null {
  const searchTerm = institutionName.toLowerCase().trim();
  
  for (const inst of Object.values(UK_INSTITUTIONS)) {
    if (inst.aliases.some(alias => searchTerm.includes(alias))) {
      return inst;
    }
  }
  
  return null;
}

/**
 * Convert lat/lon coordinates to SVG coordinates for UK map
 * Uses a simple Web Mercator-style projection centered on the UK
 * 
 * UK bounding box (approximate):
 * North: 60.86° (Shetland)
 * South: 49.96° (Isles of Scilly)
 * West: -8.18° (Western Ireland - we'll use -6.5° for mainland UK)
 * East: 1.76° (East Anglia)
 */
const UK_BOUNDS = {
  north: 60.5,
  south: 49.5,
  west: -8.5,
  east: 2.0,
};

const SVG_BOUNDS = {
  width: 600,
  height: 800,
  padding: 40,
};

export function latLonToSVG(lat: number, lon: number): { x: number; y: number } {
  // Calculate relative position within UK bounds
  const lonRange = UK_BOUNDS.east - UK_BOUNDS.west;
  const latRange = UK_BOUNDS.north - UK_BOUNDS.south;
  
  // Normalize to 0-1 range
  const xNorm = (lon - UK_BOUNDS.west) / lonRange;
  const yNorm = 1 - (lat - UK_BOUNDS.south) / latRange; // Flip Y axis (SVG has origin at top)
  
  // Scale to SVG dimensions with padding
  const x = SVG_BOUNDS.padding + xNorm * (SVG_BOUNDS.width - 2 * SVG_BOUNDS.padding);
  const y = SVG_BOUNDS.padding + yNorm * (SVG_BOUNDS.height - 2 * SVG_BOUNDS.padding);
  
  return { x, y };
}
