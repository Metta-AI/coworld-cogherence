// Coworld artifact IO: the game reads its config and writes results/replay to
// URIs the runner injects (file:// locally, presigned http(s):// hosted). Mirrors
// PaintArena's read_data/write_data. Fail loud — a bad URI or non-2xx throws.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, inflateSync } from "node:zlib";

const USER_AGENT = "coworld-cogherence/0.1";

function pathOf(uri: string): string {
  return uri.startsWith("file://") ? fileURLToPath(uri) : uri;
}

/** Read raw bytes from an http(s):// or file:// (or bare-path) URI. */
export async function readBytes(uri: string): Promise<Buffer> {
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const res = await fetch(uri, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`read ${uri} -> HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFile(pathOf(uri));
}

/** Read + JSON-parse, transparently decompressing zlib (`.json.z`) / gzip
 *  (`.json.gz`) replays. The hosted replay artifact is zlib-compressed, and the
 *  CLI/runner may mount it under a name WITHOUT the suffix — so detect by magic
 *  bytes (gzip 1f 8b, zlib 78 xx) and fall back to the suffix. Plain JSON starts
 *  with '{'/'['/whitespace, never 0x1f or 0x78. */
export async function readJson(uri: string): Promise<unknown> {
  let bytes = await readBytes(uri);
  const isGzip = bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const isZlib = bytes.length > 1 && bytes[0] === 0x78;
  if (isGzip || uri.endsWith(".json.gz")) bytes = Buffer.from(gunzipSync(bytes));
  else if (isZlib || uri.endsWith(".json.z")) bytes = Buffer.from(inflateSync(bytes));
  return JSON.parse(bytes.toString("utf-8"));
}

/** Write a string to an http(s):// (PUT/POST) or file:// (or bare-path) URI. */
export async function writeData(
  uri: string,
  data: string,
  opts: { method?: "PUT" | "POST"; contentType?: string } = {},
): Promise<void> {
  const contentType = opts.contentType ?? "application/json";
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    const res = await fetch(uri, {
      method: opts.method ?? "PUT",
      headers: { "Content-Type": contentType, "User-Agent": USER_AGENT },
      body: data,
    });
    if (!res.ok) throw new Error(`write ${uri} -> HTTP ${res.status}`);
    return;
  }
  const path = pathOf(uri);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

/** Resolve a PUT/POST method from an env var (default PUT), like PaintArena. */
export function artifactMethod(value: string | undefined): "PUT" | "POST" {
  const m = (value ?? "PUT").toUpperCase();
  if (m !== "PUT" && m !== "POST") throw new Error(`expected PUT or POST, got ${value}`);
  return m;
}
