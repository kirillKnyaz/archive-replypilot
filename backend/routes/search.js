const router = require('express').Router();
const prisma = require('../lib/prisma.js');
const axios = require('axios');
const authorizeTokens = require('../middleware/checkTokens');

router.get('/nearby', authorizeTokens, async (req, res) => {
  const userId = req.user.userId;
  const { lat, lng, radius, category, requestedTokens } = req.query;

  const nearbySearchUrl = `https://places.googleapis.com/v1/places:searchNearby?key=${process.env.GOOGLE_MAPS_KEY}`;
  const requestBody = {
    includedTypes: [category],
    maxResultCount: requestedTokens ? parseInt(requestedTokens) : 10,
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radius
      }
    }
  };

  axios.post(
    `${nearbySearchUrl}&fields=places.displayName,places.websiteUri,places.location,places.id,places.googleMapsUri,places.addressComponents,places.businessStatus`,
    requestBody
  ).then(async (response) => {
    const places = response.data.places || [];

    try {
      await prisma.searchResult.create({
        data: {
          userId,
          type: 'NEARBY',
          centerLat: parseFloat(lat),
          centerLng: parseFloat(lng),
          radiusMeters: parseInt(radius, 10),
          category,
          textQuery: null,
          maxResultCount: requestedTokens ? parseInt(requestedTokens) : 10,
          placesCount: places.length,
          tokensCharged: 0,
          results: places
        }
      });
    } catch (e) {
      console.error('Failed to persist NEARBY searchResult', e);
    }

    res.json({ message: 'Places fetched successfully', places });
  }).catch((error) => {
    console.error('Error fetching places:', error);
    res.status(500).send('Error fetching places');
  });
});

router.get('/text', authorizeTokens, async (req, res) => {
  const userId = req.user.userId;
  const { lat, lng, radius, query, requestedTokens } = req.query;

  const textSearchUrl = `https://places.googleapis.com/v1/places:searchText?key=${process.env.GOOGLE_MAPS_KEY}`;
  const requestBody = {
    textQuery: query,
    pageSize: requestedTokens ? parseInt(requestedTokens) : 10,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radius
      }
    }
  };

  axios.post(
    `${textSearchUrl}&fields=places.displayName,places.websiteUri,places.location,places.id,places.googleMapsUri,places.addressComponents,places.businessStatus`,
    requestBody
  ).then(async (response) => {
    const places = response.data.places || [];

    try {
      await prisma.searchResult.create({
        data: {
          userId,
          type: 'TEXT',
          centerLat: parseFloat(lat),
          centerLng: parseFloat(lng),
          radiusMeters: parseInt(radius, 10),
          category: null,
          textQuery: query,
          maxResultCount: requestedTokens ? parseInt(requestedTokens) : 10,
          placesCount: places.length,
          tokensCharged: 0,
          results: places
        }
      });
    } catch (e) {
      console.error('Failed to persist TEXT searchResult', e);
    }

    res.json({ message: 'Places fetched successfully', places });
  }).catch((error) => {
    console.error('Error fetching places:', error.response ? error.response.data : error.message);
    res.status(500).send('Error fetching places');
  });
});

router.get('/history', async (req, res) => {
  const userId = req.user.userId;
  const { limit = 20 } = req.query;
  try {
    const rows = await prisma.searchResult.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit, 10) || 20, 100)
    });
    res.json(rows);
  } catch (e) {
    console.error('history error', e);
    res.status(500).send('Failed to load history');
  }
});

module.exports = router;
