"use strict";

document.addEventListener("DOMContentLoaded", function () {
  // --- Elemente UI
  var menuBtn = document.getElementById("menuBtn");
  var drawer = document.getElementById("drawer");
  var homeBtn = document.getElementById("homeBtn");
  var backBtn = document.getElementById("backBtn");
  var themeBtn = document.getElementById("themeBtn");
  var searchInput = document.getElementById("searchInput");
  var fileInput = document.getElementById("file");
  var saveBtn = document.getElementById("saveHtml");
  var statusEl = document.getElementById("status");

  function setStatus(msg, isErr) {
    if (isErr === void 0) isErr = false;
    statusEl.textContent = msg || "";
    statusEl.style.color = isErr ? "#b91c1c" : "var(--muted)";
  }

  // --- Dark mode
  var THEME_KEY = "app-theme";
  function applyTheme(t) {
    var isDark = t === "dark";
    document.body.classList.toggle("dark", isDark);
    themeBtn.textContent = isDark ? "Light" : "Dark";
  }
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  themeBtn.addEventListener("click", function () {
    var next = document.body.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // --- Stare
  var historyStack = ["home"];
  var currentView = "home";
  var workbooks = { s1: null, s2: null, s3: null };
  var lastHTML = "";

  function showView(id) {
    if (currentView !== id) historyStack.push(id);
    currentView = id;
    Array.prototype.forEach.call(document.querySelectorAll(".view"), function (v) {
      v.classList.remove("active");
    });
    document.getElementById(id).classList.add("active");
    Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function (b) {
      b.classList.toggle("active", b.dataset.section === id);
    });
    saveBtn.disabled = !document.querySelector("#" + id + " .out table");
    searchInput.value = "";
  }

  Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function (b) {
    b.addEventListener("click", function () {
      showView(b.dataset.section);
      drawer.classList.remove("open");
    });
  });

  menuBtn.addEventListener("click", function () {
    var isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (isMobile) drawer.classList.toggle("open");
    else document.querySelector(".app").classList.toggle("nav-collapsed");
  });
  homeBtn.addEventListener("click", function () { showView("home"); });
  backBtn.addEventListener("click", function () {
    if (historyStack.length > 1) {
      historyStack.pop();
      var prev = historyStack[historyStack.length - 1];
      showView(prev);
    }
  });

  // --- Cautare + highlight
  function filterRows(query) {
    var container = document.querySelector("#" + currentView + " .out");
    var table = container && container.querySelector("table");
    if (!table) return;
    var q = query.trim().toLowerCase();
    Array.prototype.forEach.call(table.querySelectorAll(".hit"), function (td) {
      td.classList.remove("hit");
    });
    if (q === "") {
      Array.prototype.forEach.call(table.tBodies, function (tb) {
        Array.prototype.forEach.call(tb.rows, function (tr) { tr.style.display = ""; });
      });
      return;
    }
    var firstHitRow = null;
    Array.prototype.forEach.call(table.tBodies, function (tb) {
      Array.prototype.forEach.call(tb.rows, function (tr) {
        var hit = false;
        Array.prototype.forEach.call(tr.cells, function (td) {
          var t = (td.textContent || "").toLowerCase();
          if (t.indexOf(q) !== -1) { hit = true; td.classList.add("hit"); }
        });
        tr.style.display = hit ? "" : "none";
        if (hit && !firstHitRow) firstHitRow = tr;
      });
    });
    if (firstHitRow) firstHitRow.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  searchInput.addEventListener("input", function (e) { filterRows(e.target.value); });

  // --- Randare curata a foilor (detectie header + eliminare goluri)
  function sheetToCleanHTML(sheet) {
    var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    // gaseste randul de header: macar 2 din 3 chei tipice
    var headerIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      var keys = rows[i].map(function (v) { return String(v).trim().toLowerCase(); });
      var hits = ["timestamp","type","from"].filter(function (k) { return keys.indexOf(k) !== -1; }).length;
      if (hits >= 2) { headerIdx = i; break; }
    }
    if (headerIdx === -1) {
      for (var j = 0; j < rows.length; j++) {
        if (rows[j].some(function (v) { return String(v).trim() !== ""; })) { headerIdx = j; break; }
      }
      if (headerIdx === -1) {
        return '<div style="padding:16px;color:#64748b">Foaia nu conține celule cu text.</div>';
      }
    }

    var header = rows[headerIdx];
    var bodyRows = rows.slice(headerIdx + 1);

    // ultima coloană cu continut in body
    var lastCol = header.length;
    bodyRows.forEach(function (r) {
      for (var c = r.length - 1; c >= 0; c--) {
        if (String(r[c]).trim() !== "") { lastCol = Math.max(lastCol, c + 1); break; }
      }
    });

    var trimmedHeader = header.slice(0, lastCol);
    var cleanRows = bodyRows
      .map(function (r) { return r.slice(0, lastCol); })
      .filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });

    if (cleanRows.length === 0) {
      return '<div style="padding:16px;color:#64748b">Nu s-au găsit rânduri cu date sub header.</div>';
    }

    function esc(s) {
      return String(s).replace(/[&<>"]/g, function (m) {
        return ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" })[m];
      });
    }

    var ths = trimmedHeader.map(function (v) { return "<th>" + esc(v) + "</th>"; }).join("");
    var trs = cleanRows.map(function (r) {
      return "<tr>" + r.map(function (v) { return "<td>" + esc(v) + "</td>"; }).join("") + "</tr>";
    }).join("");

    return "<table><thead><tr>" + ths + "</tr></thead><tbody>" + trs + "</tbody></table>";
  }

  // --- Render workbook
  function renderWorkbook(section, wb) {
    var tabs = document.getElementById("tabs-" + section);
    tabs.innerHTML = "";
    tabs.hidden = false;
    var first = wb.SheetNames[0];
    wb.SheetNames.forEach(function (name, idx) {
      var b = document.createElement("button");
      b.className = "tab" + (idx === 0 ? " active" : "");
      b.textContent = name;
      b.onclick = function () {
        Array.prototype.forEach.call(tabs.querySelectorAll(".tab"), function (t) { t.classList.remove("active"); });
        b.classList.add("active");
        showSheet(section, name);
      };
      tabs.appendChild(b);
    });
    showSheet(section, first);
  }

  // --- Arata foaia curenta
  function showSheet(section, name) {
    var out = document.getElementById("out-" + section);
    var html = sheetToCleanHTML(workbooks[section].Sheets[name]);
    out.innerHTML = html;

    if (currentView === section) {
      lastHTML = html;
      saveBtn.disabled = !/table/i.test(html);
    }

    var table = out.querySelector("table");
    if (table) {
      table.style.display = "block";
      table.style.overflow = "auto";
      table.style.maxWidth = "100%";
    }

    if (currentView === section && searchInput.value) filterRows(searchInput.value);
    out.scrollIntoView({ behavior: "instant", block: "start" });
  }

  // --- Upload robust (CSV + XLSX/XLS cu fallback)
  function parseFileFor(section, file) {
    setStatus("Se încarcă: " + file.name + " …");
    var ext = (file.name.split(".").pop() || "").toLowerCase();

    if (ext === "csv") {
      var r = new FileReader();
      r.onerror = function () { setStatus("Eroare la citirea fișierului.", true); };
      r.onload = function (e) {
        try {
          var wb1 = XLSX.read(e.target.result, { type: "string" });
          workbooks[section] = wb1;
          renderWorkbook(section, wb1);
          showView(section);
          setStatus("Încărcat CSV în " + section.toUpperCase());
        } catch (err) {
          console.error(err);
          setStatus("CSV invalid.", true);
        }
      };
      r.readAsText(file);
      return;
    }

    var reader = new FileReader();
    reader.onerror = function () { setStatus("Eroare la citirea fișierului.", true); };
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(e.target.result, { type: "array" });
        workbooks[section] = wb;
        renderWorkbook(section, wb);
        showView(section);
        setStatus("Încărcat în " + section.toUpperCase());
      } catch (err1) {
        try {
          var r2 = new FileReader();
          r2.onload = function (e2) {
            try {
              var wb2 = XLSX.read(e2.target.result, { type: "binary" });
              workbooks[section] = wb2;
              renderWorkbook(section, wb2);
              showView(section);
              setStatus("Încărcat (fallback) în " + section.toUpperCase());
            } catch (err2) {
              console.error(err2);
              setStatus("Nu am reușit să interpretez fișierul. Încearcă .xlsx/.xls/.csv.", true);
            }
          };
          r2.readAsBinaryString(file);
        } catch (e2) {
          console.error(err1);
          setStatus("Fișierul nu a putut fi procesat.", true);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  }

  fileInput.addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var target = ["s1","s2","s3"].indexOf(currentView) !== -1 ? currentView : "s1";
    parseFileFor(target, f);
    e.target.value = "";
  });

  ["s1","s2","s3"].forEach(function (section) {
    var drop = document.getElementById("drop-" + section);
    ["dragenter","dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("dragover"); });
    });
    ["dragleave","drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("dragover"); });
    });
    drop.addEventListener("drop", function (e) {
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) parseFileFor(section, f);
    });
  });

  saveBtn.addEventListener("click", function () {
    var htmlDoc = "<!doctype html><html lang=\"ro\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>Tabel exportat</title><style>table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#f3f4f6}</style></head><body>" + lastHTML + "</body></html>";
    var blob = new Blob([htmlDoc], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "tabel.html";
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  });
});
