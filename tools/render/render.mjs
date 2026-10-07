// Usage: node render.mjs <clip> <outDir> <frames> [w] [h] [onlyT]
import { createRequire } from "module";
import fs from "fs";
import http from "http";
import path from "path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const [clip, out, nStr, w = "1600", h = "900", only] = process.argv.slice(2);
const N = +nStr;
const root = path.dirname(new URL(import.meta.url).pathname);
const types = { ".html": "text/html", ".js": "text/javascript" };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); res.end(d); });
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on("console", (m) => console.log("[page]", m.text()));
page.on("pageerror", (e) => console.log("[err]", e.message));
await page.goto(`http://localhost:${port}/scene.html?clip=${clip}&w=${w}&h=${h}`);
await page.waitForFunction("window.ready === true", null, { timeout: 60000 });
fs.mkdirSync(out, { recursive: true });
const list = only !== undefined ? only.split(",").map(Number) : [...Array(N).keys()].map((i) => i / (N - 1));
let i = 0; const t0 = Date.now();
for (const t of list) {
  const data = await page.evaluate((t) => window.renderAt(t), t);
  i++;
  const name = only !== undefined ? `test_${t.toFixed(2)}.jpg` : `frame_${String(i).padStart(4, "0")}.jpg`;
  fs.writeFileSync(path.join(out, name), Buffer.from(data.split(",")[1], "base64"));
  if (i % 20 === 0 || only !== undefined) console.log(`${clip}: ${i}/${list.length} (${((Date.now() - t0) / i / 1000).toFixed(2)}s/frame)`);
}
await browser.close(); server.close();
