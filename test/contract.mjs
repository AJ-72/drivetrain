// contract.mjs — runs every check in factory/CONTRACT.md revision 5.
// The contract is frozen. Do not weaken a check here. If a check disagrees
// with the contract, stop and ask a human.
//
// Run:  node test/contract.mjs
// Exit: 0 only when all 23 checks pass.

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "index.html");
const URL = "file://" + INDEX;

const RESULTS = ["WIN", "UNDERSHOT", "OVERSHOT", "RIVAL WINS"];
// The station, the rail, and the rival all vary per race, so every
// deterministic check pins all three.
const PLAT_START = 1400;
const PLAT_END = 1640;
const PIN = { rivalMax: 28, platformStart: PLAT_START, grip: "DRY" };
const PIN_HARD = { rivalMax: 33, platformStart: PLAT_START, grip: "WET" };
const WIN_BRAKE_M = 990;      // inside the dry band of 900..1090
const SLOW_WIN_BRAKE_M = 1080; // still a win, but later
const SHORT_BRAKE_M = 300;    // an undershoot, but past the arming distance
const report = [];

function otherResults(expected) {
  return RESULTS.filter((s) => s !== expected && !expected.includes(s));
}

class Check {
  constructor(id) { this.id = id; this.problems = []; }
  ok(cond, why) { if (!cond) this.problems.push(why); return cond; }
  eq(actual, expected, label) {
    return this.ok(actual === expected, `${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  }
  between(v, lo, hi, label) {
    return this.ok(typeof v === "number" && v >= lo && v <= hi, `${label}: got ${v}, want ${lo}..${hi}`);
  }
  done(note) {
    if (this.problems.length === 0) {
      report.push([true, this.id]);
      console.log(`PASS ${this.id}${note ? " " + note : ""}`);
    } else {
      report.push([false, this.id]);
      console.log(`FAIL ${this.id} ${this.problems.join(" | ")}`);
    }
  }
}

// ---------------------------------------------------------------- utilities

let browser;

async function freshContext() {
  return browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
}

function watch(page) {
  const w = { pageerrors: [], errors: [], warns: [], dialogs: 0 };
  page.on("pageerror", (e) => w.pageerrors.push(String(e && e.message)));
  page.on("dialog", async (d) => { w.dialogs += 1; await d.dismiss().catch(() => {}); });
  page.on("console", (m) => {
    const url = (m.location() && m.location().url) || "";
    if (!url.includes("index.html")) return;      // ignore browser-owned noise
    if (m.type() === "error") w.errors.push(m.text());
    if (m.type() === "warning") w.warns.push(m.text());
  });
  return w;
}

async function openPage(ctx) {
  const page = await ctx.newPage();
  const w = watch(page);
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__drivetrain);
  return { page, w };
}

// Drives one race through the test hooks: full throttle, then brake at brakeAtM.
async function driveToBrake(page, brakeAtM, pin) {
  return page.evaluate(([x, opts]) => {
    const d = window.__drivetrain;
    d.test.start(opts);
    d.test.setInput({ throttle: true, brake: false });
    let guard = 0;
    while (d.playerPos < x && d.state === "RACING" && guard < 20000) { d.test.step(1); guard += 1; }
    d.__stopInAtBrake = d.stopInM;         // the marker's promise at the brake
    d.test.setInput({ throttle: false, brake: true });
    guard = 0;
    while (d.state === "RACING" && guard < 20000) { d.test.step(1); guard += 1; }
    return { result: d.result, pos: d.playerPos, speed: d.playerSpeed, ms: d.elapsedMs,
             stopInAtBrake: d.__stopInAtBrake };
  }, [brakeAtM, pin === undefined ? PIN : pin]);
}

async function visibleText(page) {
  return page.evaluate(() => document.body.innerText || "");
}

async function resultText(page) {
  return page.evaluate(() => {
    const el = document.querySelector("#result");
    return el ? el.textContent.trim() : "<no #result element>";
  });
}

// Asserts the result string appears once and the other strings do not.
async function assertResultStrings(c, page, expected) {
  c.eq(await resultText(page), expected, "#result text");
  const body = await visibleText(page);
  c.ok(body.includes(expected), `body text missing ${expected}`);
  for (const other of otherResults(expected)) {
    c.ok(!body.includes(other), `body text must not contain ${other}`);
  }
}

async function hold(page, sel, ms) {
  const opts = { pointerType: "touch", pointerId: 1, isPrimary: true };
  await page.dispatchEvent(sel, "pointerdown", { ...opts, button: 0, buttons: 1 });
  await page.waitForTimeout(ms);
  await page.dispatchEvent(sel, "pointerup", { ...opts, button: 0, buttons: 0 });
}

// ------------------------------------------------------------------- checks

async function C1(ctx) {
  const c = new Check("C1");
  const { page } = await openPage(ctx);
  const r = await driveToBrake(page, WIN_BRAKE_M, PIN);
  c.eq(r.result, "WIN", "result");
  c.between(r.pos, PLAT_START, PLAT_END, "playerPos");
  c.eq(r.speed, 0, "playerSpeed");
  c.ok(r.ms < 70000, `elapsedMs: got ${r.ms}, want < 70000`);
  await assertResultStrings(c, page, "WIN");
  const shown = await page.evaluate(() => {
    const el = document.querySelector("#time");
    return el ? el.textContent.trim() : "";
  });
  c.ok(/^\d+\.\d{2}s$/.test(shown), `#time format: got ${JSON.stringify(shown)}`);
  await page.close();
  c.done(`stop ${r.pos.toFixed(2)} m at ${(r.ms / 1000).toFixed(2)} s`);
}

async function fullPowerRun(ctx) {
  const { page } = await openPage(ctx);
  const r = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
    d.test.setInput({ throttle: true, brake: false });
    let guard = 0;
    while (d.state === "RACING" && guard < 6000) { d.test.step(1); guard += 1; }
    return { result: d.result, pos: d.playerPos, ms: d.elapsedMs };
  });
  return { page, r };
}

