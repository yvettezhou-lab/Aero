import './style.css';
import { liveryForRegistration } from './data/liveries.js';

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
  date: localISO(),
  baseDate: localISO(),
  days: 3,
  activeDay: 0,
  direction: 'all',
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
  error: ''
};

const app = document.querySelector('#app');
function localISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

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

function dayLabel(offset){
  const d=new Date(state.baseDate+'T12:00:00'); d.setDate(d.getDate()+offset);
  const iso=d.toISOString().slice(0,10);
  const wd=['日','一','二','三','四','五','六'][d.getDay()];
  return {iso,label:offset===0?'今天':offset===1?'明天':offset===2?'后天':`${d.getMonth()+1}/${d.getDate()}`,wd};
}
function render(){
  const aircraftTypes=[...new Set(state.flights.map(f=>aircraftDisplay(f).current).filter(x=>x&&x!=='未知机型'))].sort();
  const airlines=[...new Set(state.flights.map(airlineOf).filter(x=>x!=='未知航司'))].sort();
  const visibleFlights=state.showCodeshare?state.flights:state.flights.filter(f=>!isCodeshare(f));
  const filtered=visibleFlights.filter(f=>{
    const type=aircraftDisplay(f).current, airline=airlineOf(f), n=numberOf(f);
    const t=timeOf(f);
    const special=Boolean(liveryOf(f));
    return (!state.widebody || isWide(type))
      && (!state.special || special)
      && (!state.aircraftTypes.length || state.aircraftTypes.includes(type))
      && (!state.selectedAirlines.length || state.selectedAirlines.includes(airline))
      && (!state.q || (n+' '+airline+' '+type).toLowerCase().includes(state.q.toLowerCase()))
      && t >= state.timeFrom && t <= state.timeTo;
  });
  const plan=spottingPlan(filtered);
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
        <button class="chip ${state.showCodeshare?'on':''}" id="codeshare">显示共享</button>
        <div class="aircraft-filter"><span>机型</span><button class="mini ${!state.aircraftTypes.length?'on':''}" data-type="">全部</button>${aircraftTypes.map(t=>`<button class="mini ${state.aircraftTypes.includes(t)?'on':''}" data-type="${esc(t)}">${esc(t)}</button>`).join('')}</div>
        <div class="aircraft-filter"><span>航司</span><button class="mini ${!state.selectedAirlines.length?'on':''}" data-airline="">全部</button>${airlines.map(a=>`<button class="mini ${state.selectedAirlines.includes(a)?'on':''}" data-airline="${esc(a)}">${esc(a)}</button>`).join('')}</div>
      </div>
      <div class="row">
        <label class="field grow"><span>搜索</span><input id="q" placeholder="航班号 / 机型" value="${esc(state.q)}"></label>
      </div>
      <div class="row time-row">
        <label class="field grow"><span>最早</span><input id="timeFrom" type="time" value="${state.timeFrom}"></label>
        <label class="field grow"><span>最晚</span><input id="timeTo" type="time" value="${state.timeTo}"></label>
      </div>
    </section>
    <div class="days">${[0,1,2].map(i=>{const d=dayLabel(i);return `<button class="day ${i===state.activeDay?'on':''}" data-day="${i}"><b>${d.label}</b><span>${d.iso.slice(5).replace('-','/')} 周${d.wd}</span></button>`}).join('')}</div>
    <div class="summary"><strong>${filtered.length}</strong> 个航班 <span>·</span> ${state.widebody?'已筛选宽体':'全部机型'} ${state.loading?'· 更新中…':''}</div>
    ${plan ? `<section class="spotting"><div class="spotting-head"><b>👀 观机计划</b><span>按 2 小时窗口汇总</span></div>${plan.map(x=>`<div class="spot-window"><div><b>${x.from}–${x.to}</b><small>${x.count} 个航班</small></div><div class="spot-tags">${x.wide?`<span>宽体 ${x.wide}</span>`:''}${x.livery?`<span class="livery">🎨 彩绘 ${x.livery}</span>`:''}</div></div>`).join('')}</section>` : ''}
    ${state.error ? `<div class="notice error">${esc(state.error)}</div>` : ''}
    ${state.loading && !state.flights.length ? '<div class="empty">正在读取航班…</div>' : ''}
    ${!state.loading && !filtered.length ? '<div class="empty"><b>没有符合条件的航班</b><span>试试关闭“只看宽体”或换一天</span></div>' : ''}
${state.detailFlight ? detailModal(state.detailFlight) : ''}
    <div class="flight-list">${state.direction!=='arr' ? section('出发',dep) : ''}${state.direction!=='dep' ? section('到达',arr) : ''}</div>
    <footer>数据源：AeroDataBox · 默认隐藏代码共享重复航班 · 更新时间来自数据源</footer>
  </main>`;
  bind();
}
function detailModal(f){
  const info=aircraftDisplay(f), l=liveryOf(f);
  const sources=['AeroDataBox']; if(f.__sources?.includes('FlightAware')) sources.push('FlightAware');
  return `<div class="modal-backdrop" id="modal"><div class="modal"><button class="modal-close" id="closeModal">×</button><h2>${esc(numberOf(f))}</h2>${l?`<div class="livery-detail"><div class="livery-rarity ${liveryClass(l.rarity)}">${esc(l.rarity)}</div><b>${esc(l.name)}彩绘</b></div>`:''}<div class="modal-grid"><span>航司</span><b>${esc(airlineOf(f))}</b><span>机型</span><b>${esc(info.current)}</b><span>状态</span><b>${esc(info.level)}</b><span>机号</span><b>${esc(info.registration||'暂无')}</b><span>彩绘</span><b>${l?'已识别':'未识别'}</b><span>数据源</span><b>${esc(sources.join(' + '))}</b></div><p class="modal-note">彩绘只在数据源明确提供或后续机号库确认时标记；没有证据不会猜测。</p></div></div>`;
}
function spottingPlan(list){
  const windows=[];
  for(let h=6;h<22;h+=2){
    const from=String(h).padStart(2,'0')+':00', to=String(h+2).padStart(2,'0')+':00';
    const inWin=list.filter(f=>{const t=timeOf(f);return t>=from&&t<to;});
    if(!inWin.length) continue;
    const wide=inWin.filter(f=>isWide(aircraftDisplay(f).current)).length;
    const livery=inWin.filter(f=>Boolean(liveryOf(f))).length;
    if(wide||livery) windows.push({from,to,count:inWin.length,wide,livery});
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
      <div class="aircraft"><b>${esc(type)}</b><small class="aircraft-level">${info.level}</small>${wide?'<span>宽体</span>':''}${liveryOf(f)?`<span class="livery-badge ${liveryClass(liveryOf(f).rarity)}">🎨 ${esc(liveryOf(f).rarity)}</span>`:''}</div>${liveryOf(f)?`<div class="livery-mini"><b>${esc(liveryOf(f).name)}彩绘 · ${esc(liveryOf(f).rarity)}</b></div>`:''}${info.registration?`<small class="registration">${esc(info.registration)}</small>`:''}${f.__sources?.includes('FlightAware')?`<small class="source-ok">✓ FlightAware 交叉确认</small>`:''}${info.conflict?`<small class="aircraft-conflict">⚠ 机型存在差异</small>`:''}${info.updated?`<small class="aircraft-note">更新 ${esc(info.updated.replace('T',' ').replace('Z',' UTC'))}</small>`:''}
    </article>`
  }).join('')}</section>`;
}
function bind(){
  document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{state.activeDay=Number(b.dataset.day);state.date=dayLabel(state.activeDay).iso;state.flights=state.dayFlights[state.date]||[];render();});
  document.querySelector('#airport').onchange=e=>{state.airport=e.target.value;localStorage.setItem('aero-airport',state.airport);state.activeDay=0;state.baseDate=localISO();state.date=state.baseDate;state.dayFlights={};loadRange();};
  document.querySelector('#date').onchange=e=>{state.baseDate=e.target.value;state.date=state.baseDate;state.activeDay=0;state.dayFlights={};loadRange();};
  document.querySelector('#q').oninput=e=>{state.q=e.target.value;render();};
  document.querySelector('#timeFrom').onchange=e=>{state.timeFrom=e.target.value;render();};
  document.querySelector('#timeTo').onchange=e=>{state.timeTo=e.target.value;render();};
  document.querySelector('#wide').onclick=()=>{state.widebody=!state.widebody;render();};
  document.querySelector('#special').onclick=()=>{state.special=!state.special;render();};
  document.querySelector('#codeshare').onclick=()=>{state.showCodeshare=!state.showCodeshare;render();};
  document.querySelectorAll('[data-airline]').forEach(b=>b.onclick=()=>{const a=b.dataset.airline;if(!a)state.selectedAirlines=[];else state.selectedAirlines=state.selectedAirlines.includes(a)?state.selectedAirlines.filter(x=>x!==a):[...state.selectedAirlines,a];render();});
  document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>{const t=b.dataset.type;if(!t)state.aircraftTypes=[];else state.aircraftTypes=state.aircraftTypes.includes(t)?state.aircraftTypes.filter(x=>x!==t):[...state.aircraftTypes,t];render();});
  document.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>{state.direction=b.dataset.dir;render();});
  document.querySelector('#refresh').onclick=loadRange;
  document.querySelectorAll('.flight').forEach(el=>el.onclick=()=>{const id=el.dataset.flightId; const f=state.flights.find(x=>flightIdentity(x)===id); if(f) {state.detailFlight=f;render();}});
  document.querySelector('#closeModal')?.addEventListener('click',()=>{state.detailFlight=null;render();});
  document.querySelector('#modal')?.addEventListener('click',e=>{if(e.target.id==='modal'){state.detailFlight=null;render();}});
}
async function fetchDay(date){
  const key=`aero:${state.airport}:${date}:${state.showCodeshare}`;
  try{
    const cached=JSON.parse(localStorage.getItem(key)||'null');
    if(cached?.savedAt && Date.now()-cached.savedAt<10*60*1000){const flights=cached.flights||[];flights.__fetchedAt=cached.fetchedAt||'';return flights;}
  }catch{}
  const r=await fetch(`/api/flights?airport=${encodeURIComponent(state.airport)}&date=${encodeURIComponent(date)}&showCodeshare=${state.showCodeshare}`);
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||'读取航班失败');
  const flights=[
    ...(data.departures||[]).map(f=>({...f,__direction:'dep'})),
    ...(data.arrivals||[]).map(f=>({...f,__direction:'arr'}))
  ];
  flights.__fetchedAt=data.fetchedAt||'';
  try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),flights, fetchedAt:data.fetchedAt||''}));}catch{}
  return flights;
}
async function loadRange(){
  state.loading=true; state.error=''; render();
  const dates=[0,1,2].map(i=>dayLabel(i).iso);
  const results=await Promise.allSettled(dates.map(fetchDay));
  results.forEach((r,i)=>{if(r.status==='fulfilled') state.dayFlights[dates[i]]=r.value;});
  const failed=results.filter(r=>r.status==='rejected').length;
  state.flights=state.dayFlights[state.date]||[];
  if(failed===3) state.error='暂时无法读取航班数据。请检查 API 配置。';
  else if(failed) state.error='部分日期暂时无法更新，已显示成功读取的数据。';
  state.loading=false;render();
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