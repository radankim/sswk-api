// api/ntsstatus.js (Final NTS Status Checker Proxy - Robust)
export default async function handler(request, response) {
  // 1. 환경변수에서 NTS_KEY를 가져옴
  const serviceKey = process.env.SSWK_NTS_STATUS_KEY; 
  if (!serviceKey) {
    return response.status(500).json({ error: 'NTS_KEY Missing. Please check Vercel Environment Variables.' });
  }

  // 2. 키 안전 처리 (Decoding/Encoding 모두 안전하게 인코딩 처리)
  const encodedKey = encodeURIComponent(serviceKey); 
  
  const NTS_API_URL = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodedKey}`;
  
  // 3. 요청 검증: 405 Method Not Allowed 에러가 뜨는 원인이므로 이 코드는 유지
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  
  // 4. 요청 본문 및 처리
  const requestBody = request.body; 

  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');

  try {
    // 5. 국세청 API 호출
    const ntsResponse = await fetch(NTS_API_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "b_no": requestBody.b_no })
    });

    // 6. 응답 상태 코드 체크 (NTS API에서 400, 401 등이 왔을 때 Vercel이 충돌하지 않게 처리)
    if (!ntsResponse.ok) {
        const errorText = await ntsResponse.text();
        console.error(`NTS API Status Error: ${ntsResponse.status}, Response: ${errorText.substring(0, 100)}`);
        return response.status(200).json({ 
            data: [],
            error: `NTS_API_FAILED_${ntsResponse.status}`,
            message: `인증/호출 실패 (코드 ${ntsResponse.status} - 키 포맷 또는 권한 오류)` 
        });
    }

    const data = await ntsResponse.json();

    // 7. 결과를 프론트엔드에 그대로 전달
    response.status(200).json(data);

  } catch (error) {
    console.error("Vercel Proxy Crash:", error);
    response.status(500).json({ error: 'PROXY_SERVER_CRASH', message: error.message });
  }
}
