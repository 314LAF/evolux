// Evolux – viewer CSV/TSV cu Dark Mode, search, #sep, nav collapse, Lane preview (S3)
// v53

(function () {
  // ===== helpers =====
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const setStatus = (msg, isErr=false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isErr ? '#b91c1c' : 'var(--muted)';
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&gt;','>':'&gt;','"':'&quot;'}[m]));

  // ===== Dark Mode =====
  const THEME_KEY = 'evolux-theme';
  function applyTheme(theme){
    document.body.classList.toggle('dark', theme === 'dark');
    const btn = $('themeBtn');
    if (btn) btn.textContent = document.body.classList.contains('dark') ? 'Light' : 'Dark';
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  $('themeBtn')?.addEventListener('click', ()=>{
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // ===== Nav collapse =====
  const NAV_KEY = 'evolux-nav-collapsed';
  const layout = $('appLayout');
  function applyNavCollapsed(collapsed){
    layout.classList.toggle('nav-collapsed', collapsed);
    const t = $('toggleNav');
    if (t) t.textContent = collapsed ? '☰' : '⟨';
  }
  applyNavCollapsed(localStorage.getItem(NAV_KEY)==='1');
  $('toggleNav')?.addEventListener('click', ()=>{
    const collapsed = !layout.classList.contains('nav-collapsed');
    localStorage.setItem(NAV_KEY, collapsed ? '1':'0');
    applyNavCollapsed(collapsed);
  });
  $('openNavHandle')?.addEventListener('click', ()=>{
    localStorage.setItem(NAV_KEY, '0');
    applyNavCollapsed(false);
  });

  // ===== Navigație secțiuni =====
  function show(sectionId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.querySelector(`#${sectionId}`).classList.remove('hidden');
    document.querySelectorAll('.menu .nav').forEach(b => b.classList.toggle('active', b.dataset.section===sectionId));
    runSearch(); // reaplicăm highlight
  }
  document.querySelectorAll('.menu .nav').forEach(b=>{
    b.addEventListener('click', ()=> show(b.dataset.section));
  });

  // ===== Căutare =====
  let hits = [], hitIndex = -1;
  function runSearch() {
    const q = ($('searchInput')?.value || '').trim().toLowerCase();
    const current = document.querySelector('.menu .nav.active')?.dataset.section || 's1';
    const table = document.querySelector(`#${current} .out table`);
    const counter = $('searchCount');

    hits = []; hitIndex = -1;
    if (!table) { if(counter) counter.textContent = '0/0'; return; }

    table.querySelectorAll('td.hit').forEach(td=>td.classList.remove('hit'));
    if (!q) { if(counter) counter.textContent = '0/0'; return; }

    table.querySelectorAll('tbody tr:not(.sep) td').forEach(td=>{
      const txt = (td.textContent || '').toLowerCase();
      if (txt.includes(q)) { td.classList.add('hit'); hits.push(td); }
    });

    if (counter) counter.textContent = `${hits.length ? 1 : 0}/${hits.length}`;
    if (hits.length) { hitIndex = 0; hits[0].scrollIntoView({block:'center', behavior:'smooth'}); }
  }
  function jumpHit(dir) {
    if (!hits.length) return;
    hitIndex = (hitIndex + dir + hits.length) % hits.length;
    const counter = $('searchCount');
    if (counter) counter.textContent = `${hitIndex+1}/${hits.length}`;
    hits[hitIndex].scrollIntoView({block:'center', behavior:'smooth'});
  }
  $('searchInput')?.addEventListener('input', runSearch);
  $('searchInput')?.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter') { e.preventDefault(); jumpHit(e.shiftKey ? -1 : +1); }
  });
  $('searchPrev')?.addEventListener('click', ()=> jumpHit(-1));
  $('searchNext')?.addEventListener('click', ()=> jumpHit(+1));

  // ===== Clear cache local =====
  $('clearLocal')?.addEventListener('click', ()=>{
    localStorage.clear();
    setStatus('Cache local șters. Reîncarc…');
    location.reload();
  });

  // ===== CSV/TSV loader cu suport #sep =====
  async function loadCSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);

    const text = await res.text();
    const rawLines = text.replace(/\r\n?/g, '\n').split('\n');

    const logical = [];
    for (const lineRaw of rawLines) {
      const trimmed = lineRaw.trim();
      if (!trimmed) continue;
      if (/^##/.test(trimmed)) continue;       // comentariu
      if (/^#sep\b/i.test(trimmed)) { logical.push({ sep:true }); continue; }
      logical.push(lineRaw);                    // păstrăm linia exactă pentru parser
    }
    if (!logical.length) return { headers: [], rows: [] };

    const firstDataLine = logical.find(x => typeof x === 'string');
    if (!firstDataLine) return { headers: [], rows: [] };

    const guessDelim = (s) => (s.includes('\t') && !s.includes(',')) ? '\t' : ',';
    const delim = guessDelim(firstDataLine);

    const parseLine = (line) => {
      if (delim === '\t') return line.split('\t');
      const out = []; let cur = ''; let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i+1] === '"') { cur += '"'; i++; }
          else q = !q;
        } else if (ch === ',' && !q) { out.push(cur); cur=''; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    };

    const headersRaw = parseLine(firstDataLine).map(h=>h.trim());

    const rows = [];
    let headerConsumed = false;

    const isSepCells = (cells) => {
      const first = (cells[0] || '').trim().toLowerCase();
      const restEmpty = cells.slice(1).every(c => String(c).trim() === '');
      return (first === '#sep' || first === 'sep' || /^-+$/.test(first)) && restEmpty;
    };

    for (const item of logical) {
      if (typeof item !== 'string') { rows.push('__SEP__'); continue; } // separator
      if (!headerConsumed) { headerConsumed = true; continue; }         // sar peste header
      const cells = parseLine(item);
      if (isSepCells(cells)) { rows.push('__SEP__'); continue; }
      rows.push(cells);
    }

    return { headers: headersRaw, rows };
  }

  // ===== Randare tabel generică (lock + renderers pe coloană) =====
  function renderTable(sectionId, parsed, opts={}) {
    const wrap = document.querySelector(`#${sectionId} .out`);
    if (!wrap) return;

    if (!parsed || !parsed.headers || !parsed.rows.length) {
      wrap.innerHTML = '<div class="muted p12">Nu sunt date.</div>';
      return;
    }

    const lock = opts.lockHeaders || null;
    const renderers = opts.renderers || {};

    // mapăm ordinea dacă avem lock
    let headers = parsed.headers.slice();
    let rows = parsed.rows.slice();

    if (lock && Array.isArray(lock)) {
      const idx = lock.map(h => headers.indexOf(h));
      headers = lock.slice();
      rows = rows.map(r=>{
        if (r === '__SEP__') return '__SEP__';
        return lock.map((_,i)=> idx[i] >= 0 ? (r[idx[i]] ?? '') : '');
      });
    }

    let html = '<table><thead><tr>';
    html += headers.map(h=>`<th>${esc(h)}`).join('</th>') + '</th></tr></thead><tbody>';

    rows.forEach((r, ri)=>{
      if (r === '__SEP__') { html += `<tr class="sep"><td colspan="${headers.length}"></td></tr>`; return; }
      html += '<tr>';
      r.forEach((val, ci)=>{
        const h = headers[ci];
        if (renderers[h]) {
          html += `<td>${renderers[h](val, {row:ri, col:ci, section:sectionId})}</td>`;
        } else {
          html += `<td>${esc(val)}</td>`;
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    wrap.innerHTML = html;

    // atașăm handler-ele pt. „show more” dacă există
    wrap.querySelectorAll('button.lane-more').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const tgt = wrap.querySelector('#'+btn.dataset.target);
        if (!tgt) return;
        const open = tgt.hasAttribute('hidden') ? false : true;
        if (open) { tgt.setAttribute('hidden',''); btn.textContent = btn.dataset.labelClosed; }
        else { tgt.removeAttribute('hidden'); btn.textContent = btn.dataset.labelOpen; }
      });
    });

    // re-apply search dacă există query
    if (($('searchInput')?.value || '').trim()) runSearch();
  }

  // ===== Renderer special pentru S3: Lane =====
  function renderLanePreview(value, ctx){
    const raw = String(value || '');
    // Spargem pe delimitatori „de listă” (NU pe „->”)
    const items = raw
      .split(/\n|;|\||\s\/\s| , |，/g)  // \n ; | / (spațiu slash spațiu) virgule „tari”
      .map(s=>s.trim())
      .filter(Boolean);

    if (items.length <= 1) return esc(raw);

    const first = items[0];
    const rest = items.slice(1);
    const id = `lane-${ctx.section}-${ctx.row}`;

    const full = `<div id="${id}" class="lane-full" hidden>${
      items.map(it=>`<div>${esc(it)}</div>`).join('')
    }</div>`;

    const btn = `<button class="lane-more" data-target="${id}"
                  data-label-open="ascunde" data-label-closed="+${rest.length}">
                  +${rest.length}</button>`;

    return `<span class="lane-wrap"><span class="lane-first">${esc(first)}</span>${btn}${full}</span>`;
  }

  // ===== Boot =====
  async function boot() {
    try {
      setStatus('Încarc datele…');
      const v = 53; // cache-bust pentru CSV-uri

      const [s1, s2, s3] = await Promise.all([
        loadCSV(`data/s1.csv?v=${v}`),
        loadCSV(`data/s2.csv?v=${v}`),
        loadCSV(`data/s3.csv?v=${v}`),
      ]);

      // S1 – afișăm tot
      renderTable('s1', s1);

      // S2 – lock header fix
      renderTable('s2', s2, { lockHeaders: ['Timestamp','Stop 1 Info','Route','Sender'] });

      // S3 – lock + renderer pe „Lane”
      renderTable('s3', s3, {
        lockHeaders: ['Timestamp','From','Lane'],
        renderers: { 'Lane': renderLanePreview }
      });

      show('s1');
      setStatus('Gata.');
    } catch (e) {
      console.error(e);
      setStatus('Nu am putut încărca fișierele din /data/*.csv', true);
    }
  }

  boot();
})();
