// Home page

async function loadHomePage() {
  const finStats = document.getElementById('home-finance-stats');
  const plStats = document.getElementById('home-planner-stats');
  const englishStats = document.getElementById('home-english-stats');

  if (finStats) {
    try {
      const health = await apiGet('/health');
      finStats.textContent = health.status === 'ok' ? 'Connected' : 'Not connected';
    } catch {
      finStats.textContent = 'Not connected';
    }
  }

  if (plStats) {
    try {
      const tasks = await apiGet('/tasks');
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const pending = tasks.filter(t => !t.is_done && !t.is_cancelled).length;
      const overdue = tasks.filter(t => !t.is_done && !t.is_cancelled && t.deadline && t.deadline < todayKey).length;
      let text = `${pending} pending task${pending !== 1 ? 's' : ''}`;
      if (overdue > 0) text += ` · ${overdue} overdue`;
      plStats.textContent = text;
    } catch {
      plStats.textContent = '';
    }
  }

  if (englishStats) {
    try {
      const progress = await apiGet('/english/progress');
      englishStats.textContent = `${progress.reviews_due} review${progress.reviews_due !== 1 ? 's' : ''} due · ${progress.active_books} active book${progress.active_books !== 1 ? 's' : ''}`;
    } catch {
      englishStats.textContent = '';
    }
  }
}
