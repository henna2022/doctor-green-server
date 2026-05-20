/**
 * 닥터 그린 — 백엔드 프록시 서버
 *
 * 목적: 공공 데이터 API (CORS 미지원·HTTPS 일부 미지원·키 보호 필요) 를
 *       클라이언트에서 직접 호출하지 못하므로, 이 서버가 중계합니다.
 *
 * 통합 API:
 *   ① 기상청 단기예보 (apis.data.go.kr/1360000)
 *   ② 농촌진흥청 NCPMS 병해충 예찰정보 (ncpms.rda.go.kr)
 *   ③ 농림수산식품교육문화정보원 팜맵기반 병해충 발생 (apis.data.go.kr/1390802)
 *   ④ 행정안전부 도로명주소 역지오코딩 (선택사항)
 *
 * 설치:
 *   npm init -y
 *   npm install express axios xml2js cors dotenv
 *
 * 실행:
 *   .env 파일에 키 입력 후 `node server.js`
 *
 * 배포:
 *   - Vercel/Netlify Serverless Functions
 *   - Railway / Render / Fly.io
 *   - 자체 서버 (PM2 권장)
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const xml2js = require('xml2js');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

/* ─── CORS — 클라이언트 도메인 화이트리스트 권장 ─── */
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || '*'
}));

/* ─── API 키 (공공데이터포털에서 발급, .env로 분리 보관) ─── */
const KMA_KEY     = process.env.KMA_KEY;      // 기상청 단기예보 (Decoding 키)
const NCPMS_KEY   = process.env.NCPMS_KEY;    // 농촌진흥청 NCPMS
const FARMMAP_KEY = process.env.FARMMAP_KEY;  // 팜맵 병해충 발생

/* ═══════════════════════════════════════════════════
   유틸: 위경도 → 기상청 격자 변환
═══════════════════════════════════════════════════ */
function latLonToKmaGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0;
  const SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0;
  const XO = 43, YO = 136, DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)
  };
}

/* ─── 기상청 base_date/base_time 계산 ─── */
function getKmaBaseTime() {
  const now = new Date(Date.now() - 10 * 60 * 1000); // 10분 여유
  const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];
  const h = now.getHours();
  let baseHour = BASE_HOURS[0];
  for (let i = BASE_HOURS.length - 1; i >= 0; i--) {
    if (h >= BASE_HOURS[i]) { baseHour = BASE_HOURS[i]; break; }
  }
  const d = new Date(now);
  if (h < 2) { d.setDate(d.getDate() - 1); baseHour = 23; }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(baseHour).padStart(2, '0');
  return { base_date: `${yyyy}${mm}${dd}`, base_time: `${hh}00` };
}

/* ─── 응답 캐싱 (메모리, TTL 10분) — Redis 권장 ─── */
const cache = new Map();
function getCached(key, ttlMs) {
  const e = cache.get(key);
  if (e && Date.now() - e.t < ttlMs) return e.v;
  return null;
}
function setCached(key, v) {
  cache.set(key, { t: Date.now(), v });
}

/* ═══════════════════════════════════════════════════
   루트 경로: doctor_green.html 제공
═══════════════════════════════════════════════════ */
app.get('/', (req, res) => {
  try {
    const htmlPath = path.join(__dirname, 'doctor_green.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    console.error('Error reading HTML:', e.message);
    res.status(500).json({ error: 'HTML file not found' });
  }
});

/* ═══════════════════════════════════════════════════
   ① 기상청 단기예보
   GET /api/kma?lat=37.0079&lon=127.2797
═══════════════════════════════════════════════════ */
app.get('/api/kma', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat,lon required' });

    const grid = latLonToKmaGrid(lat, lon);
    const t = getKmaBaseTime();
    const cacheKey = `kma:${grid.nx},${grid.ny}:${t.base_date}${t.base_time}`;
    const cached = getCached(cacheKey, 10 * 60 * 1000);
    if (cached) return res.json(cached);

    const url = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
    const r = await axios.get(url, {
      params: {
        serviceKey: KMA_KEY,
        pageNo: 1, numOfRows: 300, dataType: 'JSON',
        base_date: t.base_date, base_time: t.base_time,
        nx: grid.nx, ny: grid.ny
      },
      timeout: 8000
    });

    // 클라이언트가 처리하기 좋게 정규화 (raw도 같이)
    const parsed = parseKmaResponse(r.data);
    const result = { ...parsed, raw: r.data };
    setCached(cacheKey, result);
    res.json(result);
  } catch (e) {
    console.error('KMA error:', e.message);
    res.status(502).json({ error: 'KMA fetch failed', detail: e.message });
  }
});

