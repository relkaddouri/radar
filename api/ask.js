// Radar — chat pour la version Vercel (DeepSeek ou Claude).
// Vercel > Settings > Environment Variables :
//   DEEPSEEK_API_KEY : clé DeepSeek (platform.deepseek.com)
//   RADAR_CODE       : code secret demandé une fois dans l'app
//   DEEPSEEK_MODEL   : optionnel (par défaut deepseek-flash)
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const DS_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const PROVIDER = process.env.DEEPSEEK_API_KEY ? "deepseek" : (process.env.ANTHROPIC_API_KEY ? "claude" : "");
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
  const hasKey = !!PROVIDER;
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).end(JSON.stringify({ ok: hasKey, provider: PROVIDER, needsCode: !!process.env.RADAR_CODE }));
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
    up = PROVIDER === "deepseek"
      ? await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": "Bearer " + process.env.DEEPSEEK_API_KEY },
          body: JSON.stringify({ model: DS_MODEL, max_tokens: 1500, stream: true, thinking: { type: "disabled" }, messages })
        })
      : await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: MODEL, max_tokens: 1500, stream: true, messages })
        });
  } catch (e) { return res.status(502).end("upstream"); }
  if (up.status === 429) return res.status(429).end("rate limited");
  if (!up.ok || !up.body) return res.status(502).end("upstream " + up.status);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(200);
  const reader = up.body.getReader();
  const dec = new TextDecoder();
  let buf = "", wrote = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim(); if (data === "[DONE]") continue;
        let ev; try { ev = JSON.parse(data); } catch (e) { continue; }
        let t = "";
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") t = ev.delta.text;
        else if (ev.choices && ev.choices[0] && ev.choices[0].delta && typeof ev.choices[0].delta.content === "string") t = ev.choices[0].delta.content;
        else if (ev.type === "error" || ev.error) { res.write("\u0000ERR"); continue; }
        if (t) { res.write(t); wrote = true; }
      }
    }
  } catch (e) { res.write("\u0000ERR"); }
  if (!wrote) res.write("\u0000ERR");
  res.end();
};
