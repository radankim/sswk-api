export default async function handler(request, response) {
  // 1. Vercel 환경변수에 저장한 인증키 (BIZ_KEY)
  const authkey = process.env.BIZ_KEY;
  const encodedKey = encodeURIComponent(authkey); // 키 보호
  
  const API_ID = '15077093';
  const ENDPOINT = 'file-data-list'; 
  
  // [수정됨] 2024년 1월 1일 이후 모든 공고를 검색하도록 조건 추가 (데이터 강제 호출)
  const searchCondition = `&cond[pblanc_begin_de::GE]=20240101`; 
  
  // 최종 API URL
  const apiUrl = `https://api.odcloud.kr/api/${API_ID}/v1/${ENDPOINT}?serviceKey=${encodedKey}&page=1&perPage=10&returnType=JSON${searchCondition}`;

  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  try {
    const res = await fetch(apiUrl);
    const rawData = await res.json();
    
    // odcloud.kr API는 보통 { data: [...] } 구조를 반환합니다.
    const rawItems = rawData.data || []; 

    if (rawItems.length === 0) {
       // 데이터가 비어있어도, 에러는 아니므로 empty를 반환
       return response.status(200).json({ status: 'empty', data: [] });
    }

    // 3. 데이터 가공
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
        category: item.pldirSportRealmMnm || item['지원분야'] || '분야 미지정', 
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
