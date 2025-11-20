export default async function handler(request, response) {
  // 1. Vercel 환경변수에 저장한 인증키 (BIZ_KEY)
  const authkey = process.env.BIZ_KEY;

  // 2. 기업마당(중소벤처기업부) 실시간 API 호출
  // json 데이터로 요청, 최신순 20개
  const apiUrl = `https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=${authkey}&dataType=json&searchCnt=20`;

  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  try {
    const res = await fetch(apiUrl);
    const rawData = await res.json();

    // 데이터가 비어있을 경우 처리
    if (!rawData || !rawData.jsonArray || rawData.jsonArray.length === 0) {
       return response.status(200).json({ status: 'empty', data: [] });
    }

    // 3. 필요한 데이터만 정제 (Mapping)
    const cleanData = rawData.jsonArray.map(item => {
      // D-Day 계산
      let dDayTag = "상시";
      let dDayClass = "always"; 

      if (item.reqstEndDe) {
        const today = new Date();
        today.setHours(0,0,0,0);
        const endDate = new Date(item.reqstEndDe);
        const diffTime = endDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) { dDayTag = "마감"; dDayClass = "closed"; }
        else if (diffDays === 0) { dDayTag = "오늘마감"; dDayClass = "danger"; }
        else {
            dDayTag = `D-${diffDays}`;
            dDayClass = diffDays <= 7 ? "warning" : "safe";
        }
      }

      return {
        title: item.pblancNm,          // 공고명
        category: item.pldirSportRealmMnm, // 지원분야 (금융, 기술 등)
        org: item.excInsttNm || item.jrsdInsttNm, // 소관기관
        url: "https://www.bizinfo.go.kr" + item.pblancUrl, // 상세 링크 (상대경로일 경우 대비)
        endDate: item.reqstEndDe,      // 마감일
        dDay: dDayTag,
        dDayClass: dDayClass
      };
    });

    response.status(200).json({ status: 'success', data: cleanData });

  } catch (error) {
    console.error("API Error:", error);
    response.status(500).json({ error: '데이터 연동 실패' });
  }
}
