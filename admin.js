/* =====================================================================
   TPS HK — score entry layer for admin.html (loaded after app.js).

   Online:  Settings → Apps Script URL + admin key. Every save is written
            straight into the Google Sheet (and logged in 9_score_log).
   Offline: no URL set (or no signal). Saves stay on this device, marked
            "unsynced", and are pushed automatically once the connection
            works. CSV export is always available as a backup.
   ===================================================================== */
(function () {
  const TPS = window.TPS, U = TPS.util, esc = U.esc;
  const LS = { settings: 'tps-hk-admin-settings', edits: 'tps-hk-admin-edits', log: 'tps-hk-admin-log' };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  let S = Object.assign({ scriptUrl: '', key: '', device: '', autoCsv: false }, lsGet(LS.settings, {}));
  let edits = lsGet(LS.edits, {});   // {matchId: {fields, prev, ts, synced, syncedAt}}
  let log = lsGet(LS.log, []);       // newest first
  let conn = { state: 'idle', msg: '' };
  let syncing = false;

  const online = () => !!(S.scriptUrl && S.key);
  const pendingIds = () => Object.keys(edits).filter(id => !edits[id].synced);
  const saveEdits = () => lsSet(LS.edits, edits);
  const addLog = e => { log.unshift(e); log = log.slice(0, 500); lsSet(LS.log, log); };
  const stamp = ts => new Date(ts).toLocaleString('en-GB', { timeZone: TPS.CONFIG.timeZone, hour12: false });

  // ------------------------------------------------------------------ data hooks
  TPS.loadRaw = async function () {
    if (S.scriptUrl) {
      const r = await fetch(S.scriptUrl + (S.scriptUrl.includes('?') ? '&' : '?') + 'action=read&_=' + Date.now(), { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'read failed');
      const raw = { __source: 'script' };
      Object.keys(TPS.TABS).forEach(k => { raw[k] = j.tabs[TPS.TABS[k]] || []; });
      // The sheet is now the truth for every save it has confirmed.
      Object.keys(edits).forEach(id => { if (edits[id].synced) delete edits[id]; });
      saveEdits();
      setConn('ok', 'Live · Google Sheet');
      return raw;
    }
    if (TPS.CONFIG.SHEET_ID) {
      const raw = await TPS.loadRawFromGviz(); raw.__source = 'sheet';
      // gviz can lag a little behind the sheet -- keep confirmed saves on top for 3 min.
      Object.keys(edits).forEach(id => { if (edits[id].synced && Date.now() - edits[id].syncedAt > 180000) delete edits[id]; });
      saveEdits();
      return raw;
    }
    return null; // -> built-in seed
  };
  TPS.getOverrides = () => { const o = {}; Object.keys(edits).forEach(id => { o[id] = edits[id].fields; }); return o; };
  TPS.decorateCard = m => (edits[m.id] && !edits[m.id].synced ? 'has-pending' : '');
  TPS.onMatchClick = openEditor;
  TPS.afterInit = () => { renderBar(); flush(); setInterval(flush, 20000); };
  TPS.afterRefresh = () => { renderBar(); };

  // ------------------------------------------------------------------ network
  async function post(body) {
    const r = await fetch(S.scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ key: S.key, source: S.device || 'admin' }, body)) });
    const j = await r.json();
    if (!j.ok) { const e = new Error(j.error || 'save failed'); e.server = true; throw e; }
    return j;
  }
  async function flush() {
    if (!online() || syncing) { renderBar(); return; }
    const ids = pendingIds(); if (!ids.length) { renderBar(); return; }
    syncing = true; renderBar();
    let okN = 0;
    for (const id of ids) {
      const e = edits[id];
      try {
        await post({ action: 'update', matchId: id, fields: e.fields, prev: e.prev });
        e.synced = true; e.syncedAt = Date.now(); okN++;
        addLog({ ts: Date.now(), id, label: e.label, fields: e.fields, result: 'synced (retry)' });
        setConn('ok', 'Live · Google Sheet');
      } catch (err) {
        setConn('err', err.server ? 'Sheet refused: ' + err.message : 'No connection — saving on this device');
        if (err.server && /key/i.test(err.message)) break;
        break;
      }
    }
    saveEdits(); syncing = false; renderBar();
    if (okN) { toast(`${okN} unsynced result${okN > 1 ? 's' : ''} sent to the sheet`); TPS.rebuild(); }
  }
  function setConn(state, msg) { conn = { state, msg }; renderBar(); }

  // ------------------------------------------------------------------ admin bar
  function renderBar() {
    const bar = document.getElementById('admBar'); if (!bar) return;
    const p = pendingIds().length;
    let dot = 'warn', text;
    if (!online()) text = TPS.CONFIG.SHEET_ID ? 'Offline mode — results saved on this device (set the Apps Script link in Settings)' : 'Offline mode — results saved on this device';
    else if (syncing) text = 'Syncing…';
    else if (conn.state === 'err') { dot = 'err'; text = conn.msg; }
    else { dot = 'ok'; text = conn.msg || 'Connected'; }
    bar.innerHTML = `<b>SCORE ENTRY</b>
      <span class="adm-state"><span class="adm-dot ${dot}"></span>${esc(text)}</span>
      ${p ? `<span class="adm-state" style="color:#ffb366">· ${p} unsynced</span>` : ''}
      <span class="spacer"></span>
      ${p && online() ? '<button class="adm-btn" id="admSync">Sync now</button>' : ''}
      <button class="adm-btn" id="admRefresh">Refresh</button>
      <button class="adm-btn" id="admSettings">Settings &amp; backup</button>
      <a class="adm-btn" href="index.html" target="_blank" rel="noopener" style="text-decoration:none">Public page ↗</a>`;
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('admSync', flush);
    on('admRefresh', async () => { await TPS.refresh(); toast('Refreshed'); });
    on('admSettings', openSettings);
  }

  let toastT;
  function toast(msg, err) {
    const el = document.getElementById('admToast'); if (!el) return;
    el.textContent = msg; el.className = 'adm-toast show' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { el.className = 'adm-toast' + (err ? ' err' : ''); }, 3200);
  }

  // ------------------------------------------------------------------ editor
  const SCORE_H = [['S1 T1', 'S1 T2', 'TB1 T1', 'TB1 T2'], ['S2 T1', 'S2 T2', 'TB2 T1', 'TB2 T2']];
  function fieldList(m) {
    const f = ['S1 T1', 'S1 T2', 'TB1 T1', 'TB1 T2'];
    if (m.sheet === 'playoff') f.push('S2 T1', 'S2 T2', 'TB2 T1', 'TB2 T2', 'STB T1', 'STB T2', 'Team 1 ID', 'Team 2 ID');
    return f.concat(['Status', 'Winner', 'Note']);
  }
  const short = side => side.team ? side.team.name : side.label;

  function openEditor(m) {
    const form = {};
    fieldList(m).forEach(h => { form[h] = U.str(m.row[h]); });
    // Walkover and "on court, no score yet" can't be derived from the score -- keep them.
    form.__status = form.Status === 'Walkover' ? 'Walkover' : (form.Status === 'In Progress' && !m.scored ? 'In Progress' : 'Auto');
    form.__winner = form.Winner === '1' || form.Winner === '2' ? form.Winner : '';

    document.getElementById('mdMatchTitle').textContent = TPS.stageLabel(m);
    document.getElementById('mdNum').textContent = '#' + m.num;
    const st = document.getElementById('mdStatus'); st.textContent = m.status; st.className = 'status-pill ' + m.status.replace(/\s+/g, '');
    document.getElementById('mdTime').textContent = `${U.dayLabel(m.date)} · ${m.start}–${m.end} · ${m.fmt.label}`;
    const body = document.getElementById('mdBody');

    const teamsOf = TPS.APP.teams.filter(t => t.category === m.category && t.tier === m.tier);
    function teamSelect(k) {
      const src = k === 1 ? m.src1 : m.src2, cur = form[`Team ${k} ID`];
      const autoName = (() => { const side = k === 1 ? m.side1 : m.side2; return !side.manual && side.team ? side.team.name : 'not decided yet'; })();
      return `<div class="adm-field"><label>Team ${k}</label><select data-f="Team ${k} ID">
        ${src ? `<option value="">Auto · ${esc(src)} → ${esc(autoName)}</option>` : `<option value="">—</option>`}
        ${teamsOf.map(t => `<option value="${esc(t.id)}" ${cur === t.id ? 'selected' : ''}>${esc(t.name)}${t.group ? ' (Grp ' + esc(t.group) + ')' : ''}</option>`).join('')}
      </select></div>`;
    }

    function stepper(h) {
      return `<span class="adm-stepper"><button type="button" data-step="${h}" data-d="-1">−</button><input type="number" inputmode="numeric" min="0" max="99" data-f="${h}" value="${esc(form[h])}"><button type="button" data-step="${h}" data-d="1">+</button></span>`;
    }
    function chips(i) {
      const g = m.fmt.games, list = [];
      for (let l = 0; l < g; l++) list.push([g, l]);
      for (let l = g - 1; l >= 0; l--) list.push([l, g]);
      return `<div class="adm-chips">${list.map(([a, b]) => `<button type="button" class="adm-chip" data-chip="${i}" data-a="${a}" data-b="${b}">${a}-${b}</button>`).join('')}</div>`;
    }
    function needsTb(i) {
      const g = m.fmt.games, a = U.num(form[SCORE_H[i][0]]), b = U.num(form[SCORE_H[i][1]]);
      return (a === g && b === g - 1) || (a === g - 1 && b === g) || U.num(form[SCORE_H[i][2]]) != null || U.num(form[SCORE_H[i][3]]) != null;
    }
    function draftMatch() {
      const o = Object.assign({}, m.row);
      fieldList(m).forEach(h => { o[h] = form[h]; });
      o.Status = form.__status === 'Auto' ? '' : form.__status;
      o.Winner = form.__winner;
      const d = Object.assign({}, m, {
        sets: [0, 1].map(i => ({ a: U.num(o[SCORE_H[i][0]]), b: U.num(o[SCORE_H[i][1]]), ta: U.num(o[SCORE_H[i][2]]), tb: U.num(o[SCORE_H[i][3]]) })),
        stb: { a: U.num(o['STB T1']), b: U.num(o['STB T2']) }, statusRaw: o.Status, winnerRaw: U.num(o.Winner),
      });
      TPS.evaluateMatch(d);
      return d;
    }
    function setsSplit() {
      const d = draftMatch(); let w1 = 0, w2 = 0;
      d.sets.forEach(s => { if (s.a != null && s.b != null && s.a !== s.b && Math.max(s.a, s.b) >= m.fmt.games) { if (s.a > s.b) w1++; else w2++; } });
      return w1 === 1 && w2 === 1;
    }

    function draw() {
      const n1 = short(m.side1), n2 = short(m.side2);
      const setBlocks = [];
      for (let i = 0; i < m.fmt.sets; i++) {
        const [a, b, ta, tb] = SCORE_H[i];
        setBlocks.push(`<div class="adm-set"><div class="adm-set-title">${m.fmt.sets > 1 ? 'Set ' + (i + 1) : 'Score'} · to ${m.fmt.games}</div>
          <div class="adm-score-row"><span class="who">${esc(n1)}</span>${stepper(a)}</div>
          <div class="adm-score-row"><span class="who">${esc(n2)}</span>${stepper(b)}</div>
          ${needsTb(i) ? `<div class="adm-tb"><div class="adm-set-title">Tie-break points (7-pt)</div>
            <div class="adm-score-row"><span class="who">${esc(n1)}</span>${stepper(ta)}</div>
            <div class="adm-score-row"><span class="who">${esc(n2)}</span>${stepper(tb)}</div></div>` : ''}
          ${chips(i)}</div>`);
      }
      if (m.fmt.stb && (setsSplit() || U.num(form['STB T1']) != null || U.num(form['STB T2']) != null)) {
        setBlocks.push(`<div class="adm-set"><div class="adm-set-title">3rd set · 10-pt tie-break</div>
          <div class="adm-score-row"><span class="who">${esc(n1)}</span>${stepper('STB T1')}</div>
          <div class="adm-score-row"><span class="who">${esc(n2)}</span>${stepper('STB T2')}</div></div>`);
      }
      const d = draftMatch();
      const winName = d.winnerSide ? (d.winnerSide === 1 ? n1 : n2) : '';
      const preview = d.status === 'Walkover' ? (winName ? `Walkover → ${winName}` : 'Walkover — pick the winner')
        : d.status === 'Completed' ? `Completed → ${winName || '?'}` : d.status === 'In Progress' ? 'In progress (score not final yet)' : 'Scheduled (no score)';
      body.innerHTML = `<div class="adm-form">
        ${m.sheet === 'playoff' ? `<div class="adm-teams">${teamSelect(1)}${teamSelect(2)}</div>` : ''}
        ${setBlocks.join('')}
        <div class="adm-row2">
          <div class="adm-field"><label>Status</label><select data-x="status">
            ${['Auto', 'Scheduled', 'In Progress', 'Completed', 'Walkover'].map(s => `<option value="${s}" ${form.__status === s ? 'selected' : ''}>${s === 'Auto' ? 'Auto (from score)' : s}</option>`).join('')}
          </select></div>
          <div class="adm-field"><label>Winner</label><select data-x="winner">
            <option value="" ${!form.__winner ? 'selected' : ''}>Auto (from score)</option>
            <option value="1" ${form.__winner === '1' ? 'selected' : ''}>${esc(n1)}</option>
            <option value="2" ${form.__winner === '2' ? 'selected' : ''}>${esc(n2)}</option>
          </select></div>
        </div>
        <div class="adm-field"><label>Note (shown on the public page)</label><input type="text" data-f="Note" value="${esc(form.Note)}" placeholder="e.g. retired injured"></div>
        <div class="adm-preview">${esc(preview)}</div>
        ${edits[m.id] && !edits[m.id].synced ? '<div class="adm-hint" style="color:#ffb366">This match has an unsynced result on this device.</div>' : ''}
        <div class="adm-actions">
          <button class="adm-btn primary" data-act="save">Save result</button>
          <button class="adm-btn danger" data-act="clear">Clear result</button>
          <button class="adm-btn" data-act="cancel">Cancel</button>
        </div>
        <div class="adm-hint">Group match = 1 set to 4 (4-3 means a tie-break was played). Semi-final = 1 set to 6. Final = best of 3 to 6, 3rd set as a 10-point tie-break. Status "Auto" sets Completed / In Progress from the score.</div>
      </div>`;
      wire();
    }
    function wire() {
      body.querySelectorAll('[data-f]').forEach(el => {
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
          form[el.dataset.f] = el.value.trim();
          if (el.type === 'number') redrawSoon(el.dataset.f); else if (el.tagName === 'SELECT') draw();
        });
      });
      body.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
        const h = b.dataset.step, v = Math.max(0, (U.num(form[h]) || 0) + Number(b.dataset.d));
        form[h] = String(v); draw();
      }));
      body.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
        const i = Number(b.dataset.chip); form[SCORE_H[i][0]] = b.dataset.a; form[SCORE_H[i][1]] = b.dataset.b;
        if (!needsTb(i)) { form[SCORE_H[i][2]] = ''; form[SCORE_H[i][3]] = ''; }
        draw();
      }));
      body.querySelector('[data-x=status]').addEventListener('change', e => { form.__status = e.target.value; draw(); });
      body.querySelector('[data-x=winner]').addEventListener('change', e => { form.__winner = e.target.value; draw(); });
      body.querySelector('[data-act=save]').addEventListener('click', save);
      body.querySelector('[data-act=clear]').addEventListener('click', e => {
        if (e.target.dataset.armed !== '1') { e.target.dataset.armed = '1'; e.target.textContent = 'Tap again to clear'; return; }
        fieldList(m).forEach(h => { if (!/^Team \d ID$/.test(h)) form[h] = ''; });
        form.__status = 'Scheduled'; form.__winner = ''; save();
      });
      body.querySelector('[data-act=cancel]').addEventListener('click', () => TPS.closePanel('matchDrawer'));
    }
    let rd;
    function redrawSoon(h) { clearTimeout(rd); rd = setTimeout(() => { draw(); const el = body.querySelector(`[data-f="${h}"]`); if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; } }, 450); }

    async function save() {
      const d = draftMatch();
      if (form.__status === 'Walkover' && !form.__winner) { toast('Walkover: pick the winner first', true); return; }
      const fields = {};
      fieldList(m).forEach(h => { fields[h] = form[h] || ''; });
      fields.Status = form.__status === 'Auto' ? d.status : form.__status;
      fields.Winner = form.__winner;
      const prev = {}; fieldList(m).forEach(h => { prev[h] = U.str(m.row[h]); });
      // Overlay is built on the sheet row as loaded, so keep the original as "prev".
      const base = edits[m.id] ? edits[m.id].prev : prev;
      const label = `#${m.num} ${TPS.stageLabel(m)} · ${short(m.side1)} v ${short(m.side2)}`;
      edits[m.id] = { fields, prev: base, ts: Date.now(), synced: false, label };
      saveEdits();
      const summary = scoreText(fields, m);
      TPS.closePanel('matchDrawer');
      TPS.rebuild(); renderBar();
      if (S.autoCsv) downloadMatchesCsv();
      if (!online()) { addLog({ ts: Date.now(), id: m.id, label, fields, result: 'saved on device' }); toast(`Saved on this device · ${summary}`); return; }
      try {
        await post({ action: 'update', matchId: m.id, fields, prev: base });
        edits[m.id].synced = true; edits[m.id].syncedAt = Date.now(); saveEdits();
        addLog({ ts: Date.now(), id: m.id, label, fields, result: 'saved to sheet' });
        setConn('ok', 'Live · Google Sheet');
        toast(`Saved to Google Sheet · ${summary}`);
      } catch (err) {
        addLog({ ts: Date.now(), id: m.id, label, fields, result: 'pending: ' + err.message });
        setConn('err', err.server ? 'Sheet refused: ' + err.message : 'No connection — saving on this device');
        toast(err.server ? `Not saved to sheet: ${err.message}` : 'No connection — kept on this device, will retry', true);
      }
      TPS.rebuild(); renderBar();
    }
    draw();
    document.getElementById('matchDrawer').classList.add('open');
    document.getElementById('matchDrawerOverlay').classList.add('open');
  }

  function scoreText(f, m) {
    const parts = [];
    for (let i = 0; i < 2; i++) {
      const [a, b, ta, tb] = SCORE_H[i];
      if (f[a] === '' && f[b] === '') continue;
      if (f[a] === undefined) continue;
      parts.push(`${f[a]}-${f[b]}${f[ta] || f[tb] ? `(${f[ta]}-${f[tb]})` : ''}`);
    }
    if (f['STB T1']) parts.push(`[${f['STB T1']}-${f['STB T2']}]`);
    return (parts.join(' ') || 'no score') + (f.Status ? ' · ' + f.Status : '');
  }

  // ------------------------------------------------------------------ CSV backup
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCsv(rows) { return rows.map(r => r.map(csvCell).join(',')).join('\n'); }
  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function fileStamp() { return new Date().toLocaleString('sv-SE', { timeZone: TPS.CONFIG.timeZone }).replace(/[: ]/g, '-').slice(0, 16); }
  function tabWithEdits(rows) {
    if (!rows || !rows.length) return [];
    const hi = rows.findIndex(r => r.some(c => U.str(c) === 'Match ID')); if (hi < 0) return rows;
    const head = rows[hi].map(U.str), idc = head.indexOf('Match ID');
    return rows.slice(hi).map((r, i) => {
      if (i === 0) return head;
      const e = edits[U.str(r[idc])]; if (!e) return r;
      const out = r.slice(); Object.keys(e.fields).forEach(h => { const c = head.indexOf(h); if (c >= 0) out[c] = e.fields[h]; }); return out;
    });
  }
  function downloadMatchesCsv() {
    const raw = TPS.lastRaw || window.TPS_SEED, st = fileStamp();
    download(`TPS_HK_2_group_matches_${st}.csv`, toCsv(tabWithEdits(raw.groups)));
    setTimeout(() => download(`TPS_HK_3_playoff_${st}.csv`, toCsv(tabWithEdits(raw.playoff))), 400);
  }
  function downloadLogCsv() {
    const rows = [['Timestamp (HK)', 'Match ID', 'Match', 'Result', 'Fields']].concat(
      log.slice().reverse().map(l => [stamp(l.ts), l.id, l.label || '', l.result, JSON.stringify(l.fields)]));
    download(`TPS_HK_score_log_${fileStamp()}.csv`, toCsv(rows));
  }

  // ------------------------------------------------------------------ settings
  function openSettings() {
    document.getElementById('drawerTitle').textContent = 'Settings & backup';
    document.getElementById('drawerSub').textContent = 'Stored only in this browser';
    const p = pendingIds();
    const body = document.getElementById('drawerBody');
    body.innerHTML = `<div class="adm-form">
      <div class="adm-field"><label>Apps Script web-app link (…/exec)</label><input type="url" id="sUrl" value="${esc(S.scriptUrl)}" placeholder="https://script.google.com/macros/s/…/exec"></div>
      <div class="adm-field"><label>Admin key</label><input type="password" id="sKey" value="${esc(S.key)}" placeholder="same as ADMIN_KEY in the script"></div>
      <div class="adm-field"><label>Device / person name (goes into the log)</label><input type="text" id="sDev" value="${esc(S.device)}" placeholder="e.g. Olga phone"></div>
      <label class="adm-hint" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sCsv" ${S.autoCsv ? 'checked' : ''}> Download a CSV backup after every save</label>
      <div class="adm-actions" style="position:static">
        <button class="adm-btn primary" id="sSave">Save settings</button>
        <button class="adm-btn" id="sTest">Test connection</button>
      </div>
      <div class="adm-hint" id="sTestOut"></div>
      <h4>Backup</h4>
      <div class="adm-actions" style="position:static">
        <button class="adm-btn" id="sCsvNow">Download match tabs (CSV)</button>
        <button class="adm-btn" id="sLogNow">Download change log (CSV)</button>
        ${p.length && online() ? `<button class="adm-btn" id="sSync">Sync ${p.length} unsynced</button>` : ''}
        <button class="adm-btn danger" id="sClear">Clear data on this device</button>
      </div>
      <div class="adm-hint">CSV tabs include every result saved on this device. To load them into the Google Sheet by hand: open the tab → File → Import → Upload → "Replace current sheet".</div>
      <h4>Change log (this device)</h4>
      <div class="adm-log">${log.length ? log.slice(0, 80).map(l => `<div class="${/pending|device/.test(l.result) ? 'pend' : ''}"><b>${esc(stamp(l.ts))}</b> · ${esc(l.label || l.id)}<br>${esc(scoreText(l.fields || {}, null))} — ${esc(l.result)}</div>`).join('') : '<div>No changes yet.</div>'}</div>
    </div>`;
    const $ = id => document.getElementById(id);
    $('sSave').onclick = () => {
      S = { scriptUrl: $('sUrl').value.trim(), key: $('sKey').value.trim(), device: $('sDev').value.trim(), autoCsv: $('sCsv').checked };
      lsSet(LS.settings, S); toast('Settings saved'); renderBar(); TPS.refresh().then(flush);
    };
    $('sTest').onclick = async () => {
      const url = $('sUrl').value.trim(), key = $('sKey').value.trim(), out = $('sTestOut');
      if (!url) { out.textContent = 'Paste the Apps Script link first.'; return; }
      out.textContent = 'Testing…';
      try {
        const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'action=ping&_=' + Date.now()); const j = await r.json();
        const r2 = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ping', key }) });
        const j2 = await r2.json();
        out.innerHTML = j.ok ? `✓ Reached sheet “${esc(j.name)}”. ${j2.ok ? '✓ Key accepted — ready to save results.' : '✗ Key rejected: ' + esc(j2.error)}` : '✗ ' + esc(j.error || 'unexpected answer');
      } catch (e) { out.textContent = '✗ Could not reach the script: ' + e.message + ' (check the link and that access is "Anyone").'; }
    };
    $('sCsvNow').onclick = downloadMatchesCsv;
    $('sLogNow').onclick = downloadLogCsv;
    if ($('sSync')) $('sSync').onclick = flush;
    $('sClear').onclick = e => {
      const n = pendingIds().length;
      if (e.target.dataset.armed !== '1') { e.target.dataset.armed = '1'; e.target.textContent = n ? `Tap again — ${n} unsynced result(s) will be lost` : 'Tap again to clear'; return; }
      edits = {}; log = []; saveEdits(); lsSet(LS.log, log); TPS.rebuild(); renderBar(); openSettings(); toast('Cleared');
    };
    document.getElementById('drawer').classList.add('open');
    document.getElementById('drawerOverlay').classList.add('open');
  }
})();
