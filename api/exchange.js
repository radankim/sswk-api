export default async function handler(request, response) {
  const authkey = process.env.EXIM_KEY; 

  const today = new Date();
  const year = today.getFullYear();
  const month = ('0' + (today.getMonth() + 1)).slice(-2);
  const day = ('0' + today.getDate()).slice(-2);
  const searchDate = `${year}${month}${day}`;

  try {
    const apiUrl = `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${authkey}&searchdate=${searchDate}&data=AP01`;    
    const res = await fetch(apiUrl);
    const data = await res.json();

    response.setHeader('Access-Control-Allow-Credentials', true);
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    
    response.status(200).json(data);
  } catch (error) {
    response.status(500).json({ error: '환율 정보를 가져오는데 실패했습니다.' });
  }
}
