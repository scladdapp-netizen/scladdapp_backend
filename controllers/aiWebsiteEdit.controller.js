/**
 * AI Website Edit Controller — Section-scoped diff patching
 *
 * Strategy:
 *  1. Client sends sectionId (preferred) or sectionHtml + fullHtml + prompt.
 *  2. Backend extracts the target section's innerHTML and sends ONLY that to the AI.
 *  3. AI returns a JSON diff with ops: replace, insert_before, insert_after, delete,
 *     or replace_section (full section fallback).
 *  4. Backend applies ops to the innerHTML, rewraps the section, splices it back.
 *  5. Returns the full updated HTML (AI website editing is free — no token deduction).
 */

const AIConfig = require("../models/AIConfig.model");
const { USE_WEBSITE, usesForFeature } = require("../utils/aiConfigUse");
const SchoolAIToken  = require("../models/SchoolAIToken.model");
const WebsiteRequest = require("../models/WebsiteRequest.model");
const School         = require("../models/School.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const cloudinary     = require("cloudinary").v2;
const axios          = require("axios");
const { checkAIWebsiteEditorAccess } = require("../utils/planLimitCheck");

const OPENROUTER_URL         = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS  = 90_000;
const OPENROUTER_MAX_RETRIES = 2;

/** Build page list from brief.pages, with Home fallback */
function buildPageMeta(doc) {
  const briefPages = doc?.brief?.pages;
  if (Array.isArray(briefPages) && briefPages.length) {
    return briefPages.map((p, i) => ({
      id: p.id || `page_${i}`,
      title: p.title || `Page ${i + 1}`,
      slug: p.slug || (i === 0 ? "/" : `/${p.id || `page-${i + 1}`}`),
      order: p.order ?? i,
    }));
  }
  return [{ id: "home", title: "Home", slug: "/", order: 0 }];
}

function normalizePathSlug(pathOrSlug) {
  if (!pathOrSlug || pathOrSlug === "" || pathOrSlug === "index" || pathOrSlug === "index.html") return "/";
  let s = String(pathOrSlug).trim();
  if (!s.startsWith("/")) s = `/${s}`;
  s = s.replace(/\/+$/, "") || "/";
  s = s.replace(/\.html$/i, "");
  return s === "" ? "/" : s;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getWebsiteConfig() {
  const config = await AIConfig.findOne({ use: usesForFeature(USE_WEBSITE), is_active: true });
  if (!config) throw new Error("No active AI config for website editor. Contact support.");
  return config;
}

async function getOrCreateTokenDoc(schoolId) {
  let doc = await SchoolAIToken.findOne({ school_id: schoolId });
  if (!doc) doc = await SchoolAIToken.create({ school_id: schoolId, balance: 0 });
  return doc;
}

function isRetryableNetworkError(err) {
  const code = err?.code || err?.cause?.code;
  const msg  = String(err?.message || "").toLowerCase();
  return (
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    msg.includes("timeout") ||
    msg.includes("network error")
  );
}

function formatOpenRouterNetworkError(err) {
  const code = err?.code || err?.cause?.code;
  if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT" || code === "ECONNABORTED") {
    return "Could not reach OpenRouter AI (connection timed out). Check your internet, firewall, or try a VPN, then retry.";
  }
  if (code === "ENOTFOUND") {
    return "Could not resolve openrouter.ai. Check your DNS or internet connection.";
  }
  if (code === "ECONNREFUSED") {
    return "Connection to OpenRouter AI was refused. The service may be down or blocked on your network.";
  }
  return err?.message || "Failed to connect to OpenRouter AI.";
}

async function callOpenRouter({ apiKey, model, maxTokens, messages, tag = "[AI-WEBSITE-EDIT]" }) {
  let lastErr;
  for (let attempt = 0; attempt <= OPENROUTER_MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(
        OPENROUTER_URL,
        {
          model,
          max_tokens: maxTokens,
          temperature: 0.2,
          messages,
        },
        {
          headers: {
            "Content-Type":  "application/json",
            Authorization:   `Bearer ${apiKey}`,
            "HTTP-Referer":    process.env.APP_URL || "http://localhost:1234",
            "X-Title":         "ScladApp Website Editor",
          },
          timeout: OPENROUTER_TIMEOUT_MS,
          validateStatus: () => true,
        }
      );
      return { status: res.status, data: res.data, ok: res.status >= 200 && res.status < 300 };
    } catch (err) {
      lastErr = err;
      if (attempt < OPENROUTER_MAX_RETRIES && isRetryableNetworkError(err)) {
        const delay = 2000 * (attempt + 1);
        console.warn(`${tag} OpenRouter attempt ${attempt + 1} failed (${err.code || err.message}), retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** Depth-aware extract of <tag> starting at startIndex */
function extractElementAt(fullHtml, startIndex, tagName = "section") {
  const slice = fullHtml.slice(startIndex);
  const openRe = new RegExp(`^<${tagName}(?:\\s[^>]*)?>`, "i");
  const openMatch = slice.match(openRe);
  if (!openMatch) return null;

  const start = startIndex;
  const openEnd = start + openMatch[0].length;
  const openPat = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "gi");
  const closePat = new RegExp(`</${tagName}\\s*>`, "gi");

  let depth = 1;
  let pos = openEnd;

  while (pos < fullHtml.length && depth > 0) {
    openPat.lastIndex = pos;
    closePat.lastIndex = pos;
    const nextOpen = openPat.exec(fullHtml);
    const nextClose = closePat.exec(fullHtml);
    if (!nextClose) return null;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      pos = nextOpen.index + nextOpen[0].length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      const end = nextClose.index + nextClose[0].length;
      return { outerHtml: fullHtml.slice(start, end), start, end };
    }
    pos = nextClose.index + nextClose[0].length;
  }
  return null;
}

/** Extract outerHTML + position of <section id="sectionId"> from fullHtml */
function extractSectionById(fullHtml, sectionId) {
  const openRe = new RegExp(`<section[^>]+id=["']${sectionId}["'][^>]*>`, "i");
  const match  = openRe.exec(fullHtml);
  if (!match) return null;
  return extractElementAt(fullHtml, match.index, "section");
}

/** Get innerHTML from any element's outerHTML (depth-aware — safe with nested tags/styles) */
function getInnerHtml(outerHtml) {
  const openMatch = outerHtml.match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/);
  if (!openMatch) return outerHtml;

  const tagName = openMatch[1].toLowerCase();
  const openEnd = openMatch[0].length;
  const openPat = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "gi");
  const closePat = new RegExp(`</${tagName}\\s*>`, "gi");

  let depth = 1;
  let pos = openEnd;

  while (pos < outerHtml.length && depth > 0) {
    openPat.lastIndex = pos;
    closePat.lastIndex = pos;
    const nextOpen = openPat.exec(outerHtml);
    const nextClose = closePat.exec(outerHtml);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      pos = nextOpen.index + nextOpen[0].length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return outerHtml.slice(openEnd, nextClose.index);
    }
    pos = nextClose.index + nextClose[0].length;
  }

  const firstClose = outerHtml.indexOf(">") + 1;
  const lastOpen = outerHtml.lastIndexOf("</");
  return outerHtml.slice(firstClose, lastOpen);
}

/** Rewrap innerHTML back into the original opening/closing tags */
function rewrapSection(outerHtml, newInner) {
  const openMatch = outerHtml.match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/);
  if (!openMatch) return newInner;

  const tagName = openMatch[1].toLowerCase();
  const openEnd = openMatch[0].length;
  const openPat = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "gi");
  const closePat = new RegExp(`</${tagName}\\s*>`, "gi");

  let depth = 1;
  let pos = openEnd;

  while (pos < outerHtml.length && depth > 0) {
    openPat.lastIndex = pos;
    closePat.lastIndex = pos;
    const nextOpen = openPat.exec(outerHtml);
    const nextClose = closePat.exec(outerHtml);
    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      pos = nextOpen.index + nextOpen[0].length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return outerHtml.slice(0, openEnd) + newInner + outerHtml.slice(nextClose.index);
    }
    pos = nextClose.index + nextClose[0].length;
  }

  const firstClose = outerHtml.indexOf(">") + 1;
  const lastOpen = outerHtml.lastIndexOf("</");
  return outerHtml.slice(0, firstClose) + newInner + outerHtml.slice(lastOpen);
}

