// /api/kstartup.js
// K-Startup API Proxy (Pure JSON/XML Auto Parser + Full CORS)

export default async function handler(req, res) {
  /* =====================================================
     🔵 CORS 설정 (브라우저 요청 허용)
  ===================================================== */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 브라우저 사전 요청(OPTIONS) 처리
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  /* =====================================================
     🔵 본 로직 시작
  ===================================================== */
  try {
    const apiKey = process.env.KSTARTUP_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "KSTARTUP_KEY is not set.",
      });
    }

    // Query parsing
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
        error: "Invalid type. Must use announcement | business | content | stat",
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

    // 유저 필터 자동 추가
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== "") {
        params.append(k, String(v));
      }
    });

    const url = `${baseUrl}/${endpoint}?${params.toString()}`;
    console.log("[K-Startup] Request URL:", url);

    /* =====================================================
       🔵 Upstream API 호출
    ===================================================== */
    const upstreamRes = await fetch(url);
    const raw = await upstreamRes.text();

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: "Upstream API error",
        status: upstreamRes.status,
        raw,
      });
    }

    /* =====================================================
       🔵 JSON인지 먼저 검사
    ===================================================== */
    try {
      const json = JSON.parse(raw);
      return res.status(200).json(json);
    } catch (e) {
      console.log("[K-Startup] JSON Parse Fail → XML detected");
    }

    /* =====================================================
       🔵 XML → JSON (순수 JS)
    ===================================================== */
    function xmlToJson(xml) {
      const parser = new DOMParser();
      const dom = parser.parseFromString(xml, "text/xml");

      function traverse(node) {
        const obj = {};

        // element
        if (node.nodeType === 1) {
          if (node.attributes.length > 0) {
            obj["@attributes"] = {};
            for (let attr of node.attributes) {
              obj["@attributes"][attr.nodeName] = attr.nodeValue;
            }
          }
        }
        // text
        else if (node.nodeType === 3) {
          const trimmed = node.nodeValue.trim();
          if (trimmed) return trimmed;
        }

        // child nodes
        for (let child of node.childNodes) {
          const childObj = traverse(child);
          if (!childObj) continue;

          const name = child.nodeName;
          if (obj[name] === undefined) {
            obj[name] = childObj;
          } else {
            if (!Array.isArray(obj[name])) {
              obj[name] = [obj[name]];
            }
            obj[name].push(childObj);
          }
        }

        return obj;
      }

      return traverse(dom);
    }

    const xmlJson = xmlToJson(raw);
    return res.status(200).json(xmlJson);

  } catch (err) {
    console.error("K-Startup Proxy Fatal Error:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message,
    });
  }
}
