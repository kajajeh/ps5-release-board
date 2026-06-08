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
    const games = raw ? JSON.parse(raw) : seed;
    const updated = raw ? (await store.get("updated")) : null;
    return new Response(JSON.stringify({ updated, count: games.length, games }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ updated: null, count: seed.length, games: seed }), { headers });
  }
};
