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

  await hold(page, "#throttle", 500);
  const afterThrottle = await page.evaluate(() => window.__drivetrain.playerSpeed);
  c.ok(afterThrottle > 0, `speed after a throttle touch: got ${afterThrottle}, want > 0`);

  await hold(page, "#brake", 500);
  const afterBrake = await page.evaluate(() => window.__drivetrain.playerSpeed);
  c.ok(afterBrake < afterThrottle, `speed after a brake touch: got ${afterBrake}, want < ${afterThrottle}`);

  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  c.ok(scrollW <= 390, `scrollWidth: got ${scrollW}, want <= 390`);

  await ctx.close();
  c.done(`speed ${afterThrottle.toFixed(2)} then ${afterBrake.toFixed(2)}`);
}

async function C7(ctx) {
  const c = new Check("C7");
  const seen = [];
  for (let i = 0; i < 3; i += 1) {
    const { page, r } = await fullPowerRun(ctx);
    seen.push(r.result);
    await page.close();
  }
  c.ok(seen.every((r) => r === "OVERSHOT"), `runs: ${seen.join(", ")}`);
  c.done(seen.join(", "));
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
  const page = await ctx.newPage();
  const w = watch(page);
  await page.goto(URL);
  await page.waitForFunction(() => !!window.__drivetrain);

  await page.touchscreen.tap(...(await page.evaluate(() => {
    const r = document.querySelector("#start").getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  })));
  await hold(page, "#throttle", 6000);
  const before = await page.evaluate(() => ({ pos: window.__drivetrain.playerPos, speed: window.__drivetrain.playerSpeed }));
  c.ok(before.speed > 10, `speed before hiding: got ${before.speed}, want > 10`);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(60);

  const after = await page.evaluate(() => ({ pos: window.__drivetrain.playerPos, state: window.__drivetrain.state }));
  const advance = after.pos - before.pos;
  c.ok(advance < before.speed * 2 + 5, `advance while hidden: got ${advance.toFixed(1)} m, want < ${(before.speed * 2 + 5).toFixed(1)} m`);
  c.eq(after.state, "RACING", "state after returning");
  c.eq(w.pageerrors.length, 0, `pageerror count [${w.pageerrors.join(";")}]`);

  await ctx.close();
  c.done(`advance ${advance.toFixed(1)} m`);
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

  await ctx.close();
  c.done("restart, result restart, touchcancel, pointerleave");
}

// --------------------------------------------------------------------- main

async function main() {
  browser = await chromium.launch();
  const shared = await freshContext();
  const stages = [
    () => C1(shared), () => C2(shared), () => C3(shared), () => C4(),
    () => C5(), () => C6(), () => C7(shared), () => C8(shared),
    () => C9(shared), () => C10(), () => C11(shared), () => C12(), () => C13()
  ];
  const ids = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13"];
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
