import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../apps/console");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);
const mediaTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function resolveTarget(pathname) {
  let requested = pathname === "/" ? "/home.html" : pathname;
  // Support directory-style multipage routes used by GitHub Pages.
  if (requested.endsWith("/")) requested += "index.html";
  const asDirIndex = path.resolve(root, `.${requested}`);
  return asDirIndex;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let target = resolveTarget(url.pathname);

    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    let metadata;
    try {
      metadata = await stat(target);
      if (metadata.isDirectory()) {
        target = path.join(target, "index.html");
        metadata = await stat(target);
      }
    } catch {
      // Map /status -> status/index.html etc.
      const alt = path.resolve(root, `.${url.pathname.replace(/\/?$/, "")}/index.html`);
      if (alt.startsWith(`${root}${path.sep}`)) {
        target = alt;
        metadata = await stat(target);
      } else {
        throw new Error("Not found");
      }
    }

    if (!metadata.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": mediaTypes[path.extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Relay console: http://127.0.0.1:${port}`);
});
