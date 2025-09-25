// Evolux – CSV/TSV viewer cu Dark Mode, #sep, căutare, nav collapse
// v52

(function () {
  // ===== helpers =====
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const setStatus = (msg, isErr=false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isErr ? '#b91c1c' : 'var(--muted)';
  };

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
    runSearch(); // re-apply search
  }
  document.querySelectorAll('.menu .nav').forEach(b=>{
    b.addEventListener('click', ()=> show(b.dataset.section));
  });

  // ===== Căutare (fix: contor + enter/shift+enter + highlight) =====
  let hits = [], hitIndex = -1;
  function runSearch() {
    const q = ($('searchInput')?.value || '').trim().toLowerCase();
    const current = document.querySelector('.menu .nav.active')?.dataset.section || 's1';
    const table = document.querySelector(`#${current} .out table`);
    const counter = $('searchCount');

    hits = []; hitIndex = -1;
    if (!table) { if(counter) counter.textContent = '0/0'; return; }

    // curățăm highlight vechi
    table.querySelectorAll('td.hit').forEach(td=>td.classList.remove('hit'));
    if (!q) { if(counter) counter.textContent = '0/0'; return; }

    // marcăm potrivirile
    table.querySelectorAll('tbody tr:not(.sep) td').forEach(td=>{
      const txt = (td.textContent || '').toLowerCase();
      if (txt.includes(q)) {
        td.classList.add('hit');
        hits.push(td);
      }
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
    if (e.key === 'Enter') {
      e.preventDefault();
      jumpHit(e.shiftKey ? -1 : +1);
    }
  });
  $('searchPrev')?.addEventListener('click', ()=> jumpHit(-1));
  $('searchNext')?.addEventListener('click', ()=> jumpHit(+1));

  // ===== Buton ștergere cache local (opțional) =====
  $('clearLocal')?.addEventListener('click', ()=>{
    localStorage.clear();
    setStatus('Cache local șters. Reîncarc…');
    location.reload();
  });

  // ===== CSV/TSV loader (cu #sep) =====
  async function loadCSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);

    const text = await res.text();
    const rawLines = text.replace(/\r\n?/g, '\n').split('\n');

    // listă logică: {sep:true} sau linie brută
    const logical = [];
    for (const lineRaw of rawLines) {
      const trimmed = lineRaw.trim();
      if (!trimmed) continue;
      if (/^##/.test(trimmed)) continue;       // comentariu
      if (/^#sep\b/i.test(trimmed)) { logical.push({ sep:true }); continue; }
      logical.push(lineRaw);                    // păstrăm linia exactă pt parser
    }
    if (!logical.length) return { headers: [], rows: [] };

    // prima linie non-sep = header
    const firstDataLine = logical.find(x => typeof x === 'string');
    if (!firstDataLine) return { headers: [], rows: [] };

    // detectăm delimitator (CSV/TSV)
    const guessDelim = (s) => (s.includes('\t') && !s.includes(',')) ? '\t' : ',';
    const delim = guessDelim(firstDataLine);

    // parser tolerant CSV (ghilimele) / simplu TSV
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

    // parcurgem restul și construim rândurile
    const rows = [];
    let headerConsumed = false;

    // recunoaște linii separator exprimate și ca "sep / ---" în prima coloană
    const isSepCells = (cells) => {
      const first = (cells[0] || '').trim().toLowerCase();
      const restEmpty = cells.slice(1).every(c => String(c).trim() === '');
      return (first === '#sep' || first === 'sep' || /^-+$/.test(first)) && restEmpty;
    };

    for (const item of logical) {
      if (typeof item !== 'string') { rows.push('__SEP__'); continue; } // separator brut
      if (!headerConsumed) { headerConsumed = true; continue; }         // skip header
      const cells = parseLine(item);
      if (isSepCells(cells)) { rows.push('__SEP__'); continue; }
      rows.push(cells);
    }

    return { headers: headersRaw, rows };
  }

  function esc(s){ return String(s ?? '').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&gt;','>':'&gt;','"':'&quot;'}[m])); }

  function renderTable(sectionId, parsed, lockHeaders=null) {
    const wrap = document.querySelector(`#${sectionId} .out`);
    if (!wrap) return;

    if (!parsed || !parsed.headers || !parsed.rows.length) {
      wrap.innerHTML = '<div class="muted p12">Nu sunt date.</div>';
      return;
    }

    // dacă avem lock (S2), mapăm coloanele în ordinea dorită
    let headers = parsed.headers.slice();
    let rows = parsed.rows.slice();

    if (lockHeaders && Array.isArray(lockHeaders)) {
      const idx = lockHeaders.map(h => headers.indexOf(h));
      headers = lockHeaders.slice();
      rows = rows.map(r=>{
        if (r === '__SEP__') return '__SEP__';
        const out = lockHeaders.map((_,i)=> idx[i] >= 0 ? (r[idx[i]] ?? '') : '');
        return out;
      });
    }

    let html = '<table><thead><tr>';
    html += headers.map(h=>`<th>${esc(h)}`).join('</th>') + '</th></tr></thead><tbody>';

    html += rows.map(r=>{
      if (r === '__SEP__') return `<tr class="sep"><td colspan="${headers.length}"></td></tr>`;
      return `<tr>${r.map(v=>`<td>${esc(v)}`).join('</td>') }</td></tr>`;
    }).join('');

    html += '</tbody></table>';
    wrap.innerHTML = html;

    // re-apply search dacă e cazul
    if (($('searchInput')?.value || '').trim()) runSearch();
  }

  async function boot() {
    try {
      setStatus('Încarc datele…');
      const v = 52; // cache-bust pentru CSV-uri

      // Încarcă S1 și S2
      const [s1, s2] = await Promise.all([
        loadCSV(`data/s1.csv?v=${v}`), // S1: afișăm TOT ce vine
        loadCSV(`data/s2.csv?v=${v}`), // S2: header lock pe 4 coloane
      ]);

      renderTable('s1', s1, null);
      renderTable('s2', s2, ['Timestamp','Stop 1 Info','Route','Sender']);

      // pornește pe S1
      show('s1');
      setStatus('Gata.');
    } catch (e) {
      console.error(e);
      setStatus('Nu am putut încărca fișierele din /data/*.csv', true);
    }
  }

  // Start
  boot();
})();
