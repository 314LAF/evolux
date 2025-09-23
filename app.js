document.addEventListener('DOMContentLoaded', () => {
  const menuBtn = document.getElementById('menuBtn');
  const drawer = document.getElementById('drawer');
  const homeBtn = document.getElementById('homeBtn');
  const backBtn = document.getElementById('backBtn');
  const themeBtn = document.getElementById('themeBtn');
  const searchInput = document.getElementById('searchInput');
  const fileInput = document.getElementById('file');
  const saveBtn = document.getElementById('saveHtml');
  const statusEl = document.getElementById('status');

  function setStatus(msg, isErr=false){
    statusEl.textContent = msg || '';
    statusEl.style.color = isErr ? '#b91c1c' : 'var(--muted)';
  }

  const THEME_KEY='app-theme';
  function applyTheme(t){ document.body.classList.toggle('dark', t==='dark'); themeBtn.textContent = document.body.classList.contains('dark')?'☀️':'🌙'; }
  const saved = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(saved);
  themeBtn.addEventListener('click', ()=>{ const next = document.body.classList.contains('dark')?'light':'dark'; localStorage.setItem(THEME_KEY,next); applyTheme(next); });

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
    b.addEventListener('click', ()=>{
      const id = b.dataset.section;
      showView(id);
      drawer.classList.remove('open');
    });
  });

  menuBtn.addEventListener('click', ()=>{
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (isMobile) {
      drawer.classList.toggle('open');
    } else {
      document.querySelector('.app').classList.toggle('nav-collapsed');
    }
  });
  homeBtn.addEventListener('click', ()=> showView('home'));
  backBtn.addEventListener('click', ()=>{
    if(historyStack.length>1){
      historyStack.pop();
      const prev = historyStack[historyStack.length-1];
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      document.getElementById(prev).classList.add('active');
      currentView = prev;
      document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active', b.dataset.section===prev));
    }
  });

  function filterRows(query){
    const container = document.querySelector(`#${currentView} .out`);
    const table = container?.querySelector('table');
    if(!table) return;
    const q = query.trim().toLowerCase();
    table.querySelectorAll('.hit').forEach(td=>td.classList.remove('hit'));
    if(q===''){ Array.from(table.tBodies).forEach(tb=>Array.from(tb.rows).forEach(tr=>tr.style.display='')); return; }
    let firstHitRow = null;
    Array.from(table.tBodies).forEach(tb=>{
      Array.from(tb.rows).forEach(tr=>{
        let rowHit = false;
        Array.from(tr.cells).forEach(td=>{
          const t = (td.textContent||'').toLowerCase();
          if(t.includes(q)){ rowHit = true; td.classList.add('hit'); }
        });
        tr.style.display = rowHit ? '' : 'none';
        if(rowHit && !firstHitRow) firstHitRow = tr;
      });
    });
    if(firstHitRow){ firstHitRow.scrollIntoView({behavior:'smooth', block:'center'}); }
  }
  searchInput.addEventListener('input', (e)=> filterRows(e.target.value));

  function renderWorkbook(section, wb){
    const tabs = document.getElementById(`tabs-${section}`);
    const out = document.getElementById(`out-${section}`);
    tabs.innerHTML = '';
    tabs.hidden = false;
    const first = wb.SheetNames[0];
    wb.SheetNames.forEach((name, idx) => {
      const b = document.createElement('button');
      b.className = 'tab' + (idx===0?' active':'');
      b.textContent = name;
      b.onclick = () => { tabs.querySelectorAll('.tab').forEach(t=>t.classList.remove('active')); b.classList.add('active'); showSheet(section, name); };
      tabs.appendChild(b);
    });
    showSheet(section, first);
  }

  function showSheet(section, name){
    const out = document.getElementById(`out-${section}`);
    const html = XLSX.utils.sheet_to_html(workbooks[section].Sheets[name], { id: `excel-${section}`, editable:false });
    out.innerHTML = html;
    if(currentView===section){ lastHTML = html; saveBtn.disabled = false; }
    const table = out.querySelector('table');
    if(table){ table.style.display='block'; table.style.overflow='auto'; }
    if(currentView===section && searchInput.value) filterRows(searchInput.value);
  }

  function parseArrayBuffer(section, buffer){
    const wb = XLSX.read(buffer, { type: 'array' });
    workbooks[section] = wb; renderWorkbook(section, wb); showView(section);
    setStatus('Încărcat în ' + section.toUpperCase());
  }

  function parseFileFor(section, file){
    setStatus('Se încarcă: ' + file.name + ' …');
    const reader = new FileReader();
    reader.onerror = () => setStatus('Eroare la citirea fișierului.', true);
    reader.onload = (e)=>{
      try {
        parseArrayBuffer(section, e.target.result);
      } catch (err1) {
        try {
          const reader2 = new FileReader();
          reader2.onload = (ee)=>{
            try {
              const wb = XLSX.read(ee.target.result, { type: 'binary' });
              workbooks[section] = wb; renderWorkbook(section, wb); showView(section);
              setStatus('Încărcat (fallback) în ' + section.toUpperCase());
            } catch (err2) {
              console.error(err2);
              setStatus('Nu am reușit să interpretez fișierul. Încearcă .xlsx/.xls/.csv.', true);
            }
          };
          reader2.readAsBinaryString(file);
        } catch (e2) {
          console.error(err1);
          setStatus('Fișierul nu a putut fi procesat.', true);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  }

  fileInput.addEventListener('change', (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    const target = ['s1','s2','s3'].includes(currentView) ? currentView : 's1';
    parseFileFor(target, f);
    e.target.value = '';
  });

  ['s1','s2','s3'].forEach(section=>{
    const drop = document.getElementById(`drop-${section}`);
    ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,(e)=>{e.preventDefault();drop.classList.add('dragover');}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,(e)=>{e.preventDefault();drop.classList.remove('dragover');}));
    drop.addEventListener('drop',(e)=>{ const f=e.dataTransfer.files?.[0]; if(f) parseFileFor(section,f); });
  });

  saveBtn.addEventListener('click', ()=>{
    const htmlDoc = `<!doctype html><html lang="ro"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Tabel exportat</title><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#f3f4f6}</style></head><body>${lastHTML}</body></html>`;
    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tabel.html'; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  });
});
