const BASE='https://api.open-meteo.com/v1/forecast';

export default async function handler(req,res){
  const {lat,lon,start,end}=req.query;
  if(!lat||!lon||!start||!end) return res.status(400).json({error:'缺少天气查询参数'});
  const params=new URLSearchParams({
    latitude:lat,
    longitude:lon,
    start_date:start,
    end_date:end,
    timezone:'auto',
    temperature_unit:'celsius',
    wind_speed_unit:'kmh',
    precipitation_unit:'mm',
    hourly:[
      'temperature_2m',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'cloud_cover_low',
      'visibility',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'is_day'
    ].join(','),
    daily:['sunrise','sunset'].join(',')
  });
  try{
    const r=await fetch(BASE+'?'+params.toString(),{headers:{'User-Agent':'Aero-spotting-pwa'}});
    const data=await r.json();
    if(!r.ok) throw new Error(data?.reason||'天气服务请求失败');
    return res.status(200).json({...data,fetchedAt:new Date().toISOString()});
  }catch(e){
    return res.status(502).json({error:e.message||'天气服务暂时不可用'});
  }
}
