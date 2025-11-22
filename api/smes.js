// /api/smes.js
// 중소벤처24 공고 정보 API Proxy (JSON 전용 + CORS + 간단 캐싱)

const cacheStore = new Map(); // URL별 캐시 { data, ts }

function getCache(key, ttlMs) {
  const hit = cacheStore.get(key);
  if (!hit) return null;
  // 30분 TTL (공고 정보는 자주 바뀌지 않으므로 캐시를 길게 가져갑니다)
  if (Date.now() - hit.ts > 30 * 60 * 1000) { 
    cacheStore.delete(key);
    return null;
  }
  return hit.data;
}

function setCache(key, data) {
  cacheStore.set(key, { data, ts: Date.now() });
}

export default async function handler(req, res) {
  /* ============================
     🔵 CORS 설정
  ============================ */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const apiKey = process.env.SMES_KEY; // Vercel 환경변수 사용
    if (!apiKey) {
      return res.status(500).json({
        error: "SMES_KEY is not set. Please check Vercel environment variables.",
      });
    }

    // 기본 요청 파라미터 (프론트에서 넘겨받지 않으면 기본값 사용)
    const {
      strDt, // 검색 시작일 (yyyyMMdd)
      endDt, // 검색 종료일 (yyyyMMdd)
      html = "no", // HTML 태그 포함 여부 (no: 텍스트만)
    } = req.query;

    const baseUrl =
      "https://www.smes.go.kr/fnct/apiReqst/extPblancInfo"; // 공고정보 연계 API 요청 URL [cite: 293]

    const params = new URLSearchParams({
      token: apiKey, // 인증키
      html: String(html),
    });

    // 검색 기간 설정 (필수 아님, 없으면 API 기본 설정 따름)
    if (strDt) params.append('strDt', String(strDt));
    if (endDt) params.append('endDt', String(endDt));

    // 현재 날짜를 기준으로 검색 기간을 자동으로 설정할 수도 있으나,
    // 데이터 보존 및 전체 조회를 위해 기간을 비워두고 API의 기본 동작에 의존합니다.

    const url = `${baseUrl}?${params.toString()}`;
    console.log("[SMES] Request URL:", url);

    /* ============================
        🔵 캐시 체크
    ============================ */
    const cacheKey = url;
    const ttlMs = 30 * 60 * 1000; // 30분 캐시

    const cached = getCache(cacheKey, ttlMs);
    if (cached) {
      return res.status(200).json(cached);
    }

    /* ============================
        🔵 Upstream 호출
    ============================ */
    const upstreamRes = await fetch(url);
    const raw = await upstreamRes.text();

    if (!upstreamRes.ok) {
      // API 응답 코드가 200이 아닌 경우
      return res.status(upstreamRes.status).json({
        error: "Upstream API error",
        status: upstreamRes.status,
        raw,
      });
    }

    // JSON 파싱 시도
    let json;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      console.error("[SMES] JSON parse failed, returning raw text.");
      return res.status(200).send(raw);
    }

    // 캐시에 저장
    setCache(cacheKey, json);

    return res.status(200).json(json);
  } catch (err) {
    console.error("SMES Proxy Fatal Error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message,
    });
  }
}
