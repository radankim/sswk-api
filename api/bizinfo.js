export default async function handler(request, response) {
  // 1. Vercel 환경변수에 저장한 인증키 (BIZ_KEY)를 가져옴 (현재 Encoding Key 상태)
  const authkey = process.env.BIZ_KEY;
  // [수정됨] API 키가 이미 Encoding 되어 있으므로, 추가적인 인코딩 없이 그대로 사용합니다.
  const encodedKey = authkey; 

  const API_ID = '15077093'; 
  const ENDPOINT = 'file-data-list'; 
  
  // serviceKey 파라미터로 Encoding Key를 그대로 전송합니다.
  const apiUrl = `https://api.odcloud.kr/api/${API_ID}/v1/${ENDPOINT}?serviceKey=${encodedKey}&page=1&perPage=10&returnType=JSON`;

  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  try {
    const res = await fetch(apiUrl);
    const rawData = await res.json();
    
    const rawItems = rawData.data || []; 

    if (rawItems.length === 0) {
       return response.status(200).json({ status: 'empty', data: [] });
    }

    const cleanData = rawItems.map(item => {
      let dDayTag = "상시";
      let dDayClass = "always"; 
      
      const endDate = item.pblancClosDe || item['공고마감일'] || item.reqstEndDe; 
      
      if (endDate) { 
        const today = new Date();
        today.setHours(0,0,0,0);
        const deadlineDate = new Date(endDate);
        const diffTime = deadlineDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) { dDayTag = "마감"; dDayClass = "closed"; }
        else if (diffDays === 0) { dDayTag = "오늘마감"; dDayClass = "danger"; }
        else {
            dDayTag = `D-${diffDays}`;
            dDayClass = diffDays <= 7 ? "warning" : "safe";
        }
      }

      return {
        title: item.pblancNm || item['사업명'],
        category: item.pldirSportRealmMnm || item['지원분야'], 
        org: item.excInsttNm || item['수행기관명'] || item['소관기관'],
        url: item.pblancUrl || item['상세URL'], 
        endDate: endDate,
        dDay: dDayTag,
        dDayClass: dDayClass
      };
    });

    response.status(200).json({ status: 'success', data: cleanData });

  } catch (error) {
    console.error("API Error:", error);
    response.status(500).json({ error: '데이터 처리 중 오류 발생', details: error.message });
  }
}
