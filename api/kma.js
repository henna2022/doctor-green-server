/**
 * /api/kma?lat=&lon=
 * 기상청 단기예보
 */
const axios = require('axios');
const { latLonToKmaGrid, getKmaBaseTime, parseKmaResponse, setCors } = require('./_utils');

// 메모리 캐시 (Serverless는 인스턴스가 꺼지면 초기화됨 — 운영시 Redis 권장)
const cache = new Map();

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat,lon required' });

  // 캐시 확인 (10분)
  const grid = latLonToKmaGrid(lat, lon);
  const t = getKmaBaseTime();
  const cacheKey = `kma:${grid.nx},${grid.ny}:${t.base_date}${t.base_time}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.t < 10 * 60 * 1000) return res.json(cached.v);

  try {
    const r = await axios.get('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst', {
      params: {
        serviceKey: process.env.KMA_KEY,
        pageNo: 1, numOfRows: 300, dataType: 'JSON',
        base_date: t.base_date, base_time: t.base_time,
        nx: grid.nx, ny: grid.ny
      },
      timeout: 8000
    });

    const parsed = parseKmaResponse(r.data);
    if (!parsed) return res.status(502).json({ error: 'KMA parse failed' });

    cache.set(cacheKey, { t: Date.now(), v: parsed });
    res.json(parsed);
  } catch (e) {
    console.error('KMA error:', e.message);
    res.status(502).json({ error: 'KMA fetch failed', detail: e.message });
  }
}
