// Radar — chat « Demander à Claude » pour la version Vercel.
// Variables d'environnement Vercel :
//   ANTHROPIC_API_KEY (obligatoire) : clé de l'API Claude (console.anthropic.com)
//   RADAR_CODE        (conseillé)   : code secret demandé une fois dans l'app, pour que personne d'autre n'utilise ta clé
//   ANTHROPIC_MODEL   (optionnel)   : modèle à utiliser (par défaut claude-haiku-4-5, rapide et économique)
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const MAX_CHARS = 60000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) return resolve(typeof req.body === "string" ? JSON.parse(req.body) : req.body);
    let raw = "";
    req.on("data", c => { raw += c; if (raw.length > MAX_CHARS * 2) reject(new Error("too big")); });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).end(JSON.stringify({ ok: hasKey, needsCode: !!process.env.RADAR_CODE }));
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!hasKey) return res.status(503).end("missing key");
  if (process.env.RADAR_CODE && req.headers["x-radar-code"] !== process.env.RADAR_CODE) return res.status(401).end("bad code");

  let body;
  try { body = await readBody(req); } catch (e) { return res.status(400).end("bad body"); }
  const msgs = Array.isArray(body && body.messages) ? body.messages : [];
  const messages = msgs
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return res.status(400).end("bad messages");
  if (messages[0].role !== "user") messages.shift();

  let up;
  try {
    up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, stream: true, messages })
    });
  } catch (e) { return res.status(502).end("upstream"); }
  if (up.status === 429) return res.status(429).end("rate limited");
  if (!up.ok || !up.body) return res.status(502).end("upstream " + up.status);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(200);
  const reader = up.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") res.write(ev.delta.text);
        else if (ev.type === "error") res.write("\u0000ERR");
      }
    }
  } catch (e) { res.write("\u0000ERR"); }
  res.end();
};
