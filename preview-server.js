const http = require("http");
const fs = require("fs");
const path = require("path");
const room = require("./api/room.js");

const root = __dirname;
const port = Number(process.env.PORT) || 8766;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  if (pathname === "/api/room") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = chunks.length ? Buffer.concat(chunks).toString("utf8") : "";
    req.body = raw ? JSON.parse(raw) : {};
    const nativeEnd = res.end.bind(res);
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (payload) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      nativeEnd(JSON.stringify(payload));
    };
    try {
      await room(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.statusCode = 500;
        nativeEnd(JSON.stringify({ ok: false, code: "ERRO" }));
      }
    }
    return;
  }
  const file = pathname === "/" ? path.join(root, "index.html") : path.normalize(path.join(root, pathname));
  if (!file.startsWith(root)) {
    res.statusCode = 403;
    res.end();
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    res.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log("Agricultura Digital em http://127.0.0.1:" + port);
});
