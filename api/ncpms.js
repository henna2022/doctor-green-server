/**
 * /api/ncpms?crops=고추,토마토
 * 농촌진흥청 NCPMS 병해충 예찰정보
 */
const axios = require('axios');
const xml2js = require('xml2js');
const { setCors } = require('./_utils');

const cache = new Map();

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const crops = (req.query.crops || '').split(',').filter(Boolean);
  if (!crops.length) return res.json([]);

  const cacheKey = `ncpms:${crops.join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.t < 60 * 60 * 1000) return res.json(cached.v);

  try {
    const results = [];
    for (const crop of crops) {
      const r = await axios.get('http://ncpms.rda.go.kr/npmsAPI/service', {
        params: {
          apiKey: process.env.NCPMS_KEY,
          serviceCode: 'SVC05',
          serviceType: 'AA001',
          cropName: crop,
          displayCount: 5
        },
        timeout: 8000,
        responseType: 'text'
      });
      const parsed = await xml2js.parseStringPromise(r.data, { explicitArray: false, trim: true });
      const items = parsed?.service?.list?.item;
      const itemArr = Array.isArray(items) ? items : items ? [items] : [];
      itemArr.forEach(it => {
        results.push({
          crop,
          name: it.sickNameKor || it.insectNameKor || it.name || '',
          level: it.occrrncLvlCode || it.level || '예보',
          period: it.occrrncPeriod || it.period || ''
        });
      });
    }
    cache.set(cacheKey, { t: Date.now(), v: results });
    res.json(results);
  } catch (e) {
    console.error('NCPMS error:', e.message);
    res.json([]); // 폴백을 위해 빈 배열
  }
}