async function C2(ctx) {
  const c = new Check("C2");
  const { page, r } = await fullPowerRun(ctx);
  c.eq(r.result, "OVERSHOT", "result");
  c.ok(r.pos > PLAT_END, `playerPos: got ${r.pos}, want > ${PLAT_END}`);
  await assertResultStrings(c, page, "OVERSHOT");
  await page.close();
  c.done(`stop ${r.pos.toFixed(1)} m`);
}

async function C3(ctx) {
  const c = new Check("C3");
  const { page } = await openPage(ctx);
  const r = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
    d.test.setInput({ throttle: true, brake: false });
    let g0 = 0;
    while (d.playerPos < 300 && d.state === "RACING" && g0 < 20000) { d.test.step(1); g0 += 1; }
    d.test.setInput({ throttle: false, brake: true });
    let guard = 0;
    while (d.state === "RACING" && guard < 20000) { d.test.step(1); guard += 1; }
    const stopped = { result: d.result, pos: d.playerPos, speed: d.playerSpeed };
    d.test.setInput({ throttle: true, brake: false });
    d.test.step(600);
    stopped.posAfter = d.playerPos;
    return stopped;
  });
  c.eq(r.result, "UNDERSHOT", "result");
  c.ok(r.pos < PLAT_START, `playerPos: got ${r.pos}, want < ${PLAT_START}`);
  c.eq(r.speed, 0, "playerSpeed");
  c.eq(r.posAfter, r.pos, "playerPos after the result");
  await assertResultStrings(c, page, "UNDERSHOT");
  await page.close();
  c.done(`stop ${r.pos.toFixed(2)} m`);
}

async function C4() {
  const c = new Check("C4");
  const ctx = await freshContext();
  const { page } = await openPage(ctx);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await page.waitForFunction(() => !!window.__drivetrain);

  // (a) first win with empty storage
  const fast = await driveToBrake(page, WIN_BRAKE_M, PIN);
  c.eq(fast.result, "WIN", "(a) result");
  let body = await visibleText(page);
  c.ok(body.includes("NEW BEST"), "(a) NEW BEST missing on the first win");
  const best1 = await page.evaluate(() => window.__drivetrain.bestMs);
  c.eq(best1, fast.ms, "(a) bestMs");

  const bestShown = await page.evaluate(() => {
    const el = document.querySelector("#best");
    return el ? el.textContent.trim() : "";
  });

  // (b) reload in the same context
  await page.reload();
  await page.waitForFunction(() => !!window.__drivetrain);
  c.eq(await page.evaluate(() => window.__drivetrain.bestMs), best1, "(b) bestMs after reload");
  c.eq(await page.evaluate(() => {
    const el = document.querySelector("#best");
    return el ? el.textContent.trim() : "";
  }), bestShown, "(b) #best text after reload");

  // (c) a new page in the same context
  const second = await openPage(ctx);
  c.eq(await second.page.evaluate(() => window.__drivetrain.bestMs), best1, "(c) bestMs on a new page");
  c.eq(await second.page.evaluate(() => {
    const el = document.querySelector("#best");
    return el ? el.textContent.trim() : "";
  }), bestShown, "(c) #best text on a new page");
  await second.page.close();

  // (d) a slower win must not claim NEW BEST
  const slow = await driveToBrake(page, SLOW_WIN_BRAKE_M, PIN);
  c.eq(slow.result, "WIN", "(d) result");
  c.ok(slow.ms > fast.ms, `(d) the second win must be slower: ${slow.ms} vs ${fast.ms}`);
  body = await visibleText(page);
  c.ok(!body.includes("NEW BEST"), "(d) NEW BEST must not appear on a slower win");
  c.eq(await page.evaluate(() => window.__drivetrain.bestMs), best1, "(d) bestMs unchanged");

  await ctx.close();
  c.done(`best ${(best1 / 1000).toFixed(2)} s`);
}

async function C5() {
  const c = new Check("C5");

  // (a) storage throws
  {
    const ctx = await freshContext();
    await ctx.addInitScript(() => {
      const boom = () => { throw new DOMException("blocked", "SecurityError"); };
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { return { getItem: boom, setItem: boom, removeItem: boom, clear: boom }; }
      });
    });
    const { page, w } = await openPage(ctx);
    c.eq(await page.evaluate(() => window.__drivetrain.state), "IDLE", "(a) state after load");
    const r = await driveToBrake(page, WIN_BRAKE_M, PIN);
    c.eq(await page.evaluate(() => window.__drivetrain.state), "RESULT", "(a) state after a race");
    c.ok(RESULTS.includes(r.result), `(a) result: got ${r.result}`);
    c.eq(w.pageerrors.length, 0, `(a) pageerror count [${w.pageerrors.join(";")}]`);
    c.eq(w.dialogs, 0, "(a) dialog count");
    await ctx.close();
  }

  // (b) and (c) damaged stored values
  for (const [label, value] of [["(b)", "not-a-number"], ["(c)", "-1"]]) {
    const ctx = await freshContext();
    const first = await openPage(ctx);
    await first.page.evaluate((v) => localStorage.setItem("drivetrain.bestMs", v), value);
    await first.page.close();
    const { page, w } = await openPage(ctx);
    c.eq(await page.evaluate(() => window.__drivetrain.state), "IDLE", `${label} state after load`);
    await driveToBrake(page, WIN_BRAKE_M, PIN);
    c.eq(await page.evaluate(() => window.__drivetrain.state), "RESULT", `${label} state after a race`);
    c.eq(w.pageerrors.length, 0, `${label} pageerror count [${w.pageerrors.join(";")}]`);
    c.eq(w.dialogs, 0, `${label} dialog count`);
    await ctx.close();
  }

  c.done("blocked, not-a-number, and -1");
}

