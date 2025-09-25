/* ========= utilitare generale ========= */

const ls = window.localStorage;
const THEME_KEY = "app-theme";
const ADMIN_PIN = "1234"; // <<<<< schimbă după nevoie

function applyTheme(t) {
  document.body.classList.toggle("dark", t === "dark");
  const b = document.getElementById("themeBtn");
  b.textContent = document.body.classList.contains("dark") ? "Light" : "Dark";
}
function setTheme(t){ ls.setItem(THEME_KEY,t); applyTheme(t); }

/* CSV via PapaParse (robust) */
async function fetchCsv(url){
  const res = await fetch(url, { cache: "no-store" });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const parsed = Papa.parse(text, {
    header:true,
    skipEmptyLines:"greedy",
    transformHeader:h => (h||"").trim(),
    transform:v => (v ?? "").trim()
  });
  if(parsed.errors?.length){
    console.warn("CSV warnings:", parsed.errors.slice(0,5));
  }
  return parsed.data; // array of objects
}

/* creează tabel generic din rows și headerele date */
function tableFromRows(rows, headers) {
  const esc = s => String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const th = `<thead><tr>${headers.map(h=>`<th>${esc(h)}`).join("")}</tr></thead>`;
  const tb = `<tbody>${
    rows.map(r => `<tr>${headers.map(h => `<td>${esc(r[h] ?? "")}</td>`).join("")}</tr>`).join("")
  }</tbody>`;
  return `<table>${th}${tb}</table>`;
}

/* ========= căutare cu highlight + navigare ========= */

const Search = {
  matches: [],
  idx: -1,
  input: null,
  info: null,
  onKey(e){
    if(e.key === "Enter"){
      if(e.shiftKey) Search.prev(); else Search.next();
      e.preventDefault();
    }
  },
  scan(){
    const q = (Search.input.value || "").trim().toLowerCase();
    const info = Search.info;
    Search.matches = [];
    Search.idx = -1;
    const active = document.querySelector(".view:not([hidden])");
    if(!active){ info.textContent = "0/0"; return; }
    const table = active.querySelector("table");
    if(!table){ info.textContent = "0/0"; return; }

    table.querySelectorAll("td.hit").forEach(td=>td.classList.remove("hit"));

    if(!q){ info.textContent = "0/0"; return; }

    table.querySelectorAll("tbody td").forEach(td=>{
      if((td.textContent||"").toLowerCase().includes(q)){
        td.classList.add("hit");
        Search.matches.push(td);
      }
    });
    info.textContent = `0/${Search.matches.length}`;
  },
  goto(n){
    if(!Search.matches.length) return;
    if(n<0) n = Search.matches.length-1;
    if(n>=Search.matches.length) n = 0;
    Search.idx = n;
    const td = Search.matches[Search.idx];
    td.scrollIntoView({behavior:"smooth", block:"center"});
    Search.info.textContent = `${Search.idx+1}/${Search.matches.length}`;
  },
  next(){ Search.goto(Search.idx + 1); },
  prev(){ Search.goto(Search.idx - 1); }
};

/* ========= S2 – normalizare strictă ========= */

