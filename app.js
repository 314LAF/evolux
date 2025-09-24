"use strict";

// CSV -> array de rânduri (fără lib externe, suportă ghilimele duble)
// NOTĂ: NU filtrăm rândurile goale; le folosim ca separatoare.
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
  row.push(cur);
  rows.push(row);
  return rows; // păstrăm și rândurile complet goale
}

// randează tabel cu suport de separatoare (rând gol / #sep / --- / —) și titluri grup (## Titlu)
function tableHTML(rows) {
  const isEmptyRow = r => !r || r.every(v => String(v ?? "").trim() === "");
  const isSepMarker = r => {
    const c0 = String((r && r[0]) ?? "").trim();
    return c0 === "#sep" || c0 === "---" || c0 === "—";
  };
  const isGroupTitle = r => String((r && r[0]) ?? "").trim().startsWith("##");

  // header = primul rând care NU e gol/marker/titlu
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
  const statusEl = document.getElementById("status");
  const q = document.getElementById("q");
  const file = document.getElementById("file");
  const urlIn = document.getElementById("url");
  const loadUrl = document.getElementById("loadUrl");
  const paste = document.getElementById("paste");
  const loadText = document.getElementById("loadText");
  const saveBtn = document.getElementById("saveHtml");
  const themeBtn = document.getElementById("themeBtn");

  const OUT = {
    s1: document.getElementById("out-s1"),
    s2: document.getElementById("out-s2"),
    s3: document.getElementById("out-s3")
  };

  let current = "s1";
  let lastHTML = "";
  const DATA = { s1:null, s2:null, s3:null };

  // dark mode
  const KEY = "csv-theme";
  function apply(t){
    const d = t === "dark";
    document.body.classList.toggle("dark", d);
    themeBtn.textContent = d ? "Light" : "Dark";
  }
  apply(localStorage.getItem(KEY) || "light");
  themeBtn.onclick = () => {
    const n = document.body.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(KEY, n);
    apply(n);
  };

  function setStatus(msg, err=false){
    statusEl.textContent = msg || "";
    statusEl.style.color = err ? "#b91c1c" : "var(--muted)";
  }

  // afișare o singură secțiune
  function show(id){
    document.querySelectorAll(".view").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    current = id;
    q.value = "";
    filter("");
  }

  // meniu secțiuni
  document.querySelectorAll(".tabbtn").forEach(b=>{
    b.onclick = () => {
      document.querySelectorAll(".tabbtn").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      show(b.dataset.view);
    };
  });
  show("s1"); // start

  // căutare + highlight
  function filter(text){
    const cont = OUT[current];
    const table = cont.querySelector("table");
    if(!table) return;
    const ql = text.trim().toLowerCase();
    table.querySelectorAll(".hit").forEach(td=>td.classList.remove("hit"));
    if(ql===""){
      Array.from(table.tBodies).forEach(tb=>Array.from(tb.rows).forEach(tr=>tr.style.display=""));
      return;
    }
    let first=null;
    Array.from(table.tBodies).forEach(tb=>{
      Array.from(tb.rows).forEach(tr=>{
        let hit=false;
        Array.from(tr.cells).forEach(td=>{
          const t=(td.textContent||"").toLowerCase();
          if(t.includes(ql)){ hit=true; td.classList.add("hit"); }
        });
        tr.style.display = hit ? "" : "none";
        if(hit && !first) first = tr;
      });
    });
    if(first) first.scrollIntoView({behavior:"smooth", block:"center"});
  }
  q.oninput = e => filter(e.target.value);

  // încărcare locală CSV
  file.onchange = e => {
    const f = e.target.files?.[0]; if(!f) return;
    setStatus("Se încarcă: " + f.name + " …");
    const r = new FileReader();
    r.onerror = ()=> setStatus("Eroare la citire.", true);
    r.onload = ev => {
      try{
        const rows = parseCSV(ev.target.result);
        DATA[current] = rows;
        const html = tableHTML(rows);
        OUT[current].innerHTML = html;
        lastHTML = html;
        saveBtn.disabled = !/table/i.test(html);
        setStatus("Încărcat în " + current.toUpperCase());
      }catch(err){ console.error(err); setStatus("CSV invalid.", true); }
    };
    r.readAsText(f);
    e.target.value = "";
  };

  // încărcare din URL (ex: /evolux/data/s1.csv)
  loadUrl.onclick = async ()=>{
    const u = (urlIn.value||"").trim();
    if(!u){ setStatus("Introdu un URL CSV.", true); return; }
    setStatus("Se descarcă din URL…");
    try{
      const res = await fetch(u, {cache:"no-store"});
      if(!res.ok) throw new Error("HTTP "+res.status);
      const txt = await res.text();
      const rows = parseCSV(txt);
      DATA[current] = rows;
      const html = tableHTML(rows);
      OUT[current].innerHTML = html;
      lastHTML = html;
      saveBtn.disabled = !/table/i.test(html);
      setStatus("Încărcat din URL în " + current.toUpperCase());
    }catch(err){ console.error(err); setStatus("Nu am putut descărca CSV-ul.", true); }
  };

  // încărcare din text lipit
  loadText.onclick = ()=>{
    const t = (paste.value||"").trim();
    if(!t){ setStatus("Lipește CSV în câmp.", true); return; }
    try{
      const rows = parseCSV(t);
      DATA[current] = rows;
      const html = tableHTML(rows);
      OUT[current].innerHTML = html;
      lastHTML = html;
      saveBtn.disabled = !/table/i.test(html);
      setStatus("Încărcat din text în " + current.toUpperCase());
    }catch(err){ console.error(err); setStatus("CSV invalid.", true); }
  };

  // export HTML
  saveBtn.onclick = ()=>{
    const htmlDoc = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Tabel</title><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#f3f4f6}.sep-row td{background:#e5e7eb;height:10px;padding:0;border:none}.group-row td{background:#eef2f7;font-weight:700;border-top:2px solid #cbd5e1}</style></head><body>" + lastHTML + "</body></html>";
    const blob = new Blob([htmlDoc], {type:"text/html;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "tabel.html"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1500);
  };

  // (opțional) pre-încărcare automată din repo:
  // fetch("/evolux/data/s1.csv").then(r=>r.ok?r.text():Promise.reject()).then(t=>{ const rows=parseCSV(t); OUT.s1.innerHTML=tableHTML(rows); });
});