async function C6() {
  const c = new Check("C6");
  const ctx = await freshContext();
  const { page } = await openPage(ctx);

  const box = async (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, listener: !!el.dataset.control };
  }, sel);

  for (const sel of ["#throttle", "#brake"]) {
    const b = await box(sel);
    if (!c.ok(b !== null, `${sel} is missing`)) continue;
    c.ok(b.w >= 64, `${sel} width: got ${b.w}, want >= 64`);
    c.ok(b.h >= 64, `${sel} height: got ${b.h}, want >= 64`);
    c.ok(b.listener, `${sel} must carry data-control, which marks the listener element`);
  }

  await page.touchscreen.tap(...(await page.evaluate(() => {
    const r = document.querySelector("#start").getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  })));
  await page.waitForTimeout(60);
  c.eq(await page.evaluate(() => window.__drivetrain.state), "RACING", "state after a touch on START");

  // Build a speed, then measure the coast decay and the brake decay over the
  // same period. Comparing the brake against the earlier speed is not enough:
  // releasing the throttle always lowers the speed, so such a check passes even
  // when the BRAKE control is entirely unbound.
  await hold(page, "#throttle", 2000);
  const afterThrottle = await page.evaluate(() => window.__drivetrain.playerSpeed);
  c.ok(afterThrottle > 1, `speed after a throttle touch: got ${afterThrottle}, want > 1`);

  const coastFrom = await page.evaluate(() => window.__drivetrain.playerSpeed);
  await page.waitForTimeout(500);
  const coastTo = await page.evaluate(() => window.__drivetrain.playerSpeed);
  const coastDrop = coastFrom - coastTo;

  const brakeFrom = await page.evaluate(() => window.__drivetrain.playerSpeed);
  await hold(page, "#brake", 500);
  const brakeTo = await page.evaluate(() => window.__drivetrain.playerSpeed);
  const brakeDrop = brakeFrom - brakeTo;

  c.ok(brakeDrop >= coastDrop * 5,
    `the brake must beat coasting: brake dropped ${brakeDrop.toFixed(3)}, coasting dropped ${coastDrop.toFixed(3)}`);

  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  c.ok(scrollW <= 390, `scrollWidth: got ${scrollW}, want <= 390`);

  await ctx.close();
  c.done(`brake ${brakeDrop.toFixed(3)} vs coast ${coastDrop.toFixed(3)} m/s per 500 ms`);
}

async function C7(ctx) {
  const c = new Check("C7");
  // Three runs of one deterministic path prove nothing. Drive the same race
  // through three different step granularities instead, so the check also
  // proves the result does not depend on how the clock is advanced.
  const runs = [];
  for (const chunk of [1, 60, 6000]) {
    const { page } = await openPage(ctx);
    const r = await page.evaluate((n) => {
      const d = window.__drivetrain;
      d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
      d.test.setInput({ throttle: true, brake: false });
      let guard = 0;
      while (d.state === "RACING" && guard < 6000) { d.test.step(n); guard += n; }
      return { result: d.result, pos: d.playerPos, ms: d.elapsedMs };
    }, chunk);
    runs.push({ chunk, ...r });
    await page.close();
  }
  c.ok(runs.every((r) => r.result === "OVERSHOT"), `results: ${runs.map((r) => r.result).join(", ")}`);
  c.eq(new Set(runs.map((r) => r.pos)).size, 1, `stop position across granularities: ${runs.map((r) => r.pos).join(", ")}`);
  c.eq(new Set(runs.map((r) => r.ms)).size, 1, `elapsed ms across granularities: ${runs.map((r) => r.ms).join(", ")}`);
  c.done(`OVERSHOT at ${runs[0].pos.toFixed(1)} m for step sizes 1, 60, 6000`);
}

async function C8(ctx) {
  const c = new Check("C8");
  const ctxPage = await ctx.newPage();
  const requests = [];
  ctxPage.on("request", (r) => requests.push(r.url()));
  await ctxPage.goto(URL);
  await ctxPage.waitForFunction(() => !!window.__drivetrain);
  const foreign = requests.filter((u) => u !== URL);
  c.eq(foreign.length, 0, `foreign requests [${foreign.join(";")}]`);

  const src = fs.readFileSync(INDEX, "utf8");
  for (const bad of ["http://", "https://", "//cdn", "@import"]) {
    c.ok(!src.includes(bad), `index.html contains ${bad}`);
  }
  c.ok(!/<script[^>]*\ssrc=/i.test(src), "index.html has a <script src>");
  c.ok(!/<link[^>]*rel=["']?stylesheet/i.test(src), "index.html has an external stylesheet");
  const siblings = fs.readdirSync(ROOT).filter((f) => f.endsWith(".js") || f.endsWith(".css"));
  c.eq(siblings.length, 0, `sibling asset files [${siblings.join(";")}]`);
  const bytes = fs.statSync(INDEX).size;
  c.ok(bytes < 16 * 1024 * 1024, `index.html size ${bytes}`);

  await ctxPage.close();
  c.done(`${requests.length} request(s), ${bytes} bytes`);
}

async function C9(ctx) {
  const c = new Check("C9");
  const { page } = await openPage(ctx);
  const r = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start({ rivalMax: 33, platformStart: 1400, grip: "DRY" });
    d.test.step(5200);
    return { result: d.result, ms: d.elapsedMs, rivalDone: d.rivalDone };
  });
  c.eq(r.result, "RIVAL WINS", "result");
  c.eq(r.rivalDone, true, "rivalDone");
  c.between(r.ms, 45000, 65000, "rival finish ms at its top speed");
  await assertResultStrings(c, page, "RIVAL WINS");
  await page.close();
  c.done(`rival stops at ${(r.ms / 1000).toFixed(3)} s`);
}

