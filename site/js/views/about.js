import { h } from "../safe.js";
import { card } from "../ui.js";
export const aboutView = () => h("div", { class: "prose" }, h("h1", {}, "How this site works"),
  card("", h("h2", {}, "Where the prices come from"), h("p", {}, "Live rates are international gold and silver prices, converted to INR, with Indian import duty added to estimate the Indian rate. Rates are refreshed four times a day, Monday to Saturday (10:00, 13:00, 16:00 and 19:00 IST), and a new line is saved only when the price is different from the last check. So the 'Today's price changes' table shows when we noticed each change, which can be up to a few hours after the market moved. It is not a minute-by-minute record."),
    h("p", {}, "History (about 3 years) is built from the international price and the official USD→INR rate with the same adjustment. It is clearly marked as an estimate. Your jeweller's rate, GST (3%) and making charges are not included.")),
  card("", h("h2", {}, "How we avoid showing wrong numbers"), h("ul", {},
    h("li", {}, "Every price shows its time and source. If data is more than 3 hours old you get a warning."),
    h("li", {}, "New prices are rejected if they are impossible, jump more than 8% at once, or if 22K/18K don't match 24K."),
    h("li", {}, "News comes only from a fixed list of trusted sites and each link must be one the search really returned. Code checks everything the AI writes."),
    h("li", {}, "The forecast range comes from real price swings. The AI can only nudge it slightly, and it says when there is no verified news."))),
  card("", h("h2", {}, "The meters"), h("p", {}, h("b", {}, "Buying conditions: "), "compares today's price with the last 12 months, the 200-day average and the last 20 days. A high score means the price is low relative to history. It is not a prediction."),
    h("p", {}, h("b", {}, "Sell signal: "), "for each purchase, compares today's value with what you paid in total. At +50% it says the target is reached.")),
  card("", h("h2", {}, "Your privacy"), h("p", {}, "Purchases are stored in a database where each row is locked to your account by Row Level Security, so nobody else can read it, not even other signed-in users. Only price data is public. No ads, no trackers, no third-party scripts.")),
  card("", h("h2", {}, "Important"), h("p", {}, "Information only. Not financial or investment advice. Prices and forecasts can be wrong; confirm the rate with your seller before you buy or sell.")));
