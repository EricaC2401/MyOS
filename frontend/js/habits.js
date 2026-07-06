// Habit Tracker — ported from daily-planner.html with API calls

const HABIT_COLOR_THEMES = {
  green:  {chip:'rgba(29,158,117,0.13)', chipB:'rgba(29,158,117,0.28)', chipT:'#0f6e56'},
  purple: {chip:'rgba(83,74,183,0.13)',  chipB:'rgba(83,74,183,0.28)',  chipT:'#3C3489'},
  blue:   {chip:'rgba(93,152,179,0.13)', chipB:'rgba(93,152,179,0.28)', chipT:'#1a5e78'},
  orange: {chip:'rgba(186,117,23,0.13)', chipB:'rgba(186,117,23,0.28)', chipT:'#7a4c0a'},
  pink:   {chip:'rgba(212,83,126,0.13)', chipB:'rgba(212,83,126,0.28)', chipT:'#993556'},
  olive:  {chip:'rgba(99,153,34,0.13)',  chipB:'rgba(99,153,34,0.28)',  chipT:'#3B6D11'},
  gray:   {chip:'rgba(136,135,128,0.13)',chipB:'rgba(136,135,128,0.28)',chipT:'#5F5E5A'},
  red:    {chip:'rgba(226,75,74,0.13)',  chipB:'rgba(226,75,74,0.28)',  chipT:'#b52d2c'},
};
const HABIT_ICON_OPTIONS = [
  'ti-heart','ti-star','ti-book','ti-run','ti-brain','ti-coin','ti-briefcase','ti-check',
  'ti-home','ti-music','ti-camera','ti-palette','ti-code','ti-plant','ti-coffee',
  'ti-sun','ti-moon','ti-trophy','ti-target','ti-flame','ti-bike','ti-yoga','ti-pill',
  'ti-pencil','ti-users','ti-phone','ti-car','ti-plane','ti-clock','ti-bulb',
];
const HABIT_DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const HABIT_MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const HABIT_FALLBACK_CAT = {icon:'ti-check', chip:'rgba(136,135,128,0.13)', chipB:'rgba(136,135,128,0.28)', chipT:'#5F5E5A'};
const DEFAULT_HABIT_TARGET = 5;

let habitItemsState = [];
let habitCategories = [];
let habitCategoryMap = {};
let habitEntriesMap = {};
let currentHabitView = 'table';
let habitEditMode = false;
let habitSchemaSupportsItemTypes = true;
let habitSchemaMigrationError = '';
let habitLoadError = '';
let habitCalendarMonthKey = '';
let draggingHabitItemId = '';

function habitFmtKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function habitTodayKey(){ return habitFmtKey(new Date()); }
function habitParseDateKey(key){ const [y,m,d]=String(key).split('-').map(Number); return new Date(y,(m||1)-1,d||1); }
function habitMonthDate(date){ return new Date(date.getFullYear(),date.getMonth(),1); }
function habitMonthKey(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function habitCurrentMonthKey(){ return habitMonthKey(new Date()); }
function parseHabitMonthKey(key){ const [y,m]=String(key).split('-').map(Number); return {year:y||new Date().getFullYear(),month:Math.min(Math.max((m||1)-1,0),11)}; }
function formatHabitMonthLabel(monthKey){ const {year,month}=parseHabitMonthKey(monthKey); return `${HABIT_MONTHS_SHORT[month]} ${year}`; }
function getHabitAvailableMonthKeys(){
  const currentMonthDate=habitMonthDate(new Date());
  let earliestMonthDate=currentMonthDate;
  for(const item of habitItemsState){
    if(item?.created_at){
      const createdAt=new Date(item.created_at);
      if(!Number.isNaN(createdAt.getTime())&&createdAt<earliestMonthDate) earliestMonthDate=habitMonthDate(createdAt);
    }
    const logs=habitEntriesMap[item.id]||{};
    Object.keys(logs).forEach(key=>{
      const loggedAt=habitParseDateKey(key);
      if(!Number.isNaN(loggedAt.getTime())&&loggedAt<earliestMonthDate) earliestMonthDate=habitMonthDate(loggedAt);
    });
  }
  const months=[];
  for(let cursor=new Date(earliestMonthDate);cursor<=currentMonthDate;cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1)){
    months.push(habitMonthKey(cursor));
  }
  return months;
}
function ensureHabitCalendarMonth(){
  const current=habitCurrentMonthKey();
  const months=getHabitAvailableMonthKeys();
  if(!habitCalendarMonthKey) habitCalendarMonthKey=current;
  if(!months.includes(habitCalendarMonthKey)) habitCalendarMonthKey=months.includes(current)?current:(months[months.length-1]||current);
}
function habitWeekKeys(){ const now=new Date(); const dow=now.getDay(); return Array.from({length:7},(_,i)=>{const d=new Date(now);d.setDate(now.getDate()-dow+i);return habitFmtKey(d);}); }
function habitRollingDayKeys(days){ const now=new Date(); return Array.from({length:days},(_,i)=>{const d=new Date(now);d.setDate(now.getDate()-(days-1-i));return habitFmtKey(d);}); }
function normalizeHabitTarget(v){ const p=Number(v); return Number.isInteger(p)&&p>0?p:DEFAULT_HABIT_TARGET; }
function normalizeHabitItem(item){ const type=item?.type==='tracking'?'tracking':'habit'; return {...item,description:item?.description||'',type,target:type==='habit'?normalizeHabitTarget(item?.target):null,tracking_days:type==='tracking'?(parseInt(item?.tracking_days,10)||7):null}; }
function buildHabitCategoryMap(){ habitCategoryMap={}; for(const c of habitCategories){ const t=HABIT_COLOR_THEMES[c.color_key]||HABIT_COLOR_THEMES.gray; habitCategoryMap[c.name]={icon:c.icon,...t}; } }
function getHabitItemsOnly(){ return habitItemsState.filter(i=>i.type==='habit'); }
function getHabitTrackingItems(){ return habitItemsState.filter(i=>i.type==='tracking'); }
function getHabitSectionItems(type){ return type==='tracking'?getHabitTrackingItems():getHabitItemsOnly(); }
function getHabitSectionIndex(itemId){
  const item=habitItemsState.find(entry=>entry.id===itemId);
  if(!item) return -1;
  return getHabitSectionItems(item.type).findIndex(entry=>entry.id===itemId);
}
function buildHabitReorderedState(type,orderedSectionIds){
  const sectionMap=new Map(getHabitSectionItems(type).map(item=>[item.id,item]));
  const reorderedSection=orderedSectionIds.map(id=>sectionMap.get(id)).filter(Boolean);
  const habits=type==='habit'?reorderedSection:getHabitItemsOnly();
  const tracking=type==='tracking'?reorderedSection:getHabitTrackingItems();
  return habits.concat(tracking).map((item,index)=>({ ...item, sort_order:index }));
}
async function saveHabitOrder(nextItems,previousItems){
  habitItemsState=nextItems;
  renderHabitsSection();
  try{
    await apiPut('/habits/reorder',{ordered_ids:nextItems.map(item=>item.id)});
  } catch(error){
    habitItemsState=previousItems;
    renderHabitsSection();
    throw error;
  }
}
async function reorderHabitToSectionPosition(itemId,nextIndex){
  if(busy)return;
  const item=habitItemsState.find(entry=>entry.id===itemId);
  if(!item)return;
  const sectionItems=getHabitSectionItems(item.type);
  const currentIndex=sectionItems.findIndex(entry=>entry.id===itemId);
  if(currentIndex===-1||nextIndex<0||nextIndex>=sectionItems.length||currentIndex===nextIndex)return;
  const orderedIds=sectionItems.map(entry=>entry.id);
  const [movedId]=orderedIds.splice(currentIndex,1);
  orderedIds.splice(nextIndex,0,movedId);
  const previousItems=habitItemsState;
  const nextItems=buildHabitReorderedState(item.type,orderedIds);
  setBusy(true);
  try{
    await saveHabitOrder(nextItems,previousItems);
  } catch(error){
    showToast(`Error reordering: ${error.message}`,true);
  } finally {
    setBusy(false);
  }
}

function getHabitStreak(habitId){
  const logs=habitEntriesMap[habitId]||{}; const today=new Date(); let streak=0;
  for(let o=0;o<400;o++){const d=new Date(today);d.setDate(today.getDate()-o);if(logs[habitFmtKey(d)])streak++;else if(o>0)break;}
  return streak;
}
function countHabitLogsForKeys(id,keys){ const logs=habitEntriesMap[id]||{}; return keys.reduce((s,k)=>s+(logs[k]?1:0),0); }
function countHabitLogsThisWeek(id){ const today=habitTodayKey(); return habitWeekKeys().filter(k=>k<=today).reduce((s,k)=>s+((habitEntriesMap[id]||{})[k]?1:0),0); }
function getHabitLastLoggedKey(id){ const logs=habitEntriesMap[id]||{}; const keys=Object.keys(logs).filter(k=>logs[k]).sort(); return keys.length?keys[keys.length-1]:''; }
function formatHabitLastLogged(id){ const k=getHabitLastLoggedKey(id); if(!k)return'Not logged yet'; if(k===habitTodayKey())return'Last logged today'; const d=habitParseDateKey(k); return`Last logged on ${HABIT_MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`; }
function getHabitWeeklyTargetSummary(item){ return`${countHabitLogsThisWeek(item.id)} / ${normalizeHabitTarget(item.target)} this week`; }
function getHabitTrackingSummary(item){ const days=item.tracking_days||7; const count=countHabitLogsForKeys(item.id,habitRollingDayKeys(days)); return`Logged ${count} time${count===1?'':'s'} in the last ${days} days`; }
function requiresHabitTypedSchema(){ return !habitSchemaSupportsItemTypes; }
function getHabitSchemaWarningHTML(){ if(!habitSchemaMigrationError)return''; return`<div class="habit-note"><strong>Database migration needed.</strong> ${esc(habitSchemaMigrationError)}</div>`; }