async function C10() {
  const c = new Check("C10");
  const ctx = await freshContext();
  const page = await ctx.newPage();
  const w = watch(page);
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__drivetrain);

  const centre = async (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  }, sel);

  for (let i = 0; i < 10; i += 1) {
    await page.touchscreen.tap(...(await centre("#start")));
    await page.waitForTimeout(50);
  }

  const both = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start();
    d.test.setInput({ throttle: true, brake: true });
    const before = d.playerSpeed;
    d.test.step(60);
    return { before, after: d.playerSpeed };
  });
  c.ok(both.after <= both.before, `speed with both controls: ${both.before} -> ${both.after}`);

  for (const key of ["a", "b", "q", "z", "Escape", "Enter", "Tab", "Shift", "Control", "1", "9", "ArrowLeft", "ArrowRight"]) {
    await page.keyboard.press(key);
  }
  await page.setViewportSize({ width: 320, height: 480 });
  await page.waitForTimeout(60);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(60);

  c.eq(await page.evaluate(() => window.onerror), null, "window.onerror must stay null");

  // The game must not steal keys from a text field beside it. Taking the space
  // bar there both loses the character and destroys a race in progress.
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "hostfield";
    input.type = "text";
    document.body.appendChild(input);
    input.focus();
  });
  await page.evaluate(() => { window.__drivetrain.test.start(); window.__drivetrain.test.step(600); });
  const posBeforeTyping = await page.evaluate(() => window.__drivetrain.playerPos);
  await page.keyboard.type("go up ws");
  const typed = await page.evaluate(() => document.querySelector("#hostfield").value);
  const stateAfterTyping = await page.evaluate(() => ({
    state: window.__drivetrain.state, pos: window.__drivetrain.playerPos
  }));
  c.eq(typed, "go up ws", "a focused text field must receive every character");
  c.eq(stateAfterTyping.state, "RACING", "typing must not end the race");
  c.eq(stateAfterTyping.pos, posBeforeTyping, "typing must not move the train");
  await page.evaluate(() => { document.querySelector("#hostfield").remove(); });

  const end = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start();
    d.test.setInput({ throttle: true, brake: false });
    let guard = 0;
    while (d.state === "RACING" && guard < 6000) { d.test.step(1); guard += 1; }
    return d.state;
  });
  c.eq(end, "RESULT", "state at the end");

  c.eq(w.pageerrors.length, 0, `pageerror count [${w.pageerrors.join(";")}]`);
  c.eq(w.errors.length, 0, `console.error count [${w.errors.join(";")}]`);
  c.eq(w.warns.length, 0, `console.warn count [${w.warns.join(";")}]`);

  await ctx.close();
  c.done("10 taps, both controls, 13 keys, 2 resizes");
}

async function C11(ctx) {
  const c = new Check("C11");
  const wins = [];
  for (let x = 200; x <= 1500; x += 10) {
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__drivetrain);
    const r = await driveToBrake(page, x, PIN_HARD);
    if (r.result === "WIN") wins.push(x);
    await page.close();
  }
  if (!c.ok(wins.length > 0, "no brake point wins")) { c.done(); return; }
  const lo = wins[0];
  const hi = wins[wins.length - 1];
  const contiguous = wins.every((v, i) => i === 0 || v - wins[i - 1] === 10);
  c.ok(contiguous, `the win band is not contiguous: ${wins.join(",")}`);
  c.ok(hi - lo >= 120, `band width: got ${hi - lo}, want >= 120`);
  c.ok(hi - lo <= 600, `band width: got ${hi - lo}, want <= 600`);
  c.done(`WIN band: ${lo}..${hi} (${hi - lo} m)`);
}

async function C12() {
  const c = new Check("C12");
  const ctx = await freshContext();
  // A dispatched visibilitychange event does not suspend rAF, so a check built
  // on it can never fail. Attack the real mechanism instead: hand the page one
  // animation frame whose timestamp jumped 30 s, exactly as a returning tab
  // does, and require the frame delta clamp to absorb it.
  await ctx.addInitScript(() => {
    window.__gapMs = 0;
    const raw = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raw((t) => cb(t + window.__gapMs));
  });
  const page = await ctx.newPage();
  const w = watch(page);
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__drivetrain);

  await page.touchscreen.tap(...(await page.evaluate(() => {
    const r = document.querySelector("#start").getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  })));
  await hold(page, "#throttle", 6000);
  const before = await page.evaluate(() => ({
    pos: window.__drivetrain.playerPos, speed: window.__drivetrain.playerSpeed
  }));
  c.ok(before.speed > 10, `speed before the gap: got ${before.speed}, want > 10`);

  const GAP_S = 30;
  await page.evaluate((g) => { window.__gapMs = g * 1000; }, GAP_S);
  await page.waitForTimeout(250);

  const after = await page.evaluate(() => ({
    pos: window.__drivetrain.playerPos, state: window.__drivetrain.state
  }));
  const advance = after.pos - before.pos;
  const bound = before.speed * 0.5 + 2;           // 250 ms of real time, plus one clamped frame
  const unclamped = before.speed * GAP_S;         // what a missing clamp would give
  c.ok(advance <= bound,
    `advance across a ${GAP_S} s frame gap: got ${advance.toFixed(1)} m, want <= ${bound.toFixed(1)} m (no clamp would give about ${unclamped.toFixed(0)} m)`);
  c.eq(after.state, "RACING", "state after the gap");
  c.eq(w.pageerrors.length, 0, `pageerror count [${w.pageerrors.join(";")}]`);

  await ctx.close();
  c.done(`advance ${advance.toFixed(1)} m across a ${GAP_S} s frame gap`);
}

