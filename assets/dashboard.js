function initDashboard() {
  const data = window.D;

  // Update header
  document.getElementById('hdr-sub').textContent =
    'Revenue: ' + data.data_period_revenue + ' · Activity: ' + data.data_period_activity + ' · CRM: ' + data.crm_date;
  document.getElementById('hdr-updated').textContent = 'Updated: ' + data.generated;
  document.getElementById('rev-label').textContent = 'Revenue — ' + data.data_period_revenue;
  document.getElementById('crm-label').textContent = 'CRM account hygiene — as of ' + data.crm_date;
  document.getElementById('ask-label').textContent = data.data_period_activity + ' — asks & activity';
  document.getElementById('data-note').innerHTML =
    '<strong>Data sources:</strong> Revenue from SDS Report 4. Account hygiene from Rumple/MyCustomers. ' +
    'Ask & activity data from Rumple activity report. Active/inactive = pitched within last 6 weeks. ' +
    'Generated: ' + data.generated + '. No data has been fabricated.';

  // Populate office filter
  const offices = [...new Set(data.reps.filter(r => r.office).map(r => r.office))].sort();
  offices.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    document.getElementById('f-office').appendChild(opt);
  });

  // Populate rep filter
  window.allReps = data.reps.slice().sort((a, b) => a.rep.localeCompare(b.rep));
  allReps.forEach(r => {
    const o = document.createElement('option');
    o.value = r.rep; o.textContent = r.rep;
    document.getElementById('f-rep').appendChild(o);
  });

  renderMonthlyChart();
  renderOfficeBars();
  renderStationBars();
  renderRevTypeBars();
  render();
}

const $ = id => document.getElementById(id);
const fmt = n => n >= 1000000 ? '$' + (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n).toLocaleString();
const fmtF = n => '$' + Math.round(n).toLocaleString();
const pct = n => n.toFixed(1) + '%';
const gridState = {};
const stmrs = {};

function getFilteredReps() {
  const office = $('f-office').value, rep = $('f-rep').value;
  let reps = window.D.reps;
  if (office !== 'all') reps = reps.filter(r => r.office === office);
  if (rep !== 'all') reps = reps.filter(r => r.rep === rep);
  return filterRepsByDateRange(reps);
}

function filterChanged() {
  const office = $('f-office').value, repSel = $('f-rep'), cur = repSel.value;
  while (repSel.options.length > 1) repSel.remove(1);
  const filtered = office === 'all' ? window.allReps : window.allReps.filter(r => r.office === office);
  filtered.forEach(r => { const o = document.createElement('option'); o.value = r.rep; o.textContent = r.rep; repSel.appendChild(o); });
  repSel.value = filtered.find(r => r.rep === cur) ? cur : 'all';
  render();
}

/* ============================================================
   Date range selector
   Fiscal year runs Sept 1 – Aug 31.

   IMPORTANT: the current dashboard_data.json is pre-aggregated — monthly
   team revenue, per-rep activity for a single fixed month (mar_*), and a
   point-in-time account-hygiene snapshot. There are no per-record dates,
   so a selected range cannot re-slice the data yet. The UI, range math,
   and pipeline wiring are all in place; filterRepsByDateRange() below is
   the single hook to implement once dated / transaction-level data (the
   database layer) is available.
   ============================================================ */

const WEEK_START = 0; // 0 = Sunday, 1 = Monday — set to the team's week convention.
window.activeDateRange = { preset: 'all', start: null, end: null };

const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = d => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = d => { const x = startOfDay(d); return addDays(x, -((x.getDay() - WEEK_START + 7) % 7)); };

// Sep 1 of the fiscal year containing `ref`. Helper for future fiscal-period
// presets (e.g. fiscal YTD); not used by the current preset list.
function fiscalYearStart(ref) {
  const y = ref.getMonth() >= 8 ? ref.getFullYear() : ref.getFullYear() - 1;
  return new Date(y, 8, 1);
}

