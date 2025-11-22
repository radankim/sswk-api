export default async function handler(req, res) {
  // ...
  const apiKey = process.env.SMES_KEY;

  const {
    strDt,
    endDt,
    html = "no",
    range,              // ✅ 추가
  } = req.query;

  const baseUrl = "https://www.smes.go.kr/fnct/apiReqst/extPblancInfo";

  const params = new URLSearchParams({
    token: apiKey,
    html: String(html),
  });

  // ✅ range=all 이 아니면 기본적으로 "최근 1년" 같은 기간 제한 걸기
  if (range !== "all") {
    const today = new Date();
    const endDefault = formatYmd(today);

    const start = new Date(today);
    start.setFullYear(start.getFullYear() - 1); // 최근 1년
    const startDefault = formatYmd(start);

    params.append("strDt", String(strDt || startDefault));
    params.append("endDt", String(endDt || endDefault));
  } else {
    // 상시모집 버튼 모드에서는 기간 제한 없이 전체 조회
    if (strDt) params.append("strDt", String(strDt));
    if (endDt) params.append("endDt", String(endDt));
  }

  const url = `${baseUrl}?${params.toString()}`;
  // 이하 로직은 그대로...
}

function formatYmd(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}
