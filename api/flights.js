const BASE='https://aerodatabox.p.rapidapi.com';

export default async function handler(req,res){
  const {airport,date}=req.query;
  const key=process.env.AERODATABOX_API_KEY;
  if(!key) return res.status(500).json({error:'API Key 尚未配置'});
  if(!airport||!date) return res.status(400).json({error:'缺少机场或日期'});
  const from=`${date}T00:00`, to=`${date}T23:59`;
  const url=`${BASE}/flights/airports/iata/${encodeURIComponent(airport)}/${from}/${to}`;
  try{
    const r=await fetch(url,{headers:{'x-rapidapi-key':key,'x-rapidapi-host':'aerodatabox.p.rapidapi.com'}});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.message||'AeroDataBox 请求失败',detail:data});
    return res.status(200).json({departures:data.departures||[],arrivals:data.arrivals||[]});
  }catch(e){return res.status(500).json({error:'服务器请求航班数据失败'});}
}