async function loadHabitData(){
  habitSchemaSupportsItemTypes=true; habitSchemaMigrationError=''; habitItemsState=[]; habitCategories=[]; habitEntriesMap={};
  try{
    const catData = await apiGet('/habit-categories');
    habitCategories = catData || [];
    buildHabitCategoryMap();
    const habitsData = await apiGet('/habits');
    habitItemsState = (habitsData||[]).map(h => {
      const normalized = normalizeHabitItem(h);
      habitEntriesMap[h.id] = {};
      (h.entries||[]).forEach(e => { habitEntriesMap[h.id][e.entry_date] = true; });
      return normalized;
    });
  } catch(error){ throw error; }
}

function renderHabitSummaryPills(){
  const habitsOnly=getHabitItemsOnly(); const today=habitTodayKey();
  const doneToday=habitsOnly.filter(i=>(habitEntriesMap[i.id]||{})[today]).length;
  const trackingCount=getHabitTrackingItems().length;
  const streakBest=habitsOnly.reduce((max,i)=>Math.max(max,getHabitStreak(i.id)),0);
  const el=document.getElementById('summary-pills');
  if(el) el.innerHTML=`<span class="spill info">${doneToday}/${habitsOnly.length} done today</span><span class="spill">${streakBest} best streak</span><span class="spill">${trackingCount} tracking log${trackingCount===1?'':'s'}</span>`;
}

function renderHabitsSection(){
  const notice=document.getElementById('habit-schema-notice');
  if(notice) notice.innerHTML=habitLoadError?`<div class="habit-note"><strong>Unable to load habit tracker.</strong> ${esc(habitLoadError)}</div>`:getHabitSchemaWarningHTML();
  renderHabitMonthControls();
  renderHabitMetrics();
  if(habitLoadError){ const el=document.getElementById('habit-main-view'); if(el)el.innerHTML='<div class="empty-state">Habit tracker data could not be loaded.</div>'; return; }
  if(currentHabitView==='table') renderHabitTable(); else renderHabitCalendar();
}

function renderHabitMonthControls(){
  const el=document.getElementById('habit-month-controls');
  if(!el)return;
  if(currentHabitView!=='calendar'){
    el.style.display='none';
    el.innerHTML='';
    return;
  }
  ensureHabitCalendarMonth();
  const monthKeys=getHabitAvailableMonthKeys();
  const currentIndex=monthKeys.indexOf(habitCalendarMonthKey);
  const options=monthKeys.slice().reverse().map(key=>`<option value="${key}"${key===habitCalendarMonthKey?' selected':''}>${esc(formatHabitMonthLabel(key))}</option>`).join('');
  el.style.display='flex';
  el.innerHTML=`<button class="habit-month-nav" type="button" aria-label="Previous month" onclick="stepHabitCalendarMonth(-1)" ${currentIndex<=0?'disabled':''}><i class="ti ti-chevron-left"></i></button><select id="habit-month-select" class="habit-month-select" aria-label="Select habit calendar month" onchange="setHabitCalendarMonth(this.value)">${options}</select><button class="habit-month-nav" type="button" aria-label="Next month" onclick="stepHabitCalendarMonth(1)" ${currentIndex>=monthKeys.length-1?'disabled':''}><i class="ti ti-chevron-right"></i></button>`;
}

function renderHabitMetrics(){
  const habitsOnly=getHabitItemsOnly(); const today=habitTodayKey();
  const done=habitsOnly.filter(i=>(habitEntriesMap[i.id]||{})[today]).length;
  const total=habitsOnly.length;
  const pct=total?Math.round((done/total)*100):0;
  const best=habitsOnly.reduce((max,i)=>Math.max(max,getHabitStreak(i.id)),0);
  const week=habitWeekKeys(); const weekPast=week.filter(k=>k<=today);
  const weekDone=weekPast.reduce((s,k)=>s+habitsOnly.filter(i=>(habitEntriesMap[i.id]||{})[k]).length,0);
  const weekMax=weekPast.length*total; const weekPct=weekMax?Math.round((weekDone/weekMax)*100):0;
  const progressSub=total?(done===total&&total>0?'All done!':'Keep going'):'No habits yet';
  const el=document.getElementById('habit-metrics-row');
  if(el) el.innerHTML=`
    <div class="mc"><div class="mc-label">Completed today</div><div class="mc-value">${done} / ${total}</div><div class="mc-sub">${total?`${pct}% of habits`:'No habits yet'}</div></div>
    <div class="mc"><div class="mc-label">Today's progress</div><div class="mc-value" style="color:${pct===100&&total>0?'#0f6e56':'#1a1f2e'}">${pct}%</div><div class="mc-sub">${progressSub}</div></div>
    <div class="mc"><div class="mc-label">Best streak</div><div class="mc-value">${best}</div><div class="mc-sub">days in a row</div></div>
    <div class="mc"><div class="mc-label">Weekly check-ins</div><div class="mc-value">${weekPct}%</div><div class="mc-sub">${weekMax?`${weekDone} of ${weekMax} habit check-ins`:'Tracking logs excluded'}</div></div>`;
}

