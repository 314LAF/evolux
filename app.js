"use strict";

// CSV parser (fără librării; suportă ghilimele duble)
function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nxt = text[i+1];
    if (inQ) {
      if (ch === '"' && nxt === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ""; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch === '\r') { /* ignore */ }
      else { cur += ch; }
    }
  }
  row.push(cur); rows.push(row);
  return rows;
}

// separatoare (#sep/---/— sau rând gol) + titluri de grup (##)
function tableHTML(rows) {
  const isEmptyRow = r => !r || r.every(v => String(v ?? "").trim() === "");
  const isSepMarker = r => {
    const c0 = String((r && r[0]) ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();
    return c0 === "#sep" || c0 === "---" || c0 === "—";
  };
  const isGroupTitle = r => {
    const c0 = String((r && r[0]) ?? "").trim().replace(/^["']|["']$/g, "");
    return c0.startsWith("##");
  };

  // găsește headerul: primul rând care nu e gol/marker/titlu
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (!isEmptyRow(rows[i]) && !isSepMarker(rows[i]) && !isGroupTitle(rows[i])) {
      headerIdx = i; break;
    }
  }
  if (headerIdx === -1) return '<div style="padding:16px;color:#64748b">CSV gol.</div>';

  const header = rows[headerIdx].map(v => String(v ?? ""));
  const colCount = header.length;

  const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

  const th = header.map(v => `<th>${esc(v)}</th>`).join("");
  let body = "";
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (isEmptyRow(r) || isSepMarker(r)) {
      body += `<tr class="sep-row"><td colspan="${colCount}"></td></tr>`;
      continue;
    }
    if (isGroupTitle(r)) {
      const title = String(r[0] ?? "").replace(/^##\s*/, "");
      body += `<tr class="group-row"><td colspan="${colCount}">${esc(title)}</td></tr>`;
      continue;
    }
    const cells = [];
    for (let c = 0; c < colCount; c++) cells.push(`<td>${esc(r[c] ?? "")}</td>`);
    body += `<tr>${cells.join("")}</tr>`;
  }
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const statusEl  = document.getElementById("status");
  const q         = document.getElementById("q");
  const file      = document.getElementById("file");
  const urlIn     = document.getElementById("url");
  const loadUrl   = document.getElementById("loadUrl");
  const paste     = document.getElementById("paste");
  const loadText  = document.getElementById("loadText");
  const saveBtn   = document.getElementById("saveHtml");
  const themeBtn  = document.getElementById("themeBtn");
  const shareBtn  = document.getElementById("shareLink");
  const clearBtn  = document.getElementById("clearCache");

  const OUT = { s1:document.getElementById("out-s1"), s2:document.getElementById("out-s2"), s3:document.getElementById("out-s3") };

  let current = "s1";
  let lastHTML = "";
  const URLS = { s1:"", s2:"", s3:"" }; // ultimele URL-uri încărcate

  // status
  function setStatus(msg, err=false){ statusEl.textContent = msg || ""; statusEl.style.color = err ? "#b91c1c" : "var(--muted)"; }

  // dark mode
  const THEME_KEY="csv-theme";
  function applyTheme(t){ const d=t==="dark"; document.body.classList.toggle("dark", d); themeBtn.textContent=d?"Light":"Dark"; }
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  themeBtn.onclick = ()=>{ const n=document.body.classList.contains("dark")?"light":"dark"; localStorage.setItem(THEME_KEY,n); applyTheme(n); };

  // navigare secțiuni
  function show(id){
    document.querySelectorAll(".view").forEach(s=>s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    current=id; q.value=""; filter("");
  }
  document.querySelectorAll(".tabbtn").forEach(b=>{
    b.onclick = ()=>{ document.querySelectorAll(".tabbtn").forEach(x=>x.classList.remove("active")); b.classList.add("active"); show(b.dataset.view); localStorage.setItem("csv-last-section", b.dataset.view); lastHTML = OUT[b.dataset.view].innerHTML || ""; };
  });
  show("s1");

  // căutare
  function filter(text){
    const cont = OUT[current]; const table = cont.querySelector("table"); if(!table) return;
    const ql=text.trim().toLowerCase();
    table.querySelectorAll(".hit").forEach(td=>td.classList.remove("hit"));
    if(ql===""){ Array.from(table.tBodies).forEach(tb=>Array.from(tb.rows).forEach(tr=>tr.style.display="")); return; }
    let first=null;
    Array.from(table.tBodies).forEach(tb=>{
      Array.from(tb.rows).forEach(tr=>{
        let hit=false;
        Array.from(tr.cells).forEach(td=>{ const t=(td.textContent||"").toLowerCase(); if(t.includes(ql)){ hit=true; td.classList.add("hit"); }});
        tr.style.display = hit ? "" : "none"; if(hit && !first) first=tr;
      });
    });
    if(first) first.scrollIntoView({behavior:"smooth", block:"center"});
  }
  q.oninput = e => filter(e.target.value);

  // localStorage cache (text CSV per secțiune)
  const CACHE_KEY="csv-cache-v1", LAST_SEC_KEY="csv-last-section";
  const readCache = ()=>{ try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"{}")}catch{return{}} };
  const writeCache = obj => { try{localStorage.setItem(CACHE_KEY, JSON.stringify(obj))}catch(e){ setStatus("Date prea mari pentru stocare locală.", true); } };
  const saveSectionCSV = (sec, text)=>{ const db=readCache(); db[sec]={csv:text,ts:Date.now()}; writeCache(db); };
  function restoreAllFromCache(){
    const db = readCache();
    ["s1","s2","s3"].forEach(sec=>{
      const item=db[sec]; if(item && item.csv){ try{ const rows=parseCSV(item.csv); const html=tableHTML(rows); OUT[sec].innerHTML=html; if(sec===current) lastHTML=html; }catch{} }
    });
    const last = localStorage.getItem(LAST_SEC_KEY); if(last && document.getElementById(last)) show(last);
  }

  // upload local
  file.onchange = e => {
    const f=e.target.files?.[0]; if(!f) return;
    setStatus("Se încarcă: "+f.name+" …");
    const r=new FileReader();
    r.onerror=()=>setStatus("Eroare la citire.", true);
    r.onload = ev => {
      try{
        const txt=ev.target.result;
        const rows=parseCSV(txt);
        const html=tableHTML(rows);
        OUT[current].innerHTML=html;
        lastHTML=html; saveBtn.disabled=!/table/i.test(html);
        saveSectionCSV(current, txt); localStorage.setItem(LAST_SEC_KEY,current);
        setStatus("Încărcat în "+current.toUpperCase());
      }catch(err){ console.error(err); setStatus("CSV invalid.", true); }
    };
    r.readAsText(f); e.target.value="";
  };

  // încarcă din URL
  loadUrl.onclick = async ()=>{
    const u=(urlIn.value||"").trim(); if(!u){ setStatus("Introdu un URL CSV.", true); return; }
    setStatus("Se descarcă din URL…");
    try{
      const res = await fetch(u, {cache:"no-store"}); if(!res.ok) throw new Error("HTTP "+res.status);
      const txt = await res.text();
      const rows = parseCSV(txt);
      const html = tableHTML(rows);
      OUT[current].innerHTML=html; lastHTML=html; saveBtn.disabled=!/table/i.test(html);
      URLS[current]=u; localStorage.setItem("csv-last-url-"+current, u);
      // opțional: salvează și textul CSV local (pt offline)
      saveSectionCSV(current, txt); localStorage.setItem(LAST_SEC_KEY,current);
      setStatus("Încărcat din URL în "+current.toUpperCase());
    }catch(err){ console.error(err); setStatus("Nu am putut descărca CSV-ul.", true); }
  };

  // încarcă din text
  loadText.onclick = ()=>{
    const t=(paste.value||"").trim(); if(!t){ setStatus("Lipește CSV în câmp.", true); return; }
    try{
      const rows=parseCSV(t); const html=tableHTML(rows);
      OUT[current].innerHTML=html; lastHTML=html; saveBtn.disabled=!/table/i.test(html);
      saveSectionCSV(current, t); localStorage.setItem(LAST_SEC_KEY,current);
      setStatus("Încărcat din text în "+current.toUpperCase());
    }catch(err){ console.error(err); setStatus("CSV invalid.", true); }
  };

  // export HTML
  saveBtn.onclick = ()=>{
    const htmlDoc = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Tabel</title><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#f3f4f6}.sep-row td{background:#e5e7eb;height:10px;padding:0;border:none}.group-row td{background:#eef2f7;font-weight:700;border-top:2px solid #cbd5e1}</style></head><body>"+lastHTML+"</body></html>";
    const blob=new Blob([htmlDoc],{type:"text/html;charset=utf-8"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="tabel.html"; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
  };

  // clear cache
  clearBtn.onclick = ()=>{ localStorage.removeItem(CACHE_KEY); localStorage.removeItem(LAST_SEC_KEY); ["s1","s2","s3"].forEach(sec=>localStorage.removeItem("csv-last-url-"+sec)); setStatus("Datele locale au fost șterse."); };

  // share link
  shareBtn.onclick = async ()=>{
    const qp=new URLSearchParams();
    for(const sec of ["s1","s2","s3"]){ if(URLS[sec]) qp.set(sec, URLS[sec]); }
    const shareUrl = `${location.origin}${location.pathname}?${qp.toString()}`;
    try{ await navigator.clipboard.writeText(shareUrl); setStatus("Link copiat în clipboard!"); }
    catch{ prompt("Copiază linkul:", shareUrl); }
  };

  // restaurare locală (opțional)
  restoreAllFromCache();

  // auto-load din parametri de query (?s1=...&s2=...)
  (async function autoLoadFromQuery(){
    const p = new URLSearchParams(location.search);
    let usedQuery=false;
    for(const sec of ["s1","s2","s3"]){
      const u=p.get(sec);
      if(u){
        usedQuery=true;
        try{
          setStatus("Se încarcă "+sec.toUpperCase()+" din link…");
          const res=await fetch(u,{cache:"no-store"}); if(!res.ok) throw new Error("HTTP "+res.status);
          const txt=await res.text(); const rows=parseCSV(txt); const html=tableHTML(rows);
          OUT[sec].innerHTML=html; if(sec===current) lastHTML=html; URLS[sec]=u;
          setStatus("Încărcat "+sec.toUpperCase()+" din link.");
        }catch(e){ console.error(e); setStatus("Nu am putut încărca "+sec.toUpperCase()+" din link.", true); }
      } else {
        URLS[sec] = localStorage.getItem("csv-last-url-"+sec) || "";
      }
    }
    if(!usedQuery) await loadDefaultFromRepo(); // dacă nu s-au dat URL-uri, ia din /data
  })();

  // auto-load din repo (/data/*.csv) când nu există parametri
  async function loadDefaultFromRepo(){
    const defaults={ s1:"./data/s1.csv", s2:"./data/s2.csv", s3:"./data/s3.csv" };
    for(const sec of ["s1","s2","s3"]){
      try{
        const res=await fetch(defaults[sec], {cache:"no-store"});
        if(!res.ok) continue;
        const txt=await res.text(); const rows=parseCSV(txt); const html=tableHTML(rows);
        OUT[sec].innerHTML=html; if(sec===current) lastHTML=html; URLS[sec]=defaults[sec];
      }catch{}
    }
  }
});
