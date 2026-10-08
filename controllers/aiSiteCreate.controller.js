const AIConfig = require("../models/AIConfig.model");
const WebsiteRequest = require("../models/WebsiteRequest.model");
const School = require("../models/School.model");
const { USE_TEMPLATE_IMAGE, USE_TEMPLATE_CODE, usesForFeature } = require("../utils/aiConfigUse");
const { getMessageText, hasReasoningOnly, extractJsonFromText } = require("../utils/parseAiJson");
const { openRouterChat } = require("../utils/openRouterChat");
const { groqChat } = require("../utils/groqChat");

async function activeConfig(use) {
  const config = await AIConfig.findOne({ use: usesForFeature(use), is_active: true });
  if (!config) {
    const name = use === USE_TEMPLATE_IMAGE ? "Image" : "Edit";
    throw new Error(`No active ${name} model. Turn one on in AI Config.`);
  }
  return config;
}

function affordableTokens(message) {
  const match = String(message || "").match(/only afford\s+(\d+)/i);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count >= 256 ? count : null;
}

async function completeText({ config, maxTokens, messages, tag, preferHtml, provider = "openrouter" }) {
  const chat = provider === "groq" ? groqChat : openRouterChat;
  let cap = Number(maxTokens);
  if (!Number.isFinite(cap) || cap <= 0) cap = provider === "groq" ? 8192 : null;
  console.log(`${tag} ${config.model} max_tokens=${cap || "unset"} via ${provider}`);
  const run = async (tokens, extra) => {
    const limit = Number(tokens);
    try {
      const completion = await chat({
        apiKey: config.api_key,
        model: config.model,
        maxTokens: Number.isFinite(limit) && limit > 0 ? Math.max(256, Math.min(limit, cap || limit)) : undefined,
        temperature: config.temperature ?? 0.2,
        messages: extra ? [...messages, { role: "user", content: extra }] : messages,
      });
      return { status: 200, data: completion };
    } catch (err) {
      return { status: err.status || 500, data: { error: { message: err.message || (provider === "groq" ? "Groq did not answer." : "OpenRouter did not answer.") } } };
    }
  };

  const failMessage = (result) =>
    result.data?.error?.message || `The ${config.label || "model"} call failed.`;

  let result = await run(cap);
  if (result.status < 200 || result.status >= 300) {
    const msg = failMessage(result);
    const afford = affordableTokens(msg);
    if (afford && afford < cap) {
      cap = afford;
      console.warn(`${tag} key can afford ${afford} tokens, retrying`);
      result = await run(cap);
    }
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(failMessage(result));
  }
  let message = result.data?.choices?.[0]?.message;
  let text = replyText(message, preferHtml);
  let finish = result.data?.choices?.[0]?.finish_reason;
  const first = result;
  if (!text || text.length < 40) {
    console.warn(`${tag} short reply (${text.length} chars, finish=${finish || "none"}): ${JSON.stringify(String(text).slice(0, 200))}`);
    result = await run(Math.min(cap, Math.max(Math.floor(cap * 0.9), 256)));
  } else if (hasReasoningOnly(message)) {
    console.warn(`${tag} thinking only (${text.length} chars, finish=${finish || "none"})`);
    result = await run(cap, preferHtml
      ? "Write the HTML document now. Do not write a thinking process."
      : "Return one JSON object now. Do not write a thinking process.");
  } else if (finish === "length" && preferHtml && !/<\/html>/i.test(text)) {
    console.warn(`${tag} hit the token limit (${text.length} chars). The page was cut off.`);
    result = await run(cap, `The HTML stopped here. Continue from this exact ending through </html>. Do not repeat the start.\n${text.slice(-2500)}`);
  } else {
    result = first;
  }
  if (result.status < 200 || result.status >= 300) {
    const msg = failMessage(result);
    const afford = affordableTokens(msg);
    if (afford && afford < cap) {
      cap = afford;
      console.warn(`${tag} key can afford ${afford} tokens, retrying`);
      result = await run(cap);
    }
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(failMessage(result));
  }
  message = result.data?.choices?.[0]?.message;
  const continued = result !== first;
  const nextText = replyText(message, preferHtml);
  if (continued && finish === "length" && /<!doctype\s+html|<html[\s>]/i.test(text) && nextText && !/^\s*<!doctype\s+html|^\s*<html[\s>]/i.test(nextText)) {
    text = `${text}\n${nextText}`;
  } else if (nextText) {
    text = nextText;
  }
  finish = result.data?.choices?.[0]?.finish_reason;
  if (!text) throw new Error("The model returned an empty reply.");
  console.log(`${tag} ${config.model} returned ${text.length} chars, finish=${finish || "none"}`);
  return text;
}

function extractDocument(text) {
  const raw = String(text || "");
  const start = raw.search(/<!doctype\s+html|<html[\s>]/i);
  if (start === -1) return "";
  let html = raw.slice(start).trim();
  const end = html.search(/<\/html>/i);
  if (end !== -1) html = html.slice(0, end + "</html>".length);
  return html.trim();
}

function replyText(message, preferHtml) {
  const content = getMessageText(message);
  const reasoning = typeof message?.reasoning === "string" ? message.reasoning.trim() : "";
  if (preferHtml) {
    const fromContent = extractDocument(content);
    const fromReasoning = extractDocument(reasoning);
    if (looksLikePage(fromContent)) return fromContent;
    if (looksLikePage(fromReasoning)) return fromReasoning;
  }
  if (content.includes("{") && content.length >= 40) return content;
  if (reasoning.includes("{") && reasoning.length > content.length) return reasoning;
  return content || reasoning;
}

function closeTruncatedJson(text) {
  const start = String(text || "").indexOf("{");
  if (start === -1) return null;
  let s = String(text).slice(start);
  let inString = false;
  let escape = false;
  for (const ch of s) {
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
  }
  if (inString) s += '"';
  s = s.replace(/,\s*$/, "");
  const braces = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
  const brackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
  if (brackets > 0) s += "]".repeat(brackets);
  if (braces > 0) s += "}".repeat(braces);
  return extractJsonFromText(s);
}

function parseDesign(text) {
  const design = extractJsonFromText(String(text || "")) || closeTruncatedJson(text);
  if (!design || typeof design !== "object" || Array.isArray(design)) return null;
  return design;
}

