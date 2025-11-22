// /api/smes.js
// 중소벤처24 공고 정보 API Proxy
// - CORS 허용
// - 30분 캐싱
// - 기본모드: 최근 1년 + 상시모집 제외
// - 상시모집 모드: 상시모집 공고만 (전체 기간 기준)

const cacheStore = new Map(); // URL별 캐시 { data, ts }

// 단순 메모리 캐시
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

// "2025-11-03" 또는 "20251103" 둘 다 처리
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

// 상시모집 여부 판단 (백엔드 버전, 프론트와 동일 기준)
function isAlwaysRecruit(item) {
  const title = (item.pblancNm || "").toLowerCase();
  const desc =
    (
      (item.cn || "") +
      " " +
      (item.rm || "") +
      " " +
      (item.etc || "") +
      " " +
      (item.pblancCn || "")
    ).toLowerCase();
  const txt = title + " " + desc;

  // ① 텍스트 키워드 기준
  const keywords = ["상시", "연중", "수시", "모집시까지", "접수시까지"];
  if (keywords.some((k) => txt.includes(k))) return true;

  // ② 종료일 특수값 기준
  const noEndList = ["", null, "0000-00-00", "9999-12-31", "2999-12-31"];
  if (noEndList.includes(item.pblancEndDt)) return true;

  // ③ 종료일이 너무 먼 미래인 경우 (옵션)
  const end = parseYmdLike(item.pblancEndDt);
  if (end) {
    const farFuture = new Date(2099, 0, 1);
    if (end >= farFuture) return true;
  }

  return false;
}

// 상태 계산 (프론트에서도 쓰지만, 필요 시 참고용 필드로 붙일 수 있음)
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

    // mode / range 파라미터로 동작 모드 분기
    // - 기본: mode=default (또는 파라미터 없음)
    // - 상시모집: mode=always 또는 range=always / range=all
    const { mode, range, html = "no" } = req.query;

    const isAlwaysMode =
      mode === "always" || range === "always" || range === "all";

    const baseUrl =
      "https://www.smes.go.kr/fnct/apiReqst/extPblancInfo";

    // ❗ 날짜 필터는 SMES API에 안 건다 (버그/에러 회피)
    const params = new URLSearchParams({
      token: apiKey,
      html: String(html),
    });

    const upstreamUrl = `${baseUrl}?${params.toString()}`;
    const ttlMs = 30 * 60 * 1000; // 30분 캐시

    // =======================
    // 캐시 조회
    // =======================
    let baseJson = getCache(upstreamUrl, ttlMs);

    if (!baseJson) {
      const upstreamRes = await fetch(upstreamUrl);
      const raw = await upstreamRes.text();

      console.log("========================================");
      console.log("[SMES API RAW DATA] 일부 출력");
      console.log(raw.substring(0, 300));
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
        console.error("[SMES] JSON parse failed, 반환 텍스트 그대로 전달");
        return res.status(200).send(raw);
      }

      setCache(upstreamUrl, baseJson);
    }

    // 원본 에러코드는 그대로 전달
    if (baseJson.resultCd && baseJson.resultCd !== "0") {
      return res.status(200).json(baseJson);
    }

    const allItems = Array.isArray(baseJson.data) ? baseJson.data : [];

    // =======================
    // 모드별 데이터 필터링
    // =======================
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    let items;

    if (isAlwaysMode) {
      // 🔹 상시모집 모드: 상시모집 공고만
      items = allItems.filter((item) => isAlwaysRecruit(item));
    } else {
      // 🔹 기본 모드: 최근 1년 + 상시모집 제외
      items = allItems.filter((item) => {
        if (isAlwaysRecruit(item)) return false; // 상시 제외

        const s = parseYmdLike(item.pblancBgnDt);
        const e = parseYmdLike(item.pblancEndDt);

        // 날짜 정보가 전혀 없으면 기본 모드에서는 제외
        if (!s && !e) return false;

        const recentStart = s && s >= oneYearAgo;
        const recentEnd = e && e >= oneYearAgo;

        return recentStart || recentEnd;
      });
    }

    // 상태, 기타 파생 필드 추가 (옵션)
    const enriched = items.map((item) => ({
      ...item,
      _status: getStatus(item),
    }));

    // 원본 JSON을 유지하면서 data만 교체
    const responseJson = {
      ...baseJson,
      data: enriched,
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
