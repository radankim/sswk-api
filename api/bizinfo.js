export default async function handler(request, response) {
  const authkey = process.env.BIZ_KEY;

  const API_URL =
    `https://api.odcloud.kr/api/15077093/v1/uddi:b6a97856-ac9b-4eac-92a8-48e8988e8880` +
    `?serviceKey=${authkey}&page=1&perPage=50&returnType=JSON`;

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  try {
    const res = await fetch(API_URL);
    const raw = await res.json();

    if (!raw.data || raw.data.length === 0) {
      return response.status(200).json({ status: "empty", data: [] });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const cleanData = raw.data
      .map((item) => {
        const endDate = item["공고마감일자"];
        const title = item["사업명"];
        const org = item["수행기관명"] || item["소관기관"];
        const url = item["상세URL"];
        const category = item["지원분야"] || "기타";

        // D-day 계산
        let dDayTag = "상시";
        let dDayClass = "always";

        if (endDate) {
          const deadline = new Date(endDate);
          const diff = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

          if (diff < 0) {
            dDayTag = "마감";
            dDayClass = "closed";
          } else if (diff === 0) {
            dDayTag = "오늘마감";
            dDayClass = "danger";
          } else {
            dDayTag = `D-${diff}`;
            dDayClass = diff <= 7 ? "warning" : "safe";
          }
        }

        return {
          title,
          category,
          org,
          url,
          endDate: endDate || "상시",
          dDay: dDayTag,
          dDayClass,
        };
      })
      .sort((a, b) => new Date(a.endDate) - new Date(b.endDate));

    response.status(200).json({ status: "success", data: cleanData });
  } catch (err) {
    console.error("Bizinfo Error:", err);
    response.status(500).json({ status: "error", message: err.message });
  }
}