async function C13() {
  const c = new Check("C13");
  const ctx = await freshContext();
  const { page } = await openPage(ctx);

  const tap = async (sel) => {
    const p = await page.evaluate((s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    }, sel);
    await page.touchscreen.tap(...p);
    await page.waitForTimeout(60);
  };

  // restart during RACING
  await tap("#start");
  await hold(page, "#throttle", 400);
  await tap("#start");
  const afterRestart = await page.evaluate(() => {
    const d = window.__drivetrain;
    return { state: d.state, pos: d.playerPos, speed: d.playerSpeed };
  });
  c.eq(afterRestart.state, "IDLE", "state after a restart during a race");
  c.eq(afterRestart.pos, 0, "playerPos after a restart");
  c.eq(afterRestart.speed, 0, "playerSpeed after a restart");

  // START during RESULT begins a new race
  await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start();
    d.test.setInput({ throttle: true, brake: false });
    let guard = 0;
    while (d.state === "RACING" && guard < 6000) { d.test.step(1); guard += 1; }
  });
  c.eq(await page.evaluate(() => window.__drivetrain.state), "RESULT", "state before the restart tap");
  await tap("#start");
  c.eq(await page.evaluate(() => window.__drivetrain.state), "RACING", "state after START during a result");

  // touchcancel clears the throttle
  const opts = { pointerType: "touch", pointerId: 1, isPrimary: true, button: 0, buttons: 1 };
  await page.dispatchEvent("#throttle", "pointerdown", opts);
  await page.waitForTimeout(300);
  await page.dispatchEvent("#throttle", "touchcancel", {});
  await page.waitForTimeout(300);
  const s1 = await page.evaluate(() => window.__drivetrain.playerSpeed);
  await page.waitForTimeout(400);
  const s2 = await page.evaluate(() => window.__drivetrain.playerSpeed);
  c.ok(s2 <= s1, `speed must not rise after touchcancel: ${s1} -> ${s2}`);

  // pointerleave clears the throttle
  await page.dispatchEvent("#throttle", "pointerdown", opts);
  await page.waitForTimeout(300);
  await page.dispatchEvent("#throttle", "pointerleave", { ...opts, buttons: 0 });
  await page.waitForTimeout(300);
  const s3 = await page.evaluate(() => window.__drivetrain.playerSpeed);
  await page.waitForTimeout(400);
  const s4 = await page.evaluate(() => window.__drivetrain.playerSpeed);
  c.ok(s4 <= s3, `speed must not rise after pointerleave: ${s3} -> ${s4}`);

  // Two input sources must not clear each other. A shared boolean lets a key
  // release drop a finger's hold, and a second finger's lift drop the first's.
  const down = (id, sel) => page.dispatchEvent(sel, "pointerdown",
    { pointerType: "touch", pointerId: id, isPrimary: id === 1, button: 0, buttons: 1 });
  const up = (id, sel) => page.dispatchEvent(sel, "pointerup",
    { pointerType: "touch", pointerId: id, isPrimary: id === 1, button: 0, buttons: 0 });

  // the sub-checks above leave the game in an unknown state; force IDLE first
  for (let i = 0; i < 4; i += 1) {
    if (await page.evaluate(() => window.__drivetrain.state) === "IDLE") break;
    await tap("#start");
  }
  c.eq(await page.evaluate(() => window.__drivetrain.state), "IDLE", "state before the two-source checks");

  await tap("#start");
  await down(1, "#throttle");
  await page.waitForTimeout(300);
  await page.keyboard.down("w");
  await page.keyboard.up("w");
  await page.waitForTimeout(400);
  const keyCase = await page.evaluate(() => window.__drivetrain.playerSpeed);
  await page.waitForTimeout(400);
  const keyCase2 = await page.evaluate(() => window.__drivetrain.playerSpeed);
  c.ok(keyCase2 > keyCase, `a key release must not drop a finger hold: ${keyCase} -> ${keyCase2}`);

  await down(2, "#throttle");
  await page.waitForTimeout(200);
  await up(2, "#throttle");
  await page.waitForTimeout(400);
  const twoFinger = await page.evaluate(() => window.__drivetrain.playerSpeed);
  await page.waitForTimeout(400);
  const twoFinger2 = await page.evaluate(() => window.__drivetrain.playerSpeed);
  c.ok(twoFinger2 > twoFinger, `a second finger lifting must not drop the first: ${twoFinger} -> ${twoFinger2}`);

  // a restart with the thumb still on the lever must not leave the train dead
  await tap("#start");
  await tap("#start");
  await page.waitForTimeout(600);
  const afterHeldRestart = await page.evaluate(() => ({
    state: window.__drivetrain.state, pos: window.__drivetrain.playerPos
  }));
  c.eq(afterHeldRestart.state, "RACING", "state after a restart with the lever held");
  c.ok(afterHeldRestart.pos > 0,
    `a held lever must drive the new race: playerPos ${afterHeldRestart.pos}`);
  await up(1, "#throttle");

  await ctx.close();
  c.done("restart, result restart, touchcancel, pointerleave, two sources, held restart");
}

// C14 guards the file that actually ships. Every other check reads
// index.html, but the published page is dist/artifact.html, produced by a
// transform that no check exercised.
async function C14() {
  const c = new Check("C14");
  const { execFileSync } = await import("child_process");
  const os = await import("os");

  execFileSync(process.execPath, [path.join(ROOT, "tools", "make-artifact.mjs")], { cwd: ROOT });
  const built = fs.readFileSync(path.join(ROOT, "dist", "artifact.html"), "utf8");

  for (const tag of ["<!doctype", "<html", "<head", "<body"]) {
    c.ok(!built.toLowerCase().includes(tag), `the built file still carries ${tag}`);
  }
  c.ok(built.includes("__drivetrain"), "the built file lost the game script");

  // wrap it the way the Artifact host wraps it
  const wrapped = `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"></head><body>`
    + built + `</body></html>`;
  const tmp = path.join(os.tmpdir(), "drivetrain-artifact-check.html");
  fs.writeFileSync(tmp, wrapped, "utf8");

  const ctx = await freshContext();
  const page = await ctx.newPage();
  const w = watch(page);
  await page.goto("file://" + tmp);
  await page.waitForFunction(() => !!window.__drivetrain, { timeout: 5000 });

  const r = await driveToBrake(page, WIN_BRAKE_M, PIN);
  c.eq(r.result, "WIN", "result in the built page");
  c.between(r.pos, PLAT_START, PLAT_END, "playerPos in the built page");
  c.eq(await resultText(page), "WIN", "#result in the built page");

  const sizes = await page.evaluate(() => {
    const out = {};
    for (const id of ["throttle", "brake", "start"]) {
      const el = document.querySelector("#" + id);
      const b = el ? el.getBoundingClientRect() : null;
      out[id] = b ? { w: b.width, h: b.height } : null;
    }
    out.scrollWidth = document.documentElement.scrollWidth;
    return out;
  });
  for (const id of ["throttle", "brake"]) {
    c.ok(sizes[id] && sizes[id].w >= 64 && sizes[id].h >= 64,
      `${id} in the built page: ${JSON.stringify(sizes[id])}`);
  }
  c.ok(sizes.scrollWidth <= 390, `scrollWidth in the built page: ${sizes.scrollWidth}`);
  c.eq(w.pageerrors.length, 0, `pageerror count [${w.pageerrors.join(";")}]`);

  await ctx.close();
  c.done(`built page wins at ${(r.ms / 1000).toFixed(2)} s`);
}

