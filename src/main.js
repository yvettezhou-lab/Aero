import './style.css';
import { liveryForRegistration } from './data/liveries.js';

const AIRPORTS = [
  ['KMG','昆明长水','Kunming',24.9924,102.7435],['PEK','北京首都','Beijing',40.0799,116.6031],['PKX','北京大兴','Beijing',39.5098,116.4105],
  ['PVG','上海浦东','Shanghai',31.1443,121.8083],['SHA','上海虹桥','Shanghai',31.1979,121.3363],['CAN','广州白云','Guangzhou',23.3924,113.2988],
  ['SZX','深圳宝安','Shenzhen',22.6393,113.8107],['TFU','成都天府','Chengdu',30.3125,104.4419],
  ['HKG','香港','Hong Kong',22.3080,113.9185],['SIN','新加坡樟宜','Singapore',1.3644,103.9915],['BKK','曼谷素万那普','Bangkok',13.6900,100.7501],
  ['KUL','吉隆坡','Kuala Lumpur',2.7456,101.7099],['NRT','东京成田','Tokyo',35.7720,140.3929],['HND','东京羽田','Tokyo',35.5494,139.7798],
  ['ICN','首尔仁川','Seoul',37.4602,126.4407],['TPE','台北桃园','Taipei',25.0797,121.2342],['MNL','马尼拉','Manila',14.5086,121.0197]
];

const WIDEBODY = /\b(?:A300|A310|A330|A340|A350|A380|B747|B767|B77[0-9]|B78[0-9]|DC10|MD11|IL96|L1011)\b|\b(?:Airbus\s+)?A(?:300|310|330|340|350|380)(?:[- ]?[0-9]+)?\b|\b(?:Boeing\s+)?(?:747|767|77[0-9]|78[0-9])(?:[- ]?[0-9]+)?\b/i;

const state = {
  airport: localStorage.getItem('aero-airport') || 'KMG',
  date: localISO(),
  baseDate: localISO(),
  days: 3,
  activeDay: 0,
  listDirection: 'dep',
  spottingOpen: localStorage.getItem('aero-spotting-open') !== '0',
  widebody: false,
  special: false,
  aircraftTypes: [],
  selectedAirlines: [],
  showCodeshare: false,
  q: '',
  timeFrom: '00:00',
  timeTo: '23:59',
  flights: [],
  dayFlights: {},
  sourceMeta: {},
  detailFlight: null,
  loading: false,
  error: '',
  weather: null,
  weatherLoading: false,
  weatherError: '',
  targets: JSON.parse(localStorage.getItem('aero-targets') || '[]'),
  targetId: '',
  spottingLog: JSON.parse(localStorage.getItem('aero-spotting-log') || '[]')
};

const app = document.querySelector('#app');
function localISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

