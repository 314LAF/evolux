// app.js — v46 (delimitator fix pe secțiuni)

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const resCount = document.getElementById('resCount');
  const prevBtn = document.getElementById('prevHit');
  const nextBtn = document.getElementById('nextHit');
  const clearBtn = document.getElementById('clearSearch');
  const statusEl = document.getElementById('status');
  const wipeBtn = document.getElementById('wipeBtn');

  // IMPORTANT: aici fixăm delimitatorul pentru fiecare secțiune
  const sections = [
    { id:'s1', title:'Chime S1–S52',     url:'data/s1.csv', delimiter:',', headerLock:null },
    { id:'s2', title:'Curse spre XAR1',   url:'data/s2.csv', delimiter:'\t', headerLock:['Timestamp','Stop 1 Info','Route','Sender'] },
    { id:'s3', title:'Curse intermodale', url:'data/s3.csv', delimiter:',', headerLock:null },
  ];

  const state = { hits:[], hitIndex:0, lastQuery:'' };

  function setStatus(msg, isErr=false){
    statusEl.textContent = msg || '';
    statusEl.style.color = isErr ? '#b91c1c' : 'var(--muted)';
  }

  // CSV parser (cu ghilimele) + variantă simplă pentru TSV
  function splitRespectingQuotes(line, sep){
    if (sep === '\t') return line.split('\t'); // TSV simplu, nu are nevoie de ghilimele
    const out=[]; let cur=''; let inQ=false;
    for (let i=0;i<line.length;i++){
      const ch=line[i];
      if (ch === '"'){
        if (inQ && line[i+1] === '"'){ cur+='"'; i++; }
        else inQ=!inQ;
      }else if (ch === sep && !inQ){
        out.push(cur); cur='';
      }else cur+=ch;
    }
    out.push(cur);
    return out;
  }

  // parsează un text cu delimitator cunoscut; suportă #sep și ignoră linii ce încep cu ##
  function parseWith(text, sep){
    const lines = text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l!=='');
    let headers=null; const rows=[];
    for (const raw of lines){
      if (raw.startsWith('##')) continue;
      if (raw.trim()==='#sep'){ rows.push(null); continue; }
      if (!headers){
        headers = splitRespectingQuotes(raw, sep).map(h=>h.trim().replace(/^"|"$/g,''));
        continue;
      }
      const cells = splitRespectingQuotes(raw, sep).map(c=>c.replace(/^"|"$/g,''));
      rows.push(cells);
    }
    return { headers, rows };
  }

  // păstrează doar coloanele dorite (S2 header-lock)
  function lockHeaders(parsed, lock){
    if (!lock) return parsed;
    const idx = lock.map(h=> parsed.headers.indexOf(h));
    const rows = parsed.rows.map(r=>{
      if (r===null) return null;
      return lock.map((_,i)=> idx[i]>=0 ? (r[idx[i]] ?? '') : '');
    });
    return { headers: lock, rows };
  }

  function esc(s){ return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  function renderTable(sectionId, parsed){
    const wrap = document.getElementById(`out-${sectionId}`);
    if (!parsed || !parsed.headers){ wrap.innerHTML='<div class="empty">Nu s-au găsit date.</div>'; return; }
    let html='<table class="grid"><thead><tr>';
    html += parsed.headers.map(h=>`<th>${esc(h)}</th>`).join('');
    html += '</tr></thead><tbody>';
    for (const row of parsed.rows){
      if (row===null){ html+=`<tr class="sep"><td colspan="${parsed.headers.length}"></td></tr>`; continue; }
      html += '<tr>'+row.map(c=>`<td>${esc(c)}`).join('</td>')+'</td></tr>';
    }
    html+='</tbody></table>';
    wrap.innerHTML = html;
    applyStriping(wrap.querySelector('table'));
    if (state.lastQuery) doSearch(state.lastQuery);
    setStatus('');
  }

  function applyStriping(table){
    if (!table) return;
    const rows=[...table.tBodies[0].rows]; let band=0;
    for (const tr of rows){
      if (tr.classList.contains('sep')){ band++; continue; }
      tr.classList.toggle('band', band%2===1);
    }
  }

  async function loadSection(section){
    try{
      setStatus(`Încarc ${section.title}…`);
      const r = await fetch(section.url, { cache:'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = await r.text();
      const parsed = parseWith(txt, section.delimiter);
      const locked = lockHeaders(parsed, section.headerLock);
      renderTable(section.id, locked);
    }catch(e){
      document.getElementById(`out-${section.id}`).innerHTML =
        `<div class="empty">Nu am putut încărca ${esc(section.title)} (${esc(e.message)}).</div>`;
      setStatus(`Eroare la încărcare ${section.title}.`, true);
    }
  }

  // --- Căutare + navigare
  state.hits=[]; state.hitIndex=0;
  function clearHits(){
    state.hits.forEach(td=>td.classList.remove('hit','focus'));
    state.hits=[]; state.hitIndex=0; resCount.textContent='0/0';
    prevBtn.disabled = nextBtn.disabled = true;
  }
  function doSearch(q){
    state.lastQuery=q; clearHits();
    if (!q) return;
    const active = document.querySelector('.view.active');
    const table = active?.querySelector('table'); if (!table) return;
    const rows=[...table.tBodies[0].rows];
    const qq=q.toLowerCase();
    for (const tr of rows){
      if (tr.classList.contains('sep')) continue;
      for (const td of tr.cells){
        if ((td.textContent||'').toLowerCase().includes(qq)) state.hits.push(td);
      }
    }
    state.hits.forEach(td=>td.classList.add('hit'));
    if (state.hits.length){ gotoHit(0); prevBtn.disabled=nextBtn.disabled=false; }
    resCount.textContent = `${state.hits.length?1:0}/${state.hits.length}`;
  }
  function gotoHit(i){
    if (!state.hits.length) return;
    if (i<0) i = state.hits.length-1;
    if (i>=state.hits.length) i=0;
    state.hits.forEach(td=>td.classList.remove('focus'));
    state.hitIndex=i; const td=state.hits[i]; td.classList.add('focus');
    td.scrollIntoView({behavior:'smooth', block:'center'});
    resCount.textContent = `${i+1}/${state.hits.length}`;
  }
  searchInput.addEventListener('input', e=>doSearch(e.target.value));
  prevBtn.addEventListener('click', ()=>gotoHit(state.hitIndex-1));
  nextBtn.addEventListener('click', ()=>gotoHit(state.hitIndex+1));
  clearBtn.addEventListener('click', ()=>{ searchInput.value=''; doSearch(''); });

  // PIN pt. ștergere cache (dacă folosești localStorage în viitor)
  wipeBtn?.addEventListener('click', ()=>{
    const pin = prompt('PIN admin pentru ștergere cache local:');
    if (pin !== '1234') { alert('PIN invalid'); return; }
    localStorage.clear(); alert('Date locale șterse.');
  });

  // Navigație
  document.querySelectorAll('.nav-link').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      const id=b.dataset.section; document.getElementById(id).classList.add('active');
      const sec = sections.find(s=>s.id===id); if (sec) loadSection(sec);
      searchInput.value=''; doSearch('');
    });
  });

  // start cu S1
  document.querySelector('.nav-link[data-section="s1"]').click();
});
