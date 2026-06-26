// Dashboard page: fetch data and render
let showAllTopCategories = false;

async function loadDashboard(periodMode, startDate, endDate) {
  const params = new URLSearchParams({
    period_mode: periodMode || 'Financial Year',
  });
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);

  renderFinanceSnapshotLoading();
  const financePromise = loadDashboardFinanceSnapshot();

  let data;
  try {
    data = await apiGet('/reports/dashboard?' + params);
  } catch (e) {
    document.getElementById('dashboard-metrics-row1').innerHTML =
      `<div style="grid-column:1/-1;color:#c0392b;padding:12px">Dashboard error: ${e.message}</div>`;
    return;
  }

  _lastDashboardData = data;
  renderDashboardMetrics(data.metrics);
  renderTopCategories(data.category_spending);
  renderExpenseBreakout(data);
  await financePromise;
}

function pctOfIncome(num, income) {
  const n = parseFloat(num) || 0;
  const d = parseFloat(income) || 0;
  if (d <= 0) return '';
  return ((n / d) * 100).toFixed(1) + '% of income';
}

function savingsRate(num, income) {
  const n = parseFloat(num) || 0;
  const d = parseFloat(income) || 0;
  if (d <= 0) return '';
  return ((n / d) * 100).toFixed(1) + '% savings rate';
}

function signedGBP(val) {
  const n = parseFloat(val) || 0;
  const sign = n >= 0 ? '+' : '-';
  return sign + '£' + fmtAmt(Math.abs(n));
}

function renderDashboardMetrics(m) {
  const income = m.gross_income_gbp;
  const ncf = parseFloat(m.net_cash_flow_gbp) || 0;

  // Row 1
  document.getElementById('mc-income').textContent = fmtGBP(m.gross_income_gbp);
  document.getElementById('mc-income-sub').textContent = document.getElementById('period-hint').textContent || 'Selected period';
  document.getElementById('mc-tax').textContent = '£' + fmtAmt(m.total_tax_amount_gbp);
  document.getElementById('mc-tax-sub').textContent = pctOfIncome(m.total_tax_amount_gbp, income);
  document.getElementById('mc-taxable-exp').textContent = '£' + fmtAmt(m.taxable_expense_gbp);
  document.getElementById('mc-taxable-exp-sub').textContent = pctOfIncome(m.taxable_expense_gbp, income);

  const ncfEl = document.getElementById('mc-cashflow');
  ncfEl.textContent = signedGBP(m.net_cash_flow_gbp);
  ncfEl.className = 'mc-value ' + (ncf >= 0 ? 'pos' : 'neg');
  document.getElementById('mc-cashflow-sub').textContent = pctOfIncome(m.net_cash_flow_gbp, income);

  // Row 2
  document.getElementById('mc-exp-used').textContent = '£' + fmtAmt(m.expense_used_ex_tax_gbp);
  document.getElementById('mc-exp-used-sub').textContent = pctOfIncome(m.expense_used_ex_tax_gbp, income);
  document.getElementById('mc-exp-paid').textContent = '£' + fmtAmt(m.expense_paid_ex_tax_gbp);
  document.getElementById('mc-exp-paid-sub').textContent = pctOfIncome(m.expense_paid_ex_tax_gbp, income);

  const savUsed = parseFloat(m.saving_used_gbp) || 0;
  const savUsedEl = document.getElementById('mc-sav-used');
  savUsedEl.textContent = '£' + fmtAmt(m.saving_used_gbp);
  savUsedEl.className = 'mc-value ' + (savUsed >= 0 ? 'pos' : 'neg');
  document.getElementById('mc-sav-used-sub').textContent = savingsRate(m.saving_used_gbp, income);

  const savPaid = parseFloat(m.saving_paid_gbp) || 0;
  const savPaidEl = document.getElementById('mc-sav-paid');
  savPaidEl.textContent = '£' + fmtAmt(m.saving_paid_gbp);
  savPaidEl.className = 'mc-value ' + (savPaid >= 0 ? 'pos' : 'neg');
  document.getElementById('mc-sav-paid-sub').textContent = savingsRate(m.saving_paid_gbp, income);
}

