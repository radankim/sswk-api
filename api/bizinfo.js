export default async function handler(request, response) {
  // 1. Vercel 환경변수에 저장한 인증키 (BIZ_KEY)
  const authkey = process.env.BIZ_KEY;
  const encodedKey = encodeURIComponent(authkey); // 특수문자 방지

  // [수정됨] 공공데이터 포털 통합 API 주소 사용
  const API_ID = '15077093'; // 중소벤처기업부_중소기업지원사업목록 서비스 ID
  const ENDPOINT = 'file-data-list'; // 목록 API
  
  // page=1, perPage=10 (10개 노출), returnType=JSON
  const apiUrl = `https://api.odcloud.kr/api/${API_ID}/v1/${ENDPOINT}?serviceKey=${encodedKey}&page=1&perPage=10&returnType=JSON`;

  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  try {
    const res = await fetch(apiUrl);
    const rawData = await res.json();
    
    // 2. 데이터 구조 확인 및 추출
    // odcloud.kr API는 보통 {data: [...]} 구조를 반환합니다.
    const rawItems = rawData.data || []; 

    if (rawItems.length === 0) {
       return response.status(200).json({ status: 'empty', data: [] });
    }

    // 3. 데이터 가공 (필요한 정보만 추출하고 D-Day 계산)
    const cleanData = rawItems.map(item => {
      let dDayTag = "상시";
      let dDayClass = "always"; 
      
      // 마감일 필드 (서비스마다 이름이 다를 수 있어 필드명 보정)
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
        // [필드명 보정] API 문서에 따르면 아래와 같을 확률이 높습니다.
        title: item.pblancNm || item['사업명'],
        category: item.pldirSportRealmMnm || item['지원분야'], 
        org: item.excInsttNm || item['수행기관명'] || item['소관기관'],
        url: item.pblancUrl || item['상세URL'], // 상세 URL은 API에서 완전한 주소를 주지 않을 수 있음
        endDate: endDate,
        dDay: dDayTag,
        dDayClass: dDayClass
      };
    });

    response.status(200).json({ status: 'success', data: cleanData });

  } catch (error) {
    console.error("API Error:", error);
    response.status(500).json({ error: '정부 데이터 연동 실패', details: error.message });
  }
}
