document.addEventListener('DOMContentLoaded', () => {
  // --- Elemente
  const root = document.getElementById('appRoot');
  const searchInput = document.getElementById('searchInput');
  const searchCount = document.getElementById('searchCount');
  const prevHitBtn   = document.getElementById('prevHit');
  const nextHitBtn   = document.getElementById('nextHit');
  const toggleSidebarBtn = document.getElementById('toggleSidebar');
  const themeBtn = document.getElementById('themeBtn');
  const wipeBtn = document.getElementById('wipeBtn');

  // --- Navigare
  let currentView = 's1';
  const views = ['s1','s2','s3'];

  function showView(id){
    currentView = id;
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active', b.dataset.section===id));
    resetSearch();
  }

  document.querySelectorAll('.nav-link').forEach(b=>{
    b.addEventListener('click', ()=> showView(b.dataset.section));
  });

  toggleSidebarBtn?.addEventListener('click', ()=>{
    root.classList.toggle('nav-collapsed');
  });

  // --- Tema (Dark/Light) cu gărzi
  const THEME_KEY = 'app-theme';
  function applyTheme(mode){
    document.body.classList.toggle('dark', mode==='dark');
    if (themeBtn) themeBtn.textContent = document.body.classList.contains('dark') ? 'Light' : 'Dark';
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  if (themeBtn) {
    themeBtn.addEventListener('click', ()=>{
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  // --- Loader CSV generic
  async function loadCSV(path){
    const res = await fetch(path, {cache:'no-store'});
    if(!res.ok) return null;
    return await res.text();
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

  // randare tabel simplă
  function tableFrom(rows){
    if(!rows.length) return '<div style="padding:8px;color:var(--muted)">Fără date.</div>';
    const th = '<tr>'+rows[0].map(c=>`<th>${escapeHtml(c)}</th>`).join('')+'</tr>';
    const body = rows.slice(1).map(r=>{
      const isSep = r[0] && r[0].trim()==='#sep';
      if(isSep) return `<tr class="sep-row"><td colspan="${rows[0].length}"></td></tr>`;
      return '<tr>'+r.map(c=>`<td>${escapeHtml(c)}</td>`).join('')+'</tr>';
    }).join('');
    return `<table><thead>${th}</thead><tbody>${body}</tbody></table>`;
  }

  // CSV → matrice
  function parseCSV(text){
    const lines = text.split(/\r?\n/).filter(l=>l.length>0);
    const out = [];
    let row = [], inQ = false, cur = '';
    for(const line of lines){
      // suport “rând gol” doar dacă e #sep
      let i=0;
      while(i<line.length){
        const ch=line[i];
        if(ch === '"'){
          if(inQ && line[i+1]==='"'){ cur+='"'; i+=2; continue; }
          inQ = !inQ; i++; continue;
        }
        if(ch===',' && !inQ){ row.push(cur); cur=''; i++; continue; }
        cur+=ch; i++;
      }
      row.push(cur); cur='';
      out.push(row);
      row=[];
    }
    return out;
  }

  // --- S1
  (async ()=>{
    const txt = await loadCSV('./data/s1.csv');
    const out = document.getElementById('out-s1');
    if(!txt){ out.innerHTML = '<div style="padding:8px;color:var(--muted)">Nu am putut încărca S1.</div>'; return; }
    const rows = parseCSV(txt);
    out.innerHTML = tableFrom(rows);
  })();

  // --- S2 (așteaptă header “Timestamp,Stop 1 Info,Route,Sender”)
  (async ()=>{
    const txt = await loadCSV('./data/s2.csv');
    const out = document.getElementById('out-s2');
    if(!txt){ out.innerHTML = '<div style="padding:8px;color:var(--muted)">Nu am putut încărca S2.</div>'; return; }
    const rows = parseCSV(txt);
    out.innerHTML = tableFrom(rows);
  })();

  // --- S3 (așteaptă header “Timestamp,From,Lane”; lane poate avea mai multe linii)
  (async ()=>{
    const txt = await loadCSV('./data/s3.csv');
    const out = document.getElementById('out-s3');
    if(!txt){ out.innerHTML = '<div style="padding:8px;color:var(--muted)">Nu am putut încărca S3.</div>'; return; }
    const rows = parseCSV(txt);
    // post-proces Lane: dacă are string cu linii multiple, afișează prima + “+X”
    const header = rows[0];
    const idxLane = header.findIndex(h=>/^\s*lane\s*$/i.test(h));
    if(idxLane>=0){
      const newRows = [header];
      for(let i=1;i<rows.length;i++){
        const r = rows[i].slice();
        if(r[0] && r[0].trim()==='#sep'){ newRows.push(r); continue; }
        const lane = r[idxLane]||'';
        if(lane.includes('\n')){
          const parts = lane.split(/\r?\n/).filter(Boolean);
          const first = parts[0];
          const restCount = parts.length-1;
          r[idxLane] = restCount>0
            ? `${first}  (+${restCount})`
            : first;
        }
        newRows.push(r);
      }
      out.innerHTML = tableFrom(newRows);
      // click pentru “show more”: expandă celula la textul complet
      out.addEventListener('click',(e)=>{
        const td = e.target.closest('td'); if(!td) return;
        if(/\(\+\d+\)$/.test(td.textContent)){
          // găsește rândul inițial în text (din păcate nu păstrăm originalul pe celulă;
          // pentru versiunea rapidă nu persistăm expand-ul; poți adăuga data-full pe csv parse dacă vrei permanent)
          // aici doar scoatem “(+X)”
          td.textContent = td.textContent.replace(/\s*\(\+\d+\)\s*$/,'');
        }
      });
    }else{
      out.innerHTML = tableFrom(rows);
    }
  })();

  // --- Căutare cu highlight + next/prev + contor
  let hits = [], hitIdx = -1;
  function clearHits(){
    document.querySelectorAll('.hit').forEach(el=>el.classList.remove('hit'));
  }
  function resetSearch(){
    clearHits(); hits=[]; hitIdx=-1; updateCounter();
  }
  function updateCounter(){
    if(searchCount) searchCount.textContent = `${hits.length? (hitIdx+1):0}/${hits.length}`;
  }
  function doSearch(q){
    resetSearch();
    const container = document.querySelector(`#${currentView} .out`);
    const table = container?.querySelector('table'); if(!table) return;
    if(!q.trim()) return;
    const needle = q.toLowerCase();
    table.querySelectorAll('tbody tr').forEach(tr=>{
      tr.querySelectorAll('td').forEach(td=>{
        if((td.textContent||'').toLowerCase().includes(needle)){
          td.classList.add('hit'); hits.push(td);
        }
      });
    });
    if(hits.length){ hitIdx=0; hits[0].scrollIntoView({behavior:'smooth',block:'center'}); }
    updateCounter();
  }
  function jump(dir){
    if(!hits.length) return;
    hitIdx = (hitIdx + dir + hits.length) % hits.length;
    hits[hitIdx].scrollIntoView({behavior:'smooth',block:'center'});
    updateCounter();
  }

  searchInput?.addEventListener('keydown', (e)=>{
    if(e.key==='Enter'){
      if(e.shiftKey) jump(-1);
      else if(searchInput.value.trim()) jump(+1);
      e.preventDefault();
    }
  });
  searchInput?.addEventListener('input', (e)=> doSearch(e.target.value));
  nextHitBtn?.addEventListener('click', ()=> jump(+1));
  prevHitBtn?.addEventListener('click', ()=> jump(-1));

  // --- Șterge date locale (doar cache local)
  wipeBtn?.addEventListener('click', ()=>{
    if(!confirm('Sigur ștergi datele locale (cache & preferințe)?')) return;
    localStorage.clear();
    location.reload();
  });
});
