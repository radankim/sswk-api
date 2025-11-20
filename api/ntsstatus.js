export default async function handler(request, response) {
  // 1. Vercel 환경변수에서 NTS_KEY를 가져옴 (Decoding Key를 넣었을 수도 있으므로)
  const serviceKey = process.env.NTS_KEY;
  if (!serviceKey) {
    return response.status(500).json({ error: 'NTS API Key Missing' });
  }

  // [최종 수정] Decoding Key이든 Encoding Key이든 안전하게 URL 인코딩 처리
  const encodedKey = encodeURIComponent(serviceKey); 
  
  const NTS_API_URL = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodedKey}`;
  
  // 2. 요청 검증 (405 에러 발생 시킴)
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  
  // 3. 요청 본문
  const requestBody = request.body; 

  response.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // 4. 국세청 서버로 POST 요청 전달
    const ntsResponse = await fetch(NTS_API_URL, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    const data = await ntsResponse.json();

    // 5. 결과를 프론트엔드에 그대로 전달
    response.status(200).json(data);

  } catch (error) {
    console.error("NTS Proxy Error:", error);
    response.status(500).json({ error: 'Failed to communicate with NTS API' });
  }
}
