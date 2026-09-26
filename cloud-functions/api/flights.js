const BASE='https://aerodatabox.p.rapidapi.com';
const FA_BASE='https://aeroapi.flightaware.com/aeroapi';

async function fetchBox(url,key){
  const r=await fetch(url,{headers:{'x-rapidapi-key':key,'x-rapidapi-host':'aerodatabox.p.rapidapi.com'}});
  const data=await r.json();
  if(!r.ok) throw new Error(data?.message||'AeroDataBox request failed');
  return data;
}
async function fetchFA(path,key){
  const r=await fetch(FA_BASE+path,{headers:{'x-apikey':key}});
  const data=await r.json();
  if(!r.ok) throw new Error(data?.error||'FlightAware request failed');
  return data;
}
function faToFlight(x,direction){
  const time=direction==='dep'?x.scheduled_out:x.scheduled_in;
  if(!time) return null;
  const type=x.aircraft_type||'Unknown aircraft';
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
export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const airport=url.searchParams.get('airport');
  const date=url.searchParams.get('date');
  const showCodeshare=url.searchParams.get('showCodeshare');
  const key=context.env?.AERODATABOX_API_KEY;
  if(!key) return new Response(JSON.stringify({error:'API Key not configured'}),{status:500,headers:{'Content-Type':'application/json'}});
  if(!airport||!date) return new Response(JSON.stringify({error:'Missing airport or date'}),{status:400,headers:{'Content-Type':'application/json'}});
  try{
    const windows=[['00:00','11:59'],['12:00','23:59']];
    const parts=await Promise.all(windows.map(([fromTime,toTime])=>{
      const query=showCodeshare==='true'?'true':'false';
      const url=BASE+'/flights/airports/iata/'+encodeURIComponent(airport)+'/'+date+'T'+fromTime+'/'+date+'T'+toTime+'?withLeg=true&withCodeshared='+query;
      return fetchBox(url,key);
    }));
    const departures=parts.flatMap(x=>x.departures||[]);
    const arrivals=parts.flatMap(x=>x.arrivals||[]);
    let secondSource={enabled:false,ok:false};
    const faKey=context.env?.FLIGHTAWARE_API_KEY;
    if(faKey){
      try{
        const [fd,fa]=await Promise.all([
          fetchFA('/airports/'+encodeURIComponent(airport)+'/flights/scheduled_departures?max_pages=5',faKey),
          fetchFA('/airports/'+encodeURIComponent(airport)+'/flights/scheduled_arrivals?max_pages=5',faKey)
        ]);
        const fd2=(fd.scheduled||[]).filter(x=>String(x.scheduled_out||'').slice(0,10)===date).map(x=>faToFlight(x,'dep')).filter(Boolean);
        const fa2=(fa.scheduled||[]).filter(x=>String(x.scheduled_in||'').slice(0,10)===date).map(x=>faToFlight(x,'arr')).filter(Boolean);
        const byKey=x=>String(x.number||x.flightNumber||'').replace(/\s+/g,'').toUpperCase();
        const boxMap=new Map([...departures,...arrivals].map(x=>[byKey(x),x]));
        for(const x of [...fd2,...fa2]){
          const hit=boxMap.get(byKey(x));
          if(hit){
            hit.__sources=[...(hit.__sources||[]),'FlightAware'];
            hit.__flightAware={aircraftType:x.aircraft?.model||x.aircraft?.type||x.aircraft?.icao||'',registration:x.aircraft?.reg||x.aircraft?.registration||''};
            const boxType=hit.aircraft?.model||hit.aircraft?.type||hit.aircraft?.icao||'';
            const faType=hit.__flightAware.aircraftType;
            if(boxType&&faType&&boxType.toUpperCase()!==faType.toUpperCase()) hit.__aircraftConflict=true;
          }
        }
        secondSource={enabled:true,ok:true,matched:fd2.length+fa2.length};
      }catch(e){secondSource={enabled:true,ok:false,error:e.message};}
    }
    return new Response(JSON.stringify({departures,arrivals,source:'AeroDataBox',secondSource,fetchedAt:new Date().toISOString()}),{status:200,headers:{'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({error:e.message||'Server failed to fetch flight data'}),{status:502,headers:{'Content-Type':'application/json'}});
  }
}
