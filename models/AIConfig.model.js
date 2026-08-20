const mongoose = require("mongoose");

/**
 * AIConfig — stores OpenRouter API keys and model settings.
 * One document per "use" (website_editor | timetable_generator).
 * Only one active config per use is enforced in the route logic.
 *
 * The apiKey is stored as-is. In production you'd encrypt it at rest,
 * but the field is never returned to the frontend — the route strips it.
 */
const aiConfigSchema = new mongoose.Schema(
  {
    config_id:   { type: String, required: true, unique: true },

    // Human-readable label, e.g. "Claude 3.5 – Website"
    label:       { type: String, required: true, trim: true },

    // Which AI feature this config is for
    use:         {
      type:     String,
      required: true,
      enum:     ["website_editor", "timetable_generator"],
    },

    // OpenRouter API key — NEVER returned to frontend
    api_key:     { type: String, required: true },

    // Full OpenRouter model identifier, e.g. "anthropic/claude-3.5-sonnet"
    model:       { type: String, required: true, trim: true },

    // Optional model params
    max_tokens:  { type: Number, default: 4096 },
    temperature: { type: Number, default: 0.7 },

    // Only one config per use should be active at a time
    is_active:   { type: Boolean, default: true },

    // Who created / last updated it
    created_by:  { type: String, default: null },
    updated_by:  { type: String, default: null },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  }
);

module.exports = mongoose.model("AIConfig", aiConfigSchema);
