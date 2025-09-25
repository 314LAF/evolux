/* =========================
   1) UTIL: escapeHtml (o singură dată în fișier; dacă o ai deja, sari peste)
========================= */
function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, m => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]
  ));
}

/* =========================
   2) PARSER-ul S3 pe „blocuri”
   Format acceptat:
     Timestamp,From,Lane
     LANE-only
     LANE-only
     #sep          (opțional, separator vizual)
     Timestamp,From,Lane
     LANE-only
     ...
========================= */
function parseS3Blocks(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  let cur = null;

  const isBlockStart = (line) => {
    if (!line) return false;
    // are cel puțin 2 virgule (ts, from, lane) sau arată ca o dată + virgulă
    if ((line.match(/,/g) || []).length >= 2) return true;
    return /^\d{2}\.\d{2}\.\d{4}\s/.test(line) && line.includes(',');
  };

  for (let raw of lines) {
    let line = raw.trim();
    if (!line) continue;

    // Comentarii / separatori
    if (line.startsWith('##')) continue;           // comentarii
    if (line === '#sep') { rows.push({__sep:true}); continue; }

    if (isBlockStart(line)) {
      // finalizează blocul anterior
      if (cur) rows.push(cur);

      // taie DOAR primele 2 virgule: ts, from | lane-rest
      const first = line.indexOf(',');
      const second = line.indexOf(',', first + 1);
      const ts = line.slice(0, first).trim();
      const from = line.slice(first + 1, second).trim();
      let lane = line.slice(second + 1).trim();

      // curăță ghilimelele închizătoare (dacă apar)
      if ((lane.startsWith('"') && lane.endsWith('"')) || (lane.startsWith("'") && lane.endsWith("'"))) {
        lane = lane.slice(1, -1).trim();
      }

      cur = { Timestamp: ts, From: from, Lane: [] };
      if (lane) cur.Lane.push(lane);
      continue;
    }

    // linie doar cu LANE
    if (cur) {
      if ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith("'") && line.endsWith("'"))) {
        line = line.slice(1, -1).trim();
      }
      if (line) cur.Lane.push(line);
    }
  }

  if (cur) rows.push(cur);
  return rows;
}

/* =========================
   3) RANDER: tabel pentru S3
========================= */
function renderS3(rows) {
  const out = document.getElementById('out-s3');
  if (!out) return;

  let html = '<table><thead><tr>'
    + '<th>Timestamp</th><th>From</th><th>Lane</th>'
    + '</tr></thead><tbody>';

  rows.forEach(r => {
    if (r.__sep) {
      html += `<tr class="sep-row"><td colspan="3">#sep</td></tr>`;
      return;
    }
    const lanes = Array.isArray(r.Lane) ? r.Lane : [];
    const first = lanes[0] || '';
    const rest = lanes.slice(1);
    const expander = rest.length
      ? `<details class="lanes">
           <summary>${escapeHtml(first)} <span class="muted">( +${rest.length} )</span></summary>
           <div class="lanes-all">${rest.map(x=>`<div>${escapeHtml(x)}</div>`).join('')}</div>
         </details>`
      : `<span>${escapeHtml(first)}</span>`;

    html += `<tr>
      <td>${escapeHtml(r.Timestamp || '')}</td>
      <td>${escapeHtml(r.From || '')}</td>
      <td>${expander}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  out.innerHTML = html;
}

/* =========================
   4) LOAD: descarcă /data/s3.csv și afișează
========================= */
async function loadS3() {
  const out = document.getElementById('out-s3');
  if (!out) return;
  try {
    out.innerHTML = '<div class="muted">Se încarcă S3…</div>';
    const res = await fetch('./data/s3.csv', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const rows = parseS3Blocks(text);
    renderS3(rows);
  } catch (e) {
    out.innerHTML = `<div class="empty">Nu am putut încărca S3 (${escapeHtml(e.message)}).</div>`;
  }
}

/* =========================
   5) HOOK: cheamă loadS3 când intri în secțiunea S3
   (Adaptează la routerul tău existent.)
========================= */
// Exemplu – dacă ai butonul din meniu cu data-section="s3"
const s3Btn = document.querySelector('[data-section="s3"]');
if (s3Btn) {
  s3Btn.addEventListener('click', () => {
    // showView('s3'); // <- păstrează dacă ai funcția ta de navigare
    loadS3();
  });
}

/* Dacă vrei să încarce automat la prima deschidere a paginii, poți apela:
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('s3')?.classList.contains('active')) {
    loadS3();
  }
});
*/
