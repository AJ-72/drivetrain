// web-touch-check.mjs — proves a finger tap drives the Last Stop web build.
//
// Run:  node tools/web-touch-check.mjs <folder with the web export>
// Exit: 0 only when a touch-screen tap on the title screen's FULL SCREEN item
//       puts the page in full screen.
//
// The page runs in a touch-screen context at 960x540, so the 480x270 game
// draws at exactly 2x and a game pixel (x, y) is page pixel (2x, 2y). The
// headless scene test (godot/tests/test_sim.gd) covers the pause button and
// the rotate prompt; this check covers what only a browser can: that real touch
// events reach the menus and that the browser grants full screen.

import path from "path";
import { serve, launch } from "./web-serve.mjs";

const DIR = path.resolve(process.argv[2] || "godot/export/web");
// Title items start at y 120 and step 19; on the web FULL SCREEN is the 7th.
const FULLSCREEN_ITEM = { x: 240, y: 120 + 6 * 19 + 8 };

const site = await serve(DIR);
const browser = await launch();
let failed = false;
try {
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    console.log(`[page] ${m.text()}`);
    if (/SCRIPT ERROR/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(site.url);
  await page.waitForSelector("canvas");
  await page.waitForTimeout(6000);
  const touch = await page.evaluate(() => "ontouchstart" in window);
  console.log(`touch screen reported to the page: ${touch}`);
  await page.touchscreen.tap(FULLSCREEN_ITEM.x * 2, FULLSCREEN_ITEM.y * 2);
  await page.waitForTimeout(1000);
  const full = await page.evaluate(() => document.fullscreenElement !== null);
  if (full) {
    console.log("PASS a tap on FULL SCREEN puts the page in full screen");
  } else {
    console.log("FAIL a tap on FULL SCREEN did not put the page in full screen");
    failed = true;
  }
  if (errors.length > 0) {
    console.log(`FAIL the page reported errors:\n  ${errors.join("\n  ")}`);
    failed = true;
  }
} catch (e) {
  console.log(`FAIL ${e.message}`);
  failed = true;
} finally {
  await browser.close();
  site.close();
}
process.exit(failed ? 1 : 0);
