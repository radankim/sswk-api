// /api/kstartup.js
// K-Startup API Proxy (No xml2js, Pure XML Parser version)

export default async function handler(req, res) {
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
        error: "Invalid type. Use announcement | business | content | stat ",
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

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        params.append(key, String(value));
      }
    });

    const url = `${baseUrl}/${endpoint}?${params.toString()}`;
    console.log("[K-Startup] Request URL:", url);

    // Upstream API 호출
    const upstreamRes = await fetch(url);
    const raw = await upstreamRes.text();

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        error: "Upstream API error",
        status: upstreamRes.status,
        raw,
      });
    }

    // 1) JSON인지 먼저 확인
    try {
      const json = JSON.parse(raw);
      return res.status(200).json(json);
    } catch (_) {
      // JSON이 아니면 XML로 판단
      console.log("[K-Startup] JSON Parse Fail → XML detected");
    }

    // 2) XML → JSON (Pure JS Parser)
    function xmlToJson(xml) {
      const parser = new DOMParser();
      const dom = parser.parseFromString(xml, "text/xml");

      function traverse(node) {
        const obj = {};
        if (node.nodeType === 1) {
          // element
          if (node.attributes.length > 0) {
            obj["@attributes"] = {};
            for (let attr of node.attributes) {
              obj["@attributes"][attr.nodeName] = attr.nodeValue;
            }
          }
        } else if (node.nodeType === 3) {
          // text
          const trimmed = node.nodeValue.trim();
          if (trimmed) return trimmed;
        }

        for (let child of node.childNodes) {
          const childObj = traverse(child);
          if (!childObj) continue;

          const name = child.nodeName;
          if (obj[name] === undefined) {
            obj[name] = childObj;
          } else {
            // 여러 개이면 배열로
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
