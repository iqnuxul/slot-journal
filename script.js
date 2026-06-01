// ============================================
//  THE REFLECTION MACHINE
// ============================================

const STORAGE_KEYS = {
  journal: 'reflection-journal-',
  research: 'reflection-research-week',
  count: 'reflection-pull-count',
};

// ---------- helpers ----------
function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickOnePair() {
  // One deep, one simple — always one of each
  return [pickOne(DEEP_QUESTIONS), pickOne(SIMPLE_QUESTIONS)];
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function prettyDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function isoWeek() {
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

// ---------- audio (subtle vintage clicks) ----------
let audioCtx;
function beep(freq = 440, duration = 0.05, volume = 0.06, type = 'square') {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { /* audio not allowed yet */ }
}

function leverSound() {
  beep(180, 0.2, 0.08, 'sawtooth');
  setTimeout(() => beep(120, 0.15, 0.06, 'sawtooth'), 80);
}

function reelClick() { beep(800, 0.02, 0.04, 'square'); }
function jackpot() {
  [600, 800, 1000, 1200].forEach((f, i) => setTimeout(() => beep(f, 0.1, 0.07, 'triangle'), i * 80));
}

function bellRing() {
  beep(1200, 0.15, 0.08, 'sine');
  setTimeout(() => beep(1600, 0.18, 0.06, 'sine'), 60);
  setTimeout(() => beep(1000, 0.22, 0.05, 'sine'), 140);
}

// ============================================
//  SLOT MACHINE
// ============================================
const lever = document.getElementById('lever');
const reel1 = document.getElementById('reel-1');
const reel2 = document.getElementById('reel-2');
const hint = document.getElementById('hint');
const copyBtn = document.getElementById('copy-btn');
const journalBtn = document.getElementById('journal-btn');

let isSpinning = false;
let currentPrompts = null;

function setReel(reelEl, text) {
  reelEl.querySelector('.reel-strip').innerHTML = `<div class="reel-item">${text}</div>`;
}

function spinReel(reelEl, finalText, durationMs, pool, onTick) {
  reelEl.classList.add('spinning');
  const interval = setInterval(() => {
    setReel(reelEl, pickOne(pool));
    if (onTick) onTick();
  }, 70);
  return new Promise(resolve => {
    setTimeout(() => {
      clearInterval(interval);
      reelEl.classList.remove('spinning');
      setReel(reelEl, finalText);
      resolve();
    }, durationMs);
  });
}

async function pullLever() {
  if (isSpinning) return;
  isSpinning = true;
  hint.textContent = '🎰 Spinning…';
  leverSound();

  lever.classList.add('pulled');
  setTimeout(() => lever.classList.remove('pulled'), 700);

  const [qDeep, qSimple] = pickOnePair();
  currentPrompts = [qDeep, qSimple];

  await Promise.all([
    spinReel(reel1, qDeep, 1500, DEEP_QUESTIONS, reelClick),
    spinReel(reel2, qSimple, 2300, SIMPLE_QUESTIONS, reelClick),
  ]);

  jackpot();
  hint.textContent = 'Pull again or open the journal below ↓';
  copyBtn.disabled = false;
  journalBtn.disabled = false;
  renderJournalPrompts();

  // increment count
  const c = (parseInt(localStorage.getItem(STORAGE_KEYS.count) || '0', 10) + 1);
  localStorage.setItem(STORAGE_KEYS.count, String(c));
  updateCounter();

  isSpinning = false;
}

lever.addEventListener('click', pullLever);
lever.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pullLever(); }
});

// drag-to-pull
let dragStartY = null;
lever.addEventListener('pointerdown', (e) => {
  dragStartY = e.clientY;
  lever.setPointerCapture(e.pointerId);
});
lever.addEventListener('pointermove', (e) => {
  if (dragStartY === null) return;
  const dy = e.clientY - dragStartY;
  if (dy > 50) {
    dragStartY = null;
    pullLever();
  }
});
lever.addEventListener('pointerup', () => { dragStartY = null; });
lever.addEventListener('pointercancel', () => { dragStartY = null; });

