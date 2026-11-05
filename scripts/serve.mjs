#!/usr/bin/env node
// Tiny dependency-free static server for local preview: npm run serve
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./lib/common.mjs";
const site = path.join(ROOT, "site");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  const p = path.normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(site, p.endsWith("/") ? p + "index.html" : p);
  if (!file.startsWith(site)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" }).end(await readFile(file)); }
  catch { res.writeHead(404).end("Not found"); }
}).listen(process.env.PORT || 8080, "127.0.0.1", () => console.log(`Gold Tracker India on http://localhost:${process.env.PORT || 8080}`));
