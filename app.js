document.addEventListener('DOMContentLoaded', () => {
  const views = {
    s1: document.getElementById('view-s1'),
    s2: document.getElementById('view-s2'),
    s3: document.getElementById('view-s3'),
  };
  const titleEl = document.getElementById('title');
  const q = document.getElementById('q');
  const countEl = document.getElementById('count');
  const nextEl = document.getElementById('next');
  const prevEl = document.getElementById('prev');
  const statusEl = document.getElementById('status');
  const themeBtn = document.getElementById('themeBtn');
  const ADMIN_PIN = '2468'; // ← schimbă-l

  let current = 's1';
  let hits = [];
  let hitIndex = -1;

  function setStatus(msg, isErr=false) {
    statusEl.textContent = msg || '';
    statusEl.style.color = isErr ? '#fca5a5' : 'var(--muted)';
  }

  /* ====== Theme ====== */
  function applyTheme(t) {
    document.body.classList.toggle('dark', t === 'dark');
    themeBtn.textContent = (t === 'dark') ? 'Light' : 'Dark';
  }
  applyTheme(localStorage.getItem('theme') || 'light');
  themeBtn.addEventListener('click', () => {
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem('theme', next); applyTheme(next);
  });

  /* ====== Router (secțiuni) ====== */
  const TITLES = {
    s1: 'Chime S1–S52',
    s2: 'Curse spre XAR1',
    s3: 'Curse intermodale',
  };
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      switchView(btn.dataset.section);
    });
  });

  function switchView(id) {
    current = id;
    titleEl.textContent = TITLES[id];
    Object.entries(views).forEach(([k, el]) => { el.hidden = (k !== id); });
    // resetă căutarea
    q.value = ''; clearHighlight();
    // dacă nu e deja încărcat, încearcă să-l (re)încarci
    if (!views[id].dataset.loaded) {
      loadSection(id);
    }
  }

  /* ====== CSV robust cu PapaParse ====== */
  async function fetchCSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    // Delimiter auto: încercăm , și ; și alegem varianta cu mai multe coloane
    const tryComma = Papa.parse(text, { delimiter: ',', skipEmptyLines: true });
    const trySemi  = Papa.parse(text, { delimiter: ';', skipEmptyLines: true });
    const rows = (trySemi.data[0]?.length > tryComma.data[0]?.length) ? trySemi.data : tryComma.data;

    // Normalizează: trim la fiecare celulă
    return rows.map(r => r.map(v => (v==null ? '' : String(v).trim())));
  }

  /* ====== Render tabel curat (cu #sep și header lock) ====== */
  function renderCleanTable(rows, lockedHeader) {
    // Caut un rând de header “credibil”
    let hdrIdx = -1;
    for (let i=0;i<rows.length;i++){
      const hasText = rows[i].some(v => String(v).trim() !== '');
      if (hasText){ hdrIdx = i; break; }
    }
    if (hdrIdx === -1) return '<div class="hint">Fișierul nu conține rânduri de text.</div>';

    const fileHeader = rows[hdrIdx];
    const header = lockedHeader ? lockedHeader : fileHeader.slice();

    // sari headerul din fișier dacă seamănă cu lockedHeader
    let body = rows.slice(hdrIdx + 1);
    if (lockedHeader) {
      const rowLower  = fileHeader.map(v => String(v).toLowerCase());
      const lockLower = lockedHeader.map(v => v.toLowerCase());
      const overlap   = lockLower.filter(x => rowLower.includes(x)).length;
      if (overlap < 2) { // probabil nu e header adevărat → nu-l sări
        body = rows.slice(hdrIdx);
      }
    }

    // construiește HTML
    const esc = s => String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    let html = '<table><thead><tr>' + header.map(h=>`<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>';

    body.forEach(r => {
      // #sep → rând separator
      const allEmpty = r.every(v => String(v).trim() === '');
      const joined   = r.map(v => String(v).trim()).join('').toLowerCase();
      if (!allEmpty && (joined === '#sep' || joined === 'sep')) {
        html += `<tr class="sep"><td colspan="${header.length}">#sep</td></tr>`;
        return;
      }

      // taie/completează la numărul de coloane din header (lock)
      const cells = lockedHeader ? (r.slice(0, header.length)) : r;
      while (lockedHeader && cells.length < header.length) cells.push('');
      if (cells.every(v => String(v).trim() === '')) return; // sărim rândurile complet goale

      html += '<tr>' + cells.map(v=>`<td>${esc(v)}`).join('</td>') + '</td></tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  /* ====== Loader per secțiune ====== */
  async function loadSection(id) {
    try {
      setStatus('Se încarcă…');
      const url = `data/${id}.csv`;
      const rows = await fetchCSV(url);

      // header lock doar pentru S2 (cerința ta)
      const locked = (id === 's2')
        ? ["Timestamp","Stop 1 Info","Route","Sender"]
        : null;

      const html = renderCleanTable(rows, locked);
      views[id].innerHTML = html;
      views[id].dataset.loaded = '1';
      setStatus('');

      // dacă aveam o căutare deja, refă highlight-ul
      if (q.value.trim()) doSearch(q.value.trim());

    } catch (err) {
      console.error(err);
      views[id].innerHTML = `<div class="hint">Nu am putut încărca ${id.toUpperCase()} (${err.message}).</div>`;
      setStatus('');
    }
  }

  /* ====== Căutare + highlight + navigare ====== */
  function clearHighlight() {
    Object.values(views).forEach(v => v.querySelectorAll('td.hit').forEach(td=>td.classList.remove('hit')));
    hits = []; hitIndex = -1; countEl.textContent = '0/0';
  }

  function doSearch(query) {
    clearHighlight();
    if (!query) return;
    const root = views[current];
    const tds = root.querySelectorAll('tbody td');
    const ql = query.toLowerCase();

    tds.forEach(td => {
      if ((td.textContent || '').toLowerCase().includes(ql)) {
        td.classList.add('hit'); hits.push(td);
      }
    });
    if (!hits.length) { countEl.textContent = '0/0'; return; }
    hitIndex = 0; scrollToHit();
  }

  function scrollToHit() {
    if (hitIndex < 0 || hitIndex >= hits.length) return;
    const node = hits[hitIndex];
    node.scrollIntoView({ behavior:'smooth', block:'center' });
    countEl.textContent = `${hitIndex+1}/${hits.length}`;
  }

  q.addEventListener('input', e => doSearch(e.target.value.trim()));
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      if (!hits.length) return;
      if (e.shiftKey) { hitIndex = (hitIndex-1+hits.length)%hits.length; }
      else { hitIndex = (hitIndex+1)%hits.length; }
      scrollToHit();
      e.preventDefault();
    }
  });
  nextEl.addEventListener('click', () => { if(hits.length){ hitIndex=(hitIndex+1)%hits.length; scrollToHit(); }});
  prevEl.addEventListener('click', () => { if(hits.length){ hitIndex=(hitIndex-1+hits.length)%hits.length; scrollToHit(); }});

  /* ====== Clear local (PIN) ====== */
  document.getElementById('clearLocal').addEventListener('click', () => {
    const pin = prompt('Introdu PIN admin pentru a șterge datele locale:');
    if (pin === ADMIN_PIN) {
      localStorage.clear();
      alert('Datele locale au fost șterse. Fă un hard refresh (Ctrl/Cmd+Shift+R) dacă vrei să reîncarci complet.');
    } else if (pin !== null) {
      alert('PIN greșit.');
    }
  });

  /* ====== Start ====== */
  switchView('s1');   // pornește pe S1
});