function renderTopCategories(categories) {
  const el = document.getElementById('dashboard-top-cats');
  if (!categories || !categories.length) {
    el.innerHTML = '<div class="card-title"><i class="ti ti-flame"></i>Top categories<span class="ct-right">GBP 0.00</span></div><div style="font-size:12px;color:#8492a6">No data</div>';
    return;
  }

  const positiveRows = categories.filter(r => parseFloat(r.amount_gbp) > 0);
  const total = positiveRows.reduce((s, r) => s + parseFloat(r.amount_gbp), 0);
  const maxAmt = positiveRows.length ? parseFloat(positiveRows[0].amount_gbp) : 1;
  const visibleRows = showAllTopCategories ? positiveRows : positiveRows.slice(0, 5);
  const remaining = positiveRows.length - visibleRows.length;

  let html = `<div class="card-title"><i class="ti ti-flame"></i>Top categories<span class="ct-right">GBP ${fmtAmt(total)}</span></div>`;
  visibleRows.forEach((r, i) => {
    const amt = parseFloat(r.amount_gbp);
    const pct = total > 0 ? Math.round(amt / total * 100) : 0;
    const barW = maxAmt > 0 ? Math.round(amt / maxAmt * 100) : 0;
    const color = getCatColor(r.category);
    html += `<div class="top-cat-row">
      <div class="top-cat-rank">${i + 1}</div>
      <div class="top-cat-bar-wrap">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span class="top-cat-name"><span class="cat-dot" style="background:${color};display:inline-block;margin-right:5px"></span>${r.category}</span>
          <span class="top-cat-amt">GBP ${fmtAmt(r.amount_gbp)} · ${pct}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${barW}%;background:${color}"></div></div>
      </div>
    </div>`;
  });
  if (positiveRows.length > 5) {
    const label = showAllTopCategories
      ? 'Show fewer'
      : `Show all items (${positiveRows.length})`;
    html += `<button class="top-cat-toggle" type="button" onclick="toggleTopCategories()">${label}</button>`;
  } else if (remaining > 0) {
    html += `<div class="top-cat-toggle">${remaining} more categor${remaining === 1 ? 'y' : 'ies'}</div>`;
  }
  el.innerHTML = html;
}

function renderFinanceSnapshotLoading() {
  const el = document.getElementById('dashboard-finance');
  if (!el) return;
  el.innerHTML = '<div class="card-title"><i class="ti ti-building-bank"></i>Finance snapshot</div><div style="font-size:12px;color:#8492a6">Loading...</div>';
}

function renderDashboardFinanceSnapshot(summary, totals) {
  const el = document.getElementById('dashboard-finance');
  let html = '<div class="card-title"><i class="ti ti-building-bank"></i>Finance snapshot</div>';

  if (!summary || !summary.length) {
    html += '<div style="font-size:12px;color:#8492a6">No finance data</div>';
    el.innerHTML = html;
    return;
  }

  summary.forEach(r => {
    html += `<div class="fin-row"><span class="fin-label">${r.currency}</span><span class="fin-bal">${fmtAmt(r.balance)}</span></div>`;
  });

  if (totals) {
    html += `<div class="fin-total"><span>Excl. Mum's Time D (GBP)</span><span>${fmtAmt(totals.total_gbp_excluding_mums_time_d)}</span></div>`;
    html += `<div class="fin-total"><span>Excl. Mum's Time D (HKD)</span><span>${fmtAmt(totals.total_hkd_excluding_mums_time_d)}</span></div>`;
    html += `<div class="fin-total"><span>Incl. Mum's Time D (GBP)</span><span>${fmtAmt(totals.total_gbp_including_mums_time_d)}</span></div>`;
    html += `<div class="fin-total"><span>Incl. Mum's Time D (HKD)</span><span>${fmtAmt(totals.total_hkd_including_mums_time_d)}</span></div>`;
    if (totals.rate_gbp_hkd) {
      html += `<div class="fin-total"><span>FX rate used (GBP/HKD)</span><span>${totals.rate_gbp_hkd}</span></div>`;
    }
  }
  el.innerHTML = html;
}

