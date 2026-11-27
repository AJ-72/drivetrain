// features.mjs — checks for backlog items F1 (seeded race) and F2 (stop mark).
// These sit beside the frozen contract (test/contract.mjs). They do not
// replace or weaken any contract check.
//
// Run:  node test/features.mjs
// Exit: 0 only when every check passes.

import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(fs.existsSync("/opt/node22/lib/node_modules/playwright")
  ? "/opt/node22/lib/node_modules/" : import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL = pathToFileURL(path.join(ROOT, "index.html")).href;

let failures = 0;
function check(id, problems, note) {
  if (problems.length === 0) console.log(`PASS ${id}${note ? " " + note : ""}`);
  else { failures += 1; console.log(`FAIL ${id} ${problems.join(" | ")}`); }
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function open(hash) {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e && e.message)));
  await page.goto(URL + (hash || ""));
  await page.waitForFunction(() => !!window.__drivetrain);
  page.__errors = errors;
  return page;
}

// The three draws a seed decides, read straight after a race starts.
function draws(page, seed) {
  return page.evaluate((s) => {
    const d = window.__drivetrain;
    d.test.start({ seed: s });
    return { seed: d.seed, station: d.track.platformStart, grip: d.grip, rival: d.rivalBase };
  }, seed);
}

// Full power to brakeAt, then full brake to a stand. Pins only the seed.
function drive(page, seed, brakeAt) {
  return page.evaluate(([s, x]) => {
    const d = window.__drivetrain;
    d.test.start({ seed: s });
    d.test.setInput({ throttle: true, brake: false });
    let n = 0;
    while (d.playerPos < x && d.state === "RACING" && n < 20000) { d.test.step(1); n += 1; }
    d.test.setInput({ throttle: false, brake: true });
    n = 0;
    while (d.state === "RACING" && n < 20000) { d.test.step(1); n += 1; }
    d.test.setInput({ throttle: false, brake: false });
    return { result: d.result, pos: d.playerPos, ms: d.elapsedMs, rivalPos: d.rivalPos,
             markM: d.markM, gap: d.markGapM, end: d.track.platformEnd };
  }, [seed, brakeAt]);
}

const text = (page, sel) => page.evaluate((q) => {
  const e = document.querySelector(q); return e ? e.textContent.trim() : null;
}, sel);

// ------------------------------------------------------------------ F1

// F1.1 The same seed gives the same draws, on two separate pages.
{
  const p = [];
  const a = await open(), b = await open();
  for (const s of [1, 7, 48213, 99999]) {
    const x = await draws(a, s), y = await draws(b, s);
    if (JSON.stringify(x) !== JSON.stringify(y)) p.push(`seed ${s}: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`);
    if (x.seed !== s) p.push(`seed ${s} reported as ${x.seed}`);
  }
  check("F1.1 same seed, same draws", p);
  await a.close(); await b.close();
}

// F1.2 Across many seeds the draws still cover the whole range.
{
  const page = await open();
  const r = await page.evaluate(() => {
    const d = window.__drivetrain;
    const st = [], rv = [], grips = new Set();
    for (let s = 1; s <= 600; s += 1) {
      d.test.start({ seed: s });
      st.push(d.track.platformStart); rv.push(d.rivalBase); grips.add(d.grip);
    }
    return { sMin: Math.min(...st), sMax: Math.max(...st), sDistinct: new Set(st).size,
             rMin: Math.min(...rv), rMax: Math.max(...rv), grips: [...grips].sort() };
  });
  const p = [];
  if (r.sMin < 1300 || r.sMax > 1520) p.push(`stations ${r.sMin}..${r.sMax} outside 1300..1520`);
  if (r.sMin > 1320 || r.sMax < 1500) p.push(`stations ${r.sMin}..${r.sMax} do not cover the range`);
  if (r.sDistinct < 150) p.push(`only ${r.sDistinct} distinct stations`);
  if (r.rMin < 28 || r.rMax > 33 || r.rMin > 28.5 || r.rMax < 32.5) p.push(`rival ${r.rMin}..${r.rMax}`);
  if (r.grips.join() !== "DAMP,DRY,WET") p.push(`grips ${r.grips}`);
  check("F1.2 seeds cover the range", p,
    `stations ${r.sMin}..${r.sMax} (${r.sDistinct} distinct), rival ${r.rMin.toFixed(2)}..${r.rMax.toFixed(2)}, ${r.grips}`);
  await page.close();
}

// F1.3 Same seed and same presses give the same race, step for step.
{
  const a = await open(), b = await open();
  const x = await drive(a, 48213, 1000), y = await drive(b, 48213, 1000);
  const p = JSON.stringify(x) === JSON.stringify(y) ? [] : [`${JSON.stringify(x)} vs ${JSON.stringify(y)}`];
  check("F1.3 same seed and presses, same race", p, `${x.result} at ${x.pos.toFixed(2)} m, ${(x.ms / 1000).toFixed(2)} s`);
  await a.close(); await b.close();
}

