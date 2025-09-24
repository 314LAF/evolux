"use strict";

// CSV -> array de rânduri (fără lib externe, suportă ghilimele duble)
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
  return rows.filter(r => r.some(v => String(v).trim() !== ""));
}

function tableHTML(rows) {
  if (!rows.length) return '<div style="padding:16px;color:#64748b">CSV gol.</div>';
  const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const th = rows[0].map(v => `<th>${esc(v)}</th>`).join("");
  const tb = rows.slice(1).map(r => `<tr>${r.map(v => `<td>${esc(v)}`).join("</td>")}</td></tr>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`;
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

  const OUT = { s1: document.getElementById("out-s1"),
                s2: document.getElementById("out-s2"),
                s3: document.getElementById("out-s3") };

  let current = "s1";
  let lastHTML = "";
  const DATA = { s1:null, s2:null, s3:null };

  // dark mode
  const KEY="csv-theme";
  function apply(t){ const d=t==="dark"; document.body.classList.toggle("dark", d); themeBtn.textContent = d?"Light":"Dark"; }
  apply(localStorage.getItem(KEY) || "light");
  themeBtn.onclick = ()=>{ const n=document.body.classList.contains("dark")?"light":"dark"; localStorage.setItem(KEY,n); apply(n); };

  function setStatus(msg, err=false){ statusEl.textContent = msg || ""; statusEl.style.color = err ? "#b91c1c" : "var(--muted)"; }

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
    b.onclick = ()=>{
      document.querySelectorAll(".tabbtn").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      show(b.dataset.view);
    };
  });
  show("s1"); // pornește cu S1

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
    const htmlDoc = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Tabel</title><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#f3f4f6}</style></head><body>" + lastHTML + "</body></html>";
    const blob = new Blob([htmlDoc], {type:"text/html;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "tabel.html"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1500);
  };

  // (opțional) pre-încărcare automată din repo:
  // fetch("/evolux/data/s1.csv").then(r=>r.ok?r.text():Promise.reject()).then(t=>{ const rows=parseCSV(t); OUT.s1.innerHTML=tableHTML(rows); });
});
