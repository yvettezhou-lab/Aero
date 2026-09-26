import './style.css';

const AIRPORTS = [
  ['KMG','昆明长水','Kunming'],['PEK','北京首都','Beijing'],['PKX','北京大兴','Beijing'],
  ['PVG','上海浦东','Shanghai'],['SHA','上海虹桥','Shanghai'],['CAN','广州白云','Guangzhou'],
  ['SZX','深圳宝安','Shenzhen'],['TFU','成都天府','Chengdu'],
  ['HKG','香港','Hong Kong'],['SIN','新加坡樟宜','Singapore'],['BKK','曼谷素万那普','Bangkok'],
  ['KUL','吉隆坡','Kuala Lumpur'],['NRT','东京成田','Tokyo'],['HND','东京羽田','Tokyo'],
  ['ICN','首尔仁川','Seoul'],['TPE','台北桃园','Taipei'],['MNL','马尼拉','Manila']
];

const WIDEBODY = /\b(A300|A310|A330|A340|A350|A380|B747|B767|B77[0-9]|B78[0-9]|DC10|MD11|IL96|L1011)\b/i;

const state = {
  airport: localStorage.getItem('aero-airport') || 'KMG',
  date: new Date().toISOString().slice(0,10),
  days: 3,
  activeDay: 0,
  direction: 'all',
  widebody: false,
  special: false,
  aircraftTypes: [],
  selectedAirlines: [],
  airline: 'all',
  q: '',
  timeFrom: '00:00',
  timeTo: '23:59',
  flights: [],
  dayFlights: {},
  loading: false,
  error: ''
};

const app = document.querySelector('#app');

function esc(s=''){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function airportName(code){ const a=AIRPORTS.find(x=>x[0]===code); return a ? a[1] : code; }
function isWide(type=''){ return WIDEBODY.test(type.replace(/[- ]/g,'')); }
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
  const planned=a.scheduledModel || a.plannedModel || f?.scheduledAircraftType || f?.plannedAircraftType || aircraft(f);
  const latest=a.latestModel || a.estimatedModel || f?.latestAircraftType || f?.estimatedAircraftType;
  const actual=a.actualModel || f?.actualAircraftType;
  const registration=a.registration || a.reg || f?.registration || f?.tailNumber;
  return {planned,latest,actual,registration};
}
function aircraftDisplay(f){
  const x=aircraftInfo(f);
  const current=x.actual || x.latest || x.planned || '未知机型';
  let level=x.actual?'实际':(x.latest?'最新':'计划');
  return {current,level,planned:x.planned,latest:x.latest,actual:x.actual,registration:x.registration};
}
function airlineOf(f){
  return f?.airline?.name || f?.airline?.iata || f?.airline?.icao || '未知航司';
}
function numberOf(f){ return f?.number || f?.flightNumber || '—'; }

