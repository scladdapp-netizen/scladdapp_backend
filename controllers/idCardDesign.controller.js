"use strict";

const { activeConfigs, callModel } = require("./schoolAssistant.controller");
const { resolveAccess } = require("../utils/assistantAccess");
const { extractJsonFromText, getMessageText } = require("../utils/parseAiJson");

const LAYOUTS = new Set(["gold", "campus", "round", "formal"]);

const SYSTEM = `You design one school ID card. Reply with one JSON object and nothing else.
Use any picture only for color, mood, and layout. Do not copy names, logos, or words printed on it.
Follow the written brief when it disagrees with the picture. The card is a wallet card, 85.6mm by 54mm.
Shape:
{
  "name": "two to four words",
  "headerColor": "#112233",
  "accentColor": "#445566",
  "paper": "#ffffff",
  "ink": "#111111",
  "layout": "gold" or "campus" or "round" or "formal",
  "showName": true,
  "showSession": true,
  "showClass": true,
  "showId": true,
  "showLogo": true,
  "showPhoto": true,
  "showSchool": true,
  "showMotto": true,
  "showQr": true,
  "showValidUntil": true,
  "showEmergency": true,
  "showContact": true,
  "studentLabel": "STUDENT ID CARD",
  "staffLabel": "STAFF ID CARD",
  "footerText": "one short sentence for the back of the card"
}
headerColor is the dark bar. accentColor is a second color. paper is the card background. ink is the body text. All four are hex colors. Turn a show field off only when the brief asks to hide it. Labels stay short.`;

function hex(value, fallback) {
  const raw = String(value || "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? raw : fallback;
}

function flag(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function cleanDesign(raw) {
  if (!raw || typeof raw !== "object") return null;
  const layout = LAYOUTS.has(raw.layout) ? raw.layout : "gold";
  const layoutTall = layout;
  return {
    designId: "custom",
    name: String(raw.name || "Custom design").replace(/\s+/g, " ").trim().slice(0, 40) || "Custom design",
    headerColor: hex(raw.headerColor, "#111111"),
    accentColor: hex(raw.accentColor, "#4F46E5"),
    paper: hex(raw.paper, "#ffffff"),
    ink: hex(raw.ink, "#111111"),
    layout,
    layoutTall,
    showName: flag(raw.showName, true),
    showSession: flag(raw.showSession, true),
    showClass: flag(raw.showClass, true),
    showId: flag(raw.showId, true),
    showLogo: flag(raw.showLogo, true),
    showPhoto: flag(raw.showPhoto, true),
    showSchool: flag(raw.showSchool, true),
    showMotto: flag(raw.showMotto, true),
    showQr: flag(raw.showQr, true),
    showValidUntil: flag(raw.showValidUntil, true),
    showEmergency: flag(raw.showEmergency, true),
    showContact: flag(raw.showContact, true),
    studentLabel: String(raw.studentLabel || "STUDENT ID CARD").trim().slice(0, 28) || "STUDENT ID CARD",
    staffLabel: String(raw.staffLabel || "STAFF ID CARD").trim().slice(0, 28) || "STAFF ID CARD",
    footerText: String(raw.footerText || "If found, please return this card to the school.").trim().slice(0, 140),
  };
}

exports.designFromImage = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const who = await resolveAccess(req, schoolId);
    if (who.error) return res.status(who.error.status).json({ success: false, message: who.error.message });

    const image = String(req.body?.image || "");
    const feel = String(req.body?.feel || "").trim().slice(0, 500);
    const colors = String(req.body?.colors || "").trim().slice(0, 160);
    const extra = String(req.body?.extra || "").trim().slice(0, 500);
    const audience = req.body?.audience === "staff" ? "staff" : "student";
    const schoolName = String(req.body?.schoolName || "the school").trim().slice(0, 80);
    if (image && !image.startsWith("data:image/")) {
      return res.status(400).json({ success: false, message: "That file is not an image." });
    }
    if (image.length > 6_000_000) {
      return res.status(400).json({ success: false, message: "That image is too large. Use a picture under a few megabytes." });
    }
    if (!image && !feel && !colors && !extra) {
      return res.status(400).json({ success: false, message: "Add a picture or describe the card." });
    }

    const pool = await activeConfigs();
    if (!pool.length) {
      return res.status(400).json({ success: false, message: "No active School Assistant model. In AI Config, set Use to School Assistant and turn it on." });
    }

    const brief = [
      `Design a ${audience} ID card for ${schoolName}.`,
      feel && `Look and feel: ${feel}`,
      colors && `Colors to use: ${colors}`,
      extra && `Also: ${extra}`,
    ].filter(Boolean).join("\n");
    const userContent = image
      ? [
        { type: "text", text: brief },
        { type: "image_url", image_url: { url: image } },
      ]
      : brief;

    const completion = await callModel(pool, {
      maxTokens: 800,
      temperature: 0.2,
      reasoningEffort: "low",
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
    });

    const text = getMessageText(completion?.choices?.[0]?.message);
    const design = cleanDesign(extractJsonFromText(text));
    if (!design) {
      return res.status(200).json({ success: false, message: "The assistant could not read a design from that image. Try another picture." });
    }
    return res.json({ success: true, data: design });
  } catch (error) {
    const busy = error.status === 429 || /rate limit|quota|too many requests/i.test(error.message || "");
    const minutes = error.retryAfterMs ? Math.max(1, Math.ceil(error.retryAfterMs / 60000)) : 0;
    const message = busy
      ? (minutes
        ? `The assistant's models are out of quota. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`
        : "The assistant is busy right now. Try again in a moment.")
      : "The assistant could not design a card from that image. Try another picture.";
    return res.status(200).json({ success: false, message });
  }
};
