// service/searchPlaces.js
// Discovers new businesses via Google Places API for a campaign.
// Claude generates search queries, Places API returns results, we dedup against existing leads.

const axios = require("axios");
const Anthropic = require("@anthropic-ai/sdk");
const prisma = require("../lib/prisma");

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PLACES_KEY = process.env.GOOGLE_MAPS_KEY;
const FIELDS = "places.displayName,places.websiteUri,places.location,places.id,places.googleMapsUri,places.addressComponents,places.businessStatus,places.nationalPhoneNumber,places.internationalPhoneNumber";

/**
 * Generate 3 Google Places text search queries from campaign config.
 * If campaign.rotateQueries is enabled, avoids phrasings already in searchQueryHistory.
 */
async function generateSearchQueries(campaign) {
  const rotate = !!campaign.rotateQueries;
  const history = Array.isArray(campaign.searchQueryHistory) ? campaign.searchQueryHistory : [];
  const recentHistory = history.slice(-20);

  const promptLines = [
    `You're helping find local businesses for cold outreach.`,
    `Vertical: ${campaign.vertical}`,
    `Location: ${campaign.location}`,
    `Offer: ${campaign.offer}`,
    ``,
  ];

  if (rotate && recentHistory.length > 0) {
    promptLines.push(
      `Do NOT reuse these exact phrasings (already searched):`,
      ...recentHistory.map((q) => `- ${q}`),
      ``,
      `Generate 3 FRESH text search queries that approach the same targeting from different angles.`,
    );
  } else {
    promptLines.push(
      `Generate exactly 3 different Google Places text search queries to find these businesses.`,
      `Each query should use different phrasing/angles to maximise coverage.`,
    );
  }

  promptLines.push(`Return ONLY a JSON array of strings, nothing else. Example: ["query 1", "query 2", "query 3"]`);

  const response = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: promptLines.join("\n") }],
  });

  const raw = response.content[0].text.trim();
  let queries;
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (Array.isArray(parsed)) queries = parsed.slice(0, 3);
  } catch {}

  if (!queries || queries.length === 0) {
    queries = [`${campaign.vertical} in ${campaign.location}`];
  }

  return queries;
}

/**
 * Build a square grid of search cells covering a circular area around a center.
 * Returns array of { lat, lng, lastSearchedAt: null }.
 */
function buildSearchGrid({ centerLat, centerLng, areaRadiusMeters, spacingMeters }) {
  const N = Math.ceil(areaRadiusMeters / spacingMeters);
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((centerLat * Math.PI) / 180);

  const cells = [];
  for (let i = -N; i <= N; i++) {
    for (let j = -N; j <= N; j++) {
      const dx = i * spacingMeters;
      const dy = j * spacingMeters;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > areaRadiusMeters) continue;

      const lat = centerLat + dy / metersPerDegLat;
      const lng = centerLng + dx / metersPerDegLng;
      cells.push({ lat, lng, lastSearchedAt: null });
    }
  }
  return cells;
}

/**
 * Call Google Places Text Search API.
 */
async function placesTextSearch({ query, lat, lng, radius }) {
  const url = `https://places.googleapis.com/v1/places:searchText?key=${PLACES_KEY}&fields=${FIELDS}`;
  const body = {
    textQuery: query,
    pageSize: 20,
  };

  // Add location bias if we have coordinates
  if (lat && lng) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radius || 5000,
      },
    };
  }

  try {
    const response = await axios.post(url, body);
    return response.data.places || [];
  } catch (e) {
    console.error(`[places] Text search failed for "${query}":`, e.response?.data?.error?.message || e.message);
    return [];
  }
}

/**
 * Geocode a location string to lat/lng using Google Places.
 * Returns { lat, lng } or null.
 */
