// Optional mirror of curated sources into Supabase (table public.sources). Server-side only.
export async function mirrorSources(items, env = process.env) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return { skipped: true };
  const rows = items.map((i) => ({ id: i.id, url: i.url, title: i.title, summary: i.summary, why_it_matters: i.why_it_matters, category: i.category, level: i.level, tags: i.tags, source: i.source, published: i.published }));
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/sources?on_conflict=id`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase mirror failed: ${res.status} ${await res.text()}`);
  return { mirrored: rows.length };
}
