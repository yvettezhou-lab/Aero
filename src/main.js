import './style.css';
import { liveryForRegistration } from './data/liveries.js';
import { aircraftOverrideFor } from './data/aircraftOverrides.js';

const AIRPORTS = [
  ['KMG','Kunming Changshui','Kunming',24.9924,102.7435],['PEK','Beijing Capital','Beijing',40.0799,116.6031],['PKX','Beijing Daxing','Beijing',39.5098,116.4105],
  ['PVG','Shanghai Pudong','Shanghai',31.1443,121.8083],['SHA','Shanghai Hongqiao','Shanghai',31.1979,121.3363],['CAN','Guangzhou Baiyun','Guangzhou',23.3924,113.2988],
  ['SZX','Shenzhen Bao’an','Shenzhen',22.6393,113.8107],['TFU','Chengdu Tianfu','Chengdu',30.3125,104.4419],
  ['HKG','Hong Kong','Hong Kong',22.3080,113.9185],['SIN','Singapore Changi','Singapore',1.3644,103.9915],['BKK','Bangkok Suvarnabhumi','Bangkok',13.6900,100.7501],
  ['KUL','Kuala Lumpur','Kuala Lumpur',2.7456,101.7099],['NRT','Tokyo Narita','Tokyo',35.7720,140.3929],['HND','Tokyo Haneda','Tokyo',35.5494,139.7798],
  ['ICN','Seoul Incheon','Seoul',37.4602,126.4407],['TPE','Taipei Taoyuan','Taipei',25.0797,121.2342],['MNL','Manila','Manila',14.5086,121.0197]
];

const WIDEBODY = /\b(?:A300|A310|A330|A340|A350|A380|B747|B767|B77[0-9]|B78[0-9]|DC10|MD11|IL96|L1011)\b|\b(?:Airbus\s+)?A(?:300|310|330|340|350|380)(?:[- ]?[0-9]+)?\b|\b(?:Boeing\s+)?(?:747|767|77[0-9]|78[0-9])(?:[- ]?[0-9]+)?\b/i;