function parseKmaResponse(raw) {
  if (!raw || !raw.response || raw.response.header.resultCode !== '00') return null;
  const items = raw.response?.body?.items?.item || [];
  if (!items.length) return null;
  let today = null, todayCats = {}, dailyMax = -999, dailyMin = 999, rainSum = 0, maxWind = 0, maxPop = 0;
  let nowKey = null;
  items.forEach(it => {
    const fd = it.fcstDate, ft = it.fcstTime, cat = it.category, val = it.fcstValue;
    if (!today) today = fd;
    if (fd !== today) return;
    if (cat === 'TMP') {
      const t = parseFloat(val);
      if (!nowKey) { nowKey = ft; todayCats.TMP = t; }
      if (t > dailyMax) dailyMax = t;
      if (t < dailyMin) dailyMin = t;
    } else if (cat === 'TMX') { const v = parseFloat(val); if (v > dailyMax) dailyMax = v; }
    else if (cat === 'TMN') { const v = parseFloat(val); if (v < dailyMin) dailyMin = v; }
    else if (cat === 'REH' && !todayCats.REH) { todayCats.REH = parseFloat(val); }
    else if (cat === 'SKY' && !todayCats.SKY) { todayCats.SKY = parseInt(val); }
    else if (cat === 'PTY' && !todayCats.PTY) { todayCats.PTY = parseInt(val); }
    else if (cat === 'WSD') { const w = parseFloat(val); if (w > maxWind) maxWind = w; if (!todayCats.WSD) todayCats.WSD = w; }
    else if (cat === 'POP') { const p = parseFloat(val); if (p > maxPop) maxPop = p; }
    else if (cat === 'PCP') {
      const s = String(val);
      if (s === '강수없음' || s === '-' || s === '0') return;
      const n = parseFloat(s.replace(/[^\d.]/g, ''));
      if (!isNaN(n)) rainSum += n;
    }
  });
  return {
    source: 'KMA',
    temp: todayCats.TMP, hum: todayCats.REH,
    sky: todayCats.SKY, pty: todayCats.PTY,
    wind: todayCats.WSD || 0,
    tmax: dailyMax > -999 ? dailyMax : null,
    tmin: dailyMin < 999 ? dailyMin : null,
    rain: rainSum, pop: maxPop
  };
}

/* ═══════════════════════════════════════════════════
   ② 농촌진흥청 NCPMS — 병해충 예찰정보
   GET /api/ncpms?crops=고추,토마토,딸기

   * NCPMS API는 농촌진흥청 사이트에서 별도 가입·발급 (https://ncpms.rda.go.kr)
   * 응답은 XML이므로 xml2js로 파싱
   * 엔드포인트는 발급받은 서비스에 따라 다름 — 아래는 예시
═══════════════════════════════════════════════════ */
app.get('/api/ncpms', async (req, res) => {
  try {
    const crops = (req.query.crops || '').split(',').filter(Boolean);
    if (!crops.length) return res.json([]);

    const cacheKey = `ncpms:${crops.join(',')}`;
    const cached = getCached(cacheKey, 60 * 60 * 1000); // 1시간 캐시
    if (cached) return res.json(cached);

    const results = [];
    for (const crop of crops) {
      // NCPMS 병해충 예찰정보 검색 API (실제 엔드포인트는 발급 후 안내문서 참조)
      const url = 'http://ncpms.rda.go.kr/npmsAPI/service';
      const r = await axios.get(url, {
        params: {
          apiKey: NCPMS_KEY,
          serviceCode: 'SVC05',     // 농작물 병해충 예찰정보 서비스 코드 (예시)
          serviceType: 'AA001',     // 응답 타입
          cropName: crop,
          displayCount: 5
        },
        timeout: 8000,
        responseType: 'text'
      });
      // XML 파싱
      const parsed = await xml2js.parseStringPromise(r.data, { explicitArray: false, trim: true });
      const items = parsed?.service?.list?.item;
      const itemArr = Array.isArray(items) ? items : items ? [items] : [];
      itemArr.forEach(it => {
        results.push({
          crop: crop,
          name: it.sickNameKor || it.insectNameKor || it.name || '',
          level: it.occrrncLvlCode || it.level || '예보',
          period: it.occrrncPeriod || it.period || ''
        });
      });
    }
    setCached(cacheKey, results);
    res.json(results);
  } catch (e) {
    console.error('NCPMS error:', e.message);
    // 키가 없거나 API 오류면 빈 배열 (클라이언트는 폴백 사용)
    res.json([]);
  }
});

