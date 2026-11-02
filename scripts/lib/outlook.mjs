// Validation of the AI's news/outlook output. Nothing from the model is trusted as-is.
import { clean, isAllowedUrl, sha } from "./common.mjs";
import { clamp } from "../../site/js/lib/analytics.js";

const IMPACTS = ["bullish", "bearish", "neutral", "uncertain"];
const INJECTION = /(ignore (all|previous|prior)|system prompt|api[_ -]?key|<script|javascript:)/i;

export function extractJson(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("model returned no JSON");
  return JSON.parse(text.slice(a, b + 1));
}

/** whenIst "YYYY-MM-DDTHH:MM" (India time) -> ISO UTC string, or null. */
export function istToIso(whenIst) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(whenIst || "")) return null;
  const d = new Date(`${whenIst}:00+05:30`); return Number.isNaN(+d) ? null : d.toISOString();
}

/**
 * ctx: { list, seenUrls:Set|null, today:'YYYY-MM-DD' (IST), tomorrow:'YYYY-MM-DD' }
 * Returns { items, rejected[] }. Items are ready to insert into news_items.
 */
export function validateNews(raw, kind, ctx) {
  const items = [], rejected = [];
  for (const r of (Array.isArray(raw) ? raw : []).slice(0, 8)) {
    try {
      const title = clean(r.title, 160), summary = clean(r.summary, 400), url = String(r.url || "").trim();
      if (title.length < 8 || summary.length < 20) throw new Error("too short");
      if (INJECTION.test(title + summary)) throw new Error("suspicious text");
      if (!isAllowedUrl(url, ctx.list)) throw new Error("url not allowed");
      if (ctx.seenUrls && ![...ctx.seenUrls].some((u) => u.split("#")[0] === url.split("#")[0])) throw new Error("url not in search results");
      const impact = IMPACTS.includes(r.impact) ? r.impact : "uncertain";
      let event_time = null;
      if (kind === "upcoming") {
        event_time = istToIso(r.when_ist);
        if (!event_time) throw new Error("bad when_ist");
        const day = r.when_ist.slice(0, 10);
        if (day !== ctx.today && day !== ctx.tomorrow) throw new Error("event not today/tomorrow");
      }
      items.push({ id: sha(`${kind}|${url}|${title}`), kind, title, summary, url, source: new URL(url).hostname.replace(/^www\./, ""), impact, event_time, for_date: ctx.today });
    } catch (e) { rejected.push(`${String(r?.url).slice(0, 60)}: ${e.message}`); }
  }
  return { items, rejected };
}

export function validateOutlook(raw) {
  const num = (x) => clamp(Number.isFinite(Number(x)) ? Number(x) : 0, -1, 1);
  return {
    goldBias: num(raw?.gold_bias), silverBias: num(raw?.silver_bias),
    confidence: ["low", "medium", "high"].includes(raw?.confidence) ? raw.confidence : "low",
    rationale: clean(raw?.rationale, 500),
  };
}
