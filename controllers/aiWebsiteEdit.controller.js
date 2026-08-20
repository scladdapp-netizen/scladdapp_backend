/**
 * AI Website Edit Controller — Section-scoped diff patching
 *
 * Strategy:
 *  1. Client sends sectionId (preferred) or sectionHtml + fullHtml + prompt.
 *  2. Backend extracts the target section's innerHTML and sends ONLY that to the AI.
 *  3. AI returns a JSON diff with ops: replace, insert_before, insert_after, delete,
 *     or replace_section (full section fallback).
 *  4. Backend applies ops to the innerHTML, rewraps the section, splices it back.
 *  5. Deducts 1 token and returns the full updated HTML.
 */

const AIConfig       = require("../models/AIConfig.model");
const SchoolAIToken  = require("../models/SchoolAIToken.model");
const WebsiteRequest = require("../models/WebsiteRequest.model");
const School         = require("../models/School.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const cloudinary     = require("cloudinary").v2;

// ─── helpers ──────────────────────────────────────────────────────────────────

async function getWebsiteConfig() {
  const config = await AIConfig.findOne({ use: "website_editor", is_active: true });
  if (!config) throw new Error("No active AI config for website editor. Contact support.");
  return config;
}

async function getOrCreateTokenDoc(schoolId) {
  let doc = await SchoolAIToken.findOne({ school_id: schoolId });
  if (!doc) doc = await SchoolAIToken.create({ school_id: schoolId, balance: 0 });
  return doc;
}

/** Extract outerHTML + position of <section id="sectionId"> from fullHtml */
function extractSectionById(fullHtml, sectionId) {
  const openRe = new RegExp(`<section[^>]+id=["']${sectionId}["'][^>]*>`, "i");
  const match  = openRe.exec(fullHtml);
  if (!match) return null;
  const start = match.index;
  let depth = 0, i = start;
  while (i < fullHtml.length) {
    if (fullHtml.slice(i, i + 8).toLowerCase() === "<section") depth++;
    if (fullHtml.slice(i, i + 10).toLowerCase() === "</section") {
      depth--;
      if (depth === 0) {
        const end = fullHtml.indexOf(">", i) + 1;
        return { outerHtml: fullHtml.slice(start, end), start, end };
      }
    }
    i++;
  }
  return null;
}

/** Get innerHTML from any element's outerHTML */
function getInnerHtml(outerHtml) {
  const firstClose = outerHtml.indexOf(">") + 1;
  // Find the last closing tag (</section>, </nav>, </div>, </footer> etc.)
  const lastOpen = outerHtml.lastIndexOf("</");
  return outerHtml.slice(firstClose, lastOpen);
}

/** Rewrap innerHTML back into the original opening/closing tags */
function rewrapSection(outerHtml, newInner) {
  const firstClose = outerHtml.indexOf(">") + 1;
  const lastOpen   = outerHtml.lastIndexOf("</");
  return outerHtml.slice(0, firstClose) + newInner + outerHtml.slice(lastOpen);
}

/**
 * Strip injector classes (__aie_hover__, __aie_selected__) from HTML string.
 * The iframe injects these on hover/click — they must be removed before
 * matching sectionHtml against fullHtml (which is the clean draft).
 */
function stripInjectorClasses(html) {
  if (!html) return html;
  return html
    .replace(/\s*__aie_hover__/g, "")
    .replace(/\s*__aie_selected__/g, "")
    .replace(/\s*class=""/g, "")   // remove empty class attrs left behind
    .replace(/\s*class=''/g, "");
}

/**
 * Find sectionHtml inside fullHtml using its opening tag as an anchor.
 * More robust than a full-string indexOf because it tolerates minor
 * whitespace/attribute order differences inside the element.
 * Returns { outerHtml, start, end } or null.
 */
function locateSectionInFull(fullHtml, sectionHtml) {
  // Clean injector classes from what the iframe sent
  const cleanSection = stripInjectorClasses(sectionHtml).trim();

  // 1. Try exact match first (fast path)
  let idx = fullHtml.indexOf(cleanSection);
  if (idx !== -1) {
    return { outerHtml: cleanSection, start: idx, end: idx + cleanSection.length };
  }

  // 2. Extract the opening tag of the section (first tag line) and search by that
  const firstTagEnd = cleanSection.indexOf(">");
  if (firstTagEnd === -1) return null;
  const openTag = cleanSection.slice(0, firstTagEnd + 1).trim();

  // Remove any remaining injector class refs from the openTag
  const cleanOpenTag = openTag.replace(/\s*__aie\w*/g, "").trim();

  idx = fullHtml.indexOf(cleanOpenTag);
  if (idx === -1) return null;

  // Walk forward to find the matching closing tag
  const tagNameMatch = cleanOpenTag.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagNameMatch) return null;
  const tagName = tagNameMatch[1].toLowerCase();

  let depth = 0, i = idx;
  const openPattern  = new RegExp(`<${tagName}[\\s>]`, "i");
  const closePattern = new RegExp(`</${tagName}`, "i");

  while (i < fullHtml.length) {
    const slice = fullHtml.slice(i, i + tagName.length + 10);
    if (openPattern.test(slice.slice(0, tagName.length + 2)))  depth++;
    if (closePattern.test(slice.slice(0, tagName.length + 3))) {
      depth--;
      if (depth === 0) {
        const end = fullHtml.indexOf(">", i) + 1;
        return { outerHtml: fullHtml.slice(idx, end), start: idx, end };
      }
    }
    i++;
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

  const rules = [
    { words: ["nav","navigation","menu","logo"],  tag: "nav"    },
    { words: ["footer","copyright","bottom"],      tag: "footer" },
    { words: ["hero","banner","h1","headline"],    tag: "header" },
  ];
  for (const rule of rules) {
    if (!rule.words.some((w) => lower.includes(w))) continue;
    const found = hits.find((s) => s.tag === rule.tag);
    if (found) {
      const next = hits.find((s) => s.start > found.start);
      const end  = next ? next.start : fullHtml.length;
      return { outerHtml: fullHtml.slice(found.start, end).trim(), start: found.start, end };
    }
  }
  // Return largest section
  return hits.map((s, i) => {
    const next = hits[i + 1];
    const end  = next ? next.start : fullHtml.length;
    return { outerHtml: fullHtml.slice(s.start, end).trim(), start: s.start, end };
  }).reduce((a, b) => b.outerHtml.length > a.outerHtml.length ? b : a);
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SECTION_EDIT_SYSTEM_PROMPT = `You are an expert HTML/CSS/JS editor for school websites.
You receive the INNER HTML of one self-contained page section and an instruction.
Each section may contain <style> and <script> tags scoped to itself.

Apply the instruction to the section HTML and return ONLY the modified inner HTML.
Rules:
- Return ONLY the modified inner HTML — no explanation, no markdown, no code fences.
- Do NOT wrap output in <section> tags — return only the content inside them.
- Do NOT add <!DOCTYPE>, <html>, <head>, or <body> tags.
- Keep all existing content that the instruction does not ask to change.
- You may add or modify <style> blocks for scoped CSS.
- You may add or modify <script> blocks for scoped JS.
- Make ONLY the change described. Do not restructure unrelated parts.`;

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
    const configs = await AIConfig.find({ use: "website_editor" })
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

    // 1. Token check
    const tokenDoc = await getOrCreateTokenDoc(schoolId);
    if (tokenDoc.balance < 1) {
      return res.status(402).json({ success: false, code: "INSUFFICIENT_TOKENS",
        message: "You have no AI tokens left. Please purchase more.", balance: 0 });
    }

    // 2. Config
    const config = configId
      ? await AIConfig.findOne({ config_id: configId, use: "website_editor" })
      : await getWebsiteConfig();
    if (!config) return res.status(404).json({ success: false, message: "AI config not found" });

    // 3. Locate target section
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

    // 4. Build messages
    const elCtx = element
      ? `\nTargeted element: ${element.selector || element.tagName}` +
        (element.textContent ? `\nElement text: "${element.textContent.slice(0, 100)}"` : "")
      : "";
    const userMessage = `Instruction: ${prompt.trim()}${elCtx}\n\nCurrent section HTML:\n${workingInner}`;

    // 5. Call OpenRouter — use a small max_tokens since we only need the section back
    const sendMaxTokens = Math.min(config.max_tokens || 4096, 2048);
    console.log(`${tag} → OpenRouter model: ${config.model} | max_tokens: ${sendMaxTokens}`);

    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${config.api_key}`,
        "HTTP-Referer":  process.env.APP_URL || "http://localhost:1234",
        "X-Title":       "ScladApp Website Editor",
      },
      body: JSON.stringify({
        model:       config.model,
        max_tokens:  sendMaxTokens,
        temperature: 0.2,
        messages: [
          { role: "system", content: SECTION_EDIT_SYSTEM_PROMPT },
          { role: "user",   content: userMessage },
        ],
      }),
    });

    const orData = await orRes.json();
    if (!orRes.ok || orData.error) {
      const errMsg = orData.error?.message || `OpenRouter error ${orRes.status}`;
      console.error(`${tag} OpenRouter error: ${errMsg}`);
      return res.status(502).json({ success: false, message: errMsg });
    }

    let newInner = orData.choices?.[0]?.message?.content?.trim();
    if (!newInner) return res.status(502).json({ success: false, message: "AI returned empty response." });

    // Strip accidental code fences
    newInner = newInner.replace(/^```(?:html)?\n?/i, "").replace(/\n?```$/i, "").trim();

    console.log(`${tag} ← AI returned ${newInner.length} chars`);

    // Safety check: if AI returned less than 20% of what we sent, it probably truncated
    if (newInner.length < workingInner.length * 0.2 && workingInner.length > 200) {
      console.warn(`${tag} AI response suspiciously short (${newInner.length} vs ${workingInner.length}) — rejecting`);
      return res.status(502).json({
        success: false,
        message: "AI response was too short — the model may have truncated. Try selecting a smaller element or reducing max_tokens in your AI config.",
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

    // 7. Deduct token
    await SchoolAIToken.updateOne({ school_id: schoolId }, { $inc: { balance: -1, total_used: 1 } });
    const newBalance = Math.max(0, tokenDoc.balance - 1);

    return res.json({
      success: true, newHtml, tokensUsed: 1, newBalance,
      modelUsage: orData.usage || {},
      message: "Done",
    });

  } catch (err) {
    console.error(`[AI-WEBSITE-EDIT] Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

exports.saveDraft = async (req, res) => {
  const tag = "[AI-WEBSITE-DRAFT]";
  try {
    const { schoolId } = req.params;
    const { html } = req.body;
    if (!html) return res.status(400).json({ success: false, message: "html is required" });
    await WebsiteRequest.findOneAndUpdate(
      { school_id: schoolId },
      { $set: { draft_html: html, school_id: schoolId } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: false }
    );
    await School.updateOne({ school_id: schoolId }, { $set: { website_requested: true, updated_at: new Date() } });
    return res.json({ success: true, message: "Draft saved" });
  } catch (err) {
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
    const doc = await WebsiteRequest.findOne({ school_id: schoolId }).lean();
    if (!doc?.html_cloudinary_url) {
      return res.status(404).json({ success: false, message: "No published website found for this school." });
    }
    const cloudRes = await fetch(doc.html_cloudinary_url);
    if (!cloudRes.ok) return res.status(502).json({ success: false, message: "Could not fetch published HTML from storage." });
    const html = await cloudRes.text();
    return res.json({ success: true, data: { html } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getDraft = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const doc = await WebsiteRequest.findOne({ school_id: schoolId }).lean();

    if (doc?.draft_html) {
      return res.json({ success: true, data: { html: doc.draft_html, source: "draft" } });
    }
    if (doc?.html_cloudinary_url) {
      try {
        const cloudRes = await fetch(doc.html_cloudinary_url);
        if (cloudRes.ok) {
          const html = await cloudRes.text();
          return res.json({ success: true, data: { html, source: "published" } });
        }
      } catch (_) {}
    }
    return res.json({ success: true, data: { html: null, source: "none" } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
