// Gemeinsame Infrastruktur fuer die Ende-zu-Ende-Tests von Find Mein Soon:
// ein lokaler MQTT-Broker (aedes ueber WebSocket) ersetzt den oeffentlichen Broker, ein kleiner statischer
// Webserver liefert das Repository aus. Beides laeuft im Testprozess, ohne Netz nach draussen.
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Aedes } from "aedes";
import { createServer } from "aedes-server-factory";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

/** Startet einen MQTT-Broker mit WebSocket-Zugang auf 127.0.0.1:<port>. */
export async function startBroker(port = 9001) {
  const aedes = await Aedes.createBroker();
  const server = createServer(aedes, { ws: true });
  const sockets = trackSockets(server);
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", done);
  });
  return {
    aedes,
    port,
    url: `ws://127.0.0.1:${port}`,
    // Offene Verbindungen kappen, sonst wartet server.close() ewig auf die Browser.
    close: () => new Promise(done => {
      sockets.forEach(socket => socket.destroy());
      server.close(() => aedes.close(done));
    })
  };
}

/** Statischer Webserver fuer das Repository (nur GET, kein Verzeichnislisting). */
export async function startStatic(rootDir, port = 8099) {
  const root = resolve(rootDir);
  const server = http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url, "http://localhost");
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (statSync(file).isDirectory()) {
        if (!url.pathname.endsWith("/")) {
          response.writeHead(301, { Location: `${url.pathname}/${url.search}` }).end();
          return;
        }
        file = join(file, "index.html");
      }
      const size = statSync(file).size;
      response.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream", "Content-Length": size, "Cache-Control": "no-store" });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    }
  });
  const sockets = trackSockets(server);
  await new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", done);
  });
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise(done => {
      sockets.forEach(socket => socket.destroy());
      server.close(done);
    })
  };
}

function trackSockets(server) {
  const sockets = new Set();
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  return sockets;
}