function cleanHtml(chunk) {
  return String(chunk || "")
    .replace(/^\s*```(?:html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function logoSrc(logo) {
  if (!logo) return "";
  if (typeof logo === "string") return logo;
  return logo.url || logo.secure_url || "";
}

function looksLikePage(html) {
  return html.length > 80 && /<html[\s>]|<!doctype|<body[\s>]|<header[\s>]|<nav[\s>]/i.test(html);
}

function visiblePageText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBuiltPage(html) {
  const doc = extractDocument(html) || String(html || "");
  if (!looksLikePage(doc) || !/<\/html>/i.test(doc)) return false;
  const text = visiblePageText(doc);
  if (text.length < 80) return false;
  if (/must include meta viewport|we need to replicate|return only the html|we need to output|start with <!doctype/i.test(text)) return false;
  return true;
}

function ensureChrome(html, { schoolName, applyHref, loginHref, logo }) {
  let doc = extractDocument(html) || String(html || "");
  const logoImg = logo
    ? `<img src="${logo}" alt="${escapeHtml(schoolName)} logo" style="height:40px;width:auto;object-fit:contain">`
    : `<img src="https://placehold.co/120x40?text=${encodeURIComponent(schoolName)}" alt="${escapeHtml(schoolName)} logo" style="height:40px;width:auto;object-fit:contain">`;
  if (!/<header\b/i.test(doc)) {
    if (/<nav\b/i.test(doc)) {
      doc = doc.replace(/<nav\b/i, "<header><nav");
      doc = doc.replace(/<\/nav>/i, "</nav></header>");
    } else {
      const header = `<header style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px;">${logoImg}<nav><a href="${applyHref}">Apply</a><a href="${loginHref}">Login</a></nav></header>`;
      doc = /<body[^>]*>/i.test(doc)
        ? doc.replace(/<body[^>]*>/i, (open) => `${open}\n${header}`)
        : `${header}\n${doc}`;
    }
  }
  const headerHasLogo = logo
    ? new RegExp(`<header\\b[\\s\\S]*?${logo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(doc)
    : /<header\b[\s\S]*?<img\b/i.test(doc);
  if (!headerHasLogo) {
    doc = doc.replace(/<header\b[^>]*>/i, (open) => `${open}${logoImg}`);
  }
  doc = ensureBrowserIcon(doc, { schoolName, logo });
  if (!/<footer\b/i.test(doc)) {
    const footer = `<footer style="padding:28px 24px;"><p>${escapeHtml(schoolName)}</p></footer>`;
    doc = /<\/body>/i.test(doc)
      ? doc.replace(/<\/body>/i, `${footer}\n</body>`)
      : `${doc}\n${footer}`;
  }
  return doc;
}

function ensureBrowserIcon(html, { schoolName, logo }) {
  let doc = String(html || "");
  const href = String(logo || "").replace(/"/g, "");
  if (href) {
    const icon = `<link rel="icon" href="${href}"><link rel="apple-touch-icon" href="${href}">`;
    doc = doc.replace(/<link\b[^>]*rel=["'](?:shortcut icon|icon|apple-touch-icon)["'][^>]*>/gi, "");
    if (/<\/head>/i.test(doc)) doc = doc.replace(/<\/head>/i, `${icon}</head>`);
    else if (/<head[^>]*>/i.test(doc)) doc = doc.replace(/<head[^>]*>/i, (head) => `${head}${icon}`);
  }
  const title = escapeHtml(schoolName || "School");
  if (/<title\b/i.test(doc)) doc = doc.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  else if (/<\/head>/i.test(doc)) doc = doc.replace(/<\/head>/i, `<title>${title}</title></head>`);
  return doc;
}

function whyNotPage(html) {
  const doc = extractDocument(html) || String(html || "");
  if (!looksLikePage(doc)) return "not a page";
  if (!/<\/html>/i.test(doc)) return "cut off before </html>";
  const text = visiblePageText(doc);
  if (/must include meta viewport|we need to replicate|do not explain|return only the html|we need to output|start with <!doctype/i.test(text)) return "planning notes inside the page";
  if (!/<header\b/i.test(doc)) return "missing a header";
  if (!/<footer\b/i.test(doc)) return "missing a footer";
  if (!/<h1\b/i.test(doc)) return "missing a heading";
  if (!/<a\b/i.test(doc)) return "missing a link";
  return "";
}

function placeholderImages(html, keepSrc) {
  const keep = String(keepSrc || "");
  return String(html || "").replace(/<img\b([^>]*?)\/?>/gi, (tag, attrs) => {
    const srcMatch = attrs.match(/\bsrc\s*=\s*(["'])([\s\S]*?)\1/i);
    const current = srcMatch?.[2] || "";
    if (/^https:\/\/placehold\.co\//i.test(current)) return `<img${attrs}>`;
    if (keep && current === keep) return `<img${attrs}>`;
    const altMatch = attrs.match(/\balt\s*=\s*(["'])([\s\S]*?)\1/i);
    const alt = String(altMatch?.[2] || "Image").replace(/\s+/g, " ").trim() || "Image";
    const label = encodeURIComponent(alt.slice(0, 40));
    const src = `https://placehold.co/800x600?text=${label}`;
    let next = attrs;
    if (/\bsrc\s*=/i.test(next)) next = next.replace(/\bsrc\s*=\s*(["'])[\s\S]*?\1/i, `src="${src}"`);
    else next = ` src="${src}"${next}`;
    if (!/\balt\s*=/i.test(next)) next += ` alt="${alt.replace(/"/g, "")}"`;
    return `<img${next}>`;
  });
}

const RESPONSIVE_CSS = `<style>
@keyframes sclad-fade-in { from { opacity: 0; transform: translateY(56px); } to { opacity: 1; transform: none; } }
@keyframes sclad-fade-out { from { opacity: 1; transform: translateY(8px); } to { opacity: 0; transform: none; } }
header, section, main, footer { animation: sclad-fade-in 0.75s ease both; }
section:nth-of-type(2) { animation-delay: 0.12s; }
section:nth-of-type(3) { animation-delay: 0.24s; }
section:nth-of-type(4) { animation-delay: 0.36s; }
footer { animation-delay: 0.2s; }
img { max-width: 100% !important; object-fit: cover !important; }
header img { object-fit: contain !important; }
header { position: fixed !important; top: 0; left: 0; right: 0; z-index: 1000; width: 100%; }
body { padding-top: 72px !important; }
section:first-of-type {
  height: 100vh !important;
  min-height: 100vh !important;
  max-height: 100vh !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}
.sclad-nav-toggle { position: absolute; width: 1px; height: 1px; opacity: 0; }
.sclad-nav-burger { display: none; }
@media (max-width: 1024px) {
  h1 { font-size: 40px !important; line-height: 1.15 !important; }
  section, main { max-width: 100% !important; }
  html, body { max-width: 100%; overflow-x: hidden; }
  .sclad-nav-desktop { display: none !important; }
  header {
    display: flex !important; flex-direction: row !important; flex-wrap: wrap !important;
    align-items: center !important; justify-content: flex-start !important;
    gap: 10px !important; padding: 12px 16px !important; width: 100% !important; box-sizing: border-box !important;
  }
  header img { height: 36px !important; width: auto !important; max-width: 42vw !important; object-fit: contain !important; }
  .sclad-nav-burger {
    display: grid !important; place-items: center; margin-left: auto; flex: 0 0 44px;
    width: 44px; height: 44px; border-radius: 10px; font-size: 22px; cursor: pointer; line-height: 1;
  }
  .sclad-nav-menu {
    display: flex !important; flex-direction: column !important; gap: 4px; width: 100% !important;
    flex-basis: 100% !important; max-height: 0; overflow: hidden; opacity: 0;
    transform: translateY(-8px);
    transition: opacity 0.28s ease, max-height 0.28s ease, transform 0.28s ease;
  }
  .sclad-nav-toggle:checked ~ .sclad-nav-menu {
    max-height: 520px; opacity: 1; transform: none;
  }
  .sclad-nav-menu a {
    width: 100%; box-sizing: border-box; padding: 14px 12px; font-size: 16px;
    text-decoration: none; border-radius: 10px; white-space: normal;
  }
}
@media (max-width: 720px) {
  section, main { width: 100% !important; max-width: 100% !important; }
  header, header nav { flex-direction: row !important; }
  h1 { font-size: 32px !important; }
}
</style>`;

function ensureHamburger(html) {
  if (/sclad-nav-toggle|sclad-nav-burger|hamburger/i.test(html)) return html;
  const burger = `<input id="sclad-nav-toggle" class="sclad-nav-toggle" type="checkbox"><label class="sclad-nav-burger" for="sclad-nav-toggle" aria-label="Menu">☰</label>`;
  if (/<header\b[^>]*>/i.test(html)) {
    return html.replace(/<header\b[^>]*>/i, (open) => `${open}${burger}`);
  }
  return html;
}

function ensureMobile(html) {
  let page = ensureHamburger(String(html || ""));
  if (!/name=["']viewport["']/i.test(page)) {
    const meta = `<meta name="viewport" content="width=device-width, initial-scale=1">`;
    page = /<head[^>]*>/i.test(page)
      ? page.replace(/<head[^>]*>/i, (head) => `${head}${meta}`)
      : page.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${meta}</head>`);
  }
  if (!/sclad-fade-in/.test(page)) {
    page = /<\/head>/i.test(page)
      ? page.replace(/<\/head>/i, `${RESPONSIVE_CSS}</head>`)
      : page.replace(/<body[^>]*>/i, (body) => `${RESPONSIVE_CSS}${body}`);
  }
  if (!/id=["']sclad-frame["']/.test(page)) {
    const frame = `<style id="sclad-frame">html{scroll-behavior:smooth}section[id]{scroll-margin-top:72px}header{position:fixed!important;top:0;left:0;right:0;z-index:1000;width:100%}body{padding-top:72px!important}img{max-width:100%!important;object-fit:cover!important}header img{object-fit:contain!important}section:first-of-type{height:100vh!important;min-height:100vh!important;max-height:100vh!important;overflow:hidden!important;box-sizing:border-box!important}@media (max-width:1024px){.sclad-nav-desktop{display:none!important}.sclad-nav-burger{display:grid!important;place-items:center;margin-left:auto;width:44px;height:44px}header{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;align-items:center!important;position:fixed!important;top:0;left:0;right:0;z-index:1000}.sclad-nav-menu{display:flex!important;flex-direction:column!important;flex-basis:100%!important;width:100%!important;max-height:0!important;overflow:hidden!important;opacity:0}.sclad-nav-toggle:checked ~ .sclad-nav-menu{max-height:520px!important;opacity:1!important}}</style>`;
    page = /<\/head>/i.test(page)
      ? page.replace(/<\/head>/i, `${frame}</head>`)
      : page.replace(/<body[^>]*>/i, (body) => `${frame}${body}`);
  }
  return page;
}

async function saveCreatedPage(schoolId, html, color) {
  const existing = await WebsiteRequest.findOne({ school_id: schoolId }).lean();
  const page = { id: "home", title: "Home", slug: "/", order: 0, html };
  const update = {
    school_id: schoolId,
    draft_html: html,
    draft_pages: [page],
    "brief.primary_color": color,
  };
  if (!existing?.brief?.pages?.length) {
    update["brief.pages"] = [{ id: "home", title: "Home", slug: "/", order: 0, sections: [] }];
  }
  await WebsiteRequest.findOneAndUpdate(
    { school_id: schoolId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: false },
  );
  await School.updateOne(
    { school_id: schoolId },
    { $set: { website_requested: true, updated_at: new Date() } },
  );
}

function pickPage(text) {
  const raw = String(text || "");
  const document = extractDocument(raw);
  if (isBuiltPage(document)) return { title: "Home", html: document };

  const marked = raw.split(/===\s*PAGE:\s*([A-Za-z][A-Za-z ]{0,40}?)\s*===/i);
  for (let i = 1; i < marked.length; i += 2) {
    const html = cleanHtml(marked[i + 1]);
    if (isBuiltPage(html)) return { title: marked[i].trim() || "Home", html };
  }

  const docs = (raw.match(/<!doctype html[\s\S]*?<\/html>|<html[\s>][\s\S]*?<\/html>/gi) || [])
    .map(cleanHtml)
    .filter(isBuiltPage);
  if (docs[0]) return { title: "Home", html: docs[0] };

  const fences = [...raw.matchAll(/```(?:html)?\s*([\s\S]*?)```/gi)]
    .map((match) => cleanHtml(match[1]))
    .filter(isBuiltPage);
  if (fences[0]) return { title: "Home", html: fences[0] };

  const whole = extractDocument(cleanHtml(raw));
  if (isBuiltPage(whole)) return { title: "Home", html: whole };

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const data = JSON.parse(raw.slice(start, end + 1));
      const html = cleanHtml(data.html || data.page || data.home || data.pages?.[0]?.html || "");
      if (looksLikePage(html)) return { title: "Home", html };
    } catch (_) {}
  }

  return null;
}

exports.createSite = async (req, res) => {
  const tag = "[AI-SITE-CREATE]";
  try {
    const { schoolId } = req.params;
    const image = String(req.body.image || "");
    const colors = req.body.colors && typeof req.body.colors === "object" ? req.body.colors : {};
    const color = String(colors.primary || req.body.color || "#111111");
    const secondary = String(colors.secondary || "#e8eef5");
    const accent = String(colors.accent || color);
    const background = String(colors.background || "#ffffff");
    const ink = String(colors.ink || "#111111");
    const sitePrompt = String(req.body.prompt || "").trim().slice(0, 8000);
    const fontName = String(req.body.fontName || "Classic");
    const fontStack = String(req.body.fontStack || "Georgia, serif");
    if (!image.startsWith("data:image/")) {
      return res.status(400).json({ success: false, message: "Choose a template image first." });
    }

    const school = await School.findOne({ school_id: schoolId }).lean();
    const schoolName = school?.school_name || "School";
    const motto = school?.motto || "";
    const logo = logoSrc(school?.logo_url);
    const origin = String(req.body.origin || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    const loginHref = `${origin}/school/${schoolId}/login`;
    const applyHref = `${origin}/school/${schoolId}/apply`;

    const imageConfig = await activeConfig(USE_TEMPLATE_IMAGE);
    const codeSystem = `You look at one template image and write one school website page. Return the HTML document immediately. Do not plan, list rules, or explain.
Start with <!doctype html> and end with </html>.
The picture is a template, not a photo of one finished screen. It may show a long page cut into pieces and placed side by side. Do not copy that side-by-side arrangement. Use the layout and the design style, then stack those pieces in reading order into one scrolling page.
Rules:
- Do not copy the template's business or product words. Keep its layout and design style.
- School name: ${schoolName}.${motto ? ` Motto: ${motto}.` : ""}
${sitePrompt ? `- The school asked for these sections and this content. Follow it, and keep the template's layout and design style.\n${sitePrompt}` : "- No extra content was written. Build the page from the template's layout and design style."}
- Browser header: the browser tab must show the school logo. In <head> set <title>${schoolName}</title> and <link rel="icon" href="${logo || `https://placehold.co/64x64?text=${encodeURIComponent(schoolName)}`}">. Do not use any other icon.
- This is one page only. Do not make a second page. Do not link to about.html, contact.html, or any other file.
- Include a School Fees section with id="fees". Show the fees in Nigerian naira, using the ₦ sign, in a simple table or list.
- Include a Team section with id="team". Introduce the people who run and teach at the school, with a name, a role, and a short note for each person.
- Navbar header, on desktop and on a phone: the school logo image, then the school name, then at most 5 links that scroll to sections on this same page, then Apply and Login. Those five links are About, Academics, Team, Fees, and Contact. Do not add a sixth section link. Admissions can stay on the page, but it is not a navbar link. Each section has an id. Each header link uses that id, like href="#fees" for <section id="fees">. Those links must not open another page. The logo is required in the header. Use this exact image and do not replace it: ${logo ? `<img src="${logo}" alt="${schoolName} logo" style="height:40px;width:auto;object-fit:contain">` : `<img src="https://placehold.co/120x40?text=${encodeURIComponent(schoolName)}" alt="${schoolName} logo" style="height:40px;width:auto;object-fit:contain">`}
- Always include one <header> at the top and one <footer> at the bottom.
- If the template has a header, match its arrangement, spacing, and shape. If it has no header, still write one and style it so it belongs with the rest of the page.
- If the template has a footer, match its columns and spacing. If it has no footer, still write one with the school name${school?.email || school?.phone_number || school?.address ? `, ${[school.email, school.phone_number, school.address].filter(Boolean).join(", ")}` : ""} and style it so it belongs with the rest of the page.
- Put the header and footer colors, spacing, and type in style="" attributes on those elements.
- The desktop navbar can stay as a row. Tablet and phone are where it usually breaks, so spend real care there. Do not leave the desktop link row squeezed onto a tablet or a phone. At max-width 1024px and at max-width 720px the navbar is one calm row: the school logo, the school name, and a 44px menu button on the right. The five section links, Apply, and Login are not in that row. Put the desktop links in <nav class="sclad-nav-desktop"> and hide that nav at max-width 1024px. Put the same links inside the menu as full-width rows with padding, and the menu drops under the bar. The bar does not wrap, overflow, or stack the links into a messy second line. Colors, type, and spacing still match the desktop navbar. Use this exact control:
<input id="sclad-nav-toggle" class="sclad-nav-toggle" type="checkbox">
<label class="sclad-nav-burger" for="sclad-nav-toggle" aria-label="Menu">☰</label>
<div class="sclad-nav-menu"><a href="#about">About</a><a href="${applyHref}">Apply</a><a href="${loginHref}">Login</a></div>
- The menu button is hidden on desktop only. On a tablet and on a phone it is visible and it slides the menu open and closed. Write the tablet rules in @media (max-width: 1024px) and the phone rules in @media (max-width: 720px). Check both. The navbar must look finished in each, not like a desktop bar that was only made narrower.
- Logo: ${logo ? `<img src="${logo}" alt="${schoolName} logo">` : `<img src="https://placehold.co/120x40?text=${encodeURIComponent(schoolName)}" alt="${schoolName} logo">`}
- Header links scroll to a point on this page. The navbar has 5 section links at most. Give every linked section an id and point its header link at href="#that-id". Apply and Login are the only links that leave the page. Apply href="${applyHref}". Login href="${loginHref}".
- Colors are one scheme that can be changed later. Put this exact block in the style element and do not write these colors as raw hex anywhere else:
:root{--sclad-primary:${color};--sclad-secondary:${secondary};--sclad-accent:${accent};--sclad-background:${background};--sclad-ink:${ink}}
- The top navbar is position:fixed, top:0, left:0, right:0, z-index:1000, and width:100%. It is not position:absolute. Give the body padding-top so the page starts below the bar.
- var(--sclad-primary) is a fill color only. Never use it as a text color. Not on a heading, a paragraph, a link, a span, or a button label. Headings and body text use var(--sclad-ink). The page background uses var(--sclad-background). Soft panels use var(--sclad-secondary). Buttons use var(--sclad-accent) with white text. The header and footer may use var(--sclad-primary) as their background, and every word on that background is #ffffff. Do not paint a hero, section, or card with var(--sclad-primary) and then put a title in that same color. If a background is primary, the words on it are white. Every title must be readable against the color behind it. Inline style attributes must use these variables too.
- Font: ${fontName}, font-family: ${fontStack}.
- Desktop look uses style="" attributes. Also add one <style> block.
- Mobile is required. The page must fit a phone with no sideways scroll. Include <meta name="viewport" content="width=device-width, initial-scale=1">. Use @media (max-width: 1024px) for tablet and @media (max-width: 720px) for phone. On a tablet and on a phone, stack page sections into one column, but do not do that to the navbar. The navbar gets its own finished layout at both sizes, with the menu button visible.
- Slide-in is required. When the page loads, the header, each section, and the footer start below their place and slide up into view, one after another. Put that animation in the style block. The phone menu slides open and closed.
- The hero is the first <section>. It must be exactly 100vh: height, min-height, and max-height are 100vh, overflow is hidden, and the content fits inside that one screen.
- Pictures use object-fit:cover, not contain. Each content img fills its frame, crops the edges if needed, and uses max-width:100%. The frame uses overflow:hidden. The school logo is the only image that stays object-fit:contain, so the logo is not cropped.
- Content pictures use <img src="https://placehold.co/800x600?text=Library" alt="School library">. Change the size, text, and alt to match the picture. The school logo is the only image that is not a placeholder.
- Do not explain. Do not apologize. Do not repeat these instructions.`;
    const imageTurn = [
      { type: "image_url", image_url: { url: image } },
      {
        type: "text",
        text: `The image is a template. It may not be one straight website. A long site may be divided into two and placed side by side. Use the layout and the design style, then write one scrolling page. Rewrite the words for ${schoolName}.${sitePrompt ? ` Include these sections and this content:\n${sitePrompt}` : ""} This is one page. Include a Team section and a School Fees section, and show fee amounts in ₦. The navbar has at most 5 section links: About, Academics, Team, Fees, and Contact. and each one scrolls to a section on this page with href="#section-id". They must not open another page. The browser tab header must show the school logo as its icon. The navbar header must show the school logo and it is position:fixed at the top, not absolute. Never use --sclad-primary as a text color. Titles and paragraphs use --sclad-ink. Words on a primary background are #ffffff. Do not put a title in the main color on a main-color background. Put every color in the variables --sclad-primary, --sclad-secondary, --sclad-accent, --sclad-background, and --sclad-ink, and use those variables in the styles so the scheme can be changed later. Include a header and a footer. The first section is the hero and it must be 100vh. Content images use object-fit:cover so they fill their frame. The school logo stays object-fit:contain. The page must be mobile responsive, and each section must slide up into view when the page loads. Desktop navbar: school logo, name, links that scroll to sections on this page, Apply (${applyHref}), Login (${loginHref}). On a tablet and on a phone, do not squeeze that desktop bar. Restyle it: one row with the school logo, the school name, and a menu button, and the section links, Apply, and Login open underneath as full rows. The tablet navbar needs the same care as the phone navbar. Start with <!doctype html>.`,
      },
    ];
    let codeText = await completeText({
      config: imageConfig,
      preferHtml: true,
      tag: `${tag} IMAGE`,
      messages: [
        { role: "system", content: codeSystem },
        { role: "user", content: imageTurn },
      ],
    });
    let page = pickPage(codeText);
    if (!page) {
      const problem = whyNotPage(codeText);
      const partial = codeText;
      const cutOff = problem === "cut off before </html>";
      console.warn(`${tag} IMAGE ${problem} (${codeText.length} chars): ${JSON.stringify(codeText.slice(0, 240))}`);
      const retryText = await completeText({
        config: imageConfig,
        preferHtml: !cutOff,
        tag: `${tag} IMAGE-RETRY`,
        messages: cutOff
          ? [
              { role: "system", content: "Continue the school page. Return HTML only. Do not plan." },
              { role: "user", content: `The HTML stopped here. Continue from this exact ending through </html>. Do not repeat the start.\n${partial.slice(-2500)}` },
            ]
          : [
              { role: "system", content: codeSystem },
              {
                role: "user",
                content: [
                  ...imageTurn,
                  { type: "text", text: "Return the HTML document only. Begin with the doctype tag. Include a header, a footer, a heading, and the Apply and Login links." },
                ],
              },
            ],
      });
      codeText = cutOff && retryText && !/^\s*<!doctype\s+html|^\s*<html[\s>]/i.test(retryText)
        ? `${extractDocument(partial) || partial}\n${retryText}`
        : retryText;
      page = pickPage(codeText);
    }
    if (!page) {
      const snippet = codeText.replace(/\s+/g, " ").slice(0, 140);
      throw new Error(
        codeText.length < 180
          ? `The Image model did not write the page. It said: ${snippet || "nothing"}. Choose an Image model that can see pictures, then try again.`
          : "The Image model did not write the page. Try Create site again.",
      );
    }
    page = { ...page, title: "Home", html: bindScheme(ensureMobile(placeholderImages(ensureChrome(page.html, { schoolName, applyHref, loginHref, logo }), logo)), { primary: color, secondary, accent, background, ink }) };
    await saveCreatedPage(req.params.schoolId, page.html, color);
    return res.json({ success: true, pages: [page] });
  } catch (err) {
    console.error(`${tag}`, err);
    const message = err.message || "Could not create the site.";
    const status = /No active|Choose a template|did not return|did not write|empty reply/.test(message) ? 400 : 500;
    return res.status(status).json({ success: false, message });
  }
};