function dayLabel(offset){
  const d=new Date(state.date+'T12:00:00'); d.setDate(d.getDate()+offset);
  const iso=d.toISOString().slice(0,10);
  const wd=['日','一','二','三','四','五','六'][d.getDay()];
  return {iso,label:offset===0?'今天':offset===1?'明天':offset===2?'后天':`${d.getMonth()+1}/${d.getDate()}`,wd};
}
function render(){
  const aircraftTypes=[...new Set(state.flights.map(f=>aircraftDisplay(f).current).filter(x=>x&&x!=='未知机型'))].sort();
  const airlines=[...new Set(state.flights.map(airlineOf).filter(x=>x!=='未知航司'))].sort();
  const filtered=state.flights.filter(f=>{
    const type=aircraftDisplay(f).current, airline=airlineOf(f), n=numberOf(f);
    const t=timeOf(f);
    const special=Boolean(f?.aircraft?.isSpecialLivery || f?.aircraft?.specialLivery || f?.specialLivery || f?.aircraft?.livery);
    return (!state.widebody || isWide(type))
      && (!state.special || special)
      && (!state.aircraftTypes.length || state.aircraftTypes.includes(type))
      && (state.airline==='all' || airline===state.airline)
      && (!state.q || (n+' '+airline+' '+type).toLowerCase().includes(state.q.toLowerCase()))
      && t >= state.timeFrom && t <= state.timeTo;
  });
  const dep=filtered.filter(f=>f.__direction==='dep'), arr=filtered.filter(f=>f.__direction==='arr');
  app.innerHTML=`
  <main>
    <header><div class="brand"><span class="logo">✈</span><div><h1>Aero</h1><p>看今天飞什么机</p></div></div><button class="refresh" id="refresh">↻</button></header>
    <section class="panel">
      <div class="row">
        <label class="field grow"><span>机场</span><select id="airport">${AIRPORTS.map(a=>`<option value="${a[0]}" ${a[0]===state.airport?'selected':''}>${a[0]} · ${a[1]}</option>`).join('')}</select></label>
        <label class="field date"><span>日期</span><input id="date" type="date" value="${state.date}"></label>
      </div>
      <div class="chips">
        <button class="chip ${state.direction==='all'?'on':''}" data-dir="all">全部</button>
        <button class="chip ${state.direction==='dep'?'on':''}" data-dir="dep">出发</button>
        <button class="chip ${state.direction==='arr'?'on':''}" data-dir="arr">到达</button>
        <button class="chip wide ${state.widebody?'on':''}" id="wide">✦ 只看宽体</button>
        <button class="chip special ${state.special?'on':''}" id="special">🎨 只看彩绘</button>
        <div class="aircraft-filter"><span>机型</span><button class="mini ${!state.aircraftTypes.length?'on':''}" data-type="">全部</button>${aircraftTypes.map(t=>`<button class="mini ${state.aircraftTypes.includes(t)?'on':''}" data-type="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="aircraft-filter"><span>航司</span><button class="mini ${!state.selectedAirlines.length?'on':''}" data-airline="">全部</button>${airlines.map(a=>`<button class="mini ${state.selectedAirlines.includes(a)?'on':''}" data-airline="${esc(a)}">${esc(a)}</button>`).join('')}</div>
      </div>
      <div class="row">
        <label class="field grow"><span>航司</span><select id="airline"><option value="all">全部航司</option>${airlines.map(a=>`<option value="${esc(a)}" ${a===state.airline?'selected':''}>${esc(a)}</option>`).join('')}</select></label>
        <label class="field grow"><span>搜索</span><input id="q" placeholder="航班号 / 机型" value="${esc(state.q)}"></label>
      </div>
      <div class="row time-row">
        <label class="field grow"><span>最早</span><input id="timeFrom" type="time" value="${state.timeFrom}"></label>
        <label class="field grow"><span>最晚</span><input id="timeTo" type="time" value="${state.timeTo}"></label>
      </div>
    </section>
    <div class="days">${[0,1,2].map(i=>{const d=dayLabel(i);return `<button class="day ${i===state.activeDay?'on':''}" data-day="${i}"><b>${d.label}</b><span>${d.iso.slice(5).replace('-','/')} 周${d.wd}</span></button>`}).join('')}</div>
    <div class="summary"><strong>${filtered.length}</strong> 个航班 <span>·</span> ${state.widebody?'已筛选宽体':'全部机型'} ${state.loading?'· 更新中…':''}</div>
    ${state.error ? `<div class="notice error">${esc(state.error)}</div>` : ''}
    ${state.loading && !state.flights.length ? '<div class="empty">正在读取航班…</div>' : ''}
    ${!state.loading && !filtered.length ? '<div class="empty"><b>没有符合条件的航班</b><span>试试关闭“只看宽体”或换一天</span></div>' : ''}
    <div class="flight-list">${state.direction!=='arr' ? section('出发',dep) : ''}${state.direction!=='dep' ? section('到达',arr) : ''}</div>
    <footer>数据源：AeroDataBox · 机型按 ICAO 类型自动判断宽体</footer>
  </main>`;
  bind();
}
function section(title,list){
  if(!list.length) return '';
  return `<section class="group"><h2>${title}<em>${list.length}</em></h2>${list.sort((a,b)=>timeOf(a).localeCompare(timeOf(b))).map(f=>{
    const info=aircraftDisplay(f), type=info.current, wide=isWide(type);
    return `<article class="flight ${wide?'is-wide':''}">
      <time>${timeOf(f)}</time>
      <div class="route"><b>${esc(numberOf(f))}</b><span>${esc(airlineOf(f))}</span></div>
      <div class="to">${esc(f.__direction==='dep'?cityOf(f,'arrival'):cityOf(f,'departure'))}</div>
      <div class="aircraft"><b>${esc(type)}</b><small class="aircraft-level">${info.level}</small>${wide?'<span>宽体</span>':''}${(f?.aircraft?.isSpecialLivery || f?.aircraft?.specialLivery || f?.specialLivery || f?.aircraft?.livery)?'<span class="livery">🎨 彩绘</span>':''}</div>${info.registration?`<small class="registration">${esc(info.registration)}</small>`:''}${info.latest&&info.latest!==info.planned?`<small class="aircraft-note">计划 ${esc(info.planned)} · 最新 ${esc(info.latest)}</small>`:''}
    </article>`
  }).join('')}</section>`;
}
function bind(){
  document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{state.activeDay=Number(b.dataset.day);state.date=dayLabel(state.activeDay).iso;state.flights=state.dayFlights[state.date]||[];render();});
  document.querySelector('#airport').onchange=e=>{state.airport=e.target.value;localStorage.setItem('aero-airport',state.airport);state.activeDay=0;state.date=new Date().toISOString().slice(0,10);state.dayFlights={};loadRange();};
  document.querySelector('#date').onchange=e=>{state.date=e.target.value;state.activeDay=0;state.dayFlights={};loadRange();};
  document.querySelector('#airline').onchange=e=>{state.airline=e.target.value;render();};
  document.querySelector('#q').oninput=e=>{state.q=e.target.value;render();};
  document.querySelector('#timeFrom').onchange=e=>{state.timeFrom=e.target.value;render();};
  document.querySelector('#timeTo').onchange=e=>{state.timeTo=e.target.value;render();};
  document.querySelector('#wide').onclick=()=>{state.widebody=!state.widebody;render();};
  document.querySelector('#special').onclick=()=>{state.special=!state.special;render();};
  document.querySelectorAll('[data-airline]').forEach(b=>b.onclick=()=>{const a=b.dataset.airline;if(!a)state.selectedAirlines=[];else state.selectedAirlines=state.selectedAirlines.includes(a)?state.selectedAirlines.filter(x=>x!==a):[...state.selectedAirlines,a];render();});
  document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{const t=b.dataset.type;if(!t)state.aircraftTypes=[];else state.aircraftTypes=state.aircraftTypes.includes(t)?state.aircraftTypes.filter(x=>x!==t):[...state.aircraftTypes,t];render();});
  document.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>{state.direction=b.dataset.dir;render();});
  document.querySelector('#refresh').onclick=load;
}
async function fetchDay(date){
  const key=`aero:${state.airport}:${date}`;
  try{
    const cached=JSON.parse(localStorage.getItem(key)||'null');
    if(cached?.savedAt && Date.now()-cached.savedAt<10*60*1000) return cached.flights||[];
  }catch{}
  const r=await fetch(`/api/flights?airport=${encodeURIComponent(state.airport)}&date=${encodeURIComponent(date)}`);
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||'读取航班失败');
  const flights=[
    ...(data.departures||[]).map(f=>({...f,__direction:'dep'})),
    ...(data.arrivals||[]).map(f=>({...f,__direction:'arr'}))
  ];
  try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),flights}));}catch{}
  return flights;
}
async function loadRange(){
  state.loading=true; state.error=''; render();
  const dates=[0,1,2].map(i=>dayLabel(i).iso);
  try{
    const results=await Promise.all(dates.map(fetchDay));
    dates.forEach((d,i)=>state.dayFlights[d]=results[i]);
    state.flights=state.dayFlights[state.date]||[];
  }catch(e){
    state.error=e.message.includes('API')?e.message:'暂时无法读取航班数据。请检查 API 配置。';
  }finally{state.loading=false;render();}
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
render(); loadRange();