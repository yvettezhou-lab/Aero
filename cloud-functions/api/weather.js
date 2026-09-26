const BASE='https://api.open-meteo.com/v1/forecast';

export async function onRequestGet(context){
  const url=new URL(context.request.url);
  const lat=url.searchParams.get('lat');
  const lon=url.searchParams.get('lon');
  const start=url.searchParams.get('start');
  const end=url.searchParams.get('end');
  if(!lat||!lon||!start||!end) return new Response(JSON.stringify({error:'Missing weather query parameters'}),{status:400,headers:{'Content-Type':'application/json'}});
  const params=new URLSearchParams({
    latitude:lat,longitude:lon,start_date:start,end_date:end,timezone:'auto',
    temperature_unit:'celsius',wind_speed_unit:'kmh',precipitation_unit:'mm',
    hourly:['temperature_2m','precipitation_probability','precipitation','weather_code','cloud_cover','cloud_cover_low','visibility','wind_speed_10m','wind_direction_10m','wind_gusts_10m','is_day'].join(','),
    daily:['sunrise','sunset'].join(',')
  });
  try{
    const r=await fetch(BASE+'?'+params.toString(),{headers:{'User-Agent':'Aero-spotting-pwa'}});
    const data=await r.json();
    if(!r.ok) throw new Error(data?.reason||'Weather service request failed');
    return new Response(JSON.stringify({...data,fetchedAt:new Date().toISOString()}),{status:200,headers:{'Content-Type':'application/json'}});
  }catch(e){
    return new Response(JSON.stringify({error:e.message||'Weather service unavailable'}),{status:502,headers:{'Content-Type':'application/json'}});
  }
}
