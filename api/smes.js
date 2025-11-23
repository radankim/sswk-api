// /api/smes.js
// 중소벤처24 공고 정보 API Proxy
// - CORS 허용
// - 메모리 캐시 (30분)
// - 브라우저/엣지 캐시 힌트
// - 기본 모드: 최근 1년 + 상시모집 제외 + 최대 N건
// - 상시 모드: 상시모집 공고만 + 최대 N건

const cacheStore = new Map(); // URL별 캐시 { data, ts }

// ✅ 한 번에 내려보낼 최대 공고 개수 (필요하면 숫자 조정 가능)
const MAX_ITEMS_DEFAULT = 500; // 기본 모드(최근 1년)
const MAX_ITEMS_ALWAYS  = 300; // 상시모집 모드

// =======================
// 간단 메모리 캐시 유틸
// =======================
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

// =======================
// 날짜 유틸 ("2025-11-03" 또는 "20251103")
// =======================
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

// =======================
// 상시모집 여부 판단 (백엔드 기준)
// =======================
function isAlwaysRecruit(item) {
  const title = (item.pblancNm || "").toLowerCase();
  const desc = (
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

  // ③ 종료일이 너무 먼 미래인 경우
  const end = parseYmdLike(item.pblancEndDt);
  if (end) {
    const farFuture = new Date(2099, 0, 1);
    if (end >= farFuture) return true;
  }

  return false;
}

// =======================
// 상태 계산 (ongoing / upcoming / closed)
// =======================
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

// =======================
// 리스트 응답용 "다이어트": 필요한 필드만 선별
// =======================
function stripHeavyFields(item) {
  return {
    // 프론트에서 실제로 사용하는 필드만 남김
    pblancNm: item.pblancNm,           // 공고명
    bizType: item.bizType,             // 분야
    sportInsttNm: item.sportInsttNm,   // 주관/지원기관

    pblancBgnDt: item.pblancBgnDt,     // 시작일자
    pblancEndDt: item.pblancEndDt,     // 마감일자

    pblancDtlUrl: item.pblancDtlUrl,   // 상세보기 URL
    reqstLinkInfo: item.reqstLinkInfo, // 기타 링크

    // 추후 디테일 페이지용으로 쓸 수도 있는 식별자 정도만
    pblancSn: item.pblancSn,
    pblancId: item.pblancId,
  };
}

// =======================
// 메인 핸들러
// =======================
export default async function handler(req, res) {
  // CORS
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

    // 날짜 필터는 SMES API에 직접 걸지 않음 (버그/에러 회피)
    const params = new URLSearchParams({
      token: apiKey,
      html: String(html),
    });

    const upstreamUrl = `${baseUrl}?${params.toString()}`;
    const ttlMs = 30 * 60 * 1000; // 30분 캐시

    // =======================
    // 메모리 캐시 조회
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

    // ✅ 여기서 "최신순 정렬 + 최대 개수 제한"을 걸어줍니다.
    items.sort((a, b) => {
      const aDate =
        parseYmdLike(a.pblancBgnDt) ||
        parseYmdLike(a.pblancEndDt) ||
        new Date(0);
      const bDate =
        parseYmdLike(b.pblancBgnDt) ||
        parseYmdLike(b.pblancEndDt) ||
        new Date(0);

      return bDate - aDate; // 최신순 (날짜 큰 것 먼저)
    });

    if (isAlwaysMode && items.length > MAX_ITEMS_ALWAYS) {
      items = items.slice(0, MAX_ITEMS_ALWAYS);
    } else if (!isAlwaysMode && items.length > MAX_ITEMS_DEFAULT) {
      items = items.slice(0, MAX_ITEMS_DEFAULT);
    }

    // 상태, 기타 파생 필드 추가 + 무거운 필드 제거
    const enriched = items.map((item) => ({
      ...stripHeavyFields(item),
      _status: getStatus(item),
    }));

    // 응답 JSON (필요한 정보만 전달)
    const responseJson = {
      resultCd: baseJson.resultCd,
      resultMsg: baseJson.resultMsg,
      totalCount: enriched.length,
      data: enriched,
    };

    // 브라우저 + Vercel 엣지 캐시 힌트
    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=1800, stale-while-revalidate=60"
    );

    return res.status(200).json(responseJson);
  } catch (err) {
    console.error("SMES Proxy Fatal Error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message,
    });
  }
}