async function loadDashboardFinanceSnapshot() {
  try {
    const overview = await apiGet('/finance/overview');
    const excluding = (overview.scenario_totals || []).find((row) => row.scenario === "Excluding Mum's Time D");
    const including = (overview.scenario_totals || []).find((row) => row.scenario === "Including Mum's Time D");
    renderDashboardFinanceSnapshot(
      overview.currency_totals || [],
      {
        total_gbp_excluding_mums_time_d: excluding?.total_gbp,
        total_hkd_excluding_mums_time_d: excluding?.total_hkd,
        total_gbp_including_mums_time_d: including?.total_gbp,
        total_hkd_including_mums_time_d: including?.total_hkd,
        rate_gbp_hkd: overview.rate_gbp_hkd,
      },
    );
  } catch (e) {
    const el = document.getElementById('dashboard-finance');
    if (!el) return;
    el.innerHTML = `<div class="card-title"><i class="ti ti-building-bank"></i>Finance snapshot</div><div style="font-size:12px;color:#c0392b">Finance snapshot error: ${e.message}</div>`;
  }
}

function renderExpenseBreakout(data) {
  const el = document.getElementById('dashboard-breakout');
  const b = data.expense_breakout;
  const tax = parseFloat(data.displayed_tax_gbp) || 0;

  // Determine which basis to show based on the toggle
  const basisEl = document.getElementById('breakout-basis');
  const basis = basisEl ? basisEl.value : 'paid';
  const paidTotalExTax = parseFloat(data.total_expense_paid_gbp) || 0;
  const usedTotalExTax = parseFloat(data.total_expense_used_gbp) || 0;
  const totalExTax = basis === 'used' ? usedTotalExTax : paidTotalExTax;
  const totalInclTax = totalExTax + tax;
  const paidRegularNonHousing = parseFloat(b.regular_non_housing_gbp) || 0;
  const usedAdjustment = usedTotalExTax - paidTotalExTax;
  const regularNonHousing = basis === 'used'
    ? paidRegularNonHousing + usedAdjustment
    : paidRegularNonHousing;

  function bkRow(label, val, isTotal) {
    const cls = isTotal ? 'bk-row' : 'bk-row';
    const style = isTotal ? ' style="font-weight:600;border-top:1px solid #e8ecf4;padding-top:7px"' : '';
    return `<div class="${cls}"${style}><span class="bk-type">${label}</span><span class="bk-gbp">£${fmtAmt(val)}</span></div>`;
  }

  let html = '<div class="card-title"><i class="ti ti-receipt"></i>Expense breakout</div>';
  html += `<div class="seg-control" style="margin-bottom:12px">
    <button class="seg-btn ${basis === 'paid' ? 'active' : ''}" onclick="setBreakoutBasis('paid')">Paid</button>
    <button class="seg-btn ${basis === 'used' ? 'active' : ''}" onclick="setBreakoutBasis('used')">Used</button>
  </div>`;
  html += `<input type="hidden" id="breakout-basis" value="${basis}">`;

  html += bkRow('Housing', parseFloat(b.housing_gbp) || 0, false);
  html += bkRow('Regular non-housing expenses', regularNonHousing, false);
  html += bkRow('Family', parseFloat(b.family_gbp) || 0, false);
  html += bkRow('UK Settlement', parseFloat(b.uk_settlement_gbp) || 0, false);
  html += bkRow('Large One-off', parseFloat(b.large_one_off_gbp) || 0, false);
  html += bkRow('Travel', parseFloat(b.travel_gbp) || 0, false);
  html += bkRow('Total before tax', totalExTax, true);
  html += bkRow('Tax payment', tax, false);
  html += bkRow('Total including tax', totalInclTax, true);

  el.innerHTML = html;
}

// Store dashboard data globally for breakout basis toggle
let _lastDashboardData = null;

window.setBreakoutBasis = function(basis) {
  const el = document.getElementById('breakout-basis');
  if (el) el.value = basis;
  if (_lastDashboardData) {
    renderExpenseBreakout(_lastDashboardData);
  }
};

window.toggleTopCategories = function() {
  showAllTopCategories = !showAllTopCategories;
  if (_lastDashboardData) {
    renderTopCategories(_lastDashboardData.category_spending);
  }
};
