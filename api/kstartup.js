// /api/kstartup.js
// K-Startup API Proxy (JSON 전용 + CORS + 간단 캐싱)

const cacheStore = new Map(); // URL별 캐시 { data, ts }

function getCache(key, ttlMs) {
  const hit = cacheStore.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > ttlMs) {
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
    const apiKey = process.env.KSTARTUP_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "KSTARTUP_KEY is not set.",
      });
    }

    const {
      type = "announcement",
      page = "1",
      perPage = "10",
      ...filters
    } = req.query;

    const endpointMap = {
      announcement: "getAnnouncementInformation01",
      business: "getBusinessInformation01",
      content: "getContentInformation01",
      stat: "getStatisticalInformation01",
    };

    const endpoint = endpointMap[type];
    if (!endpoint) {
      return res.status(400).json({
        error: "Invalid type. Use: announcement | business | content | stat",
      });
    }

    const baseUrl =
      "https://apis.data.go.kr/B552735/kisedKstartupService01";

    const params = new URLSearchParams({
      ServiceKey: apiKey,
      page: String(page),
      perPage: String(perPage),
      returnType: "json",
    });

    // 추가 필터 (지역, 분야, 공고명 등)
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.append(key, String(value));
      }
    });

    const url = `${baseUrl}/${endpoint}?${params.toString()}`;
    console.log("[K-Startup] Request URL:", url);

    /* ============================
       🔵 캐시 체크
    ============================ */
    const cacheKey = url;
    const ttlMs =
      type === "announcement" || type === "business"
        ? 60 * 1000 // 공고/사업: 1분 캐시
        : 10 * 60 * 1000; // 콘텐츠/통계: 10분 캐시

    const cached = getCache(cacheKey, ttlMs);
    if (cached) {
      return res.status(200).json(cached);
    }

    /* ============================
       🔵 Upstream 호출
    ============================ */
    const upstreamRes = await fetch(url);
    const raw = await upstreamRes.text();
    
// 👇👇 [DEBUG LOG 추가] 👇👇
    console.log("========================================");
    console.log("[SMES API RAW DATA] 데이터 확인 시작");
    console.log(raw.substring(0, 500)); // 에러 코드가 여기에 담겨있습니다.
    console.log("========================================");
    // 👆👆 [DEBUG LOG 끝] 👆👆
    
    if (!upstreamRes.ok) {
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
      console.error("[K-Startup] JSON parse failed, raw return");
      // 혹시 JSON이 아니면 원문 그대로 전달
      return res.status(200).send(raw);
    }

    // 캐시에 저장
    setCache(cacheKey, json);

    return res.status(200).json(json);
  } catch (err) {
    console.error("K-Startup Proxy Fatal Error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message,
    });
  }
}
