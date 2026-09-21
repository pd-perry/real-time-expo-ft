/* =========================================================================
 * Site data. Everything on the page is generated from these three tables,
 * so adding a task or a baseline is a one-line edit here.
 * ========================================================================= */

/* Tasks, in the order they appear in every section. `dir` must match the
 * folder name under static/videos/rollout_videos/ and static/videos/eval_videos/,
 * and the basename of the time-lapse under static/videos/training/. */
const TASKS = [
  { dir: 'balance',      name: 'Ball Balancing',  desc: 'Keep the ball balanced on the plate.' },
  { dir: 'kick',         name: 'Soccer Kicking',  desc: 'Strike a ball into the goal.' },
  { dir: 'dynamic_pick', name: 'Dynamic Picking', desc: 'Grasp an object on a rotating base.' },
  { dir: 'pass',         name: 'Object Passing',   desc: 'Hand a spatula from one arm to the other in mid-air.' },
];

/* Columns of every rollout row, left to right. A bare name means the plain
 * (w/o RTC) variant; the w/ RTC baselines sit at the end of the row, past the
 * first screenful -- scroll right to see them.
 *   file    - basename under static/videos/rollout_videos/<task>/, no extension
 *   ours    - highlights the cell in the brand color
 *   sub     - small grey line under the method name */
const METHODS = [
  { key: 'ours',       label: 'Real-Time EXPO-FT (Ours)', file: 'ours', ours: true },
  { key: 'rlpd',       label: 'RLPD',          file: 'rlpd' },
  { key: 'dsrl',       label: 'DSRL',          file: 'dsrl_nortc' },
  { key: 'expoft',     label: 'EXPO-FT',       file: 'expo_nortc' },
  { key: 'bc',         label: 'BC',            file: 'bc_nortc' },
  { key: 'dsrl_rtc',   label: 'DSRL',          file: 'dsrl_rtc',   sub: 'w/ RTC' },
  { key: 'expoft_rtc', label: 'EXPO-FT',       file: 'expo_rtc',   sub: 'w/ RTC' },
  { key: 'bc_rtc',     label: 'BC',            file: 'bc_rtc',     sub: 'w/ RTC' },
];

/* Successful trials out of `trials` per method, shown as "value/trials" next
 * to each bar. `value` is the method as run at delay=5 (ours, and the
 * baselines w/ RTC); `nortc`, where present, is the same baseline w/o RTC at
 * delay=0 plus 100 ms of inference latency, drawn as a second, lighter bar
 * under the first. RLPD on dynamic pick is the same 0/30 with and without
 * human-in-the-loop. */
const EVAL = {
  balance: {
    desc: 'Autonomous evaluation',
    trials: 30,
    rows: [
      { label: 'Real-Time EXPO-FT (Ours)', value: 28, ours: true },
      { label: 'EXPO-FT',       value: 23, nortc: 18 },
      { label: 'DSRL',          value: 15, nortc: 11 },
      { label: 'RLPD',          value: 12 },
      { label: 'BC',            value: 12, nortc:  8 },
    ],
  },
  pass: {
    desc: 'Autonomous evaluation',
    trials: 30,
    rows: [
      { label: 'Real-Time EXPO-FT (Ours)', value: 30, ours: true },
      { label: 'EXPO-FT',       value: 27, nortc: 19 },
      { label: 'DSRL',          value: 23, nortc: 23 },
      { label: 'RLPD',          value:  0 },
      { label: 'BC',            value: 22, nortc: 10 },
    ],
  },
  kick: {
    desc: 'Autonomous evaluation',
    trials: 30,
    rows: [
      { label: 'Real-Time EXPO-FT (Ours)', value: 28, ours: true },
      { label: 'EXPO-FT',       value: 26, nortc: 17 },
      { label: 'DSRL',          value: 17, nortc: 16 },
      { label: 'RLPD',          value:  6 },
      { label: 'BC',            value: 16, nortc: 13 },
    ],
  },
  dynamic_pick: {
    desc: 'Autonomous evaluation',
    trials: 30,
    rows: [
      { label: 'Real-Time EXPO-FT (Ours)', value: 30, ours: true },
      { label: 'EXPO-FT',       value: 24, nortc: 21 },
      { label: 'DSRL',          value: 24, nortc: 23 },
      { label: 'RLPD',          value:  0 },
      { label: 'BC',            value: 22, nortc: 19 },
    ],
  },
};

/* Playback speed each section's clips were encoded at, shown as a chip on every
 * video. Must match the SPEED column in encode.sh. Policy rollouts are 1x on
 * purpose -- the whole point of the paper is that this is real time. */
const ROLLOUT_SPEED = 1;
const TRAIN_SPEED = 5;

/* ========================================================================= */

const VIDEO_ATTRS = { autoplay: '', muted: '', loop: '', playsinline: '', preload: 'metadata' };

/* Corner chip stating the playback speed of the clip it sits on. */
function addSpeedChip(cell, speed) {
  const chip = document.createElement('span');
  chip.className = 'speed-chip';
  chip.textContent = `${speed}×`;
  cell.appendChild(chip);
}