/* ═══════════════════════════════════════════════════
   ③ 팜맵기반 병해충 발생 조회
   GET /api/farmmap?lat=&lon=&radius=10

   * 농림수산식품교육문화정보원 (data.go.kr 15034381)
   * 좌표 기반 주변 농가 병해충 발생 조회
═══════════════════════════════════════════════════ */
app.get('/api/farmmap', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const radius = parseInt(req.query.radius || '10');
    if (isNaN(lat) || isNaN(lon)) return res.status(400).json({ error: 'lat,lon required' });

    const cacheKey = `farmmap:${lat.toFixed(3)},${lon.toFixed(3)}:${radius}`;
    const cached = getCached(cacheKey, 60 * 60 * 1000);
    if (cached) return res.json(cached);

    // 팜맵 병해충발생 API (정확한 오퍼레이션명은 발급 후 명세 확인)
    const url = 'https://apis.data.go.kr/1390802/FarmMapPestService/getPestOccurByCoord';
    const r = await axios.get(url, {
      params: {
        serviceKey: FARMMAP_KEY,
        lat: lat, lon: lon, radius: radius,
        pageNo: 1, numOfRows: 20, type: 'json'
      },
      timeout: 8000
    });

    // 응답 정규화 (실제 응답 구조는 명세서 참조)
    const items = r.data?.response?.body?.items?.item || [];
    const itemArr = Array.isArray(items) ? items : [items];
    const results = itemArr.map(it => ({
      crop: it.cropName || it.crop,
      disease: it.pestName || it.disease,
      distance_km: parseFloat(it.distance || 0),
      severity: mapSeverity(it.occrrncLvl || it.level),
      reportedAt: it.reportDate
    })).filter(x => x.crop && x.disease);

    setCached(cacheKey, results);
    res.json(results);
  } catch (e) {
    console.error('Farmmap error:', e.message);
    res.json([]); // 폴백을 위해 빈 배열
  }
});

function mapSeverity(lv) {
  if (!lv) return 'mid';
  const s = String(lv);
  if (s.includes('경보') || s === 'HIGH' || s === '3') return 'high';
  if (s.includes('주의') || s === 'MID'  || s === '2') return 'mid';
  return 'low';
}

/* ═══════════════════════════════════════════════════
   ④ 역지오코딩 (시/군/구) — 선택사항
   GET /api/geocode?lat=&lon=
═══════════════════════════════════════════════════ */
app.get('/api/geocode', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    // Nominatim 사용 (서버에서 호출하므로 CORS 무관)
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
});

/* ─── 헬스체크 ─── */
app.get('/health', (req, res) => res.json({
  ok: true,
  hasKeys: { kma: !!KMA_KEY, ncpms: !!NCPMS_KEY, farmmap: !!FARMMAP_KEY }
}));

app.listen(PORT, () => {
  console.log(`닥터 그린 프록시 서버 http://localhost:${PORT}`);
  console.log('API 키 상태:', {
    KMA: KMA_KEY ? '✓' : '✗ (.env에 KMA_KEY 입력 필요)',
    NCPMS: NCPMS_KEY ? '✓' : '✗ (.env에 NCPMS_KEY 입력 필요)',
    FARMMAP: FARMMAP_KEY ? '✓' : '✗ (.env에 FARMMAP_KEY 입력 필요)'
  });
});