// copy prompts
copyBtn.addEventListener('click', () => {
  if (!currentPrompts) return;
  const txt = `1. ${currentPrompts[0]}\n2. ${currentPrompts[1]}`;
  navigator.clipboard.writeText(txt).then(() => {
    const orig = copyBtn.textContent;
    copyBtn.textContent = 'Copied ✓';
    setTimeout(() => { copyBtn.textContent = orig; }, 1500);
  });
});

// scroll to journal
journalBtn.addEventListener('click', () => {
  document.getElementById('journal').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('journal-text').focus();
});

// ============================================
//  JOURNAL — one writing box per prompt
// ============================================
const promptsDisplay = document.getElementById('prompts-display');
const paperDate = document.getElementById('paper-date');
const downloadBtn = document.getElementById('download-btn');

paperDate.textContent = prettyDate();

// In-memory cache of the two answers
let currentAnswers = ['', ''];

function readSavedEntry() {
  const raw = localStorage.getItem(STORAGE_KEYS.journal + todayKey());
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    // back-compat: old single-text shape → put it under answer 1
    if (typeof obj.text === 'string' && !obj.answers) {
      obj.answers = [obj.text, ''];
      delete obj.text;
    }
    return obj;
  } catch (e) { return null; }
}

function saveEntry() {
  localStorage.setItem(STORAGE_KEYS.journal + todayKey(), JSON.stringify({
    answers: currentAnswers,
    prompts: currentPrompts,
    savedAt: new Date().toISOString(),
  }));
}

function renderJournalPrompts() {
  if (!currentPrompts) {
    promptsDisplay.innerHTML = `<p class="empty-hint">Pull the lever above to get today's prompts.</p>`;
    return;
  }
  promptsDisplay.innerHTML = currentPrompts.map((p, i) => `
    <div class="prompt-block">
      <div class="prompt-item"><span class="num">${i + 1}.</span><span class="prompt-text">${p}</span></div>
      <textarea class="prompt-answer" data-idx="${i}" rows="6" placeholder="Write your answer here…">${(currentAnswers[i] || '').replace(/</g, '&lt;')}</textarea>
    </div>
  `).join('');

  // Wire up auto-save
  promptsDisplay.querySelectorAll('textarea.prompt-answer').forEach(ta => {
    ta.addEventListener('input', () => {
      const idx = parseInt(ta.dataset.idx, 10);
      currentAnswers[idx] = ta.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveEntry, 400);
    });
  });
}

let saveTimer;

function loadEntry() {
  const obj = readSavedEntry();
  if (!obj) { renderJournalPrompts(); return; }
  if (obj.prompts && obj.prompts.length === 2) {
    currentPrompts = obj.prompts;
    setReel(reel1, obj.prompts[0]);
    setReel(reel2, obj.prompts[1]);
    copyBtn.disabled = false;
    journalBtn.disabled = false;
  }
  currentAnswers = Array.isArray(obj.answers) ? obj.answers.slice(0, 2) : ['', ''];
  while (currentAnswers.length < 2) currentAnswers.push('');
  renderJournalPrompts();
}
loadEntry();

