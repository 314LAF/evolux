"use strict";

/* ——— Util: parsare CSV (ghilimele duble suportate) ——— */
function parseCSV(text) {
  const rows = [];
  let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], nx = text[i+1];
    if (inQ) {
      if (ch === '"' && nx === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ""; }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch !== '\r') { cur += ch; }
    }
  }
  row.push(cur); rows.push(row);
  return rows;
}

/* ——— Rander tabel (suport #sep / rând gol și titlu ##); poate primi header forțat ——— */
function tableHTML(rows, forcedHeader /* array or null */) {
  const isEmptyRow = r => !r || r.every(v => String(v ?? "").trim() === "");
  const isSepMarker = r => {
    const c0 = String((r && r[0]) ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();
    return c0 === "#sep" || c0 === "---" || c0 === "—";
  };
  const isGroupTitle = r => {
    const c0 = String((r && r[0]) ?? "").trim().replace(/^["']|["']$/g, "");
    return c0.startsWith("##");
  };

  // găsire header (când NU e forțat): preferă rând cu "timestamp/type/from" sau primul cu >=3 celule nenule
  let headerIdx = -1;
  if (!forcedHeader) {
    const hasKw = r => {
      const keys = r.map(v => String(v).trim().toLowerCase());
      return ["timestamp","type","from"].filter(k => keys.includes(k)).length >= 2;
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      if (isEmptyRow(r) || isSepMarker(r) || isGroupTitle(r)) continue;
      const nonEmpty = r.filter(v => String(v ?? "").trim() !== "").length;
      if (hasKw(r) || nonEmpty >= 3) { headerIdx = i; break; }
    }
  } else {
    // dacă headerul e forțat, caută un rând cu suficiente celule ca start de date; dacă nu, folosim primul rând „plauzibil” ca headerIdx doar ca ancoră
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      if (isEmptyRow(r) || isSepMarker(r)) continue;
      // prima linie care NU e separatoare devine "headerIdx" (datele încep după ea)
      headerIdx = i;
      break;
    }
    if (headerIdx === -1) headerIdx = 0;
  }

  if (headerIdx === -1) return '<div style="padding:16px;color:#64748b">CSV gol.</div>';

  const header = forcedHeader ? forcedHeader.slice() : rows[headerIdx].map(v => String(v ?? ""));
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
    // taie/padează fiecare rând la numărul de coloane din header
    const cells = [];
    for (let c = 0; c < colCount; c++) cells.push(`<td>${esc(r[c] ?? "")}</td>`);
    body += `<tr>${cells.join("")}</tr>`;
  }
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const statusEl = document.getElementById("status");
  const themeBtn = document.getElementById("themeBtn");
  const clearBtn = document.getElementById("clearCache");
  const pinBtn   = document.getElementById("pinBtn");
  const OUT = { s1:document.getElementById("out-s1"), s2:document.getElementById("out-s2"), s3:document.getElementById("out-s3") };

  const q = document.getElementById("q");
  const qCount = document.getElementById("qCount");
  const qPrev = document.getElementById("qPrev");
  const qNext = document.getElementById("qNext");

  let current = "s1";
  let matches = [];
  let mIndex = -1;

  function setStatus(msg, err=false){ statusEl.textContent = msg || ""; statusEl.style.color = err ? "#b91c1c" : "var(--muted)"; }

  /* ——— DARK MODE ——— */
  const THEME_KEY="csv-theme";
  function applyTheme(t){ const d=t==="dark"; document.body.classList.toggle("dark", d); themeBtn.textContent=d?"Light":"Dark"; }
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  themeBtn.onclick = ()=>{ const n=document.body.classList.contains("dark")?"light":"dark"; localStorage.setItem(THEME_KEY,n); applyTheme(n); };

  /* ——— NAV ——— */
  function show(id){
    document.querySelectorAll(".view").forEach(s=>s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    document.querySelectorAll(".tabbtn").forEach(b=>b.classList.toggle("active", b.dataset.view===id));
    current=id;
    runSearch(q.value);
  }
  document.querySelectorAll(".tabbtn").forEach(b=> b.onclick = ()=>show(b.dataset.view));

  /* ——— CACHE (localStorage) ——— */
  const CACHE_KEY="csv-cache-v1";
  const readCache = ()=>{ try{return JSON.parse(localStorage.getItem(CACHE_KEY)||"{}")}catch{return{}} };
  const writeCache = obj => { try{localStorage.setItem(CACHE_KEY, JSON.stringify(obj))}catch{} };
  const saveCSV = (sec, text)=>{ const db=readCache(); db[sec]={csv:text,ts:Date.now()}; writeCache(db); };

  /* ——— ADMIN PIN (global) ——— */
  const ADMIN_PIN = "2468";     // <<< schimbă aici PIN-ul de admin
  const PIN_KEY   = "csv-pin";  // (nefolosit când ADMIN_PIN are valoare)
  let failCount = 0;
  let lockUntil = 0;
  const now = () => Date.now();
  const secs = ms => Math.ceil(ms/1000);

  function checkOrCreateDevicePin() {
    if (ADMIN_PIN) return true;
    let pin = localStorage.getItem(PIN_KEY);
    if (!pin) {
      const make = prompt("Creează un PIN (min 4 caractere) pentru acțiuni sensibile:");
      if (!make || make.length < 4) { setStatus("PIN nu a fost setat.", true); return false; }
      localStorage.setItem(PIN_KEY, make);
      alert("PIN salvat pe acest dispozitiv.");
    }
    return true;
  }

  function verifyPinBefore(actionCb){
    const remain = lockUntil - now();
    if (remain > 0) { setStatus(`Blocat ${secs(remain)}s din cauza încercărilor greșite.`, true); return; }

    if (!checkOrCreateDevicePin()) return;
    const expected = ADMIN_PIN || localStorage.getItem(PIN_KEY) || "";
    const typed = prompt("Introdu PIN-ul pentru a continua:");
    if (typed === expected) {
      failCount = 0;
      actionCb();
    } else {
      failCount++;
      if (failCount >= 3) {
        lockUntil = now() + 30000; // 30s
        failCount = 0;
        setStatus("PIN greșit. Acțiunea este blocată 30s.", true);
      } else {
        setStatus("PIN greșit.", true);
      }
    }
  }

  clearBtn.onclick = ()=> verifyPinBefore(()=>{
    localStorage.removeItem(CACHE_KEY);
    setStatus("Datele locale au fost șterse.");
  });

  pinBtn.onclick = ()=>{
    if (ADMIN_PIN) {
      alert("Proiectul folosește PIN organizație (ADMIN_PIN în app.js). Butonul nu poate schimba acest PIN.");
      return;
    }
    const cur = localStorage.getItem(PIN_KEY) || "";
    const next = prompt(cur ? "Schimbă PIN-ul (min 4 caractere):" : "Setează PIN (min 4 caractere):", "");
    if (next && next.length >= 4) {
      localStorage.setItem(PIN_KEY, next);
      alert("PIN actualizat.");
    } else if (next !== null) {
      setStatus("PIN prea scurt. Nicio schimbare.", true);
    }
  };

  /* ——— HEADER FORȚAT pentru S2 ——— */
  const FORCED_HEADERS = {
    s2: ["Timestamp","Type","Stop 1 Info","Route","Sender"]
    // s1 și s3 rămân auto-detectate
  };

  /* ——— LOAD din repo (implicit) ——— */
  async function loadDefaultFromRepo(){
    const defaults={ s1:"./data/s1.csv", s2:"./data/s2.csv", s3:"./data/s3.csv" };
    const db = readCache();
    for(const sec of ["s1","s2","s3"]){
      try{
        const res=await fetch(defaults[sec], {cache:"no-store"});
        if(!res.ok) {
          if(db[sec]?.csv){ OUT[sec].innerHTML = tableHTML(parseCSV(db[sec].csv), FORCED_HEADERS[sec] || null); }
          continue;
        }
        const txt=await res.text();
        OUT[sec].innerHTML = tableHTML(parseCSV(txt), FORCED_HEADERS[sec] || null);
        saveCSV(sec, txt);
      }catch{
        if(db[sec]?.csv) OUT[sec].innerHTML = tableHTML(parseCSV(db[sec].csv), FORCED_HEADERS[sec] || null);
      }
    }
  }

  /* ——— SEARCH clasic: x/y + next/prev ——— */
  function runSearch(text){
    document.querySelectorAll(".hit").forEach(td=>td.classList.remove("hit","focus"));
    matches = []; mIndex = -1;
    qCount.textContent = "0/0"; qPrev.disabled = qNext.disabled = true;

    const cont = OUT[current];
    const table = cont.querySelector("table"); if(!table) return;

    const ql = (text||"").trim().toLowerCase();
    if(!ql){ return; }

    Array.from(table.tBodies).forEach(tb=>{
      Array.from(tb.rows).forEach(tr=>{
        Array.from(tr.cells).forEach(td=>{
          const t=(td.textContent||"").toLowerCase();
          if(t.includes(ql)){ td.classList.add("hit"); matches.push(td); }
        });
      });
    });

    if(matches.length){
      mIndex = 0;
      focusMatch(0);
      qCount.textContent = `1/${matches.length}`;
      qPrev.disabled = qNext.disabled = false;
    } else {
      qCount.textContent = "0/0";
    }
  }

  function focusMatch(i){
    matches.forEach(td=>td.classList.remove("focus"));
    if(!matches[i]) return;
    const td = matches[i];
    td.classList.add("focus");
    td.scrollIntoView({behavior:"smooth", block:"center"});
    qCount.textContent = `${i+1}/${matches.length}`;
  }

  q.oninput = e => runSearch(e.target.value);
  q.onkeydown = e => {
    if(e.key === "Enter"){
      e.preventDefault();
      if(!matches.length) return;
      if(e.shiftKey){ mIndex = (mIndex - 1 + matches.length) % matches.length; }
      else          { mIndex = (mIndex + 1) % matches.length; }
      focusMatch(mIndex);
    }
  };
  qPrev.onclick = ()=>{ if(matches.length){ mIndex = (mIndex - 1 + matches.length) % matches.length; focusMatch(mIndex); } };
  qNext.onclick = ()=>{ if(matches.length){ mIndex = (mIndex + 1) % matches.length; focusMatch(mIndex); } };

  /* init */
  show("s1");
  loadDefaultFromRepo().then(()=> runSearch(q.value||""));
});
