const clients = new Set();

function sseHandler(req, res) {
  // auth اختيارياً: token في query لو حابب تتاكد
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*", // أو الدومين بتاعك
  });
  res.write("\n");
  const client = { res };
  clients.add(client);

  req.on("close", () => clients.delete(client));
}

function broadcast(event, data) {
  const line = `event: ${event}\n` + `data: ${JSON.stringify(data || {})}\n\n`;
  for (const c of clients) {
    try {
      c.res.write(line);
    } catch {}
  }
}

module.exports = { sseHandler, broadcast };