function computeDateRange(preset, ref) {
  const today = startOfDay(ref || new Date());
  switch (preset) {
    case 'today':      return { start: startOfDay(today), end: endOfDay(today) };
    case 'this_week':  { const s = startOfWeek(today); return { start: s, end: endOfDay(addDays(s, 6)) }; }
    case 'last_week':  { const s = addDays(startOfWeek(today), -7); return { start: s, end: endOfDay(addDays(s, 6)) }; }
    case 'this_month': { const s = new Date(today.getFullYear(), today.getMonth(), 1); return { start: startOfDay(s), end: endOfDay(new Date(today.getFullYear(), today.getMonth() + 1, 0)) }; }
    case 'last_month': { const s = new Date(today.getFullYear(), today.getMonth() - 1, 1); return { start: startOfDay(s), end: endOfDay(new Date(today.getFullYear(), today.getMonth(), 0)) }; }
    default:           return { start: null, end: null }; // 'all'
  }
}

const fmtDateShort = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const toInputDate = d => { const x = startOfDay(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

function dateRangeChanged() {
  const preset = $('f-daterange').value, customGrp = $('custom-range-grp');
  if (preset === 'custom') {
    customGrp.style.display = '';
    if (!$('f-date-start').value || !$('f-date-end').value) { // seed with current month
      const { start, end } = computeDateRange('this_month');
      $('f-date-start').value = toInputDate(start);
      $('f-date-end').value = toInputDate(end);
    }
    customRangeChanged();
    return;
  }
  customGrp.style.display = 'none';
  const { start, end } = computeDateRange(preset);
  window.activeDateRange = { preset, start, end };
  updateDateRangeNote();
  render();
}

function customRangeChanged() {
  const sv = $('f-date-start').value, ev = $('f-date-end').value;
  if (!sv || !ev) { updateDateRangeNote(); return; }
  let start = startOfDay(new Date(sv + 'T00:00:00')), end = endOfDay(new Date(ev + 'T00:00:00'));
  if (end < start) { const t = start; start = startOfDay(end); end = endOfDay(t); } // swap if reversed
  window.activeDateRange = { preset: 'custom', start, end };
  updateDateRangeNote();
  render();
}

function updateDateRangeNote() {
  const el = $('date-range-note'); if (!el) return;
  const r = window.activeDateRange;
  if (!r || !r.start || !r.end) { el.innerHTML = ''; return; }
  el.innerHTML = `Selected range: <strong>${fmtDateShort(r.start)} – ${fmtDateShort(r.end)}</strong> · ` +
    `<span class="dr-hint" title="The current data is pre-aggregated with no per-record dates; date filtering activates once dated data (the database layer) is available.">date filtering activates with the data backend</span>`;
}

// Date-range filter hook — INERT today (no per-record dates in the data).
// This is the single place to slice rep records once dated/transaction-level
// data exists: filter or re-aggregate each rep's records to window.activeDateRange.
function filterRepsByDateRange(reps) {
  // const { start, end } = window.activeDateRange || {};
  // if (!start || !end) return reps;
  // return reps.map(r => recomputeForRange(r, start, end));
  return reps;
}

function render() {
  const reps = getFilteredReps(), sortKey = $('f-sort').value;
  closeAllDrawers();
  updateRevKPIs(reps); updateCRMKPIs(reps); updateAskKPIs(reps);
  renderLeaderboard(reps, sortKey); renderActBreakdown(reps); renderCRBars(); renderCoaching(reps);
}

function updateRevKPIs(reps) {
  const D = window.D;
  const isAll = reps.length === D.reps.length;
  const ytd = reps.reduce((s, r) => s + r.ytd_revenue, 0);
  const priorYTD = isAll ? D.team_totals.prior_ytd_revenue : null;
  $('v-ytd').textContent = fmt(ytd); $('s-ytd').textContent = D.data_period_revenue;
  if (priorYTD) {
    const diff = ytd - priorYTD, vsPct = ((ytd - priorYTD) / priorYTD * 100).toFixed(1);
    $('v-vsly').textContent = (diff >= 0 ? '+' : '') + vsPct + '%';
    $('v-vsly').className = 'kpi-val ' + (diff >= 0 ? 'pos' : 'dn');
    $('s-vsly').textContent = (diff >= 0 ? '+' : '') + fmt(Math.abs(diff)) + ' vs prior year';
  } else { $('v-vsly').textContent = '—'; $('s-vsly').textContent = 'Select all reps'; }
  const topOffice = D.offices[0];
  $('v-topoffice').textContent = topOffice.office; $('s-topoffice').textContent = fmt(topOffice.ytd) + ' YTD';
}

function updateCRMKPIs(reps) {
  const assigned = reps.reduce((s, r) => s + r.total_accounts, 0);
  const active = reps.reduce((s, r) => s + r.active_accounts, 0);
  const inactive = reps.reduce((s, r) => s + r.inactive_accounts, 0);
  const never = reps.reduce((s, r) => s + r.never_pitched, 0);
  const zero = reps.reduce((s, r) => s + r.zero_activity, 0);
  $('v-assigned').textContent = assigned.toLocaleString(); $('s-assigned').textContent = 'Across all reps';
  $('v-active').textContent = active.toLocaleString(); $('s-active').textContent = (assigned > 0 ? Math.round(active / assigned * 100) : 0) + '% of assigned · 6-week window';
  $('v-inactive').textContent = inactive.toLocaleString(); $('s-inactive').textContent = (assigned > 0 ? Math.round(inactive / assigned * 100) : 0) + '% of assigned';
  $('v-neverpitched').textContent = never.toLocaleString(); $('s-neverpitched').textContent = (assigned > 0 ? Math.round(never / assigned * 100) : 0) + '% of assigned';
  $('v-zeroact').textContent = zero.toLocaleString(); $('s-zeroact').textContent = (assigned > 0 ? Math.round(zero / assigned * 100) : 0) + '% of assigned';
}

function updateAskKPIs(reps) {
  const D = window.D;
  const asks = reps.reduce((s, r) => s + r.mar_asks, 0);
  const closedAmt = reps.reduce((s, r) => s + r.mar_closed_total, 0);
  const closedN = reps.reduce((s, r) => s + r.mar_closed_count, 0);
  const cr = asks > 0 ? (closedN / asks * 100).toFixed(1) : 0;
  const avgAsk = asks > 0 ? Math.round(reps.reduce((s, r) => s + r.mar_asked_total, 0) / asks) : 0;
  const acts = reps.reduce((s, r) => s + r.mar_activities, 0);
  const cnas = reps.reduce((s, r) => s + r.mar_cna, 0);
  const cnaReps = reps.filter(r => r.mar_cna > 0).length;
  $('v-asks').textContent = asks; $('s-asks').textContent = reps.filter(r => r.mar_asks > 0).length + ' reps with asks';
  $('v-closed').textContent = fmt(closedAmt); $('s-closed').textContent = closedN + ' asks closed';
  $('v-cr').textContent = cr + '%'; $('v-cr').className = 'kpi-val ' + (cr >= 50 ? 'pos' : cr >= 35 ? '' : 'dn'); $('s-cr').textContent = closedN + ' of ' + asks + ' asks';
  $('v-avgask').textContent = fmtF(avgAsk); $('s-avgask').textContent = 'Per ask created';
  $('v-activities').textContent = acts; $('s-activities').textContent = 'Across ' + reps.filter(r => r.mar_activities > 0).length + ' reps';
  $('v-cna').textContent = cnas; $('s-cna').textContent = 'Only ' + cnaReps + ' rep' + (cnaReps !== 1 ? 's' : '') + ' logged CNAs';
}

function renderMonthlyChart() {
  const D = window.D;
  const max = Math.max(...D.monthly_actual, ...D.monthly_prior);
  const chart = $('monthly-chart'), lbls = $('monthly-labels');
  chart.innerHTML = ''; lbls.innerHTML = '';
  D.monthly_actual.forEach((v, i) => {
    const ha = Math.round((v / max) * 76), hp = Math.round((D.monthly_prior[i] / max) * 76);
    const g = document.createElement('div'); g.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;';
    const bars = document.createElement('div'); bars.style.cssText = 'display:flex;gap:1px;align-items:flex-end;width:100%;height:80px;';
    bars.innerHTML = `<div class="month-bar" style="height:${ha}px;background:#185FA5;"></div><div class="month-bar" style="height:${hp}px;background:#B5D4F4;"></div>`;
    g.appendChild(bars); chart.appendChild(g);
    const l = document.createElement('div'); l.style.cssText = 'flex:1;text-align:center;';
    l.innerHTML = `<div class="month-lbl">${D.month_labels[i]}</div>`; lbls.appendChild(l);
  });
}

function renderOfficeBars() {
  const D = window.D, max = D.offices[0].ytd;
  $('office-bars').innerHTML = D.offices.map(o => {
    const w = Math.round((o.ytd / max) * 100), col = o.vs_prior_pct > 5 ? '#3B6D11' : o.vs_prior_pct < -10 ? '#A32D2D' : '#185FA5';
    return `<div class="bar-row"><span class="bar-lbl" style="width:130px;flex-shrink:0;">${o.office}</span><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${col};"></div></div><span class="bar-val" style="width:90px;color:${col};">${fmt(o.ytd)} <span style="font-size:10px;">${o.vs_prior_pct >= 0 ? '+' : ''}${o.vs_prior_pct}%</span></span></div>`;
  }).join('');
}

function renderLeaderboard(reps, sortKey) {
  const sorted = reps.slice().sort((a, b) => b[sortKey] - a[sortKey]), max = sorted[0] ? sorted[0][sortKey] : 1;
  const labels = { ytd_revenue: 'YTD Revenue', mar_closed_total: 'Period Closed $', mar_close_rate: 'Close Rate', mar_asks: '# Asks', total_accounts: 'Total Accounts', active_accounts: 'Active Accounts' };
  $('lb-title').textContent = (reps.length === window.D.reps.length ? 'All reps' : 'Filtered') + ' — ' + (labels[sortKey] || sortKey);
  $('lb-bars').innerHTML = sorted.map((r, i) => {
    const val = r[sortKey], w = max > 0 ? Math.round((val / max) * 100) : 0;
    const disp = sortKey.includes('revenue') || sortKey.includes('total') || sortKey.includes('avg') ? fmt(val) : sortKey.includes('rate') ? val.toFixed(1) + '%' : val;
    const col = i === 0 ? '#185FA5' : i < 3 ? '#378ADD' : '#B5D4F4';
    const off = r.office ? ` <span style="font-size:10px;color:#888780;">${r.office}</span>` : '';
    return `<div class="bar-row"><span class="bar-lbl" style="width:140px;flex-shrink:0;font-weight:${i < 3 ? 500 : 400};">${r.rep}${off}</span><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${col};"></div></div><span class="bar-val" style="width:80px;">${disp}</span></div>`;
  }).join('');
}

function renderActBreakdown(reps) {
  const D = window.D, isAll = reps.length === D.reps.length;
  const acts = isAll ? D.activity_breakdown : { NOTES: reps.reduce((s, r) => s + r.mar_notes, 0), COMMUNICATION: reps.reduce((s, r) => s + r.mar_communications, 0), APPOINTMENT: reps.reduce((s, r) => s + r.mar_appointments, 0), CNA: reps.reduce((s, r) => s + r.mar_cna, 0) };
  const total = Object.values(acts).reduce((s, v) => s + v, 0);
  const colors = { NOTES: '#185FA5', COMMUNICATION: '#378ADD', APPOINTMENT: '#1D9E75', CNA: '#854F0B', REMINDERS: '#888780' };
  $('act-breakdown').innerHTML = Object.entries(acts).map(([k, v]) => {
    const w = total > 0 ? Math.round((v / total) * 100) : 0;
    return `<div class="bar-row"><span class="bar-lbl" style="width:120px;flex-shrink:0;">${k}</span><div class="bar-bg"><div class="bar-fill" style="width:${Math.max(w, 1)}%;background:${colors[k] || '#888780'};"></div></div><span class="bar-val" style="width:50px;">${v}</span></div>`;
  }).join('');
}

function renderStationBars() {
  const D = window.D, max = D.revenue_by_station[0].ytd;
  $('station-bars').innerHTML = D.revenue_by_station.map(s => {
    const w = Math.round((s.ytd / max) * 100);
    return `<div class="bar-row"><span class="bar-lbl" style="width:90px;flex-shrink:0;font-size:11px;">${s.station}</span><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:#185FA5;"></div></div><span class="bar-val" style="width:70px;">${fmt(s.ytd)}</span></div>`;
  }).join('');
}

function renderRevTypeBars() {
  const D = window.D, max = D.revenue_by_type[0].ytd;
  $('revtype-bars').innerHTML = D.revenue_by_type.map(t => {
    const w = Math.round((t.ytd / max) * 100);
    return `<div class="bar-row"><span class="bar-lbl" style="width:130px;flex-shrink:0;font-size:11px;">${t.type}</span><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:#7F77DD;"></div></div><span class="bar-val" style="width:70px;">${fmt(t.ytd)}</span></div>`;
  }).join('');
}

let crView = 'top';
function setCRView(v, el) { crView = v; document.querySelectorAll('.ptab').forEach(t => t.classList.remove('active')); el.classList.add('active'); renderCRBars(); }
function renderCRBars() {
  const reps = getFilteredReps().filter(r => r.mar_asks >= 3).sort((a, b) => b.mar_close_rate - a.mar_close_rate);
  const data = crView === 'top' ? reps.slice(0, 10) : reps, max = data[0] ? data[0].mar_close_rate : 100;
  $('cr-bars').innerHTML = data.map(r => {
    const w = Math.round((r.mar_close_rate / max) * 100), col = r.mar_close_rate >= 60 ? '#3B6D11' : r.mar_close_rate >= 40 ? '#185FA5' : '#888780';
    return `<div class="bar-row"><span class="bar-lbl" style="width:120px;flex-shrink:0;">${r.rep}</span><div class="bar-bg"><div class="bar-fill" style="width:${w}%;background:${col};"></div></div><span class="bar-val" style="width:70px;">${r.mar_close_rate.toFixed(1)}% <span style="font-size:10px;color:#888780;">(${r.mar_asks})</span></span></div>`;
  }).join('');
}

function renderCoaching(reps) {
  const D = window.D, items = [], isAll = reps.length === D.reps.length, T = D.team_totals;
  if (isAll) {
    const cnaReps = reps.filter(r => r.mar_cna > 0).length;
    items.push({ t: 'alert', m: `CNA adoption: only ${cnaReps} of ${reps.length} reps logged a CNA`, s: 'Critical gap', r: `CNAs are the discovery step before every ask. With only ${cnaReps} reps logging CNAs, there is no visibility into client needs conversations across most of the team.` });
    const national = D.offices.find(o => o.office === 'NATIONAL');
    if (national && national.vs_prior_pct < -10) items.push({ t: 'alert', m: `National revenue ${national.vs_prior_pct}% vs same period last year`, s: `-${fmt(Math.abs(national.ytd - national.prior_ytd))}`, r: `National is down significantly vs the same period last year. As the second-largest revenue stream, understanding the drivers should be a priority.` });
    const stars = reps.filter(r => r.mar_close_rate >= 60 && r.mar_asks >= 10);
    if (stars.length) items.push({ t: 'good', m: `High performers: ${stars.map(r => r.rep + ' (' + r.mar_close_rate.toFixed(0) + '%)').join(', ')}`, s: 'Best practice', r: `These reps are closing at 60%+ on meaningful ask volumes. Their qualification and proposal process could be a replicable playbook for the team.` });
    const nevPct = Math.round(T.total_never_pitched / T.total_assigned * 100);
    items.push({ t: 'info', m: `${T.total_never_pitched.toLocaleString()} accounts (${nevPct}% of all assigned) have never been pitched`, s: 'Untapped opportunity', r: `Over ${T.total_never_pitched.toLocaleString()} assigned accounts have no record of ever being pitched. Even converting 5% to active prospects would add significant pipeline.` });
  } else {
    const r = reps[0]; if (!r) return;
    const teamCR = T.mar_close_rate, crDiff = (r.mar_close_rate - teamCR).toFixed(1);
    const crType = r.mar_close_rate >= teamCR + 10 ? 'good' : r.mar_close_rate < teamCR - 10 ? 'alert' : 'warn';
    items.push({ t: crType, m: `Close rate: ${r.mar_close_rate.toFixed(1)}% vs team avg ${teamCR}%`, s: (crDiff > 0 ? '+' : '') + crDiff + 'pts', r: `${r.rep} closed ${r.mar_closed_count} of ${r.mar_asks} asks. ${r.mar_close_rate >= teamCR ? 'Above team average — strong conversion.' : 'Below team average. Consider tighter qualification before submitting proposals.'}` });
    if (r.mar_cna === 0 && r.mar_asks > 5) items.push({ t: 'alert', m: 'No CNAs logged this period', s: 'Missing activity', r: `${r.rep} created ${r.mar_asks} asks with no CNAs logged. Without documented discovery it is difficult to know whether proposals are matching actual client needs.` });
    const nevPct = r.total_accounts > 0 ? Math.round(r.never_pitched / r.total_accounts * 100) : 0;
    if (nevPct > 40) items.push({ t: 'warn', m: `${r.never_pitched} accounts (${nevPct}% of book) never pitched`, s: 'Untapped pipeline', r: `A significant portion of ${r.rep}'s assigned accounts have never received a pitch. These are the fastest available pipeline opportunities.` });
  }
  $('coach-items').innerHTML = items.map(i => `<div class="ci ${i.t}"><div class="ci-top"><span class="ci-metric">${i.m}</span><span class="ci-stat" style="color:${i.t === 'alert' ? '#A32D2D' : i.t === 'warn' ? '#854F0B' : i.t === 'good' ? '#3B6D11' : '#185FA5'}">${i.s}</span></div><div class="ci-rec">${i.r}</div></div>`).join('');
  $('coach-badge').textContent = items.length + ' insights';
}

function sortIcon(i, sc, sd) { const a = i === sc && sd === 1 ? 'sa' : '', d = i === sc && sd === -1 ? 'sd' : ''; return `<span class="si ${a || d}"><span class="a"></span><span class="d"></span></span>`; }

const drawerDefs = {
  'd-ytd': { title: 'YTD revenue by rep', cols: ['Rep', 'Office', 'YTD Revenue', 'Period Closed', 'Close Rate'], widths: ['28%', '18%', '18%', '16%', '16%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', fmtF(r.ytd_revenue), fmtF(r.mar_closed_total), pct(r.mar_close_rate)]), sortCol: 2, sortDir: -1 },
  'd-vsly': { title: 'Revenue vs prior year by office', cols: ['Office', 'YTD FY2026', 'Prior YTD', 'Variance $', 'Variance %'], widths: ['22%', '18%', '18%', '18%', '14%'], rows: () => window.D.offices.map(o => [o.office, fmtF(o.ytd), fmtF(o.prior_ytd), (o.ytd - o.prior_ytd >= 0 ? '+' : '') + fmtF(o.ytd - o.prior_ytd), (o.vs_prior_pct >= 0 ? '+' : '') + o.vs_prior_pct + '%']), sortCol: 1, sortDir: -1 },
  'd-topoffice': { title: 'All offices — YTD revenue', cols: ['Office', 'YTD Revenue', 'vs Prior Year', 'Prior YTD'], widths: ['28%', '20%', '20%', '20%'], rows: () => window.D.offices.map(o => [o.office, fmtF(o.ytd), (o.vs_prior_pct >= 0 ? '+' : '') + o.vs_prior_pct + '%', fmtF(o.prior_ytd)]), sortCol: 1, sortDir: -1 },
  'd-assigned': { title: 'Assigned accounts by rep', cols: ['Rep', 'Office', 'Total', 'Active', 'Inactive', 'Never Pitched', 'Zero Activity'], widths: ['22%', '14%', '10%', '10%', '10%', '14%', '14%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', r.total_accounts, r.active_accounts, r.inactive_accounts, r.never_pitched, r.zero_activity]), sortCol: 2, sortDir: -1 },
  'd-active': { title: 'Active accounts by rep', cols: ['Rep', 'Office', 'Active', '% of Total'], widths: ['30%', '22%', '22%', '18%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', r.active_accounts, r.total_accounts > 0 ? Math.round(r.active_accounts / r.total_accounts * 100) + '%' : '—']), sortCol: 2, sortDir: -1 },
  'd-inactive': { title: 'Inactive accounts by rep', cols: ['Rep', 'Office', 'Inactive', '% of Total', 'Never Pitched'], widths: ['26%', '18%', '14%', '14%', '16%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', r.inactive_accounts, r.total_accounts > 0 ? Math.round(r.inactive_accounts / r.total_accounts * 100) + '%' : '—', r.never_pitched]), sortCol: 2, sortDir: -1 },
  'd-neverpitched': { title: 'Never pitched — by rep', cols: ['Rep', 'Office', 'Never Pitched', '% of Book'], widths: ['30%', '22%', '20%', '18%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', r.never_pitched, r.total_accounts > 0 ? Math.round(r.never_pitched / r.total_accounts * 100) + '%' : '—']), sortCol: 2, sortDir: -1 },
  'd-zeroact': { title: 'Zero activity — by rep', cols: ['Rep', 'Office', 'Zero Activity', '% of Book'], widths: ['30%', '22%', '20%', '18%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', r.zero_activity, r.total_accounts > 0 ? Math.round(r.zero_activity / r.total_accounts * 100) + '%' : '—']), sortCol: 2, sortDir: -1 },
  'd-asks': { title: 'Asks by rep', cols: ['Rep', 'Office', '# Asks', 'Total Asked', 'Avg Ask'], widths: ['28%', '18%', '12%', '18%', '16%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', r.mar_asks, fmtF(r.mar_asked_total), fmtF(r.mar_avg_ask)]), sortCol: 2, sortDir: -1 },
  'd-closed': { title: 'Closed revenue by rep', cols: ['Rep', 'Office', 'Closed $', '# Closed', 'Close Rate'], widths: ['28%', '18%', '18%', '14%', '14%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', fmtF(r.mar_closed_total), r.mar_closed_count, pct(r.mar_close_rate)]), sortCol: 2, sortDir: -1 },
  'd-cr': { title: 'Close rate by rep (min 3 asks)', cols: ['Rep', 'Office', 'Close Rate', 'Closed', 'Of Asks'], widths: ['28%', '18%', '16%', '14%', '12%'], rows: () => getFilteredReps().filter(r => r.mar_asks >= 3).map(r => [r.rep, r.office || '—', pct(r.mar_close_rate), r.mar_closed_count, r.mar_asks]), sortCol: 2, sortDir: -1 },
  'd-avgask': { title: 'Avg ask size by rep', cols: ['Rep', 'Office', 'Avg Ask', 'Total Asked', '# Asks'], widths: ['28%', '18%', '16%', '18%', '12%'], rows: () => getFilteredReps().filter(r => r.mar_asks > 0).map(r => [r.rep, r.office || '—', fmtF(r.mar_avg_ask), fmtF(r.mar_asked_total), r.mar_asks]), sortCol: 2, sortDir: -1 },
  'd-activities': { title: 'Activities by rep', cols: ['Rep', 'Office', 'Total', 'Notes', 'Communications', 'Appointments'], widths: ['24%', '16%', '10%', '10%', '18%', '14%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', r.mar_activities, r.mar_notes, r.mar_communications, r.mar_appointments]), sortCol: 2, sortDir: -1 },
  'd-cna': { title: 'CNAs logged', cols: ['Rep', 'Office', 'CNAs', '# Asks', 'Note'], widths: ['26%', '18%', '12%', '12%', '28%'], rows: () => getFilteredReps().map(r => [r.rep, r.office || '—', r.mar_cna, r.mar_asks, r.mar_cna === 0 && r.mar_asks > 0 ? 'No CNA despite ' + r.mar_asks + ' asks' : r.mar_cna > 0 ? 'CNA logged ✓' : 'No asks']), sortCol: 2, sortDir: -1 },
};

