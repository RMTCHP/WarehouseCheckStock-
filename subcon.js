const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwOwh_Br1B_jHv-q3H4x2zWQ7j4-zb_5ITO6bBvEGeeZ5CdTTxqQca6zDrAc9x9bGM/exec';
    const SESSION_KEY = 'subcon_auth';
    let currentUser = null;
    let editAllowed = true;
    let currentDeadlineDate = '';
    let deadlineTimer = null;
    let yearTrendChart = null;
    let trendYear = new Date().getFullYear();
    let dashboardMonthlyMetricsState = [];
    let dashboardTrendCache = {};
    let isDirty = false;
    let isLoadingReport = false;
    let lastLoadedMonth = '';
    let lastUpdatedText = '-';
    let trendSwalChart = null;

    function swalTheme(base = {}) { return Object.assign({ showCloseButton: true, confirmButtonColor: '#4C6272', background: '#ffffff', color: '#102027' }, base); }
    async function api(action, payload = {}) {
      const res = await fetch(SCRIPT_URL + '?action=' + encodeURIComponent(action), {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload)
      });
      return res.json();
    }

    function safeNum(v) {
      const n = Number(String(v ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    }

    function formatNumOrDash(n) {
      if (!Number.isFinite(n) || n === 0) return '-';
      return n.toLocaleString('en-US');
    }

    function monthLabel(yyyyMM) {
      if (!yyyyMM || !/^\d{4}-\d{2}$/.test(yyyyMM)) return '';
      const [y, m] = yyyyMM.split('-').map(Number);
      const dt = new Date(y, m - 1, 1);
      return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }

    function formatDeadlineDateDisplay(v) {
      const s = String(v || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function renderDashboardSubmissionStatus() {
      const card = document.querySelector('.status-card');
      const chip = document.getElementById('submissionStatusChip');
      const dateEl = document.getElementById('submissionStatusDate');
      if (!card || !chip || !dateEl) return;
      const hasDate = !!String(currentDeadlineDate || '').trim();
      const dateText = hasDate ? formatDeadlineDateDisplay(currentDeadlineDate) : 'not set';
      if (editAllowed) {
        card.className = 'status-card open';
        chip.className = 'status-chip open';
        chip.textContent = 'Open';
      } else {
        card.className = 'status-card locked';
        chip.className = 'status-chip locked';
        chip.textContent = 'Locked';
      }
      dateEl.textContent = `Final submission date: ${dateText}`;
    }

    function updateMonthlyTitle() {
      const month = document.getElementById('monthInput').value;
      const label = monthLabel(month);
      const subcon = (currentUser?.subcon || currentUser?.username || '').toUpperCase();
      document.getElementById('monthlyTitle').textContent = `Monthly Inventory report  ${label} (${subcon})`;
      const dashTitle = document.getElementById('dashboardTitle');
      if (dashTitle) dashTitle.textContent = `${subcon} Dashboard`;
    }

    function markDirty() {
      if (isLoadingReport) return;
      isDirty = true;
    }

    function clearDirty() {
      isDirty = false;
    }

    async function guardUnsavedChanges() {
      if (!isDirty) return true;
      const cf = await Swal.fire(swalTheme({
        icon: 'warning',
        title: 'Unsaved changes',
        text: 'You have unsaved changes. Discard changes and continue?',
        showCancelButton: true,
        confirmButtonText: 'Discard',
        cancelButtonText: 'Stay'
      }));
      return !!cf.isConfirmed;
    }

    function renderDashboardKpiFromRows(rows = []) {
      const mm = document.getElementById('monthInput')?.value || '';
      const monthText = monthLabel(mm);
      const monthEl = document.getElementById('kpiMonthLabel');
      if (monthEl) monthEl.textContent = monthText || '-';
      const validRows = (rows || []).filter((r) =>
        String(r.fileNo || '').trim() ||
        String(r.boh || '').trim() ||
        String(r.supply || '').trim() ||
        String(r.delivery || '').trim() ||
        String(r.ng || '').trim() ||
        String(r.eoh || '').trim() ||
        String(r.confirmOk || '').trim() ||
        String(r.confirmHold || '').trim() ||
        String(r.remark || '').trim()
      );
      const rowsCount = validRows.length;
      const totalQty = validRows.reduce((sum, r) => sum + safeNum(r.total), 0);
      const diffQty = validRows.reduce((sum, r) => sum + Math.abs(safeNum(r.diff)), 0);
      document.getElementById('kpiRows').textContent = String(rowsCount);
      document.getElementById('kpiTotalQty').textContent = formatNumOrDash(totalQty);
      document.getElementById('kpiDiffQty').textContent = formatNumOrDash(diffQty);
      document.getElementById('kpiLastUpdated').textContent = lastUpdatedText || '-';
    }

    function buildYearMonths(year) {
      const out = [];
      for (let m = 1; m <= 12; m++) out.push(`${year}-${String(m).padStart(2, '0')}`);
      return out;
    }
    function getPreviousMonthKey(baseMonth) {
      const source = String(baseMonth || '').trim();
      let dt;
      if (/^\d{4}-\d{2}$/.test(source)) {
        const [y, m] = source.split('-').map(Number);
        dt = new Date(y, m - 2, 1);
      } else {
        const now = new Date();
        dt = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      }
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    }
    function getSelectedMonthYear() {
      return Number((document.getElementById('monthInput')?.value || '').split('-')[0] || new Date().getFullYear());
    }
    function setTrendYear(year) {
      const y = Number(year || 0);
      if (!y || y < 2000 || y > 2100) return;
      trendYear = y;
      const yearBox = document.getElementById('dashboardYearBox');
      if (yearBox) yearBox.textContent = String(y);
    }
    function shiftDashboardYear(delta) {
      setTrendYear((trendYear || new Date().getFullYear()) + Number(delta || 0));
      loadTrendCard(true);
    }
    function buildMonthlyMetricsFromRows(month, rows = []) {
      const list = Array.isArray(rows) ? rows : [];
      const validRows = list.filter((r) =>
        String(r.fileNo || '').trim() ||
        String(r.boh || '').trim() ||
        String(r.supply || '').trim() ||
        String(r.delivery || '').trim() ||
        String(r.ng || '').trim() ||
        String(r.eoh || '').trim() ||
        String(r.confirmOk || '').trim() ||
        String(r.confirmHold || '').trim() ||
        String(r.remark || '').trim()
      );
      const totalItem = validRows.length;
      const okItem = validRows.filter((r) => safeNum(r.diff) === 0).length;
      const diffItem = totalItem - okItem;
      const total = validRows.reduce((sum, r) => sum + safeNum(r.total), 0);
      return {
        month,
        total,
        totalItem,
        okItem,
        diffItem,
        accuracy: totalItem > 0 ? (okItem / totalItem) : 0
      };
    }
    async function fetchDashboardTrendData(year, force = false) {
      const cacheKey = String(year || '');
      if (!force && dashboardTrendCache[cacheKey]) return dashboardTrendCache[cacheKey];
      let totals = Array(12).fill(0);
      let months = [];
      const res = await api('getSubconYearTrend', { year, username: currentUser.username });
      if (res && res.ok && Array.isArray(res.totals)) totals = res.totals;
      if (res && res.ok && Array.isArray(res.months)) months = res.months;
      const result = { totals, months };
      dashboardTrendCache[cacheKey] = result;
      return result;
    }
    function buildMonthlyMetricsRowsHtml(months = []) {
      const list = Array.isArray(months) ? months : [];
      if (!list.length) return '<tr><td colspan="5">No data</td></tr>';
      return list.map((m) => {
        const totalItem = Number(m.totalItem || 0);
        const okItem = Number(m.okItem || 0);
        const diffItem = Number(m.diffItem || 0);
        const monthText = monthLabel(m.month);
        const accuracyText = `${((Number(m.accuracy || 0)) * 100).toFixed(2)}%`;
        const accuracyClass = Number(m.accuracy || 0) > 0.5 ? 'high' : 'low';
        return `
          <tr>
            <td class="month-label">${monthText || m.month || '-'}</td>
            <td>${totalItem ? totalItem.toLocaleString('en-US') : '-'}</td>
            <td>${okItem ? okItem.toLocaleString('en-US') : '-'}</td>
            <td>${diffItem ? diffItem.toLocaleString('en-US') : '-'}</td>
            <td class="accuracy-cell ${totalItem ? accuracyClass : ''}">${totalItem ? accuracyText : '-'}</td>
          </tr>
        `;
      }).join('');
    }
    function renderMonthlyMetrics(year, months = []) {
      const body = document.getElementById('monthlyMetricsBody');
      if (!body) return;
      const list = Array.isArray(months) ? months : [];
      dashboardMonthlyMetricsState = list.slice();
      const currentMonth = document.getElementById('monthInput')?.value || '';
      const previousMonthKey = getPreviousMonthKey(currentMonth);
      const previousMonthRow = list.find((m) => String(m.month || '').trim() === previousMonthKey);
      const displayRows = previousMonthRow ? [previousMonthRow] : [];
      body.innerHTML = buildMonthlyMetricsRowsHtml(displayRows);
      const yearLabel = document.getElementById('monthlyMetricsYearLabel');
      if (yearLabel) {
        yearLabel.textContent = previousMonthRow
          ? `Last month: ${monthLabel(previousMonthRow.month)}`
          : `Last month: ${monthLabel(previousMonthKey) || previousMonthKey}`;
      }
    }
    function openMonthlyMetricsSwal() {
      const selectedMonth = document.getElementById('monthInput')?.value || `${getSelectedMonthYear()}-01`;
      const selectedYear = Number(String(selectedMonth).split('-')[0] || getSelectedMonthYear());
      const rowsHtml = buildMonthlyMetricsRowsHtml(dashboardMonthlyMetricsState);
      Swal.fire(swalTheme({
        width: 920,
        showConfirmButton: false,
        html: `
          <div style="text-align:left;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin:0 0 12px 2px;">
              <div style="font-size:26px; font-weight:800; color:#0f172a; line-height:1.1;">Accuracy Summary</div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" id="metricsSwalPrevYearBtn" style="width:34px; height:34px; border:1px solid #dbe3ee; background:#fff; color:#334155; border-radius:9px; font-size:12px; font-weight:800; display:inline-flex; align-items:center; justify-content:center;">
                  <i class="fa-solid fa-chevron-left"></i>
                </button>
                <div id="metricsSwalYearLabel" style="min-width:92px; text-align:center; border:1px solid #dbe3ee; background:#fff; color:#334155; border-radius:10px; padding:8px 12px; font-size:12px; font-weight:800;">
                  Year ${selectedYear || '-'}
                </div>
                <button type="button" id="metricsSwalNextYearBtn" style="width:34px; height:34px; border:1px solid #dbe3ee; background:#fff; color:#334155; border-radius:9px; font-size:12px; font-weight:800; display:inline-flex; align-items:center; justify-content:center;">
                  <i class="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>
            <div style="position:relative; overflow:auto; border:1px solid #e5e7eb; border-radius:12px; min-height:430px;">
              <div id="metricsSwalLoadingOverlay" style="display:none; position:absolute; inset:0; z-index:5; background:rgba(255,255,255,.82); backdrop-filter:blur(1px); align-items:center; justify-content:center;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:12px; padding:20px 24px; border-radius:16px; background:#ffffff; border:1px solid #dbe3ee; box-shadow:0 18px 32px rgba(15,23,42,.12);">
                  <div style="width:40px; height:40px; border:4px solid #dbe3ee; border-top-color:#2563eb; border-radius:999px; animation:spin 0.8s linear infinite;"></div>
                  <div style="font-size:16px; font-weight:800; color:#0f172a; letter-spacing:.01em;">Loading accuracy data...</div>
                  <div style="font-size:12px; font-weight:700; color:#64748b;">Please wait while the selected year is loading.</div>
                </div>
              </div>
              <table class="monthly-metrics-table" style="margin:0;">
                <thead>
                  <tr>
                    <th style="width:20%;">Month</th>
                    <th>Total Item</th>
                    <th>OK Item</th>
                    <th>Diff Item</th>
                    <th>%Accuracy</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
            </div>
          </div>
        `,
        didOpen: () => {
          const yearLabel = document.getElementById('metricsSwalYearLabel');
          const prevBtn = document.getElementById('metricsSwalPrevYearBtn');
          const nextBtn = document.getElementById('metricsSwalNextYearBtn');
          const body = Swal.getHtmlContainer()?.querySelector('tbody');
          const overlay = document.getElementById('metricsSwalLoadingOverlay');
          if (!yearLabel || !prevBtn || !nextBtn || !body || !overlay) return;
          let modalYear = Number(selectedYear || getSelectedMonthYear());
          const setLoading = (loading) => {
            overlay.style.display = loading ? 'flex' : 'none';
            prevBtn.disabled = !!loading;
            nextBtn.disabled = !!loading;
          };
          const updateYear = async (delta) => {
            const pickedYear = Number(modalYear) + Number(delta || 0);
            if (!pickedYear) return;
            modalYear = pickedYear;
            yearLabel.textContent = `Year ${pickedYear}`;
            setLoading(true);
            try {
              const data = await fetchDashboardTrendData(pickedYear);
              body.innerHTML = buildMonthlyMetricsRowsHtml(data.months);
            } catch (_) {
              body.innerHTML = '<tr><td colspan="5">No data</td></tr>';
            } finally {
              setLoading(false);
            }
          };
          prevBtn.addEventListener('click', () => updateYear(-1));
          nextBtn.addEventListener('click', () => updateYear(1));
        }
      }));
    }

    function renderYearTrendChart(year, monthlyTotals) {
      const ctx = document.getElementById('yearTrendChart');
      if (!ctx) return;
      setTrendYear(year);
      const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      if (yearTrendChart) yearTrendChart.destroy();
      yearTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Total',
            data: monthlyTotals,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, .14)',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 4,
            fill: true,
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Total: ${Number(ctx.raw || 0).toLocaleString('en-US')}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => Number(v).toLocaleString('en-US')
              }
            }
          }
        }
      });
    }

    function renderTrendSwalChart(year, monthlyTotals) {
      const canvas = document.getElementById('trendSwalChart');
      if (!canvas) return;
      const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      if (trendSwalChart) trendSwalChart.destroy();
      trendSwalChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Total',
            data: monthlyTotals,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, .12)',
            borderWidth: 3,
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `Total: ${Number(ctx.raw || 0).toLocaleString('en-US')}`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => Number(v).toLocaleString('en-US')
              }
            }
          }
        }
      });
    }

    function openTrendSwal() {
      const selectedYear = Number(trendYear || new Date().getFullYear());
      Swal.fire(swalTheme({
        width: 980,
        showConfirmButton: false,
        html: `
          <div style="text-align:left;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin:0 0 12px 2px;">
              <div style="font-size:26px; font-weight:800; color:#0f172a; line-height:1.1;">Total Trend</div>
              <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" id="trendSwalPrevYearBtn" style="width:34px; height:34px; border:1px solid #dbe3ee; background:#fff; color:#334155; border-radius:9px; font-size:12px; font-weight:800; display:inline-flex; align-items:center; justify-content:center;">
                  <i class="fa-solid fa-chevron-left"></i>
                </button>
                <div id="trendSwalYearLabel" style="min-width:92px; text-align:center; border:1px solid #dbe3ee; background:#fff; color:#334155; border-radius:10px; padding:8px 12px; font-size:12px; font-weight:800;">
                  Year ${selectedYear}
                </div>
                <button type="button" id="trendSwalNextYearBtn" style="width:34px; height:34px; border:1px solid #dbe3ee; background:#fff; color:#334155; border-radius:9px; font-size:12px; font-weight:800; display:inline-flex; align-items:center; justify-content:center;">
                  <i class="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>
            <div style="position:relative; overflow:hidden; border:1px solid #e5e7eb; border-radius:12px; background:#fff; min-height:470px; padding:18px;">
              <div id="trendSwalLoadingOverlay" style="display:none; position:absolute; inset:0; z-index:5; background:rgba(255,255,255,.82); backdrop-filter:blur(1px); align-items:center; justify-content:center;">
                <div style="display:flex; flex-direction:column; align-items:center; gap:12px; padding:20px 24px; border-radius:16px; background:#ffffff; border:1px solid #dbe3ee; box-shadow:0 18px 32px rgba(15,23,42,.12);">
                  <div style="width:40px; height:40px; border:4px solid #dbe3ee; border-top-color:#2563eb; border-radius:999px; animation:spin 0.8s linear infinite;"></div>
                  <div style="font-size:16px; font-weight:800; color:#0f172a; letter-spacing:.01em;">Loading trend data...</div>
                  <div style="font-size:12px; font-weight:700; color:#64748b;">Please wait while the selected year is loading.</div>
                </div>
              </div>
              <div style="height:430px;">
                <canvas id="trendSwalChart"></canvas>
              </div>
            </div>
          </div>
        `,
        didOpen: async () => {
          const yearLabel = document.getElementById('trendSwalYearLabel');
          const prevBtn = document.getElementById('trendSwalPrevYearBtn');
          const nextBtn = document.getElementById('trendSwalNextYearBtn');
          const overlay = document.getElementById('trendSwalLoadingOverlay');
          if (!yearLabel || !prevBtn || !nextBtn || !overlay) return;
          let modalYear = selectedYear;
          const setLoading = (loading) => {
            overlay.style.display = loading ? 'flex' : 'none';
            prevBtn.disabled = !!loading;
            nextBtn.disabled = !!loading;
          };
          const drawYear = async (year, force = false) => {
            yearLabel.textContent = `Year ${year}`;
            setLoading(true);
            try {
              const data = await fetchDashboardTrendData(year, force);
              renderTrendSwalChart(year, data.totals);
            } catch (_) {
              renderTrendSwalChart(year, Array(12).fill(0));
            } finally {
              setLoading(false);
            }
          };
          await drawYear(modalYear, false);
          prevBtn.addEventListener('click', async () => {
            modalYear -= 1;
            await drawYear(modalYear, false);
          });
          nextBtn.addEventListener('click', async () => {
            modalYear += 1;
            await drawYear(modalYear, false);
          });
        },
        willClose: () => {
          if (trendSwalChart) {
            trendSwalChart.destroy();
            trendSwalChart = null;
          }
        }
      }));
    }

    async function loadTrendCard(showLoading = false, force = false) {
      const year = Number(trendYear || 0);
      if (!year) return;
      if (showLoading) {
        Swal.fire(swalTheme({ title: 'Loading trend data...', showCloseButton: false, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() }));
      }
      try {
        const data = await fetchDashboardTrendData(year, force);
        renderYearTrendChart(year, data.totals);
      } catch (_) {
        renderYearTrendChart(year, Array(12).fill(0));
      } finally {
        if (showLoading) Swal.close();
      }
    }
    async function loadAccuracySummary(force = false) {
      const year = getSelectedMonthYear();
      const data = await fetchDashboardTrendData(year, force);
      renderMonthlyMetrics(year, data.months);
    }
    async function loadDashboardPanels(showLoading = false, force = false) {
      const accuracyYear = getSelectedMonthYear();
      const currentTrendYear = Number(trendYear || accuracyYear || new Date().getFullYear());
      const month = document.getElementById('monthInput')?.value || '';
      if (showLoading) {
        Swal.fire(swalTheme({ title: 'Loading trend data...', showCloseButton: false, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() }));
      }
      try {
        const monthSnapshotPromise = month
          ? api('getSubconMonthData', { month, username: currentUser.username })
          : Promise.resolve(null);
        if (currentTrendYear === accuracyYear) {
          const [data, monthSnapshot] = await Promise.all([
            fetchDashboardTrendData(currentTrendYear, force),
            monthSnapshotPromise
          ]);
          if (monthSnapshot && monthSnapshot.ok) {
            setEditMode(!!monthSnapshot.allowed, monthSnapshot.deadlineDate || '');
            const dataRows = Array.isArray(monthSnapshot.rows) ? monthSnapshot.rows : [];
            renderRows(dataRows);
            lastLoadedMonth = month;
            const hasSavedRows = dataRows.some((r) =>
              String(r.fileNo || '').trim() ||
              String(r.boh || '').trim() ||
              String(r.supply || '').trim() ||
              String(r.delivery || '').trim() ||
              String(r.ng || '').trim() ||
              String(r.eoh || '').trim() ||
              String(r.confirmOk || '').trim() ||
              String(r.confirmHold || '').trim() ||
              String(r.remark || '').trim()
            );
            lastUpdatedText = hasSavedRows ? new Date().toLocaleString('en-GB') : '-';
            renderDashboardKpiFromRows(dataRows);
          }
          renderYearTrendChart(currentTrendYear, data.totals);
          renderMonthlyMetrics(accuracyYear, data.months);
        } else {
          const [trendData, accuracyData, monthSnapshot] = await Promise.all([
            fetchDashboardTrendData(currentTrendYear, force),
            fetchDashboardTrendData(accuracyYear, force),
            monthSnapshotPromise
          ]);
          if (monthSnapshot && monthSnapshot.ok) {
            setEditMode(!!monthSnapshot.allowed, monthSnapshot.deadlineDate || '');
            const dataRows = Array.isArray(monthSnapshot.rows) ? monthSnapshot.rows : [];
            renderRows(dataRows);
            lastLoadedMonth = month;
            const hasSavedRows = dataRows.some((r) =>
              String(r.fileNo || '').trim() ||
              String(r.boh || '').trim() ||
              String(r.supply || '').trim() ||
              String(r.delivery || '').trim() ||
              String(r.ng || '').trim() ||
              String(r.eoh || '').trim() ||
              String(r.confirmOk || '').trim() ||
              String(r.confirmHold || '').trim() ||
              String(r.remark || '').trim()
            );
            lastUpdatedText = hasSavedRows ? new Date().toLocaleString('en-GB') : '-';
            renderDashboardKpiFromRows(dataRows);
          }
          renderYearTrendChart(currentTrendYear, trendData.totals);
          renderMonthlyMetrics(accuracyYear, accuracyData.months);
        }
      } catch (_) {
        renderYearTrendChart(currentTrendYear, Array(12).fill(0));
        renderMonthlyMetrics(accuracyYear, []);
      } finally {
        if (showLoading) Swal.close();
      }
    }

    function normalizeFileNo(value) {
      const raw = String(value || '').trim();
      if (!raw) return raw;
      if (/^\d+$/.test(raw)) return `F${raw.padStart(4, '0')}`;
      const m = raw.match(/^(\d+)([A-Za-z]+)$/);
      if (m) return `F${m[1].padStart(4, '0')}${m[2].toUpperCase()}`;
      return raw;
    }

    function normalizeFileNoInput(input) {
      if (!input) return;
      input.value = normalizeFileNo(input.value);
    }

    function sanitizeNumericInput(input) {
      if (!input) return;
      input.value = String(input.value || '').replace(/[^\d]/g, '');
    }

    function recalcRow(tr) {
      const boh = safeNum(tr.querySelector('[name="boh"]').value);
      const supply = safeNum(tr.querySelector('[name="supply"]').value);
      const delivery = safeNum(tr.querySelector('[name="delivery"]').value);
      const ng = safeNum(tr.querySelector('[name="ng"]').value);
      const ok = safeNum(tr.querySelector('[name="confirmOk"]').value);
      const hold = safeNum(tr.querySelector('[name="confirmHold"]').value);
      const eoh = (boh + supply) - delivery - ng;
      const total = ok + hold;
      const diff = Math.abs(eoh - total);
      const signedDiff = total - eoh;
      const diffInput = tr.querySelector('[name="diff"]');
      tr.querySelector('[name="eoh"]').value = eoh || '';
      tr.querySelector('[name="total"]').value = total || '';
      diffInput.value = diff || '';
      diffInput.classList.remove('diff-positive', 'diff-negative');
      if (signedDiff < 0) {
        diffInput.classList.add('diff-negative');
      } else {
        diffInput.classList.add('diff-positive');
      }
      recalcTotals();
    }

    function rowTemplate(r = {}, index = 1) {
      return `
      <tr>
        <td class="text-center">${index}</td>
        <td><input name="fileNo" value="${r.fileNo ?? ''}" onblur="normalizeFileNoInput(this)" /></td>
        <td class="num"><input name="boh" inputmode="numeric" value="${r.boh ?? ''}" oninput="sanitizeNumericInput(this); recalcRow(this.closest('tr'))" /></td>
        <td class="num"><input name="supply" inputmode="numeric" value="${r.supply ?? ''}" oninput="sanitizeNumericInput(this); recalcRow(this.closest('tr'))" /></td>
        <td class="num"><input name="delivery" inputmode="numeric" value="${r.delivery ?? ''}" oninput="sanitizeNumericInput(this); recalcRow(this.closest('tr'))" /></td>
        <td class="num"><input name="ng" inputmode="numeric" value="${r.ng ?? ''}" oninput="sanitizeNumericInput(this); recalcRow(this.closest('tr'))" /></td>
        <td class="num"><input name="eoh" value="${r.eoh ?? ''}" disabled /></td>
        <td class="num"><input name="confirmOk" inputmode="numeric" value="${r.confirmOk ?? ''}" oninput="sanitizeNumericInput(this); recalcRow(this.closest('tr'))" /></td>
        <td class="num"><input name="confirmHold" inputmode="numeric" value="${r.confirmHold ?? ''}" oninput="sanitizeNumericInput(this); recalcRow(this.closest('tr'))" /></td>
        <td class="num"><input name="total" value="${r.total ?? ''}" disabled /></td>
        <td class="num diff-col"><input class="diff-col" name="diff" value="${r.diff ?? ''}" disabled /></td>
        <td><input name="remark" value="${r.remark ?? ''}" /></td>
      </tr>`;
    }

    function renderRows(rows = []) {
      const body = document.getElementById('reportBody');
      if (!rows.length) {
        body.innerHTML = '';
        recalcTotals();
        setEditMode(editAllowed, currentDeadlineDate);
        return;
      }
      body.innerHTML = rows.map((r, i) => rowTemplate(r, i + 1)).join('');
      [...body.querySelectorAll('tr')].forEach(recalcRow);
      setEditMode(editAllowed, currentDeadlineDate);
    }

    function collectRows() {
      return [...document.querySelectorAll('#reportBody tr')].map((tr, i) => ({
        item: i + 1,
        fileNo: normalizeFileNo(tr.querySelector('[name="fileNo"]').value),
        boh: tr.querySelector('[name="boh"]').value.trim(),
        supply: tr.querySelector('[name="supply"]').value.trim(),
        delivery: tr.querySelector('[name="delivery"]').value.trim(),
        ng: tr.querySelector('[name="ng"]').value.trim(),
        eoh: tr.querySelector('[name="eoh"]').value.trim(),
        confirmOk: tr.querySelector('[name="confirmOk"]').value.trim(),
        confirmHold: tr.querySelector('[name="confirmHold"]').value.trim(),
        total: tr.querySelector('[name="total"]').value.trim(),
        diff: tr.querySelector('[name="diff"]').value.trim(),
        remark: tr.querySelector('[name="remark"]').value.trim()
      })).filter(x => x.fileNo || x.boh || x.supply || x.delivery || x.ng || x.eoh || x.confirmOk || x.confirmHold || x.remark);
    }

    function addRow() {
      const body = document.getElementById('reportBody');
      body.insertAdjacentHTML('beforeend', rowTemplate({}, body.children.length + 1));
      recalcTotals();
    }

    function recalcTotals() {
      const rows = [...document.querySelectorAll('#reportBody tr')];
      let boh = 0, supply = 0, delivery = 0, ng = 0, eoh = 0, ok = 0, hold = 0, total = 0, diff = 0;
      rows.forEach((tr) => {
        const rowBoh = safeNum(tr.querySelector('[name="boh"]')?.value);
        const rowSupply = safeNum(tr.querySelector('[name="supply"]')?.value);
        const rowDelivery = safeNum(tr.querySelector('[name="delivery"]')?.value);
        const rowNg = safeNum(tr.querySelector('[name="ng"]')?.value);
        const rowEoh = safeNum(tr.querySelector('[name="eoh"]')?.value);
        const rowOk = safeNum(tr.querySelector('[name="confirmOk"]')?.value);
        const rowHold = safeNum(tr.querySelector('[name="confirmHold"]')?.value);
        const rowTotal = safeNum(tr.querySelector('[name="total"]')?.value);
        const rowSignedDiff = rowTotal - rowEoh;
        boh += rowBoh;
        supply += rowSupply;
        delivery += rowDelivery;
        ng += rowNg;
        eoh += rowEoh;
        ok += rowOk;
        hold += rowHold;
        total += rowTotal;
        diff += rowSignedDiff;
      });
      document.getElementById('sumBoh').textContent = formatNumOrDash(boh);
      document.getElementById('sumSupply').textContent = formatNumOrDash(supply);
      document.getElementById('sumDelivery').textContent = formatNumOrDash(delivery);
      document.getElementById('sumNg').textContent = formatNumOrDash(ng);
      document.getElementById('sumEoh').textContent = formatNumOrDash(eoh);
      document.getElementById('sumConfirmOk').textContent = formatNumOrDash(ok);
      document.getElementById('sumConfirmHold').textContent = formatNumOrDash(hold);
      document.getElementById('sumTotal').textContent = formatNumOrDash(total);
      const sumDiffEl = document.getElementById('sumDiff');
      sumDiffEl.textContent = formatNumOrDash(diff);
      sumDiffEl.classList.remove('diff-positive', 'diff-negative');
      if (diff < 0) {
        sumDiffEl.classList.add('diff-negative');
      } else {
        sumDiffEl.classList.add('diff-positive');
      }
    }

    async function deleteLastRow() {
      const body = document.getElementById('reportBody');
      if (!body.children.length) return;
      const cf = await Swal.fire(swalTheme({
        icon: 'question',
        title: 'Delete the last row?',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel'
      }));
      if (!cf.isConfirmed) return;
      body.removeChild(body.lastElementChild);
      recalcTotals();
      markDirty();
    }

    function getEditableCells() {
      return [...document.querySelectorAll('#reportBody input:not([disabled]), #reportBody textarea')];
    }

    function bindExcelKeys() {
      document.getElementById('reportBody').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const target = e.target;
        if (!(target.matches('input') || target.matches('textarea'))) return;
        e.preventDefault();
        const cells = getEditableCells();
        const idx = cells.indexOf(target);
        if (idx < 0) return;
        const next = cells[idx + 1];
        if (next) {
          next.focus();
          if (next.select) next.select();
          return;
        }
        addRow();
        const updated = getEditableCells();
        const firstNew = updated[idx + 1];
        if (firstNew) firstNew.focus();
      });
    }

    async function loadReport(showLoading = true) {
      const month = document.getElementById('monthInput').value;
      updateMonthlyTitle();
      if (!month) return Swal.fire(swalTheme({ icon: 'warning', title: 'Please select a month' }));
      isLoadingReport = true;
      if (showLoading) {
        Swal.fire(swalTheme({ title: 'Loading data...', showCloseButton: false, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() }));
      }
      try {
        const res = await api('getSubconMonthData', { month, username: currentUser.username });
        if (showLoading) Swal.close();
        if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Failed to load data' }));
        setEditMode(!!res.allowed, res.deadlineDate || '');
        const dataRows = res.rows || [];
        renderRows(dataRows);
        lastLoadedMonth = month;
        const hasSavedRows = dataRows.some((r) =>
          String(r.fileNo || '').trim() ||
          String(r.boh || '').trim() ||
          String(r.supply || '').trim() ||
          String(r.delivery || '').trim() ||
          String(r.ng || '').trim() ||
          String(r.eoh || '').trim() ||
          String(r.confirmOk || '').trim() ||
          String(r.confirmHold || '').trim() ||
          String(r.remark || '').trim()
        );
        lastUpdatedText = hasSavedRows ? new Date().toLocaleString('en-GB') : '-';
        renderDashboardKpiFromRows(collectRows());
        clearDirty();
      } catch (e) {
        if (showLoading) Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Failed to load data', text: e.message }));
      } finally {
        isLoadingReport = false;
      }
    }

    async function saveReport() {
      if (!editAllowed) return Swal.fire(swalTheme({ icon: 'warning', title: 'This month is locked by deadline' }));
      const ok = await Swal.fire(swalTheme({ icon: 'question', title: 'Save report data?', showCancelButton: true, confirmButtonText: 'Save', cancelButtonText: 'Cancel' }));
      if (!ok.isConfirmed) return;
      const rows = collectRows();

      Swal.fire(swalTheme({ title: rows.length ? 'Saving data...' : 'Clearing data...', showCloseButton: false, allowOutsideClick: false, allowEscapeKey: false, didOpen: () => Swal.showLoading() }));
      try {
        const res = await api('saveReport', { month: document.getElementById('monthInput').value, subcon: currentUser.subcon, username: currentUser.username, rows });
        Swal.close();
        if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Save failed' }));
        await Swal.fire(swalTheme({ icon: 'success', title: rows.length ? 'Data saved successfully' : 'All data cleared successfully' }));
        clearDirty();
        dashboardTrendCache = {};
        lastUpdatedText = rows.length ? new Date().toLocaleString('en-GB') : '-';
        loadReport();
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Save failed', text: e.message }));
      }
    }

    async function setMenu(menu) {
      const isDashboard = menu === 'dashboard';
      const isAddData = menu === 'addData';
      if (isDashboard) {
        const ok = await guardUnsavedChanges();
        if (!ok) return;
      }
      document.getElementById('dashboardView').classList.toggle('hidden', !isDashboard);
      document.getElementById('addDataView').classList.toggle('hidden', !isAddData);
      document.getElementById('menuDashboard').classList.toggle('active', isDashboard);
      document.getElementById('menuAddData').classList.toggle('active', isAddData);
      document.getElementById('pageHeader').classList.toggle('hidden', !isDashboard);
      if (isDashboard) {
        renderDashboardSubmissionStatus();
        renderDashboardKpiFromRows(collectRows());
        loadDashboardPanels(true);
      } else if (isAddData) {
        const currentMonth = document.getElementById('monthInput').value || '';
        if (!lastLoadedMonth || lastLoadedMonth !== currentMonth) {
          loadReport(true);
        }
      }
    }

    async function logout() {
      const cf = await Swal.fire(swalTheme({
        icon: 'question',
        title: 'Confirm logout?',
        showCancelButton: true,
        confirmButtonText: 'Logout',
        cancelButtonText: 'Cancel'
      }));
      if (!cf.isConfirmed) return;

      await Swal.fire(swalTheme({ icon: 'success', title: 'Logged out successfully', timer: 700, showConfirmButton: false }));
      sessionStorage.removeItem(SESSION_KEY);
      window.location.href = 'login.html';
    }

    function boot() {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) { window.location.href = 'login.html'; return; }
      try {
        currentUser = JSON.parse(raw);
      } catch (_) {
        sessionStorage.removeItem(SESSION_KEY);
        window.location.href = 'login.html';
        return;
      }
      if (!currentUser || currentUser.role !== 'SUBCON') {
        window.location.href = currentUser && currentUser.role === 'RMT' ? 'rmt.html' : 'login.html';
        return;
      }
      const month = new Date();
      document.getElementById('monthInput').value = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      trendYear = month.getFullYear();
      document.getElementById('userLabel').textContent = '';
      document.getElementById('rolePill').textContent = (currentUser.subcon || 'SUBCON').toUpperCase();
      document.getElementById('reportBody').addEventListener('input', markDirty);
      document.getElementById('monthInput').addEventListener('change', async () => {
        const nextMonth = document.getElementById('monthInput').value;
        const ok = await guardUnsavedChanges();
        if (!ok) {
          document.getElementById('monthInput').value = lastLoadedMonth || nextMonth;
          return;
        }
        updateMonthlyTitle();
        if (!document.getElementById('addDataView').classList.contains('hidden')) loadReport();
        if (!document.getElementById('dashboardView').classList.contains('hidden')) loadDashboardPanels(true, true);
      });
      updateMonthlyTitle();
      setMenu('dashboard');
      bindExcelKeys();
    }

    function setEditMode(allowed, deadlineDate = '') {
      editAllowed = !!allowed;
      currentDeadlineDate = deadlineDate || '';
      if (deadlineTimer) {
        clearInterval(deadlineTimer);
        deadlineTimer = null;
      }
      const fields = document.querySelectorAll('#reportBody input:not([name="eoh"]):not([name="total"]):not([name="diff"]), #reportBody textarea');
      fields.forEach(el => el.disabled = !editAllowed);
      const buttons = document.querySelectorAll('.actions button');
      buttons.forEach(btn => btn.disabled = !editAllowed);
      const note = document.getElementById('deadlineNote');
      const countdown = document.getElementById('deadlineCountdown');
      const box = document.getElementById('deadlineBox');
      if (editAllowed) {
        note.className = 'deadline-note open';
        if (box) box.className = 'deadline-box open';
        note.textContent = currentDeadlineDate ? `Final submission date: ${formatDeadlineDateDisplay(currentDeadlineDate)}` : 'Final submission date: not set';
        if (currentDeadlineDate) {
          const tick = () => {
            const end = new Date(currentDeadlineDate + 'T23:59:59').getTime();
            const now = Date.now();
            const ms = end - now;
            if (ms <= 0) {
              countdown.textContent = '00d 00h 00m 00s';
              return;
            }
            const sec = Math.floor(ms / 1000);
            const d = Math.floor(sec / 86400);
            const h = Math.floor((sec % 86400) / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            countdown.textContent = `${String(d).padStart(2, '0')}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
          };
          tick();
          deadlineTimer = setInterval(tick, 1000);
        } else {
          countdown.textContent = '';
        }
      } else {
        note.className = 'deadline-note lock';
        if (box) box.className = 'deadline-box lock';
        note.textContent = currentDeadlineDate ? `Locked (deadline: ${formatDeadlineDateDisplay(currentDeadlineDate)})` : 'Locked by monthly deadline';
        countdown.textContent = '';
      }
      renderDashboardSubmissionStatus();
    }

    boot();
