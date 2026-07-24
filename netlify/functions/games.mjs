import { getStore } from "@netlify/blobs";
import seed from "../../games.json" with { type: "json" };

// GET /.netlify/functions/games -> { updated, count, games }
// Live from Netlify Blobs; falls back to the committed seed before the first monthly run.
export default async () => {
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=300"
  };
  try {
    const store = getStore("ps5board");
    const raw = await store.get("games");
    let games = raw ? JSON.parse(raw) : seed;
    const updated = raw ? (await store.get("updated")) : null;

    // Merge images from seed into blob data (seed is source of truth for img/mc/mcUrl)
    if (raw) {
      const seedById = new Map(seed.map(g => [g.id, g]));
      games = games.map(g => {
        const s = seedById.get(g.id);
        if (!s) return g;
        const merged = { ...g };
        if (!merged.img && s.img) merged.img = s.img;
        return merged;
      });
    }

    return new Response(JSON.stringify({ updated, count: games.length, games }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ updated: null, count: seed.length, games: seed }), { headers });
  }
};
