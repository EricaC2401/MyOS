// Planner: goals, tasks, events, daily schedule, tag management, modals
// Ported from daily-planner.html — all Supabase calls replaced with backend API calls.

// ─── Constants ─────────────────────────────────────

const COLOR_OPTIONS = [
  { value:'chip-amber', label:'Amber' },
  { value:'chip-purple', label:'Purple' },
  { value:'chip-teal', label:'Teal' },
  { value:'chip-coral', label:'Coral' },
  { value:'chip-green', label:'Green' },
  { value:'chip-blue', label:'Blue' },
  { value:'chip-rose', label:'Rose' },
  { value:'chip-gray', label:'Gray' },
];

const DEFAULT_TAG_CONFIG = {
  areas: [
    { label:'Finance', color:'chip-amber' },
    { label:'Career & Skills', color:'chip-purple' },
    { label:'Home Ownership', color:'chip-teal' },
    { label:'Relationships & Love', color:'chip-coral' },
    { label:'Health', color:'chip-green' },
    { label:'Personal', color:'chip-gray' },
  ],
  taskCategories: [
    { label:'Personal', color:'chip-teal' },
    { label:'REF/ROI', color:'chip-amber' },
    { label:'Work', color:'chip-purple' },
  ],
  eventCategories: [
    { label:'Friends', color:'chip-purple' },
    { label:'Family', color:'chip-rose' },
    { label:'Work', color:'chip-blue' },
    { label:'Social', color:'chip-green' },
  ],
};

const BLOCKED_TAG_LABELS = new Set(['taxpayment']);

// ─── State ─────────────────────────────────────────

let AREAS = [];
let CATS = [];
let EVENT_CATS = [];
let AREA_CHIP = {};
let CAT_CHIP = {};
let EVENT_CAT_CHIP = {};
let tagConfig = null;

let autoTime = true;
let currentSection = 'schedule';
let currentTab = 'todos';
let todoTab = 'pending';
let goalTab = 'pending';
let eventTab = 'pending';
let busy = false;
let modalType = '';
let modalSaveHandler = null;
let plannerLoadError = '';
const plannerSortState = {
  goals: { field: 'priority', dir: 'desc' },
  todos: { field: 'priority', dir: 'desc' },
  events: { field: 'event_date', dir: 'asc' },
};
const plannerFilters = {
  goals: { search: '', area: '' },
  todos: { search: '', category: '', area: '' },
  events: { search: '', category: '' },
};
let scheduleKeyboardBound = false;

const state = {
  goals: [],
  tasks: [],
  events: [],
  currentPlanId: null,
  currentDateItems: [],
  carryoverTaskItems: [],
  selectedDateManuallySet: false,
};

// ─── Utility functions ─────────────────────────────

