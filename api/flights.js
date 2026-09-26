const BASE='https://aerodatabox.p.rapidapi.com';
const FA_BASE='https://aeroapi.flightaware.com/aeroapi';

async function fetchBox(url,key){
  const r=await fetch(url,{headers:{'x-rapidapi-key':key,'x-rapidapi-host':'aerodatabox.p.rapidapi.com'}});
  const data=await r.json();
  if(!r.ok) throw new Error(data?.message||'AeroDataBox 请求失败');
  return data;
}
async function fetchFA(path,key){
  const r=await fetch(FA_BASE+path,{headers:{'x-apikey':key}});
  const data=await r.json();
  if(!r.ok) throw new Error(data?.error||'FlightAware 请求失败');
  return data;
}
function faToFlight(x,direction){
  const time=direction==='dep'?x.scheduled_out:x.scheduled_in;
  if(!time) return null;
  const type=x.aircraft_type||'未知机型';
  const origin=x.origin?.code_iata||x.origin?.code_icao||x.origin||'—';
  const destination=x.destination?.code_iata||x.destination?.code_icao||x.destination||'—';
  const ident=x.ident_iata||x.ident_icao||x.ident||'—';
  return {
    number:ident,
    airline:{name:x.operator?.name||x.operator_iata||x.operator_icao||''},
    aircraft:{model:type,reg:x.registration||''},
    departure:{airport:{iata:origin},scheduledTime:{local:time}},
    arrival:{airport:{iata:destination},scheduledTime:{local:direction==='arr'?time:''}},
    status:x.cancelled?'Cancelled':'Scheduled',
    __provider:'FlightAware'
  };
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
    let departures=parts.flatMap(x=>x.departures||[]);
    let arrivals=parts.flatMap(x=>x.arrivals||[]);
    let secondSource={enabled:false,ok:false};
    const faKey=process.env.FLIGHTAWARE_API_KEY;
    if(faKey){
      try{
        const [fd,fa]=await Promise.all([
          fetchFA('/airports/'+encodeURIComponent(airport)+'/flights/scheduled_departures?max_pages=5',faKey),
          fetchFA('/airports/'+encodeURIComponent(airport)+'/flights/scheduled_arrivals?max_pages=5',faKey)
        ]);
        const target=date;
        const fd2=(fd.scheduled||[]).filter(x=>String(x.scheduled_out||'').slice(0,10)===target).map(x=>faToFlight(x,'dep')).filter(Boolean);
        const fa2=(fa.scheduled||[]).filter(x=>String(x.scheduled_in||'').slice(0,10)===target).map(x=>faToFlight(x,'arr')).filter(Boolean);
        const byKey=(x)=>String(x.number||x.flightNumber||'').replace(/\s+/g,'').toUpperCase()+'|'+String(x.departure?.scheduledTime?.local||x.arrival?.scheduledTime?.local||'').slice(0,16);
        const boxMap=new Map([...departures,...arrivals].map(x=>[byKey(x),x]));
        for(const x of [...fd2,...fa2]){
          const hit=boxMap.get(byKey(x));
          if(hit){hit.__sources=[...(hit.__sources||[]),'FlightAware'];}
        }
        secondSource={enabled:true,ok:true,matched:fd2.length+fa2.length};
      }catch(e){secondSource={enabled:true,ok:false,error:e.message};}
    }
    return res.status(200).json({departures,arrivals,source:'AeroDataBox',secondSource,fetchedAt:new Date().toISOString()});
  }catch(e){return res.status(502).json({error:e.message||'服务器请求航班数据失败'});}
}