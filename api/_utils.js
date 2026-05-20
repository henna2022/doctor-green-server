/**
 * 닥터 그린 — Vercel Serverless 공통 유틸
 */

// ─── 위경도 → 기상청 격자 변환 ───
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

// ─── 기상청 base_date / base_time 계산 ───
function getKmaBaseTime() {
  const now = new Date(Date.now() - 10 * 60 * 1000);
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

// ─── 기상청 응답 파싱 ───
function parseKmaResponse(raw) {
  if (!raw?.response || raw.response.header.resultCode !== '00') return null;
  const items = raw.response?.body?.items?.item || [];
  if (!items.length) return null;
  let today = null, todayCats = {}, dailyMax = -999, dailyMin = 999;
  let rainSum = 0, maxWind = 0, maxPop = 0, nowKey = null;
  items.forEach(it => {
    const { fcstDate: fd, fcstTime: ft, category: cat, fcstValue: val } = it;
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

// ─── severity 매핑 ───
function mapSeverity(lv) {
  if (!lv) return 'mid';
  const s = String(lv);
  if (s.includes('경보') || s === 'HIGH' || s === '3') return 'high';
  if (s.includes('주의') || s === 'MID' || s === '2') return 'mid';
  return 'low';
}

// ─── CORS 헤더 설정 ───
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { latLonToKmaGrid, getKmaBaseTime, parseKmaResponse, mapSeverity, setCors };
