// Runs on mintsh.de pages — collects exercise data and sends it to the popup

// Walk the DOM and produce text that respects block-element line breaks
function domToText(node) {
  const BLOCK = new Set(['P', 'DIV', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4', 'TR', 'TD']);
  let out = '';

  function walk(n) {
    if (n.nodeType === Node.TEXT_NODE) { out += n.textContent; return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const tag = n.tagName;
    if (tag === 'BR') { out += '\n'; return; }
    if (BLOCK.has(tag)) out += '\n';
    for (const child of n.childNodes) walk(child);
    if (BLOCK.has(tag)) out += '\n';
  }

  walk(node);
  return out;
}

// Parse a JSXGraph srcdoc attribute string → human-readable line description
function parseJSXGraphSrcdoc(encoded) {
  // Decode HTML entities embedded in the srcdoc attribute
  const src = encoded
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

  // Bounding box: boundingbox: [xmin, ymax, xmax, ymin]
  const bbM = src.match(/boundingbox:\s*\[([^\]]+)\]/);
  const bb  = bbM ? bbM[1].split(',').map(s => parseFloat(s.trim())) : null;

  // Points: var pN = b.create('point', [x, y], {name:'...', Color:'...'})
  const ptMatches = [...src.matchAll(/var\s+(p\w+)\s*=\s*b\.create\s*\(\s*'point'\s*,\s*\[([^\]]+)\]\s*,\s*\{([^}]*)\}/g)];
  const pts = {};
  for (const m of ptMatches) {
    const [x, y] = m[2].split(',').map(s => parseFloat(s.trim()));
    const nmM = m[3].match(/name:\s*['"]([^'"]*)['"]/);
    const clM = m[3].match(/Color:\s*['"]([^'"]+)['"]/);
    pts[m[1]] = { x, y, name: (nmM?.[1] ?? '').trim(), color: clM?.[1] ?? '' };
  }

  // Lines: b.create('line', [pA, pB], {strokeColor:'...'})
  const liMatches = [...src.matchAll(/b\.create\s*\(\s*'line'\s*,\s*\[(\w+)\s*,\s*(\w+)\]\s*,\s*\{([^}]*)\}/g)];
  const lines = liMatches.map(m => {
    const clM   = m[3].match(/strokeColor:\s*['"]([^'"]+)['"]/);
    const ptA   = pts[m[1]], ptB = pts[m[2]];
    // Use the point whose name is not blank or a space as the line label
    const label = ptB?.name && ptB.name !== ' ' ? ptB.name
                : ptA?.name && ptA.name !== ' ' ? ptA.name : '?';
    return { varA: m[1], varB: m[2], color: clM?.[1] ?? '', label };
  });

  // Input bindings: stack_jxg.bind_point(anspNRef, pN)
  const bindMatches = [...src.matchAll(/bind_point\s*\(\s*(\w+?)Ref\s*,\s*(\w+)\s*\)/g)];
  const bindings = {}; // point-var → input-name
  for (const m of bindMatches) bindings[m[2]] = m[1];

  // Polygon (feasible region preview drawn in the iframe)
  const polyM = src.match(/b\.create\s*\(\s*'polygon'\s*,\s*\[([^\]]+)\]/);
  const polyVars = polyM ? polyM[1].split(',').map(s => s.trim()) : [];

  // --- Build description ---
  const xRange = bb ? `${bb[0]} bis ${bb[2]}` : '?';
  const yRange = bb ? `${bb[3]} bis ${bb[1]}` : '?';

  let out = `[JSXGraph Interaktiv — x1: ${xRange}, x2: ${yRange}\n`;
  out += `Jede Linie wird durch 2 Punkte definiert (per Drag positionieren):\n`;

  for (const li of lines) {
    const a = pts[li.varA], b = pts[li.varB];
    if (!a || !b) continue;
    const inA = bindings[li.varA] ? ` → Eingabe ${bindings[li.varA]}` : '';
    const inB = bindings[li.varB] ? ` → Eingabe ${bindings[li.varB]}` : '';
    out += `  • ${li.label} (${li.color}): Punkt A [${a.x}, ${a.y}]${inA}  |  Punkt B [${b.x}, ${b.y}]${inB}\n`;
  }

  if (polyVars.length) {
    const coords = polyVars.filter(v => pts[v]).map(v => `[${pts[v].x}, ${pts[v].y}]`).join(', ');
    out += `  Lösungsbereich-Polygon (grün, nur zur Orientierung): ${coords}\n`;
  }

  out += `Tipp: Platziere Punkt A am Y-Achsenabschnitt (x1=0) und Punkt B an einem weiteren Punkt der berechneten Gerade.]`;
  return out;
}

function extractExercise() {
  const all = Array.from(document.querySelectorAll('.filter_mathjaxloader_equation'));
  if (!all.length) return null;

  // Only outermost containers — radio-option math lives in nested ones
  const containers = all.filter(
    el => !el.parentElement.closest('.filter_mathjaxloader_equation')
  );
  if (!containers.length) return null;

  const results = [];

  containers.forEach((container) => {
    const clone = container.cloneNode(true);

    // 1. Replace .nolink spans with raw LaTeX from their <script type="math/tex">
    clone.querySelectorAll('.nolink').forEach(nl => {
      const script = nl.querySelector('script[type="math/tex"]');
      nl.replaceWith(document.createTextNode(
        script ? `$${script.textContent.trim()}$` : nl.textContent
      ));
    });

    // 2. Strip MathJax preview / feedback noise
    clone.querySelectorAll('.stackinputfeedback, .MathJax_Preview, .MathJax').forEach(el => el.remove());

    // 3. JSXGraph interactive iframes → structured description parsed from srcdoc JS
    clone.querySelectorAll('div[id^="stack-iframe-holder"]').forEach(holder => {
      const iframe = holder.querySelector('iframe[srcdoc]');
      if (!iframe) { holder.remove(); return; }
      const desc = parseJSXGraphSrcdoc(iframe.getAttribute('srcdoc'));
      holder.replaceWith(document.createTextNode('\n' + desc + '\n'));
    });

    // Remove "Diese Felder bitte ignorieren" blocks — these are ansp* inputs that are
    // coordinate pass-throughs bound to the JSXGraph iframe, not real answer boxes
    clone.querySelectorAll('p, div, span').forEach(el => {
      if (/ignorier/i.test(el.textContent) && el.querySelector('input[name^="ansp"]')) {
        el.remove();
      }
    });
    clone.querySelectorAll('input[name^="ansp"]').forEach(el => el.remove());

    // 4. Static STACK plot images → formula list extracted from alt text
    clone.querySelectorAll('img[src*="stackplot"], img[src*="plot.php"]').forEach(img => {
      const alt = img.alt || '';
      const fnMatch     = alt.match(/plot of \[([^\]]+)\]/);
      const legendMatch = alt.match(/legend,([^\]]+)\]/);
      const xMatch      = alt.match(/\[x[\w\d]+,([^,]+),([^\]]+)\]/);
      const yMatch      = alt.match(/\[y,([^,]+),([^\]]+)\]/);

      let desc = '[Graph';
      if (fnMatch) {
        const fns    = fnMatch[1].split(',').map(s => s.trim());
        const labels = legendMatch
          ? legendMatch[1].replace(/"/g, '').split(',').map(s => s.trim())
          : fns.map((_, i) => String(i + 1));
        desc += ` — Funktionen: ${fns.map((f, i) => `${labels[i] ?? i}: ${f}`).join(', ')}`;
      }
      if (xMatch) desc += ` | x-Achse: ${xMatch[1]}–${xMatch[2]}`;
      if (yMatch) desc += ` | y-Achse: ${yMatch[1]}–${yMatch[2]}`;
      desc += ']';
      img.replaceWith(document.createTextNode('\n' + desc + '\n'));
    });

    // 5. Matrix input tables → structured grid placeholder (before generic input sweep)
    clone.querySelectorAll('.matrixnobrackets, table.matrixtable').forEach(el => {
      const table = el.tagName === 'TABLE' ? el : el.querySelector('table.matrixtable');
      if (!table) return;
      const grid = Array.from(table.querySelectorAll('tr'))
        .map(tr => Array.from(tr.querySelectorAll('input[data-stack-input-type="matrix"]')))
        .filter(row => row.length > 0);
      if (!grid.length) return;
      const nRows = grid.length;
      const nCols = Math.max(...grid.map(r => r.length));
      const containerId = table.id || '';
      const ansLabel = (containerId.match(/_(ans\w+)_container/) || [])[1] || 'Matrix';
      const gridText = grid.map((row, r) =>
        '  Zeile ' + (r + 1) + ': ' + row.map(() => '___').join('  ')
      ).join('\n');
      const target = el.closest('.matrixnobrackets') || el;
      target.replaceWith(document.createTextNode(
        `\n[Matrix-Eingabe ${nRows}×${nCols} (${ansLabel}):\n${gridText}]\n`
      ));
    });

    // 6. Radio/checkbox options → remove wrapper row, collect option text
    const radioOptions = [];
    clone.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
      const label = input.nextElementSibling?.tagName === 'LABEL'
        ? input.nextElementSibling
        : input.closest('label') || input.parentElement;
      const text = label ? label.textContent.replace(/\s+/g, ' ').trim() : '';
      if (text) radioOptions.push(text);
      const wrapper = input.parentElement;
      if (wrapper && wrapper !== clone) wrapper.remove();
      else input.remove();
    });

    // 7. Select dropdowns → inline marker
    clone.querySelectorAll('select').forEach(sel => {
      const opts = Array.from(sel.options).map(o => o.text.trim()).filter(t => t);
      sel.replaceWith(document.createTextNode(`[Auswahl: ${opts.join(' | ')}]`));
    });

    // 8. Remaining scalar text inputs → placeholder
    clone.querySelectorAll('input[type="text"]').forEach(input => {
      input.replaceWith(document.createTextNode(' ___ '));
    });

    // 9. Walk DOM → text with proper line breaks
    let rawText = domToText(clone)
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 10. Append radio options
    if (radioOptions.length) {
      rawText += '\n\n[Auswahloptionen]\n' + radioOptions.map(t => `- ${t}`).join('\n');
    }

    // 11. Split exercise body vs "what is asked"
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const askedKeywords = [
      'berechnen', 'bestimmen', 'geben sie an', 'geben sie', 'ermitteln',
      'zeigen sie', 'lösen', 'stellen sie', 'gib an', 'schreiben sie',
      'falls die vektoren', 'falls die'
    ];

    let exerciseLines = [], askedLines = [], inAsked = false;
    lines.forEach(line => {
      const lower = line.toLowerCase();
      if (!inAsked && askedKeywords.some(k => lower.includes(k))) inAsked = true;
      (inAsked ? askedLines : exerciseLines).push(line);
    });

    const exerciseText = exerciseLines.join('\n').trim();
    const askedText    = askedLines.join('\n').trim();
    if (!exerciseText && !askedText) return;

    results.push({ exercise: exerciseText, asked: askedText });
  });

  return results.length ? results : null;
}

// Pull the page metadata used to auto-name the prompt
function extractMeta() {
  const courseEl = document.querySelector('h1.h2.mb-0');
  const qnoEl    = document.querySelector('.qno');
  const course = courseEl ? courseEl.textContent.replace(/\s+/g, ' ').trim() : '';
  const qno    = qnoEl    ? qnoEl.textContent.replace(/\s+/g, ' ').trim()    : '';
  return { course, qno };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'extract') {
    sendResponse({ data: extractExercise(), meta: extractMeta() });
  }
});