downloadBtn.addEventListener('click', () => {
  const date = prettyDate();
  let body = `Reflection Machine — ${date}\n\n`;
  if (currentPrompts) {
    currentPrompts.forEach((p, i) => {
      body += `${i + 1}. ${p}\n${currentAnswers[i] || '(empty)'}\n\n`;
    });
  } else {
    body += '(no prompts yet — pull the lever first)\n';
  }
  const blob = new Blob([body], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `journal-${todayKey()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================
//  RESEARCH TOPIC — hand-drawn bell + rope + slip
// ============================================
const bellScene = document.getElementById('bell-scene');
const ropeGrip = document.getElementById('rope-grip');
const paperSlip = document.getElementById('paper-slip');
const paperWord = document.getElementById('paper-slip-word');
const paperSub = document.getElementById('paper-slip-sub');
const bellHint = document.getElementById('bell-hint');
const researchPrompts = document.getElementById('research-prompts');

let isRinging = false;

function showSlip(topic, weekLabel, locked) {
  paperWord.textContent = topic;
  paperSub.textContent = locked ? `locked in · ${weekLabel}` : `your topic · ${weekLabel}`;
  // restart animation
  paperSlip.classList.remove('visible');
  void paperSlip.offsetWidth;
  paperSlip.classList.add('visible');
}

function loadOrPickWeekTopic() {
  const week = isoWeek();
  const saved = localStorage.getItem(STORAGE_KEYS.research);
  if (saved) {
    try {
      const obj = JSON.parse(saved);
      if (obj.week === week && obj.topic) {
        // skip animation on initial load — just show the slip in place
        paperWord.textContent = obj.topic;
        paperSub.textContent = `locked in · ${week}`;
        paperSlip.style.opacity = '1';
        paperSlip.style.transform = 'translateX(-50%) translateY(175px) rotate(-1.5deg) scale(1)';
        researchPrompts.hidden = false;
        bellHint.textContent = `This week's word is yours. Pull again to re-ring, hold ⌥/Alt to re-roll.`;
        return;
      }
    } catch (e) {}
  }
}
loadOrPickWeekTopic();

function ringBell(force = false) {
  if (isRinging) return;
  isRinging = true;

  const week = isoWeek();
  const saved = localStorage.getItem(STORAGE_KEYS.research);
  let topic;
  let locked = false;

  if (!force && saved) {
    try {
      const obj = JSON.parse(saved);
      if (obj.week === week && obj.topic) {
        topic = obj.topic;
        locked = true;
      }
    } catch (e) {}
  }

  if (!topic) {
    let prev = null;
    try { prev = saved ? JSON.parse(saved).topic : null; } catch (e) {}
    do {
      topic = RESEARCH_TOPICS[Math.floor(Math.random() * RESEARCH_TOPICS.length)];
    } while (topic === prev && RESEARCH_TOPICS.length > 1);
    localStorage.setItem(STORAGE_KEYS.research, JSON.stringify({ week, topic, pickedAt: new Date().toISOString() }));
  }

  // reset inline styles set by initial load so the animation works
  paperSlip.style.opacity = '';
  paperSlip.style.transform = '';

  bellScene.classList.remove('ringing');
  void bellScene.offsetWidth;
  bellScene.classList.add('ringing');

  bellRing();

  // Show the slip ~300ms in, after the first big swing
  setTimeout(() => showSlip(topic, week, locked), 280);

  setTimeout(() => {
    bellScene.classList.remove('ringing');
    isRinging = false;
    researchPrompts.hidden = false;
    bellHint.textContent = locked
      ? `Already drawn for ${week}. Hold ⌥/Alt and pull to re-roll.`
      : `Locked in for the week. Pull again any time to re-ring.`;
  }, 1700);
}

ropeGrip.addEventListener('click', (e) => {
  ringBell(e.altKey || e.metaKey);
});

// drag-down support
let ropeDragY = null;
ropeGrip.addEventListener('pointerdown', (e) => {
  ropeDragY = e.clientY;
  ropeGrip.setPointerCapture(e.pointerId);
});
ropeGrip.addEventListener('pointermove', (e) => {
  if (ropeDragY === null) return;
  if (e.clientY - ropeDragY > 30) {
    ropeDragY = null;
    ringBell(e.altKey || e.metaKey);
  }
});
ropeGrip.addEventListener('pointerup', () => { ropeDragY = null; });
ropeGrip.addEventListener('pointercancel', () => { ropeDragY = null; });

// ============================================
//  COUNTER
// ============================================
function updateCounter() {
  const c = parseInt(localStorage.getItem(STORAGE_KEYS.count) || '0', 10);
  const counter = document.getElementById('counter');
  if (c > 0) counter.textContent = `· ${c} pull${c === 1 ? '' : 's'} so far`;
}
updateCounter();
