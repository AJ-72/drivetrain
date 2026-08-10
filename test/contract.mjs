// contract.mjs — runs every check in factory/CONTRACT.md revision 2.
// The contract is frozen. Do not weaken a check here. If a check disagrees
// with the contract, stop and ask a human.
//
// Run:  node test/contract.mjs
// Exit: 0 only when all 13 checks pass.

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
async function driveToBrake(page, brakeAtM) {
  return page.evaluate((x) => {
    const d = window.__drivetrain;
    d.test.start();
    d.test.setInput({ throttle: true, brake: false });
    let guard = 0;
    while (d.playerPos < x && d.state === "RACING" && guard < 20000) { d.test.step(1); guard += 1; }
    d.test.setInput({ throttle: false, brake: true });
    guard = 0;
    while (d.state === "RACING" && guard < 20000) { d.test.step(1); guard += 1; }
    return { result: d.result, pos: d.playerPos, speed: d.playerSpeed, ms: d.elapsedMs };
  }, brakeAtM);
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
  const r = await driveToBrake(page, 1420);
  c.eq(r.result, "WIN", "result");
  c.between(r.pos, 1740, 1900, "playerPos");
  c.eq(r.speed, 0, "playerSpeed");
  c.ok(r.ms < 63200, `elapsedMs: got ${r.ms}, want < 63200`);
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
    d.test.start();
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
  c.ok(r.pos > 1900, `playerPos: got ${r.pos}, want > 1900`);
  await assertResultStrings(c, page, "OVERSHOT");
  await page.close();
  c.done(`stop ${r.pos.toFixed(1)} m`);
}

async function C3(ctx) {
  const c = new Check("C3");
  const { page } = await openPage(ctx);
  const r = await page.evaluate(() => {
    const d = window.__drivetrain;
    d.test.start();
    d.test.setInput({ throttle: true, brake: false });
    d.test.step(60);
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
  c.ok(r.pos < 1740, `playerPos: got ${r.pos}, want < 1740`);
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
  const fast = await driveToBrake(page, 1420);
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
  const slow = await driveToBrake(page, 1560);
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
    const r = await driveToBrake(page, 1420);
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
    await driveToBrake(page, 1420);
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
      d.test.start();
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
    d.test.start();
    d.test.step(4200);
    return { result: d.result, ms: d.elapsedMs, rivalDone: d.rivalDone };
  });
  c.eq(r.result, "RIVAL WINS", "result");
  c.eq(r.rivalDone, true, "rivalDone");
  c.between(r.ms, 63000, 63400, "rival finish ms");
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
  for (let x = 0; x <= 2000; x += 10) {
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__drivetrain);
    const r = await driveToBrake(page, x);
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

  const r = await driveToBrake(page, 1420);
  c.eq(r.result, "WIN", "result in the built page");
  c.between(r.pos, 1740, 1900, "playerPos in the built page");
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

// --------------------------------------------------------------------- main

async function main() {
  browser = await chromium.launch();
  const shared = await freshContext();
  const stages = [
    () => C1(shared), () => C2(shared), () => C3(shared), () => C4(),
    () => C5(), () => C6(), () => C7(shared), () => C8(shared),
    () => C9(shared), () => C10(), () => C11(shared), () => C12(), () => C13(),
    () => C14()
  ];
  const ids = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14"];
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
