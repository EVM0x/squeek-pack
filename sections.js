/* The workshop under the board.

   Five sections, none of them decoration. The calculator runs the whitepaper's
   own expressions against the live difficulty. The wheel panel shows the reading
   the chute is priced with, plus a line drawn from the samples this visit has
   taken. The log is the only place a finished shift outlives its sheet. The
   ladder and the questions say plainly what a tier buys and what it does not.

   Everything reads SqueekChain.state, which packer.js is already polling. This
   file starts no second poller and sends no request of its own. */

const SqueekSections = (() => {
  const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  const LOG_KEY = "squeekpack.log.v1";
  const LOG_MAX = 10;

  /* Block units are a u96 in the paper. Six decimals is more than enough to
     show a block and does not imply precision the arithmetic lacks. */
  function blocksText(units) {
    const b = Number(units) / Number(SqueekPack.BLOCK_UNITS);
    if (!Number.isFinite(b)) return "0";
    return b.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }

  function ago(ms) {
    const s = Math.round(ms / 1000);
    if (s < 2) return "just now";
    if (s < 90) return s + "s ago";
    const m = Math.round(s / 60);
    return m + "m ago";
  }

  /* ---------- the log ---------- */

  function readLog() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((r) => r && typeof r === "object") : [];
    } catch { return []; }
  }

  function writeLog(list) {
    try { localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(0, LOG_MAX))); }
    catch { /* private mode: the log simply does not persist */ }
  }

  function renderLog() {
    const rows = document.getElementById("logRows");
    if (!rows) return;
    const list = readLog();
    const box = document.getElementById("logBox");
    const note = document.getElementById("logNote");
    const clear = document.getElementById("logClear");

    const totalWork = list.reduce((a, r) => a + (Number(r.work) || 0), 0);
    const totalSealed = list.reduce((a, r) => a + (Number(r.sealed) || 0), 0);
    const best = list.reduce((a, r) => Math.max(a, Number(r.fill) || 0), 0);

    document.getElementById("logShifts").textContent = fmt(list.length);
    document.getElementById("logWork").textContent = fmt(totalWork);
    document.getElementById("logSealed").textContent = fmt(totalSealed);
    document.getElementById("logBest").textContent = best + "%";

    rows.textContent = "";
    list.forEach((r) => {
      const tr = document.createElement("tr");
      const seed = r.roundNumber ? "#" + r.roundNumber + " " + r.tag : String(r.tag || "local");
      [
        seed,
        fmt(Number(r.blocks) || 0),
        fmt(Number(r.work) || 0),
        (Number(r.fill) || 0) + "%",
        (Number(r.sealed) || 0) + "/4",
      ].forEach((text, i) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (i === 1) td.dataset.money = "";   // blocks: the only paid column
        if (i === 0) td.title = r.t ? new Date(r.t).toLocaleString() : "";
        tr.appendChild(td);
      });
      rows.appendChild(tr);
    });

    const empty = list.length === 0;
    if (box) box.dataset.empty = empty ? "yes" : "no";
    if (note) {
      note.textContent = empty
        ? "No shift has closed in this browser yet. The log fills as you finish them."
        : "Kept in this browser only, ten shifts deep. The oldest entry falls off the end.";
    }
    if (clear) clear.hidden = empty;
  }

  const SqueekLog = {
    all: readLog,
    add(rec) {
      const list = readLog();
      list.unshift(rec);
      writeLog(list);
      renderLog();
    },
    clear() {
      try { localStorage.removeItem(LOG_KEY); } catch { /* private mode */ }
      renderLog();
    },
  };

  /* ---------- 01: what a round is worth ---------- */

  const slider = () => document.getElementById("calcWork");

  function renderCalc() {
    const el = slider();
    if (!el) return;
    const chain = SqueekChain.state;
    const live = chain.difficulty > 0;
    const difficulty = live ? chain.difficulty : SqueekPack.MIN_DIFFICULTY;
    const work = Number(el.value) || 0;

    const units = SqueekPack.unitsFor(work, difficulty);
    const after = SqueekPack.nextDifficulty(difficulty, work);

    document.getElementById("calcWorkV").textContent = fmt(work);
    document.getElementById("calcUnits").textContent = fmt(units.toString());
    document.getElementById("calcBlocks").textContent = blocksText(units);
    document.getElementById("calcDiff").textContent = fmt(after);
    document.getElementById("calcFill").textContent =
      Math.round((work / SqueekPack.CAPACITY) * 100) + "%";

    const delta = after - difficulty;
    const moved = delta === 0
      ? "leaves the difficulty exactly where it is"
      : "moves the difficulty " + (delta > 0 ? "up " : "down ") + fmt(Math.abs(delta));
    const priced = live
      ? "Priced at " + fmt(difficulty) + ", the difficulty the chute is reading right now."
      : "No reading yet, so this is priced at the paper's floor of " + fmt(SqueekPack.MIN_DIFFICULTY) + ".";

    document.getElementById("calcNote").textContent =
      priced + " A round packing " + fmt(work) + " work " + moved +
      (delta === 0 ? ", at " + fmt(difficulty) + "." : ", from " + fmt(difficulty) + " to " + fmt(after) + ".");
  }

  /* ---------- 02: the wheel, right now ---------- */

  const samples = [];
  let lastSample = 0;

  function pushSample(difficulty) {
    if (!difficulty) return;
    const now = Date.now();
    const last = samples[samples.length - 1];
    // a new value always counts; an unchanged one is worth a mark every 30s
    if (!last || last.d !== difficulty || now - lastSample > 30000) {
      samples.push({ d: difficulty, t: now });
      lastSample = now;
      if (samples.length > 60) samples.shift();
    }
  }

  function renderSpark() {
    const line = document.getElementById("sparkLine");
    if (!line) return;
    if (samples.length === 0) {
      line.setAttribute("points", "");
      document.getElementById("sparkRange").textContent = "no readings yet";
      document.getElementById("sparkCount").textContent = "0 samples";
      return;
    }
    const values = samples.map((s) => s.d);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const W = 320, H = 60, PAD = 5;
    // one reading is a flat line across the box, not a dot that draws nothing
    const points = samples.length === 1
      ? ["0," + H / 2, W + "," + H / 2]
      : samples.map((s, i) => {
          const x = (i / (samples.length - 1)) * W;
          const y = span === 0 ? H / 2 : H - PAD - ((s.d - min) / span) * (H - PAD * 2);
          return x.toFixed(1) + "," + y.toFixed(1);
        });
    line.setAttribute("points", points.join(" "));
    document.getElementById("sparkRange").textContent = span === 0
      ? fmt(min) + " throughout"
      : fmt(min) + " to " + fmt(max);
    document.getElementById("sparkCount").textContent =
      samples.length + (samples.length === 1 ? " sample" : " samples");
  }

  function renderWheel() {
    const chain = SqueekChain.state;
    const core = chain.core;

    const height = document.getElementById("wHeight");
    if (height) {
      height.textContent = chain.blockHeight ? "#" + fmt(chain.blockHeight) : "no reading";
      height.dataset.state = chain.blockHeight ? "set" : "unset";
    }

    const diff = document.getElementById("wDiff");
    if (diff) {
      diff.textContent = chain.difficulty ? fmt(chain.difficulty) : "no reading";
      diff.dataset.state = chain.difficulty ? "set" : "unset";
    }

    const coreEl = document.getElementById("wCore");
    if (coreEl) {
      const text = chain.status === "live" ? "RUNNING"
        : chain.status === "ghost" ? "IDLE"
        : chain.status === "offline" ? "NO TELEMETRY" : "CONNECTING";
      coreEl.textContent = text;
      coreEl.dataset.mode = chain.status;
    }

    const fresh = document.getElementById("wFresh");
    if (fresh) {
      const src = chain.source === "api" ? "api.squeekchain.com"
        : chain.source === "chain" ? "SqueekCore on Sepolia"
        : "nothing answering";
      fresh.textContent = core && core.paused ? "paused on chain, read from " + src
        : "read from " + src;
    }

    const prog = document.getElementById("wProgress");
    const bar = document.getElementById("wBar");
    if (prog && bar) {
      const p = core ? Number(core.blockProgress) / Number(SqueekPack.BLOCK_UNITS) : NaN;
      if (Number.isFinite(p) && p >= 0) {
        const pct = Math.min(100, p * 100);
        prog.textContent = pct.toFixed(1) + "%";
        bar.style.width = pct + "%";
      } else {
        prog.textContent = "no reading";
        bar.style.width = "0%";
      }
    }

    pushSample(chain.difficulty);
    renderSpark();

    const note = document.getElementById("wheelNote");
    if (note && chain.difficulty) {
      const perUnit = SqueekPack.unitsFor(1, chain.difficulty);
      // the paper floors, so one work unit is never a whole number of block
      // units. Saying "worth 114,364,135" and then multiplying it by a thousand
      // would not reach the number printed beside it, so the remainder is named.
      note.textContent =
        "At this difficulty one work unit is worth " + fmt(perUnit.toString()) +
        " block units plus a remainder, so a burst of 1,000 pays " +
        fmt(SqueekPack.unitsFor(1000, chain.difficulty).toString()) + ".";
    }
  }

  /* ---------- wire ---------- */

  function wire() {
    const el = slider();
    if (el) {
      el.addEventListener("input", renderCalc);
      document.querySelectorAll(".calc__presets [data-work]").forEach((b) => {
        b.addEventListener("click", () => {
          el.value = b.dataset.work;
          renderCalc();
        });
      });
    }

    const ladder = document.getElementById("ladderBtn");
    if (ladder) {
      ladder.addEventListener("click", () => {
        const btn = document.getElementById("holderBtn");
        if (btn) btn.click();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    const clear = document.getElementById("logClear");
    if (clear) clear.addEventListener("click", () => SqueekLog.clear());

    const top = document.getElementById("totop");
    const board = document.getElementById("board");
    if (top) {
      top.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
        const start = document.getElementById("startBtn");
        if (start && !start.hidden) start.focus({ preventScroll: true });
      });
      const onScroll = () => {
        const past = board ? window.scrollY > board.offsetHeight * 0.6 : window.scrollY > 400;
        top.dataset.show = past ? "yes" : "no";
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    document.addEventListener("squeekpack:log", renderLog);
  }

  function boot() {
    // SqueekChain is a top level const, not a window property, so the guard has
    // to be a typeof check rather than a lookup on window.
    if (typeof SqueekPack === "undefined" || typeof SqueekChain === "undefined") return;
    wire();
    renderLog();
    renderCalc();
    renderWheel();
    // the panel follows the same five second poll the game already runs
    setInterval(() => { renderWheel(); renderCalc(); }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  return { renderLog, renderCalc, renderWheel, SqueekLog };
})();

window.SqueekLog = SqueekSections.SqueekLog;
