// /api/bizinfo.js
// 기업마당(BizInfo) 지원사업 API Proxy (JSON 전용 + CORS + 캐싱)

const cacheStore = new Map(); // URL별 캐시 { data, ts }

function getCache(key, ttlMs) {
  const hit = cacheStore.get(key);
  if (!hit) return null;
  // 30분 캐시 유지
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
    const apiKey = process.env.BIZINFO_KEY; // Vercel 환경변수
    if (!apiKey) {
      return res.status(500).json({
        error: "BIZINFO_KEY is not set.",
      });
    }

    // 클라이언트 요청 파라미터 매핑
    const {
      page = "1",
      perPage = "15", // 기업마당 기본값
      category = "", // 분야 코드 (01~09)
      keyword = "",  // 검색어 (사용 안 할 수도 있음)
      area = ""      // 지역 (해시태그로 검색)
    } = req.query;

    const baseUrl = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";

    const params = new URLSearchParams({
      crtfcKey: apiKey,      // 인증키
      dataType: "json",      // JSON 형식 요청
      pageIndex: String(page),    // 페이지 번호
      pageUnit: String(perPage),  // 페이지당 개수
    });

    // 분야 필터 (01:금융, 02:기술 등)
    if (category) {
        params.append("searchLclasId", String(category));
    }

    // 지역/검색어 필터 (기업마당은 hashtags 파라미터 등을 사용하나, 
    // 정확도를 위해 전체 데이터를 가져와서 프론트에서 거르는 방식도 고려 가능.
    // 일단 API 스펙대로 매핑합니다.)
    // 참고: 기업마당 API는 검색 기능이 제한적일 수 있어, hashtags 파라미터에 지역명을 넣습니다.
    if (area && area !== "전국") {
        params.append("hashtags", area);
    }

    const url = `${baseUrl}?${params.toString()}`;
    console.log("[BizInfo] Request URL:", url);

    /* ============================
        🔵 캐시 체크
    ============================ */
    const cacheKey = url;
    const ttlMs = 30 * 60 * 1000; // 30분

    const cached = getCache(cacheKey, ttlMs);
    if (cached) {
      return res.status(200).json(cached);
    }

    /* ============================
        🔵 Upstream 호출
    ============================ */
    const upstreamRes = await fetch(url);
    const raw = await upstreamRes.text();

    // 🔍 [디버깅용 로그]
    console.log("========================================");
    console.log("[BizInfo API RAW DATA Check]");
    console.log(raw.substring(0, 1000)); 
    console.log("========================================");

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: "Upstream API error",
        status: upstreamRes.status,
        raw,
      });
    }

    // JSON 파싱
    let json;
    try {
      // 기업마당 API가 가끔 JSON이 아닌 텍스트나 에러 XML을 줄 때가 있어 방어 코드 작성
      json = JSON.parse(raw);
    } catch (e) {
      console.error("[BizInfo] JSON parse failed, returning raw text.");
      return res.status(200).send(raw); // 파싱 실패 시 원본 반환하여 디버깅 유도
    }

    // 캐시에 저장
    setCache(cacheKey, json);

    return res.status(200).json(json);
  } catch (err) {
    console.error("BizInfo Proxy Fatal Error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message,
    });
  }
}