/** If the model returns a full <section> wrapper, unwrap to inner content */
function stripAiSectionWrapper(innerHtml, sectionId) {
  let html = innerHtml.trim();
  html = html.replace(/^```(?:html)?\n?/i, "").replace(/\n?```$/i, "").trim();

  const wrapRe = sectionId
    ? new RegExp(`^<section[^>]*id=["']${sectionId}["'][^>]*>([\\s\\S]*)</section>\\s*$`, "i")
    : /^<section\b[^>]*>([\s\S]*)<\/section>\s*$/i;
  const wrapMatch = html.match(wrapRe);
  if (wrapMatch) return wrapMatch[1].trim();

  return html;
}

function normalizeHtml(html) {
  return html
    .replace(/\s*__aie_hover__/g, "")
    .replace(/\s*__aie_selected__/g, "")
    .replace(/\s*class=""/g, "")
    .replace(/\s*class=''/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Find sectionHtml inside fullHtml using its opening tag as an anchor.
 * More robust than a full-string indexOf because it tolerates minor
 * whitespace/attribute order differences inside the element.
 * Returns { outerHtml, start, end } or null.
 */
function locateSectionInFull(fullHtml, sectionHtml) {
  const cleanSection = normalizeHtml(sectionHtml);

  let idx = fullHtml.indexOf(cleanSection);
  if (idx !== -1) {
    return { outerHtml: cleanSection, start: idx, end: idx + cleanSection.length };
  }

  const openMatch = cleanSection.match(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/);
  if (!openMatch) return null;

  const tagName = openMatch[1].toLowerCase();
  const idMatch = cleanSection.match(/\bid=["']([^"']+)["']/i);
  if (idMatch) {
    const byId = extractSectionById(fullHtml, idMatch[1]);
    if (byId) return byId;
  }

  const cleanOpenTag = openMatch[0];
  idx = fullHtml.indexOf(cleanOpenTag);
  if (idx === -1) {
    const looseOpen = cleanOpenTag.replace(/\s+/g, "\\s+");
    const looseRe = new RegExp(looseOpen.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const looseMatch = looseRe.exec(fullHtml);
    if (looseMatch) idx = looseMatch.index;
  }
  if (idx === -1) return null;

  let depth = 0;
  let i = idx;
  const openPattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "gi");
  const closePattern = new RegExp(`</${tagName}\\s*>`, "gi");

  while (i < fullHtml.length) {
    openPattern.lastIndex = i;
    closePattern.lastIndex = i;
    const nextOpen = openPattern.exec(fullHtml);
    const nextClose = closePattern.exec(fullHtml);
    if (!nextClose) return null;

    if (nextOpen && nextOpen.index < nextClose.index) {
      if (depth === 0 && nextOpen.index === idx) depth = 1;
      else depth += 1;
      i = nextOpen.index + nextOpen[0].length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      const end = nextClose.index + nextClose[0].length;
      return { outerHtml: fullHtml.slice(idx, end), start: idx, end };
    }
    i = nextClose.index + nextClose[0].length;
  }
  return null;
}
function pickSectionFallback(fullHtml, prompt) {
  const lower  = prompt.toLowerCase();
  const tagRe  = /<(nav|header|section|footer|main|article)[\s>]/gi;
  const hits   = [];
  let m;
  while ((m = tagRe.exec(fullHtml)) !== null) hits.push({ tag: m[1].toLowerCase(), start: m.index });
  hits.sort((a, b) => a.start - b.start);
  if (!hits.length) return null;

  // Match section id when user mentions it (e.g. "academics" → id="academics")
  const sectionIds = [...fullHtml.matchAll(/<section[^>]+id=["']([^"']+)["'][^>]*>/gi)].map((x) => x[1]);
  for (const sid of sectionIds) {
    const sidLower = sid.toLowerCase();
    const sidWords = sidLower.replace(/[-_]/g, " ");
    if (lower.includes(sidLower) || lower.includes(sidWords)) {
      const byId = extractSectionById(fullHtml, sid);
      if (byId) return byId;
    }
  }

  const rules = [
    { words: ["nav","navigation","menu","logo"],  tag: "nav"    },
    { words: ["footer","copyright","bottom"],      tag: "footer" },
    { words: ["hero","banner","h1","headline"],    tag: "header" },
    { words: ["academic","program","course","curriculum","nursery","primary","secondary","laboratory"], tag: "section", idHints: ["academic", "program", "course"] },
  ];
  for (const rule of rules) {
    if (!rule.words.some((w) => lower.includes(w))) continue;
    const tagHits = hits.filter((s) => s.tag === rule.tag);
    if (!tagHits.length) continue;

    if (rule.tag === "section" && rule.idHints) {
      for (const hint of rule.idHints) {
        const matchHit = tagHits.find((h) => {
          const head = fullHtml.slice(h.start, h.start + 250).toLowerCase();
          return head.includes(`id="${hint}`) || head.includes(`id='${hint}`);
        });
        if (matchHit) {
          const idMatch = fullHtml.slice(matchHit.start).match(/^<section[^>]+id=["']([^"']+)["']/i);
          if (idMatch) {
            const byId = extractSectionById(fullHtml, idMatch[1]);
            if (byId) return byId;
          }
        }
      }
      const firstSection = extractElementAt(fullHtml, tagHits[0].start, "section");
      if (firstSection) return firstSection;
    }

    const found = tagHits[0];
    if (rule.tag === "section") {
      const extracted = extractElementAt(fullHtml, found.start, "section");
      if (extracted) return extracted;
    }
    const next = hits.find((s) => s.start > found.start);
    const end  = next ? next.start : fullHtml.length;
    return { outerHtml: fullHtml.slice(found.start, end).trim(), start: found.start, end };
  }

  // Return largest top-level block
  return hits.map((s, i) => {
    if (s.tag === "section") {
      const extracted = extractElementAt(fullHtml, s.start, "section");
      if (extracted) return extracted;
    }
    const next = hits[i + 1];
    const end  = next ? next.start : fullHtml.length;
    return { outerHtml: fullHtml.slice(s.start, end).trim(), start: s.start, end };
  }).reduce((a, b) => b.outerHtml.length > a.outerHtml.length ? b : a);
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SECTION_EDIT_SYSTEM_PROMPT = `You are an expert HTML/CSS/JS editor for school websites.
You receive the INNER HTML of one self-contained page section and an instruction.
Each section may contain its own <style> block and <script> block scoped to that section.

Apply the instruction and return ONLY the modified inner HTML.

Rules:
- Return ONLY the modified inner HTML — no explanation, no markdown, no code fences.
- Do NOT wrap output in <section> tags — return only the content that belongs inside the section.
- Do NOT add <!DOCTYPE>, <html>, <head>, or <body> tags.
- Preserve existing <style> blocks unless the instruction asks to change styling; keep selectors and structure intact when possible.
- Preserve emojis, headings, cards, grids, and class names unless the instruction asks to change them.
- Keep all existing content that the instruction does not ask to change.
- You may add or modify <style> blocks for scoped CSS.
- You may add or modify <script> blocks for scoped JS.
- Make ONLY the change described. Do not remove unrelated cards, text, or sections.`;

// ─── Controllers ──────────────────────────────────────────────────────────────

exports.getTokenBalance = async (req, res) => {
  try {
    const doc = await getOrCreateTokenDoc(req.params.schoolId);
    return res.json({ success: true, data: { balance: doc.balance, total_used: doc.total_used } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAvailableModels = async (req, res) => {
  try {
    const configs = await AIConfig.find({ use: usesForFeature(USE_WEBSITE) })
      .select("config_id label model is_active")
      .sort({ is_active: -1, created_at: -1 }).lean();
    return res.json({ success: true, data: configs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.editWebsite = async (req, res) => {
  const tag = "[AI-WEBSITE-EDIT]";
  try {
    const { schoolId } = req.params;
    const { prompt, fullHtml, sectionId, sectionHtml, element, configId } = req.body;

    if (!prompt?.trim())   return res.status(400).json({ success: false, message: "prompt is required" });
    if (!fullHtml?.trim()) return res.status(400).json({ success: false, message: "fullHtml is required" });

    const planAccess = await checkAIWebsiteEditorAccess(schoolId);
    if (!planAccess.allowed) {
      return res.status(403).json({
        success: false,
        code: planAccess.code || "upgrade_required",
        message: planAccess.message,
        plan_name: planAccess.plan_name,
      });
    }

    // AI website editing is free — no token balance required

    // 1. Config
    const config = configId
      ? await AIConfig.findOne({ config_id: configId, use: usesForFeature(USE_WEBSITE) })
      : await getWebsiteConfig();
    if (!config) return res.status(404).json({ success: false, message: "AI config not found" });

    // 2. Locate target section
    let sectionInfo = null;
    if (sectionId)  sectionInfo = extractSectionById(fullHtml, sectionId);
    if (!sectionInfo && sectionHtml?.trim().length > 20) {
      sectionInfo = locateSectionInFull(fullHtml, sectionHtml);
    }
    if (!sectionInfo) sectionInfo = pickSectionFallback(fullHtml, prompt);

    const isFullPage   = !sectionInfo;
    const workingOuter = sectionInfo?.outerHtml || fullHtml;
    // What we send to AI: inner HTML of section (or full HTML for tiny pages)
    const workingInner = sectionInfo ? getInnerHtml(workingOuter) : fullHtml;

    console.log(`${tag} sectionId="${sectionId || "none"}" found=${!!sectionInfo} sending ${workingInner.length} chars`);

    // 3. Build messages
    const elCtx = element
      ? `\nTargeted element: ${element.selector || element.tagName}` +
        (element.textContent ? `\nElement text: "${element.textContent.slice(0, 100)}"` : "")
      : "";
    const userMessage =
      `Instruction: ${prompt.trim()}${elCtx}\n\n` +
      `Return the updated inner HTML for this section only. ` +
      `Keep any existing <style> block unless the instruction changes styling.\n\n` +
      `Current section inner HTML:\n${workingInner}`;

    const sendMaxTokens = Math.min(
      config.max_tokens || 8192,
      Math.max(2048, Math.ceil(workingInner.length / 2) + 512)
    );
    console.log(`${tag} → OpenRouter model: ${config.model} | max_tokens: ${sendMaxTokens}`);

    let orRes;
    let orData;
    try {
      const result = await callOpenRouter({
        apiKey:     config.api_key,
        model:      config.model,
        maxTokens:  sendMaxTokens,
        messages: [
          { role: "system", content: SECTION_EDIT_SYSTEM_PROMPT },
          { role: "user",   content: userMessage },
        ],
        tag,
      });
      orRes  = result;
      orData = result.data;
    } catch (err) {
      const msg = formatOpenRouterNetworkError(err);
      console.error(`${tag} OpenRouter network error:`, err.message || err);
      return res.status(503).json({ success: false, message: msg });
    }

    if (!orRes.ok || orData.error) {
      const errMsg = orData.error?.message || `OpenRouter error ${orRes.status}`;
      const partial = orData.choices?.[0]?.message?.content?.trim();
      console.error(`${tag} OpenRouter error: ${errMsg}`);
      return res.status(502).json({
        success: false,
        message: errMsg,
        aiResponse: partial ? partial.slice(0, 1200) : null,
      });
    }

    let newInner = orData.choices?.[0]?.message?.content?.trim();
    if (!newInner) {
      return res.status(502).json({
        success: false,
        message: "AI returned empty response.",
        aiResponse: null,
      });
    }

    newInner = stripAiSectionWrapper(newInner, sectionId);

    console.log(`${tag} ← AI returned ${newInner.length} chars`);

    const minExpected = Math.min(200, Math.floor(workingInner.length * 0.12));
    if (newInner.length < minExpected && workingInner.length > 400) {
      console.warn(`${tag} AI response suspiciously short (${newInner.length} vs ${workingInner.length}) — rejecting`);
      return res.status(502).json({
        success: false,
        message: `AI response was too short (${newInner.length} chars). The model may have truncated output — try a smaller selection or a simpler edit.`,
        aiResponse: newInner.slice(0, 1200),
      });
    }

    // 6. Splice modified inner back into fullHtml
    let newHtml;
    if (isFullPage) {
      newHtml = newInner;
    } else {
      const newOuter = rewrapSection(workingOuter, newInner);
      newHtml = fullHtml.slice(0, sectionInfo.start) + newOuter + fullHtml.slice(sectionInfo.end);
      console.log(`${tag} Spliced section back — total html: ${newHtml.length} chars`);
    }

    return res.json({
      success: true, newHtml, tokensUsed: 0, newBalance: null,
      modelUsage: orData.usage || {},
      message: "Section updated successfully.",
      aiResponse: newInner.slice(0, 1200),
      sectionId: sectionId || null,
    });

  } catch (err) {
    console.error(`[AI-WEBSITE-EDIT] Error:`, err);
    const message = isRetryableNetworkError(err)
      ? formatOpenRouterNetworkError(err)
      : (err.message || "Server error");
    return res.status(500).json({ success: false, message });
  }
};

exports.saveDraft = async (req, res) => {
  const tag = "[AI-WEBSITE-DRAFT]";
  try {
    const { schoolId } = req.params;
    const { html, pageId, pages } = req.body;

    const existing = await WebsiteRequest.findOne({ school_id: schoolId }).lean();
    const pageMeta = buildPageMeta(existing);

    let nextDraftPages = Array.isArray(existing?.draft_pages) ? [...existing.draft_pages] : [];

    // Seed from legacy draft_html / empty stubs
    if (!nextDraftPages.length) {
      nextDraftPages = pageMeta.map((p, i) => ({
        ...p,
        html: i === 0 ? (existing?.draft_html || "") : "",
      }));
    } else {
      // Ensure brief pages exist in draft_pages
      pageMeta.forEach((meta) => {
        if (!nextDraftPages.find((p) => p.id === meta.id)) {
          nextDraftPages.push({ ...meta, html: "" });
        }
      });
    }

    if (Array.isArray(pages) && pages.length) {
      pages.forEach((incoming) => {
        const idx = nextDraftPages.findIndex((p) => p.id === incoming.id || p.slug === incoming.slug);
        if (idx >= 0) {
          nextDraftPages[idx] = {
            ...nextDraftPages[idx],
            html: incoming.html ?? nextDraftPages[idx].html,
            title: incoming.title || nextDraftPages[idx].title,
            slug: incoming.slug || nextDraftPages[idx].slug,
          };
        } else if (incoming.id) {
          nextDraftPages.push({
            id: incoming.id,
            title: incoming.title || "Page",
            slug: incoming.slug || `/${incoming.id}`,
            order: nextDraftPages.length,
            html: incoming.html || "",
          });
        }
      });
    } else if (html !== undefined) {
      const targetId = pageId || nextDraftPages[0]?.id || "home";
      const idx = nextDraftPages.findIndex((p) => p.id === targetId);
      if (idx >= 0) nextDraftPages[idx] = { ...nextDraftPages[idx], html };
      else nextDraftPages.push({ id: targetId, title: "Home", slug: "/", order: 0, html });
    } else {
      return res.status(400).json({ success: false, message: "html or pages is required" });
    }

    const homeHtml = nextDraftPages.find((p) => p.slug === "/" || p.id === "home")?.html
      || nextDraftPages[0]?.html
      || "";

    await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      {
        $set: {
          draft_pages: nextDraftPages,
          draft_html: homeHtml,
          school_id: schoolId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: false }
    );
    await School.updateOne({ school_id: schoolId }, { $set: { website_requested: true, updated_at: new Date() } });
    return res.json({ success: true, message: "Draft saved", data: { pages: nextDraftPages } });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Image upload ─────────────────────────────────────────────────────────────

/**
 * POST /api/schools/:schoolId/ai-website/upload-image
 * Body: multipart/form-data  — field "image" (file) + optional "oldPublicId" (string)
 *
 * 1. If oldPublicId is supplied, delete the old image from Cloudinary first.
 * 2. Upload the new image to scladapp/websites/:schoolId/editor-images
 * 3. Return { url, public_id }
 */
exports.uploadImage = async (req, res) => {
  const tag = "[AI-WEBSITE-IMG-UPLOAD]";
  try {
    const { schoolId } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided." });
    }

    // Validate MIME type — only images allowed
    const allowedMimes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
    if (!allowedMimes.includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: "Only image files are allowed (jpg, png, webp, gif, svg)." });
    }

    // Delete old image from Cloudinary if provided
    const oldPublicId = req.body?.oldPublicId?.trim() || null;
    if (oldPublicId) {
      try {
        await cloudinary.uploader.destroy(oldPublicId, { resource_type: "image" });
        console.log(`${tag} Deleted old image: ${oldPublicId}`);
      } catch (delErr) {
        // Non-fatal — log and continue
        console.warn(`${tag} Could not delete old image ${oldPublicId}: ${delErr.message}`);
      }
    }

    // Upload new image
    const { url, public_id } = await uploadToCloudinary(
      req.file.buffer,
      `scladapp/websites/${schoolId}/editor-images`,
      "image",
      req.file.originalname
    );

    console.log(`${tag} Uploaded: ${public_id}`);
    return res.json({ success: true, url, public_id });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Upload failed." });
  }
};

/**
 * DELETE /api/schools/:schoolId/ai-website/delete-image
 * Body: { public_id: string }
 */
exports.deleteImage = async (req, res) => {
  const tag = "[AI-WEBSITE-IMG-DELETE]";
  try {
    const publicId = req.body?.public_id?.trim() || null;
    if (!publicId) {
      return res.status(400).json({ success: false, message: "public_id is required." });
    }
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
    console.log(`${tag} Deleted: ${publicId}`);
    return res.json({ success: true, message: "Image deleted." });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Delete failed." });
  }
};

// ─── HTML/draft endpoints ─────────────────────────────────────────────────────

exports.getLiveHtml = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const pageId = req.query.pageId || null;
    const doc = await WebsiteRequest.findOne({ school_id: schoolId }).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "No website request found for this school." });
    }

    const published = Array.isArray(doc.published_pages) ? doc.published_pages : [];
    const meta = buildPageMeta(doc);

    const fetchPage = async (url) => {
      const cloudRes = await fetch(url);
      if (!cloudRes.ok) throw new Error("Could not fetch published HTML from storage.");
      return cloudRes.text();
    };

    if (published.length) {
      const pages = [];
      for (const p of published) {
        let html = "";
        if (p.html_cloudinary_url) {
          try { html = await fetchPage(p.html_cloudinary_url); } catch (_) {}
        }
        pages.push({
          id: p.id,
          title: p.title,
          slug: p.slug,
          order: p.order ?? 0,
          html,
        });
      }
      const active = pageId
        ? pages.find((p) => p.id === pageId) || pages[0]
        : pages.find((p) => p.slug === "/" || p.id === "home") || pages[0];
      return res.json({
        success: true,
        data: {
          pages,
          html: active?.html || null,
          pageId: active?.id || null,
          source: "published",
        },
      });
    }

    if (doc.html_cloudinary_url) {
      const html = await fetchPage(doc.html_cloudinary_url);
      const pages = meta.map((p, i) => ({
        ...p,
        html: i === 0 ? html : "",
      }));
      return res.json({
        success: true,
        data: { pages, html, pageId: pages[0]?.id || "home", source: "published" },
      });
    }

    return res.status(404).json({ success: false, message: "No published website found for this school." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDraft = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const pageId = req.query.pageId || null;
    const doc = await WebsiteRequest.findOne({ school_id: schoolId }).lean();
    const meta = buildPageMeta(doc);

    let pages = [];
    let source = "none";

    if (Array.isArray(doc?.draft_pages) && doc.draft_pages.length) {
      source = "draft";
      pages = meta.map((m) => {
        const found = doc.draft_pages.find((p) => p.id === m.id || p.slug === m.slug);
        return { ...m, html: found?.html || "" };
      });
      // Keep any extra draft pages not in brief
      doc.draft_pages.forEach((p) => {
        if (!pages.find((x) => x.id === p.id)) {
          pages.push({
            id: p.id,
            title: p.title || "Page",
            slug: p.slug || `/${p.id}`,
            order: p.order ?? pages.length,
            html: p.html || "",
          });
        }
      });
    } else if (doc?.draft_html) {
      source = "draft";
      pages = meta.map((m, i) => ({ ...m, html: i === 0 ? doc.draft_html : "" }));
    } else if (Array.isArray(doc?.published_pages) && doc.published_pages.length) {
      source = "published";
      pages = [];
      for (const m of meta) {
        const pub = doc.published_pages.find((p) => p.id === m.id || p.slug === m.slug);
        let html = "";
        if (pub?.html_cloudinary_url) {
          try {
            const cloudRes = await fetch(pub.html_cloudinary_url);
            if (cloudRes.ok) html = await cloudRes.text();
          } catch (_) {}
        } else if ((m.slug === "/" || m.id === "home") && doc.html_cloudinary_url) {
          try {
            const cloudRes = await fetch(doc.html_cloudinary_url);
            if (cloudRes.ok) html = await cloudRes.text();
          } catch (_) {}
        }
        pages.push({ ...m, html });
      }
    } else if (doc?.html_cloudinary_url) {
      source = "published";
      try {
        const cloudRes = await fetch(doc.html_cloudinary_url);
        if (cloudRes.ok) {
          const html = await cloudRes.text();
          pages = meta.map((m, i) => ({ ...m, html: i === 0 ? html : "" }));
        }
      } catch (_) {}
    }

    if (!pages.length) {
      pages = meta.map((m) => ({ ...m, html: "" }));
    }

    const active = pageId
      ? pages.find((p) => p.id === pageId) || pages[0]
      : pages.find((p) => p.slug === "/" || p.id === "home") || pages[0];

    return res.json({
      success: true,
      data: {
        pages,
        html: active?.html || null,
        pageId: active?.id || null,
        source: active?.html ? source : "none",
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
