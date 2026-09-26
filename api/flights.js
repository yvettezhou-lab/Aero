const BASE='https://aerodatabox.p.rapidapi.com';

async function fetchBox(url,key){
  const r=await fetch(url,{headers:{'x-rapidapi-key':key,'x-rapidapi-host':'aerodatabox.p.rapidapi.com'}});
  const data=await r.json();
  if(!r.ok) throw new Error(data?.message||'AeroDataBox 请求失败');
  return data;
}

export default async function handler(req,res){
  const {airport,date}=req.query;
  const key=process.env.AERODATABOX_API_KEY;
  if(!key) return res.status(500).json({error:'API Key 尚未配置'});
  if(!airport||!date) return res.status(400).json({error:'缺少机场或日期'});
  try{
    const windows=[['00:00','11:59'],['12:00','23:59']];
    const parts=await Promise.all(windows.map(([fromTime,toTime])=>{
      const url=BASE+'/flights/airports/iata/'+encodeURIComponent(airport)+'/'+date+'T'+fromTime+'/'+date+'T'+toTime+'?withLeg=true&withCodeshared=false';
      return fetchBox(url,key);
    }));
    return res.status(200).json({
      departures:parts.flatMap(x=>x.departures||[]),
      arrivals:parts.flatMap(x=>x.arrivals||[]),
      source:'AeroDataBox', fetchedAt:new Date().toISOString()
    });
  }catch(e){return res.status(502).json({error:e.message||'服务器请求航班数据失败'});}
}