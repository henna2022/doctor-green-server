/**
 * /api/geocode?lat=&lon=
 * 역지오코딩 (위경도 → 시/군/구)
 */
const axios = require('axios');
const { setCors } = require('./_utils');

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  if (isNaN(lat) || isNaN(lon)) return res.json({ name: '현재 위치' });

  try {
    const r = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat, lon, format: 'json', 'accept-language': 'ko' },
      headers: { 'User-Agent': 'doctor-green/1.0' },
      timeout: 5000
    });
    const a = r.data.address || {};
    const name = a.city || a.town || a.county || a.municipality || a.state || '현재 위치';
    res.json({ name, raw: a });
  } catch (e) {
    res.json({ name: '현재 위치' });
  }
}
