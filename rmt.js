
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby_U-79LipyDQwFtWKEys6M6Dvk6Yd-qbTlDax75ZsGgnB5c321MAvgL-dP-PHWh7k/exec';
    const SESSION_KEY = 'subcon_auth';
    const MONTH_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    let currentUser = null;
    let deadlineState = {};
    let dashboardDeadlineState = {};
    let fileNoMapState = {};
    let summaryCollapsedState = {};
    let userRowsState = [];
    let fileNoRowsState = [];
    let d365SubstockRowsState = [];
    let d365SubstockSummaryMap = {};
    let summaryRowsState = [];
    let summaryAllSubconsState = [];
    let summaryTopCollapsedState = { subcon: true, plant: true };
    let summaryQtyOverrideState = {};
    let summaryDirtyGroupsState = {};
    let summaryFilterMultiState = {
      item: [], fileNo: [], d365Code: [], d365Qty: [], d365Diff: [], boh: [], supply: [], delivery: [], ng: [], eoh: [], confirmOk: [], confirmHold: [], total: [], diff: [], remark: [], subcon: [], plant: []
    };
    let summaryDirty = false;
    let d365FilterState = {
      itemNumber: '', processNo: '', cmt: '', kdt: '', kkft: '', mdi: '', snt: '', ssp: '', skc: '', tpk: '', tisco: '', tyn: '', grandTotal: ''
    };
    let d365FilterMultiState = {
      itemNumber: [], processNo: [], cmt: [], kdt: [], kkft: [], mdi: [], snt: [], ssp: [], skc: [], tpk: [], tisco: [], tyn: [], grandTotal: []
    };

    function swalTheme(base = {}) { return Object.assign({ showCloseButton: true, confirmButtonColor: '#4C6272', background: '#ffffff', color: '#102027' }, base); }
    function swalLoading(title) {
      return swalTheme({
        title: title || 'Loading...',
        showCloseButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading()
      });
    }
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
    function getSignedDiffValue(row = {}) {
      return safeNum(row.total) - safeNum(row.eoh);
    }
    function getDisplayDiffValue(row = {}) {
      const explicit = String(row.diff ?? '').trim();
      if (explicit !== '') return Math.abs(safeNum(row.diff));
      return Math.abs(getSignedDiffValue(row));
    }
    function diffClassFromSigned(signed) {
      return signed < 0 ? 'diff-negative' : 'diff-positive';
    }
    function textOrDash(v) {
      const s = String(v ?? '').trim();
      return s ? s : '-';
    }
    function toSummaryRowKey(row = {}) {
      return [
        String(row.subcon || '').trim().toUpperCase(),
        String(row.item || '').trim(),
        String(row.fileNo || '').trim().toUpperCase()
      ].join('||');
    }
    function normalizeSummaryQtyValue(v) {
      if (v === '' || v === null || v === undefined) return 0;
      return Math.max(0, safeNum(v));
    }
    function getSummaryGroupKey(row = {}) {
      return `${String(row.subcon || '').trim().toUpperCase()}::${String(row.__d365Tail || getFileNoTail(row.fileNo) || '').trim().toUpperCase()}`;
    }
    function getSummaryDisplayDiff(qty, row = {}) {
      return normalizeSummaryQtyValue(qty) - safeNum(row.total);
    }
    function hasComparableSummaryD365(row = {}, totalD365 = normalizeSummaryQtyValue(row.__d365Qty)) {
      return normalizeSummaryQtyValue(row.__d365QtySource) > 0
        || totalD365 > 0
        || totalD365 !== normalizeSummaryQtyValue(row.__d365QtyDefault)
        || safeNum(row.total) > 0;
    }
    function formatSummaryQtyInputValue(n) {
      return normalizeSummaryQtyValue(n) > 0 ? String(normalizeSummaryQtyValue(n)) : '';
    }
    function setSummaryDirtyState(isDirty) {
      summaryDirty = !!isDirty;
      const btn = document.getElementById('saveSummaryQtyBtn');
      if (!btn) return;
      btn.classList.toggle('is-inactive', !summaryDirty);
      btn.classList.toggle('btn-warning', summaryDirty);
    }
    function isSummaryQtyEditable(fileNo) {
      return /[AB]$/i.test(String(fileNo || '').trim());
    }

    function monthLabel(yyyyMM) {
      if (!yyyyMM || !/^\d{4}-\d{2}$/.test(yyyyMM)) return '';
      const [y, m] = yyyyMM.split('-').map(Number);
      const dt = new Date(y, m - 1, 1);
      return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    function getCurrentMonthValue() {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    function resetMenuMonthState(menu) {
      const currentMonth = getCurrentMonthValue();
      const base = document.getElementById('monthInput');
      const dash = document.getElementById('dashboardMonthInput');
      const summary = document.getElementById('summaryMonthInput');
      const substock = document.getElementById('substockMonthInput');
      if (base) base.value = currentMonth;
      if (menu === 'dashboard' && dash) dash.value = currentMonth;
      if (menu === 'summary' && summary) summary.value = currentMonth;
      if (menu === 'd365substock' && substock) substock.value = currentMonth;
      if (menu === 'dashboard' || menu === 'summary' || menu === 'd365substock') {
        if (dash && menu !== 'dashboard') dash.value = currentMonth;
        if (summary && menu !== 'summary') summary.value = currentMonth;
        if (substock && menu !== 'd365substock') substock.value = currentMonth;
      }
      updateDashboardTitle();
    }

    function formatDashboardDate(v) {
      const s = String(v || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (isNaN(dt.getTime())) return s;
      const day = String(dt.getDate()).padStart(2, '0');
      const mon = dt.toLocaleDateString('en-US', { month: 'short' });
      const year = dt.getFullYear();
      return `${day}-${mon}-${year}`;
    }

    function renderDashboardDeadline(month) {
      const el = document.getElementById('dashboardDeadlineStatus');
      if (!el) return;
      const dd = (dashboardDeadlineState && dashboardDeadlineState[month]) ? String(dashboardDeadlineState[month]).trim() : '';
      if (!dd) {
        el.innerHTML = `Deadline: <span>-</span> <span class="chip na">NOT SET</span>`;
        return;
      }
      const ddDisplay = formatDashboardDate(dd);
      const end = new Date(dd + 'T23:59:59');
      const now = new Date();
      const closed = Number.isFinite(end.getTime()) ? now > end : false;
      const chipClass = closed ? 'closed' : 'open';
      const chipText = closed ? 'CLOSED' : 'OPEN';
      el.innerHTML = `Deadline: <span>${ddDisplay}</span> <span class="chip ${chipClass}">${chipText}</span>`;
    }

    function updateDashboardTitle() {
      const month = document.getElementById('monthInput').value;
      const label = monthLabel(month);
      document.getElementById('dashboardTitle').textContent = label
        ? `RMT Dashboard (Monthly Inventory) - ${label}`
        : 'RMT Dashboard (Monthly Inventory)';
    }

    function syncDashboardMonthInput() {
      const base = document.getElementById('monthInput');
      const dash = document.getElementById('dashboardMonthInput');
      if (base && dash && dash.value !== base.value) dash.value = base.value || '';
    }
    function syncSummaryMonthInput() {
      const base = document.getElementById('monthInput');
      const summary = document.getElementById('summaryMonthInput');
      if (base && summary && summary.value !== base.value) summary.value = base.value || '';
    }

    function renderRows(rows = []) {
      const body = document.getElementById('reportBody');
      if (!rows.length) {
        body.innerHTML = '<tr><td class="text-center" colspan="12">No data found</td></tr>';
        recalcTotals([]);
        return;
      }
      body.innerHTML = rows.map((r, i) => `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td>${r.fileNo || ''}</td>
          <td>${r.boh || ''}</td>
          <td>${r.supply || ''}</td>
          <td>${r.delivery || ''}</td>
          <td>${r.ng || ''}</td>
          <td>${r.eoh || ''}</td>
          <td>${r.confirmOk || ''}</td>
          <td>${r.confirmHold || ''}</td>
          <td>${r.total || ''}</td>
          <td class="diff-cell ${diffClassFromSigned(getSignedDiffValue(r))}">${formatNumOrDash(getDisplayDiffValue(r))}</td>
          <td>${r.remark || ''}</td>
        </tr>
      `).join('');
      recalcTotals(rows);
    }

    function recalcTotals(rows = []) {
      let boh = 0, supply = 0, delivery = 0, ng = 0, eoh = 0, ok = 0, hold = 0, total = 0, diff = 0;
      rows.forEach((r) => {
        boh += safeNum(r.boh);
        supply += safeNum(r.supply);
        delivery += safeNum(r.delivery);
        ng += safeNum(r.ng);
        eoh += safeNum(r.eoh);
        ok += safeNum(r.confirmOk);
        hold += safeNum(r.confirmHold);
        total += safeNum(r.total);
        diff += getSignedDiffValue(r);
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
      sumDiffEl.classList.add(diffClassFromSigned(diff));
    }

    async function loadReport() {
      const month = document.getElementById('monthInput').value;
      if (!month) return Swal.fire(swalTheme({ icon: 'warning', title: 'Please select a month' }));
      const subcon = document.getElementById('subconSelect').value || 'ALL';
      if (!subcon || subcon === '__SELECT__' || subcon === '__LOADING__') {
        renderRows([]);
        return;
      }

      Swal.fire(swalLoading('Loading data...'));
      try {
        const res = await api('getReport', { month, subcon, role: currentUser.role, username: currentUser.username });
        Swal.close();
        if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Failed to load data' }));
        const rows = res.rows || [];
        renderRows(rows);
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Failed to load data', text: e.message }));
      }
    }

    async function loadDashboard(showLoadingSwal = true) {
      const month = document.getElementById('monthInput').value;
      if (!month) return;
      const cards = document.getElementById('dashStatusCards');
      if (showLoadingSwal) {
        Swal.fire(swalLoading('Loading Dashboard...'));
      }
      cards.innerHTML = '<div class="subcon-card">Loading data...</div>';
      try {
        const [dataRes, dlRes] = await Promise.all([
          api('getDashboard', { month, username: currentUser.username }),
          api('listDeadlines', { username: currentUser.username })
        ]);
        dashboardDeadlineState = (dlRes && dlRes.ok && dlRes.deadlines) ? dlRes.deadlines : {};
        renderDashboardDeadline(month);
        if (!dataRes || !dataRes.ok) {
          document.getElementById('dashTotalSub').textContent = '0';
          document.getElementById('dashSubmitted').textContent = '0';
          document.getElementById('dashPending').textContent = '0';
          document.getElementById('dashTotalRows').textContent = '0';
          cards.innerHTML = '<div class="subcon-card">Failed to load data</div>';
          return;
        }

        const summary = dataRes.summary || {};
        const statusRows = dataRes.statusRows || [];
        document.getElementById('dashTotalSub').textContent = String(summary.totalSub || 0);
        document.getElementById('dashSubmitted').textContent = String(summary.submitted || 0);
        document.getElementById('dashPending').textContent = String(summary.pending || 0);
        document.getElementById('dashTotalRows').textContent = Number(summary.grandTotal || 0).toLocaleString('en-US');

        if (!statusRows.length) {
          cards.innerHTML = '<div class="subcon-card">No data found</div>';
          return;
        }
        cards.innerHTML = statusRows.map(x => {
          const isSubmitted = x.status === 'submitted';
          const st = isSubmitted ? 'Submitted' : 'Pending';
          const cls = isSubmitted ? 'submitted' : 'pending';
          const tv = Number(x.totalValue || 0).toLocaleString('en-US');
          const icon = isSubmitted ? 'fa-solid fa-circle-check' : 'fa-regular fa-clock';
          const iconCls = isSubmitted ? 'submitted' : 'pending';
          return `
            <div class="subcon-card ${cls}" onclick='openSubconDashboardSwal(${JSON.stringify(String(x.subcon || ""))})'>
              <span class="subcon-status-icon ${iconCls}"><i class="${icon}"></i></span>
              <div class="subcon-name">${x.subcon || ''}</div>
              <div class="subcon-meta"><span>${st}</span></div>
              <div class="subcon-total">${tv}</div>
            </div>
          `;
        }).join('');
      } catch (_) {
        renderDashboardDeadline(month);
        document.getElementById('dashTotalSub').textContent = '0';
        document.getElementById('dashSubmitted').textContent = '0';
        document.getElementById('dashPending').textContent = '0';
        document.getElementById('dashTotalRows').textContent = '0';
        cards.innerHTML = '<div class="subcon-card">Failed to load data</div>';
      }
      finally {
        if (showLoadingSwal) Swal.close();
      }
    }

    async function refreshDashboard() {
      await loadDashboard(true);
    }

    async function openSubconDashboardSwal(subcon) {
      const month = document.getElementById('monthInput').value;
      if (!subcon || !month) return;
      Swal.fire(swalLoading(`Loading ${String(subcon).toUpperCase()}...`));
      try {
        const res = await api('getReport', { month, subcon, role: currentUser.role, username: currentUser.username });
        if (!res || !res.ok) {
          Swal.close();
          return Swal.fire(swalTheme({ icon: 'error', title: (res && res.message) || 'Failed to load data' }));
        }
        const rows = res.rows || [];
        let boh = 0, supply = 0, delivery = 0, ng = 0, eoh = 0, ok = 0, hold = 0, total = 0, diff = 0;
        rows.forEach((r) => {
          boh += safeNum(r.boh);
          supply += safeNum(r.supply);
          delivery += safeNum(r.delivery);
          ng += safeNum(r.ng);
          eoh += safeNum(r.eoh);
          ok += safeNum(r.confirmOk);
          hold += safeNum(r.confirmHold);
          total += safeNum(r.total);
          diff += getSignedDiffValue(r);
        });

        const html = `
          <div style="max-height:60vh; overflow:auto;">
            <table class="mini-table" style="min-width:1100px;">
              <colgroup>
                <col style="width:4%;">
                <col style="width:8%;">
                <col style="width:7%;">
                <col style="width:7%;">
                <col style="width:7%;">
                <col style="width:6%;">
                <col style="width:7%;">
                <col style="width:8%;">
                <col style="width:8%;">
                <col style="width:7%;">
                <col style="width:7%;">
                <col style="width:24%;">
              </colgroup>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>File No.</th>
                  <th>BOH</th>
                  <th>Supply</th>
                  <th>Delivery</th>
                  <th>NG</th>
                  <th>EOH</th>
                  <th>Supplier confirm OK</th>
                  <th>Supplier confirm Hold</th>
                  <th>Total</th>
                  <th>Diff</th>
                  <th>Remark</th>
                </tr>
              </thead>
              <tbody>
                ${rows.length ? rows.map((r) => `
                  <tr>
                    <td class="text-center">${textOrDash(r.item)}</td>
                    <td>${textOrDash(r.fileNo)}</td>
                    <td>${textOrDash(r.boh)}</td>
                    <td>${textOrDash(r.supply)}</td>
                    <td>${textOrDash(r.delivery)}</td>
                    <td>${textOrDash(r.ng)}</td>
                    <td>${textOrDash(r.eoh)}</td>
                    <td>${textOrDash(r.confirmOk)}</td>
                    <td>${textOrDash(r.confirmHold)}</td>
                    <td>${textOrDash(r.total)}</td>
                    <td class="diff-cell ${diffClassFromSigned(getSignedDiffValue(r))}">${formatNumOrDash(getDisplayDiffValue(r))}</td>
                    <td style="text-align:left;">${textOrDash(r.remark)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="12" class="text-center">No data found</td></tr>'}
              </tbody>
              <tfoot>
                <tr>
                  <td></td>
                  <td class="text-center">Total</td>
                  <td>${formatNumOrDash(boh)}</td>
                  <td>${formatNumOrDash(supply)}</td>
                  <td>${formatNumOrDash(delivery)}</td>
                  <td>${formatNumOrDash(ng)}</td>
                  <td>${formatNumOrDash(eoh)}</td>
                  <td>${formatNumOrDash(ok)}</td>
                  <td>${formatNumOrDash(hold)}</td>
                  <td>${formatNumOrDash(total)}</td>
                  <td class="${diffClassFromSigned(diff)}">${formatNumOrDash(diff)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        `;
        Swal.fire(swalTheme({
          title: `Subcon: ${String(subcon).toUpperCase()} (${monthLabel(month)})`,
          width: 1200,
          html,
          showConfirmButton: false
        }));
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Failed to load data', text: e.message }));
      }
    }

    function setSettingTab(tab) {
      const isUser = tab === 'user';
      const isFileNo = tab === 'fileno';
      const isDeadline = tab === 'deadline';
      document.getElementById('settingTabUser').classList.toggle('active', isUser);
      document.getElementById('settingTabFileNo').classList.toggle('active', isFileNo);
      document.getElementById('settingTabDeadline').classList.toggle('active', isDeadline);
      document.getElementById('settingUserPanel').classList.toggle('hidden', !isUser);
      document.getElementById('settingFileNoPanel').classList.toggle('hidden', !isFileNo);
      document.getElementById('settingDeadlinePanel').classList.toggle('hidden', !isDeadline);
      if (isFileNo) loadFileNoMap();
      if (isDeadline) loadDeadlines();
    }

    function buildDeadlineMonths() {
      const yInput = Number(document.getElementById('deadlineYearInput')?.value || 0);
      const m = document.getElementById('monthInput').value;
      const year = yInput || (m && /^\d{4}-\d{2}$/.test(m) ? Number(m.split('-')[0]) : (new Date().getFullYear()));
      const out = [];
      for (let i = 1; i <= 12; i++) out.push(`${year}-${String(i).padStart(2, '0')}`);
      return out;
    }

    function formatDeadlineDate(v) {
      if (!v) return 'Not set';
      const d = new Date(v);
      if (isNaN(d.getTime())) return v;
      return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    }

    function safePct(a, b) {
      if (!b) return '-';
      return ((a / b) * 100).toFixed(2) + '%';
    }

    function toD365Code(fileNo) {
      const raw = String(fileNo || '').trim().toUpperCase();
      if (!raw) return '-';
      const core = raw.startsWith('F') ? raw.slice(1) : raw;
      if (!core) return '-';
      const m = core.match(/^(\d+)/);
      if (!m) return '-';
      return `56110T${m[1]}`;
    }

    function getFileNoTail(fileNo) {
      const raw = String(fileNo || '').trim().toUpperCase();
      if (!raw) return '';
      const core = raw.startsWith('F') ? raw.slice(1) : raw;
      const m = core.match(/^(\d+)/);
      if (!m) return '';
      return `T${m[1].padStart(4, '0')}`;
    }

    function getD365Tail(code) {
      const raw = String(code || '').trim().toUpperCase();
      if (!raw) return '';
      const idx = raw.indexOf('T');
      if (idx < 0 || idx === raw.length - 1) return raw;
      return raw.slice(idx);
    }

    function buildD365SubstockSummaryMap(rows = []) {
      const out = {};
      const cols = ['cmt', 'kdt', 'kkft', 'mdi', 'snt', 'ssp', 'skc', 'tpk', 'tisco', 'tyn'];
      (rows || []).forEach((r) => {
        const rawItem = String(r.itemNumber || '').trim().toUpperCase();
        const item = getD365Tail(rawItem);
        if (!item) return;
        if (!out[item]) {
          out[item] = { displayCode: rawItem, cmt: 0, kdt: 0, kkft: 0, mdi: 0, snt: 0, ssp: 0, skc: 0, tpk: 0, tisco: 0, tyn: 0, grandTotal: 0 };
        }
        cols.forEach((c) => {
          out[item][c] += safeNum(r[c]);
        });
        out[item].grandTotal += safeNum(r.grandTotal);
      });
      d365SubstockSummaryMap = out;
    }

    function findD365SummaryItem(fileNo) {
      const tail = getFileNoTail(fileNo);
      if (!tail) return null;
      if (d365SubstockSummaryMap[tail]) return d365SubstockSummaryMap[tail];
      const direct = (d365SubstockRowsState || []).find((r) => getD365Tail(r.itemNumber) === tail);
      if (!direct) return null;
      return {
        displayCode: String(direct.itemNumber || '').trim().toUpperCase(),
        cmt: safeNum(direct.cmt),
        kdt: safeNum(direct.kdt),
        kkft: safeNum(direct.kkft),
        mdi: safeNum(direct.mdi),
        snt: safeNum(direct.snt),
        ssp: safeNum(direct.ssp),
        skc: safeNum(direct.skc),
        tpk: safeNum(direct.tpk),
        tisco: safeNum(direct.tisco),
        tyn: safeNum(direct.tyn),
        grandTotal: safeNum(direct.grandTotal)
      };
    }

    function resolveDisplayD365Code(fileNo) {
      const item = findD365SummaryItem(fileNo);
      if (item && item.displayCode) return { text: item.displayCode, found: true };
      return { text: 'No in D365', found: false };
    }

    function getRowD365Qty(row = {}) {
      const subconKey = String(row.subcon || '').trim().toLowerCase();
      if (!subconKey) return 0;
      const item = findD365SummaryItem(row.fileNo);
      if (!item) return 0;
      return safeNum(item[subconKey]);
    }
    function fileNoFromD365Code(code) {
      const tail = getD365Tail(code);
      if (!tail) return '';
      return `F${tail.replace(/^T/i, '')}`;
    }
    function buildSummaryRows(rows = [], allSubcons = []) {
      const grouped = rows.reduce((acc, r) => {
        const key = String(r.subcon || 'UNKNOWN').trim() || 'UNKNOWN';
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
      }, {});
      (allSubcons || []).forEach((sub) => {
        const key = String(sub || '').trim();
        if (key && !grouped[key]) grouped[key] = [];
      });
      const keys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
      const out = [];
      keys.forEach((sub) => {
        const existingTails = {};
        const preferredRowByTail = {};
        let maxItem = 0;
        grouped[sub].forEach((row) => {
          const d365Tail = getFileNoTail(row.fileNo);
          if (!d365Tail) return;
          if (!preferredRowByTail[d365Tail]) {
            preferredRowByTail[d365Tail] = row;
            return;
          }
          const currentPreferred = preferredRowByTail[d365Tail];
          if (!isSummaryQtyEditable(currentPreferred.fileNo) && isSummaryQtyEditable(row.fileNo)) {
            preferredRowByTail[d365Tail] = row;
          }
        });
        grouped[sub].forEach((row) => {
          const rowItem = safeNum(row.item);
          if (rowItem > maxItem) maxItem = rowItem;
          const d365Tail = getFileNoTail(row.fileNo);
          if (d365Tail) existingTails[d365Tail] = true;
          const sourceQty = getRowD365Qty(row);
          const preferred = d365Tail ? preferredRowByTail[d365Tail] : null;
          const defaultQty = d365Tail && preferred === row ? sourceQty : 0;
          const key = toSummaryRowKey(row);
          const overrideQty = Object.prototype.hasOwnProperty.call(summaryQtyOverrideState, key)
            ? normalizeSummaryQtyValue(summaryQtyOverrideState[key])
            : defaultQty;
          out.push(Object.assign({}, row, {
            __summaryKey: key,
            __d365Tail: d365Tail,
            __d365QtySource: sourceQty,
            __d365QtyDefault: defaultQty,
            __d365Qty: overrideQty
          }));
        });
        const subconKey = String(sub || '').trim().toLowerCase();
        const missingD365Rows = (d365SubstockRowsState || [])
          .filter((r) => safeNum(r[subconKey]) > 0)
          .filter((r) => {
            const tail = getD365Tail(r.itemNumber);
            return tail && !existingTails[tail];
          })
          .sort((a, b) => {
            const ai = String(a.itemNumber || '').trim();
            const bi = String(b.itemNumber || '').trim();
            if (ai !== bi) return ai.localeCompare(bi);
            return safeNum(a.processNo) - safeNum(b.processNo);
          });
        missingD365Rows.forEach((d365Row, idx) => {
          const fileNo = fileNoFromD365Code(d365Row.itemNumber) || '-';
          const syntheticRow = {
            subcon: sub,
            item: maxItem + idx + 1,
            fileNo,
            boh: '',
            supply: '',
            delivery: '',
            ng: '',
            eoh: '',
            confirmOk: '',
            confirmHold: '',
            total: '',
            diff: '',
            remark: 'Missing in Subcon submission'
          };
          const d365Tail = getFileNoTail(fileNo);
          const key = toSummaryRowKey(syntheticRow);
          const sourceQty = safeNum(d365Row[subconKey]);
          const overrideQty = Object.prototype.hasOwnProperty.call(summaryQtyOverrideState, key)
            ? normalizeSummaryQtyValue(summaryQtyOverrideState[key])
            : sourceQty;
          out.push(Object.assign({}, syntheticRow, {
            __summaryKey: key,
            __d365Tail: d365Tail,
            __d365QtySource: sourceQty,
            __d365QtyDefault: sourceQty,
            __d365Qty: overrideQty,
            __isMissingInSub: true
          }));
        });
      });
      return out;
    }
    function validateSummaryQtyOverrides(rows = []) {
      const bucket = {};
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const qty = normalizeSummaryQtyValue(row.__d365Qty);
        if (qty < 0) {
          return { ok: false, message: `D365 Q'ty must be 0 or greater (${row.fileNo || '-'})` };
        }
        const tail = String(row.__d365Tail || '').trim();
        const subcon = String(row.subcon || '').trim().toUpperCase();
        if (!tail || !subcon) continue;
        const gKey = `${subcon}::${tail}`;
        if (!bucket[gKey]) {
          bucket[gKey] = {
            subcon,
            tail,
            sourceQty: normalizeSummaryQtyValue(row.__d365QtySource),
            editedQty: 0
          };
        }
        bucket[gKey].editedQty += qty;
      }
      const keys = Object.keys(bucket);
      for (let i = 0; i < keys.length; i += 1) {
        const item = bucket[keys[i]];
        if (item.sourceQty > 0 && item.editedQty > item.sourceQty) {
          return {
            ok: false,
            message: `${item.subcon} ${item.tail} exceeds source D365 quantity (${item.editedQty.toLocaleString('en-US')} > ${item.sourceQty.toLocaleString('en-US')})`
          };
        }
      }
      return { ok: true };
    }
    function validateSummaryDirtyGroups(rows = []) {
      const dirtyGroupKeys = Object.keys(summaryDirtyGroupsState || {}).filter((k) => summaryDirtyGroupsState[k]);
      if (!dirtyGroupKeys.length) return { ok: true };
      const targetRows = rows.filter((row) => dirtyGroupKeys.includes(getSummaryGroupKey(row)));
      return validateSummaryQtyOverrides(targetRows);
    }

    function toggleSummaryGroup(groupId) {
      const cur = !!summaryCollapsedState[groupId];
      summaryCollapsedState[groupId] = !cur;
      document.querySelectorAll(`tr[data-summary-group="${groupId}"]`).forEach((tr) => {
        tr.style.display = summaryCollapsedState[groupId] ? 'none' : '';
      });
      const icon = document.getElementById(`sumToggle_${groupId}`);
      if (icon) icon.textContent = summaryCollapsedState[groupId] ? '+' : '-';
    }

    function renderSummaryRows(rows = [], allSubcons = []) {
      const body = document.getElementById('summaryBody');
      const filteredRows = applySummaryFilter(rows || []);
      if (!filteredRows.length && !allSubcons.length) {
        setSummaryDirtyState(false);
        body.innerHTML = '<tr><td class="text-center" colspan="24">No data found</td></tr>';
        return;
      }
      const grouped = filteredRows.reduce((acc, r) => {
        const key = String(r.subcon || 'UNKNOWN').trim() || 'UNKNOWN';
        if (!acc[key]) acc[key] = [];
        acc[key].push(r);
        return acc;
      }, {});
      const keys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
      if (!keys.length) {
        body.innerHTML = '<tr><td class="text-center" colspan="24">No matching records found</td></tr>';
        return;
      }

      let html = '';
      keys.forEach((sub, groupIndex) => {
        const gRows = grouped[sub];
        const subUpper = String(sub || 'UNKNOWN').toUpperCase();
        const groupId = `g${groupIndex}`;
        if (typeof summaryCollapsedState[groupId] === 'undefined') {
          summaryCollapsedState[groupId] = !gRows.length;
        }
        let sumTotalD365 = 0;
        let sumTotalSubc = 0;
        let totalItem = 0;
        let okItem = 0;
        let diffItem = 0;

        html += `<tr>
          <td colspan="24" style="background:#e2e8f0; font-weight:800; text-align:left; cursor:pointer;" onclick="toggleSummaryGroup('${groupId}')">
            <span id="sumToggle_${groupId}" style="display:inline-block; width:20px;">${summaryCollapsedState[groupId] ? '+' : '-'}</span>SUBCON: ${subUpper}
          </td>
        </tr>`;
        html += gRows.map((r, i) => {
          const m = getFileNoMapEntry(r.fileNo);
          const totalD365 = normalizeSummaryQtyValue(r.__d365Qty);
          const totalSubc = safeNum(r.confirmOk) + safeNum(r.confirmHold);
          const hasComparableD365 = hasComparableSummaryD365(r, totalD365);
          const diffQty = hasComparableD365 ? getSummaryDisplayDiff(totalD365, r) : null;
          const d365Code = resolveDisplayD365Code(r.fileNo);
          const isEditable = isSummaryQtyEditable(r.fileNo);
          const fileNoClass = isEditable ? 'summary-file-ab' : '';
          sumTotalD365 += totalD365;
          sumTotalSubc += totalSubc;
          totalItem += 1;
          if (diffQty === null || diffQty === 0) okItem += 1;
          if (diffQty !== null && diffQty !== 0) diffItem += 1;
          const editedClass = totalD365 !== normalizeSummaryQtyValue(r.__d365QtyDefault) ? 'summary-edited' : '';
          return `
            <tr data-summary-group="${groupId}" class="${r.__isMissingInSub ? 'summary-missing-row' : ''}" style="${summaryCollapsedState[groupId] ? 'display:none;' : ''}">
              <td>${i + 1}</td>
              <td class="${fileNoClass}">${r.fileNo || '-'}</td>
              <td class="${d365Code.found ? '' : 'd365-missing'}">${d365Code.text}</td>
              <td class="summary-d365-cell">
                ${isEditable ? `
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputmode="numeric"
                    class="summary-d365-input ${editedClass}"
                    value="${formatSummaryQtyInputValue(totalD365)}"
                    data-summary-key="${r.__summaryKey}"
                    onchange="handleSummaryD365QtyChange(this)"
                  >
                ` : `<span>${formatNumOrDash(totalD365)}</span>`}
              </td>
              <td>${diffQty === null ? '-' : formatNumOrDash(diffQty)}</td>
              <td>${r.boh || '-'}</td>
              <td>${r.supply || '-'}</td>
              <td>${r.delivery || '-'}</td>
              <td>${r.ng || '-'}</td>
              <td>${r.eoh || '-'}</td>
              <td>${r.confirmOk || '-'}</td>
              <td>${r.confirmHold || '-'}</td>
              <td>${r.total || '-'}</td>
              <td>${r.diff || '-'}</td>
              <td style="text-align:left;">${r.remark || '-'}</td>
              <td>${String(r.subcon || '-').toUpperCase()}</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>${m.plant || '-'}</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
              <td>-</td>
            </tr>
          `;
        }).join('');

        if (!gRows.length) {
          html += `
            <tr data-summary-group="${groupId}" style="${summaryCollapsedState[groupId] ? 'display:none;' : ''}">
              <td colspan="24" class="text-center" style="color:#64748b;">No data submitted</td>
            </tr>
          `;
        }

        const qtyPct = safePct(sumTotalSubc, sumTotalD365);
        const accPct = safePct(okItem, totalItem);
        html += `
          <tr data-summary-group="${groupId}" style="background:#f8fafc; font-weight:700; ${summaryCollapsedState[groupId] ? 'display:none;' : ''}">
            <td colspan="16" style="text-align:right;">Total (${subUpper})</td>
            <td>${formatNumOrDash(sumTotalD365)}</td>
            <td>${formatNumOrDash(sumTotalSubc)}</td>
            <td>${qtyPct}</td>
            <td>-</td>
            <td>${formatNumOrDash(totalItem)}</td>
            <td>${formatNumOrDash(okItem)}</td>
            <td>${formatNumOrDash(diffItem)}</td>
            <td>${accPct}</td>
          </tr>
        `;
      });
      body.innerHTML = html;
    }

    function initSubstockMonth() {
      const src = document.getElementById('monthInput');
      const dst = document.getElementById('substockMonthInput');
      if (!src || !dst) return;
      if (!dst.value) dst.value = src.value || '';
    }

    function pickHeaderValue(row, candidates = []) {
      for (let i = 0; i < candidates.length; i++) {
        const key = candidates[i];
        if (Object.prototype.hasOwnProperty.call(row, key) && String(row[key] ?? '').trim() !== '') {
          return row[key];
        }
      }
      return '';
    }

    function normalizeSubstockRows(rawRows = []) {
      const plantCols = ['CMT', 'KDT', 'KKFT', 'MDI', 'SNT', 'SSP', 'SKC', 'TPK', 'TISCO', 'TYN'];
      const vendorToSubcon = [
        { key: 'CENTRAL MACHINERY TECH', sub: 'CMT' },
        { key: 'K.D.HEAT TECHNOLOGY', sub: 'KDT' },
        { key: 'KYORITSU KIDEN FUJI', sub: 'KKFT' },
        { key: 'MDI HEAT TREATMENT', sub: 'MDI' },
        { key: 'S.N.T MOULD', sub: 'SNT' },
        { key: 'S.S.P. BURAPHA', sub: 'SSP' },
        { key: 'SIAM KOCHI', sub: 'SKC' },
        { key: 'THAI PARKERZING', sub: 'TPK' },
        { key: 'THAIINDUCTION SERVICES', sub: 'TISCO' },
        { key: 'TOYONAGA', sub: 'TYN' }
      ];
      const isPivotShape = rawRows.some((row) => String(pickHeaderValue(row, ['CMT'])).trim() !== '' || String(pickHeaderValue(row, ['KKFT'])).trim() !== '');
      if (isPivotShape) {
        return rawRows.map((row) => {
          const itemNumber = pickHeaderValue(row, ['Item Number', 'ITEM NUMBER', 'ItemNumber', 'item number']);
          const processNo = pickHeaderValue(row, ['Process No.', 'Process No', 'PROCESS NO.', 'PROCESS NO', 'Process']);
          const out = { itemNumber, processNo };
          let gt = 0;
          plantCols.forEach((p) => {
            const v = safeNum(pickHeaderValue(row, [p]));
            out[p.toLowerCase()] = v ? v : '';
            gt += v;
          });
          out.grandTotal = gt ? gt : '';
          return out;
        }).filter((r) => String(r.itemNumber || '').trim() !== '' || String(r.processNo || '').trim() !== '');
      }

      // Raw D365 shape (as sample): aggregate by Item Number + Process No., split qty by Vendor Name.
      const map = {};
      rawRows.forEach((row) => {
        const itemNumber = String(pickHeaderValue(row, ['Item Number', 'ITEM NUMBER', 'ItemNumber'])).trim();
        const processNoRaw = pickHeaderValue(row, ['Process No.', 'Process No', 'PROCESS NO.', 'PROCESS NO']);
        const processNo = String(processNoRaw ?? '').trim();
        if (!itemNumber && !processNo) return;

        const vendorRaw = String(pickHeaderValue(row, ['Vendor Name', 'VENDOR NAME', 'Vendor', 'VENDOR'])).trim().toUpperCase();
        const vendorNormalized = vendorRaw.replace(/[^A-Z0-9]/g, '');
        let subconKey = '';
        for (let i = 0; i < vendorToSubcon.length; i++) {
          const m = vendorToSubcon[i];
          const k = m.key.replace(/[^A-Z0-9]/g, '');
          if (vendorNormalized.indexOf(k) >= 0) {
            subconKey = m.sub;
            break;
          }
        }
        if (!subconKey) return;

        const qty = safeNum(
          pickHeaderValue(row, ['Remaining Qty', 'REMAINING QTY', 'Remaining', 'Available Qty', 'Good Qty'])
        );

        const key = `${itemNumber}||${processNo}`;
        if (!map[key]) {
          map[key] = {
            itemNumber,
            processNo,
            cmt: 0, kdt: 0, kkft: 0, mdi: 0, snt: 0, ssp: 0, skc: 0, tpk: 0, tisco: 0, tyn: 0,
            grandTotal: 0
          };
        }
        const targetCol = subconKey.toLowerCase();
        map[key][targetCol] += qty;
        map[key].grandTotal += qty;
      });

      return Object.values(map).map((r) => {
        const out = { ...r };
        plantCols.forEach((p) => {
          const k = p.toLowerCase();
          out[k] = out[k] ? out[k] : '';
        });
        out.grandTotal = out.grandTotal ? out.grandTotal : '';
        return out;
      }).sort((a, b) => {
        const ai = String(a.itemNumber || '');
        const bi = String(b.itemNumber || '');
        if (ai === bi) {
          const ap = safeNum(a.processNo);
          const bp = safeNum(b.processNo);
          if (ap !== bp) return ap - bp;
          return String(a.processNo || '').localeCompare(String(b.processNo || ''));
        }
        return ai.localeCompare(bi);
      });
    }

    function renderD365SubstockRows(rows = []) {
      const body = document.getElementById('d365SubstockBody');
      if (!body) return;
      const filtered = applyD365SubstockFilter(rows || []);
      if (!filtered.length) {
        body.innerHTML = '<tr><td colspan="13" class="text-center">No data uploaded</td></tr>';
        renderD365SubstockTotals([]);
        return;
      }
      body.innerHTML = filtered.map((r) => `
        <tr>
          <td>${textOrDash(r.itemNumber)}</td>
          <td>${textOrDash(r.processNo)}</td>
          <td>${textOrDash(r.cmt)}</td>
          <td>${textOrDash(r.kdt)}</td>
          <td>${textOrDash(r.kkft)}</td>
          <td>${textOrDash(r.mdi)}</td>
          <td>${textOrDash(r.snt)}</td>
          <td>${textOrDash(r.ssp)}</td>
          <td>${textOrDash(r.skc)}</td>
          <td>${textOrDash(r.tpk)}</td>
          <td>${textOrDash(r.tisco)}</td>
          <td>${textOrDash(r.tyn)}</td>
          <td>${textOrDash(r.grandTotal)}</td>
        </tr>
      `).join('');
      renderD365SubstockTotals(filtered);
    }

    function renderD365SubstockTotals(rows = []) {
      const sumCols = {
        cmt: 0, kdt: 0, kkft: 0, mdi: 0, snt: 0, ssp: 0, skc: 0, tpk: 0, tisco: 0, tyn: 0, grandTotal: 0
      };
      (rows || []).forEach((r) => {
        sumCols.cmt += safeNum(r.cmt);
        sumCols.kdt += safeNum(r.kdt);
        sumCols.kkft += safeNum(r.kkft);
        sumCols.mdi += safeNum(r.mdi);
        sumCols.snt += safeNum(r.snt);
        sumCols.ssp += safeNum(r.ssp);
        sumCols.skc += safeNum(r.skc);
        sumCols.tpk += safeNum(r.tpk);
        sumCols.tisco += safeNum(r.tisco);
        sumCols.tyn += safeNum(r.tyn);
        sumCols.grandTotal += safeNum(r.grandTotal);
      });
      const set = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatNumOrDash(v);
      };
      set('sumSubstockCmt', sumCols.cmt);
      set('sumSubstockKdt', sumCols.kdt);
      set('sumSubstockKkft', sumCols.kkft);
      set('sumSubstockMdi', sumCols.mdi);
      set('sumSubstockSnt', sumCols.snt);
      set('sumSubstockSsp', sumCols.ssp);
      set('sumSubstockSkc', sumCols.skc);
      set('sumSubstockTpk', sumCols.tpk);
      set('sumSubstockTisco', sumCols.tisco);
      set('sumSubstockTyn', sumCols.tyn);
      set('sumSubstockGrandTotal', sumCols.grandTotal);
    }

    function applyD365SubstockFilter(rows = []) {
      const keys = Object.keys(d365FilterState);
      return rows.filter((r) => {
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const picked = Array.isArray(d365FilterMultiState[k]) ? d365FilterMultiState[k] : [];
          const kw = String(d365FilterState[k] || '').trim().toLowerCase();
          const cellRaw = textOrDash(r[k]);
          const cell = String(cellRaw).toLowerCase();

          if (picked.length > 0) {
            const found = picked.some((v) => String(v).toLowerCase() === cell);
            if (!found) return false;
            continue;
          }
          if (!kw) continue;
          if (!cell.includes(kw)) return false;
        }
        return true;
      });
    }

    function updateD365FilterHeaderState() {
      document.querySelectorAll('.d365-filter-head').forEach((th) => {
        const key = th.getAttribute('data-filter-key') || '';
        const active = String(d365FilterState[key] || '').trim() !== '' || ((d365FilterMultiState[key] || []).length > 0);
        th.classList.toggle('active-filter', active);
      });
    }
    function getFileNoMapEntry(fileNo) {
      const raw = String(fileNo || '').trim().toUpperCase();
      if (!raw) return {};
      if (fileNoMapState[raw]) return fileNoMapState[raw];
      const base = raw.replace(/([AB])$/i, '');
      if (base && fileNoMapState[base]) return fileNoMapState[base];
      return {};
    }
    function getSummaryRowPlant(row = {}) {
      const m = getFileNoMapEntry(row.fileNo);
      return String(m.plant || '-').toUpperCase() || '-';
    }
    function getSummaryRowD365Qty(row = {}) {
      return normalizeSummaryQtyValue(row.__d365Qty);
    }
    function getSummaryRowD365Diff(row = {}) {
      const totalD365 = getSummaryRowD365Qty(row);
      const hasComparableD365 = hasComparableSummaryD365(row, totalD365);
      return hasComparableD365 ? getSummaryDisplayDiff(totalD365, row) : null;
    }
    function getSummaryCellValue(row = {}, key) {
      switch (key) {
        case 'item': return textOrDash(row.item);
        case 'fileNo': return textOrDash(row.fileNo);
        case 'd365Code': return textOrDash(resolveDisplayD365Code(row.fileNo).text);
        case 'd365Qty': return formatNumOrDash(getSummaryRowD365Qty(row));
        case 'd365Diff': {
          const diffQty = getSummaryRowD365Diff(row);
          return diffQty === null ? '-' : formatNumOrDash(diffQty);
        }
        case 'boh': return textOrDash(row.boh);
        case 'supply': return textOrDash(row.supply);
        case 'delivery': return textOrDash(row.delivery);
        case 'ng': return textOrDash(row.ng);
        case 'eoh': return textOrDash(row.eoh);
        case 'confirmOk': return textOrDash(row.confirmOk);
        case 'confirmHold': return textOrDash(row.confirmHold);
        case 'total': return textOrDash(row.total);
        case 'diff': return textOrDash(row.diff);
        case 'remark': return textOrDash(row.remark);
        case 'subcon': return textOrDash(String(row.subcon || '').toUpperCase());
        case 'plant': return textOrDash(getSummaryRowPlant(row));
        default: return '-';
      }
    }
    function applySummaryFilter(rows = []) {
      const keys = Object.keys(summaryFilterMultiState || {});
      return rows.filter((row) => {
        for (let i = 0; i < keys.length; i += 1) {
          const key = keys[i];
          const picked = Array.isArray(summaryFilterMultiState[key]) ? summaryFilterMultiState[key] : [];
          if (!picked.length) continue;
          const cell = String(getSummaryCellValue(row, key)).toLowerCase();
          const found = picked.some((v) => String(v).toLowerCase() === cell);
          if (!found) return false;
        }
        return true;
      });
    }
    function getSummaryTopRowsForExport(rows = []) {
      const filteredRows = applySummaryFilter(rows || []);
      const allSubcons = Array.isArray(summaryAllSubconsState) ? summaryAllSubconsState : [];
      const byPlant = {};
      const bySubcon = {};
      let grandD365 = 0;
      let grandSubc = 0;
      let grandItems = 0;
      let grandOk = 0;
      let grandDiff = 0;

      filteredRows.forEach((r) => {
        const plant = getSummaryRowPlant(r);
        const subcon = String(r.subcon || '').trim().toUpperCase() || '-';
        if (!byPlant[plant]) byPlant[plant] = { d365: 0, subc: 0, totalItem: 0, okItem: 0, diffItem: 0 };
        if (!bySubcon[subcon]) bySubcon[subcon] = { d365: 0, subc: 0, totalItem: 0, okItem: 0, diffItem: 0 };
        const d365Qty = getSummaryRowD365Qty(r);
        const subcQty = safeNum(r.confirmOk) + safeNum(r.confirmHold);
        const diffQty = getSummaryRowD365Diff(r);
        const isOk = diffQty === null || diffQty === 0;

        byPlant[plant].d365 += d365Qty;
        byPlant[plant].subc += subcQty;
        byPlant[plant].totalItem += 1;
        bySubcon[subcon].d365 += d365Qty;
        bySubcon[subcon].subc += subcQty;
        bySubcon[subcon].totalItem += 1;
        if (isOk) byPlant[plant].okItem += 1;
        if (isOk) bySubcon[subcon].okItem += 1;
        if (diffQty !== null && diffQty !== 0) byPlant[plant].diffItem = (byPlant[plant].diffItem || 0) + 1;
        if (diffQty !== null && diffQty !== 0) bySubcon[subcon].diffItem = (bySubcon[subcon].diffItem || 0) + 1;

        grandD365 += d365Qty;
        grandSubc += subcQty;
        grandItems += 1;
        if (isOk) grandOk += 1;
        if (diffQty !== null && diffQty !== 0) grandDiff += 1;

      });

      const plants = ['CHP', 'G1P'];
      if (byPlant['-']) plants.push('-');
      const subconOrder = allSubcons.length
        ? allSubcons.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean)
        : Object.keys(bySubcon).sort();
      const blankRow = (group) => ({
        Group: group,
        'Total D365': '',
        'Total Subc': '',
        "%Q'ty": '',
        Plant: '',
        'Total Item': '',
        'OK Item': '',
        'Diff Item': '',
        '%Accuracy': '',
        Score: ''
      });
      const out = [];

      if (subconOrder.length) {
        out.push(blankRow('Subcon Summary'));
        subconOrder.forEach((subcon) => {
          const s = bySubcon[subcon] || { d365: 0, subc: 0, totalItem: 0, okItem: 0, diffItem: 0 };
          out.push({
            Group: `SUBCON: ${subcon}`,
            'Total D365': s.d365,
            'Total Subc': s.subc,
            "%Q'ty": safePct(s.subc, s.d365),
            Plant: '-',
            'Total Item': s.totalItem,
            'OK Item': s.okItem,
            'Diff Item': s.diffItem || 0,
            '%Accuracy': safePct(s.okItem, s.totalItem),
            Score: getAccuracyScoreText(s.okItem, s.totalItem).text
          });
        });
      }

      if (plants.length) {
        out.push(blankRow('Plant Summary'));
      }
      plants.forEach((plant) => {
        const p = byPlant[plant] || { d365: 0, subc: 0, totalItem: 0, okItem: 0, diffItem: 0 };
        const plantLabel = plant === '-' ? 'Unmapped Plant' : plant;
        out.push({
          Group: plantLabel,
          'Total D365': p.d365,
          'Total Subc': p.subc,
          "%Q'ty": safePct(p.subc, p.d365),
          Plant: plantLabel,
          'Total Item': p.totalItem,
          'OK Item': p.okItem,
          'Diff Item': p.diffItem || 0,
          '%Accuracy': safePct(p.okItem, p.totalItem),
          Score: '-'
        });
      });
      out.push({
        Group: 'Total',
        'Total D365': grandD365,
        'Total Subc': grandSubc,
        "%Q'ty": safePct(grandSubc, grandD365),
        Plant: '-',
        'Total Item': grandItems,
        'OK Item': grandOk,
        'Diff Item': grandDiff,
        '%Accuracy': safePct(grandOk, grandItems),
        Score: '-'
      });
      return out;
    }
    function getSummaryDetailRowsForExport(rows = []) {
      const filteredRows = applySummaryFilter(rows || []);
      return filteredRows.map((r, idx) => {
        const d365Code = resolveDisplayD365Code(r.fileNo);
        const d365Qty = getSummaryRowD365Qty(r);
        const d365Diff = getSummaryRowD365Diff(r);
        return {
          Item: idx + 1,
          'File No.': textOrDash(r.fileNo),
          'D365 code': d365Code.text,
          "D365 Q'ty": d365Qty || '',
          Diff: d365Diff === null ? '' : d365Diff,
          BOH: textOrDash(r.boh),
          Supply: textOrDash(r.supply),
          Delivery: textOrDash(r.delivery),
          NG: textOrDash(r.ng),
          EOH: textOrDash(r.eoh),
          OK: textOrDash(r.confirmOk),
          Hold: textOrDash(r.confirmHold),
          Total: textOrDash(r.total),
          'Diff (Subcon)': textOrDash(r.diff),
          Remark: textOrDash(r.remark),
          SUBC: textOrDash(String(r.subcon || '').toUpperCase()),
          Plant: getSummaryRowPlant(r),
          'Missing in Subcon': r.__isMissingInSub ? 'YES' : ''
        };
      });
    }
    function updateSummaryFilterHeaderState() {
      document.querySelectorAll('.summary-filter-head').forEach((th) => {
        const key = th.getAttribute('data-filter-key') || '';
        const active = ((summaryFilterMultiState[key] || []).length > 0);
        th.classList.toggle('active-filter', active);
      });
    }
    function getSummaryDistinctValues(key) {
      const s = new Set();
      (summaryRowsState || []).forEach((row) => {
        s.add(getSummaryCellValue(row, key));
      });
      return Array.from(s).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
    }
    async function openSummaryFilterSwal(key, label) {
      const allValues = getSummaryDistinctValues(key);
      const selectedNow = new Set((summaryFilterMultiState[key] || []).map((v) => String(v).toLowerCase()));
      const rowsHtml = allValues.map((v) => {
        const checked = selectedNow.has(String(v).toLowerCase()) ? 'checked' : '';
        return `
          <label style="display:flex; align-items:center; gap:8px; padding:4px 0;">
            <input type="checkbox" class="summary-opt" value="${String(v).replace(/"/g, '&quot;')}" ${checked}>
            <span>${String(v).replace(/</g, '&lt;')}</span>
          </label>
        `;
      }).join('');
      const rs = await Swal.fire(swalTheme({
        title: `Filter: ${label}`,
        html: `
          <div style="text-align:left; margin-top:4px;">
            <input id="swSummaryFilterSearch" class="swal2-input" placeholder="Search value..." style="margin:0 0 10px 0; height:40px; width:100%;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;">
              <div id="swSummaryCount" style="font-size:12px; color:#64748b; font-weight:600;">0 selected</div>
              <div style="display:flex; gap:8px;">
                <button type="button" id="swSummarySelAll" class="swal2-styled" style="background:#334155; margin:0; padding:8px 12px; border-radius:8px;">Select All</button>
                <button type="button" id="swSummaryClrAll" class="swal2-styled" style="background:#64748b; margin:0; padding:8px 12px; border-radius:8px;">Clear</button>
              </div>
            </div>
            <div style="font-size:12px; color:#475569; font-weight:700; margin:0 0 6px 2px;">Values</div>
            <div id="swSummaryList" style="max-height:280px; overflow:auto; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; background:#f8fafc;">
              ${rowsHtml || '<div style="color:#64748b;">No values</div>'}
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Apply',
        cancelButtonText: 'Cancel',
        didOpen: () => {
          const search = document.getElementById('swSummaryFilterSearch');
          const list = document.getElementById('swSummaryList');
          const btnAll = document.getElementById('swSummarySelAll');
          const btnClr = document.getElementById('swSummaryClrAll');
          const countEl = document.getElementById('swSummaryCount');
          const syncCount = () => {
            if (!list || !countEl) return;
            countEl.textContent = `${list.querySelectorAll('input.summary-opt:checked').length} selected`;
          };
          if (search && list) {
            search.addEventListener('input', () => {
              const kw = String(search.value || '').trim().toLowerCase();
              list.querySelectorAll('label').forEach((lb) => {
                const txt = (lb.textContent || '').toLowerCase();
                lb.style.display = !kw || txt.includes(kw) ? 'flex' : 'none';
              });
            });
          }
          if (btnAll && list) {
            btnAll.addEventListener('click', () => {
              list.querySelectorAll('label').forEach((lb) => {
                if (lb.style.display === 'none') return;
                const cb = lb.querySelector('input.summary-opt');
                if (cb) cb.checked = true;
              });
              syncCount();
            });
          }
          if (btnClr && list) {
            btnClr.addEventListener('click', () => {
              list.querySelectorAll('input.summary-opt').forEach((cb) => { cb.checked = false; });
              syncCount();
            });
          }
          if (list) {
            list.addEventListener('change', (e) => {
              if (e.target && e.target.classList && e.target.classList.contains('summary-opt')) syncCount();
            });
          }
          syncCount();
        },
        preConfirm: () => {
          const list = document.getElementById('swSummaryList');
          if (!list) return [];
          const vals = [];
          list.querySelectorAll('input.summary-opt:checked').forEach((cb) => {
            vals.push(String(cb.value || '').trim());
          });
          return vals;
        }
      }));
      if (rs.isConfirmed) {
        summaryFilterMultiState[key] = Array.isArray(rs.value) ? rs.value : [];
        updateSummaryFilterHeaderState();
        renderSummaryTop(summaryRowsState);
        renderSummaryRows(summaryRowsState, summaryAllSubconsState);
      }
    }
    async function exportSummaryReportExcel() {
      if (!summaryRowsState.length) {
        return Swal.fire(swalTheme({ icon: 'warning', title: 'No summary data to export' }));
      }
      const month = String(document.getElementById('summaryMonthInput')?.value || document.getElementById('monthInput')?.value || '').trim();
      const detailRows = getSummaryDetailRowsForExport(summaryRowsState);
      const topRows = getSummaryTopRowsForExport(summaryRowsState);
      if (!detailRows.length && !topRows.length) {
        return Swal.fire(swalTheme({ icon: 'warning', title: 'No filtered data to export' }));
      }
      const wb = XLSX.utils.book_new();
      const wsTop = XLSX.utils.json_to_sheet(topRows);
      const wsDetail = XLSX.utils.json_to_sheet(detailRows);
      XLSX.utils.book_append_sheet(wb, wsTop, 'Summary Top');
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Summary Detail');
      const stamp = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const ts = `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}`;
      const fileMonth = (month || 'all').replace('-', '');
      XLSX.writeFile(wb, `SummaryReport_${fileMonth}_${ts}.xlsx`);
    }

    function getD365DistinctValues(key) {
      const s = new Set();
      (d365SubstockRowsState || []).forEach((r) => {
        s.add(textOrDash(r[key]));
      });
      return Array.from(s).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }));
    }

    async function openD365FilterSwal(key, label) {
      const allValues = getD365DistinctValues(key);
      const selectedNow = new Set((d365FilterMultiState[key] || []).map((v) => String(v).toLowerCase()));
      const rowsHtml = allValues.map((v, idx) => {
        const checked = selectedNow.has(String(v).toLowerCase()) ? 'checked' : '';
        return `
          <label style="display:flex; align-items:center; gap:8px; padding:4px 0;">
            <input type="checkbox" class="d365-opt" value="${String(v).replace(/"/g, '&quot;')}" ${checked} data-i="${idx}">
            <span>${String(v).replace(/</g, '&lt;')}</span>
          </label>
        `;
      }).join('');
      const rs = await Swal.fire(swalTheme({
        title: `Filter: ${label}`,
        html: `
          <div style="text-align:left; margin-top:4px;">
            <input id="swD365FilterSearch" class="swal2-input" placeholder="Search value..." style="margin:0 0 10px 0; height:40px; width:100%;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px;">
              <div id="swD365Count" style="font-size:12px; color:#64748b; font-weight:600;">0 selected</div>
              <div style="display:flex; gap:8px;">
                <button type="button" id="swD365SelAll" class="swal2-styled" style="background:#334155; margin:0; padding:8px 12px; border-radius:8px;">Select All</button>
                <button type="button" id="swD365ClrAll" class="swal2-styled" style="background:#64748b; margin:0; padding:8px 12px; border-radius:8px;">Clear</button>
              </div>
            </div>
            <div style="font-size:12px; color:#475569; font-weight:700; margin:0 0 6px 2px;">Values</div>
            <div id="swD365List" style="max-height:280px; overflow:auto; border:1px solid #e2e8f0; border-radius:10px; padding:8px 10px; background:#f8fafc;">
              ${rowsHtml || '<div style="color:#64748b;">No values</div>'}
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Apply',
        cancelButtonText: 'Cancel',
        didOpen: () => {
          const search = document.getElementById('swD365FilterSearch');
          const list = document.getElementById('swD365List');
          const btnAll = document.getElementById('swD365SelAll');
          const btnClr = document.getElementById('swD365ClrAll');
          const countEl = document.getElementById('swD365Count');
          const syncCount = () => {
            if (!list || !countEl) return;
            const n = list.querySelectorAll('input.d365-opt:checked').length;
            countEl.textContent = `${n} selected`;
          };
          if (search && list) {
            search.addEventListener('input', () => {
              const kw = String(search.value || '').trim().toLowerCase();
              list.querySelectorAll('label').forEach((lb) => {
                const txt = (lb.textContent || '').toLowerCase();
                lb.style.display = !kw || txt.includes(kw) ? 'flex' : 'none';
              });
            });
          }
          if (btnAll && list) {
            btnAll.addEventListener('click', () => {
              list.querySelectorAll('label').forEach((lb) => {
                if (lb.style.display === 'none') return;
                const cb = lb.querySelector('input.d365-opt');
                if (cb) cb.checked = true;
              });
              syncCount();
            });
          }
          if (btnClr && list) {
            btnClr.addEventListener('click', () => {
              list.querySelectorAll('input.d365-opt').forEach((cb) => { cb.checked = false; });
              syncCount();
            });
          }
          if (list) {
            list.addEventListener('change', (e) => {
              if (e.target && e.target.classList && e.target.classList.contains('d365-opt')) syncCount();
            });
          }
          syncCount();
        },
        preConfirm: () => {
          const list = document.getElementById('swD365List');
          if (!list) return [];
          const vals = [];
          list.querySelectorAll('input.d365-opt:checked').forEach((cb) => {
            vals.push(String(cb.value || '').trim());
          });
          return vals;
        }
      }));
      if (rs.isConfirmed) {
        const picked = Array.isArray(rs.value) ? rs.value : [];
        d365FilterMultiState[key] = picked;
        d365FilterState[key] = '';
        updateD365FilterHeaderState();
        renderD365SubstockRows(d365SubstockRowsState);
      }
    }

    function bindD365FilterInputs() {
      document.querySelectorAll('.d365-filter-head').forEach((th) => {
        th.addEventListener('click', () => {
          const key = th.getAttribute('data-filter-key') || '';
          const label = (th.textContent || '').trim() || key;
          if (!key) return;
          openD365FilterSwal(key, label);
        });
      });
    }
    function bindSummaryFilterInputs() {
      document.querySelectorAll('.summary-filter-head').forEach((th) => {
        th.addEventListener('click', () => {
          const key = th.getAttribute('data-filter-key') || '';
          const label = (th.textContent || '').trim() || key;
          if (!key) return;
          openSummaryFilterSwal(key, label);
        });
      });
    }

    async function loadD365Substock(month) {
      const targetMonth = String(month || '').trim();
      if (!targetMonth) {
        renderD365SubstockRows([]);
        return;
      }
      Swal.fire(swalLoading('Loading D365 Substock data...'));
      try {
        const res = await api('getD365Substock', { username: currentUser.username, month: targetMonth });
        Swal.close();
        if (!res || !res.ok) {
          renderD365SubstockRows([]);
          return Swal.fire(swalTheme({ icon: 'error', title: (res && res.message) || 'Failed to load D365 Substock data' }));
        }
        d365SubstockRowsState = res.rows || [];
        renderD365SubstockRows(d365SubstockRowsState);
      } catch (e) {
        Swal.close();
        renderD365SubstockRows([]);
        Swal.fire(swalTheme({ icon: 'error', title: 'Failed to load D365 Substock data', text: e.message }));
      }
    }

    async function uploadD365Substock() {
      const month = (document.getElementById('substockMonthInput')?.value || '').trim();
      const fileInput = document.getElementById('substockFileInput');
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;

      if (!month) {
        return Swal.fire(swalTheme({ icon: 'warning', title: 'Please select month for upload' }));
      }
      if (!file) {
        return Swal.fire(swalTheme({ icon: 'warning', title: 'Please select an Excel file' }));
      }
      const cf = await Swal.fire(swalTheme({
        icon: 'question',
        title: `Confirm upload for ${monthLabel(month)}?`,
        text: file.name,
        showCancelButton: true,
        confirmButtonText: 'Upload',
        cancelButtonText: 'Cancel'
      }));
      if (!cf.isConfirmed) return;

      Swal.fire(swalLoading('Uploading and reading file...'));
      try {
        const fileBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(fileBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const normalized = normalizeSubstockRows(jsonRows);
        if (!normalized.length) {
          Swal.close();
          return Swal.fire(swalTheme({ icon: 'warning', title: 'No valid rows found in file' }));
        }

        const saveRes = await api('saveD365Substock', {
          username: currentUser.username,
          month,
          rows: normalized
        });
        if (!saveRes || !saveRes.ok) {
          Swal.close();
          return Swal.fire(swalTheme({ icon: 'error', title: (saveRes && saveRes.message) || 'Failed to save D365 Substock data' }));
        }
        d365SubstockRowsState = normalized;
        renderD365SubstockRows(normalized);
        Swal.close();
        await Swal.fire(swalTheme({
          icon: 'success',
          title: 'Upload completed',
          text: `Saved ${Number(saveRes.count || normalized.length).toLocaleString('en-US')} rows (${monthLabel(month)})`
        }));
        await loadD365Substock(month);
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Upload failed', text: e.message }));
      }
    }

    function getAccuracyScoreText(okItem, totalItem) {
      const total = Number(totalItem || 0);
      const ok = Number(okItem || 0);
      if (total <= 0) return { text: '-', negative: false };

      const accuracy = (ok / total) * 100;
      if (accuracy >= 100) return { text: '-', negative: false };
      if (accuracy >= 90) return { text: '-1', negative: true };
      if (accuracy >= 80) return { text: '-2', negative: true };
      if (accuracy >= 70) return { text: '-3', negative: true };
      if (accuracy >= 60) return { text: '-4', negative: true };
      if (accuracy >= 50) return { text: '-5', negative: true };
      if (accuracy >= 20) return { text: '-6', negative: true };
      return { text: '-10', negative: true };
    }

    function renderSummaryTop(rows = []) {
      const body = document.getElementById('summaryTopBody');
      if (!body) return;
      const filteredRows = applySummaryFilter(rows || []);
      const allSubcons = Array.isArray(summaryAllSubconsState) ? summaryAllSubconsState : [];
      if (!filteredRows.length && !allSubcons.length) {
        body.innerHTML = '<tr><td colspan="10">No data</td></tr>';
        return;
      }

      const byPlant = {};
      const bySubcon = {};
      const grand = { d365: 0, subc: 0, totalItem: 0, okItem: 0, diffItem: 0 };

      filteredRows.forEach((r) => {
        const m = getFileNoMapEntry(r.fileNo);
        const plant = String(m.plant || '-').toUpperCase() || '-';
        const subcon = String(r.subcon || '').trim().toUpperCase() || '-';
        if (!byPlant[plant]) byPlant[plant] = { d365: 0, subc: 0, totalItem: 0, okItem: 0, diffItem: 0 };
        if (!bySubcon[subcon]) bySubcon[subcon] = { d365: 0, subc: 0, totalItem: 0, okItem: 0, diffItem: 0 };

        const d365Qty = normalizeSummaryQtyValue(r.__d365Qty);
        const subcQty = safeNum(r.confirmOk) + safeNum(r.confirmHold);
        const hasComparableD365 = hasComparableSummaryD365(r, d365Qty);
        const diffQty = hasComparableD365 ? getSummaryDisplayDiff(d365Qty, r) : null;
        const isOk = diffQty === null || diffQty === 0;

        byPlant[plant].d365 += d365Qty;
        byPlant[plant].subc += subcQty;
        byPlant[plant].totalItem += 1;
        bySubcon[subcon].d365 += d365Qty;
        bySubcon[subcon].subc += subcQty;
        bySubcon[subcon].totalItem += 1;
        grand.d365 += d365Qty;
        grand.subc += subcQty;
        grand.totalItem += 1;
        if (isOk) byPlant[plant].okItem += 1;
        if (isOk) bySubcon[subcon].okItem += 1;
        if (isOk) grand.okItem += 1;
        if (diffQty !== null && diffQty !== 0) {
          byPlant[plant].diffItem = (byPlant[plant].diffItem || 0) + 1;
          bySubcon[subcon].diffItem = (bySubcon[subcon].diffItem || 0) + 1;
          grand.diffItem += 1;
        }

      });

      const plants = ['CHP', 'G1P'];
      if (byPlant['-']) plants.push('-');
      let html = '';
      const subconOrder = allSubcons.length
        ? allSubcons.map((x) => String(x || '').trim().toUpperCase()).filter(Boolean)
        : Object.keys(bySubcon).sort();

      if (subconOrder.length) {
        html += `
          <tr class="summary-top-group" onclick="toggleSummaryTopSection('subcon')">
            <td colspan="10">
              <span id="summaryTopToggle_subcon" class="summary-top-toggle">${summaryTopCollapsedState.subcon ? '+' : '-'}</span>
              Subcon Summary
            </td>
          </tr>
        `;
        subconOrder.forEach((subcon) => {
          const s = bySubcon[subcon] || { d365: 0, subc: 0, totalItem: 0, okItem: 0, diffItem: 0 };
          const subconAccuracyOk = s.totalItem > 0 && s.okItem === s.totalItem;
          const subconAccuracyText = safePct(s.okItem, s.totalItem);
          const subconScore = getAccuracyScoreText(s.okItem, s.totalItem);
          html += `
            <tr class="subcon-row" data-summary-top-section="subcon" style="${summaryTopCollapsedState.subcon ? 'display:none;' : ''}">
              <td class="label">SUBCON: ${subcon}</td>
              <td>${formatNumOrDash(s.d365)}</td>
              <td>${formatNumOrDash(s.subc)}</td>
              <td>${safePct(s.subc, s.d365)}</td>
              <td>-</td>
              <td>${formatNumOrDash(s.totalItem)}</td>
              <td>${formatNumOrDash(s.okItem)}</td>
              <td>${formatNumOrDash(s.diffItem || 0)}</td>
              <td><span class="summary-accuracy-badge ${subconAccuracyOk ? 'ok' : 'diff'}">${subconAccuracyText}</span></td>
              <td class="summary-score ${subconScore.negative ? 'negative' : ''}">${subconScore.text}</td>
            </tr>
          `;
        });
      }

      if (plants.length) {
        html += `
          <tr class="summary-top-group" onclick="toggleSummaryTopSection('plant')">
            <td colspan="10">
              <span id="summaryTopToggle_plant" class="summary-top-toggle">${summaryTopCollapsedState.plant ? '+' : '-'}</span>
              Plant Summary
            </td>
          </tr>
        `;
        plants.forEach((plant) => {
          const p = byPlant[plant] || { d365: 0, subc: 0, totalItem: 0, okItem: 0, diffItem: 0 };
          const plantLabel = plant === '-' ? 'Unmapped Plant' : plant;
          html += `
            <tr class="plant-row" data-summary-top-section="plant" style="${summaryTopCollapsedState.plant ? 'display:none;' : ''}">
              <td class="label">${plantLabel}</td>
              <td>${formatNumOrDash(p.d365)}</td>
              <td>${formatNumOrDash(p.subc)}</td>
              <td>${safePct(p.subc, p.d365)}</td>
              <td>${plantLabel}</td>
              <td>${formatNumOrDash(p.totalItem)}</td>
              <td>${formatNumOrDash(p.okItem)}</td>
              <td>${formatNumOrDash(p.diffItem || 0)}</td>
              <td>${safePct(p.okItem, p.totalItem)}</td>
              <td class="summary-score">-</td>
            </tr>
          `;
        });
        html += `
          <tr class="grand" data-summary-top-section="plant" style="${summaryTopCollapsedState.plant ? 'display:none;' : ''}">
            <td class="label">Total</td>
            <td>${formatNumOrDash(grand.d365)}</td>
            <td>${formatNumOrDash(grand.subc)}</td>
            <td>${safePct(grand.subc, grand.d365)}</td>
            <td>-</td>
            <td>${formatNumOrDash(grand.totalItem)}</td>
            <td>${formatNumOrDash(grand.okItem)}</td>
            <td>${formatNumOrDash(grand.diffItem || 0)}</td>
            <td>${safePct(grand.okItem, grand.totalItem)}</td>
            <td class="summary-score">-</td>
          </tr>
        `;
      }

      body.innerHTML = html;
    }

    function toggleSummaryTopSection(section) {
      if (!section) return;
      summaryTopCollapsedState[section] = !summaryTopCollapsedState[section];
      document.querySelectorAll(`tr[data-summary-top-section="${section}"]`).forEach((tr) => {
        tr.style.display = summaryTopCollapsedState[section] ? 'none' : '';
      });
      const icon = document.getElementById(`summaryTopToggle_${section}`);
      if (icon) icon.textContent = summaryTopCollapsedState[section] ? '+' : '-';
    }

    async function loadSummaryReport() {
      const month = document.getElementById('monthInput').value;
      if (!month) return;
      Swal.fire(swalLoading('Loading summary report...'));
      try {
        const [res, mapRes, dashRes, d365Res, overrideRes] = await Promise.all([
          api('getReport', { month, subcon: 'ALL', role: currentUser.role, username: currentUser.username }),
          api('listFileNoMap', { username: currentUser.username }),
          api('getDashboard', { month, username: currentUser.username }),
          api('getD365Substock', { month, username: currentUser.username }),
          api('getSummaryD365QtyOverrides', { month, username: currentUser.username })
        ]);
        Swal.close();
        if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Failed to load summary report' }));
        fileNoMapState = {};
        if (mapRes && mapRes.ok) {
          (mapRes.rows || []).forEach((x) => {
            const k = String(x.fileNo || '').trim();
            if (!k) return;
            fileNoMapState[k] = { plant: x.plant || '' };
          });
        }
        summaryQtyOverrideState = {};
        summaryDirtyGroupsState = {};
        if (overrideRes && overrideRes.ok) {
          (overrideRes.rows || []).forEach((x) => {
            if (!isSummaryQtyEditable(x.fileNo)) return;
            const key = [
              String(x.subcon || '').trim().toUpperCase(),
              String(x.item || '').trim(),
              String(x.fileNo || '').trim().toUpperCase()
            ].join('||');
            if (!key) return;
            summaryQtyOverrideState[key] = normalizeSummaryQtyValue(x.d365Qty);
          });
        }
        d365SubstockRowsState = (d365Res && d365Res.ok && Array.isArray(d365Res.rows)) ? d365Res.rows : [];
        buildD365SubstockSummaryMap(d365SubstockRowsState);
        const allSubcons = (dashRes && dashRes.ok)
          ? Array.from(new Set((dashRes.statusRows || []).map(x => String(x.subcon || '').trim()).filter(Boolean)))
          : Array.from(new Set((currentUser.subconList || []).map(s => String(s || '').trim()).filter(Boolean)));
        summaryAllSubconsState = allSubcons;
        summaryRowsState = buildSummaryRows(res.rows || [], allSubcons);
        setSummaryDirtyState(false);
        updateSummaryFilterHeaderState();
        renderSummaryTop(summaryRowsState);
        renderSummaryRows(summaryRowsState, allSubcons);
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Failed to load summary report', text: e.message }));
      }
    }
    function handleSummaryD365QtyChange(input) {
      const key = String(input?.dataset?.summaryKey || '').trim();
      if (!key) return;
      const row = (summaryRowsState || []).find((x) => x.__summaryKey === key);
      if (!row) return;
      row.__d365Qty = normalizeSummaryQtyValue(input.value);
      const dirtyGroupKey = getSummaryGroupKey(row);
      if (dirtyGroupKey) summaryDirtyGroupsState[dirtyGroupKey] = true;
      setSummaryDirtyState(summaryRowsState.some((x) => normalizeSummaryQtyValue(x.__d365Qty) !== normalizeSummaryQtyValue(x.__d365QtyDefault)));
      renderSummaryTop(summaryRowsState);
      renderSummaryRows(summaryRowsState, summaryAllSubconsState);
    }
    async function saveSummaryD365QtyOverrides() {
      if (!summaryDirty) {
        return Swal.fire(swalTheme({ icon: 'warning', title: 'No changes to save' }));
      }
      if (!summaryRowsState.length) {
        return Swal.fire(swalTheme({ icon: 'warning', title: 'No summary data to save' }));
      }
      const month = String(document.getElementById('summaryMonthInput')?.value || document.getElementById('monthInput')?.value || '').trim();
      if (!month) return Swal.fire(swalTheme({ icon: 'warning', title: 'Please select a month' }));
      const validation = validateSummaryDirtyGroups(summaryRowsState);
      if (!validation.ok) {
        return Swal.fire(swalTheme({ icon: 'warning', title: validation.message }));
      }
      const rows = summaryRowsState
        .filter((r) => isSummaryQtyEditable(r.fileNo))
        .filter((r) => normalizeSummaryQtyValue(r.__d365Qty) !== normalizeSummaryQtyValue(r.__d365QtyDefault))
        .map((r) => ({
          subcon: String(r.subcon || '').trim(),
          item: String(r.item || '').trim(),
          fileNo: String(r.fileNo || '').trim(),
          d365Qty: normalizeSummaryQtyValue(r.__d365Qty)
        }));
      const cf = await Swal.fire(swalTheme({
        icon: 'question',
        title: 'Save D365 Q\'ty overrides?',
        text: `Month: ${monthLabel(month) || month}`,
        showCancelButton: true,
        confirmButtonText: 'Save',
        cancelButtonText: 'Cancel'
      }));
      if (!cf.isConfirmed) return;
      Swal.fire(swalLoading('Saving D365 Q\'ty overrides...'));
      try {
        const res = await api('saveSummaryD365QtyOverrides', {
          month,
          username: currentUser.username,
          rows
        });
        Swal.close();
        if (!res.ok) {
          return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Failed to save D365 Q\'ty overrides' }));
        }
        await Swal.fire(swalTheme({
          icon: 'success',
          title: 'D365 Q\'ty overrides saved successfully',
          text: `Saved ${Number(res.count || 0).toLocaleString('en-US')} override row(s)`
        }));
        await loadSummaryReport();
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Failed to save D365 Q\'ty overrides', text: e.message }));
      }
    }

    function renderFileNoMapRows(rows = []) {
      const body = document.getElementById('fileNoTableBody');
      if (!rows.length) {
        body.innerHTML = '<tr><td class="text-center" colspan="3">No records found</td></tr>';
        return;
      }
      body.innerHTML = rows.map((r) => `
        <tr>
          <td>${r.fileNo || ''}</td>
          <td>${r.plant || ''}</td>
          <td class="text-center">
            <button class="icon-btn edit" title="Edit" onclick="openFileNoSwal('${(r.fileNo||'').replace(/'/g, "\\'")}', '${(r.plant||'').replace(/'/g, "\\'")}')"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn del" title="Delete" onclick="deleteFileNoMap('${(r.fileNo||'').replace(/'/g, "\\'")}')"><i class="fa-regular fa-trash-can"></i></button>
          </td>
        </tr>
      `).join('');
    }

    function applyFileNoFilter() {
      const kw = String(document.getElementById('fileNoSearchInput')?.value || '').trim().toLowerCase();
      if (!kw) return renderFileNoMapRows(fileNoRowsState || []);
      const rows = (fileNoRowsState || []).filter((r) =>
        String(r.fileNo || '').toLowerCase().includes(kw)
      );
      renderFileNoMapRows(rows);
    }

    async function loadFileNoMap() {
      Swal.fire(swalLoading('Loading File No mapping...'));
      try {
        const res = await api('listFileNoMap', { username: currentUser.username });
        Swal.close();
        if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Failed to load File No mapping' }));
        fileNoRowsState = res.rows || [];
        applyFileNoFilter();
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Failed to load File No mapping', text: e.message }));
      }
    }

    async function openFileNoSwal(fileNo = '', plant = '') {
      const isEdit = !!fileNo;
      const plantVal = String(plant || '').trim().toUpperCase();
      const rs = await Swal.fire(swalTheme({
        title: isEdit ? 'Edit File No.' : 'Add File No.',
        html: `
          <div class="text-start">
            <label class="form-label fw-semibold mb-1">File No</label>
            <input id="swFileNo" class="form-control mb-2" value="${fileNo || ''}" ${isEdit ? 'disabled' : ''}>
            <label class="form-label fw-semibold mb-1">Plant</label>
            <select id="swPlant" class="form-select mb-2">
              <option value="">Select Plant</option>
              <option value="CHP" ${plantVal === 'CHP' ? 'selected' : ''}>CHP</option>
              <option value="G1P" ${plantVal === 'G1P' ? 'selected' : ''}>G1P</option>
            </select>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
          const vFileNo = (document.getElementById('swFileNo').value || '').trim();
          const vPlant = (document.getElementById('swPlant').value || '').trim().toUpperCase();
          if (!vFileNo) {
            Swal.showValidationMessage('Please enter File No');
            return false;
          }
          if (vPlant !== 'CHP' && vPlant !== 'G1P') {
            Swal.showValidationMessage('Please select Plant (CHP or G1P)');
            return false;
          }
          return { fileNo: vFileNo, plant: vPlant };
        }
      }));
      if (!rs.isConfirmed) return;

      Swal.fire(swalLoading('Saving File No mapping...'));
      try {
        const res = await api('upsertFileNoMap', Object.assign({ username: currentUser.username }, rs.value));
        Swal.close();
        if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Save failed' }));
        await Swal.fire(swalTheme({ icon: 'success', title: 'File No mapping saved successfully' }));
        loadFileNoMap();
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Save failed', text: e.message }));
      }
    }

    async function deleteFileNoMap(fileNo) {
      const cf = await Swal.fire(swalTheme({ icon: 'warning', title: `Delete mapping for ${fileNo}?`, showCancelButton: true, confirmButtonText: 'Delete', cancelButtonText: 'Cancel' }));
      if (!cf.isConfirmed) return;
      Swal.fire(swalLoading('Deleting File No mapping...'));
      try {
        const res = await api('deleteFileNoMap', { username: currentUser.username, fileNo });
        Swal.close();
        if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Delete failed' }));
        await Swal.fire(swalTheme({ icon: 'success', title: 'File No mapping deleted successfully' }));
        loadFileNoMap();
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Delete failed', text: e.message }));
      }
    }

    function bindSummaryDragScroll() {
      const wrap = document.querySelector('.summary-wrap');
      if (!wrap) return;
      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;

      wrap.addEventListener('mousedown', (e) => {
        isDown = true;
        wrap.classList.add('dragging');
        startX = e.pageX - wrap.offsetLeft;
        scrollLeft = wrap.scrollLeft;
      });
      window.addEventListener('mouseup', () => {
        isDown = false;
        wrap.classList.remove('dragging');
      });
      wrap.addEventListener('mouseleave', () => {
        isDown = false;
        wrap.classList.remove('dragging');
      });
      wrap.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - wrap.offsetLeft;
        const walk = (x - startX) * 1.2;
        wrap.scrollLeft = scrollLeft - walk;
      });
    }

    function monthKeyToShortLabel(monthKey) {
      if (!/^\d{4}-\d{2}$/.test(monthKey || '')) return monthKey || '';
      const [y, m] = monthKey.split('-');
      const idx = Number(m) - 1;
      const mm = MONTH_SHORT[idx] || m;
      return `${mm}-${y}`;
    }

    function renderDeadlineGrid() {
      const grid = document.getElementById('deadlineGrid');
      const months = buildDeadlineMonths();
      grid.innerHTML = months.map((mm, idx) => {
        const val = deadlineState[mm] || '';
        const statusClass = val ? 'has-deadline' : 'no-deadline';
        return `<div class="deadline-box ${statusClass}" onclick="openDeadlineSwal('${mm}')">
          <div class="m">${MONTH_SHORT[idx]}</div>
          <div class="d">${formatDeadlineDate(val)}</div>
        </div>`;
      }).join('');
    }

    function shiftDeadlineYear(delta) {
      const yEl = document.getElementById('deadlineYearInput');
      const y = Number(yEl.value || new Date().getFullYear());
      const next = Math.min(2100, Math.max(2020, y + Number(delta || 0)));
      yEl.value = String(next);
      renderDeadlineGrid();
    }

    async function loadDeadlines() {
      const yearInput = document.getElementById('deadlineYearInput');
      const m = document.getElementById('monthInput').value;
      const y = m && /^\d{4}-\d{2}$/.test(m) ? Number(m.split('-')[0]) : new Date().getFullYear();
      if (yearInput && !yearInput.value) yearInput.value = String(y);
      Swal.fire(swalLoading('Loading deadlines...'));
      try {
        const res = await api('listDeadlines', { username: currentUser.username });
        Swal.close();
        deadlineState = (res && res.ok && res.deadlines) ? res.deadlines : {};
        renderDeadlineGrid();
      } catch (_) {
        Swal.close();
      }
    }

    async function openDeadlineSwal(monthKey) {
      const currentVal = deadlineState[monthKey] || '';
      const [yy, mm] = (monthKey || '').split('-').map(Number);
      const defaultDate = currentVal || `${monthKey}-01`;
      const monthStart = `${monthKey}-01`;
      const monthEnd = `${monthKey}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;
      const rs = await Swal.fire(swalTheme({
        title: `Set deadline (${monthKeyToShortLabel(monthKey)})`,
        html: `
          <input id="swDeadlineDate" type="hidden" value="${currentVal}">
          <div class="deadline-modal-wrap">
            <div class="deadline-modal-note">Select the final submission date for this month.</div>
            <div id="swDeadlineCalendar"></div>
          </div>
        `,
        customClass: {
          popup: 'deadline-swal-popup',
          title: 'deadline-swal-title',
          htmlContainer: 'deadline-swal-html'
        },
        showCancelButton: false,
        showDenyButton: true,
        confirmButtonText: 'Save',
        denyButtonText: 'Clear',
        didOpen: () => {
          flatpickr('#swDeadlineCalendar', {
            inline: true,
            disableMobile: true,
            showMonths: 1,
            weekNumbers: false,
            dateFormat: 'Y-m-d',
            defaultDate: defaultDate,
            minDate: monthStart,
            maxDate: monthEnd,
            onChange: (selectedDates, dateStr) => {
              document.getElementById('swDeadlineDate').value = dateStr || '';
            }
          });
          if (!currentVal) document.getElementById('swDeadlineDate').value = '';
        },
        preConfirm: () => (document.getElementById('swDeadlineDate').value || '').trim()
      }));
      if (rs.isConfirmed) {
        deadlineState[monthKey] = rs.value || '';
        renderDeadlineGrid();
        await saveDeadlines(true);
      } else if (rs.isDenied) {
        delete deadlineState[monthKey];
        renderDeadlineGrid();
        await saveDeadlines(true);
      }
    }

    async function saveDeadlines(skipConfirm) {
      const deadlines = {};
      Object.keys(deadlineState || {}).forEach(mm => {
        const v = (deadlineState[mm] || '').trim();
        if (v) deadlines[mm] = v;
      });
      if (!skipConfirm) {
        const cf = await Swal.fire(swalTheme({ icon: 'question', title: 'Confirm saving deadlines?', showCancelButton: true, confirmButtonText: 'Save', cancelButtonText: 'Cancel' }));
        if (!cf.isConfirmed) return;
      }
      Swal.fire(swalLoading('Saving deadlines...'));
      try {
        const res = await api('saveDeadlines', { username: currentUser.username, deadlines });
        Swal.close();
        if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Save failed' }));
        await Swal.fire(swalTheme({ icon: 'success', title: 'Deadline saved successfully' }));
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Save failed', text: e.message }));
      }
    }

    function setMenu(menu) {
      const isDashboard = menu === 'dashboard';
      const isSummary = menu === 'summary';
      const isSetting = menu === 'setting';
      const isD365Substock = menu === 'd365substock';

      if (isDashboard || isSummary || isD365Substock) {
        resetMenuMonthState(menu);
      }

      document.getElementById('dashboardView').classList.toggle('hidden', !isDashboard);
      document.getElementById('searchView').classList.add('hidden');
      document.getElementById('summaryView').classList.toggle('hidden', !isSummary);
      document.getElementById('settingView').classList.toggle('hidden', !isSetting);
      document.getElementById('d365SubstockView').classList.toggle('hidden', !isD365Substock);
      document.getElementById('menuDashboard').classList.toggle('active', isDashboard);
      document.getElementById('menuSummary').classList.toggle('active', isSummary);
      document.getElementById('menuSetting').classList.toggle('active', isSetting);
      document.getElementById('menuD365Substock').classList.toggle('active', isD365Substock);
      document.getElementById('pageHeader').classList.toggle('hidden', !isDashboard);
      if (isSetting) {
        setSettingTab('user');
        loadUsers();
      }
      if (isSummary) {
        refreshSubconOptions();
        loadSummaryReport();
      }
      if (isD365Substock) {
        const m = (document.getElementById('substockMonthInput')?.value || '').trim();
        loadD365Substock(m);
      }
      if (isDashboard) loadDashboard();
    }

    function renderUsers(rows = []) {
      const body = document.getElementById('userTableBody');
      if (!rows.length) {
        body.innerHTML = '<tr><td class="text-center" colspan="4">No users found</td></tr>';
        return;
      }
      body.innerHTML = rows.map(r => `
        <tr>
          <td>${r.username || ''}</td>
          <td class="text-center">${r.role || ''}</td>
          <td>${r.subcon || ''}</td>
          <td class="text-center">
            <button class="icon-btn edit" title="Edit" onclick="openUserSwal('${(r.username||'').replace(/'/g, "\\'")}', '${(r.password||'').replace(/'/g, "\\'")}', '${(r.role||'').replace(/'/g, "\\'")}')"><i class="fa-solid fa-pen"></i></button>
            <button class="icon-btn del" title="Delete" onclick="deleteUserSetting('${(r.username||'').replace(/'/g, "\\'")}')"><i class="fa-regular fa-trash-can"></i></button>
          </td>
        </tr>
      `).join('');
    }

    function applyUserFilter() {
      const kw = String(document.getElementById('userSearchInput')?.value || '').trim().toLowerCase();
      if (!kw) return renderUsers(userRowsState || []);
      const rows = (userRowsState || []).filter((r) =>
        String(r.username || '').toLowerCase().includes(kw)
      );
      renderUsers(rows);
    }

    async function loadUsers() {
      Swal.fire(swalLoading('Loading users...'));
      try {
        const res = await api('listUsers', { username: currentUser.username });
        Swal.close();
        if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Failed to load users' }));
        userRowsState = res.rows || [];
        applyUserFilter();
      } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Failed to load users', text: e.message }));
      }
    }

    async function refreshSubconOptions() {
      const sel = document.getElementById('subconSelect');
      const prev = sel.value;
      sel.disabled = true;
      sel.innerHTML = '<option value="__LOADING__" selected>Loading subcons...</option>';
      try {
        const month = document.getElementById('monthInput').value;
        const dash = month
          ? await api('getDashboard', { month, username: currentUser.username })
          : { ok: false };

        let subcons = [];
        let statusMap = {};
        if (dash && dash.ok) {
          subcons = (dash.statusRows || []).map(x => String(x.subcon || '').trim()).filter(Boolean);
          statusMap = (dash.statusRows || []).reduce((acc, x) => {
            const key = String(x.subcon || '').trim();
            if (key) acc[key] = String(x.status || '');
            return acc;
          }, {});
        } else {
          subcons = Array.from(new Set((currentUser.subconList || []).map(s => String(s || '').trim()).filter(Boolean)));
        }
        subcons = Array.from(new Set(subcons)).sort((a, b) => a.localeCompare(b));
        sel.innerHTML = '<option value="__SELECT__" selected>Select Subcon</option>' + subcons.map(s => {
          const mark = statusMap[s] === 'submitted' ? 'Ã°Å¸Å¸Â¢' : 'Ã¢Å¡Âª';
          return `<option value="${s}">${s} ${mark}</option>`;
        }).join('');
        if (prev && prev !== '__SELECT__' && subcons.includes(prev)) sel.value = prev;
      } catch (_) {
        const fallback = Array.from(new Set((currentUser.subconList || []).map(s => String(s || '').trim()).filter(Boolean)));
        sel.innerHTML = '<option value="__SELECT__" selected>Select Subcon</option>' + fallback.map(s => `<option value="${s}">${s} Ã¢Å¡Âª</option>`).join('');
      } finally {
        sel.disabled = false;
      }
    }

    async function saveUserSetting(targetUsername, password, role, subcon) {
      if (role === 'SUBCON' && !subcon) subcon = targetUsername;
      if (!targetUsername || !password) {
        return Swal.fire(swalTheme({ icon: 'warning', title: 'Please enter username and password' }));
      }
      if (role === 'SUBCON' && !subcon) {
        return Swal.fire(swalTheme({ icon: 'warning', title: 'SUBCON must have a subcon name' }));
      }
      const cf = await Swal.fire(swalTheme({ icon: 'question', title: 'Confirm save user?', showCancelButton: true, confirmButtonText: 'Save', cancelButtonText: 'Cancel' }));
      if (!cf.isConfirmed) return;
      Swal.fire(swalLoading('Saving user...'));
      try {
        const res = await api('upsertUser', { username: currentUser.username, targetUsername, password, role, subcon });
        Swal.close();
          if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Save failed' }));
          await Swal.fire(swalTheme({ icon: 'success', title: 'User saved successfully' }));
          loadUsers();
          refreshSubconOptions();
        } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Save failed', text: e.message }));
      }
    }

    async function openUserSwal(username = '', password = '', role = 'SUBCON') {
      const isEdit = !!username;
      const html = `
        <div class="text-start">
          <label class="form-label fw-semibold mb-1">Username</label>
          <input id="swUsername" class="form-control mb-2" value="${username || ''}" ${isEdit ? 'disabled' : ''}>
          <label class="form-label fw-semibold mb-1">Password</label>
          <input id="swPassword" class="form-control mb-2" value="${password || ''}">
          <label class="form-label fw-semibold mb-1">Role</label>
          <select id="swRole" class="form-select mb-2">
            <option value="SUBCON" ${role === 'SUBCON' ? 'selected' : ''}>SUBCON</option>
            <option value="RMT" ${role === 'RMT' ? 'selected' : ''}>RMT</option>
          </select>
        </div>
      `;

      const rs = await Swal.fire(swalTheme({
        title: isEdit ? 'Edit User' : 'Add User',
        html,
        showCancelButton: true,
        confirmButtonText: 'Save',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
          const u = (document.getElementById('swUsername').value || '').trim();
          const p = (document.getElementById('swPassword').value || '').trim();
          const r = document.getElementById('swRole').value;
          if (!u || !p) {
            Swal.showValidationMessage('Please enter username and password');
            return false;
          }
          return { username: u, password: p, role: r };
        }
      }));
      if (!rs.isConfirmed) return;
      await saveUserSetting(rs.value.username, rs.value.password, rs.value.role, '');
    }

    async function deleteUserSetting(targetUsername) {
      const cf = await Swal.fire(swalTheme({ icon: 'warning', title: `Delete ${targetUsername}?`, showCancelButton: true, confirmButtonText: 'Delete', cancelButtonText: 'Cancel' }));
      if (!cf.isConfirmed) return;
      Swal.fire(swalLoading('Deleting user...'));
      try {
        const res = await api('deleteUser', { username: currentUser.username, targetUsername });
        Swal.close();
          if (!res.ok) return Swal.fire(swalTheme({ icon: 'error', title: res.message || 'Delete failed' }));
          await Swal.fire(swalTheme({ icon: 'success', title: 'User deleted successfully' }));
          loadUsers();
          refreshSubconOptions();
        } catch (e) {
        Swal.close();
        Swal.fire(swalTheme({ icon: 'error', title: 'Delete failed', text: e.message }));
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

      await Swal.fire(swalTheme({
        icon: 'success',
        title: 'Logged out successfully',
        timer: 700,
        showConfirmButton: false
      }));
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
      if (!currentUser || currentUser.role !== 'RMT') {
        window.location.href = currentUser && currentUser.role === 'SUBCON' ? 'subcon.html' : 'login.html';
        return;
      }

      document.getElementById('monthInput').value = getCurrentMonthValue();
      syncDashboardMonthInput();

      const sel = document.getElementById('subconSelect');
      sel.innerHTML = '<option value="__LOADING__" selected>Loading subcons...</option>';
      sel.disabled = true;
      document.getElementById('monthInput').addEventListener('change', async () => {
        syncDashboardMonthInput();
        syncSummaryMonthInput();
        initSubstockMonth();
        if (document.getElementById('menuD365Substock').classList.contains('active')) {
          const m = (document.getElementById('substockMonthInput')?.value || '').trim();
          if (m) await loadD365Substock(m);
        }
        updateDashboardTitle();
        const dashPromise = loadDashboard(true);
        const refreshPromise = refreshSubconOptions();
        if (sel.value && sel.value !== '__SELECT__' && sel.value !== '__LOADING__') {
          loadReport();
          loadSummaryReport();
        }
        await refreshPromise;
        await dashPromise;
      });
      document.getElementById('dashboardMonthInput').addEventListener('change', async (e) => {
        const v = (e.target.value || '').trim();
        if (!v) return;
        document.getElementById('monthInput').value = v;
        syncSummaryMonthInput();
        initSubstockMonth();
        if (document.getElementById('menuD365Substock').classList.contains('active')) {
          const m = (document.getElementById('substockMonthInput')?.value || '').trim();
          if (m) await loadD365Substock(m);
        }
        updateDashboardTitle();
        const dashPromise = loadDashboard(true);
        const refreshPromise = refreshSubconOptions();
        if (sel.value && sel.value !== '__SELECT__' && sel.value !== '__LOADING__') {
          loadReport();
          loadSummaryReport();
        }
        await refreshPromise;
        await dashPromise;
      });
      document.getElementById('deadlineYearInput').addEventListener('change', () => {
        renderDeadlineGrid();
      });
      sel.addEventListener('change', () => {
        if (sel.value && sel.value !== '__SELECT__' && sel.value !== '__LOADING__') {
          loadReport();
          loadSummaryReport();
        } else {
          renderRows([]);
          setSummaryDirtyState(false);
          renderSummaryRows([]);
        }
      });
      document.getElementById('substockMonthInput').addEventListener('change', async () => {
        const m = (document.getElementById('substockMonthInput')?.value || '').trim();
        if (!m) return renderD365SubstockRows([]);
        document.getElementById('monthInput').value = m;
        syncDashboardMonthInput();
        syncSummaryMonthInput();
        updateDashboardTitle();
        await loadD365Substock(m);
      });

      setMenu('dashboard');
      updateDashboardTitle();
      syncDashboardMonthInput();
      syncSummaryMonthInput();
      initSubstockMonth();
      refreshSubconOptions();
      bindSummaryDragScroll();
      bindD365FilterInputs();
      bindSummaryFilterInputs();
      updateD365FilterHeaderState();
      updateSummaryFilterHeaderState();
    }

    boot();
  

      document.getElementById('summaryMonthInput').addEventListener('change', async (e) => {
        const v = (e.target.value || '').trim();
        if (!v) return;
        document.getElementById('monthInput').value = v;
        syncDashboardMonthInput();
        initSubstockMonth();
        updateDashboardTitle();
        const refreshPromise = refreshSubconOptions();
        await loadSummaryReport();
        await refreshPromise;
      });
