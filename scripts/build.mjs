import { mkdir, readFile, writeFile, rm, copyFile } from "node:fs/promises";
const fromRoot = path => new URL("../" + path, import.meta.url);
const read = path => readFile(fromRoot(path), "utf8");
const entries = [
  ["/", "index.html", "text/html"], ["/style.css", "style.css", "text/css"],
  ["/app.js", "app.js", "text/javascript"], ["/state.js", "state.js", "text/javascript"],
  ["/catalog.js", "catalog.js", "text/javascript"], ["/mark.svg", "mark.svg", "image/svg+xml"]
];
const assets = Object.fromEntries(await Promise.all(entries.map(async ([url, name, mime]) => [url, [mime, await read("web/" + name)]])));
const unmodule = source => source.replace(/^import .*;\n/gm, "").replace(/^export (?!default)/gm, "");
const parts = await Promise.all(["web/catalog.js", "web/state.js", "worker/seed.js", "worker/index.js"].map(read));
await rm(fromRoot("dist"), {recursive:true, force:true});
await mkdir(fromRoot("dist/server"), {recursive:true});
await mkdir(fromRoot("dist/.openai"), {recursive:true});
await copyFile(fromRoot(".openai/hosting.json"), fromRoot("dist/.openai/hosting.json"));
await writeFile(fromRoot("dist/server/index.js"), "const assets = Object.assign(Object.create(null), " + JSON.stringify(assets) + ");\n" + parts.map(unmodule).join("\n"));