function makeVideo(src, placeholder) {
  const video = document.createElement('video');
  Object.entries(VIDEO_ATTRS).forEach(([k, v]) => video.setAttribute(k, v));
  video.muted = true; // property, not just the attribute — Safari needs this to autoplay
  video.dataset.placeholder = placeholder;
  video.src = src;
  return video;
}

/* A missing mp4 would otherwise render as a silent black box. Show the path the
 * file is expected at instead, so it is obvious what still needs encoding.
 * Not `once`: the src changes when the RTC toggle or an eval tab is used, and
 * the next file may or may not exist. */
function watchForMissing(video) {
  const clear = () => {
    const note = video.parentElement && video.parentElement.querySelector('.video-missing');
    if (note) note.remove();
  };

  video.addEventListener('loadeddata', clear);
  video.addEventListener('error', () => {
    const host = video.parentElement;
    if (!host || host.querySelector('.video-missing')) return;
    host.style.position = host.style.position || 'relative';
    const note = document.createElement('div');
    note.className = 'video-missing';
    note.textContent = video.dataset.placeholder || video.getAttribute('src') || 'video missing';
    host.appendChild(note);
  });
}

function rolloutSrc(task, method) {
  return `static/videos/rollout_videos/${task.dir}/${method.file}.mp4`;
}

/* ---------- Policy rollouts ---------- */

function buildRollouts() {
  const host = document.getElementById('rollout-rows');
  if (!host) return;

  TASKS.forEach((task) => {
    const block = document.createElement('div');
    block.className = 'task-block';

    const head = document.createElement('div');
    head.className = 'task-block-head';
    head.innerHTML =
      `<h3 class="task-block-name">${task.name}</h3>` +
      `<p class="task-block-desc">${task.desc}</p>`;
    block.appendChild(head);

    /* Ours sits outside the scroller so it never moves and nothing slides
     * under it; only the baselines scroll, clipped at their own left edge.
     * scroll-row supplies the horizontal-scroll behavior (wheel, drag, bar). */
    const wrap = document.createElement('div');
    wrap.className = 'video-row-wrap';
    const row = document.createElement('div');
    row.className = 'video-row scroll-row';

    METHODS.forEach((method) => {
      const cell = document.createElement('figure');
      cell.className = 'video-cell' + (method.ours ? ' is-ours' : '');

      const src = rolloutSrc(task, method);
      const video = makeVideo(src, src);
      watchForMissing(video);
      cell.appendChild(video);
      addSpeedChip(cell, ROLLOUT_SPEED);

      const label = document.createElement('figcaption');
      label.className = 'video-label';
      const sub = method.sub ? `<span class="label-sub">${method.sub}</span>` : '';
      label.innerHTML = `<span>${method.label}</span>${sub}`;
      cell.appendChild(label);

      (method.ours ? wrap : row).appendChild(cell);
    });

    wrap.appendChild(row);
    block.appendChild(wrap);
    host.appendChild(block);
  });
}

/* ---------- Training ---------- */

function buildTraining() {
  const row = document.getElementById('training-row');
  if (!row) return;

  TASKS.forEach((task) => {
    const card = document.createElement('figure');
    card.className = 'card';
    card.dataset.task = task.dir;

    const src = `static/videos/training/${task.dir}.mp4`;
    const video = makeVideo(src, src);
    /* Scrubbable timeline, same as the evaluation video. */
    video.setAttribute('controls', '');
    watchForMissing(video);
    card.appendChild(video);
    addSpeedChip(card, TRAIN_SPEED);

    const caption = document.createElement('figcaption');
    caption.textContent = task.name;
    card.appendChild(caption);

    row.appendChild(card);
  });
}

/* ---------- Evaluation ---------- */

function buildEvaluation() {
  const tabs = document.getElementById('eval-tabs');
  const video = document.getElementById('eval-video');
  const title = document.getElementById('eval-title');
  const desc = document.getElementById('eval-desc');
  const bars = document.getElementById('eval-bars');
  const note = document.getElementById('eval-note');
  if (!tabs || !video) return;

  watchForMissing(video);

  function select(task) {
    tabs.querySelectorAll('.task-tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.task === task.dir);
    });

    const data = EVAL[task.dir] || { desc: '', trials: 0, rows: [] };
    const src = `static/videos/eval_videos/${task.dir}/ours.mp4`;
    video.dataset.placeholder = src;
    video.src = src;
    video.play().catch(() => {});

    title.textContent = task.name;
    desc.textContent = data.desc;

    bars.innerHTML = '';
    data.rows.forEach((r) => {
      const twin = r.nortc !== undefined;
      const wrap = document.createElement('div');
      wrap.className = 'eval-bar-row' + (r.ours ? ' is-ours' : '') + (twin ? ' has-nortc' : '');
      const vals = `<span class="eval-bar-val">${r.value}/${data.trials}</span>` +
        (twin ? `<span class="eval-bar-val is-nortc">${r.nortc}/${data.trials}</span>` : '');
      wrap.innerHTML =
        '<div class="eval-bar-head">' +
          `<span class="eval-bar-name">${r.label}</span>` +
          `<span class="eval-bar-vals">${vals}</span>` +
        '</div>' +
        '<div class="eval-bar-track"><div class="eval-bar-fill"></div></div>' +
        (twin ? '<div class="eval-bar-track is-nortc"><div class="eval-bar-fill"></div></div>' : '');
      bars.appendChild(wrap);
      /* Next frame, so the width transition actually animates. */
      requestAnimationFrame(() => {
        const pct = (v) => `${Math.max(0, Math.min(100, data.trials ? (v / data.trials) * 100 : 0))}%`;
        const fills = wrap.querySelectorAll('.eval-bar-fill');
        fills[0].style.width = pct(r.value);
        if (twin) fills[1].style.width = pct(r.nortc);
      });
    });

    note.textContent = data.trials
      ? `${data.trials} trials per task.`
      : '';
  }

  TASKS.forEach((task, i) => {
    const tab = document.createElement('button');
    tab.className = 'task-tab' + (i === 0 ? ' active' : '');
    tab.dataset.task = task.dir;
    tab.setAttribute('role', 'tab');
    tab.textContent = task.name;
    tab.addEventListener('click', () => select(task));
    tabs.appendChild(tab);
  });

  select(TASKS[0]);
}

