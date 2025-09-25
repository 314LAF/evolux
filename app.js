/* app.js — vizualizator CSV (S1 + S2) cu parsare robustă */
(() => {
  // === Config ===
  const PATHS = {
    s1: "data/s1.csv",
    s2: "data/s2.csv",
  };

  // Regex utilitare (RO)
  const ZILE = "(Luni|Marți|Miercuri|Joi|Vineri|Sâmbătă|Duminică)";
  const RE_TS_ENDS_WEEKDAY = new RegExp(`^\\s*(.+?\\s-\\s${ZILE})\\s*(?:.*)$`, "i");
  const RE_TIME_IN_TEXT = /(.+?\b\d{2}:\d{2}:\d{2})/;      // ia până la ultima oră
  const RE_ROUTE_XAR1    = /(.+?XAR1)\b/i;                 // taie după XAR1
  const RE_SENDER        = /\s*([^<>,]+?)\s*<([^>]+)>\s*$/; // „Nume Prenume <mail>”

  // Elemente UI
  const el = (id) => document.getElementById(id);
  const outS1 = el("out-s1");
  const outS2 = el("out-s2");
  const statusEl = el("status") || { textContent:"" };

  // Dark toggle simplu
  const themeBtn = el("themeBtn");
  const THEME_KEY = "app-theme";
  const applyTheme = (t) => {
    document.body.classList.toggle("dark", t === "dark");
    if (themeBtn) themeBtn.textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
  };
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  themeBtn?.addEventListener("click", () => {
    const next = document.body.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // Helpers
  const setStatus = (msg, err=false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.style.color = err ? "#b91c1c" : "var(--muted)";
  };

  const fetchText = async (url) => {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.text();
  };

  // Papa Parse (din xlsx.full.min.js nu avem Papa; îl folosim inline via global dacă e inclus;
  // pe GitHub Pages avem Papa? Dacă nu, folosim un parser minimal.)
  // Ca să fim siguri, implementăm o parsare simplă compatibilă cu CSV cu ghilimele.
  function parseCSV(text) {
    // Dacă există Papa, folosește-l (mai tolerant)
    if (window.Papa) {
      const out = Papa.parse(text, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => (h || "").trim(),
      });
      return { rows: out.data, fields: out.meta.fields || [] };
    }

    // Parser minimalist pentru CSV în ghilimele duble
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    if (!lines.length) return { rows: [], fields: [] };

    // Sparge o linie CSV respectând ghilimelele
    const splitCSV = (line) => {
      const cells = [];
      let cur = "", q = false;
      for (let i=0; i<line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i+1] === '"') { cur += '"'; i++; }
          else q = !q;
        } else if (ch === ',' && !q) {
          cells.push(cur); cur = "";
        } else {
          cur += ch;
        }
      }
      cells.push(cur);
      return cells.map(s => s.trim());
    };

    const headerCells = splitCSV(lines[0]).map(h => h.trim());
    const rows = [];
    for (let i=1; i<lines.length; i++) {
      const ln = lines[i];
      if (!ln) continue;
      const cells = splitCSV(ln);
      const obj = {};
      headerCells.forEach((h, idx) => obj[h] = (cells[idx] ?? "").trim());
      // sare rândurile complet goale
      if (Object.values(obj).some(v => v !== "")) rows.push(obj);
    }
    return { rows, fields: headerCells };
  }

  // Render tabel simplu
  function renderTable(container, rows, columns) {
    container.innerHTML = "";
    const table = document.createElement("table");

    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    columns.forEach(c => {
      const th = document.createElement("th");
      th.textContent = c;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      columns.forEach(c => {
        const td = document.createElement("td");
        td.textContent = r[c] ?? "";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.appendChild(table);
  }

  // ========= S2 – normalizare strictă pe 4 coloane =========
  function normalizeS2Row(r) {
    let ts = (r["Timestamp"] ?? r["timestamp"] ?? "").trim();
    let stop1 = (r["Stop 1 Info"] ?? r["Stop1"] ?? r["Stop 1"] ?? "").trim();
    let route = (r["Route"] ?? "").trim();
    let sender = (r["Sender"] ?? "").trim();

    // Timestamp -> păstrează până la „ - Zi”
    const mTs = ts.match(RE_TS_ENDS_WEEKDAY);
    if (mTs) ts = mTs[1].trim();

    // Stop 1 -> până la ultima oră găsită
    const mSt = stop1.match(RE_TIME_IN_TEXT);
    if (mSt) stop1 = mSt[1].trim();

    // Route -> taie până la XAR1
    const mRt = route.match(RE_ROUTE_XAR1);
    if (mRt) route = mRt[1].trim();

    // Sender -> doar „Nume Prenume <mail>”
    const mSd = sender.match(RE_SENDER);
    if (mSd) sender = `${mSd[1].trim()} <${mSd[2].trim()}>`;

    return {
      Timestamp: ts,
      "Stop 1 Info": stop1,
      Route: route,
      Sender: sender,
    };
  }

  async function loadS2() {
    try {
      const txt = await fetchText(PATHS.s2);
      const { rows } = parseCSV(txt);

      // Elimină rânduri #sep și rânduri complet goale
      const cleared = rows.filter(r =>
        r && Object.values(r).some(v => (v ?? "").trim() !== "") &&
        !Object.values(r).some(v => (v ?? "").trim().toLowerCase() === "#sep")
      );

      const normalized = cleared.map(normalizeS2Row);
      renderTable(outS2, normalized, ["Timestamp","Stop 1 Info","Route","Sender"]);
      setStatus("");
    } catch (e) {
      outS2.innerHTML = `<div class="card" style="padding:16px">Nu am putut încărca S2 (HTTP ${e.message || e}).</div>`;
    }
  }

  // ========= S1 – afișează tot ce e în CSV, fără să „mixeze” coloane =========
  async function loadS1() {
    try {
      const txt = await fetchText(PATHS.s1);
      const { rows, fields } = parseCSV(txt);

      // filtrează rânduri complet goale; ignoră coloane goale 100%
      const liveFields = fields.filter(k => rows.some(r => (r[k] ?? "").trim() !== ""));
      const cleanedRows = rows
        .filter(r => liveFields.some(k => (r[k] ?? "").trim() !== ""))
        .map(r => {
          const o = {};
          liveFields.forEach(k => o[k] = (r[k] ?? "").trim());
          return o;
        });

      renderTable(outS1, cleanedRows, liveFields);
    } catch (e) {
      outS1.innerHTML = `<div class="card" style="padding:16px">Nu am putut încărca S1 (HTTP ${e.message || e}).</div>`;
    }
  }

  // Căutare (numără rezultate + navigare Enter / Shift+Enter)
  const search = el("searchInput");
  let searchHits = [];
  let searchIdx = 0;

  function clearHits() {
    document.querySelectorAll("td.hit").forEach(td => td.classList.remove("hit"));
    searchHits = []; searchIdx = 0;
    const counter = el("searchCount"); if (counter) counter.textContent = "0/0";
  }

  function collectHits(query) {
    clearHits();
    if (!query) return;
    const q = query.toLowerCase();
    const activeView = document.querySelector(".view.active .out table") || document.querySelector(".view .out table");
    if (!activeView) return;
    const tds = Array.from(activeView.querySelectorAll("tbody td"));
    tds.forEach(td => {
      if ((td.textContent || "").toLowerCase().includes(q)) {
        td.classList.add("hit");
        searchHits.push(td);
      }
    });
    const counter = el("searchCount"); 
    if (counter) counter.textContent = `${searchHits.length ? 1 : 0}/${searchHits.length}`;
    if (searchHits.length) {
      searchIdx = 0;
      searchHits[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function stepHit(dir) {
    if (!searchHits.length) return;
    searchIdx = (searchIdx + dir + searchHits.length) % searchHits.length;
    searchHits[searchIdx].scrollIntoView({ behavior: "smooth", block: "center" });
    const counter = el("searchCount");
    if (counter) counter.textContent = `${searchIdx + 1}/${searchHits.length}`;
  }

  search?.addEventListener("input", (e) => collectHits(e.target.value));
  search?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      stepHit(e.shiftKey ? -1 : +1);
      e.preventDefault();
    }
  });
  el("hitPrev")?.addEventListener("click", () => stepHit(-1));
  el("hitNext")?.addEventListener("click", () => stepHit(+1));

  // Load all
  (async () => {
    setStatus("Se încarcă datele…");
    await Promise.all([loadS1(), loadS2()]);
    setStatus("");
  })();
})();