function schemeCss(colors) {
  return `:root{--sclad-primary:${colors.primary};--sclad-secondary:${colors.secondary};--sclad-accent:${colors.accent};--sclad-background:${colors.background};--sclad-ink:${colors.ink}}body{background-color:var(--sclad-background)!important;color:var(--sclad-ink)!important}header,footer{background-color:var(--sclad-primary)!important;color:#fff!important}header :is(h1,h2,h3,h4,a,span,p),footer :is(h1,h2,h3,h4,a,span,p){color:#fff!important}h1,h2,h3,h4{color:var(--sclad-ink)!important}a[href*="/apply"],a[href*="/login"]{background-color:var(--sclad-accent)!important;color:#fff!important}`;
}

function bindScheme(html, colors) {
  let page = String(html || "").replace(/<style\b[^>]*id=["']sclad-scheme["'][^>]*>[\s\S]*?<\/style>/gi, "");
  const pairs = [
    [colors.primary, "var(--sclad-primary)"],
    [colors.secondary, "var(--sclad-secondary)"],
    [colors.accent, "var(--sclad-accent)"],
    [colors.background, "var(--sclad-background)"],
    [colors.ink, "var(--sclad-ink)"],
  ];
  pairs.forEach(([hex, variable]) => {
    const body = String(hex || "").replace("#", "");
    if (!/^[0-9a-f]{3,8}$/i.test(body)) return;
    page = page.replace(new RegExp(`#${body}(?![0-9a-f])`, "gi"), variable);
  });
  const block = `<style id="sclad-scheme">${schemeCss(colors)}</style>`;
  return /<\/head>/i.test(page)
    ? page.replace(/<\/head>/i, `${block}</head>`)
    : `${block}${page}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileForSlug(slug) {
  if (!slug || slug === "/") return "index.html";
  return `${String(slug).replace(/^\//, "").replace(/\//g, "-")}.html`;
}

function pageLinkHtml(pages) {
  return pages.map((page) => (
    `<a class="sclad-page-link" href="${fileForSlug(page.slug)}">${escapeHtml(page.title || "Page")}</a>`
  )).join("");
}

function stripPageLinks(html) {
  return String(html || "").replace(/<a\b[^>]*\bsclad-page-link\b[^>]*>[\s\S]*?<\/a>/gi, "");
}

function insertLinksInBlock(block, links) {
  const menuAt = block.search(/sclad-nav-menu/i);
  const head = menuAt === -1 ? block : block.slice(0, menuAt);
  const applyAt = head.search(/<a\b[^>]*>\s*Apply\s*<\/a>/i);
  if (applyAt === -1) return block;
  return block.slice(0, applyAt) + links + block.slice(applyAt);
}

function withPageLinks(html, pages) {
  let next = stripPageLinks(html);
  const links = pageLinkHtml(pages);
  if (!links) return next;
  if (/sclad-nav-menu/i.test(next)) {
    next = next.replace(/(<div\b[^>]*class=["'][^"']*sclad-nav-menu[^"']*["'][^>]*>)/i, `$1${links}`);
  }
  const headerMatch = next.match(/<header\b[^>]*>[\s\S]*?<\/header>/i);
  const navMatch = headerMatch ? null : next.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/i);
  const block = headerMatch || navMatch;
  if (block) next = next.replace(block[0], insertLinksInBlock(block[0], links));
  next = next.replace(/max-height:\s*220px/gi, "max-height: 520px");
  if (!/id=["']sclad-page-nav["']/.test(next)) {
    const style = `<style id="sclad-page-nav">a.sclad-page-link{display:inline-flex;align-items:center;margin-right:14px;text-decoration:none;white-space:nowrap}</style>`;
    next = /<\/head>/i.test(next) ? next.replace(/<\/head>/i, `${style}</head>`) : `${style}${next}`;
  }
  return next;
}

function grabBlock(html, tag) {
  const match = String(html || "").match(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "i"));
  return match ? match[0] : "";
}

function useHomeChrome(html, homeHtml) {
  let next = String(html || "");
  const header = grabBlock(homeHtml, "header");
  const footer = grabBlock(homeHtml, "footer");
  if (header) {
    if (/<header\b/i.test(next)) next = next.replace(/<header\b[^>]*>[\s\S]*?<\/header>/i, header);
    else next = next.replace(/<body[^>]*>/i, (open) => `${open}${header}`);
  }
  if (footer) {
    if (/<footer\b/i.test(next)) next = next.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/i, footer);
    else next = next.replace(/<\/body>/i, `${footer}</body>`);
  }
  return next;
}

function slugifyTitle(title, taken) {
  let base = String(title || "page").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
  if (base === "home" || base === "index") base = "page";
  let slug = `/${base}`;
  let n = 2;
  while (taken.has(slug)) {
    slug = `/${base}-${n}`;
    n += 1;
  }
  return slug;
}

function normalizeHex(value) {
  const match = String(value || "").trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return "";
  let hex = match[1].toLowerCase();
  if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
  return `#${hex}`;
}

function hexLuma(hex) {
  const n = hex.slice(1);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function chromaticCounts(text) {
  const counts = new Map();
  const re = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  let match;
  while ((match = re.exec(String(text || "")))) {
    const hex = normalizeHex(match[0]);
    if (!hex) continue;
    const luma = hexLuma(hex);
    if (luma > 228 || luma < 28) continue;
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function schoolPrimary(homeHtml, fallback) {
  return chromaticCounts(homeHtml)[0]?.[0] || normalizeHex(fallback) || "#1e3a5f";
}

function paintWithSchoolColor(html, primary) {
  const target = normalizeHex(primary);
  if (!target) return html;
  const foreign = chromaticCounts(html).filter(([hex]) => hex !== target).slice(0, 3);
  let next = String(html || "");
  foreign.forEach(([hex]) => {
    next = next.replace(new RegExp(hex, "gi"), target);
  });
  return next;
}

function layoutWithoutColors(design) {
  const drop = /color|palette|hex|background|fill|theme|gradient/i;
  const walk = (node) => {
    if (!node || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (drop.test(key)) continue;
      if (typeof value === "string" && /#[0-9a-f]{3,8}\b/i.test(value)) continue;
      out[key] = walk(value);
    }
    return out;
  };
  return walk(design);
}

exports.addPage = async (req, res) => {
  const tag = "[AI-SITE-ADD]";
  try {
    const { schoolId } = req.params;
    const title = String(req.body.title || "").trim().slice(0, 60);
    const image = String(req.body.image || "");
    const color = String(req.body.color || "#111111");
    const fontName = String(req.body.fontName || "Classic");
    const fontStack = String(req.body.fontStack || "Georgia, serif");
    if (!title) return res.status(400).json({ success: false, message: "Name the page first." });
    if (!image.startsWith("data:image/")) {
      return res.status(400).json({ success: false, message: "Choose a template image first." });
    }

    const school = await School.findOne({ school_id: schoolId }).lean();
    const schoolName = school?.school_name || "School";
    const motto = school?.motto || "";
    const logo = logoSrc(school?.logo_url);
    const origin = String(req.body.origin || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
    const loginHref = `${origin}/school/${schoolId}/login`;
    const applyHref = `${origin}/school/${schoolId}/apply`;

    const existingDoc = await WebsiteRequest.findOne({ school_id: schoolId }).lean();
    const fromClient = Array.isArray(req.body.pages) ? req.body.pages : [];
    const source = fromClient.length ? fromClient : (existingDoc?.draft_pages || []);
    const current = source
      .filter((page) => page && String(page.html || "").trim())
      .map((page, index) => ({
        id: String(page.id || (index === 0 ? "home" : `page_${index}`)),
        title: String(page.title || (index === 0 ? "Home" : "Page")).slice(0, 60),
        slug: String(page.slug || (index === 0 ? "/" : `/page-${index}`)),
        order: index,
        html: String(page.html),
      }));
    if (!current.length) {
      return res.status(400).json({ success: false, message: "Create the home page first." });
    }

    const imageConfig = await activeConfig(USE_TEMPLATE_IMAGE);
    const codeConfig = imageConfig;
    const imageMessages = [
      {
        role: "system",
        content: `You study one website screenshot and describe it. Return one JSON object and nothing else.
Do not write HTML, CSS, or JavaScript.
Include layout, sections, navbar, hero, cards, buttons, text, colors, spacing, fonts, images, borders, and how it should fold on a small screen.
If you cannot tell something from the image, set it to "unknown". Do not invent sections that are not visible.`,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this website screenshot as JSON." },
          { type: "image_url", image_url: { url: image } },
        ],
      },
    ];
    let designText = await completeText({
      config: imageConfig,
      tag: `${tag} IMAGE`,
      messages: imageMessages,
    });
    let design = parseDesign(designText);
    if (!design) {
      const firstText = designText;
      designText = await completeText({
        config: imageConfig,
        tag: `${tag} IMAGE-RETRY`,
        messages: [
          ...imageMessages,
          { role: "assistant", content: designText.slice(0, 1500) },
          { role: "user", content: "Finish that as one valid JSON object. Do not use markdown." },
        ],
      });
      design = parseDesign(designText) || parseDesign(firstText);
    }
    if (!design) throw new Error("The Image model did not describe the screenshot. Choose an Image model that can see pictures, then try again.");

    const home = current.find((item) => item.slug === "/" || item.id === "home") || current[0];
    const schoolColor = schoolPrimary(home.html, color);
    const codeSystem = `You write one extra page for a school website. The page is named "${title}". Follow the screenshot layout as closely as you can. Rewrite the words so they are about ${title} at this school. Return one full HTML document and no other text.
Start with <!doctype html>.
Rules:
- Do not copy the screenshot's business or product words. Keep its layout.
- Do not copy the screenshot's colors. The school color is ${schoolColor}. Navbar, buttons, links, and headings use ${schoolColor}. The page background is #ffffff. Body text is #111111. A soft area may use a very light tint of ${schoolColor}. No other brand colors.
- School name: ${schoolName}.${motto ? ` Motto: ${motto}.` : ""}
- This is not the home page. The main heading should be about ${title}.
- Do not design a new navbar or footer. Write a plain <header></header> at the top and a plain <footer></footer> at the bottom. They are replaced with the home page header and footer.
- On a phone the navbar is a dropdown. Use this exact control, with Apply and Login inside the menu:
<input id="sclad-nav-toggle" class="sclad-nav-toggle" type="checkbox">
<label class="sclad-nav-burger" for="sclad-nav-toggle" aria-label="Menu">☰</label>
<div class="sclad-nav-menu"><a href="${applyHref}">Apply</a><a href="${loginHref}">Login</a></div>
- The burger is hidden on desktop and tablet. On a phone it opens and closes the menu with a fade.
- Logo: ${logo ? `<img src="${logo}" alt="${schoolName} logo">` : `<img src="https://placehold.co/120x40?text=${encodeURIComponent(schoolName)}" alt="${schoolName} logo">`}
- Every button on the page is either Apply or Login. Apply href="${applyHref}". Login href="${loginHref}".
- The only accent color is ${schoolColor}. Ignore colors from the screenshot.
- Font: ${fontName}, font-family: ${fontStack}.
- Desktop look uses style="" attributes. Also add one <style> block.
- Mobile is required. Fit a phone with no sideways scroll. Use @media (max-width: 1024px) and @media (max-width: 720px). On a phone, stack columns into one column.
- Slide-in is required. The header, each section, and the footer slide up into view, one after another, when the page loads.
- It must include @media (max-width: 1024px) for tablet and @media (max-width: 720px) for phone.
- Include <meta name="viewport" content="width=device-width, initial-scale=1">.
- Content pictures use <img src="https://placehold.co/800x600?text=Library" alt="School library">. Change the size, text, and alt to match the picture. The school logo is the only image that is not a placeholder.
- Do not explain. Do not apologize. Do not repeat these instructions.`;
    const designMessage = `Follow this layout for the middle of the page only. Ignore every color in it. This page is "${title}" for ${schoolName}. Paint buttons, links, and headings with ${schoolColor} only. Background #ffffff. Text #111111. Do not invent a navbar or footer.\n${JSON.stringify(layoutWithoutColors(design))}\n\nStart with <!doctype html>. Include an empty <header> and an empty <footer>.`;
    let codeText = await completeText({
      config: codeConfig,
      preferHtml: true,
      tag: `${tag} CODE`,
      messages: [
        { role: "system", content: codeSystem },
        { role: "user", content: designMessage },
      ],
    });
    let page = pickPage(codeText);
    if (!page) {
      codeText = await completeText({
        config: codeConfig,
        preferHtml: true,
        tag: `${tag} CODE-RETRY`,
        messages: [
          { role: "system", content: codeSystem },
          { role: "user", content: `${designMessage}\nReturn only the HTML document.` },
        ],
      });
      page = pickPage(codeText);
    }
    if (!page) throw new Error("The code model did not write the page. Try again.");

    const taken = new Set(current.map((item) => item.slug));
    const slug = slugifyTitle(title, taken);
    const created = {
      id: `page_${Date.now()}`,
      title,
      slug,
      order: current.length,
      html: useHomeChrome(paintWithSchoolColor(ensureMobile(placeholderImages(page.html, logo)), schoolColor), home.html),
    };
    const all = [...current, created];
    const linked = all.map((item) => ({ ...item, html: withPageLinks(item.html, all) }));
    const savedHome = linked.find((item) => item.slug === "/" || item.id === "home") || linked[0];
    await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      { $set: { school_id: schoolId, draft_html: savedHome.html, draft_pages: linked } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: false },
    );
    return res.json({ success: true, pages: linked });
  } catch (err) {
    console.error(`${tag}`, err);
    const message = err.message || "Could not add the page.";
    const status = /No active|Choose a template|Name the page|Create the home|did not return|did not write|did not describe|empty reply/.test(message) ? 400 : 500;
    return res.status(status).json({ success: false, message });
  }
};

function elementByMarker(html, marker) {
  const attr = `data-sclad-target="${marker}"`;
  const at = html.indexOf(attr);
  if (at === -1) return null;
  const start = html.lastIndexOf("<", at);
  if (start === -1) return null;
  const tagMatch = html.slice(start).match(/^<([a-zA-Z0-9]+)/);
  if (!tagMatch) return null;
  const tag = tagMatch[1];
  const voidTags = new Set(["img", "br", "hr", "input", "meta", "link", "source", "area", "base", "col", "embed", "wbr"]);
  if (voidTags.has(tag.toLowerCase())) {
    const end = html.indexOf(">", start);
    return end === -1 ? null : html.slice(start, end + 1);
  }
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])`, "gi");
  re.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = re.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) {
      const end = html.indexOf(">", match.index);
      return end === -1 ? null : html.slice(start, end + 1);
    }
  }
  return null;
}

function stripEditMarkers(html) {
  return String(html || "").replace(/\sdata-sclad-target\s*=\s*(["'])[\s\S]*?\1/gi, "");
}

function fragmentHtml(text) {
  let piece = String(text || "").trim();
  piece = piece.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (/^<!doctype\s+html|^<html[\s>]/i.test(piece)) return "";
  const start = piece.search(/<[a-z]/i);
  if (start === -1) return "";
  piece = piece.slice(start);
  const end = piece.lastIndexOf(">");
  if (end === -1) return "";
  return piece.slice(0, end + 1).trim();
}

function parkImages(html) {
  const images = [];
  const parked = String(html).replace(/data:[^"'()\s]{80,}/gi, (value) => {
    const token = `{{IMG_${images.length}}}`;
    images.push(value);
    return token;
  });
  return { html: parked, images };
}

function restoreImages(html, images) {
  return images.reduce(
    (page, value, index) => page.split(`{{IMG_${index}}}`).join(value),
    String(html || ""),
  );
}

async function restyleFragment({ config, prompt, original, tag }) {
  const { html: slim, images } = parkImages(original);
  const system = `You edit one section of a school page. The look is inline style="" attributes on the elements. Return only that same section and nothing else.
Keep the same outer tag. Change only what the instruction asks.
Keep every {{IMG_0}} token exactly. Do not invent image data and do not remove those tokens.
Do not return the rest of the page or an explanation.`;
  const userText = `Instruction: ${prompt}\n\nSection:\n${slim}`;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: userText },
  ];
  const inputGuess = Math.ceil((system.length + userText.length) / 3);
  if (inputGuess > 6200) {
    throw new Error("That section is too large for the Groq limit. Click a smaller part.");
  }
  const maxTokens = Math.min(Math.ceil(slim.length / 3) + 200, 7000 - inputGuess);
  console.log(`${tag} PART section ${original.length} chars, parked ${images.length} images, sending ${slim.length} chars`);
  let text = await completeText({
    config,
    maxTokens,
    provider: "groq",
    tag: `${tag} PART`,
    messages,
  });
  let piece = fragmentHtml(text);
  if (!piece) {
    text = await completeText({
      config,
      maxTokens,
      provider: "groq",
      tag: `${tag} PART-RETRY`,
      messages: [
        ...messages,
        { role: "user", content: "Return only that one section. Do not return the rest of the page." },
      ],
    });
    piece = fragmentHtml(text);
  }
  if (!piece) throw new Error("The edit did not stay on that section. Select it and try again.");
  return restoreImages(piece, images);
}

exports.editPage = async (req, res) => {
  const tag = "[AI-SITE-EDIT]";
  try {
    const { schoolId } = req.params;
    const html = String(req.body.html || "");
    const prompt = String(req.body.prompt || "").trim();
    const pageId = String(req.body.pageId || "home");
    const selections = Array.isArray(req.body.selections) ? req.body.selections : [];
    if (!prompt) return res.status(400).json({ success: false, message: "Tell the AI what to change." });
    if (!html.trim()) return res.status(400).json({ success: false, message: "There is no page to edit." });

    const codeConfig = await activeConfig(USE_TEMPLATE_CODE);
    const targets = selections.filter((item) => String(item.html || "").trim());
    if (!targets.length) {
      return res.status(400).json({ success: false, message: "Click the section you want to change, then send again." });
    }
    let nextHtml = html;

    const ordered = [...targets].sort((a, b) => String(a.html || "").length - String(b.html || "").length);
    for (const item of ordered) {
      const marker = (String(item.html).match(/data-sclad-target=(["'])(.*?)\1/) || [])[2];
      const original = (marker && elementByMarker(nextHtml, marker)) || String(item.html);
      if (!nextHtml.includes(original)) {
        throw new Error("Select that part again. It is no longer on the page.");
      }
      const updated = stripEditMarkers(await restyleFragment({
        config: codeConfig,
        prompt,
        original,
        tag,
      }));
      nextHtml = nextHtml.replace(original, updated);
    }
    nextHtml = stripEditMarkers(ensureMobile(nextHtml));

    const existing = await WebsiteRequest.findOne({ school_id: schoolId }).lean();
    const draftPages = Array.isArray(existing?.draft_pages) ? existing.draft_pages : [];
    const nextPages = draftPages.length
      ? draftPages.map((item) => (
          item.id === pageId || item.slug === "/" && pageId === "home"
            ? { ...item, html: nextHtml }
            : item
        ))
      : [{ id: "home", title: "Home", slug: "/", order: 0, html: nextHtml }];
    const matched = nextPages.some((item) => item.html === nextHtml);
    if (!matched) nextPages[0] = { ...nextPages[0], html: nextHtml };
    await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      { $set: { school_id: schoolId, draft_html: nextPages.find((item) => item.slug === "/" || item.id === "home")?.html || nextHtml, draft_pages: nextPages } },
      { upsert: true, setDefaultsOnInsert: true, runValidators: false },
    );
    return res.json({ success: true, html: nextHtml });
  } catch (err) {
    console.error(`${tag}`, err);
    const message = err.message || "Could not edit the page.";
    const status = /No active|Tell the AI|no page|did not return|empty reply|Select that|Click the section|too large|rewritten the page|did not stay/.test(message) ? 400 : 500;
    return res.status(status).json({ success: false, message });
  }
};
