/* =====================================================================
   Tatler Padel Series Hong Kong — Pick & Match · shared app code
   Used by index.html (public) and admin.html (score entry).
   ===================================================================== */

// ---------------------------------------------------------------------
// CONFIG — the only thing to edit after the Google Sheet is uploaded.
// SHEET_ID = the long code in the sheet's address:
//   https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
// Empty = the site shows the built-in copy of the draw (data-seed.js).
// ---------------------------------------------------------------------
const CONFIG = {
  SHEET_ID: '1lPx9IrVK2GQhQEChZqBctcP3L5Jow-HVTFLBfOg4YFk',
  refreshMs: 30000,
  timeZone: 'Asia/Hong_Kong',
  start: new Date('2026-10-23T15:00:00+08:00'),
  end: new Date('2026-10-25T20:30:00+08:00'),
};

const TABS = {
  teams: '1_teams', groups: '2_group_matches', playoff: '3_playoff', groupRules: '4_group_stage_rules',
  qualRules: '5_qualification_rules', formats: '6_match_formats', onCourt: '7_on_court_rules', programme: '8_programme',
};
// First header of each tab -- used to check that gviz returned the right sheet
// (it silently falls back to the first tab when a sheet name doesn't exist).
const TAB_KEY = {
  teams: 'Team ID', groups: 'Match ID', playoff: 'Match ID', groupRules: 'Parameter',
  qualRules: 'Category', formats: 'Stage', onCourt: 'Parameter', programme: 'Date',
};

const CATEGORY_ORDER = ['Male', 'Female'];
const TIER_ORDER = ['Bronze', 'Silver', 'Gold'];
const CAT_LABEL = { Male: 'Men', Female: 'Women' };
const BUCKET_COLORS = {
  Male:   { Bronze: '#5c82a6', Silver: '#4fa8e0', Gold: '#3fd4e8' },
  Female: { Bronze: '#c98a72', Silver: '#d9a8c9', Gold: '#e85c8a' },
};
// Scoring per stage (from the programme): groups 1 set to 4 (TB 3-3),
// semis 1 set to 6 (TB 5-5), finals best of 3 to 6 + 10-pt match tie-break.
const STAGE_FORMAT = {
  'Group':      { sets: 1, games: 4, label: '1 set to 4 · TB at 3-3' },
  'Semi-final': { sets: 1, games: 6, label: '1 set to 6 · TB at 5-5' },
  'Final':      { sets: 2, games: 6, stb: 10, label: 'Best of 3 to 6 · 3rd set 10-pt TB' },
};

const TPS = window.TPS = {
  CONFIG, TABS, STAGE_FORMAT,
  APP: { teams: [], matches: [], programme: [], groupRules: [], qualRules: [], formats: [], onCourt: [], live: false, source: 'seed' },
  FILTERS: { category: 'All', tier: 'All' },
  RANK_STAGE: 'All', RANK_DAY: 'All', PLAYOFF_VIEW: 'bracket',
  // Hooks admin.js replaces:
  loadRaw: null,                 // async () => {teams: rows, groups: rows, ...}
  getOverrides: () => ({}),      // {matchId: {header: value}}
  onMatchClick: null,            // (match) => void
  decorateCard: null,            // (match) => extra class string
};

// ---------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------
function esc(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function num(v) { if (v === undefined || v === null || String(v).trim() === '') return null; const n = parseFloat(v); return isNaN(n) ? null : n; }
function str(v) { return v === undefined || v === null ? '' : String(v).trim(); }
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
// rows (header first) -> array of {header: value}; [] if the expected header is missing.
function rowsToObjects(rows, key) {
  if (!rows || !rows.length) return [];
  const hi = rows.findIndex(r => r && r.some(c => str(c) === key));
  if (hi === -1) return [];
  const head = rows[hi].map(str);
  return rows.slice(hi + 1).map(r => { const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i] == null ? '' : r[i]; }); return o; })
    .filter(o => str(o[head[0]]) !== '');
}
function hkNow() { return new Date(); }
function hkDateStr(d) { return d.toLocaleDateString('en-CA', { timeZone: CONFIG.timeZone }); }
function hkTimeStr(d) { return d.toLocaleTimeString('en-GB', { timeZone: CONFIG.timeZone, hour12: false }); }
function dayLabel(ds) { const d = new Date(ds + 'T12:00:00'); return isNaN(d) ? ds : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }); }
function shortDay(ds) { const d = new Date(ds + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { weekday: 'short' }); }
function normTime(t) { t = str(t); const m = t.match(/^(\d{1,2}):(\d{2})/); return m ? m[1].padStart(2, '0') + ':' + m[2] : t; }
function normDate(d) {
  d = str(d); if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // gviz may render dates as M/D/YYYY
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : d;
}
// Pick & Match theme (light, pink): deeper category colours that read on white.
const BUCKET_COLORS_PM = {
  Male:   { Bronze: '#3b6ea5', Silver: '#2b8cc4', Gold: '#0a9bad' },
  Female: { Bronze: '#c0785a', Silver: '#a8608f', Gold: '#e73887' },
};
function currentTheme() { return document.documentElement.dataset.theme === 'pm' ? 'pm' : 'tatler'; }
function bucketColor(c, t) { const map = currentTheme() === 'pm' ? BUCKET_COLORS_PM : BUCKET_COLORS; return (map[c] && map[c][t]) || '#7fa08c'; }
function setTheme(th) {
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem('tps-hk-theme', th); } catch (e) {}
  document.querySelectorAll('[data-theme-btn]').forEach(b => b.classList.toggle('active', b.dataset.themeBtn === th));
}
TPS.setTheme = setTheme;
function bcAttr(c, t) { return `--bc:${bucketColor(c, t)}`; }
function passesFilters(c, t) { const F = TPS.FILTERS; return (F.category === 'All' || c === F.category) && (F.tier === 'All' || t === F.tier); }
function catTierLabel(c, t) { return `${t} ${CAT_LABEL[c] || c}`; }
function timeSort(a, b) { return (a.date || '').localeCompare(b.date || '') || (a.start || '').localeCompare(b.start || '') || (a.num || 0) - (b.num || 0); }
TPS.util = { esc, num, str, parseCSV, rowsToObjects, hkTimeStr, dayLabel, shortDay, catTierLabel, bcAttr };

