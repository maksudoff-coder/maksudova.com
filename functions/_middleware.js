// Link previews (Telegram, WhatsApp, Facebook, X...): their bots only need the page's
// title, description and banner, so they get a tiny page with just those tags
// instead of the full 2.7 MB app.
const BOTS = /TelegramBot|WhatsApp|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|vkShare|SkypeUriPreview|Viber|Pinterest|redditbot|Applebot|Googlebot|bingbot|Iframely|Embedly/i;

export async function onRequest(ctx) {
  const req = ctx.request, url = new URL(req.url);
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html") && BOTS.test(req.headers.get("user-agent") || "")
      && !/Googlebot|bingbot|Applebot/i.test(req.headers.get("user-agent") || "")) {
    const res = await ctx.next();
    const html = await res.text();
    const head = html.slice(0, html.indexOf("<style>"));
    const tags = (head.match(/<(title>[^<]*<\/title|meta [^>]*|link rel="canonical"[^>]*)>/g) || []).filter(t => !/charset/i.test(t)).join("\n");
    return new Response("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\">\n" + tags + "\n</head><body><a href=\"https://maksudova.com/\">Tutor Maksudova</a></body></html>",
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=600" } });
  }
  return ctx.next();
}
