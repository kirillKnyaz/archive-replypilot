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
 * Generate 2-3 Google Places text search queries from campaign config.
 */
async function generateSearchQueries(campaign) {
  const response = await claude.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          `You're helping find local businesses for cold outreach.`,
          `Vertical: ${campaign.vertical}`,
          `Location: ${campaign.location}`,
          `Offer: ${campaign.offer}`,
          ``,
          `Generate exactly 3 different Google Places text search queries to find these businesses.`,
          `Each query should use different phrasing/angles to maximise coverage.`,
          `Return ONLY a JSON array of strings, nothing else. Example: ["query 1", "query 2", "query 3"]`,
        ].join("\n"),
      },
    ],
  });

  const raw = response.content[0].text.trim();
  try {
    const queries = JSON.parse(raw.replace(/```json|```/g, "").trim());
    if (Array.isArray(queries)) return queries.slice(0, 3);
  } catch {}
  // Fallback: single obvious query
  return [`${campaign.vertical} in ${campaign.location}`];
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

  const response = await axios.post(url, body);
  return response.data.places || [];
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
  // Resolve lat/lng: use stored values or geocode
  let lat = campaign.locationLat;
  let lng = campaign.locationLng;
  if (!lat || !lng) {
    const geo = await geocodeLocation(campaign.location);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      // Persist for future runs
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { locationLat: lat, locationLng: lng },
      });
    }
  }

  // Generate search queries
  const queries = await generateSearchQueries(campaign);
  console.log(`[discover] Campaign "${campaign.name}" — queries:`, queries);

  // Run all queries and collect results
  const allPlaces = [];
  const seenPlacesIds = new Set();

  for (const query of queries) {
    try {
      const places = await placesTextSearch({
        query,
        lat,
        lng,
        radius: campaign.radiusMeters,
      });
      for (const p of places) {
        if (!p.id || seenPlacesIds.has(p.id)) continue;
        seenPlacesIds.add(p.id);
        allPlaces.push(p);
      }
    } catch (e) {
      console.error(`[discover] Query "${query}" failed:`, e.message);
    }
  }

  // Filter out permanently closed
  const open = allPlaces.filter(
    (p) => p.businessStatus !== "CLOSED_PERMANENTLY"
  );

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
};
