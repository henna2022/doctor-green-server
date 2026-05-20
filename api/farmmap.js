/**
 * /api/farmmap?lat=&lon=&radius=10
 * 팜맵기반 병해충 발생 조회
 */
const axios = require('axios');
const { mapSeverity, setCors } = require('./_utils');

const cache = new Map();

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = parseInt(req.query.radius || '10');
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat,lon required' });

  const cacheKey = `farmmap:${lat.toFixed(3)},${lon.toFixed(3)}:${radius}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.t < 60 * 60 * 1000) return res.json(cached.v);

  try {
    const r = await axios.get('https://apis.data.go.kr/1390802/FarmMapPestService/getPestOccurByCoord', {
      params: {
        serviceKey: process.env.FARMMAP_KEY,
        lat, lon, radius,
        pageNo: 1, numOfRows: 20, type: 'json'
      },
      timeout: 8000
    });

    const items = r.data?.response?.body?.items?.item || [];
    const itemArr = Array.isArray(items) ? items : [items];
    const results = itemArr.map(it => ({
      crop: it.cropName || it.crop,
      disease: it.pestName || it.disease,
      distance_km: parseFloat(it.distance || 0),
      severity: mapSeverity(it.occrrncLvl || it.level),
      reportedAt: it.reportDate
    })).filter(x => x.crop && x.disease);

    cache.set(cacheKey, { t: Date.now(), v: results });
    res.json(results);
  } catch (e) {
    console.error('Farmmap error:', e.message);
    res.json([]);
  }
}
