// api/ntsstatus.js
export default async function handler(request, response) {
  // -------------------------------
  // 0. 공통 CORS 헤더 (가장 먼저!)
  // -------------------------------
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 0-1. Preflight(OPTIONS) 요청 먼저 처리
  if (request.method === 'OPTIONS') {
    // 브라우저가 사전 확인용으로 보내는 요청 -> 200만 주고 종료
    return response.status(200).end();
  }

  // 0-2. POST 이외 메서드는 차단
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // -------------------------------
  // 1. 환경변수에서 서비스키 읽기
  // -------------------------------
  const serviceKey = process.env.SSWK_NTS_STATUS_KEY;
  if (!serviceKey) {
    return response
      .status(500)
      .json({ error: 'NTS_KEY Missing. Please check Vercel Environment Variables.' });
  }

  // ⚠ 공공데이터포털에서 "인코딩키"를 그대로 넣었다면 이미 %2B... 형태로 인코딩된 값입니다.
  //    그런 경우에는 다시 encodeURIComponent 하면 안 되고, 그냥 그대로 사용해야 합니다.
  const encodedKey = serviceKey; // 인코딩키 그대로 사용

  const NTS_API_URL =
    `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodedKey}`;

  // -------------------------------
  // 2. 요청 body 파싱 & 검증
  // -------------------------------
  let body = request.body;

  // Vercel 설정/프레임워크에 따라 body가 문자열로 오는 경우 방어
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return response.status(400).json({
        error: 'INVALID_JSON',
        message: '요청 body JSON 파싱 실패',
      });
    }
  }

  const bnoList = body?.b_no;

  if (!Array.isArray(bnoList) || bnoList.length === 0) {
    return response.status(400).json({
      error: 'INVALID_BODY',
      message: '요청 body에 b_no: [사업자번호, ...] 배열이 필요합니다.',
    });
  }

  // -------------------------------
  // 3. 국세청 API 호출
  // -------------------------------
  try {
    const ntsResponse = await fetch(NTS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ b_no: bnoList }),
    });

    // 국세청에서 400/401/500 등을 보냈을 때
    if (!ntsResponse.ok) {
      const errorText = await ntsResponse.text();
      console.error(
        `NTS API Status Error: ${ntsResponse.status}, Response: ${errorText.substring(0, 200)}`
      );

      // 프론트 fetch가 CORS/네트워크 오류로 오인하지 않게 200으로 내려 주고,
      // 내부적으로 error 필드에 상태 넣어줌
      return response.status(200).json({
        data: [],
        error: `NTS_API_FAILED_${ntsResponse.status}`,
        message: `국세청 API 호출 실패 (코드 ${ntsResponse.status})`,
      });
    }

    const data = await ntsResponse.json();

    // -------------------------------
    // 4. 결과 그대로 프론트에 전달
    // -------------------------------
    return response.status(200).json(data);
  } catch (error) {
    console.error('Vercel Proxy Crash:', error);
    return response.status(500).json({
      error: 'PROXY_SERVER_CRASH',
      message: error.message,
    });
  }
}
