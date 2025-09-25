// app.js  — v45

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const resCount = document.getElementById('resCount');
  const prevBtn = document.getElementById('prevHit');
  const nextBtn = document.getElementById('nextHit');
  const clearBtn = document.getElementById('clearSearch');
  const statusEl = document.getElementById('status');
  const wipeBtn = document.getElementById('wipeBtn');

  const sections = [
    { id: 's1', title: 'Chime S1–S52', url: 'data/s1.csv', headerLock: null }, // S1: citire CSV obișnuit
    { id: 's2', title: 'Curse spre XAR1', url: 'data/s2.csv', headerLock: ['Timestamp','Stop 1 Info','Route','Sender'] },
    { id: 's3', title: 'Curse intermodale', url: 'data/s3.csv', headerLock: null },
  ];

  const state = {
    tables: { s1:null, s2:null, s3:null },
    hits: [],
    hitIndex: 0,
    lastQuery: ''
  };

  function setStatus(msg, isErr=false){
    statusEl.textContent = msg || '';
    statusEl.style.color = isErr ? '#b91c1c' : 'var(--muted)';
  }

  // ---------- CSV/TSV utilitare ----------
  // split CSV respectând ghilimelele (pentru separatorul ",")
  function splitCSVRespectingQuotes(line, sep=","){
    if (sep === '\t') return line.split('\t'); // TSV e simplu
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"'){
        if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      }else if (ch === sep && !inQ){
        out.push(cur); cur = '';
      }else{
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function detectDelimiter(text){
    // ne uităm la primele linii semnificative
    const lines = text.split(/\r?\n/).slice(0, 5).filter(l => l.trim() !== '' && !l.startsWith('##'));
    if (lines.length === 0) return ',';
    const tsvScore = lines.reduce((a,l)=> a + (l.match(/\t/g)?.length||0), 0);
    const csvScore = lines.reduce((a,l)=> a + (l.match(/,/g)?.length||0), 0);
    return tsvScore > csvScore ? '\t' : ','; // dacă sunt TAB-uri mai multe, tratăm ca TSV
  }

  // returnează {headers, rows} unde rows = array de array (sau null pentru #sep)
  function parseDelimited(text){
    const sep = detectDelimiter(text);
    const lines = text.split(/\r?\n/).filter(l => l !== '');
    let headers = null;
    const rows = [];

    for (let raw of lines){
      if (raw.startsWith('##')) continue;   // comentarii
      if (raw.trim() === '#sep'){ rows.push(null); continue; } // separator vizual

      if (!headers){
        headers = splitCSVRespectingQuotes(raw, sep).map(h => h.trim().replace(/^"|"$/g,''));
        continue;
      }
      const cells = splitCSVRespectingQuotes(raw, sep).map(c => c.replace(/^"|"$/g,''));
      rows.push(cells);
    }
    return { headers, rows };
  }

  function lockHeaders(parsed, lock){
    if (!lock) return parsed;   // nimic de făcut
    const outRows = [];

    // hartă: luam indexul fiecărui header dorit, dacă nu există => coloană goală
    const idx = lock.map(h => parsed.headers.indexOf(h));
    for (const r of parsed.rows){
      if (r === null){ outRows.push(null); continue; } // #sep
      const row = lock.map((_,i) => idx[i] >= 0 ? (r[idx[i]] ?? '') : '');
      outRows.push(row);
    }
    return { headers: lock, rows: outRows };
  }

  // ---------- randare tabel ----------
  function esc(s){ return String(s ?? '').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  function renderTable(sectionId, parsed){
    const wrap = document.getElementById(`out-${sectionId}`);
    if (!parsed || !parsed.headers) { wrap.innerHTML = '<div class="empty">Nu s-au găsit date.</div>'; return; }

    let html = '<table class="grid"><thead><tr>';
    html += parsed.headers.map(h=>`<th>${esc(h)}</th>`).join('');
    html += '</tr></thead><tbody>';

    for (const row of parsed.rows){
      if (row === null){ // separator #sep
        html += `<tr class="sep"><td colspan="${parsed.headers.length}"></td></tr>`;
        continue;
      }
      html += '<tr>' + row.map(c=>`<td>${esc(c)}</td>`).join('') + '</tr>';
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;

    state.tables[sectionId] = wrap.querySelector('table');
    setStatus('');
    applyStriping(state.tables[sectionId]);
    if (state.lastQuery) doSearch(state.lastQuery);
  }

  function applyStriping(table){
    if (!table) return;
    const rows = [...table.tBodies[0].rows];
    let band = 0;
    rows.forEach(tr=>{
      if (tr.classList.contains('sep')) { band++; return; }
      tr.classList.toggle('band', band % 2 === 1);
    });
  }

  // ---------- încărcare din /data/*.csv ----------
  async function loadSection(section){
    try{
      setStatus(`Încarc ${section.title}…`);
      const resp = await fetch(section.url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const txt = await resp.text();

      const parsed = parseDelimited(txt);
      const locked = lockHeaders(parsed, section.headerLock);
      renderTable(section.id, locked);

    }catch(err){
      document.getElementById(`out-${section.id}`).innerHTML =
        `<div class="empty">Nu am putut încărca ${section.title} (${esc(err.message)}).</div>`;
      setStatus(`Eroare la încărcare ${section.title}.`, true);
    }
  }

  // ---------- căutare cu highlight + navigare ----------
  function clearHits(){
    state.hits.forEach(td=>td.classList.remove('hit'));
    state.hits = [];
    state.hitIndex = 0;
    resCount.textContent = '0/0';
    prevBtn.disabled = nextBtn.disabled = true;
  }

  function doSearch(q){
    state.lastQuery = q;
    clearHits();
    if (!q) return;

    const active = document.querySelector('.view.active');
    const table = active?.querySelector('table');
    if (!table) return;

    const rows = [...table.tBodies[0].rows];
    const query = q.toLowerCase();
    for (const tr of rows){
      if (tr.classList.contains('sep')) continue;
      for (const td of tr.cells){
        const t = (td.textContent||'').toLowerCase();
        if (t.includes(query)) state.hits.push(td);
      }
    }
    state.hits.forEach(td=>td.classList.add('hit'));
    if (state.hits.length){
      state.hitIndex = 0;
      gotoHit(0);
      prevBtn.disabled = nextBtn.disabled = false;
    }
    resCount.textContent = `${state.hits.length ? 1 : 0}/${state.hits.length}`;
  }

  function gotoHit(i){
    if (!state.hits.length) return;
    if (i < 0) i = state.hits.length - 1;
    if (i >= state.hits.length) i = 0;
    state.hitIndex = i;
    const td = state.hits[i];
    td.scrollIntoView({behavior:'smooth', block:'center'});
    state.hits.forEach(el=>el.classList.toggle('focus', el===td));
    resCount.textContent = `${i+1}/${state.hits.length}`;
  }

  searchInput.addEventListener('input', e=> doSearch(e.target.value));
  nextBtn.addEventListener('click', ()=> gotoHit(state.hitIndex+1));
  prevBtn.addEventListener('click', ()=> gotoHit(state.hitIndex-1));
  clearBtn.addEventListener('click', ()=>{
    searchInput.value = ''; doSearch('');
  });

  // ---------- wipe cu PIN ----------
  wipeBtn.addEventListener('click', ()=> {
    const pin = prompt('Introdu PIN admin pentru a confirma ștergerea cache-ului local:');
    if (pin !== '1234') { alert('PIN invalid.'); return; }
    // momentan doar curăță eventuale cache-uri proprii (dacă folosești localStorage):
    localStorage.clear();
    alert('Datele locale au fost șterse.');
  });

  // ---------- inițializare ----------
  document.querySelectorAll('.nav-link').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      document.getElementById(btn.dataset.section).classList.add('active');
      // încarcă on-demand
      const sec = sections.find(s=>s.id===btn.dataset.section);
      if (sec) loadSection(sec);
      // reset căutare
      searchInput.value=''; doSearch('');
    });
  });

  // pornește cu S1
  document.querySelector('.nav-link[data-section="s1"]').click();
});
