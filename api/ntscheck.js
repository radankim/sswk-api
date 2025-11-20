export default async function handler(request, response) {
  // 1. POST 요청만 허용합니다. (GET 요청은 차단)
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  
  // 2. Vercel 환경변수에서 국세청 키 가져오기
  const serviceKey = process.env.NTS_KEY;
  if (!serviceKey) {
    response.status(500).json({ error: 'NTS API Key Missing' });
    return;
  }

  // 3. 국세청 API URL (인증키를 포함하여 URL 생성)
  // 이전 코드에서 사용하셨던 서비스 키와 엔드포인트를 기반으로 구성합니다.
  const NTS_API_URL = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(serviceKey)}`;
  
  // 4. 요청 본문 (Body) 추출: 프론트엔드에서 받은 사업자 번호 배열
  const requestBody = request.body; // { "b_no": ["1234567890", "1112233445"] } 형태 예상
  
  // CORS 설정 (프론트엔드로 다시 데이터를 보내주기 위함)
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');

  try {
    // 5. 국세청 서버로 POST 요청 전달
    const ntsResponse = await fetch(NTS_API_URL, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const data = await ntsResponse.json();

    // 6. 결과를 프론트엔드에 그대로 전달
    response.status(200).json(data);

  } catch (error) {
    console.error("NTS Proxy Error:", error);
    response.status(500).json({ error: 'Failed to communicate with NTS API' });
  }
}
