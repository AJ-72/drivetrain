// web-audio-check.mjs — proves the Last Stop web build makes sound in Chromium.
//
// Run:  node tools/web-audio-check.mjs <folder with the web export>
// Exit: 0 only when a non-silent signal reaches the speakers.
//
// Before the page loads, every connect() to an AudioDestinationNode is routed
// through an AnalyserNode, so the check reads the exact signal the browser
// would play. A test tone through the same tap first proves the tap works, so a
// silent reading always means a silent game, not a broken harness.

import path from "path";
import { serve, launch } from "./web-serve.mjs";

const DIR = path.resolve(process.argv[2] || "godot/export/web");
const MIN_PEAK = 0.01;
const site = await serve(DIR);
const url = site.url;

const TAP = () => {
  window.__taps = [];
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      const ctx = dest.context;
      if (!ctx.__tap) {
        ctx.__tap = ctx.createAnalyser();
        ctx.__tap.fftSize = 2048;
        connect.call(ctx.__tap, dest);
        window.__taps.push(ctx.__tap);
      }
      return connect.call(this, ctx.__tap, ...rest);
    }
    return connect.call(this, dest, ...rest);
  };
};

const PEAK = () => {
  let peak = 0;
  const buf = new Float32Array(2048);
  for (const a of window.__taps) {
    a.getFloatTimeDomainData(buf);
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
  }
  return peak;
};

async function measure(page, ms) {
  let peak = 0;
  for (let t = 0; t < ms; t += 100) {
    peak = Math.max(peak, await page.evaluate(PEAK));
    await page.waitForTimeout(100);
  }
  return peak;
}

const browser = await launch();
let failed = false;
try {
  // 1. The harness: a test tone through the tap must read as sound.
  const probe = await browser.newPage();
  await probe.addInitScript(TAP);
  await probe.goto("about:blank");
  await probe.evaluate(() => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    return ctx.resume();
  });
  const tone = await measure(probe, 1000);
  console.log(`test tone peak ${tone.toFixed(4)}`);
  if (tone < MIN_PEAK) {
    throw new Error("the tap cannot hear a test tone, so this browser cannot measure sound");
  }
  await probe.close();

  // 2. The game: the title music and the menu blips must reach the speakers.
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("console", (m) => console.log(`[page] ${m.text()}`));
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  await page.addInitScript(TAP);
  await page.goto(url);
  await page.waitForSelector("canvas");
  await page.waitForTimeout(6000);
  // A click and key presses count as user gestures, which let Godot resume
  // audio and play the menu blip.
  await page.mouse.click(10, 10);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
  }
  const game = await measure(page, 4000);
  const contexts = await page.evaluate(() => window.__taps.length);
  console.log(`game: ${contexts} audio context(s) reached the speakers, peak ${game.toFixed(4)}`);
  if (game < MIN_PEAK) {
    console.log("FAIL the web build is silent");
    failed = true;
  } else {
    console.log("PASS the web build makes sound");
  }
} catch (e) {
  console.log(`FAIL ${e.message}`);
  failed = true;
} finally {
  await browser.close();
  site.close();
}
process.exit(failed ? 1 : 0);
