let englishInitialized = false;
let englishCurrentSection = 'today';
let englishState = {
  dashboard: null,
  journal: [],
  reading: [],
  listeningSources: [],
  listeningSessions: [],
  lookups: [],
  vocabulary: [],
  speaking: [],
  interviewQuestions: [],
  interviewPractice: [],
  starStories: [],
  weeklyReviews: [],
  progress: null,
};
let englishVocabularyFilters = {
  itemType: 'ALL',
  learningClassification: 'ALL',
  familiarityStatus: 'ALL',
  status: 'ALL',
  sortBy: 'NEWEST',
};
let englishVocabularyEditorState = {
  kind: null,
  itemId: null,
};
let englishVocabularyPromotionState = {
  lookupId: null,
  force: false,
};
let englishJournalEditorState = {
  entryId: null,
};
const ENGLISH_READING_PROCESS_STORAGE_KEY = 'english-reading-process-open';

function englishEsc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function englishDate(value) {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function englishItemTypeLabel(value) {
  return value === 'PHRASE' ? 'Phrase' : 'Word';
}

function englishLearningClassificationLabel(value) {
  if (value === 'B_RECOGNISE') return 'B — Recognise';
  if (value === 'C_ACTIVELY_LEARN') return 'C — Actively learn';
  return 'A — Understand for now';
}

function englishFamiliarityLabel(value) {
  if (value === 'FAMILIAR_BUT_FORGOTTEN') return 'Familiar but forgotten';
  if (value === 'REFRESHED') return 'Refreshed';
  if (value === 'CONFIDENT') return 'Confident';
  return 'New';
}

function inferVocabularyItemType(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return 'WORD';
  return normalized.includes(' ') ? 'PHRASE' : 'WORD';
}

function buildVocabularyBadge(label, tone = '') {
  const toneClass = tone ? ` english-badge-${tone}` : '';
  return `<span class="english-badge${toneClass}">${englishEsc(label)}</span>`;
}

function compareVocabularyEntries(a, b, sortBy) {
  const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
  const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
  const aUpdated = a.updated_at ? new Date(a.updated_at).getTime() : aCreated;
  const bUpdated = b.updated_at ? new Date(b.updated_at).getTime() : bCreated;
  const aText = String(a.phrase || '').toLocaleLowerCase();
  const bText = String(b.phrase || '').toLocaleLowerCase();

  switch (sortBy) {
    case 'OLDEST':
      return aCreated - bCreated;
    case 'A_Z':
      return aText.localeCompare(bText);
    case 'Z_A':
      return bText.localeCompare(aText);
    case 'RECENTLY_UPDATED':
      return bUpdated - aUpdated;
    case 'NEWEST':
    default:
      return bCreated - aCreated;
  }
}

function applyInboxViewportLimit() {
  const list = document.querySelector('.english-vocab-list-inbox');
  if (!list) return;
  list.style.maxHeight = '';
  list.classList.toggle('english-vocab-list-scrollable', list.childElementCount > 5);
  if (list.childElementCount <= 5) return;

  const items = Array.from(list.querySelectorAll(':scope > .english-item, :scope > .english-empty')).slice(0, 5);
  if (!items.length) return;

  const lastItem = items[items.length - 1];
  const computed = window.getComputedStyle(list);
  const marginTop = Number.parseFloat(computed.marginTop || '0') || 0;
  const visibleHeight = (lastItem.offsetTop + lastItem.offsetHeight) - items[0].offsetTop;
  list.style.maxHeight = `${Math.ceil(visibleHeight + marginTop)}px`;
}

function vocabularySelectOptions(options, selectedValue) {
  return options.map(option => (
    `<option value="${englishEsc(option.value)}" ${option.value === selectedValue ? 'selected' : ''}>${englishEsc(option.label)}</option>`
  )).join('');
}

function vocabularyCategoryOptions() {
  return [
    { value: 'Work', label: 'Work' },
    { value: 'Interview', label: 'Interview' },
    { value: 'Communication', label: 'Communication' },
    { value: 'Reading', label: 'Reading' },
    { value: 'Daily life', label: 'Daily life' },
    { value: 'Academic', label: 'Academic' },
    { value: 'General', label: 'General' },
  ];
}

function ensureVocabularyEditorModal() {
  let modal = document.getElementById('english-vocab-editor');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'english-vocab-editor';
  modal.className = 'english-vocab-editor';
  modal.innerHTML = `
    <div class="english-vocab-editor-backdrop" onclick="closeVocabularyEditor(event)"></div>
    <div class="english-vocab-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="english-vocab-editor-title">
      <div class="english-vocab-editor-head">
        <div>
          <div class="english-vocab-editor-kicker">Vocabulary edit</div>
          <div class="english-vocab-editor-title" id="english-vocab-editor-title">Edit item</div>
        </div>
        <button class="english-vocab-editor-close" type="button" onclick="closeVocabularyEditor()">&times;</button>
      </div>
      <div class="english-vocab-editor-body" id="english-vocab-editor-body"></div>
      <div class="english-vocab-editor-foot">
        <button class="btn-ghost" type="button" onclick="closeVocabularyEditor()">Cancel</button>
        <button class="btn-primary" type="button" onclick="saveVocabularyEditor()">Save changes</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function getLookupById(lookupId) {
  return (englishState.lookups || []).find(entry => entry.id === lookupId) || null;
}

function getVocabularyItemById(itemId) {
  return (englishState.vocabulary || []).find(entry => entry.id === itemId) || null;
}

function openLookupEditor(lookupId) {
  const item = getLookupById(lookupId);
  if (!item) return;
  englishVocabularyEditorState = { kind: 'lookup', itemId: lookupId };
  renderVocabularyEditor(item, 'lookup');
}

function openVocabularyItemEditor(itemId) {
  const item = getVocabularyItemById(itemId);
  if (!item) return;
  englishVocabularyEditorState = { kind: 'active', itemId };
  renderVocabularyEditor(item, 'active');
}

function renderVocabularyEditor(item, kind) {
  const modal = ensureVocabularyEditorModal();
  const body = modal.querySelector('#english-vocab-editor-body');
  const title = modal.querySelector('#english-vocab-editor-title');
  if (!body || !title) return;
  title.textContent = kind === 'lookup' ? 'Edit inbox item' : 'Edit active vocabulary';
  const itemTypeOptions = [
    { value: 'WORD', label: 'Word' },
    { value: 'PHRASE', label: 'Phrase' },
  ];
  const learningOptions = [
    { value: 'A_UNDERSTAND_FOR_NOW', label: 'A — Understand for now' },
    { value: 'B_RECOGNISE', label: 'B — Recognise' },
    { value: 'C_ACTIVELY_LEARN', label: 'C — Actively learn' },
  ];
  const familiarityOptions = [
    { value: 'NEW', label: 'New' },
    { value: 'FAMILIAR_BUT_FORGOTTEN', label: 'Familiar but forgotten' },
    { value: 'REFRESHED', label: 'Refreshed' },
    { value: 'CONFIDENT', label: 'Confident' },
  ];
  body.innerHTML = `
    <div class="english-form-grid english-vocab-editor-grid">
      <div class="full">
        <label>Phrase or word</label>
        <input id="english-editor-phrase" type="text" value="${englishEsc(item.phrase || '')}">
      </div>
      <div>
        <label>Item type</label>
        <select id="english-editor-item-type">${vocabularySelectOptions(itemTypeOptions, item.item_type || 'WORD')}</select>
      </div>
      <div>
        <label>Learning classification</label>
        <select id="english-editor-learning-classification">${vocabularySelectOptions(learningOptions, item.learning_classification || 'A_UNDERSTAND_FOR_NOW')}</select>
      </div>
      <div>
        <label>Familiarity status</label>
        <select id="english-editor-familiarity-status">${vocabularySelectOptions(familiarityOptions, item.familiarity_status || 'NEW')}</select>
      </div>
      <div>
        <label>Meaning</label>
        <input id="english-editor-meaning" type="text" value="${englishEsc(item.meaning || '')}">
      </div>
      <div>
        <label>Meaning in Cantonese</label>
        <input id="english-editor-meaning-cantonese" type="text" value="${englishEsc(item.meaning_cantonese || '')}">
      </div>
      <div>
        <label>Example sentence</label>
        <input id="english-editor-example" type="text" value="${englishEsc(item.example_sentence || '')}">
      </div>
      <div class="full">
        <label>Source context</label>
        <input id="english-editor-source" type="text" value="${englishEsc(item.source_context || '')}">
      </div>
      <div class="full">
        <label>Pronunciation note</label>
        <input id="english-editor-pronunciation" type="text" value="${englishEsc(item.pronunciation_note || '')}">
      </div>
      ${kind === 'active' ? `
      <div class="full">
        <label>Personal sentence</label>
        <textarea id="english-editor-personal-sentence" rows="4">${englishEsc(item.personal_sentence || '')}</textarea>
      </div>
      <div>
        <label>Category</label>
        <select id="english-editor-category">
          ${vocabularySelectOptions(vocabularyCategoryOptions(), item.category || 'General')}
        </select>
      </div>
      ` : ''}
    </div>
  `;
  modal.classList.add('open');
}

function closeVocabularyEditor(event) {
  if (event && event.target && !event.target.classList.contains('english-vocab-editor-backdrop')) return;
  document.getElementById('english-vocab-editor')?.classList.remove('open');
  englishVocabularyEditorState = { kind: null, itemId: null };
}

function ensureVocabularyPromotionModal() {
  let modal = document.getElementById('english-vocab-promote');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'english-vocab-promote';
  modal.className = 'english-vocab-editor english-vocab-promote';
  modal.innerHTML = `
    <div class="english-vocab-editor-backdrop" onclick="closeVocabularyPromotion(event)"></div>
    <div class="english-vocab-editor-dialog english-vocab-promote-dialog" role="dialog" aria-modal="true" aria-labelledby="english-vocab-promote-title">
      <div class="english-vocab-editor-head">
        <div>
          <div class="english-vocab-editor-kicker">Active vocabulary</div>
          <div class="english-vocab-editor-title" id="english-vocab-promote-title">Promote item</div>
        </div>
        <button class="english-vocab-editor-close" type="button" onclick="closeVocabularyPromotion()">&times;</button>
      </div>
      <div class="english-vocab-editor-body" id="english-vocab-promote-body"></div>
      <div class="english-vocab-editor-foot">
        <div class="english-vocab-promote-feedback" id="english-vocab-promote-feedback"></div>
        <button class="btn-ghost" type="button" onclick="closeVocabularyPromotion()">Cancel</button>
        <button class="btn-primary" type="button" id="english-vocab-promote-submit" onclick="submitVocabularyPromotion()">Move to active vocabulary</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function openVocabularyPromotion(lookupId) {
  const item = getLookupById(lookupId);
  if (!item) return;
  englishVocabularyPromotionState = { lookupId, force: false };
  const modal = ensureVocabularyPromotionModal();
  const body = modal.querySelector('#english-vocab-promote-body');
  const feedback = modal.querySelector('#english-vocab-promote-feedback');
  const submit = modal.querySelector('#english-vocab-promote-submit');
  if (!body || !feedback || !submit) return;
  feedback.textContent = '';
  feedback.className = 'english-vocab-promote-feedback';
  submit.textContent = 'Move to active vocabulary';
  body.innerHTML = `
    <div class="english-vocab-promote-summary">
      <div class="english-vocab-promote-phrase">${englishEsc(item.phrase)}</div>
      <div class="english-vocab-promote-badges">
        ${buildVocabularyBadge(englishItemTypeLabel(item.item_type), item.item_type === 'PHRASE' ? 'warm' : 'cool')}
        ${buildVocabularyBadge(englishLearningClassificationLabel(item.learning_classification), 'strong')}
        ${buildVocabularyBadge(englishFamiliarityLabel(item.familiarity_status))}
      </div>
      <p class="english-vocab-promote-copy">Promoted items move out of the inbox and into your active review list. Add one personal sentence so this becomes something you can actually use.</p>
    </div>
    <div class="english-form-grid english-vocab-editor-grid">
      <div class="full">
        <label>Personal sentence</label>
        <textarea id="english-promote-personal-sentence" rows="4" placeholder="Write one sentence you could genuinely say or write.">${englishEsc(item.example_sentence || '')}</textarea>
      </div>
      <div class="full">
        <label>Meaning in Cantonese</label>
        <input id="english-promote-meaning-cantonese" type="text" value="${englishEsc(item.meaning_cantonese || '')}" placeholder="Optional">
      </div>
      <div>
        <label>Category</label>
        <select id="english-promote-category">${vocabularySelectOptions(vocabularyCategoryOptions(), 'General')}</select>
      </div>
      <div>
        <label>Pronunciation note</label>
        <input id="english-promote-pronunciation" type="text" value="${englishEsc(item.pronunciation_note || '')}" placeholder="Optional">
      </div>
    </div>
  `;
  modal.classList.add('open');
}

function closeVocabularyPromotion(event) {
  if (event && event.target && !event.target.classList.contains('english-vocab-editor-backdrop')) return;
  document.getElementById('english-vocab-promote')?.classList.remove('open');
  englishVocabularyPromotionState = { lookupId: null, force: false };
}

async function saveVocabularyEditor() {
  const { kind, itemId } = englishVocabularyEditorState;
  if (!kind || !itemId) return;
  const phrase = document.getElementById('english-editor-phrase')?.value || '';
  const itemType = document.getElementById('english-editor-item-type')?.value || 'WORD';
  const learningClassification = document.getElementById('english-editor-learning-classification')?.value || 'A_UNDERSTAND_FOR_NOW';
  const familiarityStatus = document.getElementById('english-editor-familiarity-status')?.value || 'NEW';
  const payload = {
    phrase,
    item_type: itemType,
    learning_classification: learningClassification,
    familiarity_status: familiarityStatus,
    meaning: document.getElementById('english-editor-meaning')?.value || '',
    meaning_cantonese: document.getElementById('english-editor-meaning-cantonese')?.value || '',
    example_sentence: document.getElementById('english-editor-example')?.value || '',
    source_context: document.getElementById('english-editor-source')?.value || '',
    pronunciation_note: document.getElementById('english-editor-pronunciation')?.value || '',
  };
  try {
    if (kind === 'lookup') {
      const existing = getLookupById(itemId);
      if (!existing) return;
      await apiPut(`/english/word-lookups/${itemId}`, {
        ...payload,
        is_promoted: existing.is_promoted,
        status: existing.status,
      });
      showToast('Lookup updated');
    } else {
      const existing = getVocabularyItemById(itemId);
      if (!existing) return;
      const personalSentence = document.getElementById('english-editor-personal-sentence')?.value || '';
      if (!personalSentence.trim()) {
        showToast('Error: personal_sentence is required for active vocabulary.', true);
        return;
      }
      await apiPut(`/english/vocabulary-items/${itemId}`, {
        lookup_id: existing.lookup_id,
        ...payload,
        personal_sentence: personalSentence,
        category: document.getElementById('english-editor-category')?.value || 'General',
        status: existing.status,
        next_review_date: existing.next_review_date,
        review_stage: existing.review_stage,
      });
      showToast('Active vocabulary updated');
    }
    closeVocabularyEditor();
    refreshEnglishSection('vocabulary');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

function vocabularyMatchesFilters(item) {
  const itemTypeOk = englishVocabularyFilters.itemType === 'ALL'
    || item.item_type === englishVocabularyFilters.itemType;
  const classificationOk = englishVocabularyFilters.learningClassification === 'ALL'
    || item.learning_classification === englishVocabularyFilters.learningClassification;
  const familiarityOk = englishVocabularyFilters.familiarityStatus === 'ALL'
    || item.familiarity_status === englishVocabularyFilters.familiarityStatus;
  const statusOk = englishVocabularyFilters.status === 'ALL'
    || item.status === englishVocabularyFilters.status
    || (englishVocabularyFilters.status === 'READY' && item.learning_classification === 'C_ACTIVELY_LEARN' && !item.is_promoted)
    || (englishVocabularyFilters.status === 'PROMOTED' && item.is_promoted);
  return itemTypeOk && classificationOk && familiarityOk && statusOk;
}

function updateVocabularyTypeSuggestion() {
  const phrase = document.getElementById('english-lookup-phrase');
  const itemType = document.getElementById('english-lookup-item-type');
  if (!phrase || !itemType) return;
  itemType.value = inferVocabularyItemType(phrase.value);
}

function englishEmpty(message) {
  return `<div class="english-empty">${englishEsc(message)}</div>`;
}

function englishItem(title, meta, body = '', actions = '') {
  return `<div class="english-item">
    <div class="english-item-head">
      <div>
        <div class="english-item-title">${englishEsc(title)}</div>
        <div class="english-item-meta">${meta}</div>
      </div>
      ${actions ? `<div class="english-actions">${actions}</div>` : ''}
    </div>
    ${body ? `<div class="english-note" style="margin-top:10px">${body}</div>` : ''}
  </div>`;
}

function isEnglishReadingProcessExpanded() {
  try {
    return localStorage.getItem(ENGLISH_READING_PROCESS_STORAGE_KEY) === 'true';
  } catch (error) {
    return false;
  }
}

function rememberEnglishReadingProcessState(isExpanded) {
  try {
    localStorage.setItem(ENGLISH_READING_PROCESS_STORAGE_KEY, isExpanded ? 'true' : 'false');
  } catch (error) {}
}

function getJournalEntryById(entryId) {
  return (englishState.journal || []).find(entry => entry.id === entryId) || null;
}

function journalMoodEmoji(score) {
  if (score === 1) return '😭';
  if (score === 2) return '😞';
  if (score === 3) return '😐';
  if (score === 4) return '🙂';
  if (score === 5) return '😄';
  return '';
}

function resetEnglishJournalEditor() {
  englishJournalEditorState = { entryId: null };
}

function openEnglishJournalEditor(entryId) {
  const entry = getJournalEntryById(entryId);
  if (!entry) {
    if (typeof showToast === 'function') showToast('Journal entry not found.', true);
    return;
  }
  englishJournalEditorState = { entryId };
  renderEnglishJournal();
  const formCard = document.querySelector('.english-journal-form-card');
  formCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEnglishJournalEdit() {
  resetEnglishJournalEditor();
  renderEnglishJournal();
}

async function loadEnglishSectionData(section) {
  const loaders = {
    today: async () => { englishState.dashboard = await apiGet('/english/dashboard'); },
    journal: async () => { englishState.journal = await apiGet('/english/journal'); },
    reading: async () => { englishState.reading = await apiGet('/english/reading-books'); },
    listening: async () => {
      const [sources, sessions] = await Promise.all([
        apiGet('/english/listening-sources'),
        apiGet('/english/listening-sessions'),
      ]);
      englishState.listeningSources = sources;
      englishState.listeningSessions = sessions;
    },
    vocabulary: async () => {
      const [lookups, vocabulary] = await Promise.all([
        apiGet('/english/word-lookups'),
        apiGet('/english/vocabulary-items'),
      ]);
      englishState.lookups = lookups;
      englishState.vocabulary = vocabulary;
    },
    speaking: async () => { englishState.speaking = await apiGet('/english/speaking-sessions'); },
    interview: async () => {
      const [questions, practice, stars] = await Promise.all([
        apiGet('/english/interview-questions'),
        apiGet('/english/interview-practice'),
        apiGet('/english/star-stories'),
      ]);
      englishState.interviewQuestions = questions;
      englishState.interviewPractice = practice;
      englishState.starStories = stars;
    },
    'weekly-review': async () => { englishState.weeklyReviews = await apiGet('/english/weekly-reviews'); },
    progress: async () => { englishState.progress = await apiGet('/english/progress'); },
  };
  if (loaders[section]) await loaders[section]();
}

function renderEnglishToday() {
  const data = englishState.dashboard;
  const el = document.getElementById('english-section-today');
  if (!el) return;
  if (!data) {
    el.innerHTML = englishEmpty('Dashboard data is not available yet.');
    return;
  }
  el.innerHTML = `
    ${data.warning ? `<div class="english-empty">${englishEsc(data.warning)}</div>` : ''}
    <div class="card">
      <div class="card-title"><i class="ti ti-sparkles"></i>Today</div>
      <div class="english-subtitle">${englishEsc(data.journal_prompt || 'Choose one practical English task for today.')}</div>
    </div>
    <div class="english-mini-metrics">
      <div class="english-mini-card"><div class="english-mini-label">Reviews Due</div><div class="english-mini-value">${data.progress.reviews_due || 0}</div><div class="english-mini-copy">Active vocabulary ready now</div></div>
      <div class="english-mini-card"><div class="english-mini-label">Active Books</div><div class="english-mini-value">${data.progress.active_books || 0}</div><div class="english-mini-copy">Keep your current page fresh</div></div>
      <div class="english-mini-card"><div class="english-mini-label">Speaking Sessions</div><div class="english-mini-value">${data.progress.speaking_sessions || 0}</div><div class="english-mini-copy">Reflection beats streaks</div></div>
    </div>
    <div class="english-grid-2">
      <div class="card">
        <div class="card-title"><i class="ti ti-notebook"></i>Next Useful Action</div>
        <div class="english-stack">
          ${data.latest_journal ? englishItem(
            'Latest journal entry',
            `Saved ${englishDate(data.latest_journal.entry_date)}`,
            englishEsc(data.latest_journal.content)
          ) : englishEmpty('No journal entries yet. Start with one short paragraph.')}
          ${data.active_book ? englishItem(
            data.active_book.title,
            `Current page ${data.active_book.current_page}${data.active_book.total_pages ? ` / ${data.active_book.total_pages}` : ''}`,
            'Update one page after your next reading block.'
          ) : englishEmpty('No active reading book yet. Add one simple tracker.')}
        </div>
      </div>
      <div class="card">
        <div class="card-title"><i class="ti ti-activity"></i>Recent Progress</div>
        <div class="english-stack">
          ${data.listening_spotlight ? englishItem(
            data.listening_spotlight.source_title || 'Listening session',
            `${englishDate(data.listening_spotlight.session_date)} · ${englishEsc(data.listening_spotlight.focus_area || 'General listening')}`,
            englishEsc(data.listening_spotlight.reflection || data.listening_spotlight.notes || 'Recent listening practice saved.')
          ) : englishEmpty('Listening practice will appear here after your first session.')}
          ${data.weekly_review ? englishItem(
            'Current weekly review',
            `Week starting ${englishDate(data.weekly_review.week_start_date)}`,
            englishEsc(data.weekly_review.summary || 'Weekly review saved.')
          ) : englishEmpty('Generate a weekly review once you have a few activities logged.')}
        </div>
      </div>
    </div>
  `;
}

function renderEnglishJournal() {
  const el = document.getElementById('english-section-journal');
  if (!el) return;
  const entries = englishState.journal || [];
  const latestEntry = entries[0] || null;
  const editingEntry = englishJournalEditorState.entryId ? getJournalEntryById(englishJournalEditorState.entryId) : null;
  if (englishJournalEditorState.entryId && !editingEntry) {
    resetEnglishJournalEditor();
  }
  const activeEntry = editingEntry || null;
  const moodOptions = [
    { value: '', label: 'Choose mood' },
    { value: '1', label: '1 - Very low' },
    { value: '2', label: '2 - Low' },
    { value: '3', label: '3 - Okay' },
    { value: '4', label: '4 - Good' },
    { value: '5', label: '5 - Great' },
  ];
  const confidenceOptions = [
    { value: '', label: 'Choose confidence' },
    { value: '1', label: '1 - Needed a lot of help' },
    { value: '2', label: '2 - Hard but possible' },
    { value: '3', label: '3 - Fairly comfortable' },
    { value: '4', label: '4 - Strong expression' },
    { value: '5', label: '5 - Very natural' },
  ];
  const promptIdeas = [
    'Describe one small win from today.',
    'What felt difficult to explain in English this week?',
    'Write about a conversation you want to have better next time.',
  ];
  el.innerHTML = `
    <div class="card english-journal-hero">
      <div>
        <div class="card-title"><i class="ti ti-book-2"></i>Journal Practice</div>
        <div class="english-journal-hero-title">Turn everyday moments into better English.</div>
        <div class="english-journal-hero-copy">Capture one real experience, notice where expression felt difficult, and keep vocabulary you want to reuse. Short, honest entries are enough.</div>
      </div>
      <div class="english-journal-hero-stats">
        <div class="english-journal-stat">
          <span class="english-journal-stat-label">Entries saved</span>
          <strong>${entries.length}</strong>
        </div>
        <div class="english-journal-stat">
          <span class="english-journal-stat-label">Latest entry</span>
          <strong>${latestEntry ? englishDate(latestEntry.entry_date) : 'Start today'}</strong>
        </div>
      </div>
    </div>
    <div class="english-grid-2 english-journal-grid">
      <div class="card english-journal-form-card">
        <div class="english-journal-card-head">
          <div>
            <div class="english-journal-kicker">${activeEntry ? 'Editing entry' : 'Write now'}</div>
            <div class="card-title"><i class="ti ti-pencil"></i>${activeEntry ? 'Edit Journal Entry' : 'New Journal Entry'}</div>
          </div>
          <div class="english-journal-support">${activeEntry ? `Updating entry from ${englishDate(activeEntry.entry_date)}.` : 'Aim for 3 to 5 sentences about one real moment.'}</div>
        </div>
        <div class="english-journal-prompt-strip">
          ${promptIdeas.map(prompt => `<button class="english-journal-prompt-chip" type="button" onclick="document.getElementById('english-journal-prompt').value='${englishEsc(prompt)}'">${englishEsc(prompt)}</button>`).join('')}
        </div>
        <div class="english-form-grid english-journal-form-grid">
          <div><label>Date</label><input type="date" id="english-journal-date" value="${englishEsc(activeEntry?.entry_date || new Date().toISOString().slice(0,10))}"></div>
          <div><label>Mood</label><select id="english-journal-mood">${moodOptions.map(option => `<option value="${option.value}" ${String(activeEntry?.mood_score ?? '') === option.value ? 'selected' : ''}>${englishEsc(option.label)}</option>`).join('')}</select></div>
          <div><label>Confidence</label><select id="english-journal-confidence">${confidenceOptions.map(option => `<option value="${option.value}" ${String(activeEntry?.confidence_score ?? '') === option.value ? 'selected' : ''}>${englishEsc(option.label)}</option>`).join('')}</select></div>
          <div class="english-journal-inline-note">How did you feel overall when this happened?</div>
          <div class="full"><label>Prompt</label><input id="english-journal-prompt" type="text" placeholder="What happened at work, university, or daily life?" value="${englishEsc(activeEntry?.prompt || '')}"></div>
          <div class="full"><label>Entry</label><textarea id="english-journal-content" rows="7" placeholder="Write a short paragraph in English">${englishEsc(activeEntry?.content || '')}</textarea></div>
          <div><label>Clarity notes</label><input id="english-journal-clarity" type="text" placeholder="What felt hard to explain?" value="${englishEsc(activeEntry?.clarity_notes || '')}"></div>
          <div><label>Vocabulary notes</label><input id="english-journal-vocab" type="text" placeholder="Words or phrases to reuse" value="${englishEsc(activeEntry?.vocabulary_notes || '')}"></div>
          <div class="full"><label>Grammar notes</label><input id="english-journal-grammar" type="text" placeholder="Optional self-feedback" value="${englishEsc(activeEntry?.grammar_notes || '')}"></div>
        </div>
        <div class="english-actions english-journal-primary-actions">
          <button class="btn-primary" type="button" onclick="saveEnglishJournal()"><i class="ti ti-check"></i>${activeEntry ? 'Update journal' : 'Save journal'}</button>
          ${activeEntry ? `<button class="btn-secondary" type="button" onclick="cancelEnglishJournalEdit()">Cancel edit</button>` : ''}
          <div class="english-journal-action-note">You can keep this rough. Focus on meaning first, then polish later.</div>
        </div>
      </div>
      <div class="card english-journal-side-card">
        <div class="english-journal-card-head">
          <div>
            <div class="english-journal-kicker">Use this rhythm</div>
            <div class="card-title"><i class="ti ti-bulb"></i>Simple Writing Flow</div>
          </div>
        </div>
        <div class="english-journal-guidance">
          <div class="english-journal-guidance-item">
            <strong>1. Pick one moment</strong>
            <p>Choose one conversation, meeting, class, task, or feeling from today.</p>
          </div>
          <div class="english-journal-guidance-item">
            <strong>2. Say what happened</strong>
            <p>Keep it concrete: what you did, what someone said, and what you thought.</p>
          </div>
          <div class="english-journal-guidance-item">
            <strong>3. Save what matters</strong>
            <p>Note one useful phrase and one idea that was hard to express.</p>
          </div>
        </div>
      </div>
    </div>
    <div class="card english-journal-history-card">
      <div class="english-journal-card-head">
        <div>
          <div class="english-journal-kicker">Look back</div>
          <div class="card-title"><i class="ti ti-history"></i>Recent Entries</div>
        </div>
        <div class="english-journal-support">${entries.length ? `${entries.length} saved reflection${entries.length === 1 ? '' : 's'}` : 'Your saved writing will appear here.'}</div>
      </div>
      <div class="english-journal-entry-list">
        ${entries.length ? entries.map(entry => `
          <article class="english-journal-entry-card">
            ${entry.mood_score ? `<div class="english-journal-mood-emoji" title="Mood ${englishEsc(entry.mood_score)}/5">${journalMoodEmoji(Number(entry.mood_score))}</div>` : ''}
            <div class="english-journal-entry-top">
              <div>
                <div class="english-journal-entry-title">${englishEsc(entry.prompt || 'Journal entry')}</div>
                <div class="english-journal-entry-meta">${englishDate(entry.entry_date)}</div>
              </div>
              <div class="english-journal-entry-side">
                <div class="english-journal-score-stack">
                ${entry.confidence_score ? `<div class="english-journal-confidence">Confidence ${englishEsc(entry.confidence_score)}/5</div>` : ''}
                </div>
                <div class="english-actions english-journal-entry-actions">
                  <button class="btn-ghost" type="button" onclick="openEnglishJournalEditor('${englishEsc(entry.id)}')"><i class="ti ti-edit"></i>Edit</button>
                </div>
              </div>
            </div>
            <div class="english-journal-entry-body">${englishEsc(entry.content)}</div>
            ${(entry.clarity_notes || entry.vocabulary_notes || entry.grammar_notes) ? `
              <div class="english-journal-entry-notes">
                ${entry.clarity_notes ? `<div class="english-journal-note-pill"><span>Clarity</span>${englishEsc(entry.clarity_notes)}</div>` : ''}
                ${entry.vocabulary_notes ? `<div class="english-journal-note-pill"><span>Vocabulary</span>${englishEsc(entry.vocabulary_notes)}</div>` : ''}
                ${entry.grammar_notes ? `<div class="english-journal-note-pill"><span>Grammar</span>${englishEsc(entry.grammar_notes)}</div>` : ''}
              </div>
            ` : ''}
          </article>
        `).join('') : englishEmpty('Recent journal entries will appear here.')}
      </div>
    </div>
  `;
}

function renderEnglishReading() {
  const el = document.getElementById('english-section-reading');
  if (!el) return;
  const books = englishState.reading || [];
  const readingProcessOpen = isEnglishReadingProcessExpanded();
  el.innerHTML = `
    <details class="card english-reading-process" ${readingProcessOpen ? 'open' : ''} ontoggle="rememberEnglishReadingProcessState(this.open)">
      <summary class="english-reading-process-summary">
        <div>
          <div class="english-reading-process-title">Suggested reading process</div>
          <div class="english-reading-process-subtitle">A simple process for improving comprehension, pronunciation, and active expression.</div>
        </div>
        <span class="english-reading-process-icon" aria-hidden="true"><i class="ti ti-chevron-down"></i></span>
      </summary>
      <div class="english-reading-process-body">
        <ol class="english-reading-process-steps">
          <li>
            <strong>Read a short section silently</strong>
            <p>Read around two to four pages, or for approximately ten to fifteen minutes.</p>
            <p>Focus on:</p>
            <ul>
              <li>what happened</li>
              <li>the author’s main point</li>
              <li>which parts are unclear</li>
            </ul>
            <p>You may mark unfamiliar words, but do not stop to look up every word immediately.</p>
          </li>
          <li>
            <strong>Read the same section aloud</strong>
            <p>Reading aloud can support concentration, understanding, memory, pronunciation, and sentence rhythm.</p>
            <p>While reading aloud:</p>
            <ul>
              <li>pause according to meaning</li>
              <li>read in groups of words rather than word by word</li>
              <li>pronounce sentence endings clearly</li>
              <li>stop and check the meaning if you can read a sentence but do not understand it</li>
            </ul>
          </li>
          <li>
            <strong>Look up only a few important words or phrases</strong>
            <p>Choose no more than around three important items from each reading section.</p>
            <p>Prioritise vocabulary that:</p>
            <ul>
              <li>prevents you from understanding the passage</li>
              <li>appears repeatedly</li>
              <li>may be useful in your own English</li>
              <li>has a pronunciation you particularly want to learn</li>
            </ul>
            <p>You may look up a rare word out of curiosity without adding it to Active Vocabulary.</p>
          </li>
          <li>
            <strong>Close the book and explain what you read</strong>
            <p>Speak in English for thirty to sixty seconds without looking at the text.</p>
            <p>Suggested prompts:</p>
            <ul>
              <li>This section was mainly about…</li>
              <li>The main point was…</li>
              <li>One thing I found interesting was…</li>
              <li>I think…</li>
              <li>This reminds me of…</li>
            </ul>
          </li>
        </ol>
        <div class="english-reading-process-footer">Read silently → read aloud → look up a few important items → explain the main idea in your own words.</div>
      </div>
    </details>
    <div class="card">
      <div class="card-title"><i class="ti ti-book-2"></i>Add Book</div>
      <div class="english-form-grid">
        <div class="full"><label>Title</label><input id="english-book-title" type="text" placeholder="Book title"></div>
        <div><label>Current page</label><input id="english-book-current-page" type="number" min="0" value="0"></div>
        <div><label>Total pages</label><input id="english-book-total-pages" type="number" min="1" placeholder="Optional"></div>
      </div>
      <div class="english-actions" style="margin-top:12px">
        <button class="btn-primary" type="button" onclick="saveEnglishBook()"><i class="ti ti-plus"></i>Add book</button>
      </div>
    </div>
    <div class="english-grid-2">
      <div class="card">
        <div class="card-title"><i class="ti ti-book"></i>Reading Now</div>
        <div class="english-list">
          ${books.filter(book => book.status === 'reading').length ? books.filter(book => book.status === 'reading').map(book => englishItem(
            book.title,
            `Page ${book.current_page}${book.total_pages ? ` / ${book.total_pages}` : ''} · Updated ${englishDate(book.last_updated_date)}`,
            '',
            `<button class="btn-secondary" type="button" onclick="quickUpdateReadingPage('${book.id}', ${book.current_page + 1})">+1 page</button>
             <button class="btn-secondary" type="button" onclick="markReadingBookCompleted('${book.id}', ${book.current_page}, ${book.total_pages || 'null'})">Complete</button>
             <button class="btn-ghost" type="button" onclick="deleteReadingBook('${book.id}')">Delete</button>`
          )).join('') : englishEmpty('No active books yet.')}
        </div>
      </div>
      <div class="card">
        <div class="card-title"><i class="ti ti-circle-check"></i>Completed</div>
        <div class="english-list">
          ${books.filter(book => book.status === 'completed').length ? books.filter(book => book.status === 'completed').map(book => englishItem(
            book.title,
            `Finished at page ${book.current_page}${book.total_pages ? ` / ${book.total_pages}` : ''}`,
            ''
          )).join('') : englishEmpty('Completed books will appear here.')}
        </div>
      </div>
    </div>
  `;
}

function renderEnglishListening() {
  const el = document.getElementById('english-section-listening');
  if (!el) return;
  const sources = englishState.listeningSources || [];
  const sessions = englishState.listeningSessions || [];
  el.innerHTML = `
    <div class="english-grid-2">
      <div class="card">
        <div class="card-title"><i class="ti ti-headphones"></i>Save Source</div>
        <div class="english-form-grid">
          <div class="full"><label>Title</label><input id="english-source-title" type="text" placeholder="Podcast, YouTube channel, lecture, or meeting source"></div>
          <div><label>Type</label><select id="english-source-type"><option value="podcast">Podcast</option><option value="video">Video</option><option value="meeting">Meeting</option><option value="lecture">Lecture</option></select></div>
          <div><label>URL</label><input id="english-source-url" type="url" placeholder="Optional"></div>
          <div class="full"><label>Notes</label><input id="english-source-notes" type="text" placeholder="Why is this useful?"></div>
        </div>
        <div class="english-actions" style="margin-top:12px"><button class="btn-primary" type="button" onclick="saveListeningSource()"><i class="ti ti-plus"></i>Save source</button></div>
      </div>
      <div class="card">
        <div class="card-title"><i class="ti ti-wave-sine"></i>Log Session</div>
        <div class="english-form-grid">
          <div><label>Date</label><input id="english-listening-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
          <div><label>Difficulty</label><select id="english-listening-difficulty"><option value="">Choose</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div>
          <div class="full"><label>Source</label><select id="english-listening-source"><option value="">Choose a source</option>${sources.map(source => `<option value="${englishEsc(source.id)}">${englishEsc(source.title)}</option>`).join('')}</select></div>
          <div><label>Focus area</label><input id="english-listening-focus" type="text" placeholder="Pronunciation, speed, workplace phrasing"></div>
          <div><label>Second pass</label><select id="english-listening-second-pass"><option value="false">Not yet</option><option value="true">Completed</option></select></div>
          <div class="full"><label>Notes</label><textarea id="english-listening-notes" rows="3" placeholder="What did you hear clearly?"></textarea></div>
          <div class="full"><label>Reflection</label><textarea id="english-listening-reflection" rows="3" placeholder="What should you repeat next time?"></textarea></div>
        </div>
        <div class="english-actions" style="margin-top:12px"><button class="btn-primary" type="button" onclick="saveListeningSession()"><i class="ti ti-check"></i>Save session</button></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><i class="ti ti-history"></i>Recent Listening Sessions</div>
      <div class="english-list">
        ${sessions.length ? sessions.map(session => englishItem(
          session.source_title || 'Listening session',
          `${englishDate(session.session_date)}${session.focus_area ? ` · ${englishEsc(session.focus_area)}` : ''}${session.second_pass_completed ? ' · second pass done' : ''}`,
          englishEsc(session.reflection || session.notes || '')
        )).join('') : englishEmpty('Log a listening session to build a review trail.')}
      </div>
    </div>
  `;
}

function renderEnglishVocabulary() {
  const el = document.getElementById('english-section-vocabulary');
  if (!el) return;
  const lookups = (englishState.lookups || [])
    .filter(vocabularyMatchesFilters)
    .slice()
    .sort((a, b) => compareVocabularyEntries(a, b, englishVocabularyFilters.sortBy));
  const vocabulary = (englishState.vocabulary || []).filter(item => {
    const itemTypeOk = englishVocabularyFilters.itemType === 'ALL'
      || item.item_type === englishVocabularyFilters.itemType;
    const classificationOk = englishVocabularyFilters.learningClassification === 'ALL'
      || item.learning_classification === englishVocabularyFilters.learningClassification;
    const familiarityOk = englishVocabularyFilters.familiarityStatus === 'ALL'
      || item.familiarity_status === englishVocabularyFilters.familiarityStatus;
    return itemTypeOk && classificationOk && familiarityOk;
  }).slice().sort((a, b) => compareVocabularyEntries(a, b, englishVocabularyFilters.sortBy));
  el.innerHTML = `
    <div class="english-vocab-shell">
      <div class="english-vocab-hero card">
        <div>
          <div class="card-title"><i class="ti ti-abc"></i>English Vocabulary</div>
          <div class="english-vocab-hero-copy">Capture vocabulary quickly, decide whether it is a word or phrase, and only promote the items you genuinely want to use.</div>
        </div>
        <div class="english-vocab-hero-stats">
          <div class="english-vocab-stat">
            <span class="english-vocab-stat-label">Inbox</span>
            <strong>${lookups.length}</strong>
          </div>
          <div class="english-vocab-stat">
            <span class="english-vocab-stat-label">Active</span>
            <strong>${vocabulary.length}</strong>
          </div>
        </div>
      </div>
      <div class="english-grid-2 english-vocab-grid">
      <div class="card english-vocab-card english-vocab-form-card">
        <div class="english-vocab-card-head">
          <div class="card-title"><i class="ti ti-search"></i>Word Lookup Inbox</div>
          <div class="english-vocab-kicker">Save first, decide depth later</div>
        </div>
        <div class="english-vocab-guidance">
          <div class="english-note">You may look up a word without committing to memorising it. Use A for vocabulary you only need to understand, B for vocabulary you want to recognise, and C for vocabulary you want to actively use.</div>
          <div class="english-note">Phrases are often more useful for speaking and writing than isolated words.</div>
        </div>
        <div class="english-form-grid english-vocab-form-grid">
          <div class="full"><label>Phrase or word</label><input id="english-lookup-phrase" type="text" placeholder="Add a phrase you heard or read" oninput="updateVocabularyTypeSuggestion()"></div>
          <div class="english-vocab-control">
            <label>Item type</label>
            <select id="english-lookup-item-type">
              <option value="WORD">Word</option>
              <option value="PHRASE">Phrase</option>
            </select>
          </div>
          <div class="english-vocab-control">
            <label>Learning classification</label>
            <select id="english-lookup-learning-classification">
              <option value="A_UNDERSTAND_FOR_NOW">A — Understand for now</option>
              <option value="B_RECOGNISE">B — Recognise</option>
              <option value="C_ACTIVELY_LEARN">C — Actively learn</option>
            </select>
          </div>
          <div class="english-vocab-control">
            <label>Familiarity status</label>
            <select id="english-lookup-familiarity-status">
              <option value="NEW">New</option>
              <option value="FAMILIAR_BUT_FORGOTTEN">Familiar but forgotten</option>
              <option value="REFRESHED">Refreshed</option>
              <option value="CONFIDENT">Confident</option>
            </select>
          </div>
          <div><label>Meaning</label><input id="english-lookup-meaning" type="text" placeholder="Optional"></div>
          <div><label>Meaning in Cantonese</label><input id="english-lookup-meaning-cantonese" type="text" placeholder="Optional"></div>
          <div><label>Example sentence</label><input id="english-lookup-example" type="text" placeholder="Optional"></div>
          <div class="full"><label>Source context</label><input id="english-lookup-context" type="text" placeholder="Where did you find it?"></div>
          <div class="full"><label>Pronunciation note</label><input id="english-lookup-pronunciation" type="text" placeholder="Optional"></div>
        </div>
        <div class="english-actions english-vocab-primary-actions"><button class="btn-primary" type="button" onclick="saveWordLookup()"><i class="ti ti-inbox"></i>Add to inbox</button></div>
        <div class="english-vocab-filter-panel">
          <div class="english-vocab-filter-title">Filters</div>
          <div class="english-filter-row english-vocab-filter-row">
          <select onchange="setVocabularyFilter('itemType', this.value)">
            <option value="ALL" ${englishVocabularyFilters.itemType === 'ALL' ? 'selected' : ''}>All types</option>
            <option value="WORD" ${englishVocabularyFilters.itemType === 'WORD' ? 'selected' : ''}>Words</option>
            <option value="PHRASE" ${englishVocabularyFilters.itemType === 'PHRASE' ? 'selected' : ''}>Phrases</option>
          </select>
          <select onchange="setVocabularyFilter('learningClassification', this.value)">
            <option value="ALL" ${englishVocabularyFilters.learningClassification === 'ALL' ? 'selected' : ''}>All classifications</option>
            <option value="A_UNDERSTAND_FOR_NOW" ${englishVocabularyFilters.learningClassification === 'A_UNDERSTAND_FOR_NOW' ? 'selected' : ''}>A — Understand for now</option>
            <option value="B_RECOGNISE" ${englishVocabularyFilters.learningClassification === 'B_RECOGNISE' ? 'selected' : ''}>B — Recognise</option>
            <option value="C_ACTIVELY_LEARN" ${englishVocabularyFilters.learningClassification === 'C_ACTIVELY_LEARN' ? 'selected' : ''}>C — Actively learn</option>
          </select>
          <select onchange="setVocabularyFilter('familiarityStatus', this.value)">
            <option value="ALL" ${englishVocabularyFilters.familiarityStatus === 'ALL' ? 'selected' : ''}>All familiarity</option>
            <option value="NEW" ${englishVocabularyFilters.familiarityStatus === 'NEW' ? 'selected' : ''}>New</option>
            <option value="FAMILIAR_BUT_FORGOTTEN" ${englishVocabularyFilters.familiarityStatus === 'FAMILIAR_BUT_FORGOTTEN' ? 'selected' : ''}>Familiar but forgotten</option>
            <option value="REFRESHED" ${englishVocabularyFilters.familiarityStatus === 'REFRESHED' ? 'selected' : ''}>Refreshed</option>
            <option value="CONFIDENT" ${englishVocabularyFilters.familiarityStatus === 'CONFIDENT' ? 'selected' : ''}>Confident</option>
          </select>
          <select onchange="setVocabularyFilter('status', this.value)">
            <option value="ALL" ${englishVocabularyFilters.status === 'ALL' ? 'selected' : ''}>All statuses</option>
            <option value="inbox" ${englishVocabularyFilters.status === 'inbox' ? 'selected' : ''}>Inbox</option>
            <option value="READY" ${englishVocabularyFilters.status === 'READY' ? 'selected' : ''}>Ready to promote</option>
            <option value="PROMOTED" ${englishVocabularyFilters.status === 'PROMOTED' ? 'selected' : ''}>Promoted</option>
            <option value="archived" ${englishVocabularyFilters.status === 'archived' ? 'selected' : ''}>Archived</option>
          </select>
          <select onchange="setVocabularyFilter('sortBy', this.value)">
            <option value="NEWEST" ${englishVocabularyFilters.sortBy === 'NEWEST' ? 'selected' : ''}>Newest first</option>
            <option value="OLDEST" ${englishVocabularyFilters.sortBy === 'OLDEST' ? 'selected' : ''}>Oldest first</option>
            <option value="A_Z" ${englishVocabularyFilters.sortBy === 'A_Z' ? 'selected' : ''}>A to Z</option>
            <option value="Z_A" ${englishVocabularyFilters.sortBy === 'Z_A' ? 'selected' : ''}>Z to A</option>
            <option value="RECENTLY_UPDATED" ${englishVocabularyFilters.sortBy === 'RECENTLY_UPDATED' ? 'selected' : ''}>Recently updated</option>
          </select>
        </div>
        </div>
        <div class="english-list english-vocab-list english-vocab-list-inbox">
          ${lookups.length ? lookups.map(item => englishItem(
            item.phrase,
            `${buildVocabularyBadge(englishItemTypeLabel(item.item_type), item.item_type === 'PHRASE' ? 'warm' : 'cool')} ${buildVocabularyBadge(englishLearningClassificationLabel(item.learning_classification), item.learning_classification.startsWith('C_') ? 'strong' : '')} ${buildVocabularyBadge(englishFamiliarityLabel(item.familiarity_status))} ${buildVocabularyBadge(item.is_promoted ? 'Promoted' : item.status)}`,
            `
              ${item.meaning ? `<div><strong>Meaning:</strong> ${englishEsc(item.meaning)}</div>` : ''}
              ${item.meaning_cantonese ? `<div><strong>Cantonese meaning:</strong> ${englishEsc(item.meaning_cantonese)}</div>` : ''}
              ${item.example_sentence ? `<div><strong>Example:</strong> ${englishEsc(item.example_sentence)}</div>` : ''}
              ${item.source_context ? `<div><strong>Source:</strong> ${englishEsc(item.source_context)}</div>` : ''}
              <div><strong>Date added:</strong> ${englishDate(item.created_at ? item.created_at.slice(0, 10) : '')}</div>
            `,
            `
              <button class="btn-secondary" type="button" onclick="openLookupEditor('${item.id}')">Edit</button>
              ${item.learning_classification === 'C_ACTIVELY_LEARN' && !item.is_promoted ? `<button class="btn-secondary" type="button" onclick="promoteLookup('${item.id}')">Promote to active vocabulary</button>` : ''}
              <button class="btn-ghost" type="button" onclick="archiveLookup('${item.id}')">Delete</button>
            `
          )).join('') : englishEmpty('Inbox items will appear here.')}
        </div>
      </div>
      <div class="card english-vocab-card english-vocab-review-card">
        <div class="english-vocab-card-head">
          <div class="card-title"><i class="ti ti-repeat"></i>Active Reviews</div>
          <div class="english-vocab-kicker">Promoted C items only</div>
        </div>
        <div class="english-list english-vocab-list">
          ${vocabulary.length ? vocabulary.map(item => englishItem(
            item.phrase,
            `${buildVocabularyBadge(englishItemTypeLabel(item.item_type), item.item_type === 'PHRASE' ? 'warm' : 'cool')} ${buildVocabularyBadge(englishLearningClassificationLabel(item.learning_classification), 'strong')} ${buildVocabularyBadge(englishFamiliarityLabel(item.familiarity_status))} Next review ${englishDate(item.next_review_date)} · ${englishEsc(item.confidence_label || 'New')}`,
            `
              ${item.meaning ? `<div><strong>Meaning:</strong> ${englishEsc(item.meaning)}</div>` : ''}
              ${item.meaning_cantonese ? `<div><strong>Cantonese meaning:</strong> ${englishEsc(item.meaning_cantonese)}</div>` : ''}
              ${item.example_sentence ? `<div><strong>Original sentence:</strong> ${englishEsc(item.example_sentence)}</div>` : ''}
              <div><strong>Personal sentence:</strong> ${englishEsc(item.personal_sentence)}</div>
              ${item.source_context ? `<div><strong>Source:</strong> ${englishEsc(item.source_context)}</div>` : ''}
              ${item.category ? `<div><strong>Category:</strong> ${englishEsc(item.category)}</div>` : ''}
              ${item.pronunciation_note ? `<div><strong>Pronunciation note:</strong> ${englishEsc(item.pronunciation_note)}</div>` : ''}
              <div><strong>Last reviewed:</strong> ${item.last_reviewed_at ? englishDate(item.last_reviewed_at.slice(0, 10)) : '—'}</div>
            `,
            `<button class="btn-secondary" type="button" onclick="openVocabularyItemEditor('${item.id}')">Edit</button>
             <button class="btn-secondary" type="button" onclick="completeVocabularyReview('${item.id}','completed',4)">Completed</button>
             <button class="btn-secondary" type="button" onclick="completeVocabularyReview('${item.id}','again',2)">Again</button>`
          )).join('') : englishEmpty('Promoted vocabulary items will appear here.')}
        </div>
      </div>
    </div>
    </div>
  `;
  updateVocabularyTypeSuggestion();
  applyInboxViewportLimit();
}

function renderEnglishSpeaking() {
  const el = document.getElementById('english-section-speaking');
  if (!el) return;
  const sessions = englishState.speaking || [];
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="ti ti-microphone-2"></i>Speaking Practice</div>
      <div class="english-form-grid">
        <div><label>Date</label><input id="english-speaking-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div><label>Topic</label><input id="english-speaking-topic" type="text" placeholder="Meeting update, self-introduction, feedback"></div>
        <div class="full"><label>Prompt</label><input id="english-speaking-prompt" type="text" placeholder="Optional prompt"></div>
        <div class="full"><label>Attempt one</label><textarea id="english-speaking-attempt-one" rows="3" placeholder="What did you say first?"></textarea></div>
        <div class="full"><label>Attempt two</label><textarea id="english-speaking-attempt-two" rows="3" placeholder="What improved on the second try?"></textarea></div>
        <div class="full"><label>Reflection</label><textarea id="english-speaking-reflection" rows="3" placeholder="What would you keep or change?"></textarea></div>
      </div>
      <div class="english-actions" style="margin-top:12px"><button class="btn-primary" type="button" onclick="saveSpeakingSession()"><i class="ti ti-check"></i>Save speaking practice</button></div>
    </div>
    <div class="card">
      <div class="card-title"><i class="ti ti-history"></i>Recent Speaking Sessions</div>
      <div class="english-list">
        ${sessions.length ? sessions.map(session => englishItem(
          session.topic,
          englishDate(session.session_date),
          englishEsc(session.reflection || session.attempt_two_notes || session.attempt_one_notes || '')
        )).join('') : englishEmpty('Two-attempt speaking sessions will appear here.')}
      </div>
    </div>
  `;
}

function renderEnglishInterview() {
  const el = document.getElementById('english-section-interview');
  if (!el) return;
  const questions = englishState.interviewQuestions || [];
  const practice = englishState.interviewPractice || [];
  const stars = englishState.starStories || [];
  el.innerHTML = `
    <div class="english-grid-2">
      <div class="card">
        <div class="card-title"><i class="ti ti-help-circle"></i>Interview Question</div>
        <div class="english-form-grid">
          <div class="full"><label>Question</label><input id="english-interview-question" type="text" placeholder="Tell me about a time..."></div>
          <div><label>Category</label><input id="english-interview-category" type="text" placeholder="Leadership, teamwork, conflict"></div>
          <div><label>Notes</label><input id="english-interview-notes" type="text" placeholder="Optional"></div>
        </div>
        <div class="english-actions" style="margin-top:12px"><button class="btn-primary" type="button" onclick="saveInterviewQuestion()"><i class="ti ti-plus"></i>Save question</button></div>
        <div class="english-list" style="margin-top:14px">
          ${questions.length ? questions.map(item => englishItem(
            item.question,
            englishEsc(item.category || 'General'),
            englishEsc(item.notes || '')
          )).join('') : englishEmpty('Interview questions will appear here.')}
        </div>
      </div>
      <div class="card">
        <div class="card-title"><i class="ti ti-briefcase-2"></i>Practice Answer</div>
        <div class="english-form-grid">
          <div><label>Date</label><input id="english-practice-date" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
          <div><label>Confidence</label><select id="english-practice-confidence"><option value="">Choose</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div>
          <div class="full"><label>Question</label><select id="english-practice-question"><option value="">Choose a saved question</option>${questions.map(item => `<option value="${englishEsc(item.id)}">${englishEsc(item.question)}</option>`).join('')}</select></div>
          <div class="full"><label>Answer notes</label><textarea id="english-practice-answer" rows="3" placeholder="Outline your answer"></textarea></div>
          <div class="full"><label>Follow-up notes</label><textarea id="english-practice-follow-up" rows="3" placeholder="What would you tighten next time?"></textarea></div>
        </div>
        <div class="english-actions" style="margin-top:12px"><button class="btn-primary" type="button" onclick="saveInterviewPractice()"><i class="ti ti-check"></i>Save practice</button></div>
      </div>
    </div>
    <div class="english-grid-2">
      <div class="card">
        <div class="card-title"><i class="ti ti-list-details"></i>Recent Practice</div>
        <div class="english-list">
          ${practice.length ? practice.map(item => englishItem(
            item.question_text || 'Interview practice',
            `${englishDate(item.practice_date)}${item.confidence_score ? ` · Confidence ${item.confidence_score}/5` : ''}`,
            englishEsc(item.follow_up_notes || item.answer_notes || '')
          )).join('') : englishEmpty('Saved interview practice will appear here.')}
        </div>
      </div>
      <div class="card">
        <div class="card-title"><i class="ti ti-star"></i>STAR Story Bank</div>
        <div class="english-form-grid">
          <div class="full"><label>Title</label><input id="english-star-title" type="text" placeholder="Handled a difficult stakeholder request"></div>
          <div class="full"><label>Situation</label><textarea id="english-star-situation" rows="2"></textarea></div>
          <div class="full"><label>Task</label><textarea id="english-star-task" rows="2"></textarea></div>
          <div class="full"><label>Action</label><textarea id="english-star-action" rows="2"></textarea></div>
          <div class="full"><label>Result</label><textarea id="english-star-result" rows="2"></textarea></div>
          <div><label>Target skill</label><input id="english-star-skill" type="text" placeholder="Leadership, ownership, communication"></div>
        </div>
        <div class="english-actions" style="margin-top:12px"><button class="btn-primary" type="button" onclick="saveStarStory()"><i class="ti ti-plus"></i>Save STAR story</button></div>
        <div class="english-list" style="margin-top:14px">
          ${stars.length ? stars.map(item => englishItem(
            item.title,
            englishEsc(item.target_skill || 'General'),
            englishEsc(item.result)
          )).join('') : englishEmpty('STAR stories will appear here.')}
        </div>
      </div>
    </div>
  `;
}

function renderEnglishWeeklyReview() {
  const el = document.getElementById('english-section-weekly-review');
  if (!el) return;
  const reviews = englishState.weeklyReviews || [];
  el.innerHTML = `
    <div class="card">
      <div class="card-title"><i class="ti ti-calendar-week"></i>Weekly Review</div>
      <div class="english-note">Generate a quick summary from the activities already saved in this module.</div>
      <div class="english-actions" style="margin-top:12px">
        <button class="btn-primary" type="button" onclick="generateWeeklyReview()"><i class="ti ti-wand"></i>Generate this week</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title"><i class="ti ti-history"></i>Saved Weekly Reviews</div>
      <div class="english-list">
        ${reviews.length ? reviews.map(item => englishItem(
          `Week of ${englishDate(item.week_start_date)}`,
          englishEsc(item.next_focus || 'Next focus saved'),
          englishEsc(item.summary || '')
        )).join('') : englishEmpty('Weekly reviews will appear here after generation.')}
      </div>
    </div>
  `;
}

function renderEnglishProgress() {
  const el = document.getElementById('english-section-progress');
  if (!el) return;
  const progress = englishState.progress || {};
  el.innerHTML = `
    <div class="english-mini-metrics">
      <div class="english-mini-card"><div class="english-mini-label">Journals</div><div class="english-mini-value">${progress.journals || 0}</div><div class="english-mini-copy">Short written reflections</div></div>
      <div class="english-mini-card"><div class="english-mini-label">Reviews Completed</div><div class="english-mini-value">${progress.reviews_completed || 0}</div><div class="english-mini-copy">Vocabulary repetitions logged</div></div>
      <div class="english-mini-card"><div class="english-mini-label">Interview Practice</div><div class="english-mini-value">${progress.interview_practices || 0}</div><div class="english-mini-copy">Saved answer attempts</div></div>
    </div>
    <div class="english-grid-3">
      <div class="card"><div class="card-title"><i class="ti ti-book-2"></i>Reading</div><div class="english-note">${progress.active_books || 0} active book(s) and ${progress.completed_books || 0} completed.</div></div>
      <div class="card"><div class="card-title"><i class="ti ti-headphones"></i>Listening</div><div class="english-note">${progress.listening_sessions || 0} session(s) logged so far.</div></div>
      <div class="card"><div class="card-title"><i class="ti ti-microphone-2"></i>Speaking</div><div class="english-note">${progress.speaking_sessions || 0} speaking practice session(s) saved.</div></div>
    </div>
  `;
}

function renderEnglishSection(section) {
  const viewMap = {
    today: renderEnglishToday,
    journal: renderEnglishJournal,
    reading: renderEnglishReading,
    listening: renderEnglishListening,
    vocabulary: renderEnglishVocabulary,
    speaking: renderEnglishSpeaking,
    interview: renderEnglishInterview,
    'weekly-review': renderEnglishWeeklyReview,
    progress: renderEnglishProgress,
  };
  viewMap[section]?.();
}

async function refreshEnglishSection(section = englishCurrentSection) {
  try {
    await loadEnglishSectionData(section);
    renderEnglishSection(section);
  } catch (error) {
    const el = document.getElementById(`english-section-${section}`);
    if (el) el.innerHTML = englishEmpty(`Could not load this section: ${englishEsc(error.message)}`);
    if (typeof showToast === 'function') showToast(`Error: ${error.message}`, true);
  }
}

function showEnglishSection(section, btn) {
  englishCurrentSection = section;
  document.querySelectorAll('#sb-mode-english .nav').forEach(item => item.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('#area-english .english-view').forEach(view => view.classList.remove('active'));
  document.getElementById(`english-section-${section}`)?.classList.add('active');
  const titles = {
    today: 'English Learning',
    journal: 'English Journal',
    reading: 'English Reading',
    listening: 'English Listening',
    vocabulary: 'English Vocabulary',
    speaking: 'English Speaking',
    interview: 'Interview Practice',
    'weekly-review': 'English Weekly Review',
    progress: 'English Progress',
  };
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) pageTitle.textContent = titles[section] || 'English Learning';
  refreshEnglishSection(section);
}

async function initEnglishLearning() {
  if (!englishInitialized) {
    englishInitialized = true;
  }
  const activeBtn = document.querySelector(`#nav-english-${englishCurrentSection}`) || document.getElementById('nav-english-today');
  showEnglishSection(englishCurrentSection, activeBtn);
}

async function saveEnglishJournal() {
  try {
    const payload = {
      entry_date: document.getElementById('english-journal-date')?.value || null,
      prompt: document.getElementById('english-journal-prompt')?.value || '',
      content: document.getElementById('english-journal-content')?.value || '',
      clarity_notes: document.getElementById('english-journal-clarity')?.value || '',
      vocabulary_notes: document.getElementById('english-journal-vocab')?.value || '',
      grammar_notes: document.getElementById('english-journal-grammar')?.value || '',
      mood_score: document.getElementById('english-journal-mood')?.value || null,
      confidence_score: document.getElementById('english-journal-confidence')?.value || null,
      writing_issues: [],
    };
    if (englishJournalEditorState.entryId) {
      await apiPut(`/english/journal/${englishJournalEditorState.entryId}`, payload);
      showToast('Journal updated');
    } else {
      await apiPost('/english/journal', payload);
      showToast('Journal saved');
    }
    resetEnglishJournalEditor();
    refreshEnglishSection('journal');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveEnglishBook() {
  try {
    await apiPost('/english/reading-books', {
      title: document.getElementById('english-book-title')?.value || '',
      current_page: Number(document.getElementById('english-book-current-page')?.value || 0),
      total_pages: document.getElementById('english-book-total-pages')?.value || null,
      status: 'reading',
    });
    showToast('Book saved');
    refreshEnglishSection('reading');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function quickUpdateReadingPage(bookId, nextPage) {
  const book = (englishState.reading || []).find(item => item.id === bookId);
  if (!book) return;
  try {
    await apiPut(`/english/reading-books/${bookId}`, {
      title: book.title,
      current_page: nextPage,
      total_pages: book.total_pages,
      status: book.status,
      last_updated_date: new Date().toISOString().slice(0, 10),
    });
    showToast('Reading page updated');
    refreshEnglishSection('reading');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function markReadingBookCompleted(bookId) {
  const book = (englishState.reading || []).find(item => item.id === bookId);
  if (!book) return;
  try {
    await apiPut(`/english/reading-books/${bookId}`, {
      title: book.title,
      current_page: book.current_page,
      total_pages: book.total_pages,
      status: 'completed',
      last_updated_date: new Date().toISOString().slice(0, 10),
    });
    showToast('Book marked completed');
    refreshEnglishSection('reading');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function deleteReadingBook(bookId) {
  if (!window.confirm('Delete this reading book?')) return;
  try {
    await apiDelete(`/english/reading-books/${bookId}`);
    showToast('Book deleted');
    refreshEnglishSection('reading');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

window.rememberEnglishReadingProcessState = rememberEnglishReadingProcessState;

async function saveListeningSource() {
  try {
    await apiPost('/english/listening-sources', {
      title: document.getElementById('english-source-title')?.value || '',
      source_type: document.getElementById('english-source-type')?.value || 'podcast',
      url: document.getElementById('english-source-url')?.value || '',
      notes: document.getElementById('english-source-notes')?.value || '',
    });
    showToast('Listening source saved');
    refreshEnglishSection('listening');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveListeningSession() {
  try {
    await apiPost('/english/listening-sessions', {
      source_id: document.getElementById('english-listening-source')?.value || null,
      session_date: document.getElementById('english-listening-date')?.value || null,
      focus_area: document.getElementById('english-listening-focus')?.value || '',
      notes: document.getElementById('english-listening-notes')?.value || '',
      reflection: document.getElementById('english-listening-reflection')?.value || '',
      difficulty_score: document.getElementById('english-listening-difficulty')?.value || null,
      second_pass_completed: document.getElementById('english-listening-second-pass')?.value === 'true',
    });
    showToast('Listening session saved');
    refreshEnglishSection('listening');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveWordLookup() {
  try {
    await apiPost('/english/word-lookups', {
      phrase: document.getElementById('english-lookup-phrase')?.value || '',
      item_type: document.getElementById('english-lookup-item-type')?.value || inferVocabularyItemType(document.getElementById('english-lookup-phrase')?.value || ''),
      learning_classification: document.getElementById('english-lookup-learning-classification')?.value || 'A_UNDERSTAND_FOR_NOW',
      familiarity_status: document.getElementById('english-lookup-familiarity-status')?.value || 'NEW',
      meaning: document.getElementById('english-lookup-meaning')?.value || '',
      meaning_cantonese: document.getElementById('english-lookup-meaning-cantonese')?.value || '',
      example_sentence: document.getElementById('english-lookup-example')?.value || '',
      source_context: document.getElementById('english-lookup-context')?.value || '',
      pronunciation_note: document.getElementById('english-lookup-pronunciation')?.value || '',
    });
    showToast('Lookup saved');
    refreshEnglishSection('vocabulary');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

function setVocabularyFilter(key, value) {
  englishVocabularyFilters[key] = value;
  renderEnglishVocabulary();
}

async function archiveLookup(lookupId) {
  const item = (englishState.lookups || []).find(entry => entry.id === lookupId);
  if (!item) return;
  try {
    await apiPut(`/english/word-lookups/${lookupId}`, {
      phrase: item.phrase,
      item_type: item.item_type,
      learning_classification: item.learning_classification,
      familiarity_status: item.familiarity_status,
      meaning: item.meaning,
      meaning_cantonese: item.meaning_cantonese,
      example_sentence: item.example_sentence,
      source_context: item.source_context,
      pronunciation_note: item.pronunciation_note,
      is_promoted: item.is_promoted,
      status: 'archived',
    });
    showToast('Lookup archived');
    refreshEnglishSection('vocabulary');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function promoteLookup(lookupId) {
  openVocabularyPromotion(lookupId);
}

async function submitVocabularyPromotion() {
  const { lookupId, force } = englishVocabularyPromotionState;
  if (!lookupId) return;
  const personalSentence = document.getElementById('english-promote-personal-sentence')?.value || '';
  const meaningCantonese = document.getElementById('english-promote-meaning-cantonese')?.value || '';
  const category = document.getElementById('english-promote-category')?.value || 'General';
  const pronunciationNote = document.getElementById('english-promote-pronunciation')?.value || '';
  const feedback = document.getElementById('english-vocab-promote-feedback');
  const submit = document.getElementById('english-vocab-promote-submit');
  if (!personalSentence.trim()) {
    if (feedback) {
      feedback.textContent = 'Personal sentence is required for active vocabulary.';
      feedback.className = 'english-vocab-promote-feedback error';
    }
    showToast('Error: personal_sentence is required for active vocabulary.', true);
    return;
  }
  try {
    if (feedback) {
      feedback.textContent = '';
      feedback.className = 'english-vocab-promote-feedback';
    }
    if (submit) submit.disabled = true;
    await apiPost(`/english/word-lookups/${lookupId}/promote`, {
      personal_sentence: personalSentence,
      meaning_cantonese: meaningCantonese,
      category,
      pronunciation_note: pronunciationNote,
      force,
    });
    showToast('Moved into active vocabulary');
    closeVocabularyPromotion();
    refreshEnglishSection('vocabulary');
  } catch (error) {
    if ((error.message || '').includes('You already selected three items today')) {
      englishVocabularyPromotionState.force = true;
      if (feedback) {
        feedback.textContent = 'You already promoted three items today. Click again to override the limit for this one.';
        feedback.className = 'english-vocab-promote-feedback warning';
      }
      if (submit) submit.textContent = 'Promote anyway';
      showToast(error.message, true);
      if (submit) submit.disabled = false;
      return;
    }
    showToast(`Error: ${error.message}`, true);
    if (feedback) {
      feedback.textContent = error.message || 'Unable to promote this item right now.';
      feedback.className = 'english-vocab-promote-feedback error';
    }
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function completeVocabularyReview(itemId, result, confidence) {
  try {
    await apiPost('/english/vocabulary-reviews', {
      vocabulary_item_id: itemId,
      review_date: new Date().toISOString().slice(0, 10),
      confidence_score: confidence,
      result,
    });
    showToast('Review saved');
    refreshEnglishSection('vocabulary');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveSpeakingSession() {
  try {
    await apiPost('/english/speaking-sessions', {
      topic: document.getElementById('english-speaking-topic')?.value || '',
      prompt: document.getElementById('english-speaking-prompt')?.value || '',
      attempt_one_notes: document.getElementById('english-speaking-attempt-one')?.value || '',
      attempt_two_notes: document.getElementById('english-speaking-attempt-two')?.value || '',
      reflection: document.getElementById('english-speaking-reflection')?.value || '',
      session_date: document.getElementById('english-speaking-date')?.value || null,
    });
    showToast('Speaking session saved');
    refreshEnglishSection('speaking');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveInterviewQuestion() {
  try {
    await apiPost('/english/interview-questions', {
      question: document.getElementById('english-interview-question')?.value || '',
      category: document.getElementById('english-interview-category')?.value || '',
      notes: document.getElementById('english-interview-notes')?.value || '',
    });
    showToast('Interview question saved');
    refreshEnglishSection('interview');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveInterviewPractice() {
  try {
    await apiPost('/english/interview-practice', {
      question_id: document.getElementById('english-practice-question')?.value || null,
      practice_date: document.getElementById('english-practice-date')?.value || null,
      answer_notes: document.getElementById('english-practice-answer')?.value || '',
      follow_up_notes: document.getElementById('english-practice-follow-up')?.value || '',
      confidence_score: document.getElementById('english-practice-confidence')?.value || null,
    });
    showToast('Interview practice saved');
    refreshEnglishSection('interview');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function saveStarStory() {
  try {
    await apiPost('/english/star-stories', {
      title: document.getElementById('english-star-title')?.value || '',
      situation: document.getElementById('english-star-situation')?.value || '',
      task: document.getElementById('english-star-task')?.value || '',
      action: document.getElementById('english-star-action')?.value || '',
      result: document.getElementById('english-star-result')?.value || '',
      target_skill: document.getElementById('english-star-skill')?.value || '',
    });
    showToast('STAR story saved');
    refreshEnglishSection('interview');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}

async function generateWeeklyReview() {
  try {
    await apiPost('/english/weekly-reviews/generate', {});
    showToast('Weekly review generated');
    refreshEnglishSection('weekly-review');
  } catch (error) {
    showToast(`Error: ${error.message}`, true);
  }
}