// ---------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------
function gvizUrl(tab) {
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}&_=${Date.now()}`;
}
async function loadRawFromGviz() {
  const keys = Object.keys(TABS);
  const texts = await Promise.all(keys.map(k => fetch(gvizUrl(TABS[k]), { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })));
  const raw = {}; keys.forEach((k, i) => { raw[k] = parseCSV(texts[i]); });
  return raw;
}
TPS.loadRawFromGviz = loadRawFromGviz;

async function loadData() {
  let raw = null, source = 'seed';
  try {
    if (TPS.loadRaw) { raw = await TPS.loadRaw(); source = raw && raw.__source || 'custom'; }
    else if (CONFIG.SHEET_ID) { raw = await loadRawFromGviz(); source = 'sheet'; }
  } catch (e) { console.warn('[TPS] live load failed, using built-in data', e); raw = null; }
  // A live sheet that came back without match rows is treated as a failed load.
  if (raw && !rowsToObjects(raw.groups, TAB_KEY.groups).length) raw = null;
  if (!raw) { raw = window.TPS_SEED; source = 'seed'; }
  TPS.lastRaw = raw;
  buildModel(raw);
  TPS.APP.source = source;
  TPS.APP.live = source !== 'seed';
}
TPS.loadData = loadData;

// ---------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------
function buildModel(raw) {
  const A = TPS.APP;
  const ov = TPS.getOverrides() || {};
  A.teams = rowsToObjects(raw.teams, TAB_KEY.teams).map(o => {
    const p1 = str(o['Player 1']), p2 = str(o['Player 2']);
    return { id: str(o['Team ID']), category: str(o['Category']), tier: str(o['Tier']), group: str(o['Group']),
      p1, p2, name: p2 ? `${p1} / ${p2}` : p1, status: str(o['Status']), note: str(o['Note']) };
  });
  A.teamById = {}; A.teams.forEach(t => { A.teamById[t.id] = t; });
  const toMatch = (o, sheet) => {
    if (ov[str(o['Match ID'])]) o = Object.assign({}, o, ov[str(o['Match ID'])]);
    const stage = sheet === 'groups' ? 'Group' : (str(o['Round']) || 'Final');
    return {
      sheet, row: o, id: str(o['Match ID']), num: num(o['Match #']), date: normDate(o['Date']), start: normTime(o['Start']), end: normTime(o['End']),
      category: str(o['Category']), tier: str(o['Tier']), stage, group: str(o['Group']), slot: str(o['Slot']),
      t1id: str(o['Team 1 ID']), t2id: str(o['Team 2 ID']), src1: str(o['Team 1 Source']), src2: str(o['Team 2 Source']),
      sets: [
        { a: num(o['S1 T1']), b: num(o['S1 T2']), ta: num(o['TB1 T1']), tb: num(o['TB1 T2']) },
        { a: num(o['S2 T1']), b: num(o['S2 T2']), ta: num(o['TB2 T1']), tb: num(o['TB2 T2']) },
      ],
      stb: { a: num(o['STB T1']), b: num(o['STB T2']) },
      statusRaw: str(o['Status']), winnerRaw: num(o['Winner']), note: str(o['Note']),
      fmt: STAGE_FORMAT[stage] || STAGE_FORMAT.Final,
    };
  };
  A.matches = rowsToObjects(raw.groups, TAB_KEY.groups).map(o => toMatch(o, 'groups'))
    .concat(rowsToObjects(raw.playoff, TAB_KEY.playoff).map(o => toMatch(o, 'playoff')))
    .sort(timeSort);
  A.matchById = {}; A.matches.forEach(m => { A.matchById[m.id] = m; });
  A.programme = rowsToObjects(raw.programme, TAB_KEY.programme).map(o => ({
    date: normDate(o['Date']), start: normTime(o['Start']), end: normTime(o['End']), type: str(o['Type']), title: str(o['Title']) }));
  A.groupRules = rowsToObjects(raw.groupRules, TAB_KEY.groupRules).map(o => ({ param: str(o['Parameter']), value: str(o['Value']) }));
  A.onCourt = rowsToObjects(raw.onCourt, TAB_KEY.onCourt).map(o => ({ param: str(o['Parameter']), value: str(o['Value']) }));
  A.qualRules = rowsToObjects(raw.qualRules, TAB_KEY.qualRules).map(o => ({ category: str(o['Category']), tier: str(o['Tier']), stage: str(o['Stage']), rule: str(o['Rule']) }));
  A.formats = rowsToObjects(raw.formats, TAB_KEY.formats).map(o => ({ stage: str(o['Stage']), sets: str(o['Sets']), games: str(o['Games']),
    deuce: str(o['Deuce rule']), tb: str(o['Tiebreak']), decider: str(o['Decider']), slot: str(o['Slot']) }));
  A.matches.forEach(evaluateMatch);
  resolvePlayoff();
}
TPS.buildModel = buildModel;

// Who won a set (1/2/0) and whether it's finished, for a set "to N games".
function setResult(s, games) {
  if (s.a == null || s.b == null || s.a === s.b) return { side: 0, done: false };
  const hi = Math.max(s.a, s.b);
  return { side: s.a > s.b ? 1 : 2, done: hi >= games };
}
function scoreResult(m) {
  const f = m.fmt, any = m.sets.some(s => s.a != null || s.b != null) || m.stb.a != null || m.stb.b != null;
  if (f.sets === 1) { const r = setResult(m.sets[0], f.games); return { any, side: r.done ? r.side : 0, complete: r.done }; }
  let w1 = 0, w2 = 0;
  m.sets.slice(0, 2).forEach(s => { const r = setResult(s, f.games); if (r.done) { if (r.side === 1) w1++; else w2++; } });
  if (w1 === 1 && w2 === 1 && m.stb.a != null && m.stb.b != null && m.stb.a !== m.stb.b && Math.max(m.stb.a, m.stb.b) >= (f.stb || 10)) {
    if (m.stb.a > m.stb.b) w1++; else w2++;
  }
  const side = w1 >= 2 ? 1 : w2 >= 2 ? 2 : 0;
  return { any, side, complete: side !== 0 };
}
TPS.scoreResult = scoreResult;
// Effective status: completed scores count as Completed even if nobody
// flipped the Status cell; partial scores count as In Progress.
function evaluateMatch(m) {
  const r = scoreResult(m), raw = m.statusRaw;
  m.scored = r.any;
  if (raw === 'Walkover') { m.status = 'Walkover'; m.winnerSide = m.winnerRaw === 2 ? 2 : m.winnerRaw === 1 ? 1 : 0; }
  // A complete score always decides the winner; the Winner cell only matters for
  // walkovers and matches stopped early (e.g. retired at 2-1).
  else if (r.complete) { m.status = 'Completed'; m.winnerSide = r.side; }
  else if (raw === 'Completed') { m.status = 'Completed'; m.winnerSide = m.winnerRaw || r.side; }
  else if (r.any || raw === 'In Progress') { m.status = 'In Progress'; m.winnerSide = 0; }
  else { m.status = 'Scheduled'; m.winnerSide = 0; }
  m.finished = (m.status === 'Completed' || m.status === 'Walkover') && !!m.winnerSide;
}
TPS.evaluateMatch = evaluateMatch;

// ---------------------------------------------------------------------
// Standings: matches won → head-to-head → games difference → games won.
// ---------------------------------------------------------------------
function matchGames(m, side) { let g = 0; m.sets.forEach(s => { const v = side === 1 ? s.a : s.b; if (v != null) g += v; }); return g; }
function matchTbPts(m, side) { let t = 0; m.sets.forEach(s => { const v = side === 1 ? s.ta : s.tb; if (v != null) t += v; }); const v = side === 1 ? m.stb.a : m.stb.b; return t + (v || 0); }

function computeStandings(teamList, matchList, opts) {
  opts = opts || {};
  const st = {};
  teamList.forEach(t => { st[t.id] = { team: t, id: t.id, group: t.group, p: 0, w: 0, l: 0, gf: 0, ga: 0, tbf: 0, tba: 0, withdrawn: t.status.toLowerCase() === 'withdrawn' }; });
  const done = matchList.filter(m => m.finished && m.side1.team && m.side2.team && st[m.side1.team.id] && st[m.side2.team.id]);
  done.forEach(m => {
    const a = st[m.side1.team.id], b = st[m.side2.team.id];
    const g1 = matchGames(m, 1), g2 = matchGames(m, 2), t1 = matchTbPts(m, 1), t2 = matchTbPts(m, 2);
    a.p++; b.p++; a.gf += g1; a.ga += g2; b.gf += g2; b.ga += g1; a.tbf += t1; a.tba += t2; b.tbf += t2; b.tba += t1;
    if (m.winnerSide === 1) { a.w++; b.l++; } else { b.w++; a.l++; }
  });
  let arr = Object.values(st);
  arr.forEach(s => { s.gd = s.gf - s.ga; s.h2h = 0; s.level = false; });
  arr.sort((x, y) => (x.withdrawn - y.withdrawn) || (y.w - x.w));
  if (!opts.noH2H) {
    // head-to-head within each cluster of teams level on wins
    let i = 0;
    while (i < arr.length) {
      let j = i; while (j + 1 < arr.length && arr[j + 1].w === arr[i].w && arr[j + 1].withdrawn === arr[i].withdrawn) j++;
      if (j > i) {
        const ids = new Set(arr.slice(i, j + 1).map(s => s.id));
        done.forEach(m => { if (ids.has(m.side1.team.id) && ids.has(m.side2.team.id)) st[(m.winnerSide === 1 ? m.side1 : m.side2).team.id].h2h++; });
      }
      i = j + 1;
    }
  }
  const key = s => [s.withdrawn ? 1 : 0, -s.w, -s.h2h, -s.gd, -s.gf];
  const cmp = (x, y) => { const a = key(x), b = key(y); for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return a[k] - b[k]; return 0; };
  arr.sort((x, y) => cmp(x, y) || x.team.name.localeCompare(y.team.name));
  for (let k = 0; k + 1 < arr.length; k++) if (arr[k].p && cmp(arr[k], arr[k + 1]) === 0) { arr[k].level = arr[k + 1].level = true; }
  return arr;
}
TPS.computeStandings = computeStandings;

function groupTeams(c, t, g) { return TPS.APP.teams.filter(x => x.category === c && x.tier === t && x.group === g); }
function groupMatches(c, t, g) { return TPS.APP.matches.filter(m => m.stage === 'Group' && m.category === c && m.tier === t && m.group === g); }
function groupInfo(c, t, g) {
  const ms = groupMatches(c, t, g);
  return { matches: ms, complete: ms.length > 0 && ms.every(m => m.finished), played: ms.filter(m => m.finished).length,
           table: computeStandings(groupTeams(c, t, g), ms) };
}
function groupsOf(c, t) { return Array.from(new Set(TPS.APP.teams.filter(x => x.category === c && x.tier === t && x.group).map(x => x.group))).sort(); }

// ---------------------------------------------------------------------
// Playoff sides: Team ID in the sheet wins; otherwise "Winner Group A",
// "Best runner-up", "Winner SF1" etc. resolve once the feeding results are in.
// ---------------------------------------------------------------------
function bestRunnerUp(c, t) {
  const gs = groupsOf(c, t); if (!gs.length) return null;
  const infos = gs.map(g => groupInfo(c, t, g));
  if (!infos.every(i => i.complete)) return null;
  const rus = infos.map(i => i.table[1]).filter(Boolean);
  rus.sort((x, y) => (y.w - x.w) || (y.gd - x.gd) || (y.gf - x.gf));
  return rus[0] ? rus[0].team : null;
}
function resolveSource(src, m) {
  let mm;
  if ((mm = src.match(/^Winner Group ([A-Z])$/i))) { const gi = groupInfo(m.category, m.tier, mm[1].toUpperCase()); return gi.complete && gi.table[0] ? gi.table[0].team : null; }
  if ((mm = src.match(/^Runner-up Group ([A-Z])$/i))) { const gi = groupInfo(m.category, m.tier, mm[1].toUpperCase()); return gi.complete && gi.table[1] ? gi.table[1].team : null; }
  if (/^Best runner-up$/i.test(src)) return bestRunnerUp(m.category, m.tier);
  if ((mm = src.match(/^(Winner|Loser) (SF\d)$/i))) {
    const sf = TPS.APP.matches.find(x => x.stage === 'Semi-final' && x.category === m.category && x.tier === m.tier && x.slot.toUpperCase() === mm[2].toUpperCase());
    if (!sf || !sf.finished) return null;
    const win = sf.winnerSide === 1 ? sf.side1 : sf.side2, lose = sf.winnerSide === 1 ? sf.side2 : sf.side1;
    return (mm[1].toLowerCase() === 'winner' ? win : lose).team;
  }
  return TPS.APP.teamById[src] || null;
}
function makeSide(id, src, m) {
  const A = TPS.APP;
  if (id) return { team: A.teamById[id] || null, label: A.teamById[id] ? A.teamById[id].name : id, manual: true };
  const team = src ? resolveSource(src, m) : null;
  return { team, label: team ? team.name : (src || 'TBD'), src, manual: false };
}
function resolvePlayoff() {
  const A = TPS.APP;
  A.matches.filter(m => m.stage === 'Group').forEach(m => { m.side1 = makeSide(m.t1id, '', m); m.side2 = makeSide(m.t2id, '', m); });
  ['Semi-final', 'Final'].forEach(stage => {
    A.matches.filter(m => m.stage === stage).forEach(m => {
      m.side1 = makeSide(m.t1id, m.src1, m); m.side2 = makeSide(m.t2id, m.src2, m);
      evaluateMatch(m);
    });
    if (stage === 'Semi-final') applyRunnerUpSwap();
  });
}
// Bronze Women rule: if the best runner-up comes from the group whose winner it
// would meet in SF1, swap it with the other SF's second slot (no group rematch).
function applyRunnerUpSwap() {
  const A = TPS.APP;
  A.matches.filter(m => m.stage === 'Semi-final').forEach(m => {
    [1, 2].forEach(k => {
      const me = k === 1 ? m.side1 : m.side2, opp = k === 1 ? m.side2 : m.side1;
      if (me.manual || !/^Best runner-up$/i.test(me.src || '') || !me.team) return;
      const g = (opp.src || '').match(/^Winner Group ([A-Z])$/i);
      if (!g || me.team.group !== g[1].toUpperCase()) return;
      const other = A.matches.find(x => x !== m && x.stage === 'Semi-final' && x.category === m.category && x.tier === m.tier);
      if (!other || other.side2.manual) return;
      const tmp = other.side2;
      other.side2 = Object.assign({}, me, { swapped: true });
      if (k === 1) m.side1 = Object.assign({}, tmp, { swapped: true }); else m.side2 = Object.assign({}, tmp, { swapped: true });
    });
  });
}

// ---------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------
function sideLines(side) {
  if (!side.team) return `<span class="tbd">${esc(side.label)}</span>`;
  const t = side.team, tbc = s => /^tbc$/i.test(s) ? ' class="tbc"' : '';
  return `<span${tbc(t.p1)}>${esc(t.p1)}</span>${t.p2 ? `<span${tbc(t.p2)}>${esc(t.p2)}</span>` : ''}`;
}
function scoreCells(m, side) {
  const out = [];
  m.sets.forEach(s => {
    if (s.a == null && s.b == null) return;
    const v = side === 1 ? s.a : s.b, tb = side === 1 ? s.ta : s.tb;
    out.push(`<span class="sb-set">${v != null ? v : '-'}${tb != null ? `<sup class="sb-tb">${tb}</sup>` : ''}</span>`);
  });
  if (m.stb.a != null || m.stb.b != null) { const v = side === 1 ? m.stb.a : m.stb.b; out.push(`<span class="sb-set sb-stb"><small>TB</small>${v != null ? v : '-'}</span>`); }
  return out.join('');
}
function stageLabel(m) {
  if (m.stage === 'Group') return `${catTierLabel(m.category, m.tier)} · Group ${m.group}`;
  if (m.stage === 'Semi-final') return `${catTierLabel(m.category, m.tier)} · Semi-final ${m.slot.replace(/\D/g, '')}`;
  return `${catTierLabel(m.category, m.tier)} · Final`;
}
TPS.stageLabel = stageLabel;
function statusLabel(m) {
  if (m.status === 'In Progress') return m.scored ? 'On court' : 'On court';
  if (m.status === 'Walkover') return 'WO';
  if (m.id === TPS.APP.nextId) return 'Up next';
  return m.status === 'Scheduled' ? '' : m.status;
}
function matchCardHtml(m, opts) {
  opts = opts || {};
  const live = m.status === 'In Progress', done = m.finished;
  const sc = m.status === 'Walkover' ? '' : m.id === TPS.APP.nextId && !live ? 'Next' : m.status.replace(/\s+/g, '');
  const lbl = statusLabel(m);
  const w1 = done && m.winnerSide === 1, w2 = done && m.winnerSide === 2;
  const extra = TPS.decorateCard ? TPS.decorateCard(m) : '';
  // One court: the start time is the headline of the card. End times are not shown anywhere.
  const timeHtml = `<span class="match-start">${opts.noDate ? '' : `<small>${esc(shortDay(m.date))}</small>`}${esc(m.start)}</span>`;
  const wo = m.status === 'Walkover';
  return `
    <div class="match-card ${live ? 'live' : ''} ${done ? 'completed' : ''} ${m.id === TPS.APP.nextId && !live ? 'next' : ''} ${extra}" data-mid="${esc(m.id)}" style="${bcAttr(m.category, m.tier)}">
      <div class="match-card-top">
        <span class="match-num">#${m.num}</span>
        <span class="match-tag">${esc(stageLabel(m))}</span>
        <span class="card-right">${lbl ? `<span class="status-pill ${wo ? 'Walkover' : sc}">${esc(lbl)}</span>` : ''}${timeHtml}</span>
      </div>
      <div class="scoreboard">
        <div class="sb-row ${w1 ? 'winner' : done ? 'loser' : ''}"><div class="sb-names">${sideLines(m.side1)}</div><div class="sb-sets">${wo ? (w1 ? '<span class="sb-set">WO</span>' : '') : scoreCells(m, 1)}</div></div>
        <div class="sb-row ${w2 ? 'winner' : done ? 'loser' : ''}"><div class="sb-names">${sideLines(m.side2)}</div><div class="sb-sets">${wo ? (w2 ? '<span class="sb-set">WO</span>' : '') : scoreCells(m, 2)}</div></div>
      </div>
    </div>`;
}
TPS.matchCardHtml = matchCardHtml;

// ---------------------------------------------------------------------
// Status note (countdown / live clock / complete)
// ---------------------------------------------------------------------
let clockTimer = null;
function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), p = n => String(n).padStart(2, '0');
  return (d ? d + 'd ' : '') + p(Math.floor(s % 86400 / 3600)) + ':' + p(Math.floor(s % 3600 / 60)) + ':' + p(s % 60);
}
function renderDataNote() {
  const el = document.getElementById('dataNote'); if (!el) return;
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  const A = TPS.APP;
  const allDone = A.matches.length && A.matches.every(m => m.finished);
  const now = hkNow();
  const srcNote = A.live ? '' : '<span class="data-note-detail"> &middot; offline copy of the draw</span>';
  if (allDone || now > CONFIG.end) {
    el.className = 'data-note complete';
    el.innerHTML = `<span class="dot"></span> <b>${allDone ? 'COMPLETE' : 'FINISHED'}</b><span class="data-note-detail"> &middot; ${A.matches.filter(m => m.finished).length} of ${A.matches.length} matches played</span>`;
  } else if (now < CONFIG.start) {
    el.className = 'data-note';
    el.innerHTML = `<span class="dot"></span> Starts in <b id="liveClock">${fmtCountdown(CONFIG.start - now)}</b><span class="data-note-detail"> &middot; Fri 23 Oct 2026, 15:00 (Hong Kong)</span>${srcNote}`;
    clockTimer = setInterval(() => { const n = hkNow(); if (n >= CONFIG.start) return renderDataNote(); const c = document.getElementById('liveClock'); if (c) c.textContent = fmtCountdown(CONFIG.start - n); }, 1000);
  } else {
    const played = A.matches.filter(m => m.finished).length;
    el.className = 'data-note live';
    el.innerHTML = `<span class="dot"></span> <b>LIVE</b> <span id="liveClock">${hkTimeStr(now)}</span><span class="data-note-detail"> &middot; HK time &middot; ${played} of ${A.matches.length} matches played</span>${srcNote}`;
    clockTimer = setInterval(() => { const n = hkNow(); if (n > CONFIG.end) return renderDataNote(); const c = document.getElementById('liveClock'); if (c) c.textContent = hkTimeStr(n); }, 1000);
  }
}

// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------
function tierBuckets() {
  const seen = new Map();
  TPS.APP.teams.forEach(t => {
    const k = t.category + '|' + t.tier;
    if (!seen.has(k)) seen.set(k, { category: t.category, tier: t.tier, teams: [], groups: new Set() });
    const b = seen.get(k); b.teams.push(t); if (t.group) b.groups.add(t.group);
  });
  return Array.from(seen.values()).sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
}
function noGroupNote(b) {
  const ms = TPS.APP.matches.filter(m => m.category === b.category && m.tier === b.tier);
  const hasSF = ms.some(m => m.stage === 'Semi-final');
  return hasSF ? 'No group stage &mdash; straight to the <b>semi-finals</b> on Sunday morning.'
               : 'Two pairs &mdash; a straight <b>best-of-3 final</b> on Sunday afternoon.';
}

// Champions
function renderChampions() {
  const wrap = document.getElementById('championsContent');
  const cats = CATEGORY_ORDER.filter(c => TPS.FILTERS.category === 'All' || TPS.FILTERS.category === c);
  const tiers = TIER_ORDER.slice().reverse().filter(t => TPS.FILTERS.tier === 'All' || TPS.FILTERS.tier === t);
  if (!cats.length || !tiers.length) { wrap.innerHTML = '<div class="empty-state">No results for this selection.</div>'; return; }
  const plate = (tag, team, cls, pending) => team
    ? `<div class="rank-plate ${cls} clickable" data-team="${esc(team.id)}"><span class="rank-tag">${tag}</span><span class="rank-name">${esc(team.name)}</span></div>`
    : `<div class="rank-plate ${cls}"><span class="rank-tag">${tag}</span><span class="rank-name pending">${esc(pending)}</span></div>`;
  const card = (c, t) => {
    const f = TPS.APP.matches.find(m => m.category === c && m.tier === t && m.stage === 'Final');
    if (!f) return '<div></div>';
    let champ = null, ru = null;
    if (f.finished) { champ = (f.winnerSide === 1 ? f.side1 : f.side2).team; ru = (f.winnerSide === 1 ? f.side2 : f.side1).team; }
    const pend = f.status === 'In Progress' ? 'Final on court now' : `Final · ${shortDay(f.date)} ${f.start}`;
    return `<div class="champ-card" data-tier="${t.toLowerCase()}">${plate('Champion', champ, 'win', pend)}${plate('Runner-up', ru, 'run', pend)}</div>`;
  };
  const head = cats.map(c => `<div class="col-header ${c.toLowerCase()}">${CAT_LABEL[c]}</div>`).join('');
  const rows = tiers.map(t => `<div class="tier-header" data-tier="${t.toLowerCase()}">${t}</div>` + cats.map(c => card(c, t)).join('')).join('');
  wrap.innerHTML = `<div class="podium" style="grid-template-columns:repeat(${cats.length},1fr)">${head}${rows}</div>`;
  wrap.querySelectorAll('[data-team]').forEach(el => el.addEventListener('click', () => openTeamDrawer(el.dataset.team)));
}

// Groups
function renderGroups() {
  const wrap = document.getElementById('groupsGrid');
  const f = (document.getElementById('groupSearch').value || '').trim().toLowerCase();
  const cards = [];
  tierBuckets().forEach(b => {
    if (!passesFilters(b.category, b.tier)) return;
    if (!b.groups.size) {
      if (f && !b.teams.some(t => t.name.toLowerCase().includes(f))) return;
      cards.push(`<div class="group-card notice-card" style="${bcAttr(b.category, b.tier)}">
        <div class="group-card-head"><span>${esc(catTierLabel(b.category, b.tier))}</span><span class="tier-tag">${b.teams.length} pairs</span></div>
        <div class="notice-body"><p>${noGroupNote(b)}</p>${b.teams.map(t => `<p class="notice-sub clickable-team" data-team="${esc(t.id)}" style="cursor:pointer">· ${esc(t.name)}</p>`).join('')}</div></div>`);
      return;
    }
    Array.from(b.groups).sort().forEach(g => {
      const gi = groupInfo(b.category, b.tier, g);
      let rows = gi.table;
      if (f) { rows = rows.filter(s => s.team.name.toLowerCase().includes(f)); if (!rows.length) return; }
      const full = rows.length === gi.table.length;
      cards.push(`<div class="group-card" style="${bcAttr(b.category, b.tier)}">
        <div class="group-card-head"><span>${esc(catTierLabel(b.category, b.tier))} &middot; Group ${esc(g)}</span><span class="tier-tag">${gi.played}/${gi.matches.length} played</span></div>
        <table class="standings">
          <tr><th class="team-col">Pair</th><th>P</th><th>W</th><th>L</th><th>Games</th><th>GD</th></tr>
          ${rows.map((s, i) => `<tr class="clickable ${s.withdrawn ? 'withdrawn-row' : ''} ${full && i === 0 && s.p ? 'rank-1' : ''}" data-team="${esc(s.id)}">
            <td class="team-col"><div class="rank-team-cell"><span class="rank-badge">${i + 1}</span><span class="rank-team-names"><span class="rank-team-line">${esc(s.team.p1)}</span><span class="rank-team-line">${esc(s.team.p2)}</span></span>${s.withdrawn ? '<span class="withdrawn-badge">Withdrew</span>' : ''}${s.level ? '<span class="level-mark" title="Level on every criterion — decided by draw">=</span>' : ''}</div></td>
            <td>${s.p}</td><td>${s.w}</td><td>${s.l}</td><td>${s.gf}-${s.ga}</td><td>${s.gd > 0 ? '+' : ''}${s.gd}</td></tr>`).join('')}
        </table>
        ${gi.complete && gi.table[0] ? `<div class="group-foot">Group winner: <b>${esc(gi.table[0].team.name)}</b></div>` : ''}
      </div>`);
    });
  });
  wrap.innerHTML = cards.join('') || '<div class="empty-state">No groups match your filters.</div>';
  wrap.querySelectorAll('[data-team]').forEach(el => el.addEventListener('click', () => openTeamDrawer(el.dataset.team)));
}

// Schedule (single court: one timeline per day, programme events in between)
function renderSchedule() {
  const wrap = document.getElementById('scheduleList');
  const f = (document.getElementById('matchSearch').value || '').trim().toLowerCase();
  const A = TPS.APP, F = TPS.FILTERS;
  const showEvents = F.category === 'All' && F.tier === 'All' && !f;
  const items = [];
  A.matches.forEach(m => {
    if (!passesFilters(m.category, m.tier)) return;
    if (f && !(String(m.num) === f.replace('#', '') || (m.side1.label + ' ' + m.side2.label + ' ' + stageLabel(m)).toLowerCase().includes(f))) return;
    items.push({ kind: 'match', date: m.date, start: m.start, end: m.end, m });
  });
  if (showEvents) A.programme.filter(p => p.type !== 'Buffer').forEach(p => items.push({ kind: 'event', date: p.date, start: p.start, end: p.end, p }));
  if (!items.length) { wrap.innerHTML = '<div class="empty-state">No matches found.</div>'; return; }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || (a.kind === 'event' ? 1 : -1));
  const byDate = {}; items.forEach(it => { (byDate[it.date] = byDate[it.date] || []).push(it); });
  const today = hkDateStr(hkNow());
  wrap.innerHTML = Object.keys(byDate).sort().map(d => {
    const list = byDate[d], ms = list.filter(i => i.kind === 'match').map(i => i.m);
    const allDone = ms.length && ms.every(m => m.finished);
    const open = !(allDone && d !== today);
    const first = list[0].start;
    const rows = list.map(it => {
      if (it.kind === 'event') {
        const p = it.p;
        return `<div class="tl-event ${esc(p.type)}"><span class="ev-time">${esc(p.start)}</span><span class="ev-type">${esc(p.type)}</span><span>${esc(p.title)}</span></div>`;
      }
      return matchCardHtml(it.m, { noDate: true });
    }).join('');
    return `<details class="day-section"${open ? ' open' : ''}><summary class="day-title">${esc(dayLabel(d))}<span class="day-meta">from ${esc(first)} · ${ms.length} match${ms.length === 1 ? '' : 'es'}${allDone ? ' · done' : ''}</span></summary><div class="tl">${rows}</div></details>`;
  }).join('');
}

// Playoff
function renderPlayoff() {
  const wrap = document.getElementById('playoffContent');
  const A = TPS.APP;
  const ms = A.matches.filter(m => m.stage !== 'Group' && passesFilters(m.category, m.tier));
  if (!ms.length) { wrap.innerHTML = '<div class="empty-state">No playoff matches for this selection.</div>'; return; }
  if (TPS.PLAYOFF_VIEW === 'chrono') {
    const byDate = {}; ms.forEach(m => { (byDate[m.date] = byDate[m.date] || []).push(m); });
    wrap.innerHTML = Object.keys(byDate).sort().map(d => `<div class="day-section"><div class="day-title">${esc(dayLabel(d))}</div><div class="match-list">${byDate[d].sort(timeSort).map(m => matchCardHtml(m)).join('')}</div></div>`).join('');
    return;
  }
  wrap.innerHTML = tierBuckets().filter(b => passesFilters(b.category, b.tier)).map(b => {
    const bm = ms.filter(m => m.category === b.category && m.tier === b.tier);
    if (!bm.length) return '';
    const sfs = bm.filter(m => m.stage === 'Semi-final').sort((a, c) => a.slot.localeCompare(c.slot));
    const fin = bm.filter(m => m.stage === 'Final');
    const col = (title, list) => `<div><div class="bracket-round-title">${title}</div><div class="bracket-cards">${list.map(m => matchCardHtml(m)).join('')}</div></div>`;
    return `<div class="playoff-bucket" style="${bcAttr(b.category, b.tier)}">
      <div class="playoff-bucket-title">${esc(catTierLabel(b.category, b.tier))}</div>
      <div class="round-columns ${sfs.length ? '' : 'single'}">${sfs.length ? col('Semi-finals', sfs) : ''}${col('Final', fin)}</div></div>`;
  }).join('');
}

// Rankings
function renderRankings() {
  const wrap = document.getElementById('rankingList');
  const f = (document.getElementById('rankingSearch').value || '').trim().toLowerCase();
  const A = TPS.APP;
  const out = tierBuckets().filter(b => passesFilters(b.category, b.tier)).map(b => {
    let ms = A.matches.filter(m => m.category === b.category && m.tier === b.tier);
    if (TPS.RANK_STAGE === 'Group') ms = ms.filter(m => m.stage === 'Group');
    if (TPS.RANK_STAGE === 'Playoff') ms = ms.filter(m => m.stage !== 'Group');
    if (TPS.RANK_DAY !== 'All') ms = ms.filter(m => m.date === TPS.RANK_DAY);
    let rows = computeStandings(b.teams, ms, { noH2H: true });
    if (f) { rows = rows.filter(s => s.team.name.toLowerCase().includes(f)); if (!rows.length) return ''; }
    return `<div class="ranking-section" style="${bcAttr(b.category, b.tier)}">
      <div class="ranking-section-title">${esc(catTierLabel(b.category, b.tier))}</div>
      <div class="ranking-table-wrap"><table class="standings">
        <tr><th class="team-col">Pair</th><th>Grp</th><th>P</th><th>W</th><th>L</th><th>Games</th><th>GD</th></tr>
        ${rows.map((s, i) => `<tr class="clickable ${i === 0 && s.w ? 'rank-1' : ''}" data-team="${esc(s.id)}">
          <td class="team-col"><div class="rank-team-cell"><span class="rank-badge">${i + 1}</span><span class="rank-team-names"><span class="rank-team-line">${esc(s.team.p1)}</span><span class="rank-team-line">${esc(s.team.p2)}</span></span></div></td>
          <td>${esc(s.group || '–')}</td><td>${s.p}</td><td>${s.w}</td><td>${s.l}</td><td>${s.gf}-${s.ga}</td><td>${s.gd > 0 ? '+' : ''}${s.gd}</td></tr>`).join('')}
      </table></div></div>`;
  }).join('');
  wrap.innerHTML = out || '<div class="empty-state">No standings for this selection.</div>';
  wrap.querySelectorAll('[data-team]').forEach(el => el.addEventListener('click', () => openTeamDrawer(el.dataset.team)));
}

// Format
function renderFormat() {
  const A = TPS.APP, wrap = document.getElementById('formatContent');
  const facts = rows => rows.filter(r => r.value).map(r => `<p><b>${esc(r.param)}:</b> ${esc(r.value)}</p>`).join('') || '<p class="notice-sub">Not available yet.</p>';
  const deuces = new Set(A.formats.map(s => s.deuce).filter(Boolean)), common = deuces.size === 1 ? [...deuces][0] : null;
  const fmtTable = A.formats.length ? `
    ${common ? `<div class="panel-note" style="margin-bottom:10px;">Every match: <b>${esc(common)}</b>.</div>` : ''}
    <div class="ranking-table-wrap"><table class="standings fmt-standings">
      <tr><th class="team-col">Stage</th><th>Format</th><th>Tiebreak</th><th>Decider</th></tr>
      ${A.formats.map(s => `<tr><td class="team-col">${esc(s.stage)}${s.slot ? `<br><span class="notice-sub">${esc(s.slot)} slot</span>` : ''}</td><td>${esc(s.sets)} ${esc(s.games)}${common ? '' : ' · ' + esc(s.deuce)}</td><td>${esc(s.tb)}</td><td>${esc(s.decider)}</td></tr>`).join('')}
    </table></div>` : '<div class="empty-state">Not available yet.</div>';
  const byB = {};
  A.qualRules.forEach(q => { const k = q.category + '|' + q.tier; (byB[k] = byB[k] || { category: q.category, tier: q.tier, rules: [] }).rules.push(q); });
  const qual = Object.values(byB).filter(b => passesFilters(b.category, b.tier))
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .map(b => `<div class="group-card notice-card" style="${bcAttr(b.category, b.tier)}">
      <div class="group-card-head"><span>${esc(catTierLabel(b.category, b.tier))}</span><span class="tier-tag">${A.teams.filter(t => t.category === b.category && t.tier === b.tier).length} pairs</span></div>
      <div class="notice-body">${b.rules.map(r => `<p><span class="q-stage">${esc(r.stage)}</span><br>${esc(r.rule)}</p>`).join('')}</div></div>`).join('');
  wrap.innerHTML = `
    <div class="day-section"><div class="day-title">Categories &amp; draw</div><div class="groups-grid">${qual || '<div class="empty-state">No categories match your filters.</div>'}</div></div>
    <div class="day-section"><div class="day-title">Match formats</div>${fmtTable}</div>
    <div class="day-section"><div class="day-title">Group stage</div><div class="group-card notice-card"><div class="notice-body">${facts(A.groupRules)}</div></div></div>
    <div class="day-section"><div class="day-title">On court</div><div class="group-card notice-card"><div class="notice-body">${facts(A.onCourt)}</div></div></div>
    <div class="panel-note" style="font-style:italic;">Format may be subject to minor changes in case of unforeseen circumstances.</div>`;
}

// ---------------------------------------------------------------------
// Drawers
// ---------------------------------------------------------------------
function openTeamDrawer(teamId) {
  const A = TPS.APP, t = A.teamById[teamId]; if (!t) return;
  const ms = A.matches.filter(m => (m.side1.team && m.side1.team.id === t.id) || (m.side2.team && m.side2.team.id === t.id));
  document.getElementById('drawerTitle').textContent = t.name;
  document.getElementById('drawerSub').textContent = catTierLabel(t.category, t.tier) + (t.group ? ' · Group ' + t.group : '');
  const g = ms.filter(m => m.stage === 'Group'), p = ms.filter(m => m.stage !== 'Group');
  document.getElementById('drawerBody').innerHTML =
    (g.length ? `<h4>Group matches</h4><div class="match-list">${g.map(m => matchCardHtml(m)).join('')}</div>` : '') +
    (p.length ? `<h4>Playoff</h4><div class="match-list">${p.map(m => matchCardHtml(m)).join('')}</div>` : '') +
    (!ms.length ? '<div class="empty-state">No confirmed matches yet.</div>' : '') +
    (t.group ? '' : '<p class="notice-sub" style="margin-top:12px">Further matches appear here once their opponents are known.</p>');
  openPanel('drawer');
}
function openMatchDrawer(m) {
  document.getElementById('mdMatchTitle').textContent = stageLabel(m);
  document.getElementById('mdNum').textContent = '#' + m.num;
  const st = document.getElementById('mdStatus');
  st.textContent = statusLabel(m) || m.status; st.className = 'status-pill ' + m.status.replace(/\s+/g, '');
  document.getElementById('mdTime').textContent = `${dayLabel(m.date)} · ${m.start} · ${m.fmt.label}`;
  const w1 = m.finished && m.winnerSide === 1, w2 = m.finished && m.winnerSide === 2;
  const swapNote = (m.side1.swapped || m.side2.swapped) ? '<div class="md-note">Best runner-up came from the same group as its SF opponent &mdash; semi-final pairings swapped (no group rematch).</div>' : '';
  document.getElementById('mdBody').innerHTML = `
    <div class="scoreboard mm-scoreboard">
      <div class="sb-row ${w1 ? 'winner' : ''}"><div class="sb-names">${sideLines(m.side1)}</div><div class="sb-sets">${scoreCells(m, 1)}</div></div>
      <div class="sb-row ${w2 ? 'winner' : ''}"><div class="sb-names">${sideLines(m.side2)}</div><div class="sb-sets">${scoreCells(m, 2)}</div></div>
    </div>
    ${m.status === 'Walkover' ? '<p class="mm-bye-label" style="text-align:center">Decided by walkover</p>' : ''}
    ${swapNote}${m.note ? `<div class="md-note" style="margin-top:10px">${esc(m.note)}</div>` : ''}`;
  openPanel('matchDrawer');
}
TPS.openMatchDrawer = openMatchDrawer;
TPS.openTeamDrawer = openTeamDrawer;
function openPanel(id) { document.getElementById(id).classList.add('open'); document.getElementById(id + 'Overlay').classList.add('open'); }
function closePanel(id) { document.getElementById(id).classList.remove('open'); document.getElementById(id + 'Overlay').classList.remove('open'); }
TPS.closePanel = closePanel;

// ---------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------
function computeNext() {
  const A = TPS.APP;
  const live = A.matches.find(m => m.status === 'In Progress');
  const started = A.matches.some(m => m.finished || m.status === 'In Progress') || hkNow() >= CONFIG.start;
  const nxt = started ? A.matches.find(m => m.status === 'Scheduled' && (!live || timeSort(m, live) > 0)) : null;
  A.nextId = nxt ? nxt.id : null;
}
function renderAll() {
  computeNext();
  renderDataNote();
  renderChampions(); renderGroups(); renderSchedule(); renderPlayoff(); renderRankings(); renderFormat();
}
TPS.renderAll = renderAll;
function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => { const on = p.id === 'panel-' + tab; p.classList.remove('active'); if (on) { void p.offsetWidth; p.classList.add('active'); } });
  try { localStorage.setItem('tps-hk-tab', tab); } catch (e) {}
}
let userPickedView = false;
function setView(v) {
  document.body.classList.toggle('view-mobile', v === 'mobile');
  document.body.classList.toggle('view-web', v === 'web');
  document.querySelectorAll('.view-toggle button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
}
function pills(containerSel, attr, apply) {
  document.querySelectorAll(containerSel + ' .pill-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll(containerSel + ' .pill-btn').forEach(x => x.classList.toggle('active', x === b));
    apply(b.dataset[attr]);
  }));
}

async function refresh() { await loadData(); renderAll(); if (TPS.afterRefresh) TPS.afterRefresh(); }
// Re-apply overrides to the last loaded data without a network round trip.
TPS.rebuild = () => { buildModel(TPS.lastRaw || window.TPS_SEED); renderAll(); };
TPS.refresh = refresh;

async function init() {
  setTheme(currentTheme());
  document.querySelectorAll('[data-theme-btn]').forEach(b => b.addEventListener('click', () => { setTheme(b.dataset.themeBtn); renderAll(); }));
  await loadData();
  renderAll();
  document.getElementById('groupSearch').addEventListener('input', renderGroups);
  document.getElementById('matchSearch').addEventListener('input', renderSchedule);
  document.getElementById('rankingSearch').addEventListener('input', renderRankings);
  document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('.view-toggle button[data-view]').forEach(b => b.addEventListener('click', () => { userPickedView = true; setView(b.dataset.view); }));
  pills('#categoryFilter', 'catf', v => { TPS.FILTERS.category = v; renderAll(); });
  pills('#tierFilter', 'tierf', v => { TPS.FILTERS.tier = v; renderAll(); });
  pills('#playoffViewToggle', 'playoffview', v => { TPS.PLAYOFF_VIEW = v; renderPlayoff(); });
  pills('#rankStageFilter', 'stagef', v => { TPS.RANK_STAGE = v; renderRankings(); });
  pills('#rankDayFilter', 'dayf', v => { TPS.RANK_DAY = v; renderRankings(); });
  ['drawer', 'matchDrawer'].forEach(id => {
    document.getElementById(id + 'Close').addEventListener('click', () => closePanel(id));
    document.getElementById(id + 'Overlay').addEventListener('click', () => closePanel(id));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closePanel('matchDrawer'); closePanel('drawer'); } });
  document.addEventListener('click', e => {
    const card = e.target.closest('.match-card[data-mid]'); if (!card) return;
    const m = TPS.APP.matchById[card.dataset.mid]; if (!m) return;
    (TPS.onMatchClick || openMatchDrawer)(m);
  });
  const auto = () => { if (!userPickedView) setView(window.innerWidth < 760 ? 'mobile' : 'web'); };
  auto(); let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(auto, 150); });
  let saved = null; try { saved = localStorage.getItem('tps-hk-tab'); } catch (e) {}
  if (saved && document.getElementById('panel-' + saved)) showTab(saved);
  if (CONFIG.SHEET_ID || TPS.loadRaw) setInterval(() => { if (!document.hidden) refresh(); }, CONFIG.refreshMs);
  if (TPS.afterInit) TPS.afterInit();
}
TPS.init = init;
document.addEventListener('DOMContentLoaded', init);
