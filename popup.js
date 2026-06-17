const RULES = `## Rules (follow strictly)

### Structure
1. Answer EVERY box and EVERY multiple-choice question. Do not skip any.
2. Before the boxes of each Teilaufgabe, write 2–3 sentences explaining the MATHEMATICAL IDEA behind it: what concept is being tested, why the approach works, and what the goal is. Do not restate the question — explain the reasoning.
3. Only mention dependencies between boxes when a box genuinely uses the result of an earlier one. Write "→ verwendet Ergebnis aus Box [X]" on the Herleitung line in that case. Do NOT write "unabhängig" or any dependency note when there is none — just omit it.

### Multiple-choice format
4. For each multiple-choice question use this exact structure:
   > **Frage: [topic in 3–5 words]**
   > ✓ [exact option text]
   > *Warum:* one sentence.

### Input box format
5. For each input box use this exact structure:
   > **Box [label]**
   > **Variablen:** show how the abstract variable names (a, b, c, …) map to the actual terms in THIS equation, written as a one-liner. Example: for "3·x1 − 3·x2 ≤ 3" write "a·x1 + b·x2 ≤ c → a=3, b=−3, c=3". Only include variables the formula actually uses.
   > **Formel:** general formula in named variables — never a bare number
   > **Eingesetzt:** same formula with every variable replaced by its given value
   > **Ergebnis:** final numeric result
   > *Herleitung:* one clause. Only add "→ verwendet Ergebnis aus Box [X]" if this box truly depends on another.

6. **Avoid repeating explanations for identical methods.** If two or more boxes apply the exact same procedure (e.g. "solve inequality for x2"), write the Herleitung explanation in full only for the FIRST such box. For every subsequent box using the same method, replace the Herleitung with just "*wie Box [X]*" and omit any further description. The Variablen, Formel, Eingesetzt, and Ergebnis lines are always shown in full for every box regardless.

### Graph exercises
7. Whenever the exercise involves a graph, after the box answers add a **## Graphik-Check** section explaining how to visually verify the answer by eye:
   - For lines: state the Y-Achsenabschnitt (where the line crosses y-axis) and the Steigung as a fraction p/q, then say "gehe q Schritte nach rechts und p Schritte nach oben (oder unten bei negativem Vorzeichen)". Always write the Steigung as a fraction even if it is a whole number (e.g. 2 = 2/1 → 1 Schritt rechts, 2 Schritte hoch) because it makes the stepping rule explicit.
   - For regions/inequalities: state which side of the line is the feasible region and give a simple test point to confirm.
   - For other graph types (circles, parabolas, etc.): state the key visual features to look for (center, radius, vertex, direction).

### Verification
8. After all answers add a **## Verification** section with 1–3 checks (dimensional analysis, limiting case, symmetry, sign plausibility, order-of-magnitude). Each check is one sentence: WHAT to verify and WHY it confirms correctness. Mark if it is doable by eye without a calculator.

### Test preparation
9. After Verification add a **## Prüfungsvorbereitung** section:
   - Identify the core mathematical topic of this exercise and list 2–3 RELATED problem types that frequently appear on real tests for this topic (e.g. if the exercise is about linear dependence, mention rank, determinant, and span).
   - For multiple-choice questions: also list additional TRUE statements about the topic that were NOT among the given options but could appear in a real exam, so the student knows them.
   - Keep this section brief: one bullet per related type, one sentence each.

### Formatting
10. Separate every question/box block with a blank line. Place ════════════════ between EACH Teilaufgabe — that means after every Teilaufgabe ends and before the next one begins, including between Teilaufgabe 1 and 2, 2 and 3, etc.
11. Responses must be short. One clause per explanation — no padding, no restating the problem.
12. Output language: German.`;

// Builds the exercise body that the user sees in the preview box (no rules)
function buildExerciseBody(title, exercises) {
  const taskTitle = title.trim() || 'Aufgabe';
  let md = `## Exercise: ${taskTitle}\n`;

  exercises.forEach((ex, i) => {
    if (exercises.length > 1) md += `\n---\n### Teilaufgabe ${i + 1}\n`;
    md += `\n### Exercise\n\n${ex.exercise.trim()}\n`;
    if (ex.asked.trim()) md += `\n### What is asked\n\n${ex.asked.trim()}\n`;
  });

  return md;
}

// Builds the full prompt that gets copied/saved (rules prepended, hidden from user)
function buildFullPrompt(title, exercises) {
  return `# Task: Universal formulas for a MINT.SH exercise\n${RULES}\n\n${buildExerciseBody(title, exercises)}`;
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getCurrentTab();
  const isMint = tab.url && tab.url.includes('mintsh.de');

  if (!isMint) {
    document.getElementById('not-on-mint').classList.remove('hidden');
    return;
  }

  document.getElementById('on-mint').classList.remove('hidden');

  // Holds the full prompt (rules + exercise) — copied/saved but never shown
  let fullPrompt = '';
  let lastData   = null;
  let lastTitle  = '';

  function autoTitle(meta) {
    if (!meta) return 'Aufgabe';
    const parts = ['Test'];
    if (meta.course) parts.push(meta.course);
    if (meta.qno)    parts.push('Aufgabe', meta.qno);
    return parts.join(' ');
  }

  function rebuild() {
    if (!lastData) return;
    document.getElementById('output').value = buildExerciseBody(lastTitle, lastData);
    fullPrompt = buildFullPrompt(lastTitle, lastData);
  }

  document.getElementById('extract-btn').addEventListener('click', async () => {
    const btn = document.getElementById('extract-btn');
    btn.textContent = 'Extrahiere…';
    btn.disabled = true;

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
      const data = response?.data;
      const meta = response?.meta;

      if (!data || data.length === 0) {
        document.getElementById('no-exercise').classList.remove('hidden');
        document.getElementById('output-area').classList.add('hidden');
      } else {
        lastData  = data;
        lastTitle = autoTitle(meta);
        rebuild();
        document.getElementById('output-area').classList.remove('hidden');
        document.getElementById('no-exercise').classList.add('hidden');
      }
    } catch (e) {
      document.getElementById('no-exercise').classList.remove('hidden');
    } finally {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:6px;vertical-align:-2px"><path d="M2 8 L6 12 L14 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Aufgabe extrahieren`;
      btn.disabled = false;
    }
  });

  document.getElementById('copy-btn').addEventListener('click', async () => {
    if (!fullPrompt) return;
    await navigator.clipboard.writeText(fullPrompt);
    showToast();
  });

  document.getElementById('md-btn').addEventListener('click', () => {
    if (!fullPrompt) return;
    const title = lastTitle.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]/g, '') || 'aufgabe';
    const blob = new Blob([fullPrompt], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}_prompt.md`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

function showToast() {
  const toast = document.getElementById('copy-toast');
  toast.classList.remove('hidden', 'fade');
  setTimeout(() => {
    toast.classList.add('fade');
    setTimeout(() => toast.classList.add('hidden'), 400);
  }, 1200);
}
