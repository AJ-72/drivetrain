// web-app-check.mjs — proves the Last Stop web build installs as a phone app.
//
// Run:  node tools/web-app-check.mjs <folder with the web export>
// Exit: 0 only when the page links a manifest that opens full screen in
//       landscape, a service worker registers, and Chromium reports no reason
//       that stops "Add to Home screen" / "Install app".
//
// Some phone browsers keep a note on the screen in page full screen. The
// installed app has no browser bar and no note, so this is the phone path.

import fs from "fs";
import os from "os";
import path from "path";
import { serve, launchWithProfile } from "./web-serve.mjs";

const DIR = path.resolve(process.argv[2] || "godot/export/web");
const site = await serve(DIR);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "last-stop-app-"));
const context = await launchWithProfile(profile, { viewport: { width: 960, height: 540 } });
const failures = [];
const pass = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
};
try {
  const page = context.pages()[0] || (await context.newPage());
  page.on("console", (m) => {
    if (/SCRIPT ERROR/.test(m.text())) failures.push(m.text());
  });
  await page.goto(site.url);
  await page.waitForSelector("canvas");
  await page.waitForTimeout(6000);

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    return (await fetch(link.href)).json();
  });
  pass(manifest !== null, "the page links a web app manifest");
  if (manifest) {
    console.log(`manifest: ${JSON.stringify(manifest)}`);
    pass(manifest.display === "fullscreen", "the app opens full screen");
    pass(manifest.orientation === "landscape", "the app locks to landscape");
    const sizes = (manifest.icons || []).map((i) => i.sizes);
    pass(sizes.includes("512x512"), "the app has a 512x512 icon");
  }

  const worker = await page.evaluate(async () => {
    const ready = navigator.serviceWorker.ready.then(() => true);
    const late = new Promise((r) => setTimeout(() => r(false), 10000));
    return Promise.race([ready, late]);
  });
  pass(worker, "a service worker registers");

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  const reasons = installabilityErrors.map((e) => e.errorId);
  pass(reasons.length === 0, `Chromium can install the app${reasons.length ? ` (${reasons.join(", ")})` : ""}`);
} catch (e) {
  pass(false, e.message);
} finally {
  await context.close();
  site.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
process.exit(failures.length > 0 ? 1 : 0);
