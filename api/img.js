// Radar — proxy d'images pour la carte de partage.
// Le navigateur ne peut pas dessiner une photo d'un autre site dans un canvas puis l'exporter
// (règle de sécurité CORS). Cette petite fonction récupère l'image et la renvoie depuis le même domaine.
const MAX = 8 * 1024 * 1024;
function badHost(h) {
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/i.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h.endsWith(".internal") || h.endsWith(".local");
}
module.exports = async function handler(req, res) {
  let u;
  try { u = new URL(String((req.query && req.query.url) || "")); } catch (e) { return res.status(400).end("bad url"); }
  if (!/^https?:$/.test(u.protocol) || badHost(u.hostname)) return res.status(400).end("bad url");
  try {
    const r = await fetch(u.toString(), { headers: { "user-agent": "Mozilla/5.0 (RadarShare)", "accept": "image/avif,image/webp,image/*,*/*;q=0.8" }, redirect: "follow" });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.startsWith("image/")) return res.status(502).end("not an image");
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) return res.status(413).end("too big");
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).end(buf);
  } catch (e) {
    return res.status(502).end("fetch failed");
  }
};
