/**
 * Extract and parse JSON from LLM responses (markdown fences, prose, trailing commas).
 */

function stripCodeFences(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function removeTrailingCommas(jsonStr) {
  return jsonStr.replace(/,\s*([}\]])/g, "$1");
}

function sliceBalanced(text, openChar, closeChar) {
  const start = text.indexOf(openChar);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParse(jsonStr) {
  if (!jsonStr) return null;
  const attempts = [
    jsonStr,
    removeTrailingCommas(jsonStr),
    removeTrailingCommas(jsonStr.replace(/^\uFEFF/, "")),
  ];
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }
  return null;
}

function extractJsonFromText(text) {
  if (!text || typeof text !== "string") return null;

  const cleaned = stripCodeFences(text);

  const direct = tryParse(cleaned);
  if (direct !== null) return direct;

  const objectSlice = sliceBalanced(cleaned, "{", "}");
  if (objectSlice) {
    const parsed = tryParse(objectSlice);
    if (parsed !== null) return parsed;
  }

  const arraySlice = sliceBalanced(cleaned, "[", "]");
  if (arraySlice) {
    const parsed = tryParse(arraySlice);
    if (parsed !== null) return parsed;
  }

  return null;
}

/** Normalize timetable AI payload to an array of { class_id, entries }. */
function normalizeTimetablePayload(parsed) {
  if (!parsed) return null;
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.timetables)) return parsed.timetables;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (parsed.class_id && Array.isArray(parsed.entries)) return [parsed];
  return null;
}

/**
 * Prefer real assistant content only.
 * Do NOT fall back to reasoning_details — that is model thinking, not JSON output.
 */
function getMessageText(message) {
  if (!message) return "";

  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }

  // Some providers return content as an array of parts
  if (Array.isArray(message.content)) {
    const joined = message.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && typeof part.text === "string") return part.text;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
    if (joined) return joined;
  }

  return "";
}

function hasReasoningOnly(message) {
  if (!message) return false;
  const hasContent = !!getMessageText(message);
  const hasReasoning =
    (Array.isArray(message.reasoning_details) && message.reasoning_details.length > 0) ||
    (typeof message.reasoning === "string" && message.reasoning.trim().length > 0);
  return !hasContent && hasReasoning;
}

function parseTimetableAIResponse(text) {
  const parsed = extractJsonFromText(text);
  return normalizeTimetablePayload(parsed);
}

module.exports = {
  extractJsonFromText,
  normalizeTimetablePayload,
  getMessageText,
  hasReasoningOnly,
  parseTimetableAIResponse,
};