function esc(s=''){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function airportName(code){ const a=AIRPORTS.find(x=>x[0]===code); return a ? a[1] : code; }
function isWide(type=''){ return WIDEBODY.test(String(type)); }
function timeOf(f){
  const t=f?.departure?.scheduledTime?.local || f?.departure?.revisedTime?.local || f?.arrival?.scheduledTime?.local || '';
  return t ? t.slice(11,16) : '--:--';
}
function cityOf(f, side){
  const x=f?.[side]?.airport;
  return x?.iata || x?.icao || x?.name || '—';
}
function aircraft(f){
  const a=f?.aircraft || {};
  return a.model || a.type || a.icao || a.iata || f?.aircraftType || '未知机型';
}
function aircraftInfo(f){
  const a=f?.aircraft || {};
  const fa=f?.__flightAware||{};
  const current=a.model || a.type || a.icao || a.iata || f?.aircraftType || fa.aircraftType || '未知机型';
  const registration=a.reg || a.registration || f?.registration || f?.tailNumber || fa.registration || '';
  const status=String(f?.status||'');
  const level=/Departed|Arrived|EnRoute|Approaching/.test(status) ? '运行/实际' : '当前已知';
  return {current,level,registration,updated:f?.lastUpdatedUtc||'',conflict:Boolean(f?.__aircraftConflict)};
}
function aircraftDisplay(f){ return aircraftInfo(f); }

function flightIdentity(f){
  const info=aircraftInfo(f);
  return info.registration || [numberOf(f),f?.__direction,timeOf(f)].join('|');
}
function liveryOf(f){
  const registration=aircraftInfo(f).registration;
  const registry=liveryForRegistration(registration);
  if(registry) return registry;
  const raw=f?.aircraft?.livery || f?.livery || f?.specialLivery || null;
  if(!raw && !(f?.aircraft?.isSpecialLivery || f?.aircraft?.specialLivery)) return null;
  if(typeof raw==='string') return {name:raw,rarity:'少见'};
  return {name:raw?.name||raw?.title||raw?.liveryName||'特殊涂装',rarity:raw?.rarity||raw?.level||'少见'};
}
function liveryClass(r=''){return /稀有|rare/i.test(r)?'rare':/常见|common/i.test(r)?'common':'uncommon';}
function isCodeshare(f){ return f?.codeshareStatus==='IsCodeshared'; }
function airlineOf(f){
  return f?.airline?.name || f?.airline?.iata || f?.airline?.icao || '未知航司';
}
function numberOf(f){ return f?.number || f?.flightNumber || '—'; }

function filterFlights(list=[]){
  const visible=state.showCodeshare?list:list.filter(f=>!isCodeshare(f));
  return visible.filter(f=>{
    const type=aircraftDisplay(f).current;
    const airline=airlineOf(f);
    const n=numberOf(f);
    const t=timeOf(f);
    const special=Boolean(liveryOf(f));
    return (!state.widebody || isWide(type))
      && (!state.special || special)
      && (!state.aircraftTypes.length || state.aircraftTypes.includes(type))
      && (!state.selectedAirlines.length || state.selectedAirlines.includes(airline))
      && (!state.q || (n+' '+airline+' '+type).toLowerCase().includes(state.q.toLowerCase()))
      && t >= state.timeFrom && t <= state.timeTo;
  });
}


const BUILTIN_TARGETS = [
  {id:'widebody',name:'宽体',filter:{widebody:true}},
  {id:'livery',name:'彩绘',filter:{special:true}},
  {id:'a350',name:'A350',filter:{q:'A350'}},
  {id:'b787',name:'B787',filter:{q:'B787'}}
];

function targetFilterSnapshot(){
  return {
    widebody:state.widebody, special:state.special,
    aircraftTypes:[...state.aircraftTypes], selectedAirlines:[...state.selectedAirlines],
    showCodeshare:state.showCodeshare, q:state.q, timeFrom:state.timeFrom, timeTo:state.timeTo
  };
}
function saveTargets(){try{localStorage.setItem('aero-targets',JSON.stringify(state.targets));}catch{}}
function saveSpottingLog(){try{localStorage.setItem('aero-spotting-log',JSON.stringify(state.spottingLog.slice(-300)));}catch{}}
function applyTarget(target){
  const f=target?.filter||{};
  state.targetId=target?.id||'';
  state.widebody=Boolean(f.widebody);
  state.special=Boolean(f.special);
  state.aircraftTypes=Array.isArray(f.aircraftTypes)?[...f.aircraftTypes]:[];
  state.selectedAirlines=Array.isArray(f.selectedAirlines)?[...f.selectedAirlines]:[];
  state.showCodeshare=Boolean(f.showCodeshare);
  state.q=f.q||'';
  state.timeFrom=f.timeFrom||'00:00';
  state.timeTo=f.timeTo||'23:59';
  render();
}
function targetCard(){
  const all=[...BUILTIN_TARGETS,...state.targets];
  const current=targetFilterSnapshot();
  const active=all.find(x=>x.id===state.targetId);
  const chips=all.map(t=>'<button class="target-chip '+(t.id===state.targetId?'on':'')+'" data-target="'+esc(t.id)+'">'+esc(t.name)+'</button>').join('');
  return '<section class="target-card"><div class="target-head"><div><b>🎯 观机目标</b><span>一键套用你想看的飞机</span></div><button class="target-save" id="saveTarget">＋ 保存当前</button></div><div class="target-chips">'+chips+'</div>'+
    (active?'<div class="target-active">当前：<b>'+esc(active.name)+'</b><button id="clearTarget">清除</button></div>':'')+
    '<div class="target-hint">'+(current.widebody?'宽体 · ':'')+(current.special?'彩绘 · ':'')+(current.aircraftTypes.length?current.aircraftTypes.join('、')+' · ':'')+(current.selectedAirlines.length?current.selectedAirlines.join('、')+' · ':'')+((!current.widebody&&!current.special&&!current.aircraftTypes.length&&!current.selectedAirlines.length)?'当前全部筛选':'')+'</div></section>';
}
function recordKey(f){
  const info=aircraftDisplay(f);
  return [state.airport,state.date,info.registration||numberOf(f),numberOf(f)].join('|');
}
function spottingRecordButton(f){
  const key=recordKey(f);
  const seen=state.spottingLog.some(x=>x.key===key);
  return '<button class="seen-btn '+(seen?'seen':'')+'" data-seen="'+esc(key)+'">'+(seen?'✓ 已看过':'✓ 看到了')+'</button>';
}
function markSeen(f){
  const info=aircraftDisplay(f), l=liveryOf(f), key=recordKey(f);
  if(!state.spottingLog.some(x=>x.key===key)){
    state.spottingLog.push({key,airport:state.airport,date:state.date,number:numberOf(f),type:info.current,registration:info.registration||'',livery:l?.name||'',rarity:l?.rarity||'',savedAt:new Date().toISOString()});
    saveSpottingLog();
  }
  state.detailFlight=null;
  render();
}
function spottingLogCard(){
  const recent=[...state.spottingLog].reverse().slice(0,8);
  const today=state.spottingLog.filter(x=>x.airport===state.airport&&x.date===state.date);
  return '<section class="log-card"><div class="log-head"><div><b>📒 我的观机记录</b><span>'+today.length+' 架已记录</span></div><button class="log-clear" id="clearLog">清空</button></div>'+
    (recent.length?'<div class="log-list">'+recent.map(x=>'<div class="log-row"><div><b>'+esc(x.number)+'</b><span>'+esc(x.airport)+' · '+esc(x.date.slice(5).replace('-','/'))+'</span></div><div><strong>'+esc(x.type)+'</strong>'+(x.registration?'<small>'+esc(x.registration)+'</small>':'')+(x.livery?'<em>🎨 '+esc(x.livery)+' · '+esc(x.rarity||'少见')+'</em>':'')+'</div></div>').join('')+'</div>':'<div class="log-empty">看到飞机后，在详情里点“✓ 看到了”，Aero 会帮你留下记录。</div>')+
    '</section>';
}
function sourceFooter(){
  const meta=state.sourceMeta[state.date]?.secondSource;
  let second='FlightAware 未配置';
  if(meta?.enabled) second=meta.ok?'FlightAware ✓ 交叉确认':'FlightAware ⚠ 未成功连接';
  return '<div class="source-bar"><span>AeroDataBox ✓</span><span>'+second+'</span></div>';
}
function airportMeta(){const a=AIRPORTS.find(x=>x[0]===state.airport);return a?{name:a[1],lat:a[3],lon:a[4]}:null;}
function weatherText(c){const m={0:'晴',1:'大部晴朗',2:'局部多云',3:'阴',45:'雾',48:'雾',51:'毛毛雨',53:'毛毛雨',55:'毛毛雨',61:'小雨',63:'中雨',65:'大雨',80:'阵雨',81:'阵雨',82:'强阵雨',95:'雷雨',96:'雷雨',99:'雷雨'};return m[c]||'天气变化';}
function weatherIcon(c){if(c===0)return '☀️';if([1,2].includes(c))return '🌤️';if(c===3)return '☁️';if([45,48].includes(c))return '🌫️';if([51,53,55,61,63,65,80,81,82].includes(c))return '🌧️';if([95,96,99].includes(c))return '⛈️';return '🌤️';}
function weatherSummary(date){const h=state.weather?.hourly;if(!h?.time)return null;const rows=h.time.map((t,i)=>({t,i})).filter(x=>x.t.startsWith(date)&&+x.t.slice(11,13)>=6&&+x.t.slice(11,13)<22);if(!rows.length)return null;const nums=k=>rows.map(x=>Number(h[k]?.[x.i])).filter(Number.isFinite);const rp=nums('precipitation_probability'),vis=nums('visibility'),wind=nums('wind_speed_10m');const maxRain=rp.length?Math.max(...rp):0,minVis=vis.length?Math.min(...vis):null,maxWind=wind.length?Math.max(...wind):null;let level='适合';if(maxRain>50||(minVis!=null&&minVis<5000)||(maxWind!=null&&maxWind>35))level='需留意';if(maxRain>75||(minVis!=null&&minVis<3000)||(maxWind!=null&&maxWind>50))level='不理想';const good=rows.filter(x=>Number(h.precipitation_probability?.[x.i]??0)<=30&&Number(h.visibility?.[x.i]??99999)>=8000&&Number(h.wind_speed_10m?.[x.i]??0)<=30).map(x=>x.t.slice(11,16)).slice(0,4);return{level,maxRain,minVis,maxWind,good};}
function weatherCard(){
  if(state.weatherLoading)return '<div class="weather-compact"><b>🌤 天气</b><span>读取中…</span></div>';
  if(state.weatherError)return '<div class="weather-compact"><b>🌤 天气</b><span>暂不可用</span></div>';
  const h=state.weather?.hourly;if(!h?.time)return '';
  let ni=0,best=Infinity,target=new Date(state.date+'T12:00:00').getTime();
  h.time.forEach((t,i)=>{const d=Math.abs(new Date(t).getTime()-target);if(d<best){best=d;ni=i;}});
  const code=Number(h.weather_code?.[ni]),vis=Number(h.visibility?.[ni]),wind=Number(h.wind_speed_10m?.[ni]),cloud=Number(h.cloud_cover_low?.[ni]),s=weatherSummary(state.date);
  return '<div class="weather-compact"><b>🌤 '+esc(airportName(state.airport))+'</b><span>'+weatherIcon(code)+' '+weatherText(code)+'</span><em>能见度 '+(Number.isFinite(vis)?Math.round(vis/100)/10+'km':'—')+'</em><em>风 '+(Number.isFinite(wind)?Math.round(wind):'—')+'km/h</em><em>低云 '+(Number.isFinite(cloud)?Math.round(cloud):'—')+'%</em><em>雨 '+(s?s.maxRain:'—')+'%</em></div>';
}
function dayTabs(){return [0,1,2].map(i=>{const d=dayLabel(i);return '<button class="day '+(i===state.activeDay?'on':'')+'" data-day="'+i+'"><b>'+d.label+'</b></button>';}).join('');}
function dayLabel(offset){
  const d=new Date(state.baseDate+'T12:00:00'); d.setDate(d.getDate()+offset);
  const iso=d.toISOString().slice(0,10);
  const wd=['日','一','二','三','四','五','六'][d.getDay()];
  return {iso,label:offset===0?'今天':offset===1?'明天':offset===2?'后天':`${d.getMonth()+1}/${d.getDate()}`,wd};
}
function render(){
  const aircraftTypes=[...new Set(state.flights.map(f=>aircraftDisplay(f).current).filter(x=>x&&x!=='未知机型'))].sort();
  const airlines=[...new Set(state.flights.map(airlineOf).filter(x=>x!=='未知航司'))].sort();
  const filtered=filterFlights(state.flights);
  const dep=filtered.filter(f=>f.__direction==='dep'), arr=filtered.filter(f=>f.__direction==='arr');
  const depCount=dep.length, arrCount=arr.length;
  const plan=spottingPlan(filtered);
  app.innerHTML=`
  <main>
    <header><div class="brand"><span class="logo">✈</span><div><h1>Aero</h1><p>看今天飞什么机</p></div></div><button class="refresh" id="refresh">↻</button></header>
    <section class="panel">
      <div class="airport-date-row">
              <label class="field airport-field"><span>机场</span><select id="airport">${AIRPORTS.map(a=>`<option value="${a[0]}" ${a[0]===state.airport?"selected":""}>${a[0]} · ${a[1]}</option>`).join("")}</select></label>
        <div class="days-inline">${dayTabs()}</div>
      </div>
      ${weatherCard()}  <div class="chips">
        <button class="chip wide ${state.widebody?"on":""}" id="wide">✦ 只看宽体</button>
        <button class="chip ${state.special?"on":""}" id="special">🎨 只看彩绘</button>
        <button class="chip ${state.showCodeshare?"on":""}" id="codeshare">显示共享</button>
      </div>
      <div class="filter-line"><b>机型</b><div class="aircraft-filter"><button class="mini ${!state.aircraftTypes.length?"on":""}" data-type="">全部</button>${aircraftTypes.map(t=>`<button class="mini ${state.aircraftTypes.includes(t)?"on":""}" data-type="${esc(t)}">${esc(t)}</button>`).join("")}</div></div>
      <div class="filter-line"><b>航司</b><div class="aircraft-filter"><button class="mini ${!state.selectedAirlines.length?"on":""}" data-airline="">全部</button>${airlines.map(a=>`<button class="mini ${state.selectedAirlines.includes(a)?"on":""}" data-airline="${esc(a)}">${esc(a)}</button>`).join("")}</div></div>
      <div class="compact-search-row">
        <label class="field search-field"><span>搜索</span><input id="q" placeholder="航班号 / 机型" value="${esc(state.q)}"></label>
        <label class="field compact-time-field"><span>时间</span><div class="time-pair"><input id="timeFrom" type="time" value="${state.timeFrom}"><i>—</i><input id="timeTo" type="time" value="${state.timeTo}"></div></label>
      </div>
    </section>

    <div class="summary"><strong>${filtered.length}</strong> 个航班 <span>·</span> ${state.widebody?'已筛选宽体':'全部机型'} ${state.loading?'· 更新中…':''}</div>
    ${spottingOverview()}\n    ${spottingLogCard()}\n    <div class="flight-tabs" role="tablist" aria-label="航班列表">\n      <button class="${state.listDirection==="dep"?"on":""}" data-dir="dep">出发 <span>${depCount}</span></button>\n      <button class="${state.listDirection==="arr"?"on":""}" data-dir="arr">到达 <span>${arrCount}</span></button>\n    </div>\n    ${state.error ? `<div class="notice error">${esc(state.error)}</div>` : ''}
    ${state.loading && !state.flights.length ? '<div class="empty">正在读取航班…</div>' : ''}
    ${!state.loading && !filtered.length ? '<div class="empty"><b>没有符合条件的航班</b><span>试试关闭“只看宽体”或换一天</span></div>' : ''}
${state.detailFlight ? detailModal(state.detailFlight) : ''}
    <div class="flight-list">${state.listDirection==='dep' ? section('出发',dep) : section('到达',arr)}</div>
    ${sourceFooter()}
    <footer>默认隐藏代码共享重复航班 · 3天观机计划跟随当前筛选条件</footer>
  </main>`;
  bind();
}
function detailModal(f){
  const info=aircraftDisplay(f), l=liveryOf(f);
  const sources=['AeroDataBox']; if(f.__sources?.includes('FlightAware')) sources.push('FlightAware');
  return `<div class="modal-backdrop" id="modal"><div class="modal"><button class="modal-close" id="closeModal">×</button><h2>${esc(numberOf(f))}</h2>${l?`<div class="livery-detail"><div class="livery-rarity ${liveryClass(l.rarity)}">${esc(l.rarity)}</div><b>${esc(l.name)}彩绘</b></div>`:''}<div class="modal-grid"><span>航司</span><b>${esc(airlineOf(f))}</b><span>机型</span><b>${esc(info.current)}</b><span>状态</span><b>${esc(info.level)}</b><span>机号</span><b>${esc(info.registration||'暂无')}</b><span>彩绘</span><b>${l?'已识别':'未识别'}</b><span>数据源</span><b>${esc(sources.join(' + '))}</b></div><div class="modal-actions">${spottingRecordButton(f)}</div><p class="modal-note">彩绘只在数据源明确提供或后续机号库确认时标记；没有证据不会猜测。</p></div></div>`;
}
function spottingOverview(){
  const hasActiveFilter=Boolean(
    state.widebody ||
    state.special ||
    state.aircraftTypes.length ||
    state.selectedAirlines.length ||
    state.q.trim() ||
    state.timeFrom!=='00:00' ||
    state.timeTo!=='23:59'
  );
  if(!hasActiveFilter) return '';
  const days=[0,1,2].map(i=>{
    const d=dayLabel(i);
    const list=filterFlights(state.dayFlights[d.iso]||[]);
    const p=spottingPlan(list);
    if(!p.length) return '';
    return '<div class="spot-day"><b>'+d.label+' · '+d.iso.slice(5).replace('-','/')+' 周'+d.wd+'</b>'+
      p.map(x=>'<div class="spot-window"><div><b>'+x.from+'–'+x.to+'</b><small>'+x.count+' 个航班</small></div><div class="spot-tags">'+
      (x.wide?'<span>宽体 '+x.wide+'</span>':'')+(x.livery?'<span class="livery">🎨 彩绘 '+x.livery+'</span>':'')+
      '</div></div>').join('')+'</div>';
  }).join('');
  return '<details class="spotting" '+(state.spottingOpen?'open':'')+'><summary class="spotting-head"><b>👀 3天观机计划</b><span>按 2 小时窗口汇总</span><i>⌄</i></summary><div class="spotting-body">'+days+'</div></details>';
}
function spottingPlan(list){
  const windows=[];
  for(let h=6;h<22;h+=2){
    const from=String(h).padStart(2,'0')+':00', to=String(h+2).padStart(2,'0')+':00';
    const inWin=list.filter(f=>{const t=timeOf(f);return t>=from&&t<to;});
    if(!inWin.length) continue;
    const wide=inWin.filter(f=>isWide(aircraftDisplay(f).current)).length;
    const livery=inWin.filter(f=>Boolean(liveryOf(f))).length;
    const hasFilter=state.widebody||state.special||state.aircraftTypes.length||state.selectedAirlines.length||state.q||state.timeFrom!=='00:00'||state.timeTo!=='23:59';
    if(inWin.length) {
      windows.push({
        from,to,count:inWin.length,
        wide:state.widebody?wide:0,
        livery:state.special?livery:0
      });
    }
  }
  return windows.slice(0,4);
}
function section(title,list){
  if(!list.length) return '';
  return `<section class="group"><h2>${title}<em>${list.length}</em></h2>${list.sort((a,b)=>timeOf(a).localeCompare(timeOf(b))).map(f=>{
    const info=aircraftDisplay(f), type=info.current, wide=isWide(type), identity=flightIdentity(f);
    return `<article class="flight ${wide?'is-wide':''}" data-flight-id="${esc(identity)}">
      <time>${timeOf(f)}</time>
      <div class="route"><b>${esc(numberOf(f))}</b><span>${esc(airlineOf(f))}</span></div>
      <div class="to">${esc(f.__direction==='dep'?cityOf(f,'arrival'):cityOf(f,'departure'))}</div>
      <div class="aircraft"><b>${esc(type)}</b><small class="aircraft-level">${info.level}</small>${wide?'<span>宽体</span>':''}${liveryOf(f)?`<span class="livery-badge ${liveryClass(liveryOf(f).rarity)}">🎨 ${esc(liveryOf(f).rarity)}</span>`:''}</div>${liveryOf(f)?`<div class="livery-mini"><b>${esc(liveryOf(f).name)}彩绘 · ${esc(liveryOf(f).rarity)}</b></div>`:''}${info.registration?`<small class="registration">${esc(info.registration)}</small>`:''}${f.__sources?.includes('FlightAware')?`<small class="source-ok">✓ FlightAware 交叉确认</small>`:''}${info.conflict?`<small class="aircraft-conflict">⚠ 机型存在差异</small>`:''}${info.updated?`<small class="aircraft-note">更新 ${esc(info.updated.replace('T',' ').replace('Z',' UTC'))}</small>`:''}${spottingRecordButton(f)}
    </article>`
  }).join('')}</section>`;
}
function bind(){
  document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{state.activeDay=Number(b.dataset.day);state.date=dayLabel(state.activeDay).iso;state.flights=state.dayFlights[state.date]||[];render();});
  document.querySelectorAll('[data-weather-day]').forEach(b=>b.onclick=()=>{state.activeDay=Number(b.dataset.weatherDay);state.date=dayLabel(state.activeDay).iso;state.flights=state.dayFlights[state.date]||[];render();});
  document.querySelector('#airport').onchange=e=>{state.airport=e.target.value;localStorage.setItem('aero-airport',state.airport);state.activeDay=0;state.baseDate=localISO();state.date=state.baseDate;state.dayFlights={};state.sourceMeta={};loadRange();loadWeather();};
  document.querySelector('#date').onchange=e=>{state.baseDate=e.target.value;state.date=state.baseDate;state.activeDay=0;state.dayFlights={};state.sourceMeta={};loadRange();loadWeather();};
  document.querySelector('#q').oninput=e=>{state.q=e.target.value;render();};
  document.querySelector('#timeFrom').onchange=e=>{state.timeFrom=e.target.value;render();};
  document.querySelector('#timeTo').onchange=e=>{state.timeTo=e.target.value;render();};
  document.querySelector('#wide').onclick=()=>{state.widebody=!state.widebody;render();};
  document.querySelector('#special').onclick=()=>{state.special=!state.special;render();};
  document.querySelector('#codeshare').onclick=()=>{state.showCodeshare=!state.showCodeshare;render();};
  document.querySelectorAll('[data-airline]').forEach(b=>b.onclick=()=>{const a=b.dataset.airline;if(!a)state.selectedAirlines=[];else state.selectedAirlines=state.selectedAirlines.includes(a)?state.selectedAirlines.filter(x=>x!==a):[...state.selectedAirlines,a];render();});
  document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{const t=b.dataset.type;if(!t)state.aircraftTypes=[];else state.aircraftTypes=state.aircraftTypes.includes(t)?state.aircraftTypes.filter(x=>x!==t):[...state.aircraftTypes,t];render();});
  document.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>{state.listDirection=b.dataset.dir;render();});
  document.querySelector('.spotting')?.addEventListener('toggle',e=>{state.spottingOpen=e.currentTarget.open;localStorage.setItem('aero-spotting-open',state.spottingOpen?'1':'0');});
  document.querySelector('#refresh').onclick=loadRange;
  document.querySelectorAll('.flight').forEach(el=>el.onclick=()=>{const id=el.dataset.flightId; const f=state.flights.find(x=>flightIdentity(x)===id); if(f) {state.detailFlight=f;render();}});
  document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{const id=b.dataset.target;const t=[...BUILTIN_TARGETS,...state.targets].find(x=>x.id===id);if(t)applyTarget(t);});
  document.querySelector('#clearTarget')?.addEventListener('click',()=>{state.targetId='';state.listDirection='dep';state.widebody=false;state.special=false;state.aircraftTypes=[];state.selectedAirlines=[];state.q='';state.timeFrom='00:00';state.timeTo='23:59';render();});
  document.querySelector('#saveTarget')?.addEventListener('click',()=>{
    const name=window.prompt('给这个观机目标起个名字','我的目标');
    if(!name?.trim()) return;
    const target={id:'custom-'+Date.now(),name:name.trim(),filter:targetFilterSnapshot()};
    state.targets.push(target);state.targetId=target.id;saveTargets();render();
  });
  document.querySelector('#clearLog')?.addEventListener('click',()=>{if(window.confirm('清空全部观机记录？')){state.spottingLog=[];saveSpottingLog();render();}});
  document.querySelectorAll('[data-seen]').forEach(b=>b.onclick=e=>{e.stopPropagation();const key=b.dataset.seen;const f=state.flights.find(x=>recordKey(x)===key);if(f)markSeen(f);});
  document.querySelector('#closeModal')?.addEventListener('click',()=>{state.detailFlight=null;render();});
  document.querySelector('#modal')?.addEventListener('click',e=>{if(e.target.id==='modal'){state.detailFlight=null;render();}});
}
async function fetchDay(date){
  const key=`aero:${state.airport}:${date}:${state.showCodeshare}`;
  try{
    const cached=JSON.parse(localStorage.getItem(key)||'null');
    if(cached?.savedAt && Date.now()-cached.savedAt<10*60*1000){const flights=cached.flights||[];flights.__fetchedAt=cached.fetchedAt||'';flights.__secondSource=cached.secondSource||null;return flights;}
  }catch{}
  const r=await fetch(`/api/flights?airport=${encodeURIComponent(state.airport)}&date=${encodeURIComponent(date)}&showCodeshare=${state.showCodeshare}`);
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||'读取航班失败');
  const flights=[
    ...(data.departures||[]).map(f=>({...f,__direction:'dep'})),
    ...(data.arrivals||[]).map(f=>({...f,__direction:'arr'}))
  ];
  flights.__fetchedAt=data.fetchedAt||'';
  flights.__secondSource=data.secondSource||null;
  try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),flights, fetchedAt:data.fetchedAt||'',secondSource:data.secondSource||null}));}catch{}
  return flights;
}
async function loadRange(){
  state.loading=true; state.error=''; render();
  const dates=[0,1,2].map(i=>dayLabel(i).iso);
  const results=await Promise.allSettled(dates.map(fetchDay));
  results.forEach((r,i)=>{
    if(r.status==='fulfilled'){
      state.dayFlights[dates[i]]=r.value;
      state.sourceMeta[dates[i]]={secondSource:r.value.__secondSource||null,fetchedAt:r.value.__fetchedAt||''};
    }
  });
  const failed=results.filter(r=>r.status==='rejected').length;
  state.flights=state.dayFlights[state.date]||[];
  if(failed===3) state.error='暂时无法读取航班数据。请检查 API 配置。';
  else if(failed) state.error='部分日期暂时无法更新，已显示成功读取的数据。';
  state.loading=false;render();
}
async function loadWeather(){
  const meta=airportMeta();
  if(!meta) return;
  state.weatherLoading=true; state.weatherError=''; render();
  const end=new Date(state.baseDate+'T12:00:00'); end.setDate(end.getDate()+2);
  const endISO=end.toISOString().slice(0,10);
  const key='aero-weather:'+state.airport+':'+state.baseDate;
  try{
    const cached=JSON.parse(localStorage.getItem(key)||'null');
    if(cached?.savedAt && Date.now()-cached.savedAt<10*60*1000){state.weather=cached.data;state.weatherLoading=false;render();return;}
  }catch{}
  try{
    const r=await fetch('/api/weather?lat='+encodeURIComponent(meta.lat)+'&lon='+encodeURIComponent(meta.lon)+'&start='+encodeURIComponent(state.baseDate)+'&end='+encodeURIComponent(endISO));
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||'天气读取失败');
    state.weather=data;
    try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));}catch{}
  }catch(e){state.weather=null;state.weatherError='天气暂时无法读取';}
  finally{state.weatherLoading=false;render();}
}
async function load(){
  state.loading=true; state.error=''; render();
  try{
    const flights=await fetchDay(state.date);
    state.dayFlights[state.date]=flights;
    state.flights=flights;
  }catch(e){
    state.error=e.message.includes('API')?e.message:'暂时无法读取航班数据。请检查 API 配置。';
  }finally{state.loading=false;render();}
}
render(); loadRange(); loadWeather();