// Evolux – loader CSV/TSV + căutare cu contor + next/prev
// ------------------------------------------------------

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

  // ===== navigație simple =====
  function show(sectionId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.querySelector(`#${sectionId}`).classList.remove('hidden');
    document.querySelectorAll('.menu .nav').forEach(b => b.classList.toggle('active', b.dataset.section===sectionId));
    // Re-apply search on current view if needed
    filterAndCount();
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

    table.querySelectorAll('tbody tr').forEach(tr=>{
      tr.querySelectorAll('td').forEach(td=>{
        if ((td.textContent||'').toLowerCase().includes(q)) {
          td.classList.add('hit');
          hits.push(td);
        }
      });
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

  // ===== buton ștergere cache local (dacă am folosit cândva localStorage) =====
  on('clearLocal','click', ()=>{
    localStorage.clear();
    setStatus('Cache local șters. Reîncarc…');
    location.reload();
  });

  // ===== CSV/TSV loader =====
  async function loadCSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);

    const text = await res.text();
    const raw = text.replace(/\r\n?/g, '\n').split('\n');

    // ignoră comentarii și separatoare
    const lines = raw.filter(line => line.trim() && !/^##/.test(line) && !/^#sep\b/i.test(line));
    if (!lines.length) return { headers: [], rows: [] };

    // autodetect delimitator
    const guessDelim = (s) => (s.includes('\t') && !s.includes(',')) ? '\t' : ',';
    const delim = guessDelim(lines[0]);

    // parser tolerant pentru CSV (ghilimele) / simplu pentru TSV
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

    const headersRaw = parseLine(lines[0]).map(h=>h.trim());
    const rowsRaw = lines.slice(1).map(parseLine);

    // LOCK-urile de header (afisăm strict aceste coloane)
    const lock = {
      s1: ["Timestamp","Type","From","Cine • Ora (din A-F)","Tipar tura","Program de lucru","ACC • Sea Lanes","Rail","Bids"],
      s2: ["Timestamp","Stop 1 Info","Route","Sender"]
    };

    const isS2 = /\/s2\.csv/i.test(url);
    const locked = isS2 ? lock.s2 : lock.s1;

    // normalizează rândurile la numărul de coloane „locked”
    const rows = rowsRaw.map(r => {
      const c = r.slice(0, locked.length);
      while (c.length < locked.length) c.push('');
      return c;
    });

    return { headers: locked, rows };
  }

  function esc(s){ return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  function renderTable(section, rows, headers) {
    const host = document.querySelector(`#${section} .out`);
    if (!host) return;

    if (!rows.length) { host.innerHTML = '<div class="muted p16">Nu sunt date.</div>'; return; }

    const thead = `<thead><tr>${headers.map(h=>`<th>${esc(h)}`).join('</th>')}</th></tr></thead>`;
    const tbody = `<tbody>${
      rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}`).join('</td>')}</td></tr>`).join('')
    }</tbody>`;

    host.innerHTML = `<table>${thead}${tbody}</table>`;
  }

  async function boot() {
    try {
      setStatus('Încarc datele…');
      // crește „v” când faci un nou commit ca să spargi cache-ul
      const v = 48;
      const [s1, s2] = await Promise.all([
        loadCSV(`data/s1.csv?v=${v}`),
        loadCSV(`data/s2.csv?v=${v}`),
      ]);

      renderTable('s1', s1.rows, s1.headers);
      renderTable('s2', s2.rows, s2.headers);

      // selectează implicit S1
      show('s1');
      setStatus('Gata.');
    } catch (e) {
      console.error(e);
      setStatus('Nu am putut încărca fișierele din /data/*.csv', true);
    }
  }

  // start
  boot();
})();
