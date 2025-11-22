// /api/smes.js
// 중소벤처24 공고 정보 API Proxy (JSON 전용 + CORS + 간단 캐싱 + 기간 필터링)

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

// "20250101" 형식 -> Date
function parseYmd(str) {
  if (!str) return null;
  // "2025-11-03" 도, 혹시 모를 "20251103" 도 모두 허용
  const m = String(str).match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!m) return null;

  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export default async function handler(req, res) {
  // =======================
  // CORS
  // =======================
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const apiKey = process.env.SMES_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "SMES_KEY is not set. Please check Vercel environment variables.",
      });
    }

    // range: "all" | (기타)  → 기본은 최근 1년 뷰
    const { html = "no", range = "recent" } = req.query;

    const baseUrl =
      "https://www.smes.go.kr/fnct/apiReqst/extPblancInfo";

    // ✅ SMES 쪽에는 날짜 파라미터 안 보냄 (기존처럼 token + html만)
    const params = new URLSearchParams({
      token: apiKey,
      html: String(html),
    });

    const url = `${baseUrl}?${params.toString()}`;
    console.log("[SMES] Request URL:", url);

    // =======================
    // 캐시 체크
    // =======================
    const ttlMs = 30 * 60 * 1000; // 30분
    const cached = getCache(url, ttlMs);

    let baseJson;

    if (cached) {
      baseJson = cached;
    } else {
      const upstreamRes = await fetch(url);
      const raw = await upstreamRes.text();

      console.log("========================================");
      console.log("[SMES API RAW DATA] 데이터 확인 시작");
      console.log(raw.substring(0, 500));
      console.log("========================================");

      if (!upstreamRes.ok) {
        return res.status(upstreamRes.status).json({
          error: "Upstream API error",
          status: upstreamRes.status,
          raw,
        });
      }

      try {
        baseJson = JSON.parse(raw);
      } catch (e) {
        console.error("[SMES] JSON parse failed, returning raw text.");
        return res.status(200).send(raw);
      }

      // 원본 전체 데이터를 캐시에 저장 (range와 무관하게)
      setCache(url, baseJson);
    }

    // 혹시 resultCd 자체가 에러면 그대로 전달
    if (baseJson.resultCd && baseJson.resultCd !== "0") {
      return res.status(200).json(baseJson);
    }

    const allItems = Array.isArray(baseJson.data) ? baseJson.data : [];

    let items = allItems;

    // =======================
    // 기간 필터링 (우리 서버 내부 로직)
    // =======================
    if (range !== "all") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const oneYearAgo = new Date(today);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

items = allItems.filter((item) => {
  const s = parseYmd(item.pblancBgnDt);
  const e = parseYmd(item.pblancEndDt);

  // 둘 다 없으면 그냥 포함시킴 (필요하면 나중에 규칙 조정)
  if (!s && !e) return true;

  const recentStart = s && s >= oneYearAgo;
  const recentEnd  = e && e >= oneYearAgo;

  return recentStart || recentEnd;
});
    }

    // ✅ 캐시된 원본은 건드리지 않고, 응답용 객체만 새로 만듦
    const responseJson = {
      ...baseJson,
      data: items,
    };

    return res.status(200).json(responseJson);
  } catch (err) {
    console.error("SMES Proxy Fatal Error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message,
    });
  }
}