function openDrawer(gid, did, kid) {
  if (!gridState[gid]) gridState[gid] = { drawer: null, kpi: null };
  const g = gridState[gid], isOpen = g.drawer === did;
  if (g.drawer) { $(g.drawer).classList.remove('open'); $(g.drawer).innerHTML = ''; $(g.kpi).classList.remove('open'); const a = $(g.kpi.replace('kpi-', 'arr-')); if (a) a.classList.remove('up'); }
  if (isOpen) { g.drawer = null; g.kpi = null; return; }
  g.drawer = did; g.kpi = kid; $(kid).classList.add('open'); const na = $(kid.replace('kpi-', 'arr-')); if (na) na.classList.add('up');
  renderDrawer(did); $(did).classList.add('open');
}

function renderDrawer(did, filter) {
  const cfg = drawerDefs[did]; if (!cfg) return;
  if (!cfg._sc) { cfg._sc = cfg.sortCol; cfg._sd = cfg.sortDir; }
  const f = (filter || '').toLowerCase();
  let rows = cfg.rows().filter(r => !f || String(r[0]).toLowerCase().includes(f));
  rows = rows.slice().sort((a, b) => { const va = strip(a[cfg._sc]), vb = strip(b[cfg._sc]); const na = parseFloat(va.replace(/[$,%+K]/g, '')), nb = parseFloat(vb.replace(/[$,%+K]/g, '')); if (!isNaN(na) && !isNaN(nb)) return (na - nb) * cfg._sd; return String(va).localeCompare(String(vb)) * cfg._sd; });
  const ths = cfg.cols.map((c, i) => { const sc = i === cfg._sc ? 'sorted' : '', w = cfg.widths ? `width:${cfg.widths[i]};` : ''; return `<th class="${sc}" style="${w}" onclick="sortDCol('${did}',${i})">${c}${sortIcon(i, cfg._sc, cfg._sd)}</th>`; }).join('');
  const trs = rows.map(r => `<tr>${r.map((cell, i) => `<td${i === 0 ? ' class="rep-cell"' : ''}>${cell === null || cell === undefined ? '—' : cell}</td>`).join('')}</tr>`).join('');
  $(did).innerHTML = `<div class="drawer-hdr"><span class="drawer-title">${cfg.title}</span><span class="drawer-cnt">${rows.length} rows</span></div><div class="drawer-search"><input type="text" placeholder="Search..." oninput="onSearch('${did}',this.value)"></div><div style="overflow-x:auto;"><table class="tbl"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div><div class="drawer-foot"><span>${rows.length} rows</span><span>Click headers to sort</span></div>`;
}

function onSearch(did, val) { clearTimeout(stmrs[did]); stmrs[did] = setTimeout(() => renderDrawer(did, val), 150); }
function sortDCol(did, i) { const cfg = drawerDefs[did]; cfg._sd = cfg._sc === i ? cfg._sd * -1 : -1; cfg._sc = i; const el = document.querySelector(`#${did} input`); renderDrawer(did, el ? el.value : ''); }
function strip(s) { return String(s === null || s === undefined ? '' : s).replace(/<[^>]*>/g, '').trim(); }
function closeAllDrawers() { Object.values(gridState).forEach(g => { if (g.drawer) { $(g.drawer).classList.remove('open'); $(g.drawer).innerHTML = ''; $(g.kpi).classList.remove('open'); const a = $(g.kpi.replace('kpi-', 'arr-')); if (a) a.classList.remove('up'); } g.drawer = null; g.kpi = null; }); Object.values(drawerDefs).forEach(d => { d._sc = d.sortCol; d._sd = d.sortDir; }); }
