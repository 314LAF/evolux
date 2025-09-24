(function(){
  // ---------- Utilitare UI ----------
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const byId = id => document.getElementById(id);

  const OUT = { s1: byId('out-s1'), s2: byId('out-s2'), s3: byId('out-s3') };

  // ---------- Theme ----------
  const THEME_KEY = 'viewer-theme';
  function applyTheme(t){
    document.body.classList.toggle('dark', t === 'dark');
    byId('themeBtn').textContent = document.body.classList.contains('dark') ? 'Light' : 'Dark';
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  byId('themeBtn').addEventListener('click', ()=>{
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next); applyTheme(next);
  });

  // ---------- Navigare secțiuni ----------
  let current = 's1';
  $$('.nav').forEach(b=>{
    b.addEventListener('click', ()=>{
      current = b.dataset.sec;
      $$('.nav').forEach(x=>x.classList.toggle('active', x===b));
      $$('.section').forEach(sec=>sec.classList.toggle('active', sec.id===current));
      // resetează căutarea pe schimbare
      byId('search').value=''; clearHits();
    });
  });
  // marchează default
  $$('.nav')[0].classList.add('active');

  // ---------- CSV loader din /data ----------
  const PATH = {
    s1: new URL('./data/s1.csv', location).toString(),
    s2: new URL('./data/s2.csv', location).toString(),
    s3: new URL('./data/s3.csv', location).toString(),
  };

  const CACHE_KEY = 'csv-cache-v1';
  const cache = (function(){ try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'{}')}catch{return{}} })();

  function saveCache(sec, txt){
    try {
      const db = cache || {};
      db[sec] = { csv: txt, ts: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(db));
    } catch {}
  }

  async function loadSec(sec, lockedHeader){
    const url = PATH[sec];
    try{
      console.log('[CSV] fetch', url);
      const res = await fetch(url, {cache:'no-store'});
      console.log('[CSV]', sec, 'status', res.status);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const txt = await res.text();
      const rows = parseCSV(txt);
      const html = renderCleanTable(rows, lockedHeader);
      OUT[sec].innerHTML = html;
      saveCache(sec, txt);
    }catch(err){
      console.warn('[CSV] fallback local', sec, err);
      if(cache[sec]?.csv){
        const rows = parseCSV(cache[sec].csv);
        OUT[sec].innerHTML = renderCleanTable(rows, lockedHeader);
      }else{
        OUT[sec].innerHTML = `<div class="note">Nu am putut încărca ${sec.toUpperCase()} (${err.message}).</div>`;
      }
    }
  }

  // S1: detectăm header în fișier (poate avea titlu pe primul rând)
  loadSec('s1', null);
  // S2: „lock” header exact: Timestamp, Type, Stop 1 Info, Route, Sender
  loadSec('s2', ["Timestamp","Type","Stop 1 Info","Route","Sender"]);
  // S3: opțional; dacă nu există fișier, va arăta mesaj + cache dacă e
  loadSec('s3', null);

  // Ștergere cache local
  byId('clearLocal').addEventListener('click', ()=>{
    const pin = prompt('PIN admin (4 cifre):');
    if(pin !== '3141'){ alert('PIN greșit.'); return; }
    localStorage.removeItem(CACHE_KEY);
    alert('Datele locale au fost șterse (CSV cache). Reîncarcă pagina.');
  });

  // ---------- Parser CSV simplu (cu ghilimele) ----------
  function parseCSV(text){
    const rows = [];
    let row = [], cell = '', inQ = false;

    for (let i=0; i<text.length; i++){
      const ch = text[i], nx = text[i+1];
      if(inQ){
        if(ch === '"' && nx === '"'){ cell += '"'; i++; continue; }
        if(ch === '"'){ inQ = false; continue; }
        cell += ch; continue;
      }
      if(ch === '"'){ inQ = true; continue; }
      if(ch === ','){ row.push(cell); cell=''; continue; }
      if(ch === '\r'){ continue; }
      if(ch === '\n'){ row.push(cell); rows.push(row); cell=''; row=[]; continue; }
      cell += ch;
    }
    if(cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // ---------- Alegem headerul corect & randăm tabel curat ----------
  function renderCleanTable(rows, lockedHeader){
    if(!rows || !rows.length) return '<div class="note">Fișier gol.</div>';

    // găsește rândul de header: preferă conținând „timestamp/ type / from”
    let hdrIdx = -1;
    for (let i=0;i<rows.length;i++){
      const vals = rows[i].map(v=>String(v).trim().toLowerCase());
      const hits = ['timestamp','type','from'].filter(k=>vals.includes(k)).length;
      if(hits>=1){ hdrIdx=i; break; }
    }
    // fallback: prima linie non-vidă
    if(hdrIdx === -1){
      hdrIdx = rows.findIndex(r => r.some(v => String(v).trim()!==''));
      if(hdrIdx === -1) return '<div class="note">Nu s-au găsit date.</div>';
    }

    // Dacă avem „#sep” pe prima coloană, îl păstrăm ca separator vizual
    const header = lockedHeader ? lockedHeader : rows[hdrIdx];
    const body = rows.slice(hdrIdx + (lockedHeader ? 0 : 1)); // dacă lock, nu sărim headerul din fișier
    const clean = body.filter(r => r.some(v => String(v).trim()!==''));

    // determină nr. coloane
    const cols = Math.max(header.length, ...clean.map(r=>r.length)) || header.length;

    const esc = s => String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
    const ths = Array.from({length: cols}).map((_,i)=> `<th>${esc(header[i] ?? '')}</th>` ).join('');

    const trs = clean.map(r=>{
      const isSep = String(r[0]).trim()==='#sep';
      if(isSep) return `<tr class="sep-row"><td colspan="${cols}">—</td></tr>`;
      const tds = Array.from({length: cols}).map((_,i)=> `<td>${esc(r[i] ?? '')}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    return `<div style="overflow:auto;max-height:calc(100vh - 180px)"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
  }

  // ---------- Căutare clasică cu contor + next/prev ----------
  let hits = [], hitIndex = -1;
  function clearHits(){
    $$('#'+current+' td.hit').forEach(td=>td.classList.remove('hit'));
    hits = []; hitIndex = -1;
    byId('srCount').textContent = '0/0';
  }

  function runSearch(q){
    clearHits();
    q = q.trim().toLowerCase();
    if(!q) return;

    const table = byId(current).querySelector('table');
    if(!table) return;

    const cells = Array.from(table.tBodies[0]?.querySelectorAll('td')||[]);
    cells.forEach(td => {
      const t = (td.textContent||'').toLowerCase();
      if(t.includes(q)) { td.classList.add('hit'); hits.push(td); }
    });

    if(hits.length){
      hitIndex = 0; scrollToHit();
    }
    byId('srCount').textContent = `${Math.max(hitIndex+1,0)}/${hits.length}`;
  }

  function scrollToHit(){
    if(hitIndex<0 || hitIndex>=hits.length) return;
    const el = hits[hitIndex];
    el.scrollIntoView({behavior:'smooth', block:'center'});
    byId('srCount').textContent = `${hitIndex+1}/${hits.length}`;
  }

  byId('search').addEventListener('keydown',(e)=>{
    if(e.key==='Enter'){
      if(e.shiftKey){ // prev
        if(hits.length){ hitIndex = (hitIndex-1+hits.length)%hits.length; scrollToHit(); }
      }else{
        if(hits.length){ hitIndex = (hitIndex+1)%hits.length; scrollToHit(); }
      }
      e.preventDefault();
    }
  });
  byId('search').addEventListener('input', (e)=> runSearch(e.target.value));

  byId('prevBtn').addEventListener('click', ()=>{
    if(hits.length){ hitIndex = (hitIndex-1+hits.length)%hits.length; scrollToHit(); }
  });
  byId('nextBtn').addEventListener('click', ()=>{
    if(hits.length){ hitIndex = (hitIndex+1)%hits.length; scrollToHit(); }
  });

})();
