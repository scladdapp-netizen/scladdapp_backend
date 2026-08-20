/**
 * AI Config Routes  (Portal Admin only — requires valid JWT)
 * ----------------------------------------------------------
 * GET    /api/ai-config            — list all configs (api_key masked)
 * POST   /api/ai-config            — create a new config
 * PATCH  /api/ai-config/:configId  — update a config
 * DELETE /api/ai-config/:configId  — delete a config
 *
 * Internal helper (used by other controllers, not exposed):
 *   getActiveConfig(use)  — returns the active config doc for a given use
 */

const express   = require("express");
const jwt       = require("jsonwebtoken");
const AIConfig  = require("../models/AIConfig.model");

const router = express.Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeId() {
  return "aic_" + Date.now().toString() + Math.floor(Math.random() * 10000).toString();
}

/** Strip the real key — replace with masked version for API responses */
function maskConfig(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  if (obj.api_key) {
    const key = obj.api_key;
    // Show first 8 chars + dots + last 4
    obj.api_key_masked =
      key.length > 12
        ? key.slice(0, 8) + "••••••••" + key.slice(-4)
        : "••••••••••••";
  }
  delete obj.api_key;   // never send the real key to the frontend
  return obj;
}

// ─── middleware: verify portal admin JWT ─────────────────────────────────────
function verifyToken(req, res, next) {
  const tag    = "[AI-CONFIG-AUTH]";
  const header = req.headers.authorization || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    console.warn(`${tag} No token`);
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.warn(`${tag} Invalid token — ${err.message}`);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

// ─── GET /api/ai-config ───────────────────────────────────────────────────────
// Returns all configs with the api_key masked.
router.get("/", verifyToken, async (req, res) => {
  const tag = "[AI-CONFIG-LIST]";
  try {
    const configs = await AIConfig.find({}).sort({ created_at: -1 }).lean();
    const masked  = configs.map((c) => {
      const obj = { ...c };
      if (obj.api_key) {
        const key = obj.api_key;
        obj.api_key_masked =
          key.length > 12
            ? key.slice(0, 8) + "••••••••" + key.slice(-4)
            : "••••••••••••";
      }
      delete obj.api_key;
      return obj;
    });

    console.log(`${tag} Returned ${masked.length} configs`);
    return res.status(200).json({ success: true, data: masked });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ─── POST /api/ai-config ──────────────────────────────────────────────────────
// Create a new AI config. If is_active is true, deactivates any existing
// active config for the same use first (only one active at a time per use).
router.post("/", verifyToken, async (req, res) => {
  const tag = "[AI-CONFIG-CREATE]";
  try {
    const { label, use, api_key, model, max_tokens, temperature, is_active } = req.body;
    const { portal_admin_id } = req.jwtPayload;

    console.log(`${tag} Creating config — use: ${use}, model: ${model}, by: ${portal_admin_id}`);

    // validation
    if (!label || !use || !api_key || !model) {
      return res.status(400).json({
        success: false,
        message: "label, use, api_key, and model are required",
      });
    }

    const validUses = ["website_editor", "timetable_generator"];
    if (!validUses.includes(use)) {
      return res.status(400).json({
        success: false,
        message: `use must be one of: ${validUses.join(", ")}`,
      });
    }

    // if this new config is active, deactivate others for the same use
    if (is_active !== false) {
      await AIConfig.updateMany({ use, is_active: true }, { $set: { is_active: false } });
      console.log(`${tag} Deactivated existing active configs for use: ${use}`);
    }

    const config = await AIConfig.create({
      config_id:   makeId(),
      label:       label.trim(),
      use,
      api_key:     api_key.trim(),
      model:       model.trim(),
      max_tokens:  max_tokens  ?? 4096,
      temperature: temperature ?? 0.7,
      is_active:   is_active !== false,
      created_by:  portal_admin_id,
      updated_by:  portal_admin_id,
    });

    console.log(`${tag} Created config_id: ${config.config_id}`);
    return res.status(201).json({
      success: true,
      data:    maskConfig(config),
      message: "AI config created successfully",
    });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ─── PATCH /api/ai-config/:configId ──────────────────────────────────────────
// Update an existing config. Partial updates supported.
// Toggling is_active to true will deactivate others for the same use.
router.patch("/:configId", verifyToken, async (req, res) => {
  const tag = "[AI-CONFIG-UPDATE]";
  try {
    const { configId } = req.params;
    const { portal_admin_id } = req.jwtPayload;
    const { label, use, api_key, model, max_tokens, temperature, is_active } = req.body;

    console.log(`${tag} Updating config_id: ${configId} by: ${portal_admin_id}`);

    const config = await AIConfig.findOne({ config_id: configId });
    if (!config) {
      return res.status(404).json({ success: false, message: "Config not found" });
    }

    // validate use if changing it
    if (use !== undefined) {
      const validUses = ["website_editor", "timetable_generator"];
      if (!validUses.includes(use)) {
        return res.status(400).json({
          success: false,
          message: `use must be one of: ${validUses.join(", ")}`,
        });
      }
      config.use = use;
    }

    // if activating, deactivate other configs for the same use
    if (is_active === true) {
      const targetUse = use || config.use;
      await AIConfig.updateMany(
        { use: targetUse, is_active: true, config_id: { $ne: configId } },
        { $set: { is_active: false } }
      );
      console.log(`${tag} Deactivated other active configs for use: ${targetUse}`);
      config.is_active = true;
    } else if (is_active === false) {
      config.is_active = false;
    }

    if (label       !== undefined) config.label       = label.trim();
    if (api_key     !== undefined) config.api_key     = api_key.trim();
    if (model       !== undefined) config.model       = model.trim();
    if (max_tokens  !== undefined) config.max_tokens  = max_tokens;
    if (temperature !== undefined) config.temperature = temperature;
    config.updated_by = portal_admin_id;

    await config.save();

    console.log(`${tag} Updated config_id: ${configId}`);
    return res.status(200).json({
      success: true,
      data:    maskConfig(config),
      message: "AI config updated successfully",
    });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ─── DELETE /api/ai-config/:configId ─────────────────────────────────────────
router.delete("/:configId", verifyToken, async (req, res) => {
  const tag = "[AI-CONFIG-DELETE]";
  try {
    const { configId } = req.params;
    const { portal_admin_id } = req.jwtPayload;

    console.log(`${tag} Deleting config_id: ${configId} by: ${portal_admin_id}`);

    const config = await AIConfig.findOneAndDelete({ config_id: configId });
    if (!config) {
      return res.status(404).json({ success: false, message: "Config not found" });
    }

    console.log(`${tag} Deleted config_id: ${configId}`);
    return res.status(200).json({ success: true, message: "AI config deleted" });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ─── POST /api/ai-config/:configId/test ──────────────────────────────────────
// Sends a tiny test prompt to OpenRouter using the stored key + model.
// Returns success/failure so the admin knows the config actually works.
router.post("/:configId/test", verifyToken, async (req, res) => {
  const tag = "[AI-CONFIG-TEST]";
  try {
    const { configId } = req.params;
    console.log(`${tag} Testing config_id: ${configId}`);

    const config = await AIConfig.findOne({ config_id: configId });
    if (!config) {
      return res.status(404).json({ success: false, message: "Config not found" });
    }

    if (!config.api_key) {
      return res.status(400).json({ success: false, message: "No API key stored for this config" });
    }

    // Fire a minimal single-message request to OpenRouter
    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${config.api_key}`,
        // OpenRouter recommends these headers
        "HTTP-Referer":  process.env.APP_URL || "http://localhost:1234",
        "X-Title":       "ScladApp Admin Test",
      },
      body: JSON.stringify({
        model:      config.model,
        max_tokens: 16,   // tiny — just enough to confirm the model responds
        messages:   [{ role: "user", content: "Say: OK" }],
      }),
    });

    const orData = await orRes.json();
    console.log(`${tag} OpenRouter response status: ${orRes.status}`);

    // OpenRouter returns error in { error: { message, code } }
    if (!orRes.ok || orData.error) {
      const errMsg =
        orData.error?.message ||
        orData.message         ||
        `OpenRouter returned status ${orRes.status}`;
      console.warn(`${tag} Test failed — ${errMsg}`);
      return res.status(200).json({
        success: false,
        message: errMsg,
        details: { status: orRes.status, model: config.model },
      });
    }

    const reply = orData.choices?.[0]?.message?.content?.trim() || "(empty response)";
    console.log(`${tag} Test passed — model reply: "${reply}"`);

    return res.status(200).json({
      success: true,
      message: "Connection successful",
      details: {
        model:  config.model,
        reply,
        usage:  orData.usage || null,
      },
    });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error while testing config",
    });
  }
});

module.exports = router;

// ─── Internal helper — used by ai_timetable.controller etc. ──────────────────
/**
 * getActiveConfig(use)
 * Returns the full config doc (including api_key) for internal server use only.
 * Never call this from a route that sends data to the frontend.
 *
 * @param {"website_editor"|"timetable_generator"} use
 * @returns {Promise<import("../models/AIConfig.model")|null>}
 */
async function getActiveConfig(use) {
  return AIConfig.findOne({ use, is_active: true });
}

module.exports.getActiveConfig = getActiveConfig;
