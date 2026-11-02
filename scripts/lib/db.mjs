// Minimal server-side Supabase REST client (service_role key; never used in the browser).
export function db(env = process.env) {
  const base = env.SUPABASE_URL?.replace(/\/$/, ""), key = env.SUPABASE_SERVICE_KEY;
  if (!base || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  // Secret keys (sb_secret_...) are not JWTs, so they travel in the apikey header only. Legacy service_role keys work the same way.
  const headers = { apikey: key, "Content-Type": "application/json" };
  const call = async (path, init = {}) => {
    const res = await fetch(`${base}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${init.method || "GET"} ${path.split("?")[0]} -> ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  };
  return {
    select: (table, query = "") => call(`${table}?${query}`),
    /** upsert rows in chunks. onConflict = comma list of unique columns. */
    async upsert(table, rows, onConflict, { ignoreDuplicates = false } = {}) {
      for (let i = 0; i < rows.length; i += 500)
        await call(`${table}?on_conflict=${onConflict}`, { method: "POST", headers: { Prefer: `resolution=${ignoreDuplicates ? "ignore" : "merge"}-duplicates,return=minimal` }, body: JSON.stringify(rows.slice(i, i + 500)) });
      return rows.length;
    },
    delete: (table, query) => call(`${table}?${query}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }),
  };
}