async function geocodeLocation(locationStr) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(locationStr)}&key=${PLACES_KEY}`;
  try {
    const { data } = await axios.get(url);
    if (data.results && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
  } catch (e) {
    console.error("[geocode] Failed:", e.message);
  }
  return null;
}

/**
 * Main discovery function for a campaign.
 * Returns { discovered, filtered, places }.
 */
async function discoverPlaces(campaign) {
  // Resolve center lat/lng: use stored values or geocode
  let lat = campaign.locationLat;
  let lng = campaign.locationLng;
  if (!lat || !lng) {
    const geo = await geocodeLocation(campaign.location);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { locationLat: lat, locationLng: lng },
      });
    }
  }

  if (!lat || !lng) {
    console.error(`[discover] Could not resolve location for campaign "${campaign.name}"`);
    return { discovered: 0, filtered: 0, places: [] };
  }

  // Build the search grid if not yet built
  let searchCenters = Array.isArray(campaign.searchCenters) ? campaign.searchCenters : null;
  if (!searchCenters || searchCenters.length === 0) {
    searchCenters = buildSearchGrid({
      centerLat: lat,
      centerLng: lng,
      areaRadiusMeters: campaign.radiusMeters,
      spacingMeters: campaign.gridSpacingMeters,
    });
    console.log(`[discover] Built grid of ${searchCenters.length} cells for campaign "${campaign.name}"`);
  }

  // Pick the oldest-searched cells (nulls first)
  const sorted = [...searchCenters].sort((a, b) => {
    const ta = a.lastSearchedAt ? new Date(a.lastSearchedAt).getTime() : 0;
    const tb = b.lastSearchedAt ? new Date(b.lastSearchedAt).getTime() : 0;
    return ta - tb;
  });
  const selectedCells = sorted.slice(0, campaign.cellsPerRun);

  // Generate queries once per run, shared across cells
  const queries = await generateSearchQueries(campaign);
  console.log(`[discover] Campaign "${campaign.name}" — ${selectedCells.length} cells × ${queries.length} queries`);

  // Append to history only when rotation is enabled
  const newHistory = campaign.rotateQueries
    ? [...(campaign.searchQueryHistory || []), ...queries].slice(-50)
    : campaign.searchQueryHistory || [];

  // Search each selected cell
  const allPlaces = [];
  const seenPlacesIds = new Set();
  const now = new Date();

  for (const cell of selectedCells) {
    for (const query of queries) {
      try {
        const places = await placesTextSearch({
          query,
          lat: cell.lat,
          lng: cell.lng,
          radius: campaign.gridRadiusMeters,
        });
        for (const p of places) {
          if (!p.id || seenPlacesIds.has(p.id)) continue;
          seenPlacesIds.add(p.id);
          allPlaces.push(p);
        }
      } catch (e) {
        console.error(`[discover] Cell ${cell.lat},${cell.lng} query "${query}" failed:`, e.message);
      }
    }
    cell.lastSearchedAt = now.toISOString();
  }

  // Merge updated cells back into the full searchCenters array
  const selectedKeys = new Set(selectedCells.map((c) => `${c.lat},${c.lng}`));
  const updatedCenters = searchCenters.map((c) => {
    const key = `${c.lat},${c.lng}`;
    if (selectedKeys.has(key)) {
      return { ...c, lastSearchedAt: now.toISOString() };
    }
    return c;
  });

  // Persist: grid + query history
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      searchCenters: updatedCenters,
      searchQueryHistory: newHistory,
    },
  });

  // Filter out permanently closed
  const open = allPlaces.filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY");

  // Filter out leads already in DB for this user
  const existingPlacesIds = await prisma.lead.findMany({
    where: {
      userId: campaign.userId,
      placesId: { in: open.map((p) => p.id) },
    },
    select: { placesId: true },
  });
  const existingSet = new Set(existingPlacesIds.map((l) => l.placesId));
  const newPlaces = open.filter((p) => !existingSet.has(p.id));

  return {
    discovered: allPlaces.length,
    filtered: allPlaces.length - newPlaces.length,
    places: newPlaces,
  };
}

/**
 * Create Lead records from discovered places.
 * Returns the number of leads created.
 */
async function createLeadsFromPlaces(campaign, places) {
  let created = 0;
  for (const p of places) {
    const displayName =
      p.displayName?.text || p.displayName?.languageCode || "Unknown";
    const location = formatAddress(p.addressComponents) || campaign.location;

    try {
      await prisma.lead.create({
        data: {
          userId: campaign.userId,
          campaignId: campaign.id,
          name: displayName,
          location,
          placesId: p.id,
          mapsUri: p.googleMapsUri || null,
          website: p.websiteUri || null,
          phone: p.nationalPhoneNumber || p.internationalPhoneNumber || null,
          status: "DISCOVERED",
        },
      });
      created++;
    } catch (e) {
      // Skip duplicates (unique constraint on placesId)
      if (e.code === "P2002") continue;
      console.error(`[createLead] Failed for ${displayName}:`, e.message);
    }
  }
  return created;
}

/**
 * Format address from Google Places addressComponents.
 */
function formatAddress(components) {
  if (!components || !Array.isArray(components)) return null;
  const parts = components
    .filter((c) =>
      c.types?.some((t) =>
        ["locality", "administrative_area_level_1", "country"].includes(t)
      )
    )
    .map((c) => c.longText || c.shortText);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Fetch fresh details for a single place by its Places ID.
 * Returns nationalPhoneNumber, internationalPhoneNumber, websiteUri.
 */
async function fetchPlaceDetails(placeId) {
  const url = `https://places.googleapis.com/v1/places/${placeId}`;
  const { data } = await axios.get(url, {
    headers: {
      "X-Goog-Api-Key": PLACES_KEY,
      "X-Goog-FieldMask": "nationalPhoneNumber,internationalPhoneNumber,websiteUri",
    },
  });
  return data;
}

module.exports = {
  discoverPlaces,
  createLeadsFromPlaces,
  generateSearchQueries,
  geocodeLocation,
  fetchPlaceDetails,
  buildSearchGrid,
};