const state = {
  airport: localStorage.getItem('aero-airport') || 'KMG',
  date: localISO(),
  baseDate: localISO(),
  days: 3,
  activeDay: 0,
  listDirection: 'dep',
  spottingOpen: localStorage.getItem('aero-spotting-open') === '1',
  spottingLogOpen: localStorage.getItem('aero-spotting-log-open') === '1',
  spottingLogHistory: localStorage.getItem('aero-spotting-log-history') === '1',
  spottingLogFilterDate: localStorage.getItem('aero-spotting-log-filter-date') || '',
  spottingLogFilterAirport: localStorage.getItem('aero-spotting-log-filter-airport') || '',
  spottingLogFilterAircraft: localStorage.getItem('aero-spotting-log-filter-aircraft') || '',
  spottingLogFilterLivery: localStorage.getItem('aero-spotting-log-filter-livery') || '',
  spottingLogFilterSearch: localStorage.getItem('aero-spotting-log-filter-search') || '',
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
  spottingLog: JSON.parse(localStorage.getItem('aero-spotting-log') || '[]'),
  confirmations: JSON.parse(localStorage.getItem('aero-confirmations') || '{}')
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
  return a.model || a.type || a.icao || a.iata || f?.aircraftType || 'Unknown aircraft';
}
function aircraftInfo(f){
  const a=f?.aircraft || {};
  const fa=f?.__flightAware||{};
  const current=a.model || a.type || a.icao || a.iata || f?.aircraftType || fa.aircraftType || 'Unknown aircraft';
  const registration=a.reg || a.registration || f?.registration || f?.tailNumber || fa.registration || '';
  const status=String(f?.status||'');
  const level=/Departed|Arrived|EnRoute|Approaching/.test(status) ? 'Operating / Actual' : 'Currently known';
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
  if(typeof raw==='string') return {name:raw,rarity:'Uncommon'};
  return {name:raw?.name||raw?.title||raw?.liveryName||'Special livery',rarity:raw?.rarity||raw?.level||'Uncommon'};
}
function liveryClass(r=''){return /Rare|rare/i.test(r)?'rare':/Common|common/i.test(r)?'common':'uncommon';}
function isCodeshare(f){ return f?.codeshareStatus==='IsCodeshared'; }
function airlineOf(f){
  return f?.airline?.name || f?.airline?.iata || f?.airline?.icao || 'Unknown airline';
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
  {id:'widebody',name:'Widebody',filter:{widebody:true}},
  {id:'livery',name:'Livery',filter:{special:true}},
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
function saveConfirmations(){try{localStorage.setItem('aero-confirmations',JSON.stringify(state.confirmations));}catch{}}
function confirmKey(f,date=state.date){return [state.airport,date,f?.__direction||'',numberOf(f)].join('|');}
function confirmationFor(f,date=state.date){return state.confirmations[confirmKey(f,date)]||null;}
function confirmedListFor(date){return Object.values(state.confirmations).filter(x=>x.airport===state.airport&&x.date===date&&x.confirmed);}
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
  return '<section class="target-card"><div class="target-head"><div><b>🎯 Spotting Target</b><span>Quickly apply what you want to spot</span></div><button class="target-save" id="saveTarget">＋ Save Current</button></div><div class="target-chips">'+chips+'</div>'+
    (active?'<div class="target-active">Current: <b>'+esc(active.name)+'</b><button id="clearTarget">Clear</button></div>':'')+
    '<div class="target-hint">'+(current.widebody?'Widebody · ':'')+(current.special?'Livery · ':'')+(current.aircraftTypes.length?current.aircraftTypes.join('、')+' · ':'')+(current.selectedAirlines.length?current.selectedAirlines.join('、')+' · ':'')+((!current.widebody&&!current.special&&!current.aircraftTypes.length&&!current.selectedAirlines.length)?'All filters':'')+'</div></section>';
}
function recordKey(f){
  const info=aircraftDisplay(f);
  return [state.airport,state.date,info.registration||numberOf(f),numberOf(f)].join('|');
}
function confirmButton(f,date=state.date){const c=confirmationFor(f,date);return '<button class="confirm-btn '+(c?.confirmed?'confirmed':'')+'" data-confirm="'+esc(confirmKey(f,date))+'">'+(c?.confirmed?'✓ Confirmed':'Confirm')+'</button>';}
function spottingRecordButton(f){
  const key=recordKey(f);
  const seen=state.spottingLog.some(x=>x.key===key);
  return '<button class="seen-btn '+(seen?'seen':'')+'" data-seen="'+esc(key)+'">'+(seen?'✓ Seen':'✓ Seen it')+'</button>';
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
function aeroExportData(){
  const payload={
    app:"Aero",
    version:1,
    exportedAt:new Date().toISOString(),
    spottingLog:state.spottingLog,
    confirmations:state.confirmations,
    targets:state.targets
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const file=new File([blob],"aero-data-"+localISO()+".json",{type:"application/json"});
  if(navigator.share&&navigator.canShare?.({files:[file]})){
    navigator.share({title:"Aero Data",files:[file]}).catch(()=>{});
    return;
  }
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=file.name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function aeroImportData(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const p=JSON.parse(reader.result);
      if(!p||p.app!=="Aero") throw new Error("Invalid Aero data file");
      if(Array.isArray(p.spottingLog)) state.spottingLog=p.spottingLog;
      if(p.confirmations&&typeof p.confirmations==="object") state.confirmations=p.confirmations;
      if(Array.isArray(p.targets)) state.targets=p.targets;
      saveSpottingLog();saveConfirmations();saveTargets();
      state.spottingLogHistory=false;
      localStorage.setItem("aero-spotting-log-history","0");
      render();
      alert("Aero data imported successfully.");
    }catch(e){alert("This is not a valid Aero data file.");}
  };
  reader.readAsText(file);
}
function spottingLogCard(){
  const todayDate=localISO();
  const today=state.spottingLog.filter(x=>x.airport===state.airport&&x.date===todayDate);
  const allHistory=state.spottingLog.filter(x=>x.date<todayDate);
  const filteredHistory=allHistory.filter(x=>
    (!state.spottingLogFilterDate||x.date===state.spottingLogFilterDate)&&
    (!state.spottingLogFilterAirport||x.airport===state.spottingLogFilterAirport)&&
    (!state.spottingLogFilterAircraft||x.type===state.spottingLogFilterAircraft)&&
    (!state.spottingLogFilterLivery||Boolean(x.livery)===true)&&
    (!state.spottingLogFilterSearch||String(x.number||'').toLowerCase().includes(state.spottingLogFilterSearch.toLowerCase())||String(x.registration||'').toLowerCase().includes(state.spottingLogFilterSearch.toLowerCase()))
  );
  const formatRows=(rows)=>rows.length
    ? '<div class="log-list">'+[...rows].reverse().map(x=>'<div class="log-row"><div><b>'+esc(x.number)+'</b><span>'+esc(x.airport)+' · '+esc(x.date.slice(5).replace('-','/'))+'</span></div><div><strong>'+esc(x.type)+'</strong>'+(x.registration?'<small>'+esc(x.registration)+'</small>':'')+(x.livery?'<em>🎨 '+esc(x.livery)+' · '+esc(x.rarity||'Uncommon')+'</em>':'')+'</div></div>').join('')+'</div>'
    : '<div class="log-empty">No matching spotting records.</div>';
  const dates=[...new Set(filteredHistory.map(x=>x.date))].sort((a,b)=>b.localeCompare(a));
  const dateOptions=[...new Set(allHistory.map(x=>x.date))].sort((a,b)=>b.localeCompare(a));
  const airportOptions=[...new Set(allHistory.map(x=>x.airport))].sort();
  const aircraftOptions=[...new Set(allHistory.map(x=>x.type).filter(Boolean))].sort();
  const hasLogFilter=Boolean(state.spottingLogFilterDate||state.spottingLogFilterAirport||state.spottingLogFilterAircraft||state.spottingLogFilterLivery||state.spottingLogFilterSearch);
  const historyHtml=filteredHistory.length
    ? '<div class="log-history">'+dates.map(date=>'<div class="log-date"><b>'+esc(date.slice(5).replace('-','/'))+'</b><span>'+filteredHistory.filter(x=>x.date===date).length+' logged</span></div>'+formatRows(filteredHistory.filter(x=>x.date===date))).join('')+'</div>'
    : '<div class="log-empty">No matching spotting records.</div>';
  const body=state.spottingLogOpen
    ? '<div class="log-today">'+formatRows(today)+'</div>'+
      '<div class="log-actions">'+(allHistory.length?'<button class="log-view-all" id="viewAllLog">'+(state.spottingLogHistory?'View less':'View all')+'</button>':'')+'<button class="log-settings" id="logSettings" aria-label="Spotting log settings">⚙︎</button></div>'+
      '<div class="log-settings-menu" id="logSettingsMenu"><button id="exportAeroData">Export data</button><button id="importAeroData">Import data</button><button id="clearLog" class="danger">Clear all</button><input id="importAeroFile" type="file" accept=".json,application/json" hidden></div>'+
      (state.spottingLogHistory
        ? '<div class="log-history-wrap"><div class="log-filters"><label><span>Date</span><select id="logFilterDate"><option value="">All dates</option>'+dateOptions.map(d=>'<option value="'+esc(d)+'" '+(state.spottingLogFilterDate===d?'selected':'')+'>'+esc(d.slice(5).replace('-','/'))+'</option>').join('')+'</select></label><label><span>Aircraft</span><select id="logFilterAircraft"><option value="">All aircraft</option>'+aircraftOptions.map(a=>'<option value="'+esc(a)+'" '+(state.spottingLogFilterAircraft===a?'selected':'')+'>'+esc(a)+'</option>').join('')+'</select></label><label><span>Airport</span><select id="logFilterAirport"><option value="">All airports</option>'+airportOptions.map(a=>'<option value="'+esc(a)+'" '+(state.spottingLogFilterAirport===a?'selected':'')+'>'+esc(a)+'</option>').join('')+'</select></label><label><span>Flight / Reg.</span><input id="logFilterSearch" placeholder="e.g. MU5811" value="'+esc(state.spottingLogFilterSearch)+'"></label><label class="log-filter-check"><input id="logFilterLivery" type="checkbox" '+(state.spottingLogFilterLivery?'checked':'')+'><span>Special livery only</span></label><button class="log-filter-clear '+(hasLogFilter?'active':'')" id="clearLogFilters">Clear filters</button></div>'+historyHtml+'</div>'
        : '')
    : '';
  return '<section class="log-card '+(state.spottingLogOpen?'open':'')+'"><button class="log-head" id="toggleLog" aria-expanded="'+(state.spottingLogOpen?'true':'false')+'"><div class="log-title"><b>My Spotting Log</b></div><div class="log-summary"><span>'+today.length+' logged today</span><i class="log-chevron">'+(state.spottingLogOpen?'⌃':'⌄')+'</i></div></button>'+body+'</section>';
}
function sourceFooter(){
  const meta=state.sourceMeta[state.date]?.secondSource;
  let second='FlightAware not configured';
  if(meta?.enabled) second=meta.ok?'FlightAware ✓ Cross-checked':'FlightAware ⚠ Connection failed';
  return '<div class="source-bar"><span>AeroDataBox ✓</span><span>'+second+'</span></div>';
}
function airportMeta(){const a=AIRPORTS.find(x=>x[0]===state.airport);return a?{name:a[1],lat:a[3],lon:a[4]}:null;}
function weatherText(c){const m={0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Fog',51:'Drizzle',53:'Drizzle',55:'Drizzle',61:'Light rain',63:'Moderate rain',65:'Heavy rain',80:'Showers',81:'Showers',82:'Heavy showers',95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm'};return m[c]||'Changing weather';}
function weatherIcon(c){if(c===0)return '☀️';if([1,2].includes(c))return '🌤️';if(c===3)return '☁️';if([45,48].includes(c))return '🌫️';if([51,53,55,61,63,65,80,81,82].includes(c))return '🌧️';if([95,96,99].includes(c))return '⛈️';return '🌤️';}
const RUNWAY_AXES={
  KMG:[{label:'03/21',headings:[39,219]},{label:'04R/22L',headings:[39,219]}]
};
function compass(deg){
  if(!Number.isFinite(deg)) return '—';
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8];
}
function normalizeDeg(deg){return ((deg%360)+360)%360;}
function likelyRunway(airport,windFrom){
  const axes=RUNWAY_AXES[airport];
  if(!axes||!Number.isFinite(windFrom)) return null;
  const landingHeading=normalizeDeg(windFrom+180);
  const best=axes.reduce((acc,axis)=>{
    const h=axis.headings.reduce((bestHeading,h)=>{
      const diff=Math.abs(normalizeDeg(landingHeading-h));
      const circular=Math.min(diff,360-diff);
      return circular<bestHeading.diff?{h,diff:circular}:{...bestHeading};
    },{h:axis.headings[0],diff:Infinity});
    return h.diff<acc.diff?{axis,h:h.h,diff:h.diff}:{...acc};
  },{axis:null,h:0,diff:Infinity});
  if(!best.axis||best.diff>35) return null;
  const runway=best.h<100?'04 / 03':'22 / 21';
  return {landingHeading:best.h,approach:compass(best.h+180),runway};
}
function windAt(h,i){
  const speed=Number(h.wind_speed_10m?.[i]), direction=Number(h.wind_direction_10m?.[i]);
  return {speed,direction};
}
function weatherSummary(date){const h=state.weather?.hourly;if(!h?.time)return null;const rows=h.time.map((t,i)=>({t,i})).filter(x=>x.t.startsWith(date)&&+x.t.slice(11,13)>=6&&+x.t.slice(11,13)<22);if(!rows.length)return null;const nums=k=>rows.map(x=>Number(h[k]?.[x.i])).filter(Number.isFinite);const rp=nums('precipitation_probability'),vis=nums('visibility'),wind=nums('wind_speed_10m');const maxRain=rp.length?Math.max(...rp):0,minVis=vis.length?Math.min(...vis):null,maxWind=wind.length?Math.max(...wind):null;let level='Good';if(maxRain>50||(minVis!=null&&minVis<5000)||(maxWind!=null&&maxWind>35))level='Watch conditions';if(maxRain>75||(minVis!=null&&minVis<3000)||(maxWind!=null&&maxWind>50))level='Not ideal';const good=rows.filter(x=>Number(h.precipitation_probability?.[x.i]??0)<=30&&Number(h.visibility?.[x.i]??99999)>=8000&&Number(h.wind_speed_10m?.[x.i]??0)<=30).map(x=>x.t.slice(11,16)).slice(0,4);return{level,maxRain,minVis,maxWind,good};}
function weatherCard(){
  if(state.weatherLoading)return '<div class="weather-compact"><b>🌤 Weather</b><span>Loading…</span></div>';
  if(state.weatherError)return '<div class="weather-compact"><b>🌤 Weather</b><span>Unavailable</span></div>';
  const h=state.weather?.hourly;if(!h?.time)return '';
  let ni=0,best=Infinity,target=new Date(state.date+'T12:00:00').getTime();
  h.time.forEach((t,i)=>{const d=Math.abs(new Date(t).getTime()-target);if(d<best){best=d;ni=i;}});
  const code=Number(h.weather_code?.[ni]),vis=Number(h.visibility?.[ni]),cloud=Number(h.cloud_cover_low?.[ni]),s=weatherSummary(state.date),w=windAt(h,ni),runway=likelyRunway(state.airport,w.direction);
  const windLabel=Number.isFinite(w.speed)?'Wind '+compass(w.direction)+' '+(Number.isFinite(w.direction)?Math.round(w.direction)+'° ':'')+Math.round(w.speed)+'km/h':'Wind —';
  const runwayLabel=runway?'Likely approach '+esc(runway.approach)+' · RWY '+esc(runway.runway):'';
  return '<div class="weather-compact"><b>🌤 '+esc(airportName(state.airport))+'</b><span>'+weatherIcon(code)+' '+weatherText(code)+'</span><em>Visibility '+(Number.isFinite(vis)?Math.round(vis/100)/10+'km':'—')+'</em><em>'+windLabel+'</em><em>Low cloud '+(Number.isFinite(cloud)?Math.round(cloud):'—')+'%</em><em>Rain '+(s?s.maxRain:'—')+'%</em>'+(runwayLabel?'<strong class="wind-plan">'+runwayLabel+'</strong>':'')+'</div>';
}
function dayTabs(){return [0,1,2].map(i=>{const d=dayLabel(i);return '<button class="day '+(i===state.activeDay?'on':'')+'" data-day="'+i+'"><b>'+d.label+'</b></button>';}).join('');}
function dayLabel(offset){
  const d=new Date(state.baseDate+'T12:00:00'); d.setDate(d.getDate()+offset);
  const iso=d.toISOString().slice(0,10);
  const wd=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  const dateLabel=`${d.getMonth()+1}/${d.getDate()}`;
  return {iso,label:offset===0?dateLabel:offset===1?'Tomorrow':offset===2?'Day After Tomorrow':dateLabel,wd};
}
function render(){
  const aircraftTypes=[...new Set(state.flights.map(f=>aircraftDisplay(f).current).filter(x=>x&&x!=='Unknown aircraft'))].sort();
  const airlines=[...new Set(state.flights.map(airlineOf).filter(x=>x!=='Unknown airline'))].sort();
  const filtered=filterFlights(state.flights);
  const dep=filtered.filter(f=>f.__direction==='dep'), arr=filtered.filter(f=>f.__direction==='arr');
  const depCount=dep.length, arrCount=arr.length;
  const plan=spottingPlan(filtered);
  app.innerHTML=`
  <main>
    <header><div class="brand"><span class="logo">✈</span><div><h1>Aero</h1><p>What’s flying today?</p></div></div><button class="refresh" id="refresh">Refresh Data</button></header>
    <section class="panel">
      <div class="airport-date-row">
              <label class="field airport-field"><span>Airport</span><select id="airport">${AIRPORTS.map(a=>`<option value="${a[0]}" ${a[0]===state.airport?"selected":""}>${a[0]} · ${a[1]}</option>`).join("")}</select></label>
        <div class="days-inline">${dayTabs()}</div>
      </div>
      ${weatherCard()}  <div class="chips">
        <button class="chip wide ${state.widebody?"on":""}" id="wide">✦ Widebody Only</button>
        <button class="chip ${state.special?"on":""}" id="special">🎨 Special Livery</button>
        <button class="chip ${state.showCodeshare?"on":""}" id="codeshare">Show Codeshare</button>
      </div>
      <div class="filter-select-row">
        <label class="filter-select"><span>Aircraft</span><select id="aircraftSelect"><option value="">All Aircraft</option>${aircraftTypes.map(t=>`<option value="${esc(t)}" ${state.aircraftTypes.includes(t)?"selected":""}>${esc(t)}</option>`).join("")}</select></label>
        <label class="filter-select"><span>Airline</span><select id="airlineSelect"><option value="">All Airlines</option>${airlines.map(a=>`<option value="${esc(a)}" ${state.selectedAirlines.includes(a)?"selected":""}>${esc(a)}</option>`).join("")}</select></label>
      </div>
      <div class="compact-search-row">
        <label class="field search-field"><span>Search</span><input id="q" placeholder="Flight No. / Aircraft" value="${esc(state.q)}"></label>
        <label class="field compact-time-field"><span>Time</span><div class="time-pair"><input id="timeFrom" type="time" value="${state.timeFrom}"><i>—</i><input id="timeTo" type="time" value="${state.timeTo}"></div></label>
      </div>
    </section>

    <div class="summary"><strong>${filtered.length}</strong> flights <span>·</span> ${state.widebody?'Widebody filtered':'All Aircraft'} ${state.loading?'· Updating…':''}</div>
    ${spottingOverview()}\n    ${spottingLogCard()}\n    <div class="flight-tabs" role="tablist" aria-label="Flight list">\n      <button class="${state.listDirection==="dep"?"on":""}" data-dir="dep">Departures <span>${depCount}</span></button>\n      <button class="${state.listDirection==="arr"?"on":""}" data-dir="arr">Arrivals <span>${arrCount}</span></button>\n    </div>\n    ${state.error ? `<div class="notice error">${esc(state.error)}</div>` : ''}
    ${state.loading && !state.flights.length ? '<div class="empty">Loading flights…</div>' : ''}
    ${!state.loading && !filtered.length ? '<div class="empty"><b>No matching flights</b><span>试试关闭“Widebody Only”或换一天</span></div>' : ''}
${state.detailFlight ? detailModal(state.detailFlight) : ''}
    <div class="flight-list">${state.listDirection==='dep' ? section('Departures',dep) : section('Arrivals',arr)}</div>
    ${sourceFooter()}
    <footer>Codeshare duplicates are hidden by default · Spotting Plan follows your filters</footer>
  </main>`;
  bind();
}
function detailModal(f){
  const info=aircraftDisplay(f), l=liveryOf(f), date=f.__date||state.date, c=confirmationFor(f,date);
  const sources=['AeroDataBox']; if(f.__sources?.includes('FlightAware')) sources.push('FlightAware');
  return `<div class="modal-backdrop" id="modal"><div class="modal"><button class="modal-close" id="closeModal">×</button><h2>${esc(numberOf(f))}</h2>${l?`<div class="livery-detail"><div class="livery-rarity ${liveryClass(l.rarity)}">${esc(l.rarity)}</div><b>${esc(l.name)}Livery</b></div>`:''}<div class="modal-grid"><span>Airline</span><b>${esc(airlineOf(f))}</b><span>Aircraft</span><b>${esc(info.current)}</b><span>Status</span><b>${esc(info.level)}</b><span>Registration</span><b>${esc(info.registration||'N/A')}</b><span>Livery</span><b>${l?'Identified':'Not identified'}</b><span>Data source</span><b>${esc(sources.join(' + '))}</b></div><div class="modal-actions">${spottingRecordButton(f)}</div><p class="modal-note">Confirm manually using FR24, VariFlight, or Umetrip. This does not request new flight data.</p></div></div>`;
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
  const d=dayLabel(state.activeDay);
  const list=filterFlights(state.dayFlights[d.iso]||[]);
  if(!list.length) return '';
  const rows=[...list].sort((a,b)=>timeOf(a).localeCompare(timeOf(b)));
  let currentIndex=0;
  if(state.activeDay===0 && d.iso===localISO()){
    const now=new Date();
    const nowTime=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
    const next=rows.findIndex(f=>timeOf(f)>=nowTime);
    currentIndex=next>=0?next:rows.length;
  }
  const html=rows.map((f,index)=>{
    const info=aircraftDisplay(f),wide=isWide(info.current),l=liveryOf(f);
    const route=f.__direction==='dep'?cityOf(f,'arrival'):cityOf(f,'departure');
    const planWind=state.weather?.hourly?windAt(state.weather.hourly,Math.max(0,state.weather.hourly.time?.findIndex(t=>t.startsWith(d.iso)&&t.slice(11,13)===timeOf(f).slice(0,2)))):{speed:NaN,direction:NaN};
    const runway=likelyRunway(state.airport,planWind.direction);
    const operationHint=runway?'<small class="spot-approach">'+(f.__direction==='arr'?'Approach ':'Departure ')+esc(runway.approach)+' · RWY '+esc(runway.runway)+'</small>':'';
    return '<div class="spot-flight">'+
      '<time>'+esc(timeOf(f))+'</time>'+
      '<div class="spot-flight-main"><b>'+esc(numberOf(f))+'</b><span>'+esc(airlineOf(f))+'</span></div>'+
      '<div class="spot-flight-route">'+esc(route)+'</div>'+
      '<div class="spot-flight-aircraft"><b>'+esc(info.current)+'</b>'+operationHint+(l?'<small class="livery">🎨 '+esc(l.rarity)+'</small>':'')+'</div>'+
      (info.registration?'<small class="spot-reg">'+esc(info.registration)+'</small>':'')+
      '<div class="spot-confirm">'+confirmButton(f,d.iso)+'</div>'+
      '</div>';
  }).join('');
  return '<section class="spotting"><div class="spotting-head"><b>👀 Spotting Plan</b><span>'+esc(d.label)+' · '+esc(d.iso.slice(5).replace('-','/'))+' · '+list.length+' targets</span></div><div class="spotting-body" data-current-index="'+currentIndex+'">'+html+'</div></section>';
}
function confirmedList(){
  const d=dayLabel(state.activeDay), rows=confirmedListFor(d.iso).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  if(!rows.length) return '';
  return '<section class="confirmed-card"><div class="confirmed-head"><b>✓ Confirmed Spotting List</b><span>'+rows.length+' confirmed</span></div><div class="confirmed-list">'+rows.map(x=>'<div class="confirmed-row"><time>'+esc(x.time||'--:--')+'</time><div><b>'+esc(x.actualFlightNumber||x.number)+'</b><span>'+esc(x.actualAircraft||x.scheduledAircraft||'Aircraft not entered')+(x.registration?' · '+esc(x.registration):'')+(x.actualFlightNumber&&x.actualFlightNumber!==x.number?' · Scheduled '+esc(x.number):'')+'</span></div><small>'+esc(x.sourceLabel||'Manual confirmation')+'</small></div>').join('')+'</div></section>';
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
      <div class="aircraft"><b>${esc(type)}</b><small class="aircraft-level">${info.level}</small>${wide?'<span>Widebody</span>':''}${liveryOf(f)?`<span class="livery-badge ${liveryClass(liveryOf(f).rarity)}">🎨 ${esc(liveryOf(f).rarity)}</span>`:''}</div>${liveryOf(f)?`<div class="livery-mini"><b>${esc(liveryOf(f).name)}Livery · ${esc(liveryOf(f).rarity)}</b></div>`:''}${info.registration?`<small class="registration">${esc(info.registration)}</small>`:''}${f.__sources?.includes('FlightAware')?`<small class="source-ok">✓ FlightAware Cross-checked</small>`:''}${info.conflict?`<small class="aircraft-conflict">⚠ Aircraft data differs</small>`:''}${info.updated?`<small class="aircraft-note">Updated ${esc(info.updated.replace('T',' ').replace('Z',' UTC'))}</small>`:''}${spottingRecordButton(f)}
    </article>`
  }).join('')}</section>`;
}
function openConfirm(f,date=state.date){
  const existing=confirmationFor(f,date)||{};
  const sources=existing.sources||{fr24:true,variflight:true,umetrip:true};
  const modal='<div class="modal-backdrop" id="confirmModal"><div class="modal confirm-modal"><button class="modal-close" id="confirmCancel">×</button><h2>Confirm Aircraft</h2><div class="confirm-flight"><b>'+esc(numberOf(f))+'</b><span>'+esc(airlineOf(f))+' · '+esc(timeOf(f))+' · '+esc(f.__direction==='dep'?cityOf(f,'arrival'):cityOf(f,'departure'))+'</span></div><div class="confirm-sources"><b>Sources checked</b><label><input type="checkbox" id="srcFr24" '+(sources.fr24!==false?'checked':'')+'> FR24</label><label><input type="checkbox" id="srcVariFlight" '+(sources.variflight!==false?'checked':'')+'> VariFlight</label><label><input type="checkbox" id="srcUmetrip" '+(sources.umetrip!==false?'checked':'')+'> Umetrip</label></div><div id="manualConfirmFields" class="manual-confirm-fields hidden"><label class="confirm-field"><span>Actual aircraft <em>(optional)</em></span><input id="actualAircraft" placeholder="e.g. Boeing 737-8 MAX" value="'+esc(existing.actualAircraft||'')+'"></label><label class="confirm-field"><span>Registration <em>(optional)</em></span><input id="actualRegistration" placeholder="e.g. B-1380" value="'+esc(existing.registration||'')+'"></label><label class="confirm-field"><span>Actual flight number (if different) <em>(optional)</em></span><input id="actualFlightNumber" placeholder="e.g. MU5821" value="'+esc(existing.actualFlightNumber||'')+'"></label></div><div class="confirm-actions" id="confirmActions"></div><p class="confirm-note">Aero uses the cached flight plan. This step does not request new flight data.</p></div></div>';
  const holder=document.createElement('div'); holder.innerHTML=modal; document.body.appendChild(holder.firstElementChild);
  const getSources=()=>({fr24:document.querySelector('#srcFr24')?.checked??false,variflight:document.querySelector('#srcVariFlight')?.checked??false,umetrip:document.querySelector('#srcUmetrip')?.checked??false});
  const hasChange=()=>{const x=getSources();return !(x.fr24&&x.variflight&&x.umetrip);};
  const saveRecord=()=>{
    const src=getSources(), key=confirmKey(f,date), rec={key,airport:state.airport,date,number:numberOf(f),direction:f.__direction||'',time:timeOf(f),scheduledAircraft:aircraftDisplay(f).current,actualAircraft:document.querySelector('#actualAircraft')?.value.trim()||'',registration:document.querySelector('#actualRegistration')?.value.trim()||'',actualFlightNumber:document.querySelector('#actualFlightNumber')?.value.trim().toUpperCase()||'',sources:src,sourceLabel:[src.fr24?'FR24':'',src.variflight?'VariFlight':'',src.umetrip?'Umetrip':''].filter(Boolean).join(' + '),confirmed:true,confirmedAt:new Date().toISOString()};
    state.confirmations[key]=rec;saveConfirmations();document.querySelector('#confirmModal')?.remove();state.detailFlight=null;render();
  };
  const removeRecord=()=>{
    delete state.confirmations[confirmKey(f,date)];saveConfirmations();document.querySelector('#confirmModal')?.remove();state.detailFlight=null;render();
  };
  const sync=()=>{
    const changed=hasChange();
    document.querySelector('#manualConfirmFields')?.classList.toggle('hidden',!changed);
    const actions=document.querySelector('#confirmActions');
    if(!actions)return;
    actions.innerHTML=changed
      ? '<button id="keepConfirmation">Keep</button><button id="removeConfirmation" class="secondary">Remove</button>'
      : '<button id="saveConfirmation">✓ Confirm</button><button id="cancelConfirmation" class="secondary">Cancel</button>';
    document.querySelector('#keepConfirmation')?.addEventListener('click',saveRecord);
    document.querySelector('#removeConfirmation')?.addEventListener('click',removeRecord);
    document.querySelector('#saveConfirmation')?.addEventListener('click',saveRecord);
    document.querySelector('#cancelConfirmation')?.addEventListener('click',()=>document.querySelector('#confirmModal')?.remove());
  };
  ['#srcFr24','#srcVariFlight','#srcUmetrip'].forEach(sel=>document.querySelector(sel)?.addEventListener('change',sync));
  document.querySelector('#confirmCancel').onclick=()=>document.querySelector('#confirmModal')?.remove();
  sync();
}function bind(){
  document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{state.activeDay=Number(b.dataset.day);state.date=dayLabel(state.activeDay).iso;state.flights=state.dayFlights[state.date]||[];render();});
  document.querySelectorAll('[data-weather-day]').forEach(b=>b.onclick=()=>{state.activeDay=Number(b.dataset.weatherDay);state.date=dayLabel(state.activeDay).iso;state.flights=state.dayFlights[state.date]||[];render();});
  document.querySelector('#airport').onchange=e=>{state.airport=e.target.value;localStorage.setItem('aero-airport',state.airport);state.activeDay=0;state.baseDate=localISO();state.date=state.baseDate;state.dayFlights={};state.sourceMeta={};loadRange();loadWeather();};
  document.querySelector('#q').oninput=e=>{state.q=e.target.value;render();};
  document.querySelector('#timeFrom').onchange=e=>{state.timeFrom=e.target.value;render();};
  document.querySelector('#timeTo').onchange=e=>{state.timeTo=e.target.value;render();};
  document.querySelector('#wide').onclick=()=>{state.widebody=!state.widebody;render();};
  document.querySelector('#special').onclick=()=>{state.special=!state.special;render();};
  document.querySelector('#codeshare').onclick=()=>{state.showCodeshare=!state.showCodeshare;render();};
  document.querySelector('#airlineSelect').onchange=e=>{state.selectedAirlines=e.target.value?[e.target.value]:[];render();};
  document.querySelector('#aircraftSelect').onchange=e=>{state.aircraftTypes=e.target.value?[e.target.value]:[];render();};
  document.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>{state.listDirection=b.dataset.dir;render();});
  const spottingBody=document.querySelector('.spotting-body');
  if(spottingBody){
    const idx=Number(spottingBody.dataset.currentIndex||0);
    requestAnimationFrame(()=>{if(idx>0) spottingBody.scrollTop=Math.max(0,idx*76);});
  }
  document.querySelector('.spotting')?.addEventListener('toggle',e=>{state.spottingOpen=e.currentTarget.open;localStorage.setItem('aero-spotting-open',state.spottingOpen?'1':'0');});
  document.querySelector('#refresh').onclick=()=>loadRange(true);
  document.querySelectorAll('.flight').forEach(el=>el.onclick=()=>{const id=el.dataset.flightId; const f=state.flights.find(x=>flightIdentity(x)===id); if(f) {state.detailFlight=f;render();}});
  document.querySelectorAll('[data-confirm]').forEach(b=>b.onclick=e=>{e.stopPropagation();const f=state.flights.find(x=>confirmKey(x,x.__date||state.date)===b.dataset.confirm);if(f) openConfirm(f,f.__date||state.date);});
  document.querySelectorAll('[data-target]').forEach(b=>b.onclick=()=>{const id=b.dataset.target;const t=[...BUILTIN_TARGETS,...state.targets].find(x=>x.id===id);if(t)applyTarget(t);});
  document.querySelector('#clearTarget')?.addEventListener('click',()=>{state.targetId='';state.listDirection='dep';state.widebody=false;state.special=false;state.aircraftTypes=[];state.selectedAirlines=[];state.q='';state.timeFrom='00:00';state.timeTo='23:59';render();});
  document.querySelector('#saveTarget')?.addEventListener('click',()=>{
    const name=window.prompt('Name this Spotting Target','My Target');
    if(!name?.trim()) return;
    const target={id:'custom-'+Date.now(),name:name.trim(),filter:targetFilterSnapshot()};
    state.targets.push(target);state.targetId=target.id;saveTargets();render();
  });
  document.querySelector('#toggleLog')?.addEventListener('click',()=>{state.spottingLogOpen=!state.spottingLogOpen;localStorage.setItem('aero-spotting-log-open',state.spottingLogOpen?'1':'0');render();});
  document.querySelector('#viewAllLog')?.addEventListener('click',e=>{e.stopPropagation();state.spottingLogHistory=!state.spottingLogHistory;if(!state.spottingLogHistory){state.spottingLogFilterDate='';state.spottingLogFilterAirport='';localStorage.removeItem('aero-spotting-log-filter-date');localStorage.removeItem('aero-spotting-log-filter-airport');}localStorage.setItem('aero-spotting-log-history',state.spottingLogHistory?'1':'0');render();});
  document.querySelector('#logFilterDate')?.addEventListener('change',e=>{state.spottingLogFilterDate=e.target.value;localStorage.setItem('aero-spotting-log-filter-date',state.spottingLogFilterDate);render();});
  document.querySelector('#logFilterAirport')?.addEventListener('change',e=>{state.spottingLogFilterAirport=e.target.value;localStorage.setItem('aero-spotting-log-filter-airport',state.spottingLogFilterAirport);render();});
  document.querySelector('#logFilterAircraft')?.addEventListener('change',e=>{state.spottingLogFilterAircraft=e.target.value;localStorage.setItem('aero-spotting-log-filter-aircraft',state.spottingLogFilterAircraft);render();});
  document.querySelector('#logFilterLivery')?.addEventListener('change',e=>{state.spottingLogFilterLivery=e.target.checked?'1':'';localStorage.setItem('aero-spotting-log-filter-livery',state.spottingLogFilterLivery);render();});
  document.querySelector('#logFilterSearch')?.addEventListener('input',e=>{state.spottingLogFilterSearch=e.target.value;localStorage.setItem('aero-spotting-log-filter-search',state.spottingLogFilterSearch);render();});
  document.querySelector('#clearLogFilters')?.addEventListener('click',()=>{state.spottingLogFilterDate='';state.spottingLogFilterAirport='';state.spottingLogFilterAircraft='';state.spottingLogFilterLivery='';state.spottingLogFilterSearch='';['date','airport','aircraft','livery','search'].forEach(k=>localStorage.removeItem('aero-spotting-log-filter-'+k));render();});
  document.querySelector('#logSettings')?.addEventListener('click',e=>{e.stopPropagation();document.querySelector('#logSettingsMenu')?.classList.toggle('open');});
  document.querySelector('#logSettingsMenu')?.addEventListener('click',e=>e.stopPropagation());
  document.addEventListener('click',e=>{const menu=document.querySelector('#logSettingsMenu'),gear=document.querySelector('#logSettings');if(menu?.classList.contains('open')&&!menu.contains(e.target)&&!gear?.contains(e.target))menu.classList.remove('open');},{once:true});
  document.querySelector('#clearLog')?.addEventListener('click',()=>{if(window.confirm('Clear all spotting records, confirmations, and saved targets? This cannot be undone.')){state.spottingLog=[];state.spottingLogHistory=false;saveSpottingLog();localStorage.setItem('aero-spotting-log-history','0');render();}});
  document.querySelector('#exportAeroData')?.addEventListener('click',()=>{aeroExportData();document.querySelector('#logSettingsMenu')?.classList.remove('open');});
  document.querySelector('#importAeroData')?.addEventListener('click',()=>{document.querySelector('#importAeroFile')?.click();});
  document.querySelector('#importAeroFile')?.addEventListener('change',e=>{aeroImportData(e.target.files?.[0]);e.target.value='';document.querySelector('#logSettingsMenu')?.classList.remove('open');});
  document.querySelectorAll('[data-seen]').forEach(b=>b.onclick=e=>{e.stopPropagation();const key=b.dataset.seen;const f=state.flights.find(x=>recordKey(x)===key);if(f)markSeen(f);});
  document.querySelector('#closeModal')?.addEventListener('click',()=>{state.detailFlight=null;render();});
  document.querySelector('#modal')?.addEventListener('click',e=>{if(e.target.id==='modal'){state.detailFlight=null;render();}});
}
async function fetchDay(date,force=false){
  const key=`aero:${state.airport}:${date}:${state.showCodeshare}`;
  try{
    const cached=JSON.parse(localStorage.getItem(key)||'null');
    if(!force && cached?.savedAt){
      const flights=(cached.flights||[]).map(f=>{f={...f,__date:f.__date||date};
        const override=aircraftOverrideFor(state.airport,date,f.__direction,numberOf(f));
        if(!override) return f;
        return {
          ...f,
          aircraft:{...(f.aircraft||{}),model:override.model,reg:override.registration},
          registration:override.registration,
          __aircraftOverride:true,
          __aircraftOverrideSource:override.source
        };
      });
      flights.__fetchedAt=cached.fetchedAt||'';
      flights.__secondSource=cached.secondSource||null;
      return flights;
    }
  }catch{}
  const r=await fetch(`/api/flights?airport=${encodeURIComponent(state.airport)}&date=${encodeURIComponent(date)}&showCodeshare=${state.showCodeshare}`);
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||'Failed to load flights');
  const flights=[
    ...(data.departures||[]).map(f=>({...f,__direction:'dep',__date:date})),
    ...(data.arrivals||[]).map(f=>({...f,__direction:'arr',__date:date}))
  ].map(f=>{
    const override=aircraftOverrideFor(state.airport,date,f.__direction,numberOf(f));
    if(!override) return f;
    return {
      ...f,
      aircraft:{...(f.aircraft||{}),model:override.model,reg:override.registration},
      registration:override.registration,
      __aircraftOverride:true,
      __aircraftOverrideSource:override.source
    };
  });
  flights.__fetchedAt=data.fetchedAt||'';
  flights.__secondSource=data.secondSource||null;
  try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),flights, fetchedAt:data.fetchedAt||'',secondSource:data.secondSource||null}));}catch{}
  return flights;
}
async function loadRange(force=false){
  state.loading=true; state.error=''; render();
  const dates=[0,1,2].map(i=>dayLabel(i).iso);
  const results=await Promise.allSettled(dates.map(date=>fetchDay(date,force)));
  results.forEach((r,i)=>{
    if(r.status==='fulfilled'){
      state.dayFlights[dates[i]]=r.value;
      state.sourceMeta[dates[i]]={secondSource:r.value.__secondSource||null,fetchedAt:r.value.__fetchedAt||''};
    }
  });
  const failed=results.filter(r=>r.status==='rejected').length;
  state.flights=state.dayFlights[state.date]||[];
  if(failed===3) state.error='Unable to load flight data. Check API configuration.';
  else if(failed) state.error='Some dates could not be updated; showing available data.';
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
    if(!r.ok) throw new Error(data.error||'Failed to load weather');
    state.weather=data;
    try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));}catch{}
  }catch(e){state.weather=null;state.weatherError='Weather temporarily unavailable';}
  finally{state.weatherLoading=false;render();}
}
async function load(){
  state.loading=true; state.error=''; render();
  try{
    const flights=await fetchDay(state.date);
    state.dayFlights[state.date]=flights;
    state.flights=flights;
  }catch(e){
    state.error=e.message.includes('API')?e.message:'Unable to load flight data. Check API configuration.';
  }finally{state.loading=false;render();}
}
render(); loadRange(); loadWeather();