/* ---------- Horizontal scroll buttons ---------- */

function initScrollButtons() {
  document.querySelectorAll('.scroll-btn').forEach((btn) => {
    const row = document.getElementById(btn.dataset.target);
    if (!row) return;

    btn.addEventListener('click', () => {
      const step = row.clientWidth * 0.8;
      row.scrollBy({ left: btn.classList.contains('scroll-btn-left') ? -step : step });
    });

    /* The "<- scroll ->" hint lives in the section heading above the row. */
    const section = row.closest('.section');
    const hint = section && section.querySelector('.scroll-hint');

    const sync = () => {
      /* Nothing overflows (few enough cards to fit): hide the arrows and hint. */
      const scrollable = row.scrollWidth > row.clientWidth + 2;
      btn.hidden = !scrollable;
      if (hint) hint.hidden = !scrollable;

      const atStart = row.scrollLeft <= 2;
      const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 2;
      btn.disabled = btn.classList.contains('scroll-btn-left') ? atStart : atEnd;
    };
    row.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  });
}

/* A plain mouse wheel only emits vertical ticks, which scroll the page and
 * leave the row untouched. While the cursor is over the row, turn vertical
 * wheel motion into horizontal scrolling; once the row hits either end the
 * event is left alone so the page scrolls past it. Trackpad horizontal
 * swipes (deltaX-dominant) already pan natively and are not intercepted. */
function initWheelScroll() {
  document.querySelectorAll('.scroll-row').forEach((row) => {
    row.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return; // pinch zoom
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = row.scrollWidth - row.clientWidth;
      if (max <= 0 || e.deltaY === 0) return;
      const atEdge = e.deltaY > 0 ? row.scrollLeft >= max - 1 : row.scrollLeft <= 0;
      if (atEdge) return;
      e.preventDefault();
      row.scrollBy({ left: e.deltaY, behavior: 'instant' });
    }, { passive: false });
  });
}

/* Touch pans natively; this adds click-and-drag panning for mouse users, who
 * otherwise can only use the arrow buttons or a horizontal wheel. */
function initDragScroll() {
  document.querySelectorAll('.scroll-row').forEach((row) => {
    let startX = 0;
    let startLeft = 0;
    let dragging = false;

    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      /* Leave videos with a control bar alone so the timeline can be scrubbed. */
      if (e.target.closest('video[controls]')) return;
      dragging = true;
      startX = e.clientX;
      startLeft = row.scrollLeft;
      /* .dragging turns off smooth-scroll and snap so the row tracks 1:1. */
      row.classList.add('dragging');
      row.setPointerCapture(e.pointerId);
    });

    row.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      row.scrollLeft = startLeft - (e.clientX - startX);
    });

    const end = () => {
      if (!dragging) return;
      dragging = false;
      row.classList.remove('dragging');
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
  });
}

/* ---------- Autoplay only what is on screen ---------- */

function initLazyPlayback() {
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const video = entry.target;
      if (entry.isIntersecting) {
        if (video.preload !== 'auto') video.preload = 'auto';
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { rootMargin: '200px 0px' });

  document.querySelectorAll('video').forEach((v) => observer.observe(v));
}

/* ---------- Misc chrome ---------- */

function initNav() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const sync = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', sync, { passive: true });
  sync();
}

function initCopyBibtex() {
  const btn = document.getElementById('copy-bibtex');
  const code = document.getElementById('bibtex-code');
  if (!btn || !code) return;

  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    } catch {
      btn.textContent = 'Copy failed';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  buildRollouts();
  buildTraining();
  buildEvaluation();
  initScrollButtons();
  initWheelScroll();
  initDragScroll();
  document.querySelectorAll('.teaser-video').forEach(watchForMissing);
  initLazyPlayback();
  initNav();
  initCopyBibtex();
});
