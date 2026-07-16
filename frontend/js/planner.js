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

const AREA_ICON_OPTIONS = [
  { value:'ti-briefcase', label:'Briefcase' },
  { value:'ti-home', label:'Home' },
  { value:'ti-building-bank', label:'Bank' },
  { value:'ti-heart', label:'Heart' },
  { value:'ti-activity-heartbeat', label:'Health' },
  { value:'ti-user', label:'Person' },
  { value:'ti-star', label:'Star' },
];

const DEFAULT_TAG_CONFIG = {
  areas: [
    { label:'Finance', color:'chip-amber', icon:'ti-building-bank' },
    { label:'Career & Skills', color:'chip-purple', icon:'ti-briefcase' },
    { label:'Home Ownership', color:'chip-teal', icon:'ti-home' },
    { label:'Relationships & Love', color:'chip-coral', icon:'ti-heart' },
    { label:'Health', color:'chip-green', icon:'ti-activity-heartbeat' },
    { label:'Personal', color:'chip-gray', icon:'ti-user' },
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
const SCHEDULE_QUICK_ACTIVITY_STORAGE_KEY = 'myos_schedule_quick_activities';
const DEFAULT_SCHEDULE_QUICK_ACTIVITIES = ['Get up', 'Shower'];

// ─── State ─────────────────────────────────────────

let AREAS = [];
let CATS = [];
let EVENT_CATS = [];
let AREA_CHIP = {};
let AREA_ICON = {};
let CAT_CHIP = {};
let EVENT_CAT_CHIP = {};
let tagConfig = null;

let autoTime = true;
let currentSection = 'schedule';
let currentTab = 'todos';
let todoTab = 'pending';
let goalTab = 'pending';
let milestoneTab = 'pending';
let eventTab = 'pending';
let busy = false;
let modalType = '';
let modalSaveHandler = null;
let plannerLoadError = '';
let todayTodoEditMode = false;
let lastScheduleActivityFocus = null;
let pendingScheduleActivityInsert = null;
const plannerSortState = {
  goals: { field: 'priority', dir: 'desc' },
  milestones: { field: 'priority', dir: 'desc' },
  todos: { field: 'priority', dir: 'desc' },
  events: { field: 'event_date', dir: 'asc' },
};
const plannerFilters = {
  goals: { search: '' },
  milestones: { search: '' },
  todos: { search: '', category: '' },
  events: { search: '', category: '' },
};
let scheduleKeyboardBound = false;

const state = {
  goalThemes: [],
  goals: [],
  tasks: [],
  events: [],
  currentPlanId: null,
  currentDateItems: [],
  carryoverTaskItems: [],
  selectedDateManuallySet: false,
  scheduleQuickActivities: [],
  draggingQuickActivity: null,
  goalThemeExpanded: {},
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
  if(recurrence.repeat_unit === 'daily') return 'Daily';
  if(recurrence.repeat_unit === 'weekly') return recurrence.weekday == null ? 'Weekly' : `Weekly • ${weekdayLabel(recurrence.weekday)}`;
  if(recurrence.repeat_unit === 'monthly') return recurrence.day_of_month == null ? 'Monthly' : `Monthly • ${ordinal(recurrence.day_of_month)}`;
  return '';
}
function recurrenceDescription(task){
  const recurrence = task?.recurrence;
  const summary = recurrenceSummary(task);
  if(!recurrence?.repeat_unit || !summary) return '';
  if(recurrence.repeat_unit === 'daily') return 'Repeats daily';
  if(recurrence.repeat_unit === 'weekly') return `Repeats weekly${recurrence.weekday == null ? '' : ` • ${weekdayLabel(recurrence.weekday)}`}`;
  if(recurrence.repeat_unit === 'monthly') return `Repeats monthly${recurrence.day_of_month == null ? '' : ` • ${ordinal(recurrence.day_of_month)}`}`;
  return `Repeats ${summary}`;
}
function recurrenceBadgeLabel(task){
  const recurrence = task?.recurrence;
  if(!recurrence?.repeat_unit) return '';
  if(recurrence.repeat_unit === 'daily') return 'D';
  if(recurrence.repeat_unit === 'weekly') return 'W';
  if(recurrence.repeat_unit === 'monthly') return 'M';
  return 'R';
}
function recurrenceCycleLabel(task){
  const recurrence = task?.recurrence;
  if(recurrence?.repeat_unit === 'daily') return 'D';
  if(recurrence?.repeat_unit === 'weekly') return 'W';
  if(recurrence?.repeat_unit === 'monthly') return 'M';
  return 'N';
}
function nextRecurrenceUnit(task){
  const current = task?.recurrence?.repeat_unit;
  if(current === 'daily') return 'weekly';
  if(current === 'weekly') return 'monthly';
  if(current === 'monthly') return 'none';
  return 'daily';
}
function inferTaskRecurrenceDefaults(task, repeatUnit){
  const baseDate = task?.deadline || todayStr();
  const parsed = new Date(`${baseDate}T00:00:00`);
  const weekday = Number.isNaN(parsed.getTime()) ? 0 : (parsed.getDay() + 6) % 7;
  const dayOfMonth = Number.isNaN(parsed.getTime()) ? 1 : parsed.getDate();
  return {
    repeat_unit: repeatUnit,
    repeat_every: task?.recurrence?.repeat_every || 1,
    weekday: repeatUnit === 'weekly' ? weekday : null,
    day_of_month: repeatUnit === 'monthly' ? dayOfMonth : null,
    start_date: task?.recurrence?.start_date || task?.deadline || todayStr(),
    is_active: true,
  };
}
function areaChip(g){if(!g)return'';return`<span class="chip ${AREA_CHIP[g]||'chip-gray'}">${esc(g)}</span>`;}
function catChip(c){if(!c)return'';return`<span class="chip ${CAT_CHIP[c]||'chip-gray'}">${esc(c)}</span>`;}
function areaChipClass(g){return AREA_CHIP[g] || 'chip-gray';}
function areaIconClass(g){return AREA_ICON[g] || 'ti-tag';}
function catChipClass(c){return CAT_CHIP[c] || 'chip-gray';}
function eventCatChipClass(c){return EVENT_CAT_CHIP[c] || 'chip-gray';}
function areaChipWithIcon(g){
  if(!g) return '';
  return `<span class="chip ${areaChipClass(g)}"><i class="ti ${areaIconClass(g)}"></i>${esc(g)}</span>`;
}

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

function normalizeScheduleQuickActivities(items){
  const seen = new Set();
  const normalized = [];
  for(const item of Array.isArray(items) ? items : []){
    const value = String(item || '').trim();
    const key = value.toLowerCase();
    if(!value || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
  }
  return normalized;
}

function loadScheduleQuickActivities(){
  try{
    const stored = localStorage.getItem(SCHEDULE_QUICK_ACTIVITY_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : DEFAULT_SCHEDULE_QUICK_ACTIVITIES;
    state.scheduleQuickActivities = normalizeScheduleQuickActivities(parsed);
  } catch(error){
    console.warn('Could not load quick schedule activities:', error);
    state.scheduleQuickActivities = [...DEFAULT_SCHEDULE_QUICK_ACTIVITIES];
  }
  if(!state.scheduleQuickActivities.length){
    state.scheduleQuickActivities = [...DEFAULT_SCHEDULE_QUICK_ACTIVITIES];
  }
}

function persistScheduleQuickActivities(){
  localStorage.setItem(
    SCHEDULE_QUICK_ACTIVITY_STORAGE_KEY,
    JSON.stringify(normalizeScheduleQuickActivities(state.scheduleQuickActivities)),
  );
}

function renderScheduleQuickActivities(){
  const listEl = document.getElementById('schedule-quick-activities-list');
  if(!listEl) return;
  if(!state.scheduleQuickActivities.length){
    listEl.innerHTML = '<span class="schedule-quick-activities-empty">Save common activities once, then add them in one click.</span>';
    return;
  }
  listEl.innerHTML = state.scheduleQuickActivities.map(activity => `
    <span class="schedule-quick-activity-chip" draggable="true" data-activity="${esc(activity)}" ondragstart="handleQuickActivityDragStart(event)" ondragover="handleQuickActivityDragOver(event)" ondrop="handleQuickActivityDrop(event)" ondragenter="handleQuickActivityDragEnter(event)" ondragleave="handleQuickActivityDragLeave(event)" ondragend="handleQuickActivityDragEnd(event)">
      <span class="schedule-quick-activity-handle" aria-hidden="true" title="Drag to reorder"><i class="ti ti-grip-vertical"></i></span>
      <button class="schedule-quick-activity-trigger" type="button" data-activity="${esc(activity)}" onmousedown="preserveScheduleActivityFocus(event)" onclick="quickAddScheduleActivity(this.dataset.activity)" title="Add ${esc(activity)} to the schedule">${esc(activity)}</button>
      <button class="schedule-quick-activity-edit" type="button" data-activity="${esc(activity)}" onclick="editScheduleQuickActivity(this.dataset.activity)" aria-label="Edit ${esc(activity)}" title="Edit ${esc(activity)}"><i class="ti ti-pencil"></i></button>
      <button type="button" data-activity="${esc(activity)}" onclick="removeScheduleQuickActivity(this.dataset.activity)" aria-label="Remove ${esc(activity)}">&times;</button>
    </span>
  `).join('');
}

function preserveScheduleActivityFocus(event){
  event.preventDefault();
  const focusedActivity = getFocusedScheduleActivityInput();
  if(!focusedActivity) return;
  rememberScheduleActivityFocus(focusedActivity);
  pendingScheduleActivityInsert = {
    itemId: focusedActivity.dataset.itemId || '',
    selectionStart: typeof focusedActivity.selectionStart === 'number' ? focusedActivity.selectionStart : (focusedActivity.value || '').length,
    selectionEnd: typeof focusedActivity.selectionEnd === 'number' ? focusedActivity.selectionEnd : (focusedActivity.value || '').length,
  };
}

function addScheduleQuickActivity(){
  const input = document.getElementById('schedule-quick-activity-input');
  const value = input ? input.value.trim() : '';
  if(!value) return;
  const exists = state.scheduleQuickActivities.some(item => item.toLowerCase() === value.toLowerCase());
  if(exists){
    showToast('That quick activity already exists', true);
    if(input) input.select();
    return;
  }
  state.scheduleQuickActivities.push(value);
  state.scheduleQuickActivities = normalizeScheduleQuickActivities(state.scheduleQuickActivities);
  persistScheduleQuickActivities();
  renderScheduleQuickActivities();
  if(input) input.value = '';
  showToast('Quick activity saved');
}

function removeScheduleQuickActivity(activity){
  state.scheduleQuickActivities = state.scheduleQuickActivities.filter(item => item.toLowerCase() !== String(activity).trim().toLowerCase());
  persistScheduleQuickActivities();
  renderScheduleQuickActivities();
}

function reorderScheduleQuickActivities(sourceActivity, targetActivity){
  const sourceValue = String(sourceActivity || '').trim().toLowerCase();
  const targetValue = String(targetActivity || '').trim().toLowerCase();
  if(!sourceValue || !targetValue || sourceValue === targetValue) return;

  const sourceIndex = state.scheduleQuickActivities.findIndex(item => item.toLowerCase() === sourceValue);
  const targetIndex = state.scheduleQuickActivities.findIndex(item => item.toLowerCase() === targetValue);
  if(sourceIndex < 0 || targetIndex < 0) return;

  const reordered = [...state.scheduleQuickActivities];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(targetIndex, 0, moved);
  state.scheduleQuickActivities = reordered;
  persistScheduleQuickActivities();
  renderScheduleQuickActivities();
}

function clearQuickActivityDropTargets(){
  document.querySelectorAll('.schedule-quick-activity-chip.is-drop-target').forEach(node => node.classList.remove('is-drop-target'));
}

function handleQuickActivityDragStart(event){
  const chip = event.currentTarget;
  const activity = chip?.dataset?.activity;
  if(!activity) return;
  state.draggingQuickActivity = activity;
  if(event.dataTransfer){
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', activity);
  }
  chip.classList.add('is-dragging');
}

function handleQuickActivityDragOver(event){
  if(!state.draggingQuickActivity) return;
  event.preventDefault();
  if(event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function handleQuickActivityDragEnter(event){
  const chip = event.currentTarget;
  const activity = chip?.dataset?.activity;
  if(!activity || activity === state.draggingQuickActivity) return;
  chip.classList.add('is-drop-target');
}

function handleQuickActivityDragLeave(event){
  const chip = event.currentTarget;
  if(chip) chip.classList.remove('is-drop-target');
}

function handleQuickActivityDrop(event){
  event.preventDefault();
  const chip = event.currentTarget;
  const targetActivity = chip?.dataset?.activity;
  const sourceActivity = state.draggingQuickActivity || event.dataTransfer?.getData('text/plain');
  clearQuickActivityDropTargets();
  reorderScheduleQuickActivities(sourceActivity, targetActivity);
}

function handleQuickActivityDragEnd(event){
  state.draggingQuickActivity = null;
  clearQuickActivityDropTargets();
  const chip = event.currentTarget;
  if(chip) chip.classList.remove('is-dragging');
}

function editScheduleQuickActivity(activity){
  const currentValue = String(activity || '').trim();
  if(!currentValue) return;
  const nextValue = window.prompt('Edit quick activity', currentValue);
  if(nextValue == null) return;

  const normalizedValue = nextValue.trim();
  if(!normalizedValue){
    showToast('Quick activity cannot be empty', true);
    return;
  }

  const duplicate = state.scheduleQuickActivities.some(item =>
    item.toLowerCase() === normalizedValue.toLowerCase() && item.toLowerCase() !== currentValue.toLowerCase()
  );
  if(duplicate){
    showToast('That quick activity already exists', true);
    return;
  }

  state.scheduleQuickActivities = state.scheduleQuickActivities.map(item =>
    item.toLowerCase() === currentValue.toLowerCase() ? normalizedValue : item
  );
  state.scheduleQuickActivities = normalizeScheduleQuickActivities(state.scheduleQuickActivities);
  persistScheduleQuickActivities();
  renderScheduleQuickActivities();
  showToast('Quick activity updated');
}

async function quickAddScheduleActivity(activity){
  const titleSnapshot = String(activity || '').trim();
  if(!titleSnapshot) return;
  await insertScheduleTextOrAddRow(titleSnapshot);
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
    const fallbackEntry = fallbackGroup.find(item => item.label === label) || fallbackGroup[normalized.length] || {};
    normalized.push({
      label,
      color: COLOR_OPTIONS.some(option => option.value === entry?.color) ? entry.color : 'chip-gray',
      icon: AREA_ICON_OPTIONS.some(option => option.value === entry?.icon)
        ? entry.icon
        : (AREA_ICON_OPTIONS.some(option => option.value === fallbackEntry?.icon) ? fallbackEntry.icon : 'ti-tag'),
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
  AREA_ICON = Object.fromEntries(tagConfig.areas.map(entry => [entry.label, entry.icon || 'ti-tag']));
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

function getGoalThemeById(id){
  return state.goalThemes.find(goalTheme => goalTheme.id === id) || null;
}

function getGoalThemeForTarget(target){
  if(!target?.goal_theme_id) return null;
  return getGoalThemeById(target.goal_theme_id);
}

function getGoalThemeForTask(task){
  const target = getGoalById(task?.goal_id);
  return target ? getGoalThemeForTarget(target) : null;
}

function milestoneStatusLabel(goal){
  if(goal?.is_cancelled) return 'Cancelled';
  if(goal?.is_done) return 'Completed';
  return 'Pending';
}

function isMatchingTaskPlanItem(item, taskId, statuses = null){
  if(!item || item.item_type !== 'task' || item.task_id !== taskId) return false;
  if(Array.isArray(statuses) && statuses.length) return statuses.includes(item.status);
  return true;
}

function getCurrentTaskItem(taskId, statuses = ['planned','done']){
  return state.currentDateItems.find(item => isMatchingTaskPlanItem(item, taskId, statuses)) || null;
}

function getCarryoverTaskItem(taskId, statuses = ['planned']){
  if(getSelectedDate() !== todayStr()) return null;
  return state.carryoverTaskItems.find(item => isMatchingTaskPlanItem(item, taskId, statuses)) || null;
}

function buildTaskPlanItemLookup(){
  const currentByTaskId = new Map();
  const carryoverByTaskId = new Map();

  state.currentDateItems.forEach(item => {
    if(item?.item_type !== 'task' || !item.task_id) return;
    if(!currentByTaskId.has(item.task_id)) currentByTaskId.set(item.task_id, []);
    currentByTaskId.get(item.task_id).push(item);
  });

  if(getSelectedDate() === todayStr()){
    state.carryoverTaskItems.forEach(item => {
      if(item?.item_type !== 'task' || !item.task_id) return;
      if(!carryoverByTaskId.has(item.task_id)) carryoverByTaskId.set(item.task_id, []);
      carryoverByTaskId.get(item.task_id).push(item);
    });
  }

  return { currentByTaskId, carryoverByTaskId };
}

function findTaskPlanItem(items, taskId, statuses = null){
  if(!Array.isArray(items) || !items.length) return null;
  return items.find(item => isMatchingTaskPlanItem(item, taskId, statuses)) || null;
}

function getTaskById(taskId){
  return state.tasks.find(task => task.id === taskId) || null;
}

function syncTaskSnapshots(taskId, updates = {}){
  const syncItem = item => {
    if(item.task_id !== taskId) return;
    if(Object.prototype.hasOwnProperty.call(updates, 'title')) item.title_snapshot = updates.title;
    if(Object.prototype.hasOwnProperty.call(updates, 'category')) item.category_snapshot = updates.category;
  };
  state.currentDateItems.forEach(syncItem);
  state.carryoverTaskItems.forEach(syncItem);
}

function mergeCurrentDateItem(itemId, updates = {}){
  let merged = null;
  state.currentDateItems = state.currentDateItems.map(item => {
    if(item.id !== itemId) return item;
    merged = { ...item, ...updates };
    return merged;
  });
  return merged;
}

function upsertCurrentDateItem(nextItem){
  if(!nextItem?.id) return null;
  const index = state.currentDateItems.findIndex(item => item.id === nextItem.id);
  if(index === -1){
    state.currentDateItems.push(nextItem);
    return nextItem;
  }
  state.currentDateItems[index] = { ...state.currentDateItems[index], ...nextItem };
  return state.currentDateItems[index];
}

function renderTaskPanels(){
  renderTodos();
  renderTodayTodos();
  renderSummaryPills();
}

function renderTaskSection(){
  renderSummaryPills();
  renderGoals();
  renderMilestones();
  renderTodos();
  renderEvents();
}

function renderScheduleSection(){
  renderSummaryPills();
  renderScheduleQuickActivities();
  renderSelectedDateEvents();
  renderTodayTodos();
  renderSched(getSelectedDate());
}

function renderCurrentSection(){
  if(currentSection === 'habits'){
    renderSummaryPills();
    if(typeof renderHabitsSection === 'function') renderHabitsSection();
    return;
  }
  if(currentSection === 'tasks'){
    renderTaskSection();
    return;
  }
  renderScheduleSection();
}

function comparePlanItemOrder(a, b){
  const aSort = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
  const bSort = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
  if(aSort !== bSort) return aSort - bSort;
  const aCreated = String(a?.created_at || a?.source_plan_date || '');
  const bCreated = String(b?.created_at || b?.source_plan_date || '');
  if(aCreated !== bCreated) return aCreated.localeCompare(bCreated);
  return String(a?.title_snapshot || '').localeCompare(String(b?.title_snapshot || ''));
}

function getMovableTaskSourceItem(taskId, sourceItemId = null){
  if(sourceItemId){
    const exactItem = state.currentDateItems.find(item =>
      item.id === sourceItemId && isMatchingTaskPlanItem(item, taskId, ['planned', 'done'])
    );
    if(exactItem){
      return {
        ...exactItem,
        source_plan_date: getSelectedDate(),
        is_carryover: false,
      };
    }
  }

  const currentItem = getCurrentTaskItem(taskId, ['planned', 'done']);
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

function getTaskView(task, lookup = null){
  const currentItems = lookup?.currentByTaskId?.get(task.id) || null;
  const carryoverItems = lookup?.carryoverByTaskId?.get(task.id) || null;
  const currentTaskItem = currentItems
    ? findTaskPlanItem(currentItems, task.id, ['planned', 'done', 'cancelled', 'moved'])
    : getCurrentTaskItem(task.id, ['planned', 'done', 'cancelled', 'moved']);
  const currentPlannedItem = currentTaskItem?.status === 'planned' ? currentTaskItem : null;
  const carryoverItem = currentTaskItem
    ? null
    : carryoverItems
      ? findTaskPlanItem(carryoverItems, task.id, ['planned'])
      : getCarryoverTaskItem(task.id, ['planned']);
  const dayItem = task.is_done || task.is_cancelled ? null : (currentPlannedItem || carryoverItem);
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

function getTodayTodoView(item){
  const task = getTaskById(item.task_id);
  return {
    ...item,
    task,
    title_snapshot: task?.title || item.title_snapshot || '',
    category_snapshot: task?.category || item.category_snapshot || '',
    recurrenceSummary: recurrenceSummary(task),
  };
}

function renderTaskTitle(task){
  const summary = recurrenceDescription(task);
  const recurrenceMeta = summary
    ? `<div class="mu" style="font-size:10.5px;margin-top:2px;display:flex;align-items:center;gap:4px"><i class="ti ti-repeat" style="font-size:11px"></i>${esc(summary)}</div>`
    : '';
  return `<div>${esc(task.title)}${recurrenceMeta}</div>`;
}

function renderTaskHierarchyMeta(task){
  const target = getGoalById(task.goal_id);
  const goalTheme = target ? getGoalThemeForTarget(target) : null;
  const parts = [];
  if(target?.title) parts.push(`Milestone: ${target.title}`);
  if(goalTheme?.title) parts.push(`Goal: ${goalTheme.title}`);
  if(!parts.length) return '';
  return `<div class="mu" style="font-size:10.5px;margin-top:2px">${esc(parts.join(' • '))}</div>`;
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

function syncTaskRecurrenceEditorFields(){
  const repeatEl = document.getElementById('m-task-repeat');
  const weekdayGroup = document.getElementById('m-task-weekday-group');
  const monthDayGroup = document.getElementById('m-task-monthday-group');
  const repeatValue = repeatEl?.value || 'none';
  if(weekdayGroup) weekdayGroup.style.display = repeatValue === 'weekly' ? '' : 'none';
  if(monthDayGroup) monthDayGroup.style.display = repeatValue === 'monthly' ? '' : 'none';
}

function applyTaskPayload(taskId, payload){
  const task = state.tasks.find(item => item.id === taskId);
  if(!task || !payload || payload.error) return task;
  Object.assign(task, payload);
  syncTaskSnapshots(taskId, { title: task.title, category: task.category });
  return task;
}

function normalizeSearch(value){
  return String(value || '').trim().toLowerCase();
}

function updatePlannerFilter(group, field, value){
  if(!plannerFilters[group]) return;
  plannerFilters[group][field] = value || '';
  if(group === 'goals') renderGoals();
  else if(group === 'milestones') renderMilestones();
  else if(group === 'todos') renderTodos();
  else if(group === 'events') renderEvents();
}

function resetPlannerFilter(group){
  if(!plannerFilters[group]) return;
  Object.keys(plannerFilters[group]).forEach(key => { plannerFilters[group][key] = ''; });
  const mappings = {
    goals: ['goal-search'],
    milestones: ['ms-search'],
    todos: ['td-search', 'td-filter'],
    events: ['ev-search', 'ev-cat-filter'],
  };
  (mappings[group] || []).forEach(id => {
    const el = document.getElementById(id);
    if(el) el.value = '';
  });
  if(group === 'goals') renderGoals();
  else if(group === 'milestones') renderMilestones();
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
  else if(group === 'milestones') renderMilestones();
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
  const withViews = tasks.map(task => task.dayItem !== undefined ? task : getTaskView(task));
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
      : sort.field === 'deadline' ? b.deadline
      : sort.field === 'created_at' ? b.created_at
      : sort.field === 'completed_at' ? b.completed_at
      : null;
    return compareValues(aValue, bValue, sort.dir);
  });
}

function sortMilestoneList(goals){
  const sort = plannerSortState.milestones;
  const milestones = [...goals];
  if(sort.field === 'priority'){
    return milestones.sort((a,b) => {
      const score = goal => (goal.is_urgent ? 4 : 0) + (goal.is_important ? 2 : 0);
      const result = compareValues(score(a), score(b), sort.dir);
      if(result) return result;
      return compareValues(a.target_completion_date || '9999-12-31', b.target_completion_date || '9999-12-31', 'asc');
    });
  }
  return milestones.sort((a,b) => {
    const aValue = sort.field === 'title' ? a.title
      : sort.field === 'goal' ? (getGoalThemeForTarget(a)?.title || '')
      : sort.field === 'todo_count' ? getMilestoneTodoCount(a.id)
      : sort.field === 'deadline' ? a.target_completion_date
      : sort.field === 'important' ? Number(!!a.is_important)
      : sort.field === 'urgent' ? Number(!!a.is_urgent)
      : sort.field === 'created_at' ? a.created_at
      : sort.field === 'completed_at' ? a.completed_at
      : null;
    const bValue = sort.field === 'title' ? b.title
      : sort.field === 'goal' ? (getGoalThemeForTarget(b)?.title || '')
      : sort.field === 'todo_count' ? getMilestoneTodoCount(b.id)
      : sort.field === 'deadline' ? b.target_completion_date
      : sort.field === 'important' ? Number(!!b.is_important)
      : sort.field === 'urgent' ? Number(!!b.is_urgent)
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
  refreshPlannerSelectOptions();
}

function refreshPlannerSelectOptions(){
  const goalThemeOptions = ['<option value="">— Goal —</option>'].concat(
    state.goalThemes.filter(goalTheme => !goalTheme.is_done && !goalTheme.is_cancelled)
      .map(goalTheme => `<option value="${goalTheme.id}">${esc(goalTheme.title)}</option>`)
  ).join('');
  const targetOptions = ['<option value="">— Milestone —</option>'].concat(
    state.goals.filter(goal => !goal.is_done && !goal.is_cancelled)
      .map(goal => `<option value="${goal.id}">${esc(goal.title)}</option>`)
  ).join('');
  const ctGoalEl = document.getElementById('ct-goal');
  if(ctGoalEl) ctGoalEl.innerHTML = goalThemeOptions;
  const msGoalEl = document.getElementById('ms-goal');
  if(msGoalEl) msGoalEl.innerHTML = goalThemeOptions;
  const tdCatEl = document.getElementById('td-cat');
  if(tdCatEl) tdCatEl.innerHTML = CATS.map(cat => `<option>${esc(cat)}</option>`).join('');
  const tdFilterEl = document.getElementById('td-filter');
  if(tdFilterEl) tdFilterEl.innerHTML = '<option value="">All categories</option>' + CATS.map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('');
  const tdGoalEl = document.getElementById('td-goal');
  if(tdGoalEl) tdGoalEl.innerHTML = targetOptions;
  const evCatFilterEl = document.getElementById('ev-cat-filter');
  if(evCatFilterEl) evCatFilterEl.innerHTML = '<option value="">All categories</option>' + EVENT_CATS.map(cat => `<option value="${esc(cat)}">${esc(cat)}</option>`).join('');
  syncInlineTaskRecurrenceFields();
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
      const [goalThemes, goals, tasks, events] = await Promise.all([
        apiGet('/goal-themes'),
        apiGet('/goals'),
        apiGet('/tasks'),
        apiGet('/events'),
      ]);

      state.goalThemes = goalThemes || [];
      state.goals = goals || [];
      state.tasks = tasks || [];
      state.events = events || [];
      state.goalThemeExpanded = Object.fromEntries(state.goalThemes.map(goalTheme => [goalTheme.id, false]));
      await loadCurrentDateItems();
    } catch (error){
      plannerLoadError = error.message;
      state.goalThemes = [];
      state.goals = [];
      state.tasks = [];
      state.events = [];
      state.currentDateItems = [];
      state.carryoverTaskItems = [];
      state.currentPlanId = null;
      state.goalThemeExpanded = {};
      if(schemaNotice) schemaNotice.innerHTML = `<div class="notice"><strong>Unable to load planner data.</strong> ${esc(error.message)}.</div>`;
      if(schedGrid) schedGrid.innerHTML = '<div class="empty-state">Planner data could not be loaded.</div>';
    }

    try{
      if(typeof loadHabitData === 'function') await loadHabitData();
    } catch (error){
      console.warn('Habit data load error:', error);
    }

    refreshPlannerSelectOptions();
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

  await ensureRecurringTasksForSelectedDate(selectedDate);
  await loadCarryoverTaskItems(selectedDate);
}

async function ensureRecurringTasksForSelectedDate(selectedDate){
  const recurringDueTasks = state.tasks.filter(task =>
    task?.recurrence?.repeat_unit &&
    task.deadline === selectedDate &&
    !task.is_done &&
    !task.is_cancelled &&
    task.is_active !== false
  );
  if(!recurringDueTasks.length) return;

  let changed = false;
  const currentItemsByTaskId = new Map(
    state.currentDateItems
      .filter(item => item.item_type === 'task' && item.task_id)
      .map(item => [item.task_id, item])
  );

  for(const task of recurringDueTasks){
    const existingItem = currentItemsByTaskId.get(task.id);
    if(existingItem){
      if(!existingItem.is_today_focus){
        await apiPut('/daily-plan-items/' + existingItem.id, {
          is_today_focus: true,
          updated_at: new Date().toISOString(),
        });
        changed = true;
      }
      continue;
    }

    await ensureTaskPlannerItem(task.id, {
      templateItem: {
        is_today_focus: true,
        is_important: false,
        is_urgent: false,
        is_highlight: false,
      },
    });
    changed = true;
  }

  if(!changed) return;
  const refreshed = await apiGet('/daily-plans/' + selectedDate);
  state.currentPlanId = refreshed.plan ? refreshed.plan.id : null;
  state.currentDateItems = refreshed.items || [];
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
  renderCurrentSection();
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
  if(typeof closeMobileSidebar === 'function') closeMobileSidebar();
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
    return;
  }
  updateTopbarForSection();
  renderCurrentSection();
}

function switchTab(tab, btn){
  currentTab = tab;
  document.querySelectorAll('#tab-bar-tasks .tab').forEach(node => node.classList.remove('active'));
  btn.classList.add('active');
  ['goals','milestones','todos','events'].forEach(view => {
    const el = document.getElementById(`view-${view}`);
    if(el) el.classList.toggle('active', view === tab);
  });
  const labels = { goals:'+ Add goal', milestones:'+ Add milestone', todos:'+ Add to-do', events:'+ Add event' };
  const addBtn = document.getElementById('topbar-add-btn');
  if(addBtn) addBtn.textContent = labels[tab] || '+ Add';
  updateTopbarForSection();
}

function topbarAdd(){
  if(currentSection === 'habits'){
    if(typeof openModal === 'function') openModal('habit');
  } else if(currentTab === 'goals') openModal('goaltheme');
  else if(currentTab === 'milestones') openModal('coretask');
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

function switchMilestoneTab(tab, btn){
  milestoneTab = tab;
  document.querySelectorAll('#view-milestones .seg-btn').forEach(node => node.classList.remove('active'));
  btn.classList.add('active');
  const pendingCard = document.getElementById('milestones-pending-card');
  const doneCard = document.getElementById('milestones-done-card');
  const cancelledCard = document.getElementById('milestones-cancelled-card');
  const addRow = document.getElementById('milestones-add-row');
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

function getTargetsForGoalTheme(goalThemeId){
  return sortGoalsList(state.goals.filter(goal => goal.goal_theme_id === goalThemeId));
}

function toggleGoalThemeExpanded(goalThemeId){
  state.goalThemeExpanded[goalThemeId] = !state.goalThemeExpanded[goalThemeId];
  renderGoals();
}

function renderTargetRows(goalTheme){
  const targets = getTargetsForGoalTheme(goalTheme.id);
  const targetOptionsLabel = goalTheme.title || 'Goal';
  const rows = targets.map(target => `
    <div class="goal-target-row ${target.is_urgent || target.is_important ? 'hl-row' : ''}">
      <div class="goal-target-main">
        <input class="ec" value="${esc(target.title)}" onchange="editGoal('${target.id}','title',this.value)" />
        <div class="goal-target-meta">
          <span class="mu">Milestone</span>
          <span class="mu">${target.target_completion_date ? `Deadline: ${esc(fmtFull(target.target_completion_date))}` : 'No deadline'}</span>
        </div>
      </div>
      <div class="goal-target-actions">
        <input class="ec mu" type="date" value="${target.target_completion_date || ''}" onchange="editGoal('${target.id}','target_completion_date',this.value)" />
        <div class="flag f-imp ${target.is_important ? 'on' : ''}" onclick="toggleGoalFlag('${target.id}','important')" title="Important">${icoI(target.is_important)}</div>
        <div class="flag f-urg ${target.is_urgent ? 'on' : ''}" onclick="toggleGoalFlag('${target.id}','urgent')" title="Urgent">${icoU(target.is_urgent)}</div>
        <div class="cb ${target.is_done ? 'checked' : ''}" onclick="toggleGoal('${target.id}')" title="Done"></div>
        <div class="cb ${target.is_cancelled ? 'checked' : ''}" onclick="toggleGoalCancelled('${target.id}')" title="Cancelled"></div>
        <button class="del-btn" onclick="deleteGoal('${target.id}')" title="Delete milestone">×</button>
      </div>
    </div>
  `).join('');
  const emptyState = '<div class="empty-state">No milestones yet for this goal.</div>';
  return `
    <div class="goal-target-list">
      ${rows || emptyState}
      <div class="goal-target-add-row">
        <input id="target-name-${goalTheme.id}" class="f1" placeholder="Add a milestone under ${esc(targetOptionsLabel)}" onkeydown="if(event.key==='Enter') addTargetForGoalTheme('${goalTheme.id}')" />
        <input id="target-date-${goalTheme.id}" type="date" />
        <button class="btn-primary" type="button" onclick="addTargetForGoalTheme('${goalTheme.id}')">Add milestone</button>
      </div>
    </div>
  `;
}

function renderGoalThemeCard(goalTheme){
  const expanded = state.goalThemeExpanded[goalTheme.id] !== false;
  const targets = getTargetsForGoalTheme(goalTheme.id);
  return `
    <div class="goal-theme-card ${areaChipClass(goalTheme.title)}">
      <div class="goal-theme-card-head">
        <div class="goal-theme-card-title">
          <button class="btn-ghost goal-theme-toggle" type="button" onclick="toggleGoalThemeExpanded('${goalTheme.id}')">${expanded ? '−' : '+'}</button>
          <div class="goal-theme-label ${areaChipClass(goalTheme.title)}">
            <span class="goal-theme-label-icon"><i class="ti ${areaIconClass(goalTheme.title)}"></i></span>
            <span class="goal-theme-label-text">${esc(goalTheme.title)}</span>
          </div>
        </div>
        <div class="goal-theme-card-actions">
          <span class="mu">${targets.length} milestone${targets.length === 1 ? '' : 's'}</span>
          <span class="goal-theme-action-indicator" title="Completed"><i class="ti ti-check"></i></span>
          <div class="cb ${goalTheme.is_done ? 'checked' : ''}" onclick="toggleGoalTheme('${goalTheme.id}')" title="Completed"></div>
          <span class="goal-theme-action-indicator" title="Cancelled"><i class="ti ti-x"></i></span>
          <div class="cb ${goalTheme.is_cancelled ? 'checked' : ''}" onclick="toggleGoalThemeCancelled('${goalTheme.id}')" title="Cancelled"></div>
          <button class="del-btn" onclick="deleteGoalTheme('${goalTheme.id}')" title="Delete goal">×</button>
        </div>
      </div>
      ${expanded ? `
        <div class="goal-theme-card-body">
          <textarea class="goal-theme-notes" placeholder="Notes for this goal" onchange="editGoalTheme('${goalTheme.id}','notes',this.value)">${esc(goalTheme.notes || '')}</textarea>
          ${renderTargetRows(goalTheme)}
        </div>
      ` : ''}
    </div>
  `;
}

function renderGoals(){
  const search = normalizeSearch(plannerFilters.goals.search);
  const matchesGoalThemeFilter = goalTheme => {
    if(!search) return true;
    const targets = getTargetsForGoalTheme(goalTheme.id);
    return [goalTheme.title, goalTheme.notes, ...targets.map(target => target.title)]
      .some(value => normalizeSearch(value).includes(search));
  };
  const pendingGoalThemes = state.goalThemes.filter(goalTheme => !goalTheme.is_done && !goalTheme.is_cancelled && matchesGoalThemeFilter(goalTheme));
  const doneGoalThemes = state.goalThemes.filter(goalTheme => goalTheme.is_done && !goalTheme.is_cancelled && matchesGoalThemeFilter(goalTheme));
  const cancelledGoalThemes = state.goalThemes.filter(goalTheme => goalTheme.is_cancelled && matchesGoalThemeFilter(goalTheme));

  const ctActive = document.getElementById('ct-active');
  const ctDone = document.getElementById('ct-done');
  const ctCancelled = document.getElementById('ct-cancelled');
  const ctTotal = document.getElementById('ct-total');
  if(ctActive) ctActive.textContent = pendingGoalThemes.length;
  if(ctDone) ctDone.textContent = doneGoalThemes.length;
  if(ctCancelled) ctCancelled.textContent = cancelledGoalThemes.length;
  if(ctTotal) ctTotal.textContent = state.goalThemes.length;

  const goalsCards = document.getElementById('goals-cards');
  const goalsDoneCards = document.getElementById('goals-done-cards');
  const goalsCancelledCards = document.getElementById('goals-cancelled-cards');
  if(goalsCards) goalsCards.innerHTML = pendingGoalThemes.length ? pendingGoalThemes.map(renderGoalThemeCard).join('') : '<div class="empty-state">No active goals yet.</div>';
  if(goalsDoneCards) goalsDoneCards.innerHTML = doneGoalThemes.length ? doneGoalThemes.map(renderGoalThemeCard).join('') : '<div class="empty-state">No completed goals.</div>';
  if(goalsCancelledCards) goalsCancelledCards.innerHTML = cancelledGoalThemes.length ? cancelledGoalThemes.map(renderGoalThemeCard).join('') : '<div class="empty-state">No cancelled goals.</div>';
}

function renderMilestoneTitle(goal){
  return `<input class="ec" style="${goal.is_urgent || goal.is_important ? 'font-weight:600' : ''}" value="${esc(goal.title)}" onchange="editGoal('${goal.id}','title',this.value)" />`;
}

function getMilestoneTodoCount(goalId){
  return state.tasks.filter(task => task.goal_id === goalId && task.is_cancelled !== true).length;
}

function renderMilestones(){
  const search = normalizeSearch(plannerFilters.milestones.search);
  const matchesMilestoneFilter = goal => {
    if(!search) return true;
    const goalTheme = getGoalThemeForTarget(goal);
    return [goal.title, goalTheme?.title, goal.target_completion_date]
      .some(value => normalizeSearch(value).includes(search));
  };
  const pendingMilestones = sortMilestoneList(state.goals.filter(goal => !goal.is_done && !goal.is_cancelled && matchesMilestoneFilter(goal)));
  const doneMilestones = sortMilestoneList(state.goals.filter(goal => goal.is_done && !goal.is_cancelled && matchesMilestoneFilter(goal)));
  const cancelledMilestones = sortMilestoneList(state.goals.filter(goal => goal.is_cancelled && matchesMilestoneFilter(goal)));

  const msPending = document.getElementById('ms-pending');
  const msDone = document.getElementById('ms-done');
  const msCancelled = document.getElementById('ms-cancelled');
  const msTotal = document.getElementById('ms-total');
  if(msPending) msPending.textContent = state.goals.filter(goal => !goal.is_done && !goal.is_cancelled).length;
  if(msDone) msDone.textContent = state.goals.filter(goal => goal.is_done && !goal.is_cancelled).length;
  if(msCancelled) msCancelled.textContent = state.goals.filter(goal => goal.is_cancelled).length;
  if(msTotal) msTotal.textContent = state.goals.length;

  const pendingBody = document.getElementById('milestones-pending-tbody');
  if(pendingBody){
    pendingBody.innerHTML = pendingMilestones.length ? pendingMilestones.map(goal => `
      <tr class="${goal.is_urgent || goal.is_important ? 'hl-row' : ''}">
        <td class="c"><div class="cb" onclick="toggleGoal('${goal.id}')"></div></td>
        <td style="min-width:180px">${renderMilestoneTitle(goal)}</td>
        <td class="c"><div class="flag f-imp ${goal.is_important ? 'on' : ''}" onclick="toggleGoalFlag('${goal.id}','important')">${icoI(goal.is_important)}</div></td>
        <td class="c"><div class="flag f-urg ${goal.is_urgent ? 'on' : ''}" onclick="toggleGoalFlag('${goal.id}','urgent')">${icoU(goal.is_urgent)}</div></td>
        <td>${getGoalThemeForTarget(goal)?.title ? areaChip(getGoalThemeForTarget(goal).title) : '<span class="mu">—</span>'}</td>
        <td class="mu">${getMilestoneTodoCount(goal.id)}</td>
        <td class="mu"><input class="ec mu" type="date" value="${goal.target_completion_date || ''}" onchange="editGoal('${goal.id}','target_completion_date',this.value)" /></td>
        <td class="mu" style="font-size:11px">${fmtFull(goal.created_at?.slice(0,10))}</td>
        <td class="c"><button class="del-btn" onclick="deleteGoal('${goal.id}')">×</button></td>
        <td class="c"><div class="cb ${goal.is_cancelled ? 'checked' : ''}" onclick="toggleGoalCancelled('${goal.id}')"></div></td>
      </tr>
    `).join('') : '<tr><td colspan="10"><div class="empty-state">No pending milestones.</div></td></tr>';
  }

  const doneBody = document.getElementById('milestones-done-tbody');
  if(doneBody){
    doneBody.innerHTML = doneMilestones.length ? doneMilestones.map(goal => `
      <tr>
        <td class="c"><div class="cb checked" onclick="toggleGoal('${goal.id}')"></div></td>
        <td>${renderMilestoneTitle(goal)}</td>
        <td>${getGoalThemeForTarget(goal)?.title ? areaChip(getGoalThemeForTarget(goal).title) : '<span class="mu">—</span>'}</td>
        <td class="mu">${getMilestoneTodoCount(goal.id)}</td>
        <td class="mu" style="font-size:11.5px">${goal.target_completion_date ? fmtFull(goal.target_completion_date) : 'No deadline'}</td>
        <td class="mu" style="font-size:11px">${fmtFull(goal.created_at?.slice(0,10))}</td>
        <td class="mu" style="font-size:11px">${fmtFull(goal.completed_at)}</td>
        <td class="c"><button class="del-btn" onclick="deleteGoal('${goal.id}')">×</button></td>
        <td class="c"><div class="cb ${goal.is_cancelled ? 'checked' : ''}" onclick="toggleGoalCancelled('${goal.id}')"></div></td>
      </tr>
    `).join('') : '<tr><td colspan="9"><div class="empty-state">No completed milestones.</div></td></tr>';
  }

  const cancelledBody = document.getElementById('milestones-cancelled-tbody');
  if(cancelledBody){
    cancelledBody.innerHTML = cancelledMilestones.length ? cancelledMilestones.map(goal => `
      <tr>
        <td class="c"><div class="cb ${goal.is_done ? 'checked' : ''}" onclick="toggleGoal('${goal.id}')"></div></td>
        <td>${renderMilestoneTitle(goal)}</td>
        <td>${getGoalThemeForTarget(goal)?.title ? areaChip(getGoalThemeForTarget(goal).title) : '<span class="mu">—</span>'}</td>
        <td class="mu">${getMilestoneTodoCount(goal.id)}</td>
        <td class="mu" style="font-size:11.5px">${goal.target_completion_date ? fmtFull(goal.target_completion_date) : 'No deadline'}</td>
        <td class="mu" style="font-size:11px">${fmtFull(goal.created_at?.slice(0,10))}</td>
        <td class="c"><button class="del-btn" onclick="deleteGoal('${goal.id}')">×</button></td>
        <td class="c"><div class="cb checked" onclick="toggleGoalCancelled('${goal.id}')"></div></td>
      </tr>
    `).join('') : '<tr><td colspan="8"><div class="empty-state">No cancelled milestones.</div></td></tr>';
  }
}

async function addMilestoneInline(){
  const titleEl = document.getElementById('ms-name');
  const goalEl = document.getElementById('ms-goal');
  const deadlineEl = document.getElementById('ms-deadline');
  const title = titleEl ? titleEl.value.trim() : '';
  if(!title) return;
  try{
    const goalThemeId = goalEl?.value || null;
    const data = await apiPost('/goals', {
      title,
      goal_theme_id: goalThemeId,
      area: getGoalThemeById(goalThemeId)?.title || null,
      target_completion_date: deadlineEl?.value || null,
      sort_order: state.goals.length,
      is_important: false,
      is_urgent: false,
      is_done: false,
      is_cancelled: false,
      is_active: true,
    });
    state.goals.push(data);
    if(titleEl) titleEl.value = '';
    if(goalEl) goalEl.value = '';
    if(deadlineEl) deadlineEl.value = '';
    refreshPlannerSelectOptions();
    renderGoals();
    renderMilestones();
    renderTodos();
    showToast('Milestone added');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function addTargetForGoalTheme(goalThemeId){
  const titleEl = document.getElementById(`target-name-${goalThemeId}`);
  const dateEl = document.getElementById(`target-date-${goalThemeId}`);
  const title = titleEl ? titleEl.value.trim() : '';
  if(!title) return;
  try{
    const data = await apiPost('/goals', {
      title,
      goal_theme_id: goalThemeId,
      area: getGoalThemeById(goalThemeId)?.title || null,
      target_completion_date: dateEl?.value || null,
      sort_order: state.goals.length,
      is_important: false,
      is_urgent: false,
      is_done: false,
      is_cancelled: false,
      is_active: true,
    });
    state.goals.push(data);
    if(titleEl) titleEl.value = '';
    if(dateEl) dateEl.value = '';
    refreshPlannerSelectOptions();
    renderGoals();
    renderMilestones();
    renderTodos();
    showToast('Milestone added');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function editGoal(goalId, field, value){
  const updates = { updated_at: new Date().toISOString() };
  updates[field] = field === 'title' ? value.trim() : (value || null);
  try{
    await apiPut('/goals/' + goalId, updates);
    const goal = getGoalById(goalId);
    if(goal) Object.assign(goal, updates);
    refreshPlannerSelectOptions();
    renderGoals();
    renderMilestones();
    renderTodos();
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
    refreshPlannerSelectOptions();
    renderGoals();
    renderMilestones();
    renderTodos();
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
    refreshPlannerSelectOptions();
    renderGoals();
    renderMilestones();
    renderTodos();
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
    renderMilestones();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function deleteGoal(goalId){
  try{
    await apiDelete('/goals/' + goalId);
    state.goals = state.goals.filter(goal => goal.id !== goalId);
    state.tasks = state.tasks.map(task => task.goal_id === goalId ? { ...task, goal_id: null } : task);
    refreshPlannerSelectOptions();
    renderGoals();
    renderMilestones();
    renderTodos();
    showToast('Milestone deleted');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function editGoalTheme(goalThemeId, field, value){
  const updates = { updated_at: new Date().toISOString() };
  updates[field] = field === 'title' ? value.trim() : (value || null);
  try{
    await apiPut('/goal-themes/' + goalThemeId, updates);
    const goalTheme = getGoalThemeById(goalThemeId);
    if(goalTheme) Object.assign(goalTheme, updates);
    if(field === 'title'){
      state.goals.forEach(goal => {
        if(goal.goal_theme_id === goalThemeId) goal.goal_theme_title = updates.title;
      });
    }
    refreshPlannerSelectOptions();
    renderGoals();
    renderMilestones();
    renderTodos();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function toggleGoalTheme(goalThemeId){
  const goalTheme = getGoalThemeById(goalThemeId);
  if(!goalTheme) return;
  const nextValue = !goalTheme.is_done;
  try{
    await apiPut('/goal-themes/' + goalThemeId, { is_done: nextValue, is_cancelled: false, updated_at: new Date().toISOString() });
    goalTheme.is_done = nextValue;
    goalTheme.is_cancelled = false;
    refreshPlannerSelectOptions();
    renderGoals();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function toggleGoalThemeCancelled(goalThemeId){
  const goalTheme = getGoalThemeById(goalThemeId);
  if(!goalTheme) return;
  const nextValue = !goalTheme.is_cancelled;
  try{
    await apiPut('/goal-themes/' + goalThemeId, { is_cancelled: nextValue, is_done: nextValue ? false : goalTheme.is_done, updated_at: new Date().toISOString() });
    goalTheme.is_cancelled = nextValue;
    if(nextValue) goalTheme.is_done = false;
    refreshPlannerSelectOptions();
    renderGoals();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function deleteGoalTheme(goalThemeId){
  try{
    await apiDelete('/goal-themes/' + goalThemeId);
    state.goalThemes = state.goalThemes.filter(goalTheme => goalTheme.id !== goalThemeId);
    state.goals.forEach(goal => {
      if(goal.goal_theme_id === goalThemeId){
        goal.goal_theme_id = null;
        goal.goal_theme_title = null;
      }
    });
    refreshPlannerSelectOptions();
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
  const lookup = buildTaskPlanItemLookup();
  const taskViews = state.tasks.map(task => getTaskView(task, lookup));
  let pending = taskViews.filter(task => !task.is_done && !task.is_cancelled);
  let done = taskViews.filter(task => task.is_done && !task.is_cancelled);
  let cancelled = taskViews.filter(task => task.is_cancelled);
  const matchesTaskFilter = taskView => {
    if(filter && taskView.category !== filter) return false;
    if(search){
      const targetTitle = getGoalById(taskView.goal_id)?.title || '';
      const goalThemeTitle = getGoalThemeForTask(taskView)?.title || '';
      if(![taskView.title, taskView.category, targetTitle, goalThemeTitle].some(value => normalizeSearch(value).includes(search))) return false;
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
      pendingBody.innerHTML = '<tr><td colspan="14"><div class="empty-state">Nothing pending.</div></td></tr>';
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
        const target = getGoalById(task.goal_id);
        const goalTheme = getGoalThemeForTask(task);
        const canMove = !!task.dayItem && task.dayItem.status === 'planned';
        const recurrenceText = recurrenceDescription(task);
        const recurrenceLabel = recurrenceCycleLabel(task);
        return `
          <tr class="${highlighted ? 'hl-row' : ''}${task.highlight ? ' hl-bg' : ''}">
            <td class="c"><div class="cb" onclick="toggleTodo('${task.id}')"></div></td>
            <td><select class="isel chip-select ${catChipClass(task.category)}" onchange="editTask('${task.id}','category',this.value)">${CATS.map(cat => `<option value="${esc(cat)}"${task.category === cat ? ' selected' : ''}>${esc(cat)}</option>`).join('')}</select></td>
            <td style="min-width:140px">
              <div style="display:flex;flex-direction:column;gap:4px">
                <input class="ec" style="${highlighted ? 'font-weight:600' : ''}" value="${esc(task.title)}" onchange="editTask('${task.id}','title',this.value)" />
                ${recurrenceText ? `<span class="mu" style="font-size:10.5px;display:flex;align-items:center;gap:4px"><i class="ti ti-repeat" style="font-size:11px"></i>${esc(recurrenceText)}</span>` : ''}
                ${renderTaskHierarchyMeta(task)}
              </div>
            </td>
            <td class="c"><button class="recurrence-cycle ${recurrenceLabel !== 'N' ? 'active' : ''}" type="button" onclick="cycleTaskRecurrence('${task.id}')" title="${esc(recurrenceText || 'Not recurring')}">${recurrenceLabel}</button></td>
            <td class="c"><div class="flag f-today ${task.today ? 'on' : ''}" onclick="toggleFlag('${task.id}','today')">${icoT(task.today)}</div></td>
            <td class="c"><div class="flag f-imp ${task.important ? 'on' : ''}" onclick="toggleFlag('${task.id}','important')">${icoI(task.important)}</div></td>
            <td class="c"><div class="flag f-urg ${task.urgent ? 'on' : ''}" onclick="toggleFlag('${task.id}','urgent')">${icoU(task.urgent)}</div></td>
            <td><select class="isel" style="max-width:135px" onchange="editTaskGoal('${task.id}',this.value)">${goalOptions.replace(`value="${task.goal_id || ''}"`, `value="${task.goal_id || ''}" selected`)}</select></td>
            <td>${goalTheme ? `<span class="chip chip-gray">${esc(goalTheme.title)}</span>` : '<span class="mu">—</span>'}</td>
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
          <td>${renderTaskTitle(task)}${renderTaskHierarchyMeta(task)}</td>
          <td>${getGoalThemeForTask(task)?.title ? `<span class="chip chip-gray">${esc(getGoalThemeForTask(task).title)}</span>` : '<span class="mu">—</span>'}</td>
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
          <td>${renderTaskTitle(task)}${renderTaskHierarchyMeta(task)}</td>
          <td>${getGoalThemeForTask(task)?.title ? `<span class="chip chip-gray">${esc(getGoalThemeForTask(task).title)}</span>` : '<span class="mu">—</span>'}</td>
          <td class="mu" style="font-size:11.5px">${fmtFull(task.deadline)}</td>
          <td class="mu" style="font-size:11px">${fmtFull(task.created_at?.slice(0,10))}</td>
          <td class="c"><button class="del-btn" onclick="deleteTask('${task.id}')">×</button></td>
          <td class="c"><div class="cb checked" onclick="toggleTaskCancelled('${task.id}')"></div></td>
        </tr>
      `).join('');
    }
  }

  renderSummaryPills();
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
      goal_id: document.getElementById('td-goal')?.value || null,
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
    const goalEl = document.getElementById('td-goal');
    if(goalEl) goalEl.value = '';
    syncInlineTaskRecurrenceFields();
    renderTodos();
    showToast('To-do added');
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
    const payload = await apiPut('/tasks/' + taskId, updates);
    if(payload?.error) throw new Error(payload.error);
    applyTaskPayload(taskId, payload);
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

function openTaskRecurrenceModal(taskId){
  const task = getTaskById(taskId);
  if(!task){
    showToast('Task not found.', true);
    return;
  }
  const repeat = task.recurrence?.repeat_unit || 'none';
  const weekday = task.recurrence?.weekday ?? 0;
  const monthday = task.recurrence?.day_of_month ?? 1;
  const html = `
    <div class="form-grid">
      <div class="fg" style="grid-column:1/-1"><label>Task</label><input value="${esc(task.title)}" disabled></div>
      <div class="fg"><label>Repeat</label><select id="m-task-repeat" onchange="syncTaskRecurrenceEditorFields()">
        <option value="none"${repeat === 'none' ? ' selected' : ''}>No repeat</option>
        <option value="daily"${repeat === 'daily' ? ' selected' : ''}>Daily</option>
        <option value="weekly"${repeat === 'weekly' ? ' selected' : ''}>Weekly</option>
        <option value="monthly"${repeat === 'monthly' ? ' selected' : ''}>Monthly</option>
      </select></div>
      <div class="fg" id="m-task-weekday-group" style="display:none"><label>Weekday</label><select id="m-task-weekday">
        <option value="0"${weekday === 0 ? ' selected' : ''}>Monday</option><option value="1"${weekday === 1 ? ' selected' : ''}>Tuesday</option><option value="2"${weekday === 2 ? ' selected' : ''}>Wednesday</option>
        <option value="3"${weekday === 3 ? ' selected' : ''}>Thursday</option><option value="4"${weekday === 4 ? ' selected' : ''}>Friday</option><option value="5"${weekday === 5 ? ' selected' : ''}>Saturday</option>
        <option value="6"${weekday === 6 ? ' selected' : ''}>Sunday</option>
      </select></div>
      <div class="fg" id="m-task-monthday-group" style="display:none"><label>Day of month</label><select id="m-task-monthday">
        ${Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}"${monthday === index + 1 ? ' selected' : ''}>${ordinal(index + 1)}</option>`).join('')}
      </select></div>
    </div>
  `;
  configureModal('Edit repeat', html, 'Save', () => saveTaskRecurrence(taskId));
  syncTaskRecurrenceEditorFields();
}

async function saveTaskRecurrence(taskId){
  const task = getTaskById(taskId);
  if(!task) return;
  const repeat = document.getElementById('m-task-repeat')?.value || 'none';
  const recurrence = repeat === 'none' ? null : {
    repeat_unit: repeat,
    repeat_every: task.recurrence?.repeat_every || 1,
    weekday: repeat === 'weekly' ? Number(document.getElementById('m-task-weekday')?.value || 0) : null,
    day_of_month: repeat === 'monthly' ? Number(document.getElementById('m-task-monthday')?.value || 1) : null,
    start_date: task.recurrence?.start_date || task.deadline || todayStr(),
    is_active: true,
  };
  try{
    const payload = await apiPut('/tasks/' + taskId, { recurrence });
    if(payload?.error) throw new Error(payload.error);
    applyTaskPayload(taskId, payload);
    closeModal();
    renderTodos();
    renderTodayTodos();
    showToast(recurrence ? 'Repeat updated' : 'Repeat removed');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function setTaskRecurrencePreset(taskId, repeatUnit){
  const task = getTaskById(taskId);
  if(!task) return;
  if(task.recurrence?.repeat_unit === repeatUnit){
    openTaskRecurrenceModal(taskId);
    return;
  }
  const recurrence = inferTaskRecurrenceDefaults(task, repeatUnit);
  try{
    const payload = await apiPut('/tasks/' + taskId, { recurrence });
    if(payload?.error) throw new Error(payload.error);
    applyTaskPayload(taskId, payload);
    renderTodos();
    renderTodayTodos();
    showToast(`${repeatUnit === 'weekly' ? 'Weekly' : 'Monthly'} recurrence set`);
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function cycleTaskRecurrence(taskId){
  const task = getTaskById(taskId);
  if(!task) return;
  const nextUnit = nextRecurrenceUnit(task);
  const recurrence = nextUnit === 'none' ? null : inferTaskRecurrenceDefaults(task, nextUnit);
  try{
    const payload = await apiPut('/tasks/' + taskId, { recurrence });
    if(payload?.error) throw new Error(payload.error);
    applyTaskPayload(taskId, payload);
    renderTodos();
    renderTodayTodos();
    const label = nextUnit === 'none' ? 'Not recurring' : nextUnit === 'daily' ? 'Daily recurrence set' : nextUnit === 'weekly' ? 'Weekly recurrence set' : 'Monthly recurrence set';
    showToast(label);
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
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
      upsertCurrentDateItem(dayItem);
    }
    if(dayItem){
      const itemUpdates = nextDone
        ? { status: 'done', is_today_focus: preserveFocus ? true : false, is_highlight: false, updated_at: new Date().toISOString() }
        : { status: 'planned', is_today_focus: preserveFocus ? true : dayItem.is_today_focus, updated_at: new Date().toISOString() };
      await apiPut('/daily-plan-items/' + dayItem.id, itemUpdates);
      mergeCurrentDateItem(dayItem.id, itemUpdates);
    }
    state.carryoverTaskItems = state.carryoverTaskItems.filter(item => item.task_id !== taskId);
    renderTaskPanels();
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
        mergeCurrentDateItem(item.id, plannerUpdates);
      }
    }
    state.carryoverTaskItems = state.carryoverTaskItems.filter(item => item.task_id !== taskId);
    renderTaskPanels();
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
    if(!item){
      item = await ensureTaskPlannerItem(taskId, { templateItem: getCarryoverTaskItem(taskId) });
      upsertCurrentDateItem(item);
    }
    const nextValue = !item[dbField];
    await apiPut('/daily-plan-items/' + item.id, { [dbField]: nextValue, updated_at: new Date().toISOString() });
    mergeCurrentDateItem(item.id, { [dbField]: nextValue, updated_at: new Date().toISOString() });
    if(dbField === 'is_today_focus' && nextValue){
      state.carryoverTaskItems = state.carryoverTaskItems.filter(entry => entry.task_id !== taskId);
    }
    renderTaskPanels();
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
    renderTaskPanels();
    showToast('To-do deleted');
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
    .sort(comparePlanItemOrder)
    .concat(carryoverItems.sort(comparePlanItemOrder))
    .map(getTodayTodoView);
  const doneItems = taskItems.filter(item => item.status === 'done');
  const editBtn = document.getElementById('today-todo-edit-btn');
  if(editBtn){
    editBtn.classList.toggle('active', todayTodoEditMode);
    editBtn.innerHTML = todayTodoEditMode
      ? '<i class="ti ti-check" style="font-size:12px"></i> Done'
      : '<i class="ti ti-pencil" style="font-size:12px"></i> Edit';
  }

  const todoBody = document.getElementById('today-todo-tbody');
  if(todoBody){
    if(!todayItems.length){
      todoBody.innerHTML = `<tr><td colspan="5"><div class="empty-state">No focused items for ${fmtFull(selectedDate)}.</div></td></tr>`;
    } else {
      todoBody.innerHTML = todayItems.map(item => `
        <tr class="${item.is_highlight ? 'hl-bg' : ''}">
          <td class="c"><div class="cb" onclick="todayToggleDone('${item.task_id}')"></div></td>
          <td>${todayTodoEditMode?`<select class="isel chip-select ${catChipClass(item.category_snapshot)}" onchange="editTask('${item.task_id}','category',this.value)">${CATS.map(cat => `<option value="${esc(cat)}"${item.category_snapshot === cat ? ' selected' : ''}>${esc(cat)}</option>`).join('')}</select>`:catChip(item.category_snapshot)}</td>
          <td style="min-width:240px">${todayTodoEditMode?`<div class="today-task-edit-cell"><input class="ec today-task-title-input" style="${item.is_highlight ? 'font-weight:600' : ''}" value="${esc(item.title_snapshot)}" onchange="editTask('${item.task_id}','title',this.value)" /></div>`:`<button class="schedule-quick-fill${item.is_highlight ? ' is-highlight' : ''}" type="button" title="Click to add this task to the schedule" data-task-id="${esc(item.task_id)}" data-title="${esc(item.title_snapshot)}" onmousedown="event.preventDefault()" onclick="insertTodoIntoSchedule(this.dataset.taskId, this.dataset.title)">${esc(item.title_snapshot)}</button>`}</td>
          <td><div class="today-reorder-controls"><button class="btn-ghost" onclick="openMoveTaskModal('${item.task_id}','${item.id}')">Move</button><div class="today-reorder-buttons"><button class="today-reorder-btn" onclick="reorderTodayItem('${item.task_id}',-1)" ${todayItems[0]?.task_id===item.task_id?'disabled':''} title="Move up"><i class="ti ti-chevron-up"></i></button><button class="today-reorder-btn" onclick="reorderTodayItem('${item.task_id}',1)" ${todayItems[todayItems.length-1]?.task_id===item.task_id?'disabled':''} title="Move down"><i class="ti ti-chevron-down"></i></button></div></div></td>
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

function toggleTodayTodoEditMode(){
  todayTodoEditMode = !todayTodoEditMode;
  renderTodayTodos();
}

async function toggleHighlight(taskId){
  await toggleFlag(taskId, 'highlight');
}

async function reorderTodayItem(taskId, direction){
  if(busy) return;
  let item = getCurrentTaskItem(taskId);
  if(!item){
    item = await ensureTaskPlannerItem(taskId, { templateItem: getCarryoverTaskItem(taskId) });
    if(!item) return;
    await loadCurrentDateItems();
    item = getCurrentTaskItem(taskId);
  }
  if(!item) return;

  const visibleItems = state.currentDateItems
    .filter(entry => entry.item_type === 'task' && entry.status === 'planned' && entry.is_today_focus)
    .sort(comparePlanItemOrder);
  const index = visibleItems.findIndex(entry => entry.id === item.id);
  const nextIndex = index + direction;
  if(index === -1 || nextIndex < 0 || nextIndex >= visibleItems.length) return;

  const reordered = [...visibleItems];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(nextIndex, 0, moved);

  setBusy(true);
  try{
    for(let i = 0; i < reordered.length; i += 1){
      const entry = reordered[i];
      entry.sort_order = i;
      await apiPut('/daily-plan-items/' + entry.id, { sort_order: i, updated_at: new Date().toISOString() });
    }
    await loadCurrentDateItems();
    renderTodayTodos();
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  } finally {
    setBusy(false);
  }
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
    renderScheduleSection();
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

function getFocusedScheduleActivityInput(){
  const active = document.activeElement;
  if(!(active instanceof HTMLInputElement)) return null;
  if(!active.classList.contains('sched-cell-input')) return null;
  if(active.dataset.field !== 'title_snapshot') return null;
  return document.body.contains(active) ? active : null;
}

function rememberScheduleActivityFocus(input){
  if(!(input instanceof HTMLInputElement)) return;
  if(!input.classList.contains('sched-cell-input')) return;
  if(input.dataset.field !== 'title_snapshot') return;
  lastScheduleActivityFocus = {
    itemId: input.dataset.itemId || '',
    selectionStart: typeof input.selectionStart === 'number' ? input.selectionStart : (input.value || '').length,
    selectionEnd: typeof input.selectionEnd === 'number' ? input.selectionEnd : (input.value || '').length,
  };
}

function getRememberedScheduleActivityInput(){
  const itemId = lastScheduleActivityFocus?.itemId;
  if(!itemId) return null;
  const input = document.querySelector(`#sched-grid .sched-cell-input[data-item-id="${itemId}"][data-field="title_snapshot"]`);
  return input instanceof HTMLInputElement ? input : null;
}

function bindScheduleKeyboardNavigation(){
  if(scheduleKeyboardBound) return;
  scheduleKeyboardBound = true;

  document.addEventListener('focusin', event => {
    const target = event.target;
    if(target instanceof HTMLInputElement && target.classList.contains('sched-cell-input') && target.dataset.field === 'title_snapshot'){
      rememberScheduleActivityFocus(target);
    }
  });

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

function appendTextToScheduleActivityInput(input, text){
  if(!(input instanceof HTMLInputElement)) return null;
  const nextText = String(text || '').trim();
  if(!nextText) return null;

  const currentValue = input.value || '';
  const pending = pendingScheduleActivityInsert && pendingScheduleActivityInsert.itemId === input.dataset.itemId
    ? pendingScheduleActivityInsert
    : null;
  const selectionStart = typeof pending?.selectionStart === 'number'
    ? pending.selectionStart
    : (typeof input.selectionStart === 'number' ? input.selectionStart : currentValue.length);
  const selectionEnd = typeof pending?.selectionEnd === 'number'
    ? pending.selectionEnd
    : (typeof input.selectionEnd === 'number' ? input.selectionEnd : selectionStart);
  const before = currentValue.slice(0, selectionStart);
  const after = currentValue.slice(selectionEnd);
  const needsPrefix = before.trim().length > 0 && !/[;,\s]$/.test(before);
  const needsSuffix = after.trim().length > 0 && !/^[;,\s]/.test(after);
  const insertedText = `${needsPrefix ? '; ' : ''}${nextText}${needsSuffix ? '; ' : ''}`;
  const value = `${before}${insertedText}${after}`;
  const caret = before.length + insertedText.length;
  return { value, caret };
}

async function insertScheduleTextOrAddRow(titleSnapshot){
  const nextTitle = String(titleSnapshot || '').trim();
  if(!nextTitle) return;

  const focusedActivity = getFocusedScheduleActivityInput();
  if(focusedActivity){
    const itemId = focusedActivity.dataset.itemId;
    const appended = appendTextToScheduleActivityInput(focusedActivity, nextTitle);
    if(!itemId || !appended) return;
    focusedActivity.value = appended.value;
    await updateSlot(itemId, 'title_snapshot', appended.value);
    focusedActivity.focus();
    if(typeof focusedActivity.setSelectionRange === 'function'){
      focusedActivity.setSelectionRange(appended.caret, appended.caret);
    }
    rememberScheduleActivityFocus(focusedActivity);
    pendingScheduleActivityInsert = null;
    return;
  }

  pendingScheduleActivityInsert = null;
  await addSlotWithOptions({
    titleSnapshot: nextTitle,
    timeText: autoTime ? nowTime() : '',
    focusField: 'title_snapshot',
  });
}

async function addSlot(){
  return addSlotWithOptions();
}

async function addSlotWithOptions(options = {}){
  try{
    const plan = await ensureDailyPlan(getSelectedDate());
    const sortOrder = state.currentDateItems.filter(item => item.item_type === 'schedule_entry').length;
    const payload = {
      daily_plan_id: plan.id,
      item_type: 'schedule_entry',
      task_id: null,
      event_id: null,
      title_snapshot: options.titleSnapshot || '',
      category_snapshot: null,
      area_snapshot: null,
      status: 'planned',
      is_today_focus: false,
      is_important: false,
      is_urgent: false,
      is_highlight: false,
      time_text: Object.prototype.hasOwnProperty.call(options, 'timeText') ? options.timeText : (autoTime ? nowTime() : ''),
      note_text: options.noteText || '',
      sort_order: sortOrder,
      source_plan_item_id: null,
      moved_to_plan_item_id: null,
    };
    let createdItem;
    try{
      createdItem = await apiPost('/daily-plan-items', payload);
    } catch(error){
      showPlannerInsertDebug('addSlot', payload, error);
      throw error;
    }
    await loadCurrentDateItems();
    renderSched(getSelectedDate());
    setTimeout(() => {
      const targetField = options.focusField || 'time_text';
      let input = createdItem ? document.querySelector(`#sched-grid .sched-cell-input[data-item-id="${createdItem.id}"][data-field="${targetField}"]`) : null;
      if(!(input instanceof HTMLInputElement)){
        const rows = document.querySelectorAll(`#sched-grid .sched-cell-input[data-field="${targetField}"]`);
        input = rows.length ? rows[rows.length - 1] : null;
      }
      if(input instanceof HTMLInputElement){
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 50);
    return createdItem;
  } catch (error){
    showToast(`Error: ${error.message}`, true);
    return null;
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

async function insertTodoIntoSchedule(taskId, titleSnapshot){
  await insertScheduleTextOrAddRow(titleSnapshot);
}

loadScheduleQuickActivities();

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
    const labels = { goals:'+ Add goal', milestones:'+ Add milestone', todos:'+ Add to-do', events:'+ Add event' };
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
    goaltheme: 'Add goal',
    coretask: 'Add milestone',
    todo: 'Add to-do',
    habit: 'New item',
    move_task: 'Move task',
  };
  const modalTitle = document.getElementById('modal-title');
  if(modalTitle) modalTitle.textContent = titleMap[type] || 'Add';
  const modalEl = document.querySelector('#modal-bg .modal');
  if(modalEl) modalEl.classList.remove('habit-modal-wide');

  const goalThemeOpts = `<option value="">— none —</option>${state.goalThemes.filter(goalTheme => !goalTheme.is_done).map(goalTheme => `<option value="${goalTheme.id}">${esc(goalTheme.title)}</option>`).join('')}`;
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
  } else if(type === 'goaltheme'){
    html = `<div class="form-grid">
      <div class="fg" style="grid-column:1/-1"><label>Goal name</label><input id="m-goaltheme-name" placeholder="e.g. Career"></div>
      <div class="fg" style="grid-column:1/-1"><label>Notes</label><textarea id="m-goaltheme-notes" rows="5" placeholder="Add notes, context, and ideas for this goal"></textarea></div>
    </div>`;
    modalSaveHandler = saveGoalThemeModal;
  } else if(type === 'coretask'){
    html = `<div class="form-grid">
      <div class="fg" style="grid-column:1/-1"><label>Milestone name</label><input id="m-ct-name" placeholder="e.g. Find a full-time job"></div>
      <div class="fg"><label>Goal</label><select id="m-ct-goal">${goalThemeOpts}</select></div>
      <div class="fg"><label>Deadline</label><input id="m-ct-target-date" type="date"></div>
    </div>`;
    modalSaveHandler = saveGoalModal;
  } else if(type === 'todo'){
    html = `<div class="form-grid">
      <div class="fg" style="grid-column:1/-1"><label>Item name</label><input id="m-td-name" placeholder="e.g. Build planner flow"></div>
      <div class="fg"><label>Category</label><select id="m-td-cat">${CATS.map(cat => `<option>${esc(cat)}</option>`).join('')}</select></div>
      <div class="fg"><label>Linked milestone</label><select id="m-td-linked">${goalOpts}</select></div>
      <div class="fg"><label>Repeat</label><select id="m-td-repeat" onchange="syncTaskRecurrenceFields()">
        <option value="none">Does not repeat</option>
        <option value="daily">Daily</option>
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
      goal_theme_id: document.getElementById('m-ct-goal')?.value || null,
      area: getGoalThemeById(document.getElementById('m-ct-goal')?.value || '')?.title || null,
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
    refreshPlannerSelectOptions();
    renderGoals();
    renderMilestones();
    renderTodos();
    showToast('Milestone added');
  } catch (error){
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveGoalThemeModal(){
  const title = document.getElementById('m-goaltheme-name')?.value?.trim();
  if(!title) return;
  try{
    const data = await apiPost('/goal-themes', {
      title,
      notes: document.getElementById('m-goaltheme-notes')?.value?.trim() || null,
      sort_order: state.goalThemes.length,
      is_done: false,
      is_cancelled: false,
      is_active: true,
    });
    state.goalThemes.push(data);
    state.goalThemeExpanded[data.id] = false;
    closeModal();
    refreshPlannerSelectOptions();
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
      area: getGoalThemeForTarget(getGoalById(document.getElementById('m-td-linked')?.value || ''))?.title || null,
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
    showToast('To-do added');
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
    <div class="tag-row ${kind === 'areas' ? 'tag-row-areas' : ''}">
      <input data-tag-kind="${kind}" data-tag-index="${index}" data-tag-field="label" value="${esc(entry.label)}" placeholder="Label">
      ${kind === 'areas' ? `
        <select data-tag-kind="${kind}" data-tag-index="${index}" data-tag-field="icon">
          ${AREA_ICON_OPTIONS.map(option => `<option value="${option.value}"${(entry.icon || 'ti-tag') === option.value ? ' selected' : ''}>${option.label}</option>`).join('')}
        </select>
      ` : ''}
      <select data-tag-kind="${kind}" data-tag-index="${index}" data-tag-field="color">
        ${COLOR_OPTIONS.map(option => `<option value="${option.value}"${entry.color === option.value ? ' selected' : ''}>${option.label}</option>`).join('')}
      </select>
      <span class="chip chip-select tag-color-preview ${entry.color}">${kind === 'areas' ? `<i class="ti ${entry.icon || 'ti-tag'}"></i>` : ''}${esc(entry.label)}</span>
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
      ${renderTagGroup('areas', 'Goals', tagConfig.areas)}
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

  document.querySelectorAll('[data-tag-field="label"], [data-tag-field="color"], [data-tag-field="icon"]').forEach(control => {
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
  row.querySelectorAll('[data-tag-field="label"], [data-tag-field="color"], [data-tag-field="icon"]').forEach(control => {
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
  const iconSelect = row.querySelector('[data-tag-field="icon"]');
  const preview = row.querySelector('.tag-color-preview');
  if(preview && labelInput && colorSelect){
    preview.innerHTML = `${iconSelect ? `<i class="ti ${iconSelect.value || 'ti-tag'}"></i>` : ''}${esc(labelInput.value.trim() || 'Preview')}`;
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
        ...(kind === 'areas' ? { icon: entry.icon || 'ti-tag' } : {}),
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
  if(areaRenames.length){
    renamesObj['goal_themes.title'] = areaRenames;
    renamesObj['goals.area'] = areaRenames;
    renamesObj['tasks.area'] = areaRenames;
    renamesObj['daily_plan_items.area_snapshot'] = areaRenames;
  }
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
      state.goalThemes.forEach(goalTheme => {
        const rename = areaRenames.find(entry => entry.prev === goalTheme.title);
        if(rename) goalTheme.title = rename.next;
      });
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

    tagConfig = { ...tagConfig, ...nextConfig };
    applyTagConfig();
    refreshPlannerSelectOptions();
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
    showToast('Please choose a date.', true);
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

// Planner initialization is triggered lazily from the shared app shell.