// C15 — the rival must really vary, and it must stay inside its limit.
async function C15(ctx) {
  const c = new Check("C15");
  const { page } = await openPage(ctx);
  const runs = await page.evaluate(() => {
    const d = window.__drivetrain;
    const out = [];
    for (let i = 0; i < 25; i += 1) {
      d.test.start();                       // no pin: draw a fresh race
      const base = d.rivalBase;
      const t = d.track;
      let peak = 0;
      let g = 0;
      while (d.state === "RACING" && g < 20000) {
        d.test.step(1); g += 1;
        if (d.rivalMax > peak) peak = d.rivalMax;
      }
      out.push({ base, peak, ms: d.elapsedMs, result: d.result, pos: d.rivalPos,
                 ps: t.platformStart, pe: t.platformEnd, grip: d.grip });
    }
    return out;
  });

  const bases = runs.map((r) => r.base);
  const peaks = runs.map((r) => r.peak);
  const times = runs.map((r) => r.ms);
  c.ok(new Set(bases.map((v) => v.toFixed(3))).size >= 20,
    `the rival must vary: ${new Set(bases.map((v) => v.toFixed(3))).size} distinct draws in 25 races`);
  c.ok(Math.min(...bases) >= 28, `the rival draw must not go below 28 m/s: got ${Math.min(...bases)}`);
  c.ok(Math.max(...bases) <= 33, `the rival draw must not exceed 33 m/s: got ${Math.max(...bases)}`);
  c.ok(Math.max(...peaks) <= 36, `the rival must never pass its hard limit of 36 m/s: got ${Math.max(...peaks)}`);
  c.ok(runs.every((r) => r.result === "RIVAL WINS"), "an idle player must always lose");
  c.ok(runs.every((r) => r.pos >= r.ps && r.pos <= r.pe),
    "the rival must stop inside the platform it was given");
  c.ok(Math.max(...times) - Math.min(...times) > 3000,
    `the rival times must spread: ${(Math.min(...times) / 1000).toFixed(1)}..${(Math.max(...times) / 1000).toFixed(1)} s`);

  // An idle player never leads, so the runs above never trigger the rival's
  // reaction. Drive ahead and prove the rival answers.
  const react = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
    d.test.setInput({ throttle: true, brake: false });
    let g = 0, atLevel = null, peak = 0;
    while (d.state === "RACING" && g < 20000) {
      d.test.step(1); g += 1;
      if (atLevel === null && d.playerPos > 100) atLevel = d.rivalMax;
      if (d.rivalMax > peak) peak = d.rivalMax;
      if (d.playerPos - d.rivalPos > 320) break;
    }
    return { base: d.rivalBase, early: atLevel, peak, lead: d.playerPos - d.rivalPos };
  });
  c.ok(react.peak > react.early + 1,
    `the rival must push when the player leads: ${react.early.toFixed(2)} -> ${react.peak.toFixed(2)}`);
  c.ok(react.peak <= 36, `the reaction must respect the hard limit: got ${react.peak}`);

  await page.close();
  c.done(`draws ${Math.min(...bases).toFixed(1)}..${Math.max(...bases).toFixed(1)} m/s, reaction ${react.early.toFixed(1)} -> ${react.peak.toFixed(1)}, finishes ${(Math.min(...times) / 1000).toFixed(1)}..${(Math.max(...times) / 1000).toFixed(1)} s`);
}

// C16 — an early stop must not end the race.
async function C16(ctx) {
  const c = new Check("C16");
  const { page } = await openPage(ctx);
  const r = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
    d.test.setInput({ throttle: true, brake: false });
    d.test.step(12);                        // a short tap, then hesitation
    d.test.setInput({ throttle: false, brake: false });
    let g = 0;
    while (d.playerSpeed > 0 && d.state === "RACING" && g < 4000) { d.test.step(1); g += 1; }
    const stalled = { state: d.state, pos: d.playerPos, speed: d.playerSpeed };
    d.test.setInput({ throttle: true, brake: false });
    d.test.step(600);
    return { stalled, resumedPos: d.playerPos, resumedState: d.state };
  });

  c.eq(r.stalled.state, "RACING", "a stop before the arming distance must not end the race");
  c.eq(r.stalled.speed, 0, "the train must actually reach a standstill");
  c.ok(r.stalled.pos < 50, `the stall must happen before the arming distance: ${r.stalled.pos}`);
  c.ok(r.resumedPos > r.stalled.pos + 50, `the player must be able to drive on: ${r.stalled.pos} -> ${r.resumedPos}`);
  c.eq(r.resumedState, "RACING", "the race must continue after the recovery");

  // and a stop past the arming distance must still be judged
  const judged = await driveToBrake(page, SHORT_BRAKE_M, PIN);
  c.eq(judged.result, "UNDERSHOT", "a stop past the arming distance must still be judged");

  await page.close();
  c.done(`stalled at ${r.stalled.pos.toFixed(2)} m, drove on to ${r.resumedPos.toFixed(0)} m`);
}