// F1.4 A #seed= link sets a human race, and a restart keeps it.
{
  const p = [];
  const a = await open("#seed=48213"), b = await open("#seed=48213");
  // Space is the human START key; it runs the same uiStart() as a tap.
  const startHuman = async (page) => {
    await page.keyboard.press("Space");
    return page.evaluate(() => {
      const d = window.__drivetrain;
      return { seed: d.seed, station: d.track.platformStart, grip: d.grip, rival: d.rivalBase };
    });
  };
  const x = await startHuman(a), y = await startHuman(b);
  if (x.seed !== 48213) p.push(`link race seed ${x.seed}`);
  if (JSON.stringify(x) !== JSON.stringify(y)) p.push(`two phones differ: ${JSON.stringify(x)} vs ${JSON.stringify(y)}`);
  const again = await startHuman(a);           // START while racing restarts
  const third = await startHuman(a);
  if (third.seed !== 48213) p.push(`restart lost the link seed: ${third.seed}`);
  if (again.seed !== 48213) p.push(`restart lost the link seed: ${again.seed}`);
  for (const bad of ["#seed=0", "#seed=abc", "#seed=123456", "#xseed=5"]) {
    const page = await open(bad);
    const s = await startHuman(page);
    if (s.seed < 1 || s.seed > 99999 || !Number.isInteger(s.seed)) p.push(`${bad} gave seed ${s.seed}`);
    if (bad === "#seed=0" && s.seed === 0) p.push("#seed=0 accepted");
    if (page.__errors.length) p.push(`${bad} page errors: ${page.__errors}`);
    await page.close();
  }
  // without a link, two human starts draw different seeds (almost always)
  const c = await open();
  const s1 = (await startHuman(c)).seed, s2 = (await startHuman(c)).seed, s3 = (await startHuman(c)).seed;
  if (s1 === s2 && s2 === s3) p.push(`no-link races repeat seed ${s1}`);
  check("F1.4 #seed= link", p, `station ${x.station} m, ${x.grip}, rival ${x.rival.toFixed(2)} m/s`);
  await a.close(); await b.close(); await c.close();
}

// ------------------------------------------------------------------ F2

// Find a seed and brake point that WIN, by searching brake points on seed 48213.
async function findWin(page, seed) {
  for (let x = 700; x <= 1300; x += 10) {
    const r = await drive(page, seed, x);
    if (r.result === "WIN") return { x, r };
  }
  return null;
}

// F2.1 The board stands 20 m before the platform end, and a WIN shows the gap.
{
  const p = [];
  const page = await open();
  const found = await findWin(page, 48213);
  if (!found) p.push("no brake point between 700 and 1300 m wins seed 48213");
  else {
    const { r } = found;
    if (Math.abs(r.markM - (r.end - 20)) > 1e-9) p.push(`mark at ${r.markM}, platform end ${r.end}`);
    const shown = await text(page, "#mark");
    const want = Math.round(r.gap * 10) / 10;
    const m = /^(\d+\.\d) m (short of|past) the mark$/.exec(shown || "");
    if (want === 0) { if (shown !== "on the mark") p.push(`gap 0 shown as "${shown}"`); }
    else if (!m) p.push(`#mark reads "${shown}"`);
    else {
      if (Number(m[1]) !== Math.abs(want)) p.push(`#mark says ${m[1]} m, real gap ${r.gap.toFixed(3)} m`);
      if ((m[2] === "short of") !== (want < 0)) p.push(`#mark direction wrong for gap ${r.gap}`);
    }
    const reason = await text(page, "#reason");
    if (!/^stopped \d+ m into the platform$/.test(reason)) p.push(`#reason changed: "${reason}"`);
    const id = await text(page, "#raceid");
    if (id !== "race 48213") p.push(`#raceid reads "${id}"`);
    check("F2.1 WIN shows the gap to the mark", p,
      `"${shown}" (gap ${r.gap.toFixed(3)} m), "${id}"`);
  }
  if (!found) check("F2.1 WIN shows the gap to the mark", p);
  await page.close();
}

// F2.2 A stop past the mark but inside the platform is still a WIN, and reads "past".
{
  const p = [];
  const page = await open();
  let hit = null;
  for (let x = 700; x <= 1400 && !hit; x += 2) {
    const r = await drive(page, 48213, x);
    if (r.result === "WIN" && r.gap > 0.5) hit = r;
  }
  if (!hit) p.push("could not stop past the mark inside the platform on seed 48213");
  else {
    const shown = await text(page, "#mark");
    if (!/ m past the mark$/.test(shown || "")) p.push(`#mark reads "${shown}" for gap ${hit.gap}`);
  }
  check("F2.2 past the mark is still a WIN", p, hit ? `stopped ${hit.gap.toFixed(1)} m past, WIN` : "");
  await page.close();
}

// F2.3 Losses show no mark line; the race number still shows.
{
  const p = [];
  const page = await open();
  const r = await drive(page, 48213, 300);
  if (r.result !== "UNDERSHOT") p.push(`braking at 300 m gave ${r.result}`);
  const shown = await text(page, "#mark");
  if (shown !== "") p.push(`#mark on ${r.result}: "${shown}"`);
  const id = await text(page, "#raceid");
  if (id !== "race 48213") p.push(`#raceid reads "${id}"`);
  const over = await drive(page, 48213, 1990);
  if (over.result !== "OVERSHOT") p.push(`braking at 1990 m gave ${over.result}`);
  if ((await text(page, "#mark")) !== "") p.push("#mark shows on OVERSHOT");
  // no new line may carry a result word
  for (const sel of ["#mark", "#raceid"]) {
    const t = ((await text(page, sel)) || "").toUpperCase();
    for (const w of ["WIN", "UNDERSHOT", "OVERSHOT", "RIVAL WINS"]) if (t.includes(w)) p.push(`${sel} has ${w}`);
  }
  check("F2.3 no mark line on a loss", p);
  await page.close();
}

await browser.close();
console.log(failures === 0 ? "\nall feature checks pass" : `\n${failures} feature check(s) fail`);
process.exit(failures === 0 ? 0 : 1);
