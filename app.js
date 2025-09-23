document.addEventListener('DOMContentLoaded', () => {
  const menuBtn = document.getElementById('menuBtn');
  const drawer = document.getElementById('drawer');
  const homeBtn = document.getElementById('homeBtn');
  const backBtn  = document.getElementById('backBtn');
  const themeBtn = document.getElementById('themeBtn');
  const searchInput = document.getElementById('searchInput');
  const fileInput = document.getElementById('file');
  const saveBtn = document.getElementById('saveHtml');
  const statusEl = document.getElementById('status');

  function setStatus(msg, isErr=false){
    statusEl.textContent = msg || '';
    statusEl.style.color = isErr ? '#b91c1c' : 'var(--muted)';
  }

  /* Dark mode */
  const THEME_KEY='app-theme';
  function applyTheme(t){ document.body.classList.toggle('dark', t==='dark'); themeBtn.textContent = document.body.classList.contains('dark')?'☀️':'🌙'; }
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  themeBtn.addEventListener('click', ()=>{ const next = document.body.classList.contains('dark')?'light':'dark'; localStorage.setItem(THEME_KEY,next); applyTheme(next); });

  /* Stare */
  let historyStack = ['home'];
  let currentView = 'home';
  const workbooks = { s1:null, s2:null, s3:null };
  let lastHTML = '';

  function showView(id){
    if(currentView !== id){ historyStack.push(id); }
    currentView = id;
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active', b.dataset.section===id));
    saveBtn.disabled = !document.querySelector(`#${id} .out table`);
    searchInput.value = '';
  }

  document.querySelectorAll('.nav-link').forEach(b=>{
    b.addEventListener('click', ()=>{ showView(b.dataset.section); drawer.classList.remove('open'); });
  });

  menuBtn.addEventListener('click', ()=>{
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (isMobile) drawer.classList.toggle('open');
    else document.querySelector('.app').classList.toggle('nav-collapsed');
  });
  homeBtn.addEventListener('click', ()=> showView('home'));
  backBtn.addEventListener('click', ()=>{
    if(historyStack.length>1){ historyStack.pop(); const prev = historyStack.at(-1); showView(prev); }
  });

  /* Căutare + highlight */
  function filterRows(query){
    const container = document.querySelector(`#${currentView} .out`);
    const table = container?.querySelector('table'); if(!table) return;
    const q = query.trim().toLowerCase();
    table.querySelectorAll('.hit').forEach(td=>td.classList.remove('hit'));
    if(q===''){ Array.from(table.tBodies).forEach(tb=>Array.from(tb.rows).forEach(tr=>tr.style.display='')); return; }
    let firstHitRow = null;
    Array.from(table.tBodies).forEach(tb=>{
      Array.from(tb.rows).forEach(tr=>{
        let hit=false;
        Array.from(tr.cells).forEach(td=>{
          const t=(td.textContent||'').toLowerCase();
          if(t.includes(q)){ hit=true; td.classList.add('hit'); }
        });
        tr.style.display = hit ? '' : 'none';
        if(hit && !firstHitRow) firstHitRow = tr;
      });
    });
    if(firstHitRow){ firstHitRow.scrollIntoView({behavior:'smooth', block:'center'}); }
  }
  searchInput.addEventListener('input', (e)=> filterRows(e.target.value));

  // Construieste HTML de tabel curat (fără rânduri / coloane complet goale)
// ========= 1) sheetToCleanHTML: găsește headerul corect și randează curat =========
function sheetToCleanHTML(sheet) {
  // Matrice de celule
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // Caut rândul de header: conține "Timestamp" și "MsgId"
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const vals = rows[i].map(v => String(v).trim());
    if (vals.includes("Timestamp") && vals.includes("MsgId")) { headerIdx = i; break; }
  }

  // Dacă nu-l găsesc, cad înapoi pe prima linie nenulă ca header
  if (headerIdx === -1) {
    headerIdx = rows.findIndex(r => r.some(v => String(v).trim() !== ""));
    if (headerIdx === -1) return '<div style="padding:16px;color:#64748b">Foaia nu conține celule cu text.</div>';
  }

  const header = rows[headerIdx];
  const bodyRows = rows.slice(headerIdx + 1);

  // Determină ultima coloană cu conținut în ORICARE rând de body
  let lastCol = header.length;
  bodyRows.forEach(r => {
    for (let c = r.length - 1; c >= 0; c--) {
      if (String(r[c]).trim() !== "") { lastCol = Math.max(lastCol, c + 1); break; }
    }
  });

  // Curăță coloanele și rândurile complet goale
  const trimmedHeader = header.slice(0, lastCol);
  const cleanRows = bodyRows
    .map(r => r.slice(0, lastCol))
    .filter(r => r.some(v => String(v).trim() !== ""));

  if (cleanRows.length === 0) {
    return '<div style="padding:16px;color:#64748b">Nu s-au găsit rânduri cu date sub header.</div>';
  }

  // Generează HTML simplu
  const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const ths = trimmedHeader.map(v => `<th>${esc(v)}</th>`).join("");
  const trs = cleanRows.map(r => `<tr>${r.map(v => `<td>${esc(v)}`).join("</td>")}</td></tr>`).join("");

  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

  
  /* Render per secțiune */
  function renderWorkbook(section, wb){
    const tabs = document.getElementById(`tabs-${section}`);
    tabs.innerHTML = ''; tabs.hidden = false;
    const first = wb.SheetNames[0];
    wb.SheetNames.forEach((name, idx) => {
      const b = document.createElement('button');
      b.className = 'tab' + (idx===0?' active':''); b.textContent = name;
      b.onclick = ()=>{ tabs.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); b.classList.add('active'); showSheet(section, name); };
      tabs.appendChild(b);
    });
    showSheet(section, first);
  }

  function showSheet(section, name){
  const out = document.getElementById(`out-${section}`);

  // Folosește randarea “curată” în loc de sheet_to_html clasic
  const html = sheetToCleanHTML(workbooks[section].Sheets[name]);
  out.innerHTML = html;

  if(currentView===section){ lastHTML = html; saveBtn.disabled = false; }

  const table = out.querySelector('table');
  if(table){
    table.style.display = 'block';
    table.style.overflow = 'auto';
    table.style.maxWidth = '100%';
  }

  if(currentView===section && searchInput.value) filterRows(searchInput.value);

  // sari sus ca să vezi tabelul imediat
  out.scrollIntoView({behavior:'instant', block:'start'});
}

  /* Upload robust: CSV + XLSX/XLS(XLSB/XLSM) cu fallback */
  function parseFileFor(section, file){
    setStatus('Se încarcă: ' + file.name + ' …');
    const ext = (file.name.split('.').pop()||'').toLowerCase();

    if(ext === 'csv'){
      const r = new FileReader();
      r.onerror = ()=> setStatus('Eroare la citirea fișierului.', true);
      r.onload = (e)=>{
        try{
          const wb = XLSX.read(e.target.result, { type:'string' });
          workbooks[section]=wb; renderWorkbook(section, wb); showView(section);
          setStatus('Încărcat CSV în ' + section.toUpperCase());
        }catch(err){ console.error(err); setStatus('CSV invalid.', true); }
      };
      r.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = ()=> setStatus('Eroare la citirea fișierului.', true);
    reader.onload = (e)=>{
      try{
        const wb = XLSX.read(e.target.result, { type:'array' });
        workbooks[section]=wb; renderWorkbook(section, wb); showView(section);
        setStatus('Încărcat în ' + section.toUpperCase());
      }catch(err1){
        try{
          const r2 = new FileReader();
          r2.onload = (e2)=>{
            try{
              const wb = XLSX.read(e2.target.result, { type:'binary' });
              workbooks[section]=wb; renderWorkbook(section, wb); showView(section);
              setStatus('Încărcat (fallback) în ' + section.toUpperCase());
            }catch(err2){ console.error(err2); setStatus('Nu am reușit să interpretez fișierul. Încearcă .xlsx/.xls/.csv.', true); }
          };
          r2.readAsBinaryString(file);
        }catch(e2){ console.error(err1); setStatus('Fișierul nu a putut fi procesat.', true); }
      }
    };
    reader.readAsArrayBuffer(file);
  }

  fileInput.addEventListener('change', (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    const target = ['s1','s2','s3'].includes(currentView) ? currentView : 's1';
    parseFileFor(target, f);
    e.target.value = ''; // permite re-selectarea aceluiași fișier
  });

  ['s1','s2','s3'].forEach(section=>{
    const drop = document.getElementById(`drop-${section}`);
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,(e)=>{e.preventDefault();drop.classList.add('dragover');}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,(e)=>{e.preventDefault();drop.classList.remove('dragover');}));
    drop.addEventListener('drop',(e)=>{ const f=e.dataTransfer.files?.[0]; if(f) parseFileFor(section,f); });
  });

  saveBtn.addEventListener('click', ()=>{
    const htmlDoc = `<!doctype html><html lang="ro"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Tabel exportat</title><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#f3f4f6}</style></head><body>${lastHTML}</body></html>`;
    const blob = new Blob([htmlDoc], { type:'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'tabel.html'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  });
});
