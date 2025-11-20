export default async function handler(request, response) {
  const authkey = process.env.BIZ_KEY;
  
  // [수정됨] 인증키에 있는 특수문자(+, = 등)가 깨지지 않도록 'encodeURIComponent'로 감싸줍니다.
  const encodedKey = encodeURIComponent(authkey);

  // 기업마당 API 주소 (JSON 요청)
  const apiUrl = `https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=${encodedKey}&dataType=json&searchCnt=6`;

  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  try {
    const res = await fetch(apiUrl);
    const rawData = await res.json();
    
    // 데이터 확인 (디버깅용)
    console.log("API Response:", JSON.stringify(rawData).substring(0, 200));

    // 데이터가 없는 경우
    if (!rawData || !rawData.jsonArray || rawData.jsonArray.length === 0) {
       return response.status(200).json({ status: 'empty', data: [] });
    }

    const cleanData = rawData.jsonArray.map(item => {
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
            if(diffDays <= 7) dDayClass = "warning";
            else dDayClass = "safe";
        }
      }

      return {
        title: item.pblancNm,
        category: item.pldirSportRealmMnm,
        org: item.excInsttNm || item.jrsdInsttNm,
        url: "https://www.bizinfo.go.kr" + item.pblancUrl,
        endDate: item.reqstEndDe,
        dDay: dDayTag,
        dDayClass: dDayClass
      };
    });

    response.status(200).json({ status: 'success', data: cleanData });

  } catch (error) {
    console.error("Server Error:", error);
    response.status(500).json({ error: '데이터 처리 중 오류 발생' });
  }
}
