// /api/kstartup.js
// K-Startup(창업진흥원) 프록시 API (XML 자동 변환 + 안정성 강화 버전)

import xml2js from "xml2js";

export default async function handler(req, res) {
  try {
    const apiKey = process.env.KSTARTUP_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "KSTARTUP_KEY is missing in environment variables.",
      });
    }

    // 쿼리 파라미터
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
        error: `Invalid type. Use: announcement | business | content | stat`,
      });
    }

    const baseUrl = "https://apis.data.go.kr/B552735/kisedKstartupService01";

    const params = new URLSearchParams({
      ServiceKey: apiKey,
      page: String(page),
      perPage: String(perPage),
      returnType: "json"
    });

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.append(key, String(value));
      }
    });

    const url = `${baseUrl}/${endpoint}?${params.toString()}`;
    console.log("[K-Startup] Request URL:", url);

    // Upstream 호출
    const upstreamRes = await fetch(url);
    const raw = await upstreamRes.text();

    // Upstream이 실패한 경우
    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: "Upstream API error",
        status: upstreamRes.status,
        raw,
      });
    }

    // JSON인지 먼저 확인
    try {
      const json = JSON.parse(raw);
      return res.status(200).json(json);
    } catch (_) {
      console.log("[K-Startup] JSON Parse Fail → XML로 판단");
    }

    // XML → JSON 변환
    try {
      const xmlJson = await xml2js.parseStringPromise(raw, { explicitArray: false });
      return res.status(200).json(xmlJson);
    } catch (e) {
      console.log("[K-Startup] XML Parsing Error:", e.message);
      return res.status(500).json({ error: "Invalid XML format", raw });
    }

  } catch (err) {
    console.error("K-Startup API proxy fatal error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
