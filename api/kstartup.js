// /api/kstartup.js
// K-Startup(창업진흥원) 프록시 API
// type 파라미터로 어떤 데이터인지 구분:
//  - announcement : 지원사업 공고 정보
//  - business     : 통합공고 + 지원사업 정보
//  - content      : 창업 관련 콘텐츠 정보
//  - stat         : 창업 관련 통계 보고서 정보

export default async function handler(req, res) {
  try {
    const apiKey = process.env.KSTARTUP_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "KSTARTUP_KEY is not set in environment variables.",
      });
    }

    // 쿼리 파라미터 분리
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
        error: "Invalid 'type' parameter. Use one of: announcement, business, content, stat.",
      });
    }

    const baseUrl = "https://apis.data.go.kr/B552735/kisedKstartupService01";

    // 공통 파라미터 세팅
    const params = new URLSearchParams({
      ServiceKey: apiKey,          // 🔹 Decoding 키 그대로 넣기 (URLSearchParams가 인코딩 처리)
      page: String(page),
      perPage: String(perPage),
      returnType: "json",
    });

    // 사용자가 넣은 필터 파라미터 (지역, 공고명 등) 추가
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.append(key, String(value));
      }
    });

    const url = `${baseUrl}/${endpoint}?${params.toString()}`;
    console.log("[K-Startup] Request URL:", url);

    const upstreamRes = await fetch(url);
    const text = await upstreamRes.text();

    // K-Startup 쪽에서 에러일 경우 그대로 상태코드/본문 전달
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: "Upstream API error",
        status: upstreamRes.status,
        body: text,
      });
    }

    // JSON 파싱 시도
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 혹시 JSON이 아니면 원문 그대로 반환
      return res.status(200).send(text);
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error("K-Startup API proxy error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
