export default async function handler(request, response) {
  // 1. [수정됨] 새로운 환경 변수 이름으로 키를 가져옵니다.
  const serviceKey = process.env.SSWK_NTS_STATUS_KEY; 
  if (!serviceKey) {
    // 키가 없으면 바로 에러 반환
    return response.status(500).json({ error: 'NTS_KEY Missing. Please check Vercel Environment Variables.' });
  }

  // 2. 키 안전 처리
  const encodedKey = encodeURIComponent(serviceKey); 
  
  const NTS_API_URL = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodedKey}`;
  
  // 3. 요청 검증
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  
  // 4. 요청 본문 및 처리 (이하 동일)
  const requestBody = request.body; 

  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');

  try {
    const ntsResponse = await fetch(NTS_API_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "b_no": requestBody.b_no })
    });

    if (!ntsResponse.ok) {
        // NTS API에서 받은 에러 메시지를 파싱하여 프론트엔드에 전달
        const errorText = await ntsResponse.text();
        console.error(`NTS API Status Error: ${ntsResponse.status}, Response: ${errorText.substring(0, 100)}`);
        return response.status(200).json({ 
            data: [],
            error: `NTS_API_FAILED_${ntsResponse.status}`,
            message: `인증/호출 실패 (코드 ${ntsResponse.status} - 키 포맷 또는 권한 오류)` 
        });
    }

    const data = await ntsResponse.json();
    response.status(200).json(data);

  } catch (error) {
    console.error("Vercel Proxy Crash:", error);
    response.status(500).json({ error: 'PROXY_SERVER_CRASH', message: error.message });
  }
}
