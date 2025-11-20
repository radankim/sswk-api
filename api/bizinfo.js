export default async function handler(request, response) {
  const authkey = process.env.BIZ_KEY;
  // JSON 데이터 요청
  const apiUrl = `https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=${authkey}&dataType=json&searchCnt=5`;

  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  try {
    const res = await fetch(apiUrl);
    const textData = await res.text(); // 일단 글자로 받음 (에러면 XML로 오기 때문)

    // 1. 만약 에러 메시지(SERVICE_KEY_IS_NOT_REGISTERED 등)가 포함되어 있다면?
    if (textData.includes('SERVICE_KEY_IS_NOT_REGISTERED') || textData.includes('REGISTERED')) {
        return response.status(200).json({ 
            status: 'error', 
            message: '⛔ 인증키가 아직 서버에 등록되지 않았습니다. (1시간 뒤 재시도 필요)',
            raw: textData 
        });
    }

    // 2. 정상 JSON인지 파싱 시도
    let rawData;
    try {
        rawData = JSON.parse(textData);
    } catch (e) {
        return response.status(200).json({ 
            status: 'error', 
            message: '⛔ 데이터 형식이 올바르지 않습니다. (키 오류 가능성)',
            raw: textData 
        });
    }
    
    // 3. 데이터가 없는 경우
    if (!rawData || !rawData.jsonArray || rawData.jsonArray.length === 0) {
       return response.status(200).json({ 
           status: 'empty', 
           message: '데이터가 비어있습니다.',
           raw: rawData 
       });
    }

    // 4. 정상 데이터 가공
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
            dDayClass = diffDays <= 7 ? "warning" : "safe";
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
    response.status(500).json({ error: '서버 내부 오류', details: error.message });
  }
}
