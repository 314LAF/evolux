// ====== CSV viewer – s1/s2 fix ======
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const S1_URL = 'data/s1.csv';
  const S2_URL = 'data/s2.csv';

  // ---------- CSV parser robust (ghilimele, virgule în câmp) ----------
  function parseCSV(text) {
    const rows = [];
    let row = [], field = '';
    let i = 0, inQuotes = false;

    while (i < text.length) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          // "" -> ghilimea în câmp
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          // închidere ghilimele
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }

      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }

      field += ch; i++;
    }
    // ultimul câmp / rând
    row.push(field);
    rows.push(row);

    // elimină rânduri complet goale
    return rows.filter(r => r.some(c => String(c).trim() !== ''));
  }

  // ---------- utils ----------
  function normalizeHeaderCell(s) { return String(s || '').trim(); }
  function lc(s) { return String(s || '').trim().toLowerCase(); }

  // Creează HTML de tabel; acceptă separator "#sep"
  function renderTable(rows, { lockHeader = null } = {}) {
    if (!rows.length) return '<div class="empty">Fără date</div>';

    let header = rows[0];
    let startIdx = 1;

    // dacă avem rând de comentariu în S1 (începe cu "##") lăsăm ca rând informativ
    // pentru #sep fă o bară gri pe un rând întreg
    if (lockHeader) {
      // „header blocat”: dacă prima linie e exact headerul – îl folosim;
      // altfel randăm headerul dorit și tratăm toate rândurile ca date.
      const first = rows[0].map(normalizeHeaderCell);
      const lockLc = lockHeader.map(lc);
      if (first.length === lockHeader.length &&
          first.every((v, idx) => lc(v) === lockLc[idx])) {
        header = rows[0];
        startIdx = 1;
      } else {
        header = lockHeader;
        startIdx = 0;
      }
    } else {
      // S1: dacă primul rând e „comentariu” (începe cu "# "), îl păstrăm separat
      // dar headerul e următorul rând nenul
      if (rows[0].length === 1 && String(rows[0][0]).trim().startsWith('##')) {
        // rând informativ; îl vom afișa sub formă de „caption”
      }
    }

    const esc = s => String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');

    let html = '<table class="grid"><thead><tr>';
    header.forEach(h => html += `<th>${esc(h)}</th>`);
    html += '</tr></thead><tbody>';

    for (let r = startIdx; r < rows.length; r++) {
      const row = rows[r];

      // „#sep” pe prima coloană => separator vizual pe tot rândul
      if (row.length && String(row[0]).trim() === '#sep') {
        html += `<tr class="sep"><td colspan="${header.length}"></td></tr>`;
        continue;
      }

      html += '<tr>';
      for (let c = 0; c < header.length; c++) {
        html += `<td>${esc(row[c] ?? '')}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  // ---------- încărcare CSV (cu cache bust) ----------
  async function loadCSV(url) {
    const bust = `v=${Date.now()}`;
    const res = await fetch(`${url}?${bust}`);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return parseCSV(await res.text());
  }

  // ---------- S1 & S2 ----------
  async function loadS1() {
    try {
      const rows = await loadCSV(S1_URL);
      $('#out-s1').innerHTML = renderTable(rows, { lockHeader: null });
      $('#status-s1').textContent = '';
    } catch (e) {
      $('#out-s1').innerHTML = '';
      $('#status-s1').textContent = `Nu am putut încărca S1 (${e.message}).`;
    }
  }

  async function loadS2() {
    try {
      const rows = await loadCSV(S2_URL);
      const LOCK = ['Timestamp','Stop 1 Info','Route','Sender']; // header blocat pentru S2
      $('#out-s2').innerHTML = renderTable(rows, { lockHeader: LOCK });
      $('#status-s2').textContent = '';
    } catch (e) {
      $('#out-s2').innerHTML = '';
      $('#status-s2').textContent = `Nu am putut încărca S2 (${e.message}).`;
    }
  }

  // ---------- căutare (clasică) ----------
  const searchBox = $('#search');
  const hitCount = $('#hits');
  const prevBtn = $('#prev');
  const nextBtn = $('#next');

  let currentTable;      // <table> curent în view
  let hits = [];         // [td, ...]
  let idx = -1;

  function getActiveOut() {
    // div.view.active .out -> tabelul activ
    const active = $('.view.active .out table');
    return active || null;
  }

  function clearHilite() {
    hits.forEach(td => td.classList.remove('hit'));
    hits = []; idx = -1;
    hitCount.textContent = '0/0';
  }

  function doSearch(q) {
    currentTable = getActiveOut();
    clearHilite();
    if (!currentTable || !q.trim()) return;

    const qlc = q.toLowerCase();
    const cells = $$('tbody td', currentTable);
    for (const td of cells) {
      if (td.textContent.toLowerCase().includes(qlc)) {
        td.classList.add('hit');
        hits.push(td);
      }
    }
    if (hits.length) {
      idx = 0;
      hits[idx].scrollIntoView({behavior:'smooth', block:'center'});
      hitCount.textContent = `${idx+1}/${hits.length}`;
    } else {
      hitCount.textContent = '0/0';
    }
  }

  function step(dir) {
    if (!hits.length) return;
    idx = (idx + dir + hits.length) % hits.length;
    hits[idx].scrollIntoView({behavior:'smooth', block:'center'});
    hitCount.textContent = `${idx+1}/${hits.length}`;
  }

  searchBox.addEventListener('keydown', e => {
    if (e.key === 'Enter') { doSearch(searchBox.value); e.preventDefault(); }
    if (e.key === 'Enter' && e.shiftKey) { step(-1); e.preventDefault(); }
  });
  nextBtn.addEventListener('click', () => step(+1));
  prevBtn.addEventListener('click', () => step(-1));
  $('#clear').addEventListener('click', () => { searchBox.value=''; clearHilite(); });

  // ---------- navigație / inițializare ----------
  function show(id){
    $$('.view').forEach(v => v.classList.remove('active'));
    $(`#${id}`).classList.add('active');
    clearHilite();
    doSearch(searchBox.value);
  }

  $('#nav-s1').addEventListener('click', () => { show('s1'); });
  $('#nav-s2').addEventListener('click', () => { show('s2'); });
  $('#nav-s3').addEventListener('click', () => { show('s3'); });

  // Dark toggle simplu
  $('#theme').addEventListener('click', () => document.body.classList.toggle('dark'));

  // load + start
  (async () => {
    await Promise.all([loadS1(), loadS2()]);
    show('s1');
  })();
})();
