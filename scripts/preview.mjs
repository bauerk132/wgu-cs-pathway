import http from "node:http";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

execFileSync(process.execPath, ["scripts/build.mjs"], {stdio:"inherit"});
const {default: worker} = await import("../dist/server/index.js");
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../drizzle/0000_tracker_state.sql", import.meta.url), "utf8"));
const env = {DB: {prepare: sql => ({bind: (...args) => ({first: async () => db.prepare(sql).get(...args)})})}};
const portFlag = process.argv.indexOf("--port");
const port = Number(process.env.PORT || (portFlag >= 0 ? process.argv[portFlag + 1] : 4173));
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://" + req.headers.host);
    const headers = new Headers(req.headers);
    headers.set("oai-authenticated-user-id", "local-preview");
    if (headers.has("origin")) headers.set("origin", url.origin);
    const body = req.method === "PUT" ? Readable.toWeb(req) : undefined;
    const response = await worker.fetch(new Request(url, {method:req.method, headers, body, duplex:"half"}), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch {
    res.writeHead(500).end();
  }
}).listen(port, "0.0.0.0", () => console.log("Local preview on port " + port));

