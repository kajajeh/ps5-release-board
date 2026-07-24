import { getStore } from "@netlify/blobs";
import seed from "../../games.json" with { type: "json" };

const MODEL = "claude-sonnet-5";             // cost-effective, supports web search
const SEARCH_TOOL = "web_search_20260318";  // latest version with dynamic filtering
const STORE = "ps5board";
const KEY = "games";
const VALID_G = new Set(["Action","Adventure","RPG","Shooter","Horror","Fighting","Racing","Strategy","Sports","MMO","Survival","Stealth","Platformer"]);

export default async () => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { console.error("ANTHROPIC_API_KEY not set"); return new Response("no key", { status: 500 }); }

    const store = getStore(STORE);
    let current;
    try { const raw = await store.get(KEY); current = raw ? JSON.parse(raw) : seed; }
    catch { current = seed; }

    const existingIds = current.map(g => g.id);
    const slim = current.map(g => ({ id: g.id, t: g.t, date: g.date || null, win: g.win || null, tbd: !!g.tbd }));
    const today = new Date().toISOString().slice(0, 10);

    const prompt =
`You maintain a catalog of confirmed PlayStation 5 game releases for Canada / North America covering the rest of 2026 and all of 2027. Today is ${today}.

CURRENT catalog (id, title, current date/window):
${JSON.stringify(slim)}

Using web search, find:
1. NEW confirmed PS5 games announced or dated for the rest of 2026 or 2027 that are NOT already in the list.
2. DATE CHANGES (delays or newly confirmed dates) for titles already in the list.
3. METACRITIC critic scores: for any catalog game whose reviews are out (released, or embargo lifted), its current Metacritic critic score (integer 0-100) and canonical Metacritic page URL. Omit games with no published critic score yet.

Rules:
- Only games CONFIRMED for PlayStation 5 (exclusive, console-exclusive, or multiplatform incl. PS5).
- Never invent a game. If you are not confident it is real and PS5-confirmed, omit it.
- For each NEW game, create a NEW lowercase alphanumeric slug id (e.g. "thewitcher4"). NEVER reuse, rename, or alter any existing id. Existing ids: ${JSON.stringify(existingIds)}.
- Bios: ~2 sentences, your own original wording, never copied marketing or article text.

Respond with STRICT JSON ONLY (no markdown, no commentary) in exactly this shape:
{
 "add":[{"id":"","t":"","dev":"","date":"YYYY-MM-DD","win":{"y":2027,"m":3},"tbd":false,"plat":"multi","g":["Action"],"hype":2,"bio":""}],
 "update":[{"id":"existing-id","date":"YYYY-MM-DD","win":{"y":2027,"m":3},"tbd":false}],
 "scores":[{"id":"existing-or-new-id","mc":88,"mcUrl":"https://www.metacritic.com/game/<slug>/"}]
}
For every game give EXACTLY ONE of: "date" (exact day) OR "win" ({y,m} month, or {y,s:"Early|Spring|Summer|Fall|Holiday"} season, or {y} year-only) OR "tbd":true.
plat is one of: "excl" (PS5 exclusive), "cons" (console exclusive +PC), "multi" (multiplatform).
hype is 1, 2, or 3. Valid genres: Action, Adventure, RPG, Shooter, Horror, Fighting, Racing, Strategy, Sports, MMO, Survival, Stealth, Platformer.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        tools: [{ type: SEARCH_TOOL, name: "web_search", max_uses: 10, allowed_callers: ["direct"] }],
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!resp.ok) { console.error("Anthropic API error", resp.status, await resp.text()); return new Response("api error", { status: 502 }); }
    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    const jsonStr = (text.match(/\{[\s\S]*\}/) || [null])[0];
    if (!jsonStr) { console.error("No JSON found in model output"); return new Response("no json", { status: 502 }); }
    const out = JSON.parse(jsonStr);

    const byId = new Map(current.map(g => [g.id, g]));

    // ----- date/window updates only (never touches id/title/bio) -----
    let updated = 0;
    for (const u of (out.update || [])) {
      const g = byId.get(u && u.id);
      if (!g) continue;
      delete g.date; delete g.win; delete g.tbd;
      if (u.date) g.date = u.date;
      else if (u.win) g.win = u.win;
      else g.tbd = true;
      updated++;
    }

    // ----- additions (validated, deduped, id-safe) -----
    let added = 0;
    for (const a of (out.add || [])) {
      if (!a || !a.id) continue;
      const id = String(a.id).replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (!id || byId.has(id)) continue;
      if (current.some(g => g.t.toLowerCase() === String(a.t || "").toLowerCase())) continue;
      const g = {
        id,
        t: String(a.t || "").slice(0, 80),
        dev: String(a.dev || "TBA").slice(0, 60),
        plat: ["excl", "cons", "multi"].includes(a.plat) ? a.plat : "multi",
        g: Array.isArray(a.g) ? a.g.filter(x => VALID_G.has(x)).slice(0, 3) : [],
        hype: [1, 2, 3].includes(a.hype) ? a.hype : 2,
        bio: String(a.bio || "").slice(0, 400)
      };
      if (!g.t || !g.g.length) continue;
      if (a.date) g.date = a.date;
      else if (a.win) g.win = a.win;
      else g.tbd = true;
      current.push(g); byId.set(id, g); added++;
      if (added > 50) break;
    }

    // ----- metacritic scores (set/refresh only) -----
    let scored = 0;
    for (const sc of (out.scores || [])) {
      const g = byId.get(sc && sc.id);
      if (!g) continue;
      const n = Number(sc.mc);
      if (Number.isFinite(n) && n >= 0 && n <= 100) {
        g.mc = Math.round(n);
        if (typeof sc.mcUrl === "string" && sc.mcUrl.startsWith("http")) g.mcUrl = sc.mcUrl;
        scored++;
      }
    }

    // safety: never persist an empty or shrunken catalog
    if (current.length < seed.length) { console.error("Refusing to write shrunken catalog"); return new Response("sanity", { status: 500 }); }

    await store.set(KEY, JSON.stringify(current));
    await store.set("updated", new Date().toISOString());
    console.log(`Refresh OK: +${added} new, ${updated} updated, ${scored} scored, total ${current.length}`);
    return new Response(JSON.stringify({ added, updated, scored, total: current.length }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("Refresh failed:", e);
    return new Response("error", { status: 500 });
  }
};

// runs at 12:00 UTC on the 1st of every month
export const config = { schedule: "0 12 1 * *" };