function renderHabitTable(){
  const el=document.getElementById('habit-main-view'); if(!el)return;
  if(!habitItemsState.length){ el.innerHTML=`${getHabitSchemaWarningHTML()}<div class="empty-state"><i class="ti ti-target"></i><p>No items yet — click <strong>+ New item</strong> to add a habit or tracking log.</p></div>`; return; }
  el.innerHTML=`<div class="habit-section-stack">${renderHabitTableSection('Habits',getHabitItemsOnly(),false)}${renderHabitTableSection('Tracking logs',getHabitTrackingItems(),true)}</div>`;
}

function renderHabitTableSection(title,items,isTracking){
  if(!items.length) return`<div class="habit-section-block"><div class="habit-section-head"><div class="habit-section-title">${esc(title)}</div><div class="habit-section-count">0 items</div></div><div class="card"><div class="empty-state" style="padding:22px 18px">${title==='Habits'?'No habits yet.':'No tracking logs yet.'}</div></div></div>`;
  const today=habitTodayKey(); const week=habitWeekKeys();
  const reorderHint=habitEditMode?'<div class="habit-reorder-hint"><i class="ti ti-arrows-move"></i> Drag or use the arrows to reorder items.</div>':'';
  const thMove=habitEditMode?'<th></th>':''; const thDel=habitEditMode?'<th></th>':'';
  const rows=items.map(item=>{
    const cat=habitCategoryMap[item.category]||HABIT_FALLBACK_CAT;
    const logs=habitEntriesMap[item.id]||{}; const isDone=!!logs[today]; const streak=getHabitStreak(item.id);
    const summaryPrimary=isTracking?getHabitTrackingSummary(item):getHabitWeeklyTargetSummary(item);
    const summarySecondary=isTracking?formatHabitLastLogged(item.id):`${streak} day${streak===1?'':'s'} streak`;
    const dots=week.map((k,i)=>{const done=!!logs[k];const isT=k===today;const isF=k>today;let cls='habit-wd';if(done)cls+=' habit-wdd';if(isT)cls+=' habit-wdt';if(isF)cls+=' habit-wdf';const click=isF?'':`onclick="toggleHabitDay('${item.id}','${k}')"`;return`<div class="${cls}" ${click} title="${isF?HABIT_DOW[i]:(done?`${HABIT_DOW[i]} — ${isTracking?'remove log':'undo'}`:`${HABIT_DOW[i]} — ${isTracking?'log date':'mark done'}`)}"></div>`;}).join('');
    const chipStyle=`background:${cat.chip};border-color:${cat.chipB};color:${cat.chipT}`;
    const sectionIndex=items.findIndex(entry=>entry.id===item.id);
    const rowAttrs=habitEditMode?` class="habit-reorder-row${draggingHabitItemId===item.id?' is-dragging':''}" draggable="true" ondragstart="handleHabitReorderDragStart(event,'${item.id}')" ondragover="handleHabitReorderDragOver(event,'${item.id}')" ondrop="handleHabitReorderDrop(event,'${item.id}')" ondragend="handleHabitReorderDragEnd()"`:'';
    const moveCol=habitEditMode?`<td><div class="habit-move-col"><span class="habit-drag-handle" title="Drag to reorder"><i class="ti ti-grip-vertical"></i></span><button class="habit-move-btn" onclick="moveHabitItem('${item.id}',-1)" ${sectionIndex===0?'disabled':''} title="Move up"><i class="ti ti-chevron-up"></i></button><button class="habit-move-btn" onclick="moveHabitItem('${item.id}',1)" ${sectionIndex===items.length-1?'disabled':''} title="Move down"><i class="ti ti-chevron-down"></i></button></div></td>`:'';
    const delCol=habitEditMode?`<td><button class="habit-inline-edit-btn" onclick="deleteHabitItem('${item.id}')" title="Hide"><i class="ti ti-trash"></i></button></td>`:'';
    return`<tr${rowAttrs}>${moveCol}<td><div class="habit-item-meta"><div class="habit-item-name-row" style="font-weight:600;white-space:nowrap"><i class="ti ${cat.icon}" style="font-size:14px;color:${cat.chipT}"></i>${esc(item.name)}${habitEditMode?`<button class="habit-inline-edit-btn" onclick="openHabitEditModal('${item.id}')" title="Edit"><i class="ti ti-pencil"></i></button>`:''}</div></div></td><td>${esc(item.description||'—')}</td><td><button class="habit-done-btn${isDone?' is-done':''}" onclick="toggleHabitDay('${item.id}','${today}')">${isDone?`<i class="ti ti-arrow-back-up" style="font-size:11px"></i> Undo`:(isTracking?'Log today':'Done')}</button></td><td><div class="habit-week-col"><div class="habit-week-lbl-row">${HABIT_DOW.map(d=>`<div class="habit-wl">${d}</div>`).join('')}</div><div class="habit-week-dots">${dots}</div></div></td><td><div class="habit-item-summary"><strong>${esc(summaryPrimary)}</strong><span>${esc(summarySecondary)}</span></div></td><td><span class="chip" style="${chipStyle}">${esc(item.category||'Uncategorised')}</span></td>${delCol}</tr>`;
  }).join('');
  return`<div class="habit-section-block"><div class="habit-section-head"><div><div class="habit-section-title">${esc(title)}</div>${reorderHint}</div><div class="habit-section-count">${items.length} item${items.length===1?'':'s'}</div></div><div class="card"><div class="tbl-wrap"><table class="dt"><thead><tr>${thMove}<th>Item</th><th>Description</th><th>Today</th><th>Current week</th><th>Summary</th><th>Category</th>${thDel}</tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
}

function renderHabitCalendar(){
  const el=document.getElementById('habit-main-view'); if(!el)return;
  if(!habitItemsState.length){ el.innerHTML=`${getHabitSchemaWarningHTML()}<div class="empty-state"><i class="ti ti-target"></i><p>No items yet — click <strong>+ New item</strong> to add a habit or tracking log.</p></div>`; return; }
  ensureHabitCalendarMonth();
  const {year,month}=parseHabitMonthKey(habitCalendarMonthKey);
  const daysInMonth=new Date(year,month+1,0).getDate(); const firstDow=new Date(year,month,1).getDay(); const today=habitTodayKey();
  el.innerHTML=`<div class="habit-section-stack">${renderHabitCalendarSection('Habits',getHabitItemsOnly(),false,year,month,daysInMonth,firstDow,today)}${renderHabitCalendarSection('Tracking logs',getHabitTrackingItems(),true,year,month,daysInMonth,firstDow,today)}</div>`;
}

function renderHabitCalendarSection(title,items,isTracking,year,month,daysInMonth,firstDow,today){
  if(!items.length) return`<div class="habit-section-block"><div class="habit-section-head"><div class="habit-section-title">${esc(title)}</div><div class="habit-section-count">0 items</div></div><div class="card"><div class="empty-state" style="padding:22px 18px">${title==='Habits'?'No habits yet.':'No tracking logs yet.'}</div></div></div>`;
  const reorderHint=habitEditMode?'<div class="habit-reorder-hint"><i class="ti ti-arrows-move"></i> Drag or use the arrows to reorder items.</div>':'';
  const cards=items.map(item=>{
    const cat=habitCategoryMap[item.category]||HABIT_FALLBACK_CAT;
    const logs=habitEntriesMap[item.id]||{}; const streak=getHabitStreak(item.id); const isDone=!!logs[today];
    const chipStyle=`background:${cat.chip};border-color:${cat.chipB};color:${cat.chipT}`;
    let cells='';
    for(let i=0;i<firstDow;i++) cells+='<div class="habit-cd habit-cde"></div>';
    for(let day=1;day<=daysInMonth;day++){
      const k=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const done=!!logs[k]; const isT=k===today; const isF=k>today;
      let cls='habit-cd'; if(done)cls+=isTracking?' habit-cdd-tracking':' habit-cdd'; if(isT)cls+=' habit-cdt'; if(isF)cls+=' habit-cdf';
      const click=isF?'':`onclick="toggleHabitDay('${item.id}','${k}')"`;
      cells+=`<div class="${cls}" ${click} title="${isF?'':(done?(isTracking?'Remove log':'Undo'):(isTracking?'Log date':'Mark done'))}">${day}</div>`;
    }
    const sectionIndex=items.findIndex(entry=>entry.id===item.id);
    const cardAttrs=habitEditMode?` draggable="true" ondragstart="handleHabitReorderDragStart(event,'${item.id}')" ondragover="handleHabitReorderDragOver(event,'${item.id}')" ondrop="handleHabitReorderDrop(event,'${item.id}')" ondragend="handleHabitReorderDragEnd()"`:'';
    return`<div class="habit-card${habitEditMode?' habit-reorder-card':''}${draggingHabitItemId===item.id?' is-dragging':''}"${cardAttrs}><div class="habit-card-hdr"><div class="habit-card-title">${habitEditMode?'<span class="habit-drag-handle" title="Drag to reorder"><i class="ti ti-grip-vertical"></i></span>':''}<i class="ti ${cat.icon}" style="color:${cat.chipT}"></i>${esc(item.name)}${habitEditMode?`<button class="habit-inline-edit-btn" onclick="openHabitEditModal('${item.id}')" title="Edit"><i class="ti ti-pencil"></i></button>`:''}</div><button class="habit-done-btn${isDone?' is-done':''}" onclick="toggleHabitDay('${item.id}','${today}')">${isDone?`<i class="ti ti-arrow-back-up" style="font-size:11px"></i> Undo`:(isTracking?'Log today':'Done')}</button></div><div class="habit-cal-lbl">${HABIT_MONTHS_SHORT[month]} ${year} &middot; <span class="chip" style="${chipStyle};font-size:10px;padding:1px 7px">${esc(item.category||'Uncategorised')}</span></div><div class="habit-cal-dow-row">${HABIT_DOW.map(d=>`<div class="habit-cal-dow">${d}</div>`).join('')}</div><div class="habit-cal-grid">${cells}</div><div class="habit-card-streak">${isTracking?`<span class="tracking-ico"><i class="ti ti-clock"></i></span><strong>${esc(getHabitTrackingSummary(item))}</strong> ${esc(formatHabitLastLogged(item.id))}`:`<span style="color:#E24B4A">&#x1f525;</span><strong>${esc(getHabitWeeklyTargetSummary(item))}</strong> ${streak} day${streak===1?'':'s'} streak`}${habitEditMode?`<div class="habit-card-edit-bar"><button class="habit-move-btn" onclick="moveHabitItem('${item.id}',-1)" ${sectionIndex===0?'disabled':''} title="Move up"><i class="ti ti-chevron-up"></i></button><button class="habit-move-btn" onclick="moveHabitItem('${item.id}',1)" ${sectionIndex===items.length-1?'disabled':''} title="Move down"><i class="ti ti-chevron-down"></i></button><button class="habit-inline-edit-btn" onclick="deleteHabitItem('${item.id}')" title="Hide"><i class="ti ti-trash"></i></button></div>`:''}</div></div>`;
  }).join('');
  return`<div class="habit-section-block"><div class="habit-section-head"><div><div class="habit-section-title">${esc(title)}</div>${reorderHint}</div><div class="habit-section-count">${items.length} item${items.length===1?'':'s'}</div></div><div class="habit-cal-grid-wrap">${cards}</div></div>`;
}

async function toggleHabitDay(id,key){
  const today=habitTodayKey(); if(key>today||busy)return;
  const logs=habitEntriesMap[id]; if(!logs)return;
  setBusy(true);
  try{
    if(logs[key]){ await apiDelete('/habits/'+id+'/entries/'+key); delete logs[key]; }
    else { await apiPost('/habits/'+id+'/entries',{entry_date:key}); logs[key]=true; }
    renderHabitsSection(); renderSummaryPills();
  } catch(e){ showToast(`Error: ${e.message}`,true); }
  finally { setBusy(false); }
}

async function createHabitItem({name,description,category,type,target,tracking_days}){
  const payload={name,description,category,type,target:type==='habit'?normalizeHabitTarget(target):null,tracking_days:type==='tracking'?(parseInt(tracking_days,10)||7):null,is_active:true,sort_order:habitItemsState.length};
  const data=await apiPost('/habits',payload);
  habitItemsState.push(normalizeHabitItem(data));
  habitEntriesMap[data.id]={};
}

async function saveHabitEdit(id,values){
  const updates={name:values.name,description:values.description,category:values.category,type:values.type,target:values.type==='habit'?normalizeHabitTarget(values.target):null,tracking_days:values.type==='tracking'?(parseInt(values.tracking_days,10)||7):null};
  await apiPut('/habits/'+id,updates);
  const item=habitItemsState.find(e=>e.id===id);
  if(item) Object.assign(item,normalizeHabitItem({...item,...updates}));
}

async function deleteHabitItem(id){
  const item=habitItemsState.find(e=>e.id===id); if(!item)return;
  if(!confirm(`Hide this ${item.type==='tracking'?'tracking log':'habit'}? Historical records will be preserved.`))return;
  try{
    await apiDelete('/habits/'+id);
    habitItemsState=habitItemsState.filter(e=>e.id!==id);
    delete habitEntriesMap[id];
    renderHabitsSection(); renderSummaryPills();
    showToast(item.type==='tracking'?'Tracking log hidden':'Habit hidden');
  } catch(e){ showToast(`Error: ${e.message}`,true); }
}

async function moveHabitItem(id,direction){
  const sectionIndex=getHabitSectionIndex(id);
  if(sectionIndex===-1)return;
  await reorderHabitToSectionPosition(id,sectionIndex+direction);
}

function handleHabitReorderDragStart(event,itemId){
  if(!habitEditMode)return;
  draggingHabitItemId=itemId;
  if(event.dataTransfer){
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',itemId);
  }
  event.currentTarget?.classList.add('is-dragging');
}

function handleHabitReorderDragOver(event,targetId){
  if(!habitEditMode)return;
  const sourceId=draggingHabitItemId||(event.dataTransfer?event.dataTransfer.getData('text/plain'):'');
  if(!sourceId||sourceId===targetId)return;
  const source=habitItemsState.find(item=>item.id===sourceId);
  const target=habitItemsState.find(item=>item.id===targetId);
  if(!source||!target||source.type!==target.type)return;
  event.preventDefault();
  if(event.dataTransfer) event.dataTransfer.dropEffect='move';
}

async function handleHabitReorderDrop(event,targetId){
  if(!habitEditMode)return;
  event.preventDefault();
  const sourceId=draggingHabitItemId||(event.dataTransfer?event.dataTransfer.getData('text/plain'):'');
  if(!sourceId||sourceId===targetId)return;
  const targetIndex=getHabitSectionIndex(targetId);
  if(targetIndex===-1)return;
  draggingHabitItemId='';
  await reorderHabitToSectionPosition(sourceId,targetIndex);
}

function handleHabitReorderDragEnd(){
  if(!draggingHabitItemId)return;
  document.querySelectorAll('.habit-reorder-row.is-dragging, .habit-reorder-card.is-dragging').forEach(node=>node.classList.remove('is-dragging'));
  draggingHabitItemId='';
}

function switchHabitView(view,button){
  currentHabitView=view;
  document.querySelectorAll('#habit-topbar-tools .habit-view-toggle .seg-btn').forEach(n=>n.classList.remove('active'));
  button.classList.add('active');
  renderHabitsSection(); renderSummaryPills();
}

function setHabitCalendarMonth(monthKey){
  habitCalendarMonthKey=monthKey;
  renderHabitsSection();
}

function stepHabitCalendarMonth(direction){
  const monthKeys=getHabitAvailableMonthKeys();
  const currentIndex=monthKeys.indexOf(habitCalendarMonthKey);
  if(currentIndex===-1)return;
  const nextIndex=currentIndex+direction;
  if(nextIndex<0||nextIndex>=monthKeys.length)return;
  habitCalendarMonthKey=monthKeys[nextIndex];
  renderHabitsSection();
}

function toggleHabitEditMode(){
  habitEditMode=!habitEditMode;
  if(typeof updateTopbarForSection==='function') updateTopbarForSection();
  renderHabitsSection();
}

function habitCategoryOptions(selected){
  return['<option value="">— none —</option>'].concat(habitCategories.map(c=>`<option value="${esc(c.name)}"${c.name===selected?' selected':''}>${esc(c.name)}</option>`)).join('');
}

function habitTypeOptions(selected){
  return`<option value="habit"${selected==='habit'?' selected':''}>Habit</option><option value="tracking"${selected==='tracking'?' selected':''}>Tracking log</option>`;
}

function syncHabitTypeFields(){
  const typeEl=document.getElementById('habit-m-type');
  const group=document.getElementById('habit-m-target-group');
  const input=document.getElementById('habit-m-target');
  const tdGroup=document.getElementById('habit-m-tracking-days-group');
  if(!typeEl||!group||!input)return;
  const isTracking=typeEl.value==='tracking';
  group.style.display=isTracking?'none':'';
  input.disabled=isTracking;
  if(tdGroup) tdGroup.style.display=isTracking?'':'none';
  if(isTracking) input.value='';
  else if(!input.value) input.value=String(DEFAULT_HABIT_TARGET);
}

function openHabitEditModal(id){
  const item=habitItemsState.find(e=>e.id===id); if(!item)return;
  const html=`
    <div class="habit-form-group"><label>Type</label><select id="habit-m-type" onchange="syncHabitTypeFields()">${habitTypeOptions(item.type)}</select></div>
    <div class="habit-form-group"><label>Name</label><input id="habit-m-name" type="text" value="${esc(item.name)}" maxlength="50" autocomplete="off"></div>
    <div class="habit-form-group"><label>Description <span style="text-transform:none;letter-spacing:0;font-weight:400">(optional)</span></label><input id="habit-m-desc" type="text" value="${esc(item.description||'')}" maxlength="100" autocomplete="off"></div>
    <div class="habit-form-group" id="habit-m-target-group"><label>Weekly target</label><input id="habit-m-target" type="number" min="1" step="1" value="${item.type==='habit'?normalizeHabitTarget(item.target):''}" ${item.type==='tracking'?'disabled':''}></div>
    <div class="habit-form-group" id="habit-m-tracking-days-group" style="${item.type==='tracking'?'':'display:none'}"><label>Tracking period (days)</label><input id="habit-m-tracking-days" type="number" min="1" max="365" step="1" value="${item.tracking_days||7}" placeholder="7"></div>
    <div class="habit-form-group" style="margin-bottom:0"><label>Category</label><select id="habit-m-cat">${habitCategoryOptions(item.category)}</select></div>`;
  configureModal('Edit item',html,'Save',()=>saveHabitEditModal(id));
  setTimeout(()=>{syncHabitTypeFields();document.getElementById('habit-m-name')?.focus();},60);
}

async function saveHabitEditModal(id){
  const name=(document.getElementById('habit-m-name').value||'').trim();
  if(!name){document.getElementById('habit-m-name').focus();return;}
  const type=document.getElementById('habit-m-type').value==='tracking'?'tracking':'habit';
  const targetValue=document.getElementById('habit-m-target').value;
  if(type==='habit'&&(!targetValue||Number(targetValue)<1)){document.getElementById('habit-m-target').focus();return;}
  const button=document.getElementById('modal-save-btn'); button.disabled=true;
  try{
    await saveHabitEdit(id,{name,description:(document.getElementById('habit-m-desc').value||'').trim(),category:document.getElementById('habit-m-cat').value,type,target:targetValue,tracking_days:type==='tracking'?(document.getElementById('habit-m-tracking-days').value||7):null});
    closeModal(); renderHabitsSection(); renderSummaryPills();
    showToast(type==='tracking'?'Tracking log updated':'Habit updated');
  } catch(e){ showToast(`Error: ${e.message}`,true); }
  finally { button.disabled=false; }
}

function openHabitCategoryModal(editId){
  const editing=editId?habitCategories.find(c=>c.id===editId):null;
  const list=habitCategories.map(c=>{
    const t=HABIT_COLOR_THEMES[c.color_key]||HABIT_COLOR_THEMES.gray;
    const style=`background:${t.chip};border-color:${t.chipB};color:${t.chipT}`;
    return`<div class="habit-cat-item"><i class="ti ${c.icon}" style="font-size:14px;color:${t.chipT}"></i><span class="habit-cat-name">${esc(c.name)}</span><span class="chip" style="${style};font-size:10px;padding:1px 7px">${esc(c.color_key)}</span><div class="habit-cat-item-actions"><button class="habit-inline-edit-btn" onclick="openHabitCategoryModal('${c.id}')" title="Edit"><i class="ti ti-pencil"></i></button><button class="habit-inline-edit-btn" onclick="deleteHabitCategory('${c.id}')" title="Delete"><i class="ti ti-trash"></i></button></div></div>`;
  }).join('');
  const selectedIcon=editing?editing.icon:'ti-check'; const selectedColor=editing?editing.color_key:'green';
  const iconGrid=HABIT_ICON_OPTIONS.map(icon=>`<div class="habit-icon-opt${icon===selectedIcon?' sel':''}" onclick="pickHabitCategoryIcon('${icon}')" title="${icon.replace('ti-','')}"><i class="ti ${icon}"></i></div>`).join('');
  const colorRow=Object.entries(HABIT_COLOR_THEMES).map(([key,theme])=>`<div class="habit-color-opt${key===selectedColor?' sel':''}" style="background:${theme.chipT}" onclick="pickHabitCategoryColor('${key}')" title="${key}"></div>`).join('');
  const html=`<div class="habit-cat-list">${list||'<p style="color:#8492a6;font-size:12px;text-align:center;padding:12px">No categories yet</p>'}</div><div style="border-top:1px solid #e8ecf4;padding-top:14px"><div style="font-size:11px;font-weight:600;color:#5a6478;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em">${editing?'Edit category':'Add category'}</div><div class="habit-form-group"><label>Name</label><input id="habit-cat-name" type="text" value="${editing?esc(editing.name):''}" maxlength="30" placeholder="e.g. Wellness" autocomplete="off"></div><div class="habit-form-group"><label>Icon</label><div class="habit-icon-grid" id="habit-icon-grid">${iconGrid}</div><input type="hidden" id="habit-cat-icon" value="${selectedIcon}"></div><div class="habit-form-group" style="margin-bottom:0"><label>Color</label><div class="habit-color-row" id="habit-color-row">${colorRow}</div><input type="hidden" id="habit-cat-color" value="${selectedColor}"></div></div>`;
  configureModal('Manage categories',html,editing?'Update':'Add',editing?()=>saveHabitCategoryEdit(editing.id):saveHabitCategoryAdd,true);
}

function pickHabitCategoryIcon(icon){ document.getElementById('habit-cat-icon').value=icon; document.querySelectorAll('#habit-icon-grid .habit-icon-opt').forEach(n=>{n.classList.toggle('sel',n.querySelector('i').classList.contains(icon));}); }
function pickHabitCategoryColor(color){ document.getElementById('habit-cat-color').value=color; document.querySelectorAll('#habit-color-row .habit-color-opt').forEach(n=>{n.classList.toggle('sel',n.getAttribute('title')===color);}); }

async function saveHabitCategoryAdd(){
  const name=(document.getElementById('habit-cat-name').value||'').trim();
  if(!name){document.getElementById('habit-cat-name').focus();return;}
  const payload={name,icon:document.getElementById('habit-cat-icon').value,color_key:document.getElementById('habit-cat-color').value,sort_order:habitCategories.length+1};
  try{
    const data=await apiPost('/habit-categories',payload);
    habitCategories.push(data); buildHabitCategoryMap();
    openHabitCategoryModal(); showToast('Category added');
  } catch(e){ showToast(`Error: ${e.message}`,true); }
}

async function saveHabitCategoryEdit(id){
  const name=(document.getElementById('habit-cat-name').value||'').trim();
  if(!name){document.getElementById('habit-cat-name').focus();return;}
  const category=habitCategories.find(e=>e.id===id);
  const oldName=category?category.name:'';
  const updates={name,icon:document.getElementById('habit-cat-icon').value,color_key:document.getElementById('habit-cat-color').value};
  try{
    await apiPut('/habit-categories/'+id,updates);
    if(category) Object.assign(category,updates);
    buildHabitCategoryMap();
    if(oldName&&oldName!==name){
      for(const item of habitItemsState){
        if(item.category===oldName){ await apiPut('/habits/'+item.id,{category:name}); item.category=name; }
      }
    }
    openHabitCategoryModal(); renderHabitsSection(); showToast('Category updated');
  } catch(e){ showToast(`Error: ${e.message}`,true); }
}

async function deleteHabitCategory(id){
  const category=habitCategories.find(e=>e.id===id); if(!category)return;
  const inUse=habitItemsState.filter(i=>i.category===category.name).length;
  const message=inUse?`"${category.name}" is used by ${inUse} item(s). They will be moved to the first available category. Delete?`:`Delete category "${category.name}"?`;
  if(!confirm(message))return;
  try{
    await apiDelete('/habit-categories/'+id);
    habitCategories=habitCategories.filter(e=>e.id!==id); buildHabitCategoryMap();
    if(inUse){
      const fallback=habitCategories.length?habitCategories[0].name:'Other';
      for(const item of habitItemsState){
        if(item.category===category.name){ await apiPut('/habits/'+item.id,{category:fallback}); item.category=fallback; }
      }
    }
    openHabitCategoryModal(); renderHabitsSection(); showToast('Category deleted');
  } catch(e){ showToast(`Error: ${e.message}`,true); }
}
