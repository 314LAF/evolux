// Evolux – loader CSV/TSV + căutare cu contor + next/prev + suport #sep
(function () {
  // ===== helpers UI =====
  const $ = (id) => document.getElementById(id);
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

  const statusEl = $('status');
  const setStatus = (msg, isErr=false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = isErr ? '#b91c1c' : 'var(--muted)';
  };

  // ===== navigație =====
  function show(sectionId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.querySelector(`#${sectionId}`).classList.remove('hidden');
    document.querySelectorAll('.menu .nav').forEach(b => b.classList.toggle('active', b.dataset.section===sectionId));
    filterAndCount(); // re-apply search pe view curent
  }
  document.querySelectorAll('.menu .nav').forEach(b=>{
    b.addEventListener('click', ()=> show(b.dataset.section));
  });

  // ===== căutare =====
  let hits = [], hitIndex = -1;

  function filterAndCount() {
    const q = ($('#searchInput')?.value || '').trim().toLowerCase();
    const current = document.querySelector('.menu .nav.active')?.dataset.section || 's1';
    const table = document.querySelector(`#${current} .out table`);
    const counter = $('searchCount');

    hits = []; hitIndex = -1;
    if (!table) { if(counter) counter.textContent = '0/0'; return; }

    table.querySelectorAll('td.hit').forEach(td=>td.classList.remove('hit'));
    if (!q) { if(counter) counter.textContent = '0/0'; return; }

    table.querySelectorAll('tbody tr:not(.sep) td').forEach(td=>{
      if ((td.textContent||'').toLowerCase().includes(q)) {
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
  on('searchInput','input', filterAndCount);
  on('searchPrev','click', ()=> jumpHit(-1));
  on('searchNext','click', ()=> jumpHit(+1));

  // ===== buton ștergere cache local =====
  on('clearLocal','click', ()=>{
    localStorage.clear();
    setStatus('Cache local șters. Reîncarc…');
    location.reload();
  });

  // ===== CSV/TSV loader (cu suport #sep) =====
  async function loadCSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);

    const text = await res.text();
    const rawLines = text.replace(/\r\n?/g, '\n').split('\n');

    // construim o listă „logică” de elemente: ori {sep:true}, ori string de linie
    const logical = [];
    for (const lineRaw of rawLines) {
      const line = lineRaw.trim();
      if (!line) continue;
      if (/^##/.test(line)) continue;           // comentarii -> ignor
      if (/^#sep\b/i.test(line)) {               // separator -> element special
        logical.push({ sep: true });
        continue;
      }
      logical.push(lineRaw);                     // păstrăm EXACT linia (nu trim) pt. parser
    }
    if (!logical.length) return { headers: [], rows: [] };

    // găsim prima linie care nu e sep (să luăm headerul)
    const firstDataLine = logical.find(x => typeof x === 'string');
    if (!firstDataLine) return { headers: [], rows: [] };

    // detectăm delim (CSV/TSV)
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

    // headerul = prima linie non-sep
    const headerLine = firstDataLine;
    const headersRaw = parseLine(headerLine).map(h=>h.trim());

    // LOCK-urile de header (ce afișăm efectiv)
    const lock = {
      s1: ["Timestamp","Type","From","Cine • Ora (din A-F)","Tipar tura","Program de lucru","ACC • Sea Lanes","Rail","Bids"],
      s2: ["Timestamp","Stop 1 Info","Route","Sender"]
    };
    const isS2 = /\/s2\.csv/i.test(url);
    const locked = isS2 ? lock.s2 : lock.s1;

    // parcurgem restul „logical” și construim rânduri + separatoare
    const rows = [];
    let headerConsumed = false;
    for (const item of logical) {
      if (typeof item !== 'string') {            // {sep:true}
        rows.push('__SEP__');
        continue;
      }
      if (!headerConsumed) {                     // sărim prima linie (headerul) o singură dată
        headerConsumed = true;
        continue;
      }
      const cols = parseLine(item);
      const c = cols.slice(0, locked.length);
      while (c.length < locked.length) c.push('');
      rows.push(c);
    }

    return { headers: locked, rows };
  }

  function esc(s){ return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  function renderTable(section, rows, headers) {
    const host = document.querySelector(`#${section} .out`);
    if (!host) return;

    if (!rows.length) { host.innerHTML = '<div class="muted p16">Nu sunt date.</div>'; return; }

    const thead = `<thead><tr>${headers.map(h=>`<th>${esc(h)}`).join('</th>')}</th></tr></thead>`;
    const bodyHtml = rows.map(r=>{
      if (r === '__SEP__') return `<tr class="sep"><td colspan="${headers.length}"></td></tr>`;
      return `<tr>${r.map(v=>`<td>${esc(v)}`).join('</td>')}</td></tr>`;
    }).join('');

    host.innerHTML = `<table>${thead}<tbody>${bodyHtml}</tbody></table>`;
  }

  async function boot() {
    try {
      setStatus('Încarc datele…');
      const v = 49; // << crește când faci noi modificări
      const [s1, s2] = await Promise.all([
        loadCSV(`data/s1.csv?v=${v}`),
        loadCSV(`data/s2.csv?v=${v}`),
      ]);
      renderTable('s1', s1.rows, s1.headers);
      renderTable('s2', s2.rows, s2.headers);
      show('s1');
      setStatus('Gata.');
    } catch (e) {
      console.error(e);
      setStatus('Nu am putut încărca fișierele din /data/*.csv', true);
    }
  }

  boot();
})();