// C17 — the station moves, so a memorised brake point cannot work.
async function C17(ctx) {
  const c = new Check("C17");
  const { page } = await openPage(ctx);
  const seen = await page.evaluate(() => {
    const d = window.__drivetrain;
    const out = [];
    for (let i = 0; i < 30; i += 1) {
      d.test.start();
      const t = d.track;
      out.push({ ps: t.platformStart, pe: t.platformEnd, warn: t.warnAt });
    }
    return out;
  });
  const starts = seen.map((v) => v.ps);
  c.ok(new Set(starts).size >= 10, `the station must move: ${new Set(starts).size} distinct positions in 30 races`);
  c.ok(Math.min(...starts) >= 1300, `station too near: ${Math.min(...starts)}`);
  c.ok(Math.max(...starts) <= 1520, `station too far: ${Math.max(...starts)}`);
  c.ok(seen.every((v) => v.pe - v.ps === 240), "the platform must always measure 240 m");
  c.ok(seen.every((v) => v.ps - v.warn === 400), "the distant signal must stand 400 m before the platform");
  c.ok(Math.max(...starts) - Math.min(...starts) >= 150,
    `the station spread must be real: ${Math.min(...starts)}..${Math.max(...starts)}`);
  await page.close();
  c.done(`stations ${Math.min(...starts)}..${Math.max(...starts)} m, ${new Set(starts).size} distinct`);
}

// C18 — a wet rail must carry the train further from the same brake point.
async function C18(ctx) {
  const c = new Check("C18");
  const { page } = await openPage(ctx);
  const stops = {};
  for (const grip of ["DRY", "DAMP", "WET"]) {
    const r = await driveToBrake(page, 700, { rivalMax: 28, platformStart: PLAT_START, grip });
    stops[grip] = r.pos;
  }
  c.ok(stops.DAMP > stops.DRY + 50,
    `damp must carry further than dry: ${stops.DRY.toFixed(0)} vs ${stops.DAMP.toFixed(0)}`);
  c.ok(stops.WET > stops.DAMP + 50,
    `wet must carry further than damp: ${stops.DAMP.toFixed(0)} vs ${stops.WET.toFixed(0)}`);

  const rails = await page.evaluate(() => {
    const d = window.__drivetrain;
    const out = [];
    for (let i = 0; i < 30; i += 1) { d.test.start(); out.push(d.grip); }
    return out;
  });
  c.ok(new Set(rails).size === 3, `all three rail conditions must appear: ${[...new Set(rails)].join(",")}`);
  await page.close();
  c.done(`stop from 700 m: dry ${stops.DRY.toFixed(0)}, damp ${stops.DAMP.toFixed(0)}, wet ${stops.WET.toFixed(0)}`);
}

// C19 — the stop marker must tell the truth. It is the player's planning tool,
// so a marker that lies is worse than no marker.
async function C19(ctx) {
  const c = new Check("C19");
  const { page } = await openPage(ctx);
  const cases = [];
  for (const grip of ["DRY", "DAMP", "WET"]) {
    for (const brakeAt of [400, 550, 700]) {
      const r = await driveToBrake(page, brakeAt, { rivalMax: 28, platformStart: PLAT_START, grip });
      const predicted = brakeAt + r.stopInAtBrake;
      cases.push({ grip, brakeAt, predicted, actual: r.pos, err: Math.abs(predicted - r.pos) });
    }
  }
  const worst = Math.max(...cases.map((v) => v.err));
  c.ok(cases.every((v) => v.predicted < 2000),
    "the check must only compare stops that fit on the track");
  for (const v of cases) {
    c.ok(v.err <= 5,
      `${v.grip} brake at ${v.brakeAt}: marker promised ${v.predicted.toFixed(1)} m, train stopped at ${v.actual.toFixed(1)} m`);
  }
  await page.close();
  c.done(`worst marker error ${worst.toFixed(2)} m across 9 runs`);
}

// C20 — the distant signal must fire 400 m out, and only then.
async function C20(ctx) {
  const c = new Check("C20");
  const { page } = await openPage(ctx);
  const r = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
    d.test.setInput({ throttle: true, brake: false });
    const out = { before: null, firedAt: null };
    let g = 0;
    while (d.state === "RACING" && g < 20000) {
      d.test.step(1); g += 1;
      if (out.before === null && d.playerPos > 500) out.before = d.passedWarn;
      if (out.firedAt === null && d.passedWarn) out.firedAt = d.playerPos;
      if (d.playerPos > 1100) break;
    }
    return out;
  });
  await page.waitForTimeout(100);          // let one animation frame paint
  r.callout = await page.evaluate(() =>
    (document.querySelector("#callout").textContent || "").trim());
  c.eq(r.before, false, "the signal must not fire early");
  c.ok(r.firedAt !== null, "the signal must fire");
  c.ok(r.firedAt >= 1000 && r.firedAt < 1010,
    `the signal must fire at 1000 m for a station at 1400 m: got ${r.firedAt}`);
  c.ok(r.callout.includes("DISTANT SIGNAL"), `the callout must name the signal: got "${r.callout}"`);
  c.ok(/\d+ M/.test(r.callout), `the callout must state the distance: got "${r.callout}"`);
  await page.close();
  c.done(`fired at ${r.firedAt.toFixed(0)} m: "${r.callout}"`);
}

