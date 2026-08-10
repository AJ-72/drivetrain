// make-artifact.mjs — builds dist/artifact.html from index.html.
//
// index.html is a complete standalone document. It opens from a file:// path.
// The Claude Artifact host supplies <!doctype>, <html>, <head>, and <body>,
// so the published copy must not carry them.
//
// One source file serves both targets. Run:  node tools/make-artifact.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "index.html");
const OUT_DIR = path.join(ROOT, "dist");
const OUT = path.join(OUT_DIR, "artifact.html");

const src = fs.readFileSync(SRC, "utf8");

function section(open, close, label) {
  const a = src.indexOf(open);
  const b = src.indexOf(close);
  if (a === -1 || b === -1 || b < a) throw new Error(`index.html has no ${label}`);
  return src.slice(a + open.length, b);
}

const style = (() => {
  const a = src.indexOf("<style>");
  const b = src.indexOf("</style>");
  if (a === -1 || b === -1) throw new Error("index.html has no <style> block");
  return src.slice(a, b + "</style>".length);
})();

const bodyOpen = src.indexOf(">", src.indexOf("<body")) + 1;
const bodyEnd = src.indexOf("</body>");
if (bodyOpen === 0 || bodyEnd === -1) throw new Error("index.html has no <body> block");
const body = src.slice(bodyOpen, bodyEnd).trim();

const title = section("<title>", "</title>", "<title>").trim();

const out = `<title>${title}</title>\n${style}\n${body}\n`;

for (const tag of ["<!doctype", "<html", "<head", "<body", "</html>", "</head>", "</body>"]) {
  if (out.toLowerCase().includes(tag)) throw new Error(`the output still carries ${tag}`);
}
if (!out.includes("__drivetrain")) throw new Error("the output lost the game script");

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, out, "utf8");
console.log(`wrote ${path.relative(ROOT, OUT)}  ${out.length} bytes`);
