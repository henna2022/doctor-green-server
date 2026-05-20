/**
 * /api/health
 * 서버 상태 + 키 설정 여부 확인
 */
const { setCors } = require('./_utils');

export default function handler(req, res) {
  setCors(res);
  res.json({
    ok: true,
    hasKeys: {
      kma: !!process.env.KMA_KEY,
      ncpms: !!process.env.NCPMS_KEY,
      farmmap: !!process.env.FARMMAP_KEY
    }
  });
}
