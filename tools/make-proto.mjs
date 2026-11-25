// make-proto.mjs — bundles proto/app.js (Three.js and all) into one
// self-contained dist/drive3d.html, with zero external requests.
//
// proto/drive3d.html is the DEV entry point: it loads Three.js from
// node_modules through an import map, which only works from a local static
// server. This script proves the OTHER path — the one a real migration of
// index.html would need to satisfy CONTRACT.md's C8 (self-contained, no CDN,
// no external host) — by inlining Three.js, GLTFLoader, sim.js, and app.js
// into a single script, dropped into the same page shell.
//
// This does not touch index.html, tools/make-artifact.mjs, or the signed
// contract. It only builds the separate 3D proof.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_HTML = path.join(ROOT, "proto", "drive3d.html");
const OUT_DIR = path.join(ROOT, "dist");
const OUT = path.join(OUT_DIR, "drive3d.html");

const result = await esbuild.build({
  entryPoints: [path.join(ROOT, "proto", "app.js")],
  bundle: true,
  format: "iife",
  write: false,
  minify: false,
  target: "es2019"
});
const bundledJs = result.outputFiles[0].text;

if (bundledJs.includes("import ") || bundledJs.includes("import(")) {
  throw new Error("the bundle still carries an import — it is not self-contained");
}

const shell = fs.readFileSync(SRC_HTML, "utf8");

// Strip the dev-only <script type="importmap"> and the module script tag
// that only work from a local server; replace them with the bundle inline.
const withoutImportmap = shell.replace(
  /<script type="importmap">[\s\S]*?<\/script>\s*/,
  ""
);
const withoutModuleTag = withoutImportmap.replace(
  /<script type="module" src="app\.js"><\/script>/,
  `<script>\n${bundledJs}\n</script>`
);

if (withoutModuleTag === shell) {
  throw new Error("the module script tag was not found or not replaced");
}
if (withoutModuleTag.includes('type="importmap"')) {
  throw new Error("the import map was not removed");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, withoutModuleTag, "utf8");
console.log(`wrote ${path.relative(ROOT, OUT)}  ${withoutModuleTag.length} bytes`);
console.log(`(Three.js + GLTFLoader + sim + app inlined; zero external requests)`);