function formatLocalDateKey(date = new Date()){
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

const todayStr = () => formatLocalDateKey();

function esc(s){return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function fmtFull(s){if(!s)return'';const d=new Date(`${s}T00:00:00`);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function isOverdue(s){return !!s && s < todayStr();}
function daysUntil(s){if(!s)return null;return Math.round((new Date(`${s}T00:00:00`)-new Date(`${todayStr()}T00:00:00`))/(864e5));}
function ordinal(n){const mod10=n%10,mod100=n%100;if(mod10===1&&mod100!==11)return`${n}st`;if(mod10===2&&mod100!==12)return`${n}nd`;if(mod10===3&&mod100!==13)return`${n}rd`;return`${n}th`;}
function weekdayLabel(index){const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];return days[index] || '';}
function recurrenceSummary(task){
  const recurrence = task?.recurrence;
  if(!recurrence?.repeat_unit) return '';
  if(recurrence.repeat_unit === 'weekly') return recurrence.weekday == null ? 'Weekly' : `Weekly • ${weekdayLabel(recurrence.weekday)}`;
  if(recurrence.repeat_unit === 'monthly') return recurrence.day_of_month == null ? 'Monthly' : `Monthly • ${ordinal(recurrence.day_of_month)}`;
  return '';
}
function areaChip(g){if(!g)return'';return`<span class="chip ${AREA_CHIP[g]||'chip-gray'}">${esc(g)}</span>`;}
function catChip(c){if(!c)return'';return`<span class="chip ${CAT_CHIP[c]||'chip-gray'}">${esc(c)}</span>`;}
function areaChipClass(g){return AREA_CHIP[g] || 'chip-gray';}
function catChipClass(c){return CAT_CHIP[c] || 'chip-gray';}
function eventCatChipClass(c){return EVENT_CAT_CHIP[c] || 'chip-gray';}

const icoT=on=>`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${on?'#0F6E56':'#c0c8d8'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const icoI=on=>`<svg width="10" height="10" viewBox="0 0 24 24" fill="${on?'#BA7517':'none'}" stroke="${on?'#BA7517':'#c0c8d8'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="13"/><circle cx="12" cy="17" r="1.5"/></svg>`;
const icoU=on=>`<svg width="10" height="10" viewBox="0 0 24 24" fill="${on?'#D85A30':'none'}" stroke="${on?'#D85A30':'#c0c8d8'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
const icoStar=on=>`<svg width="11" height="11" viewBox="0 0 24 24" fill="${on?'#EF9F27':'none'}" stroke="${on?'#EF9F27':'#c0c8d8'}" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;

function showToast(msg, isError){
  const el = document.getElementById('toast');
  if(!el) return;
  el.textContent = msg;
  el.style.background = isError ? '#E24B4A' : '#1a1f2e';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function hidePlannerInsertDebug(){
  const el = document.getElementById('debug-panel');
  if(el) el.classList.remove('open');
}

function validateDailyPlanPayload(payload){
  const isTask = payload.item_type === 'task' && payload.task_id != null && payload.event_id == null;
  const isEvent = payload.item_type === 'event' && payload.event_id != null && payload.task_id == null;
  const isSchedule = payload.item_type === 'schedule_entry' && payload.task_id == null && payload.event_id == null;
  return isTask || isEvent || isSchedule;
}

function showPlannerInsertDebug(context, payload, error){
  const debugError = {
    message: error?.message || String(error),
    details: error?.details || null,
    hint: error?.hint || null,
    code: error?.code || null,
    payloadValidAgainstAppRule: validateDailyPlanPayload(payload),
  };
  console.error('daily_plan_items insert failed', { context, payload, error: debugError });
  const debugPanel = document.getElementById('debug-panel');
  const debugContext = document.getElementById('debug-context');
  const debugPayload = document.getElementById('debug-payload');
  const debugErrorEl = document.getElementById('debug-error');
  if(debugContext) debugContext.value = context;
  if(debugPayload) debugPayload.textContent = JSON.stringify(payload, null, 2);
  if(debugErrorEl) debugErrorEl.textContent = JSON.stringify(debugError, null, 2);
  if(debugPanel) debugPanel.classList.add('open');
  showToast('Planner insert failed. Debug panel opened.', true);
}

// ─── Tag config ────────────────────────────────────

function cloneDefaultTagConfig(){
  return JSON.parse(JSON.stringify(DEFAULT_TAG_CONFIG));
}

function normalizeTagGroup(group, fallbackGroup){
  const normalized = [];
  const seen = new Set();
  for(const entry of (group || [])){
    const label = String(entry?.label || '').trim();
    if(!label || BLOCKED_TAG_LABELS.has(label.toLowerCase()) || seen.has(label)) continue;
    seen.add(label);
    normalized.push({
      label,
      color: COLOR_OPTIONS.some(option => option.value === entry?.color) ? entry.color : 'chip-gray',
    });
  }
  if(normalized.length) return normalized;
  return fallbackGroup.map(entry => ({ ...entry }));
}

async function loadTagConfig(){
  try{
    const raw = await apiGet('/planner/tags');
    const normalized = {
      areas: normalizeTagGroup(raw.areas, DEFAULT_TAG_CONFIG.areas),
      taskCategories: normalizeTagGroup(raw.task_categories || raw.taskCategories, DEFAULT_TAG_CONFIG.taskCategories),
      eventCategories: normalizeTagGroup(raw.event_categories || raw.eventCategories, DEFAULT_TAG_CONFIG.eventCategories),
    };
    return normalized;
  } catch(err) {
    console.warn('Could not load tag config from API, using defaults:', err);
    return cloneDefaultTagConfig();
  }
}

function applyTagConfig(){
  AREAS = tagConfig.areas.map(entry => entry.label);
  CATS = tagConfig.taskCategories.map(entry => entry.label);
  EVENT_CATS = tagConfig.eventCategories.map(entry => entry.label);
  AREA_CHIP = Object.fromEntries(tagConfig.areas.map(entry => [entry.label, entry.color]));
  CAT_CHIP = Object.fromEntries(tagConfig.taskCategories.map(entry => [entry.label, entry.color]));
  EVENT_CAT_CHIP = Object.fromEntries(tagConfig.eventCategories.map(entry => [entry.label, entry.color]));
}

// ─── Navigation / UI ───────────────────────────────

function setBusy(nextBusy){
  busy = nextBusy;
}

function getSelectedDate(){
  const el = document.getElementById('sched-date');
  return el ? (el.value || todayStr()) : todayStr();
}

function setSelectedDate(dateKey){
  const el = document.getElementById('sched-date');
  if(el) el.value = dateKey;
}

function parseDateKey(dateKey){
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function syncCurrentDateIndicators(){
  const now = new Date();
  const dowEl = document.getElementById('sb-dow');
  const dateEl = document.getElementById('sb-date');
  if(dowEl) dowEl.textContent = now.toLocaleDateString('en-GB',{weekday:'long'});
  if(dateEl) dateEl.textContent = now.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
}

function syncScheduleDateIfNeeded(force = false){
  const today = todayStr();
  if(force || !state.selectedDateManuallySet){
    setSelectedDate(today);
  }
}

function handleScheduleDateChange(){
  state.selectedDateManuallySet = getSelectedDate() !== todayStr();
  loadSchedule();
  renderSelectedDateEvents();
}

function shiftScheduleDate(days){
  const nextDate = parseDateKey(getSelectedDate());
  nextDate.setDate(nextDate.getDate() + days);
  setSelectedDate(formatLocalDateKey(nextDate));
  handleScheduleDateChange();
}

function getGoalById(id){
  return state.goals.find(goal => goal.id === id) || null;
}

function getCurrentTaskItem(taskId){
  return state.currentDateItems.find(item => item.item_type === 'task' && item.task_id === taskId && ['planned','done'].includes(item.status)) || null;
}

function getCarryoverTaskItem(taskId){
  return state.carryoverTaskItems.find(item => item.task_id === taskId) || null;
}

function getMovableTaskSourceItem(taskId, sourceItemId = null){
  if(sourceItemId){
    const exactItem = state.currentDateItems.find(item =>
      item.id === sourceItemId && item.item_type === 'task' && item.task_id === taskId && ['planned', 'done'].includes(item.status)
    );
    if(exactItem){
      return {
        ...exactItem,
        source_plan_date: getSelectedDate(),
        is_carryover: false,
      };
    }
  }

  const currentItem = state.currentDateItems.find(item =>
    item.item_type === 'task' && item.task_id === taskId && ['planned', 'done'].includes(item.status)
  );
  if(currentItem){
    return {
      ...currentItem,
      source_plan_date: getSelectedDate(),
      is_carryover: false,
    };
  }
  const carryoverItem = getCarryoverTaskItem(taskId);
  if(carryoverItem?.status === 'planned'){
    return carryoverItem;
  }
  return null;
}

function getTaskView(task){
  const dayItem = getCurrentTaskItem(task.id) || getCarryoverTaskItem(task.id);
  return {
    ...task,
    today: !!dayItem?.is_today_focus,
    important: !!dayItem?.is_important,
    urgent: !!dayItem?.is_urgent,
    highlight: !!dayItem?.is_highlight,
    dayItem,
    recurrenceSummary: recurrenceSummary(task),
  };
}

function renderTaskTitle(task){
  const summary = task.recurrenceSummary || recurrenceSummary(task);
  const recurrenceMeta = summary
    ? `<div class="mu" style="font-size:10.5px;margin-top:2px;display:flex;align-items:center;gap:4px"><i class="ti ti-repeat" style="font-size:11px"></i>${esc(summary)}</div>`
    : '';
  return `<div>${esc(task.title)}${recurrenceMeta}</div>`;
}

function syncTaskRecurrenceFields(){
  const repeatEl = document.getElementById('m-td-repeat');
  const weekdayGroup = document.getElementById('m-td-weekday-group');
  const monthDayGroup = document.getElementById('m-td-monthday-group');
  const startLabel = document.getElementById('m-td-date-label');
  const repeatValue = repeatEl?.value || 'none';
  if(weekdayGroup) weekdayGroup.style.display = repeatValue === 'weekly' ? '' : 'none';
  if(monthDayGroup) monthDayGroup.style.display = repeatValue === 'monthly' ? '' : 'none';
  if(startLabel) startLabel.textContent = repeatValue === 'none' ? 'Deadline' : 'Start date';
}

function syncInlineTaskRecurrenceFields(){
  const repeatEl = document.getElementById('td-repeat');
  const weekdayEl = document.getElementById('td-weekday');
  const monthdayEl = document.getElementById('td-monthday');
  const repeatValue = repeatEl?.value || 'none';
  if(weekdayEl) weekdayEl.style.display = repeatValue === 'weekly' ? '' : 'none';
  if(monthdayEl) monthdayEl.style.display = repeatValue === 'monthly' ? '' : 'none';
}

function normalizeSearch(value){
  return String(value || '').trim().toLowerCase();
}

function updatePlannerFilter(group, field, value){
  if(!plannerFilters[group]) return;
  plannerFilters[group][field] = value || '';
  if(group === 'goals') renderGoals();
  else if(group === 'todos') renderTodos();
  else if(group === 'events') renderEvents();
}

function resetPlannerFilter(group){
  if(!plannerFilters[group]) return;
  Object.keys(plannerFilters[group]).forEach(key => { plannerFilters[group][key] = ''; });
  const mappings = {
    goals: ['goal-search', 'goal-area-filter'],
    todos: ['td-search', 'td-filter', 'td-area-filter'],
    events: ['ev-search', 'ev-cat-filter'],
  };
  (mappings[group] || []).forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  if(group === 'goals') renderGoals();
  else if(group === 'todos') renderTodos();
  else if(group === 'events') renderEvents();
}

function compareValues(a, b, dir = 'asc'){
  const aEmpty = a == null || a === '';
  const bEmpty = b == null || b === '';
  if(aEmpty && bEmpty) return 0;
  if(aEmpty) return 1;
  if(bEmpty) return -1;
  let result = 0;
  if(typeof a === 'number' && typeof b === 'number') result = a - b;
  else result = String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
  return dir === 'asc' ? result : -result;
}

function togglePlannerSort(group, field){
  const current = plannerSortState[group] || { field, dir: 'asc' };
  plannerSortState[group] = {
    field,
    dir: current.field === field && current.dir === 'asc' ? 'desc' : 'asc',
  };
  updateSortableHeaders();
  if(group === 'goals') renderGoals();
  else if(group === 'todos') renderTodos();
  else if(group === 'events') renderEvents();
}

function updateSortableHeaders(){
  document.querySelectorAll('[data-sort-group][data-sort-field]').forEach(el => {
    const group = el.getAttribute('data-sort-group');
    const field = el.getAttribute('data-sort-field');
    const label = el.getAttribute('data-sort-label') || el.textContent.trim();
    const iconMarkup = el.getAttribute('data-sort-icon');
    const sort = plannerSortState[group];
    const indicator = sort?.field === field ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
    el.innerHTML = iconMarkup ? `${iconMarkup}${indicator}` : `${esc(label)}${indicator}`;
    el.classList.toggle('active-sort', sort?.field === field);
  });
}

function sortGoalsList(goals){
  const sort = plannerSortState.goals;
  const withPriority = [...goals];
  if(sort.field === 'priority'){
    return withPriority.sort((a,b) => {
      const score = g => (g.is_urgent ? 4 : 0) + (g.is_important ? 2 : 0);
      const result = compareValues(score(a), score(b), sort.dir);
      if(result) return result;
      return compareValues(a.target_completion_date || '9999-12-31', b.target_completion_date || '9999-12-31', 'asc');
    });
  }
  return withPriority.sort((a,b) => {
    const aValue = sort.field === 'title' ? a.title
      : sort.field === 'area' ? a.area
      : sort.field === 'target_completion_date' ? a.target_completion_date
      : sort.field === 'created_at' ? a.created_at
      : sort.field === 'important' ? Number(!!a.is_important)
      : sort.field === 'urgent' ? Number(!!a.is_urgent)
      : null;
    const bValue = sort.field === 'title' ? b.title
      : sort.field === 'area' ? b.area
      : sort.field === 'target_completion_date' ? b.target_completion_date
      : sort.field === 'created_at' ? b.created_at
      : sort.field === 'important' ? Number(!!b.is_important)
      : sort.field === 'urgent' ? Number(!!b.is_urgent)
      : null;
    return compareValues(aValue, bValue, sort.dir);
  });
}

function sortTodoList(tasks){
  const sort = plannerSortState.todos;
  const withViews = tasks.map(getTaskView);
  if(sort.field === 'priority'){
    return withViews.sort((a,b) => {
      const score = task => (task.urgent ? 4 : 0) + (task.important ? 2 : 0) + (task.today ? 1 : 0);
      const result = compareValues(score(a), score(b), sort.dir);
      if(result) return result;
      return compareValues(a.deadline || '9999-12-31', b.deadline || '9999-12-31', 'asc');
    });
  }
  return withViews.sort((a,b) => {
    const aValue = sort.field === 'category' ? a.category
      : sort.field === 'title' ? a.title
      : sort.field === 'today' ? Number(!!a.today)
      : sort.field === 'important' ? Number(!!a.important)
      : sort.field === 'urgent' ? Number(!!a.urgent)
      : sort.field === 'goal' ? (getGoalById(a.goal_id)?.title || '')
      : sort.field === 'area' ? a.area
      : sort.field === 'deadline' ? a.deadline
      : sort.field === 'created_at' ? a.created_at
      : sort.field === 'completed_at' ? a.completed_at
      : null;
    const bValue = sort.field === 'category' ? b.category
      : sort.field === 'title' ? b.title
      : sort.field === 'today' ? Number(!!b.today)
      : sort.field === 'important' ? Number(!!b.important)
      : sort.field === 'urgent' ? Number(!!b.urgent)
      : sort.field === 'goal' ? (getGoalById(b.goal_id)?.title || '')
      : sort.field === 'area' ? b.area
      : sort.field === 'deadline' ? b.deadline
      : sort.field === 'created_at' ? b.created_at
      : sort.field === 'completed_at' ? b.completed_at
      : null;
    return compareValues(aValue, bValue, sort.dir);
  });
}

function sortEventList(events){
  const sort = plannerSortState.events;
  return [...events].sort((a,b) => {
    const aValue = sort.field === 'title' ? a.title
      : sort.field === 'event_date' ? a.event_date
      : sort.field === 'event_time' ? a.event_time
      : sort.field === 'venue' ? a.venue
      : sort.field === 'category' ? a.category
      : null;
    const bValue = sort.field === 'title' ? b.title
      : sort.field === 'event_date' ? b.event_date
      : sort.field === 'event_time' ? b.event_time
      : sort.field === 'venue' ? b.venue
      : sort.field === 'category' ? b.category
      : null;
    const result = compareValues(aValue, bValue, sort.dir);
    if(result) return result;
    return compareValues(a.title, b.title, 'asc');
  });
}

function renderStaticOptions(){
  const areaOptions = ['<option value="">— Area —</option>'].concat(AREAS.map(area => `<option>${esc(area)}</option>`)).join('');
  const ctGoalEl = document.getElementById('ct-goal');
  if(ctGoalEl) ctGoalEl.innerHTML = areaOptions;
  const goalAreaFilterEl = document.getElementById('goal-area-filter');
  if(goalAreaFilterEl) goalAreaFilterEl.innerHTML = '<option value="">All areas</option>' + AREAS.map(area => `<option value="${esc(area)}">${esc(area)}</option>`).join('');
  const tdCatEl = document.getElementById('td-cat');
  if(tdCatEl) tdCatEl.innerHTML = CATS.map(cat => `<option>${esc(cat)}</option>`).join('');
  const tdFilterEl = document.getElementById('td-filter');
  if(tdFilterEl) tdFilterEl.innerHTML = '<option value="">All categories</option>' + CATS.map(cat => `<option>${esc(cat)}</option>`).join('');
  const tdAreaFilterEl = document.getElementById('td-area-filter');
  if(tdAreaFilterEl) tdAreaFilterEl.innerHTML = '<option value="">All areas</option>' + AREAS.map(area => `<option value="${esc(area)}">${esc(area)}</option>`).join('');
  const evCatFilterEl = document.getElementById('ev-cat-filter');
  if(evCatFilterEl) evCatFilterEl.innerHTML = '<option value="">All categories</option>' + EVENT_CATS.map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('');
  syncInlineTaskRecurrenceFields();
}

async function initShell(){
  tagConfig = await loadTagConfig();
  applyTagConfig();
  syncCurrentDateIndicators();
  syncScheduleDateIfNeeded(true);
  renderStaticOptions();
}

// ─── Data loading ──────────────────────────────────

async function loadDataAndRender(){
  const schemaNotice = document.getElementById('schema-notice');
  const summaryPills = document.getElementById('summary-pills');
  const goalsTbody = document.getElementById('goals-tbody');
  const todosPendingTbody = document.getElementById('todos-pending-tbody');
  const todosDoneTbody = document.getElementById('todos-done-tbody');
  const eventsTbody = document.getElementById('events-tbody');
  const schedGrid = document.getElementById('sched-grid');

  if(schemaNotice) schemaNotice.innerHTML = '';
  if(summaryPills) summaryPills.innerHTML = '';
  if(goalsTbody) goalsTbody.innerHTML = '';
  if(todosPendingTbody) todosPendingTbody.innerHTML = '';
  if(todosDoneTbody) todosDoneTbody.innerHTML = '';
  if(eventsTbody) eventsTbody.innerHTML = '';
  if(schedGrid) schedGrid.innerHTML = '<div class="loading-screen"><div class="spinner"></div><span>Loading planner...</span></div>';

  try{
    plannerLoadError = '';

    try{
      const [goals, tasks, events] = await Promise.all([
        apiGet('/goals'),
        apiGet('/tasks'),
        apiGet('/events'),
      ]);

      state.goals = goals || [];
      state.tasks = tasks || [];
      state.events = events || [];
      await loadCurrentDateItems();
    } catch (error){
      plannerLoadError = error.message;
      state.goals = [];
      state.tasks = [];
      state.events = [];
      state.currentDateItems = [];
      state.carryoverTaskItems = [];
      state.currentPlanId = null;
      if(schemaNotice) schemaNotice.innerHTML = `<div class="notice"><strong>Unable to load planner data.</strong> ${esc(error.message)}.</div>`;
      if(schedGrid) schedGrid.innerHTML = '<div class="empty-state">Planner data could not be loaded.</div>';
    }

    try{
      if(typeof loadHabitData === 'function') await loadHabitData();
    } catch (error){
      console.warn('Habit data load error:', error);
    }

    renderAll();
    if(plannerLoadError){
      showToast('Planner data loaded with warnings', true);
    }
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function loadCurrentDateItems(){
  const selectedDate = getSelectedDate();
  try{
    const data = await apiGet('/daily-plans/' + selectedDate);
    state.currentPlanId = data.plan ? data.plan.id : null;
    state.currentDateItems = data.items || [];
  } catch(err){
    state.currentPlanId = null;
    state.currentDateItems = [];
  }

  await loadCarryoverTaskItems(selectedDate);
}

async function loadCarryoverTaskItems(selectedDate){
  if(selectedDate !== todayStr()){
    state.carryoverTaskItems = [];
    return;
  }

  try{
    state.carryoverTaskItems = await apiGet('/daily-plans/' + selectedDate + '/carryover-tasks');
  } catch(err){
    state.carryoverTaskItems = [];
  }
}

async function ensureDailyPlan(dateKey){
  const data = await apiPost('/daily-plans/' + dateKey);
  state.currentPlanId = data.id;
  return data;
}

// ─── Render all ────────────────────────────────────

function renderAll(){
  updateSortableHeaders();
  renderSummaryPills();
  renderGoals();
  renderTodos();
  renderEvents();
  renderSelectedDateEvents();
  renderTodayTodos();
  renderSched(getSelectedDate());
  if(typeof renderHabitsSection === 'function') renderHabitsSection();
  updateTopbarForSection();
}

function renderSummaryPills(){
  if(currentSection === 'habits'){
    if(typeof renderHabitSummaryPills === 'function') renderHabitSummaryPills();
    return;
  }
  const pending = state.tasks.filter(task => !task.is_done && task.is_active).length;
  const overdue = state.tasks.filter(task => !task.is_done && task.is_active && isOverdue(task.deadline)).length;
  const upcoming = state.events.filter(event => !event.is_done && !event.is_cancelled && event.is_active && event.event_date >= todayStr()).length;
  let html = '';
  if(overdue) html += `<span class="spill alert">${overdue} overdue</span>`;
  html += `<span class="spill info">${pending} pending</span>`;
  html += `<span class="spill">${upcoming} upcoming</span>`;
  const el = document.getElementById('summary-pills');
  if(el) el.innerHTML = html;
}

// ─── Section navigation ────────────────────────────

function showSection(id, btn){
  document.querySelectorAll('#sb-mode-planner .nav').forEach(node => node.classList.remove('active'));
  if(btn) btn.classList.add('active');
  currentSection = id;
  const secSchedule = document.getElementById('sec-schedule');
  const secTasks = document.getElementById('sec-tasks');
  const secHabits = document.getElementById('sec-habits');
  if(secSchedule) secSchedule.classList.toggle('active', id === 'schedule');
  if(secTasks) secTasks.classList.toggle('active', id === 'tasks');
  if(secHabits) secHabits.classList.toggle('active', id === 'habits');
  syncCurrentDateIndicators();
  if(id === 'schedule'){
    syncScheduleDateIfNeeded();
    loadSchedule();
    renderSelectedDateEvents();
  }
  updateTopbarForSection();
  renderSummaryPills();
}

function switchTab(tab, btn){
  currentTab = tab;
  document.querySelectorAll('#tab-bar-tasks .tab').forEach(node => node.classList.remove('active'));
  btn.classList.add('active');
  ['goals','todos','events'].forEach(view => {
    const el = document.getElementById(`view-${view}`);
    if(el) el.classList.toggle('active', view === tab);
  });
  const labels = { goals:'+ Add goal', todos:'+ Add to-do', events:'+ Add event' };
  const addBtn = document.getElementById('topbar-add-btn');
  if(addBtn) addBtn.textContent = labels[tab] || '+ Add';
  updateTopbarForSection();
}

function topbarAdd(){
  if(currentSection === 'habits'){
    if(typeof openModal === 'function') openModal('habit');
  } else if(currentTab === 'goals') openModal('coretask');
  else if(currentTab === 'todos') openModal('todo');
  else openModal('event');
}

function switchTodoTab(tab, btn){
  todoTab = tab;
  document.querySelectorAll('#view-todos .seg-btn').forEach(node => node.classList.remove('active'));
  btn.classList.add('active');
  const cardPending = document.getElementById('card-pending');
  const cardDone = document.getElementById('card-done');
  const cardCancelled = document.getElementById('card-cancelled');
  if(cardPending) cardPending.style.display = tab === 'pending' ? '' : 'none';
  if(cardDone) cardDone.style.display = tab === 'done' ? '' : 'none';
  if(cardCancelled) cardCancelled.style.display = tab === 'cancelled' ? '' : 'none';
}

function switchGoalTab(tab, btn){
  goalTab = tab;
  document.querySelectorAll('#view-goals .seg-btn').forEach(node => node.classList.remove('active'));
  btn.classList.add('active');
  const pendingCard = document.getElementById('goals-pending-card');
  const doneCard = document.getElementById('goals-done-card');
  const cancelledCard = document.getElementById('goals-cancelled-card');
  const addRow = document.getElementById('goals-add-row');
  if(pendingCard) pendingCard.style.display = tab === 'pending' ? '' : 'none';
  if(doneCard) doneCard.style.display = tab === 'done' ? '' : 'none';
  if(cancelledCard) cancelledCard.style.display = tab === 'cancelled' ? '' : 'none';
  if(addRow) addRow.style.display = tab === 'pending' ? '' : 'none';
}

function switchEventTab(tab, btn){
  eventTab = tab;
  document.querySelectorAll('#view-events .seg-btn').forEach(node => node.classList.remove('active'));
  btn.classList.add('active');
  const pendingCard = document.getElementById('events-pending-card');
  const doneCard = document.getElementById('events-done-card');
  const cancelledCard = document.getElementById('events-cancelled-card');
  const addRow = document.getElementById('events-add-row');
  if(pendingCard) pendingCard.style.display = tab === 'pending' ? '' : 'none';
  if(doneCard) doneCard.style.display = tab === 'done' ? '' : 'none';
  if(cancelledCard) cancelledCard.style.display = tab === 'cancelled' ? '' : 'none';
  if(addRow) addRow.style.display = tab === 'pending' ? '' : 'none';
}

// ─── Goals CRUD ────────────────────────────────────

function renderGoals(){
  const search = normalizeSearch(plannerFilters.goals.search);
  const areaFilter = plannerFilters.goals.area;
  const matchesGoalFilter = goal => {
    if(areaFilter && goal.area !== areaFilter) return false;
    if(search && ![goal.title, goal.area].some(value => normalizeSearch(value).includes(search))) return false;
    return true;
  };
  const pendingGoals = sortGoalsList(state.goals.filter(goal => !goal.is_done && !goal.is_cancelled && matchesGoalFilter(goal)));
  const doneGoals = sortGoalsList(state.goals.filter(goal => goal.is_done && !goal.is_cancelled && matchesGoalFilter(goal)));
  const cancelledGoals = sortGoalsList(state.goals.filter(goal => goal.is_cancelled && matchesGoalFilter(goal)));

  const ctActive = document.getElementById('ct-active');
  const ctDone = document.getElementById('ct-done');
  const ctCancelled = document.getElementById('ct-cancelled');
  const ctTotal = document.getElementById('ct-total');
  if(ctActive) ctActive.textContent = pendingGoals.length;
  if(ctDone) ctDone.textContent = doneGoals.length;
  if(ctCancelled) ctCancelled.textContent = cancelledGoals.length;
  if(ctTotal) ctTotal.textContent = state.goals.length;

  const renderGoalRows = goals => goals.map(goal => `
    <tr class="${goal.is_urgent || goal.is_important ? 'hl-row' : ''}">
      <td class="c"><div class="cb ${goal.is_done ? 'checked' : ''}" onclick="toggleGoal('${goal.id}')"></div></td>
      <td><input class="ec" value="${esc(goal.title)}" onchange="editGoal('${goal.id}','title',this.value)" /></td>
      <td class="c"><div class="flag f-imp ${goal.is_important ? 'on' : ''}" onclick="toggleGoalFlag('${goal.id}','important')">${icoI(goal.is_important)}</div></td>
      <td class="c"><div class="flag f-urg ${goal.is_urgent ? 'on' : ''}" onclick="toggleGoalFlag('${goal.id}','urgent')">${icoU(goal.is_urgent)}</div></td>
      <td><select class="isel chip-select ${areaChipClass(goal.area)}" onchange="editGoal('${goal.id}','area',this.value)">
        <option value="">—</option>${AREAS.map(area => `<option value="${esc(area)}"${goal.area === area ? ' selected' : ''}>${esc(area)}</option>`).join('')}
      </select></td>
      <td><input class="ec mu" type="date" value="${goal.target_completion_date || ''}" onchange="editGoal('${goal.id}','target_completion_date',this.value)" style="width:120px" /></td>
      <td class="mu" style="font-size:11px">${fmtFull(goal.created_at?.slice(0,10))}</td>
      <td class="c"><button class="del-btn" onclick="deleteGoal('${goal.id}')">×</button></td>
      <td class="c"><div class="cb ${goal.is_cancelled ? 'checked' : ''}" onclick="toggleGoalCancelled('${goal.id}')"></div></td>
    </tr>
  `).join('');

  const goalsTbody = document.getElementById('goals-tbody');
  const goalsDoneTbody = document.getElementById('goals-done-tbody');
  const goalsCancelledTbody = document.getElementById('goals-cancelled-tbody');
  if(goalsTbody) goalsTbody.innerHTML = pendingGoals.length ? renderGoalRows(pendingGoals) : '<tr><td colspan="9"><div class="empty-state">No pending goals.</div></td></tr>';
  if(goalsDoneTbody) goalsDoneTbody.innerHTML = doneGoals.length ? renderGoalRows(doneGoals) : '<tr><td colspan="9"><div class="empty-state">No completed goals.</div></td></tr>';
  if(goalsCancelledTbody) goalsCancelledTbody.innerHTML = cancelledGoals.length ? renderGoalRows(cancelledGoals) : '<tr><td colspan="9"><div class="empty-state">No cancelled goals.</div></td></tr>';
}

async function addCoreTask(){
  const titleEl = document.getElementById('ct-name');
  const title = titleEl ? titleEl.value.trim() : '';
  if(!title) return;
  const area = document.getElementById('ct-goal')?.value || null;
  const targetCompletionDate = document.getElementById('ct-target-date')?.value || null;
  try{
    const sortOrder = state.goals.length;
    const data = await apiPost('/goals', {
      title,
      area: area || null,
      target_completion_date: targetCompletionDate,
      is_important: false,
      is_urgent: false,
      sort_order: sortOrder,
      is_done: false,
      is_cancelled: false,
      is_active: true,
    });
    state.goals.push(data);
    if(titleEl) titleEl.value = '';
    const ctGoal = document.getElementById('ct-goal');
    if(ctGoal) ctGoal.value = '';
    const ctTarget = document.getElementById('ct-target-date');
    if(ctTarget) ctTarget.value = '';
    renderGoals();
    showToast('Goal added');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function editGoal(goalId, field, value){
  const updates = { updated_at: new Date().toISOString() };
  updates[field] = value || null;
  if(field === 'title') updates[field] = value.trim();
  try{
    await apiPut('/goals/' + goalId, updates);
    const goal = getGoalById(goalId);
    if(goal) goal[field] = updates[field];
    renderGoals();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function toggleGoal(goalId){
  const goal = getGoalById(goalId);
  if(!goal) return;
  const nextValue = !goal.is_done;
  try{
    await apiPut('/goals/' + goalId, { is_done: nextValue, is_cancelled: false, updated_at: new Date().toISOString() });
    goal.is_done = nextValue;
    goal.is_cancelled = false;
    renderGoals();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function toggleGoalCancelled(goalId){
  const goal = getGoalById(goalId);
  if(!goal) return;
  const nextValue = !goal.is_cancelled;
  try{
    await apiPut('/goals/' + goalId, { is_cancelled: nextValue, is_done: nextValue ? false : goal.is_done, updated_at: new Date().toISOString() });
    goal.is_cancelled = nextValue;
    if(nextValue) goal.is_done = false;
    renderGoals();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function toggleGoalFlag(goalId, flag){
  const goal = getGoalById(goalId);
  if(!goal) return;
  const fieldMap = { important: 'is_important', urgent: 'is_urgent' };
  const field = fieldMap[flag];
  if(!field) return;
  const nextValue = !goal[field];
  try{
    await apiPut('/goals/' + goalId, { [field]: nextValue, updated_at: new Date().toISOString() });
    goal[field] = nextValue;
    renderGoals();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function deleteGoal(goalId){
  try{
    await apiDelete('/goals/' + goalId);
    state.goals = state.goals.filter(goal => goal.id !== goalId);
    renderGoals();
    renderTodos();
    showToast('Goal deleted');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

// ─── Tasks CRUD ────────────────────────────────────

function renderTodos(){
  const search = normalizeSearch(plannerFilters.todos.search);
  const filter = plannerFilters.todos.category;
  const areaFilter = plannerFilters.todos.area;
  let pending = state.tasks.filter(task => !task.is_done && !task.is_cancelled);
  let done = state.tasks.filter(task => task.is_done && !task.is_cancelled);
  let cancelled = state.tasks.filter(task => task.is_cancelled);
  const matchesTaskFilter = task => {
    if(filter && task.category !== filter) return false;
    if(areaFilter && task.area !== areaFilter) return false;
    if(search){
      const goalTitle = getGoalById(task.goal_id)?.title || '';
      if(![task.title, task.category, task.area, goalTitle].some(value => normalizeSearch(value).includes(search))) return false;
    }
    return true;
  };
  pending = pending.filter(matchesTaskFilter);
  done = done.filter(matchesTaskFilter);
  cancelled = cancelled.filter(matchesTaskFilter);

  pending = sortTodoList(pending);
  done = sortTodoList(done);
  cancelled = sortTodoList(cancelled);

  const tdPending = document.getElementById('td-pending');
  const tdDone = document.getElementById('td-done');
  const tdOverdue = document.getElementById('td-overdue');
  const tdTotal = document.getElementById('td-total');
  if(tdPending) tdPending.textContent = state.tasks.filter(task => !task.is_done && !task.is_cancelled).length;
  if(tdDone) tdDone.textContent = state.tasks.filter(task => task.is_done && !task.is_cancelled).length;
  if(tdOverdue) tdOverdue.textContent = state.tasks.filter(task => !task.is_done && !task.is_cancelled && isOverdue(task.deadline)).length;
  if(tdTotal) tdTotal.textContent = state.tasks.length;

  const goalOptions = ['<option value="">—</option>'].concat(
    state.goals.filter(goal => !goal.is_done).map(goal => `<option value="${goal.id}">${esc(goal.title)}</option>`)
  ).join('');

  const pendingBody = document.getElementById('todos-pending-tbody');
  if(pendingBody){
    if(!pending.length){
      pendingBody.innerHTML = '<tr><td colspan="13"><div class="empty-state">Nothing pending.</div></td></tr>';
    } else {
      pendingBody.innerHTML = pending.map(task => {
        const due = daysUntil(task.deadline);
        let deadlineLabel = '';
        let deadlineClass = 'mu';
        if(due === 0){deadlineLabel = 'Today'; deadlineClass = 'ov';}
        else if(due === 1) deadlineLabel = 'Tomorrow';
        else if(due !== null && due < 0){deadlineLabel = `${Math.abs(due)}d overdue`; deadlineClass = 'ov';}
        else if(task.deadline) deadlineLabel = fmtFull(task.deadline);
        const highlighted = task.urgent || task.important;
        const goal = getGoalById(task.goal_id);
        const canMove = !!task.dayItem && task.dayItem.status === 'planned';
        return `
          <tr class="${highlighted ? 'hl-row' : ''}${task.highlight ? ' hl-bg' : ''}">
            <td class="c"><div class="cb" onclick="toggleTodo('${task.id}')"></div></td>
            <td><select class="isel chip-select ${catChipClass(task.category)}" onchange="editTask('${task.id}','category',this.value)">${CATS.map(cat => `<option value="${esc(cat)}"${task.category === cat ? ' selected' : ''}>${esc(cat)}</option>`).join('')}</select></td>
            <td style="min-width:140px">
              <div style="display:flex;flex-direction:column;gap:4px">
                <input class="ec" style="${highlighted ? 'font-weight:600' : ''}" value="${esc(task.title)}" onchange="editTask('${task.id}','title',this.value)" />
                ${task.recurrenceSummary ? `<span class="mu" style="font-size:10.5px;display:flex;align-items:center;gap:4px"><i class="ti ti-repeat" style="font-size:11px"></i>${esc(task.recurrenceSummary)}</span>` : ''}
              </div>
            </td>
            <td class="c"><div class="flag f-today ${task.today ? 'on' : ''}" onclick="toggleFlag('${task.id}','today')">${icoT(task.today)}</div></td>
            <td class="c"><div class="flag f-imp ${task.important ? 'on' : ''}" onclick="toggleFlag('${task.id}','important')">${icoI(task.important)}</div></td>
            <td class="c"><div class="flag f-urg ${task.urgent ? 'on' : ''}" onclick="toggleFlag('${task.id}','urgent')">${icoU(task.urgent)}</div></td>
            <td><select class="isel" style="max-width:115px" onchange="editTaskGoal('${task.id}',this.value)">${goalOptions.replace(`value="${task.goal_id || ''}"`, `value="${task.goal_id || ''}" selected`)}</select></td>
            <td><select class="isel chip-select ${areaChipClass(task.area)}" onchange="editTask('${task.id}','area',this.value)">
              <option value="">—</option>${AREAS.map(area => `<option value="${esc(area)}"${task.area === area ? ' selected' : ''}>${esc(area)}</option>`).join('')}
            </select></td>
            <td class="${deadlineClass}"><input class="ec mu" type="date" value="${task.deadline || ''}" onchange="editTask('${task.id}','deadline',this.value)" /></td>
            <td>${canMove ? `<button class="btn-ghost" onclick="openMoveTaskModal('${task.id}')">Move</button>` : '<span class="mu">—</span>'}</td>
            <td class="mu" style="font-size:11px">${fmtFull(task.created_at?.slice(0,10))}</td>
            <td class="c"><button class="del-btn" onclick="deleteTask('${task.id}')">×</button></td>
            <td class="c"><div class="cb ${task.is_cancelled ? 'checked' : ''}" onclick="toggleTaskCancelled('${task.id}')"></div></td>
          </tr>
        `;
      }).join('');
    }
  }

  const doneBody = document.getElementById('todos-done-tbody');
  if(doneBody){
    if(!done.length){
      doneBody.innerHTML = '<tr><td colspan="9"><div class="empty-state">Nothing completed yet.</div></td></tr>';
    } else {
      doneBody.innerHTML = done.map(task => `
        <tr>
          <td class="c"><div class="cb checked" onclick="toggleTodo('${task.id}')"></div></td>
          <td>${catChip(task.category)}</td>
          <td>${renderTaskTitle(task)}</td>
          <td>${areaChip(task.area)}</td>
          <td class="mu" style="font-size:11.5px">${fmtFull(task.deadline)}</td>
          <td class="mu" style="font-size:11px">${fmtFull(task.created_at?.slice(0,10))}</td>
          <td class="mu" style="font-size:11px">${fmtFull(task.completed_at)}</td>
          <td class="c"><button class="del-btn" onclick="deleteTask('${task.id}')">×</button></td>
          <td class="c"><div class="cb ${task.is_cancelled ? 'checked' : ''}" onclick="toggleTaskCancelled('${task.id}')"></div></td>
        </tr>
      `).join('');
    }
  }

  const cancelledBody = document.getElementById('todos-cancelled-tbody');
  if(cancelledBody){
    if(!cancelled.length){
      cancelledBody.innerHTML = '<tr><td colspan="8"><div class="empty-state">Nothing cancelled.</div></td></tr>';
    } else {
      cancelledBody.innerHTML = cancelled.map(task => `
        <tr>
          <td class="c"><div class="cb ${task.is_done ? 'checked' : ''}" onclick="toggleTodo('${task.id}')"></div></td>
          <td>${catChip(task.category)}</td>
          <td>${renderTaskTitle(task)}</td>
          <td>${areaChip(task.area)}</td>
          <td class="mu" style="font-size:11.5px">${fmtFull(task.deadline)}</td>
          <td class="mu" style="font-size:11px">${fmtFull(task.created_at?.slice(0,10))}</td>
          <td class="c"><button class="del-btn" onclick="deleteTask('${task.id}')">×</button></td>
          <td class="c"><div class="cb checked" onclick="toggleTaskCancelled('${task.id}')"></div></td>
        </tr>
      `).join('');
    }
  }

  renderSummaryPills();
  if(currentSection === 'schedule') renderTodayTodos();
}

async function addTodo(){
  const titleEl = document.getElementById('td-name');
  const title = titleEl ? titleEl.value.trim() : '';
  if(!title) return;
  const repeat = document.getElementById('td-repeat')?.value || 'none';
  const deadlineValue = document.getElementById('td-deadline')?.value || null;
  const recurrence = repeat === 'none' ? null : {
    repeat_unit: repeat,
    repeat_every: 1,
    weekday: repeat === 'weekly' ? Number(document.getElementById('td-weekday')?.value || 0) : null,
    day_of_month: repeat === 'monthly' ? Number(document.getElementById('td-monthday')?.value || 1) : null,
    start_date: deadlineValue,
    is_active: true,
  };
  try{
    const data = await apiPost('/tasks', {
      title,
      category: document.getElementById('td-cat')?.value || null,
      area: null,
      goal_id: null,
      deadline: deadlineValue,
      recurrence,
      is_done: false,
      is_cancelled: false,
      is_active: true,
    });
    state.tasks.push(data);
    if(titleEl) titleEl.value = '';
    const deadlineEl = document.getElementById('td-deadline');
    if(deadlineEl) deadlineEl.value = '';
    const repeatEl = document.getElementById('td-repeat');
    if(repeatEl) repeatEl.value = 'none';
    syncInlineTaskRecurrenceFields();
    renderTodos();
    showToast('Task added');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function editTask(taskId, field, value){
  const task = state.tasks.find(item => item.id === taskId);
  if(!task) return;
  const updates = { updated_at: new Date().toISOString() };
  if(field === 'title') updates.title = value.trim();
  else updates[field] = value || null;
  try{
    await apiPut('/tasks/' + taskId, updates);
    Object.assign(task, updates);
    renderTodos();
    renderTodayTodos();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function editTaskGoal(taskId, goalId){
  await editTask(taskId, 'goal_id', goalId);
}

async function editTaskDeadlineText(taskId, value){
  let iso = '';
  if(value){
    const asIso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    if(asIso) iso = asIso;
    else {
      const parsed = new Date(`${value} 2000`);
      if(!Number.isNaN(parsed.getTime())) iso = parsed.toISOString().slice(0,10);
    }
  }
  await editTask(taskId, 'deadline', iso);
}

async function toggleTodo(taskId, options = {}){
  const task = state.tasks.find(item => item.id === taskId);
  if(!task) return;
  const nextDone = !task.is_done;
  const preserveFocus = !!options.preserveFocus;
  try{
    const updates = { is_done: nextDone, is_cancelled: false, completed_at: nextDone ? todayStr() : null, updated_at: new Date().toISOString() };
    const response = await apiPut('/tasks/' + taskId, updates);
    const updatedTask = { ...response };
    const generatedTask = updatedTask.generated_task || null;
    delete updatedTask.generated_task;
    Object.assign(task, updatedTask);
    if(generatedTask && !state.tasks.some(item => item.id === generatedTask.id)){
      state.tasks.push(generatedTask);
    }

    let dayItem = getCurrentTaskItem(taskId);
    if(!dayItem && preserveFocus){
      dayItem = await ensureTaskPlannerItem(taskId, { templateItem: getCarryoverTaskItem(taskId) });
    }
    if(dayItem){
      const itemUpdates = nextDone
        ? { status: 'done', is_today_focus: preserveFocus ? true : false, is_highlight: false, updated_at: new Date().toISOString() }
        : { status: 'planned', is_today_focus: preserveFocus ? true : dayItem.is_today_focus, updated_at: new Date().toISOString() };
      await apiPut('/daily-plan-items/' + dayItem.id, itemUpdates);
    }

    await loadCurrentDateItems();
    renderTodos();
    renderTodayTodos();
    renderSummaryPills();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function toggleTaskCancelled(taskId){
  const task = state.tasks.find(item => item.id === taskId);
  if(!task) return;
  const nextCancelled = !task.is_cancelled;
  try{
    const updates = { is_cancelled: nextCancelled, is_done: nextCancelled ? false : task.is_done, completed_at: nextCancelled ? null : task.completed_at, updated_at: new Date().toISOString() };
    await apiPut('/tasks/' + taskId, updates);
    Object.assign(task, updates);

    if(state.currentPlanId){
      const plannerUpdates = nextCancelled
        ? { status: 'cancelled', is_today_focus: false, is_highlight: false, updated_at: new Date().toISOString() }
        : { status: 'planned', updated_at: new Date().toISOString() };
      // Update matching plan items in current date
      const matchingItems = state.currentDateItems.filter(item =>
        item.item_type === 'task' && item.task_id === taskId && ['planned','done','cancelled'].includes(item.status)
      );
      for(const item of matchingItems){
        await apiPut('/daily-plan-items/' + item.id, plannerUpdates);
      }
    }
    await loadCurrentDateItems();
    renderTodos();
    renderTodayTodos();
    renderSummaryPills();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function ensureTaskPlannerItem(taskId, options = {}){
  const existing = getCurrentTaskItem(taskId);
  if(existing) return existing;
  const task = state.tasks.find(item => item.id === taskId);
  if(!task) throw new Error('Task not found.');
  if(!task.id) throw new Error('Task record is missing its database id.');
  const plan = await ensureDailyPlan(getSelectedDate());
  const sortOrder = state.currentDateItems.filter(item => item.item_type === 'task').length;
  const templateItem = options.templateItem || null;
  const payload = {
    daily_plan_id: plan.id,
    item_type: 'task',
    task_id: task.id,
    event_id: null,
    title_snapshot: task.title,
    category_snapshot: task.category,
    area_snapshot: task.area,
    status: task.is_done ? 'done' : 'planned',
    is_today_focus: !!templateItem?.is_today_focus,
    is_important: !!templateItem?.is_important,
    is_urgent: !!templateItem?.is_urgent,
    is_highlight: !!templateItem?.is_highlight,
    time_text: null,
    note_text: null,
    sort_order: sortOrder,
    source_plan_item_id: templateItem?.id || null,
    moved_to_plan_item_id: null,
  };
  try{
    const data = await apiPost('/daily-plan-items', payload);
    return data;
  } catch(error){
    showPlannerInsertDebug('ensureTaskPlannerItem', payload, error);
    throw error;
  }
}

async function toggleFlag(taskId, flag){
  const fieldMap = {
    today: 'is_today_focus',
    important: 'is_important',
    urgent: 'is_urgent',
    highlight: 'is_highlight',
  };
  const dbField = fieldMap[flag];
  if(!dbField) return;

  try{
    let item = getCurrentTaskItem(taskId);
    if(!item) item = await ensureTaskPlannerItem(taskId, { templateItem: getCarryoverTaskItem(taskId) });
    const nextValue = !item[dbField];
    await apiPut('/daily-plan-items/' + item.id, { [dbField]: nextValue, updated_at: new Date().toISOString() });
    await loadCurrentDateItems();
    renderTodos();
    renderTodayTodos();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function deleteTask(taskId){
  try{
    await apiDelete('/tasks/' + taskId);
    state.tasks = state.tasks.filter(task => task.id !== taskId);
    state.currentDateItems = state.currentDateItems.filter(item => item.task_id !== taskId);
    state.carryoverTaskItems = state.carryoverTaskItems.filter(item => item.task_id !== taskId);
    renderTodos();
    renderTodayTodos();
    renderSummaryPills();
    showToast('Task deleted');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

// ─── Today's todos ─────────────────────────────────

function renderTodayTodos(){
  const selectedDate = getSelectedDate();
  const taskItems = state.currentDateItems.filter(item => item.item_type === 'task');
  const currentTaskIds = new Set(taskItems.map(item => item.task_id));
  const carryoverItems = state.carryoverTaskItems.filter(item => {
    if(currentTaskIds.has(item.task_id)) return false;
    const task = state.tasks.find(entry => entry.id === item.task_id);
    if(!task) return false;
    if(task.is_done || task.is_cancelled || task.is_active === false) return false;
    return !!item.is_today_focus;
  });
  const todayItems = taskItems
    .filter(item => item.status === 'planned' && item.is_today_focus)
    .concat(carryoverItems)
    .sort((a,b) => (b.is_highlight ? 1 : 0) - (a.is_highlight ? 1 : 0) || (a.title_snapshot || '').localeCompare(b.title_snapshot || ''));
  const doneItems = taskItems.filter(item => item.status === 'done');

  const todoBody = document.getElementById('today-todo-tbody');
  if(todoBody){
    if(!todayItems.length){
      todoBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No focused items for ${fmtFull(selectedDate)}.</div></td></tr>`;
    } else {
      todoBody.innerHTML = todayItems.map(item => `
        <tr class="${item.is_highlight ? 'hl-bg' : ''}">
          <td class="c"><div class="cb" onclick="todayToggleDone('${item.task_id}')"></div></td>
          <td>${catChip(item.category_snapshot)}</td>
          <td style="font-weight:${item.is_highlight ? 700 : 400}">${esc(item.title_snapshot)}</td>
          <td><button class="btn-ghost" onclick="openMoveTaskModal('${item.task_id}','${item.id}')">Move</button></td>
          <td class="c"><div class="cb-star ${item.is_highlight ? 'on' : ''}" onclick="toggleHighlight('${item.task_id}')">${icoStar(item.is_highlight)}</div></td>
        </tr>
      `).join('');
    }
  }

  const doneBody = document.getElementById('today-done-tbody');
  if(doneBody){
    if(!doneItems.length){
      doneBody.innerHTML = `<tr><td colspan="4"><div class="empty-state">Nothing completed for ${fmtFull(selectedDate)}.</div></td></tr>`;
    } else {
      doneBody.innerHTML = doneItems.map(item => `
        <tr class="dr">
          <td class="c"><div class="cb checked" onclick="todayToggleDone('${item.task_id}')"></div></td>
          <td><div class="done-row-chip">${catChip(item.category_snapshot)}</div></td>
          <td><span class="done-row-text">${esc(item.title_snapshot)}</span></td>
          <td class="done-row-move"><button class="btn-ghost" onclick="openMoveTaskModal('${item.task_id}','${item.id}')">Move</button></td>
        </tr>
      `).join('');
    }
  }
}

async function todayToggleDone(taskId){
  await toggleTodo(taskId, { preserveFocus: true });
}

async function toggleHighlight(taskId){
  await toggleFlag(taskId, 'highlight');
}

// ─── Events ────────────────────────────────────────

function renderSelectedDateEvents(){
  const selectedDate = getSelectedDate();
  const events = state.events
    .filter(event => event.event_date === selectedDate && !event.is_cancelled)
    .sort((a, b) => (a.event_time || '99:99').localeCompare(b.event_time || '99:99') || a.title.localeCompare(b.title));

  const card = document.getElementById('selected-date-events-card');
  const list = document.getElementById('selected-date-events-list');
  const meta = document.getElementById('selected-date-events-meta');

  if(!events.length){
    if(card) card.style.display = 'none';
    if(list) list.innerHTML = '';
    if(meta) meta.textContent = '';
    return;
  }

  if(card) card.style.display = '';
  if(meta) meta.textContent = `${events.length} event${events.length === 1 ? '' : 's'} on ${fmtFull(selectedDate)}`;
  if(list) list.innerHTML = events.map(event => `
    <div class="event-day-item">
      <div class="event-day-main">
        <div class="event-day-title">${esc(event.title)}</div>
        <div class="event-day-meta">
          ${event.event_time ? `<span>${esc(event.event_time)}</span>` : '<span>Time not set</span>'}
          ${event.venue ? `<span>${esc(event.venue)}</span>` : ''}
        </div>
      </div>
      ${event.category ? `<span class="chip ${eventCatChipClass(event.category)}">${esc(event.category)}</span>` : ''}
    </div>
  `).join('');
}

function renderEvents(){
  const search = normalizeSearch(plannerFilters.events.search);
  const categoryFilter = plannerFilters.events.category;
  const today = todayStr();
  const evUpcoming = document.getElementById('ev-upcoming');
  const evDone = document.getElementById('ev-done');
  const evCancelled = document.getElementById('ev-cancelled');
  const evTotal = document.getElementById('ev-total');
  if(evUpcoming) evUpcoming.textContent = state.events.filter(event => !event.is_done && !event.is_cancelled && event.event_date >= today).length;
  if(evDone) evDone.textContent = state.events.filter(event => event.is_done).length;
  if(evCancelled) evCancelled.textContent = state.events.filter(event => event.is_cancelled).length;
  if(evTotal) evTotal.textContent = state.events.length;

  const matchesEventFilter = event => {
    if(categoryFilter && event.category !== categoryFilter) return false;
    if(search && ![event.title, event.venue, event.category, event.event_date].some(value => normalizeSearch(value).includes(search))) return false;
    return true;
  };
  const pendingEvents = sortEventList(state.events.filter(event => !event.is_done && !event.is_cancelled && matchesEventFilter(event)));
  const doneEvents = sortEventList(state.events.filter(event => event.is_done && !event.is_cancelled && matchesEventFilter(event)));
  const cancelledEvents = sortEventList(state.events.filter(event => event.is_cancelled && matchesEventFilter(event)));
  const renderEventRows = events => events.map(event => `
    <tr class="${event.is_done ? 'dr' : ''}">
      <td class="c"><div class="cb ${event.is_done ? 'checked' : ''}" onclick="toggleEvent('${event.id}')"></div></td>
      <td><input class="ec event-title-input" value="${esc(event.title)}" onchange="editEvent('${event.id}','title',this.value)" /></td>
      <td><input class="ec mu" type="date" value="${event.event_date || ''}" onchange="editEvent('${event.id}','event_date',this.value)" style="width:105px" /></td>
      <td><input class="ec mu" type="time" value="${event.event_time || ''}" onchange="editEvent('${event.id}','event_time',this.value)" style="width:72px" /></td>
      <td><input class="ec mu event-venue-input" value="${esc(event.venue)}" placeholder="—" onchange="editEvent('${event.id}','venue',this.value)" /></td>
      <td><select class="isel chip-select ${eventCatChipClass(event.category)}" onchange="editEvent('${event.id}','category',this.value)">
        <option value="">—</option>${EVENT_CATS.map(cat => `<option value="${esc(cat)}"${event.category === cat ? ' selected' : ''}>${esc(cat)}</option>`).join('')}
      </select></td>
      <td class="c"><button class="del-btn" onclick="deleteEvent('${event.id}')">×</button></td>
      <td class="c"><div class="cb ${event.is_cancelled ? 'checked' : ''}" onclick="toggleEventCancelled('${event.id}')"></div></td>
    </tr>
  `).join('');

  const eventsTbody = document.getElementById('events-tbody');
  const eventsDoneTbody = document.getElementById('events-done-tbody');
  const eventsCancelledTbody = document.getElementById('events-cancelled-tbody');
  if(eventsTbody) eventsTbody.innerHTML = pendingEvents.length ? renderEventRows(pendingEvents) : '<tr><td colspan="8"><div class="empty-state">No pending events.</div></td></tr>';
  if(eventsDoneTbody) eventsDoneTbody.innerHTML = doneEvents.length ? renderEventRows(doneEvents) : '<tr><td colspan="8"><div class="empty-state">No completed events.</div></td></tr>';
  if(eventsCancelledTbody) eventsCancelledTbody.innerHTML = cancelledEvents.length ? renderEventRows(cancelledEvents) : '<tr><td colspan="8"><div class="empty-state">No cancelled events.</div></td></tr>';

  renderSummaryPills();
}

async function addEvent(){
  const titleEl = document.getElementById('ev-name');
  const title = titleEl ? titleEl.value.trim() : '';
  if(!title) return;
  try{
    const data = await apiPost('/events', {
      title,
      event_date: document.getElementById('ev-date')?.value || null,
      event_time: document.getElementById('ev-time')?.value || null,
      venue: (document.getElementById('ev-venue')?.value || '').trim() || null,
      category: null,
      is_done: false,
      is_cancelled: false,
      is_active: true,
    });
    state.events.push(data);
    ['ev-name','ev-date','ev-time','ev-venue'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
    });
    renderEvents();
    showToast('Event added');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function editEvent(eventId, field, value){
  const event = state.events.find(item => item.id === eventId);
  if(!event) return;
  const updates = { updated_at: new Date().toISOString() };
  updates[field] = value || null;
  if(field === 'title') updates[field] = value.trim();
  try{
    await apiPut('/events/' + eventId, updates);
    Object.assign(event, updates);
    renderEvents();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function toggleEvent(eventId){
  const event = state.events.find(item => item.id === eventId);
  if(!event) return;
  const nextDone = !event.is_done;
  try{
    await apiPut('/events/' + eventId, { is_done: nextDone, is_cancelled: false, updated_at: new Date().toISOString() });
    event.is_done = nextDone;
    event.is_cancelled = false;
    renderEvents();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function toggleEventCancelled(eventId){
  const event = state.events.find(item => item.id === eventId);
  if(!event) return;
  const nextCancelled = !event.is_cancelled;
  try{
    await apiPut('/events/' + eventId, { is_cancelled: nextCancelled, is_done: nextCancelled ? false : event.is_done, updated_at: new Date().toISOString() });
    event.is_cancelled = nextCancelled;
    if(nextCancelled) event.is_done = false;
    renderEvents();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function deleteEvent(eventId){
  try{
    await apiDelete('/events/' + eventId);
    state.events = state.events.filter(event => event.id !== eventId);
    state.currentDateItems = state.currentDateItems.filter(item => item.event_id !== eventId);
    renderSelectedDateEvents();
    renderEvents();
    showToast('Event deleted');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

// ─── Schedule ──────────────────────────────────────

function nowTime(){
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
}

function toggleAutoTime(){
  autoTime = !autoTime;
  const track = document.getElementById('at-track');
  const knob = document.getElementById('at-knob');
  if(track) track.style.background = autoTime ? '#534AB7' : '#d0d5e0';
  if(knob) knob.style.left = autoTime ? '14px' : '2px';
}

async function loadSchedule(){
  try{
    await loadCurrentDateItems();
    renderTodos();
    renderTodayTodos();
    renderSched(getSelectedDate());
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

function renderSched(dateKey){
  const el = document.getElementById('sched-grid');
  if(!el) return;
  const slots = state.currentDateItems.filter(item => item.item_type === 'schedule_entry');
  if(!slots.length){
    el.innerHTML = '<div class="empty-state">No entries yet — click + Entry to start logging.</div>';
    return;
  }
  el.innerHTML = slots.map((slot, rowIndex) => `
    <div class="sched-row">
      <div class="sched-time"><input class="sched-cell-input" data-row-index="${rowIndex}" data-col-index="0" data-item-id="${slot.id}" data-field="time_text" type="text" value="${esc(slot.time_text)}" placeholder="e.g. 7:20" onchange="updateSlot('${slot.id}','time_text',this.value)"/></div>
      <div class="sched-act"><input class="sched-cell-input" data-row-index="${rowIndex}" data-col-index="1" data-item-id="${slot.id}" data-field="title_snapshot" type="text" value="${esc(slot.title_snapshot)}" placeholder="What did you do?" onchange="updateSlot('${slot.id}','title_snapshot',this.value)"/></div>
      <div class="sched-note"><input class="sched-cell-input" data-row-index="${rowIndex}" data-col-index="2" data-item-id="${slot.id}" data-field="note_text" type="text" value="${esc(slot.note_text)}" placeholder="Note" onchange="updateSlot('${slot.id}','note_text',this.value)"/></div>
      <div class="sched-del"><button class="del-btn" onclick="removeSlot('${slot.id}')">×</button></div>
    </div>
  `).join('');
  bindScheduleKeyboardNavigation();
}

function bindScheduleKeyboardNavigation(){
  if(scheduleKeyboardBound) return;
  scheduleKeyboardBound = true;

  document.addEventListener('keydown', async event => {
    const target = event.target;
    if(!(target instanceof HTMLInputElement)) return;
    if(!target.classList.contains('sched-cell-input')) return;

    if(event.key === 'Enter'){
      event.preventDefault();
      await commitScheduleCellValue(target);
      await addSlot();
      return;
    }

    if(!event.altKey) return;
    if(!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;

    const nextCell = getAdjacentScheduleCell(target, event.key);
    if(!nextCell) return;

    event.preventDefault();
    await commitScheduleCellValue(target);
    focusScheduleCell(nextCell);
  });
}

async function commitScheduleCellValue(input){
  const itemId = input?.dataset?.itemId;
  const field = input?.dataset?.field;
  if(!itemId || !field) return;

  const item = state.currentDateItems.find(entry => entry.id === itemId);
  const nextValue = input.value || '';
  const currentValue = item ? (item[field] || '') : '';
  if(nextValue === currentValue) return;

  await updateSlot(itemId, field, nextValue);
}

function getScheduleCells(){
  return Array.from(document.querySelectorAll('#sched-grid .sched-cell-input'));
}

function getScheduleCellByPosition(rowIndex, colIndex){
  return getScheduleCells().find(cell =>
    Number(cell.dataset.rowIndex) === rowIndex && Number(cell.dataset.colIndex) === colIndex
  ) || null;
}

function getAdjacentScheduleCell(currentCell, key){
  const rowIndex = Number(currentCell.dataset.rowIndex);
  const colIndex = Number(currentCell.dataset.colIndex);
  const cells = getScheduleCells();
  const rowCount = cells.reduce((max, cell) => Math.max(max, Number(cell.dataset.rowIndex)), -1) + 1;
  const lastColIndex = 2;

  if(key === 'ArrowLeft'){
    if(colIndex > 0) return getScheduleCellByPosition(rowIndex, colIndex - 1);
    if(rowIndex === 0) return null;
    return getScheduleCellByPosition(rowIndex - 1, lastColIndex);
  }

  if(key === 'ArrowRight'){
    if(colIndex < lastColIndex) return getScheduleCellByPosition(rowIndex, colIndex + 1);
    if(rowIndex >= rowCount - 1) return null;
    return getScheduleCellByPosition(rowIndex + 1, 0);
  }

  if(key === 'ArrowUp'){
    if(rowIndex === 0) return null;
    return getScheduleCellByPosition(rowIndex - 1, colIndex);
  }

  if(key === 'ArrowDown'){
    if(rowIndex >= rowCount - 1) return null;
    return getScheduleCellByPosition(rowIndex + 1, colIndex);
  }

  return null;
}

function focusScheduleCell(cell){
  if(!cell) return;
  cell.focus();
  const caret = cell.value.length;
  if(typeof cell.setSelectionRange === 'function'){
    cell.setSelectionRange(caret, caret);
  }
}

async function addSlot(){
  try{
    const plan = await ensureDailyPlan(getSelectedDate());
    const sortOrder = state.currentDateItems.filter(item => item.item_type === 'schedule_entry').length;
    const payload = {
      daily_plan_id: plan.id,
      item_type: 'schedule_entry',
      task_id: null,
      event_id: null,
      title_snapshot: '',
      category_snapshot: null,
      area_snapshot: null,
      status: 'planned',
      is_today_focus: false,
      is_important: false,
      is_urgent: false,
      is_highlight: false,
      time_text: autoTime ? nowTime() : '',
      note_text: '',
      sort_order: sortOrder,
      source_plan_item_id: null,
      moved_to_plan_item_id: null,
    };
    try{
      await apiPost('/daily-plan-items', payload);
    } catch(error){
      showPlannerInsertDebug('addSlot', payload, error);
      throw error;
    }
    await loadCurrentDateItems();
    renderSched(getSelectedDate());
    setTimeout(() => {
      const rows = document.querySelectorAll('#sched-grid .sched-time input');
      if(rows.length){
        const input = rows[rows.length - 1];
        input.focus();
        if(autoTime) input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 50);
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function updateSlot(itemId, field, value){
  try{
    await apiPut('/daily-plan-items/' + itemId, { [field]: value || null, updated_at: new Date().toISOString() });
    const item = state.currentDateItems.find(entry => entry.id === itemId);
    if(item) item[field] = value || null;
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function removeSlot(itemId){
  try{
    await apiDelete('/daily-plan-items/' + itemId);
    state.currentDateItems = state.currentDateItems.filter(item => item.id !== itemId);
    renderSched(getSelectedDate());
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

// ─── Topbar / Modal ────────────────────────────────

function updateTopbarForSection(){
  const pageTitle = document.getElementById('planner-page-title');
  const taskTabs = document.getElementById('tab-bar-tasks');
  const addButton = document.getElementById('topbar-add-btn');
  const habitTools = document.getElementById('habit-topbar-tools');
  const habitEditButton = document.getElementById('habit-edit-btn');
  const habitCategoryButton = document.getElementById('habit-cat-btn');

  if(taskTabs) taskTabs.style.display = currentSection === 'tasks' ? 'flex' : 'none';
  if(habitTools) habitTools.style.display = currentSection === 'habits' ? 'flex' : 'none';

  if(currentSection === 'schedule'){
    if(pageTitle) pageTitle.textContent = 'Daily Schedule';
    if(addButton) addButton.style.display = 'none';
  } else if(currentSection === 'tasks'){
    if(pageTitle) pageTitle.textContent = 'Tasks & Events';
    if(addButton) addButton.style.display = '';
    const labels = { goals:'+ Add goal', todos:'+ Add to-do', events:'+ Add event' };
    if(addButton) addButton.textContent = labels[currentTab] || '+ Add';
  } else {
    if(pageTitle) pageTitle.textContent = 'Habit Tracker';
    if(addButton){
      addButton.style.display = '';
      addButton.textContent = '+ New item';
    }
  }

  if(habitEditButton){
    const habitEditMode = typeof window.habitEditMode !== 'undefined' ? window.habitEditMode : false;
    habitEditButton.classList.toggle('active', habitEditMode);
    habitEditButton.innerHTML = habitEditMode
      ? '<i class="ti ti-check" style="font-size:12px"></i> Done'
      : '<i class="ti ti-pencil" style="font-size:12px"></i> Edit';
  }
  if(habitCategoryButton){
    const habitEditMode = typeof window.habitEditMode !== 'undefined' ? window.habitEditMode : false;
    habitCategoryButton.style.display = currentSection === 'habits' && habitEditMode ? '' : 'none';
  }
}

function openModal(type){
  modalType = type;
  const titleMap = {
    event: 'Add event',
    coretask: 'Add goal',
    todo: 'Add to-do item',
    habit: 'New item',
    move_task: 'Move task',
  };
  const modalTitle = document.getElementById('modal-title');
  if(modalTitle) modalTitle.textContent = titleMap[type] || 'Add';
  const modalEl = document.querySelector('#modal-bg .modal');
  if(modalEl) modalEl.classList.remove('habit-modal-wide');

  const areaOpts = `<option value="">— none —</option>${AREAS.map(area => `<option>${esc(area)}</option>`).join('')}`;
  const goalOpts = `<option value="">— none —</option>${state.goals.filter(goal => !goal.is_done).map(goal => `<option value="${goal.id}">${esc(goal.title)}</option>`).join('')}`;

  let html = '';
  if(type === 'event'){
    html = `<div class="form-grid">
      <div class="fg" style="grid-column:1/-1"><label>Event name</label><input id="m-ev-name" placeholder="e.g. BG Gathering"></div>
      <div class="fg"><label>Date</label><input id="m-ev-date" type="date"></div>
      <div class="fg"><label>Time (optional)</label><input id="m-ev-time" type="time"></div>
      <div class="fg"><label>Venue</label><input id="m-ev-venue" placeholder="e.g. Gaga's Home"></div>
      <div class="fg"><label>Category</label><select id="m-ev-cat"><option value="">—</option>${EVENT_CATS.map(cat => `<option>${esc(cat)}</option>`).join('')}</select></div>
    </div>`;
    modalSaveHandler = saveEventModal;
  } else if(type === 'coretask'){
    html = `<div class="form-grid">
      <div class="fg" style="grid-column:1/-1"><label>Goal name</label><input id="m-ct-name" placeholder="e.g. Learn Vibe Coding"></div>
      <div class="fg"><label>Area</label><select id="m-ct-goal">${areaOpts}</select></div>
      <div class="fg"><label>Target completion</label><input id="m-ct-target-date" type="date"></div>
    </div>`;
    modalSaveHandler = saveGoalModal;
  } else if(type === 'todo'){
    html = `<div class="form-grid">
      <div class="fg" style="grid-column:1/-1"><label>Item name</label><input id="m-td-name" placeholder="e.g. Build planner flow"></div>
      <div class="fg"><label>Category</label><select id="m-td-cat">${CATS.map(cat => `<option>${esc(cat)}</option>`).join('')}</select></div>
      <div class="fg"><label>Area</label><select id="m-td-area">${areaOpts}</select></div>
      <div class="fg"><label>Repeat</label><select id="m-td-repeat" onchange="syncTaskRecurrenceFields()">
        <option value="none">Does not repeat</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select></div>
      <div class="fg"><label id="m-td-date-label">Deadline</label><input id="m-td-deadline" type="date"></div>
      <div class="fg" id="m-td-weekday-group" style="display:none"><label>Weekday</label><select id="m-td-weekday">
        <option value="0">Monday</option><option value="1">Tuesday</option><option value="2">Wednesday</option>
        <option value="3">Thursday</option><option value="4">Friday</option><option value="5">Saturday</option>
        <option value="6">Sunday</option>
      </select></div>
      <div class="fg" id="m-td-monthday-group" style="display:none"><label>Day of month</label><select id="m-td-monthday">
        ${Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}">${ordinal(index + 1)}</option>`).join('')}
      </select></div>
      <div class="fg" style="grid-column:1/-1"><label>Linked goal</label><select id="m-td-linked">${goalOpts}</select></div>
    </div>`;
    modalSaveHandler = saveTaskModal;
  } else if(type === 'habit'){
    if(typeof habitTypeOptions === 'function' && typeof habitCategoryOptions === 'function'){
      const DEFAULT_HABIT_TARGET = typeof window.DEFAULT_HABIT_TARGET !== 'undefined' ? window.DEFAULT_HABIT_TARGET : 5;
      html = `
        <div class="habit-form-group"><label>Type</label><select id="habit-m-type" onchange="syncHabitTypeFields()">${habitTypeOptions('habit')}</select></div>
        <div class="habit-form-group"><label>Name</label><input id="habit-m-name" type="text" placeholder="e.g. Morning run" maxlength="50" autocomplete="off"></div>
        <div class="habit-form-group"><label>Description <span style="text-transform:none;letter-spacing:0;font-weight:400">(optional)</span></label><input id="habit-m-desc" type="text" placeholder="e.g. Run for 20 minutes" maxlength="100" autocomplete="off"></div>
        <div class="habit-form-group" id="habit-m-target-group"><label>Weekly target</label><input id="habit-m-target" type="number" min="1" step="1" value="${DEFAULT_HABIT_TARGET}"></div>
        <div class="habit-form-group" id="habit-m-tracking-days-group" style="display:none"><label>Tracking period (days)</label><input id="habit-m-tracking-days" type="number" min="1" max="365" step="1" value="7" placeholder="7"></div>
        <div class="habit-form-group" style="margin-bottom:0"><label>Category</label><select id="habit-m-cat">${habitCategoryOptions('')}</select></div>
      `;
    }
    modalSaveHandler = saveHabitModal;
  }

  const modalBody = document.getElementById('modal-body');
  if(modalBody) modalBody.innerHTML = html;
  const saveBtn = document.getElementById('modal-save-btn');
  if(saveBtn){
    saveBtn.textContent = type === 'disconnect' ? 'Disconnect' : 'Save';
    saveBtn.onclick = () => modalSaveHandler && modalSaveHandler();
  }
  const modalBg = document.getElementById('modal-bg');
  if(modalBg) modalBg.classList.add('open');
  setTimeout(() => {
    if(type === 'todo'){
      syncTaskRecurrenceFields();
    }
    if(type === 'habit' && typeof syncHabitTypeFields === 'function') syncHabitTypeFields();
    const firstInput = document.querySelector('.modal-body input');
    if(firstInput) firstInput.focus();
  }, 80);
}

function openMoveTaskModal(taskId, sourceItemId = null){
  const task = state.tasks.find(item => item.id === taskId);
  const sourceItem = getMovableTaskSourceItem(taskId, sourceItemId);
  if(!task || !sourceItem){
    showToast('Only planned or completed items can be moved.', true);
    return;
  }
  const sourceDate = sourceItem.source_plan_date || getSelectedDate();
  modalType = 'move_task';
  const modalTitle = document.getElementById('modal-title');
  if(modalTitle) modalTitle.textContent = 'Move task';
  const modalBody = document.getElementById('modal-body');
  if(modalBody) modalBody.innerHTML = `
    <div class="fg">
      <label>Task</label>
      <input value="${esc(task.title)}" disabled>
    </div>
    <div class="fg">
      <label>Move from</label>
      <input value="${esc(sourceDate)}" disabled>
    </div>
    <div class="fg">
      <label>Move to date</label>
      <input id="m-move-date" type="date" value="${getSelectedDate()}">
    </div>
  `;
  modalSaveHandler = () => moveTaskToDate(taskId, sourceItemId);
  const saveBtn = document.getElementById('modal-save-btn');
  if(saveBtn){
    saveBtn.textContent = 'Move';
    saveBtn.onclick = () => modalSaveHandler && modalSaveHandler();
  }
  const modalBg = document.getElementById('modal-bg');
  if(modalBg) modalBg.classList.add('open');
}

// ─── Modal save handlers ───────────────────────────

async function saveGoalModal(){
  const title = document.getElementById('m-ct-name')?.value?.trim();
  if(!title) return;
  try{
    const data = await apiPost('/goals', {
      title,
      area: document.getElementById('m-ct-goal')?.value || null,
      target_completion_date: document.getElementById('m-ct-target-date')?.value || null,
      sort_order: state.goals.length,
      is_important: false,
      is_urgent: false,
      is_done: false,
      is_cancelled: false,
      is_active: true,
    });
    state.goals.push(data);
    closeModal();
    renderGoals();
    renderTodos();
    showToast('Goal added');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveHabitModal(){
  const name = (document.getElementById('habit-m-name')?.value || '').trim();
  if(!name){
    const nameInput = document.getElementById('habit-m-name');
    if(nameInput) nameInput.focus();
    return;
  }
  const type = document.getElementById('habit-m-type')?.value === 'tracking' ? 'tracking' : 'habit';
  const targetValue = document.getElementById('habit-m-target')?.value;
  if(type === 'habit' && (!targetValue || Number(targetValue) < 1)){
    const targetInput = document.getElementById('habit-m-target');
    if(targetInput) targetInput.focus();
    return;
  }
  try{
    if(typeof createHabitItem === 'function'){
      await createHabitItem({
        name,
        description: (document.getElementById('habit-m-desc')?.value || '').trim(),
        category: document.getElementById('habit-m-cat')?.value,
        type,
        target: targetValue,
        tracking_days: type === 'tracking' ? (document.getElementById('habit-m-tracking-days')?.value || 7) : null,
      });
    }
    closeModal();
    if(typeof renderHabitsSection === 'function') renderHabitsSection();
    renderSummaryPills();
    showToast(type === 'tracking' ? 'Tracking log created' : 'Habit created');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveTaskModal(){
  const title = document.getElementById('m-td-name')?.value?.trim();
  if(!title) return;
  const repeat = document.getElementById('m-td-repeat')?.value || 'none';
  const dateValue = document.getElementById('m-td-deadline')?.value || null;
  const recurrence = repeat === 'none' ? null : {
    repeat_unit: repeat,
    repeat_every: 1,
    weekday: repeat === 'weekly' ? Number(document.getElementById('m-td-weekday')?.value || 0) : null,
    day_of_month: repeat === 'monthly' ? Number(document.getElementById('m-td-monthday')?.value || 1) : null,
    start_date: dateValue,
    is_active: true,
  };
  try{
    const data = await apiPost('/tasks', {
      title,
      category: document.getElementById('m-td-cat')?.value || null,
      area: document.getElementById('m-td-area')?.value || null,
      goal_id: document.getElementById('m-td-linked')?.value || null,
      deadline: dateValue,
      recurrence,
      is_done: false,
      is_active: true,
    });
    state.tasks.push(data);
    closeModal();
    renderTodos();
    renderSummaryPills();
    showToast('Task added');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveEventModal(){
  const title = document.getElementById('m-ev-name')?.value?.trim();
  if(!title) return;
  try{
    const data = await apiPost('/events', {
      title,
      event_date: document.getElementById('m-ev-date')?.value || null,
      event_time: document.getElementById('m-ev-time')?.value || null,
      venue: (document.getElementById('m-ev-venue')?.value || '').trim() || null,
      category: document.getElementById('m-ev-cat')?.value || null,
      is_done: false,
      is_cancelled: false,
      is_active: true,
    });
    state.events.push(data);
    closeModal();
    renderEvents();
    showToast('Event added');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

// ─── Tag manager ───────────────────────────────────

function renderTagRows(kind, entries){
  return entries.map((entry, index) => `
    <div class="tag-row">
      <input data-tag-kind="${kind}" data-tag-index="${index}" data-tag-field="label" value="${esc(entry.label)}" placeholder="Label">
      <select data-tag-kind="${kind}" data-tag-index="${index}" data-tag-field="color">
        ${COLOR_OPTIONS.map(option => `<option value="${option.value}"${entry.color === option.value ? ' selected' : ''}>${option.label}</option>`).join('')}
      </select>
      <span class="chip chip-select tag-color-preview ${entry.color}">${esc(entry.label)}</span>
    </div>
  `).join('');
}

function renderTagGroup(kind, title, entries){
  return `
    <div class="tag-group">
      <div class="tag-group-head">
        <div class="tag-group-title">${title}</div>
        <button class="btn-ghost" type="button" onclick="addTagRow('${kind}')">+ Add tag</button>
      </div>
      <div id="tag-group-${kind}">
        ${renderTagRows(kind, entries)}
      </div>
    </div>
  `;
}

function openTagManagerModal(){
  modalType = 'manage_tags';
  const modalTitle = document.getElementById('modal-title');
  if(modalTitle) modalTitle.textContent = 'Manage tags';
  const modalBody = document.getElementById('modal-body');
  if(modalBody) modalBody.innerHTML = `
    <div class="tag-manager">
      ${renderTagGroup('areas', 'Areas', tagConfig.areas)}
      ${renderTagGroup('taskCategories', 'Task categories', tagConfig.taskCategories)}
      ${renderTagGroup('eventCategories', 'Event categories', tagConfig.eventCategories)}
    </div>
  `;
  modalSaveHandler = saveTagManagerModal;
  const saveBtn = document.getElementById('modal-save-btn');
  if(saveBtn){
    saveBtn.textContent = 'Save tags';
    saveBtn.onclick = () => modalSaveHandler && modalSaveHandler();
  }
  const modalBg = document.getElementById('modal-bg');
  if(modalBg) modalBg.classList.add('open');

  document.querySelectorAll('[data-tag-field="label"], [data-tag-field="color"]').forEach(control => {
    control.addEventListener('input', refreshTagPreview);
    control.addEventListener('change', refreshTagPreview);
  });
}

function addTagRow(kind){
  const group = document.getElementById(`tag-group-${kind}`);
  if(!group) return;
  const nextIndex = group.querySelectorAll('.tag-row').length;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderTagRows(kind, [{ label:'', color:'chip-gray' }]).replaceAll('data-tag-index="0"', `data-tag-index="${nextIndex}"`);
  const row = wrapper.firstElementChild;
  group.appendChild(row);
  row.querySelectorAll('[data-tag-field="label"], [data-tag-field="color"]').forEach(control => {
    control.addEventListener('input', refreshTagPreview);
    control.addEventListener('change', refreshTagPreview);
  });
  const input = row.querySelector('[data-tag-field="label"]');
  if(input) input.focus();
}

function refreshTagPreview(event){
  const row = event.target.closest('.tag-row');
  if(!row) return;
  const labelInput = row.querySelector('[data-tag-field="label"]');
  const colorSelect = row.querySelector('[data-tag-field="color"]');
  const preview = row.querySelector('.tag-color-preview');
  if(preview && labelInput && colorSelect){
    preview.textContent = labelInput.value.trim() || 'Preview';
    preview.className = `chip chip-select tag-color-preview ${colorSelect.value}`;
  }
}

async function saveTagManagerModal(){
  const nextConfig = { areas: [], taskCategories: [], eventCategories: [] };
  const controls = Array.from(document.querySelectorAll('[data-tag-kind][data-tag-index][data-tag-field]'));
  const grouped = {};

  for(const control of controls){
    const kind = control.dataset.tagKind;
    const index = Number(control.dataset.tagIndex);
    grouped[kind] ??= {};
    grouped[kind][index] ??= {};
    grouped[kind][index][control.dataset.tagField] = control.value;
  }

  for(const kind of Object.keys(nextConfig)){
    const entries = Object.entries(grouped[kind] || {})
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, entry]) => ({
        label: String(entry.label || '').trim(),
        color: entry.color || 'chip-gray',
      }));
    if(entries.some(entry => !entry.label)){
      showToast('Tag labels cannot be blank.', true);
      return;
    }
    if(entries.some(entry => BLOCKED_TAG_LABELS.has(entry.label.toLowerCase()))){
      showToast('TaxPayment is no longer an allowed tag.', true);
      return;
    }
    const uniqueLabels = new Set(entries.map(entry => entry.label));
    if(entries.length !== uniqueLabels.size){
      showToast('Tag labels within the same group must be unique.', true);
      return;
    }
    nextConfig[kind] = entries;
  }

  // Build renames by comparing old config with new
  const areaRenames = tagConfig.areas
    .map((entry, index) => ({ prev: entry.label, next: nextConfig.areas[index]?.label }))
    .filter(entry => entry.next && entry.prev !== entry.next);
  const taskCategoryRenames = tagConfig.taskCategories
    .map((entry, index) => ({ prev: entry.label, next: nextConfig.taskCategories[index]?.label }))
    .filter(entry => entry.next && entry.prev !== entry.next);
  const eventCategoryRenames = tagConfig.eventCategories
    .map((entry, index) => ({ prev: entry.label, next: nextConfig.eventCategories[index]?.label }))
    .filter(entry => entry.next && entry.prev !== entry.next);

  const renamesObj = {};
  if(areaRenames.length) renamesObj.areas = areaRenames;
  if(taskCategoryRenames.length) renamesObj.task_categories = taskCategoryRenames;
  if(eventCategoryRenames.length) renamesObj.event_categories = eventCategoryRenames;

  try{
    await apiPut('/planner/tags', {
      areas: nextConfig.areas,
      task_categories: nextConfig.taskCategories,
      event_categories: nextConfig.eventCategories,
      renames: renamesObj,
    });

    // Apply renames to local state
    if(areaRenames.length){
      state.goals.forEach(goal => {
        const rename = areaRenames.find(entry => entry.prev === goal.area);
        if(rename) goal.area = rename.next;
      });
      state.tasks.forEach(task => {
        const rename = areaRenames.find(entry => entry.prev === task.area);
        if(rename) task.area = rename.next;
      });
      state.currentDateItems.forEach(item => {
        const rename = areaRenames.find(entry => entry.prev === item.area_snapshot);
        if(rename) item.area_snapshot = rename.next;
      });
    }

    if(taskCategoryRenames.length){
      state.tasks.forEach(task => {
        const rename = taskCategoryRenames.find(entry => entry.prev === task.category);
        if(rename) task.category = rename.next;
      });
      state.currentDateItems.forEach(item => {
        const rename = taskCategoryRenames.find(entry => entry.prev === item.category_snapshot);
        if(rename) item.category_snapshot = rename.next;
      });
    }

    if(eventCategoryRenames.length){
      state.events.forEach(item => {
        const rename = eventCategoryRenames.find(entry => entry.prev === item.category);
        if(rename) item.category = rename.next;
      });
    }

    tagConfig = nextConfig;
    applyTagConfig();
    renderStaticOptions();
    closeModal();
    renderAll();
    showToast('Tags updated');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

// ─── Move task ─────────────────────────────────────

async function moveTaskToDate(taskId, sourceItemId = null){
  const targetDate = document.getElementById('m-move-date')?.value;
  const sourceItem = getMovableTaskSourceItem(taskId, sourceItemId);
  const sourceDate = sourceItem?.source_plan_date || getSelectedDate();
  if(!targetDate){
    showToast('Please choose a target date.', true);
    return;
  }
  if(targetDate === sourceDate){
    closeModal();
    return;
  }

  if(!sourceItem){
    showToast('Only planned or completed items can be moved.', true);
    return;
  }

  try{
    await apiPost('/daily-plan-items/' + sourceItem.id + '/move', { target_date: targetDate });
    if(sourceItem.status === 'done'){
      const task = state.tasks.find(item => item.id === taskId);
      if(task){
        task.is_done = false;
        task.completed_at = null;
      }
    }
    await loadCurrentDateItems();
    closeModal();
    renderTodos();
    renderTodayTodos();
    showToast('Task moved');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

function configureModal(title, html, saveLabel, handler, wide = false){
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  const saveBtn = document.getElementById('modal-save-btn');
  if(saveBtn){
    saveBtn.textContent = saveLabel;
    saveBtn.onclick = () => handler && handler();
  }
  const modalEl = document.querySelector('#modal-bg .modal');
  if(modalEl) modalEl.classList.toggle('habit-modal-wide', wide);
  document.getElementById('modal-bg').classList.add('open');
}

// ─── Modal close ───────────────────────────────────

function closeModal(){
  const modalBg = document.getElementById('modal-bg');
  if(modalBg) modalBg.classList.remove('open');
  const modalEl = document.querySelector('#modal-bg .modal');
  if(modalEl) modalEl.classList.remove('habit-modal-wide');
  modalSaveHandler = null;
  modalType = '';
  const saveBtn = document.getElementById('modal-save-btn');
  if(saveBtn) saveBtn.textContent = 'Save';
}

function bgClose(event){
  if(event.target === document.getElementById('modal-bg')) closeModal();
}

// ─── Boot ──────────────────────────────────────────

async function boot(){
  await initShell();
  updateTopbarForSection();
  await loadDataAndRender();
}

boot();