// C21 — the pull must fall away with speed, and resistance must bite.
async function C21(ctx) {
  const c = new Check("C21");
  const { page } = await openPage(ctx);
  const r = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
    d.test.setInput({ throttle: true, brake: false });
    const sample = [];
    let last = 0;
    for (let i = 0; i < 40; i += 1) {
      d.test.step(300);                       // five seconds per sample
      sample.push({ t: (i + 1) * 5, v: d.playerSpeed, gain: d.playerSpeed - last });
      last = d.playerSpeed;
      if (d.state !== "RACING") break;
    }
    // coasting from speed must lose real speed to resistance
    d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
    d.test.setInput({ throttle: true, brake: false });
    let g = 0;
    while (d.playerSpeed < 40 && d.state === "RACING" && g < 60000) { d.test.step(1); g += 1; }
    const coastFrom = d.playerSpeed;
    d.test.setInput({ throttle: false, brake: false });
    d.test.step(300);
    return { sample, coastFrom, coastTo: d.playerSpeed };
  });

  const early = r.sample[0].gain;
  const later = r.sample[5].gain;
  c.ok(early > 0 && later > 0, "the train must still be gaining speed at both samples");
  c.ok(later < early * 0.6,
    `the pull must taper: gained ${early.toFixed(2)} m/s in the first 5 s, ${later.toFixed(2)} m/s in the sixth`);

  const drop = r.coastFrom - r.coastTo;
  c.ok(drop > 2,
    `coasting from ${r.coastFrom.toFixed(1)} m/s must lose real speed in 5 s: lost ${drop.toFixed(2)}`);

  await page.close();
  c.done(`gain per 5 s falls ${early.toFixed(2)} -> ${later.toFixed(2)} m/s; coasting loses ${drop.toFixed(2)} m/s`);
}

// C22 — every result must state its cause. A result that names only the winner
// teaches nothing, and a player who loses while inside the platform cannot tell
// why.
async function C22(ctx) {
  const c = new Check("C22");
  const { page } = await openPage(ctx);
  const reason = () => page.evaluate(() => {
    const el = document.querySelector("#reason");
    return el ? el.textContent.trim() : "<no #reason element>";
  });

  await driveToBrake(page, WIN_BRAKE_M, PIN);
  await page.waitForTimeout(60);
  const win = await reason();
  c.ok(/^stopped \d+ m into the platform$/.test(win), `WIN reason: "${win}"`);

  await driveToBrake(page, SHORT_BRAKE_M, PIN);
  await page.waitForTimeout(60);
  const under = await reason();
  c.ok(/^stopped \d+ m short of the platform$/.test(under), `UNDERSHOT reason: "${under}"`);

  await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
    d.test.setInput({ throttle: true, brake: false });
    let g = 0;
    while (d.state === "RACING" && g < 60000) { d.test.step(1); g += 1; }
  });
  await page.waitForTimeout(60);
  const over = await reason();
  c.ok(/track|past the platform/.test(over), `OVERSHOT reason: "${over}"`);

  await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start({ rivalMax: 33, platformStart: 1400, grip: "DRY" });
    let g = 0;
    while (d.state === "RACING" && g < 60000) { d.test.step(1); g += 1; }
  });
  await page.waitForTimeout(60);
  const idle = await reason();
  c.ok(/stood still/.test(idle), `RIVAL WINS reason when idle: "${idle}"`);

  // no reason line may contain another result word
  for (const text of [win, under, over, idle]) {
    for (const word of RESULTS) {
      c.ok(!text.toUpperCase().includes(word), `a reason line must not contain ${word}: "${text}"`);
    }
  }
  await page.close();
  c.done(`four causes stated, longest "${win}"`);
}

// C23 — the rival's final brake is the deadline, so it must be visible.
async function C23(ctx) {
  const c = new Check("C23");
  const { page } = await openPage(ctx);
  const r = await page.evaluate(() => {
    const d = window.__drivetrain;
    // The player sends no input, so the race lasts until the rival stops. At
    // full power the player runs off the end of the track first and the rival
    // never reaches its brake.
    d.test.start({ rivalMax: 28, platformStart: 1400, grip: "DRY" });
    let g = 0;
    const out = { early: null, firedAtRivalPos: null };
    while (d.state === "RACING" && g < 60000) {
      d.test.step(1); g += 1;
      if (out.early === null && d.rivalPos > 300) out.early = d.rivalBraking;
      if (out.firedAtRivalPos === null && d.rivalBraking) out.firedAtRivalPos = d.rivalPos;
      if (d.rivalBraking) break;
    }
    out.target = d.track.platformStart + 120;
    return out;
  });
  c.eq(r.early, false, "the warning must not fire early");
  c.ok(r.firedAtRivalPos !== null, "the warning must fire");
  c.ok(r.firedAtRivalPos < r.target,
    `the rival must begin braking before its stopping point: ${r.firedAtRivalPos} vs ${r.target}`);

  await page.waitForTimeout(100);
  const banner = await page.evaluate(() =>
    (document.querySelector("#callout").textContent || "").trim());
  c.ok(banner.includes("RIVAL IS STOPPING"), `the banner must warn: "${banner}"`);

  await page.close();
  c.done(`warned at rival ${r.firedAtRivalPos.toFixed(0)} m, target ${r.target} m`);
}

// --------------------------------------------------------------------- main

async function main() {
  browser = await chromium.launch();
  const shared = await freshContext();
  const stages = [
    () => C1(shared), () => C2(shared), () => C3(shared), () => C4(),
    () => C5(), () => C6(), () => C7(shared), () => C8(shared),
    () => C9(shared), () => C10(), () => C11(shared), () => C12(), () => C13(),
    () => C14(), () => C15(shared), () => C16(shared), () => C17(shared),
    () => C18(shared), () => C19(shared), () => C20(shared), () => C21(shared),
    () => C22(shared), () => C23(shared)
  ];
  const ids = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10",
               "C11", "C12", "C13", "C14", "C15", "C16", "C17", "C18", "C19", "C20", "C21", "C22", "C23"];
  for (let i = 0; i < stages.length; i += 1) {
    try {
      await stages[i]();
    } catch (e) {
      report.push([false, ids[i]]);
      console.log(`FAIL ${ids[i]} harness error: ${String(e && e.message).split("\n")[0]}`);
    }
  }
  await shared.close();
  await browser.close();

  const failed = report.filter((r) => !r[0]).map((r) => r[1]);
  console.log(`\n${report.length - failed.length}/${report.length} checks pass`);
  if (failed.length) console.log(`failing: ${failed.join(", ")}`);
  process.exit(failed.length ? 1 : 0);
}

main();
