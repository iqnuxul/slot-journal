// ============================================
//  THE REFLECTION MACHINE
// ============================================

const STORAGE_KEYS = {
  journal: 'reflection-journal-',
  research: 'reflection-research-week',
  count: 'reflection-pull-count',
};

// ---------- helpers ----------
function pickTwoDistinct(arr) {
  if (arr.length < 2) return [arr[0], arr[0]];
  const i = Math.floor(Math.random() * arr.length);
  let j = Math.floor(Math.random() * arr.length);
  while (j === i) j = Math.floor(Math.random() * arr.length);
  return [arr[i], arr[j]];
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

function spinReel(reelEl, finalText, durationMs, onTick) {
  reelEl.classList.add('spinning');
  const interval = setInterval(() => {
    const sample = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    setReel(reelEl, sample);
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

  const [q1, q2] = pickTwoDistinct(QUESTIONS);
  currentPrompts = [q1, q2];

  await Promise.all([
    spinReel(reel1, q1, 1500, reelClick),
    spinReel(reel2, q2, 2300, reelClick),
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
//  JOURNAL
// ============================================
const journalText = document.getElementById('journal-text');
const promptsDisplay = document.getElementById('prompts-display');
const paperDate = document.getElementById('paper-date');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn');

paperDate.textContent = prettyDate();

function renderJournalPrompts() {
  if (!currentPrompts) {
    promptsDisplay.innerHTML = `<p class="prompt-item" style="opacity:0.6;font-style:italic;">Pull the lever above to get today's prompts.</p>`;
    return;
  }
  promptsDisplay.innerHTML = currentPrompts.map((p, i) => `
    <div class="prompt-item"><span class="num">${i+1}.</span>${p}</div>
  `).join('');
}
renderJournalPrompts();

// load saved entry
function loadEntry() {
  const saved = localStorage.getItem(STORAGE_KEYS.journal + todayKey());
  if (saved) {
    try {
      const obj = JSON.parse(saved);
      journalText.value = obj.text || '';
      if (obj.prompts && obj.prompts.length === 2) {
        currentPrompts = obj.prompts;
        setReel(reel1, obj.prompts[0]);
        setReel(reel2, obj.prompts[1]);
        copyBtn.disabled = false;
        journalBtn.disabled = false;
        renderJournalPrompts();
      }
    } catch (e) {}
  }
}
loadEntry();

// auto-save
let saveTimer;
journalText.addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEYS.journal + todayKey(), JSON.stringify({
      text: journalText.value,
      prompts: currentPrompts,
      savedAt: new Date().toISOString(),
    }));
  }, 400);
});

downloadBtn.addEventListener('click', () => {
  const date = prettyDate();
  const promptsBlock = currentPrompts
    ? `Prompts:\n1. ${currentPrompts[0]}\n2. ${currentPrompts[1]}\n\n`
    : '';
  const content = `Reflection Machine — ${date}\n\n${promptsBlock}${journalText.value || '(empty)'}\n`;
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `journal-${todayKey()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener('click', () => {
  if (!confirm("Clear today's entry? This cannot be undone.")) return;
  journalText.value = '';
  localStorage.removeItem(STORAGE_KEYS.journal + todayKey());
});

// ============================================
//  RESEARCH TOPIC
// ============================================
const researchBtn = document.getElementById('research-btn');
const researchWord = document.getElementById('research-word');
const researchSub = document.getElementById('research-sub');
const researchPrompts = document.getElementById('research-prompts');

function loadOrPickWeekTopic() {
  const week = isoWeek();
  const saved = localStorage.getItem(STORAGE_KEYS.research);
  if (saved) {
    try {
      const obj = JSON.parse(saved);
      if (obj.week === week && obj.topic) {
        researchWord.textContent = obj.topic;
        researchSub.textContent = `Locked in for ${week}. Sit with it.`;
        researchPrompts.hidden = false;
        return;
      }
    } catch (e) {}
  }
}
loadOrPickWeekTopic();

function pickResearch(force = false) {
  const week = isoWeek();
  const saved = localStorage.getItem(STORAGE_KEYS.research);

  if (!force && saved) {
    try {
      const obj = JSON.parse(saved);
      if (obj.week === week && obj.topic) {
        // already have one this week — just re-animate
        flickerWord(obj.topic);
        researchSub.textContent = `Already locked in for ${week}. Stick with it, or hold ⌥/Alt and click to re-roll.`;
        return;
      }
    } catch (e) {}
  }

  let topic;
  do {
    topic = RESEARCH_TOPICS[Math.floor(Math.random() * RESEARCH_TOPICS.length)];
  } while (saved && JSON.parse(saved).topic === topic && RESEARCH_TOPICS.length > 1);

  bellRing();
  flickerWord(topic);
  researchSub.textContent = `Locked in for ${week}. Sit with it.`;
  researchPrompts.hidden = false;
  localStorage.setItem(STORAGE_KEYS.research, JSON.stringify({ week, topic, pickedAt: new Date().toISOString() }));
}

function flickerWord(finalWord) {
  let frames = 0;
  const maxFrames = 14;
  researchWord.classList.remove('changing');
  // void offsetWidth to restart animation
  void researchWord.offsetWidth;

  const interval = setInterval(() => {
    if (frames < maxFrames) {
      researchWord.textContent = RESEARCH_TOPICS[Math.floor(Math.random() * RESEARCH_TOPICS.length)];
      frames++;
    } else {
      clearInterval(interval);
      researchWord.textContent = finalWord;
      researchWord.classList.add('changing');
    }
  }, 60);
}

researchBtn.addEventListener('click', (e) => {
  pickResearch(e.altKey || e.metaKey);
});

// ============================================
//  COUNTER
// ============================================
function updateCounter() {
  const c = parseInt(localStorage.getItem(STORAGE_KEYS.count) || '0', 10);
  const counter = document.getElementById('counter');
  if (c > 0) counter.textContent = `· ${c} pull${c === 1 ? '' : 's'} so far`;
}
updateCounter();