const DAY_RX = /(Luni|Mar[țt]i|Miercuri|Joi|Vineri|S[aâ]mb[ăa]t[ăa]|Duminic[ăa])$/i;
const TIME_RX = /([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const XAR1_RX = /(.*?\bXAR1)\b/i;
const EMAIL_RX = /<[^<>@\s]+@[^<>@\s]+>/;

function normalizeS2Row(raw){
  let ts   = raw["Timestamp"] || raw["Timp"] || raw["Time"] || raw[Object.keys(raw)[0]] || "";
  let stop = raw["Stop 1 Info"] || raw["Step 1 Info"] || raw["Stop 1"] || "";
  let route= raw["Route"] || raw["Rută"] || "";
  let snd  = raw["Sender"] || raw["Expeditor"] || "";

  // Timestamp: până la zi
  if(typeof ts === "string"){
    ts = ts.trim();
    if(!DAY_RX.test(ts)){
      const join = [ts, stop, route, snd].join(" ");
      const m = join.match(DAY_RX);
      if(m){
        const cut = join.indexOf(m[0]) + m[0].length;
        ts = join.slice(0, cut).trim();
      }
    }
  }

  // Stop 1 Info: până la ultima oră
  if(typeof stop === "string"){
    const m = stop.match(TIME_RX);
    if(m){
      stop = stop.slice(0, stop.lastIndexOf(m[0]) + m[0].length).trim();
    }else{
      const join = [stop, route, snd].join(" ");
      const mm = join.match(TIME_RX);
      if(mm){
        const cut = join.indexOf(mm[0]) + mm[0].length;
        stop = join.slice(0, cut).trim();
        if(route.startsWith(stop)) route = route.slice(stop.length).trim();
      }
    }
  }

  // Route: până la XAR1
  if(typeof route === "string"){
    const m = route.match(XAR1_RX);
    if(m) route = m[1].trim();
  }

  // Sender: „Nume Prenume <email>” dacă există email
  if(typeof snd === "string"){
    snd = snd.replace(/\s+/g," ").trim();
    const m = snd.match(EMAIL_RX);
    if(m){
      const email = m[0];
      const name = snd.replace(EMAIL_RX,"").trim().replace(/[–-]\s*$/,"");
      snd = name ? `${name} ${email}` : email;
    }
  }

  return {
    "Timestamp": ts,
    "Stop 1 Info": stop,
    "Route": route,
    "Sender": snd
  };
}

/* ========= încărcare & randare secțiuni ========= */

async function loadS1(){
  const host = './data/s1.csv?_=' + Date.now();
  const out = document.getElementById('out-s1');
  try{
    const rows = await fetchCsv(host);

    // elimină comentarii/separatoare (#, //, #sep)
    const filtered = rows.filter(r=>{
      const s = Object.values(r).join("").trim();
      return s && !/^#/.test(s) && !/^\/\//.test(s) && !/^#sep$/i.test(s);
    });

    // headere din CSV în ordinea originală
    const headers = Object.keys(rows[0] || {});
    out.innerHTML = tableFromRows(filtered, headers);
  }catch(e){
    console.error(e);
    out.innerHTML = `<div style="padding:16px;color:#64748b">Nu am putut încărca S1.</div>`;
  }
}

async function loadS2(){
  const host = './data/s2.csv?_=' + Date.now();
  const out = document.getElementById('out-s2');
  try{
    const raw = await fetchCsv(host);
    const cleaned = raw.filter(r=>{
      const s = Object.values(r).join("").trim();
      return s && !/^#/.test(s) && !/^\/\//.test(s) && !/^#sep$/i.test(s);
    });
    const rows = cleaned.map(normalizeS2Row);
    const headers = ["Timestamp","Stop 1 Info","Route","Sender"]; // LOCKED
    out.innerHTML = tableFromRows(rows, headers);
  }catch(e){
    console.error(e);
    const msg = (e.message||"").includes("404") ? "Nu am putut încărca S2 (HTTP 404)." : "Nu am putut încărca S2.";
    out.innerHTML = `<div style="padding:16px;color:#64748b">${msg}</div>`;
  }
}

/* ========= inițializare UI ========= */

document.addEventListener('DOMContentLoaded', () => {
  // theme
  applyTheme(ls.getItem(THEME_KEY) || "light");
  document.getElementById('themeBtn').addEventListener('click', ()=>{
    setTheme(document.body.classList.contains('dark') ? "light" : "dark");
  });

  // nav
  document.querySelectorAll('.nav').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.nav').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.dataset.target;
      document.querySelectorAll('.view').forEach(v=>v.hidden = (v.id !== id));
      // recalcul căutarea pe view-ul curent
      Search.scan();
    });
  });

  // search
  Search.input = document.getElementById('search');
  Search.info = document.getElementById('searchInfo');
  Search.input.addEventListener('input', ()=>Search.scan());
  Search.input.addEventListener('keydown', Search.onKey);
  document.getElementById('nextBtn').addEventListener('click', ()=>Search.next());
  document.getElementById('prevBtn').addEventListener('click', ()=>Search.prev());

  // clear local (cu PIN)
  document.getElementById('clearLocal').addEventListener('click', ()=>{
    const pin = prompt("Introdu PIN de administrator pentru a șterge cache-ul local:");
    if(pin === ADMIN_PIN){
      // în prezent folosim localStorage doar pentru theme; dar lăsăm mecanismul pentru viitor
      const keepTheme = ls.getItem(THEME_KEY);
      ls.clear();
      if(keepTheme) ls.setItem(THEME_KEY, keepTheme);
      alert("Datele locale au fost șterse.");
    }else if(pin !== null){
      alert("PIN greșit.");
    }
  });

  // load data
  loadS1();
  loadS2();
});
