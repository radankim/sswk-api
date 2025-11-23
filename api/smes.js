// /api/smes.js
// 중소벤처24 공고 정보 API Proxy
// - CORS 허용
// - Vercel CDN 캐싱 적용 (s-maxage=3600: 1시간 캐시)

// 날짜 파싱 유틸
function parseYmdLike(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mth = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mth || !d) return null;
  return new Date(y, mth - 1, d);
}

// 상시모집 여부 판단
function isAlwaysRecruit(item) {
  const title = (item.pblancNm || "").toLowerCase();
  const desc = (
    (item.cn || "") + " " +
    (item.rm || "") + " " +
    (item.etc || "") + " " +
    (item.pblancCn || "")
  ).toLowerCase();
  const txt = title + " " + desc;

  const keywords = ["상시", "연중", "수시", "모집시까지", "접수시까지"];
  if (keywords.some((k) => txt.includes(k))) return true;

  const noEndList = ["", null, "0000-00-00", "9999-12-31", "2999-12-31"];
  if (noEndList.includes(item.pblancEndDt)) return true;

  const end = parseYmdLike(item.pblancEndDt);
  if (end) {
    const farFuture = new Date(2099, 0, 1);
    if (end >= farFuture) return true;
  }
  return false;
}

// 상태 계산
function getStatus(item) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = parseYmdLike(item.pblancBgnDt);
  const end = parseYmdLike(item.pblancEndDt);

  if (start) start.setHours(0, 0, 0, 0);
  if (end) end.setHours(23, 59, 59, 999);

  if (start && today < start) return "upcoming";
  if (end && today > end) return "closed";
  return "ongoing";
}

export default async function handler(req, res) {
  // 1. CORS 설정
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 2. ★ 핵심: Vercel CDN 캐싱 설정 (속도 개선의 키)
  // s-maxage=3600: Vercel CDN이 1시간(3600초) 동안 데이터를 저장함 (사용자는 이 캐시된 데이터를 받음)
  // stale-while-revalidate=59: 캐시 만료 후 요청이 오면 일단 옛날 데이터를 주고, 뒤에서 몰래 새 데이터를 갱신함
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=59");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const apiKey = process.env.SMES_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "SMES_KEY missing" });
    }

    const { mode, range, html = "no" } = req.query;
    const isAlwaysMode = mode === "always" || range === "always" || range === "all";

    const baseUrl = "https://www.smes.go.kr/fnct/apiReqst/extPblancInfo";
    const params = new URLSearchParams({ token: apiKey, html: String(html) });
    const upstreamUrl = `${baseUrl}?${params.toString()}`;

    // 3. 외부 API 호출 (캐시 로직 제거, Vercel 헤더에 위임)
    const upstreamRes = await fetch(upstreamUrl);
    
    if (!upstreamRes.ok) {
      // 에러 발생 시 캐시하지 않도록 헤더 제거
      res.removeHeader("Cache-Control"); 
      return res.status(upstreamRes.status).json({ error: "Upstream API error" });
    }

    const rawText = await upstreamRes.text();
    let baseJson;
    
    try {
      baseJson = JSON.parse(rawText);
    } catch (e) {
      // JSON 파싱 실패 시 원본 텍스트 반환
      return res.status(200).send(rawText);
    }

    if (baseJson.resultCd && baseJson.resultCd !== "0") {
      return res.status(200).json(baseJson);
    }

    const allItems = Array.isArray(baseJson.data) ? baseJson.data : [];

    // 4. 데이터 필터링
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    let items;

    if (isAlwaysMode) {
      items = allItems.filter((item) => isAlwaysRecruit(item));
    } else {
      items = allItems.filter((item) => {
        if (isAlwaysRecruit(item)) return false;
        const s = parseYmdLike(item.pblancBgnDt);
        const e = parseYmdLike(item.pblancEndDt);
        if (!s && !e) return false;
        const recentStart = s && s >= oneYearAgo;
        const recentEnd = e && e >= oneYearAgo;
        return recentStart || recentEnd;
      });
    }

    const enriched = items.map((item) => ({
      ...item,
      _status: getStatus(item),
    }));

    // data만 교체하여 반환
    const responseJson = { ...baseJson, data: enriched };
    
    return res.status(200).json(responseJson);

  } catch (err) {
    console.error("Error:", err);
    res.removeHeader("Cache-Control"); // 에러는 캐시하면 안 됨
    return res.status(500).json({ error: "Internal server error", detail: err.message });
  }
}
