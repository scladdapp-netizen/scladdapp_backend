const Class = require("../models/Class.model");
const Subject = require("../models/Subject.model");
const ClassSubjectAssignment = require("../models/ClassSubjectAssignment.model");
const TeacherSubjectAssignment = require("../models/TeacherSubjectAssignment.model");
const Staff = require("../models/Staff.model");
const TimetableTemplate = require("../models/TimetableTemplate.model");
const ClassTimetable = require("../models/ClassTimetable.model");
const AIConfig = require("../models/AIConfig.model");
const { USE_TIMETABLE, usesForFeature } = require("../utils/aiConfigUse");
const { getMessageText, hasReasoningOnly, parseTimetableAIResponse } = require("../utils/parseAiJson");
const { checkAITimetableAccess } = require("../utils/planLimitCheck");
const axios = require("axios");

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = 90_000;
const OPENROUTER_MAX_RETRIES = 1;
const TAG = "[AI-TIMETABLE]";

/** Force models to emit JSON in content, not burn tokens on chain-of-thought. */
const NO_REASONING = {
  reasoning: { effort: "none", enabled: false },
};

async function getTimetableConfig() {
  const config = await AIConfig.findOne({ use: usesForFeature(USE_TIMETABLE), is_active: true });
  if (!config) throw new Error("No active AI config for timetable generator. Contact support.");
  return config;
}

function isRetryableNetworkError(err) {
  const code = err?.code || err?.cause?.code;
  const msg = String(err?.message || "").toLowerCase();
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

async function callOpenRouter({ apiKey, model, maxTokens, messages, tag = "[AI-TIMETABLE]", extra = {} }) {
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
          ...extra,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": process.env.APP_URL || "http://localhost:1234",
            "X-Title": "ScladApp Timetable Generator",
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

function estimateMaxTokens(classCount, periodTotal = 0) {
  // Rough: ~80 tokens per entry; entries ≈ periods + breaks per day × days × classes
  const fromPeriods = periodTotal * 90 + classCount * 400;
  return Math.min(16000, Math.max(6000, fromPeriods + 1024));
}

function summarizeExistingTimetables(timetables) {
  return timetables.map((t) => ({
    class_id: t.class_id,
    slots: (t.entries || [])
      .filter((e) => e.day && e.start && e.end)
      .map((e) => ({
        day: e.day,
        start: e.start,
        end: e.end,
        teachers: [...new Set((e.subjects || []).map((s) => s.teacher).filter(Boolean))],
        subjects: [...new Set((e.subjects || []).map((s) => s.name).filter(Boolean))],
      })),
  }));
}

const STREAM_META = {
  science:    { streamName: "Science Stream", color: "#10b981" },
  arts:       { streamName: "Arts Stream", color: "#3b82f6" },
  commercial: { streamName: "Commercial Stream", color: "#f59e0b" },
  general:    { streamName: "General (All Streams)", color: "#6b7280" },
  mixed:      { streamName: "Mixed Streams", color: "#6b7280" },
};

function findSubjectInCatalog(catalog, raw) {
  if (!raw || !Array.isArray(catalog)) return null;
  const key = String(raw).trim().toLowerCase();
  return (
    catalog.find(
      (s) =>
        String(s.subject_id) === String(raw) ||
        String(s.subject_name || "").toLowerCase() === key ||
        String(s.subject_code || "").toLowerCase() === key
    ) || null
  );
}

function normalizeSubjectItem(raw, catalog, entryFallback = {}) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const fromCatalog =
      findSubjectInCatalog(catalog, raw.id) ||
      findSubjectInCatalog(catalog, raw.name) ||
      findSubjectInCatalog(catalog, raw.code);
    const stream = String(raw.stream || fromCatalog?.stream || entryFallback.stream || "general").toLowerCase();
    const meta = STREAM_META[stream] || STREAM_META.general;
    const name = raw.name || fromCatalog?.subject_name || "Unknown";
    const teacher = raw.teacher || fromCatalog?.teacher_name || entryFallback.teacher || "Not assigned";
    return {
      id: String(raw.id || fromCatalog?.subject_id || name),
      name,
      code: raw.code || fromCatalog?.subject_code || "",
      teacher,
      stream,
      streamName: raw.streamName || meta.streamName,
      displayName: raw.displayName || `${name} (${meta.streamName})`,
    };
  }

  const fromCatalog = findSubjectInCatalog(catalog, raw);
  const name = fromCatalog?.subject_name || String(raw || "Unknown");
  const stream = String(fromCatalog?.stream || entryFallback.stream || "general").toLowerCase();
  const meta = STREAM_META[stream] || STREAM_META.general;
  const teacher = fromCatalog?.teacher_name || entryFallback.teacher || "Not assigned";
  return {
    id: String(fromCatalog?.subject_id || name),
    name,
    code: fromCatalog?.subject_code || "",
    teacher,
    stream,
    streamName: meta.streamName,
    displayName: `${name} (${meta.streamName})`,
  };
}

function looksLikeBreak(entry) {
  if (entry?.isBreak === true) return true;
  const name = String(entry?.name || "").toLowerCase();
  return /break|lunch|recess|interval|assembly/.test(name);
}

/**
 * AI often returns subjects as bare strings ("english") or numbers.
 * Coerce entries into the ClassTimetable embedded-document shape.
 */
function normalizeTimetableEntries(entries, classInfo) {
  const catalog = classInfo?.subjects || [];
  let nextId = 1;

  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && typeof e === "object")
    .map((raw) => {
      const isBreak = looksLikeBreak(raw);
      let subjects = [];

      if (!isBreak) {
        if (Array.isArray(raw.subjects)) {
          subjects = raw.subjects
            .filter((s) => s != null && s !== "")
            .map((s) => normalizeSubjectItem(s, catalog, raw));
        } else if (typeof raw.subjects === "string" || typeof raw.subjects === "number") {
          subjects = [normalizeSubjectItem(raw.subjects, catalog, raw)];
        } else if (raw.name && !isBreak) {
          // subjects missing — try resolve from entry name
          const match = findSubjectInCatalog(catalog, raw.name);
          if (match) subjects = [normalizeSubjectItem(match.subject_name, catalog, raw)];
        }
      }

      const streamIds = [...new Set(subjects.map((s) => s.stream).filter(Boolean))];
      let stream = raw.stream || "general";
      let streamName = raw.streamName || "";
      let streamColor = raw.streamColor || "";
      let name = raw.name || "";
      let teacher = raw.teacher || "";

      if (isBreak) {
        name = name || "Break";
        stream = "general";
        streamName = streamName || "Break";
        streamColor = streamColor || "#9ca3af";
        teacher = "";
        subjects = [];
      } else if (subjects.length === 1) {
        stream = subjects[0].stream;
        streamName = subjects[0].streamName;
        streamColor = (STREAM_META[stream] || STREAM_META.general).color;
        name = name || subjects[0].name;
        teacher = teacher || subjects[0].teacher;
      } else if (subjects.length > 1) {
        if (streamIds.length === 1) {
          stream = streamIds[0];
          streamName = (STREAM_META[stream] || STREAM_META.general).streamName;
          streamColor = (STREAM_META[stream] || STREAM_META.general).color;
        } else {
          stream = "mixed";
          streamName = STREAM_META.mixed.streamName;
          streamColor = STREAM_META.mixed.color;
        }
        name = name || `${subjects.length} Subjects`;
        teacher = teacher || "Multiple Teachers";
      } else {
        const meta = STREAM_META[String(stream).toLowerCase()] || STREAM_META.general;
        streamName = streamName || meta.streamName;
        streamColor = streamColor || meta.color;
      }

      const id = raw.id != null && raw.id !== "" ? raw.id : nextId++;
      if (typeof id === "number" && id >= nextId) nextId = id + 1;

      return {
        id,
        day: raw.day || null,
        start: raw.start || null,
        end: raw.end || null,
        name,
        teacher: teacher || "",
        stream,
        streamName,
        streamColor,
        subjects,
        isBreak,
      };
    })
    .filter((e) => e.day && e.start && e.end);
}

function timeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutesToTime(total) {
  const mins = Math.max(0, Math.round(total));
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function makeBreakEntry({ id, day, start, end, name }) {
  return {
    id,
    day,
    start,
    end,
    name: name || "Break",
    teacher: "",
    stream: "general",
    streamName: "Break",
    streamColor: "#9ca3af",
    subjects: [],
    isBreak: true,
  };
}

/**
 * Strip AI-made breaks and insert template break/interval periods
 * after the Nth subject period of each day (matches Edit Timetable break entries).
 * Template break: { name, duration, after_period, days? }
 */
function injectTemplateBreaks(entries, breaks, selectedDays = []) {
  const breakDefs = Array.isArray(breaks) ? breaks : [];
  if (!breakDefs.length) return entries;

  const subjectsOnly = (entries || []).filter((e) => !e.isBreak);
  const days = [
    ...new Set([
      ...subjectsOnly.map((e) => e.day).filter(Boolean),
      ...(Array.isArray(selectedDays) ? selectedDays : []),
    ]),
  ];

  let nextId =
    subjectsOnly.reduce((max, e) => {
      const n = Number(e.id);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0) + 1;

  const result = [];

  for (const day of days) {
    const dayPeriods = subjectsOnly
      .filter((e) => e.day === day)
      .slice()
      .sort((a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0));

    if (!dayPeriods.length) continue;

    const applicable = breakDefs
      .filter((b) => {
        if (!b || !b.after_period) return false;
        const bDays = Array.isArray(b.days) ? b.days : null;
        if (bDays && bDays.length && !bDays.includes(day)) return false;
        return Number(b.after_period) > 0 && Number(b.after_period) <= dayPeriods.length;
      })
      .slice()
      .sort((a, b) => Number(a.after_period) - Number(b.after_period));

    for (let i = 0; i < dayPeriods.length; i++) {
      result.push(dayPeriods[i]);
      const periodNum = i + 1;
      for (const br of applicable) {
        if (Number(br.after_period) !== periodNum) continue;
        const duration = Math.max(1, Number(br.duration) || 15);
        const periodEnd = timeToMinutes(dayPeriods[i].end);
        if (periodEnd == null) continue;

        // Prefer the gap before the next subject period when the AI left empty space
        const nextPeriod = dayPeriods[i + 1];
        const nextStart = nextPeriod ? timeToMinutes(nextPeriod.start) : null;
        let breakStart = periodEnd;
        let breakEnd = periodEnd + duration;

        if (nextStart != null && nextStart > periodEnd) {
          // Place break in the gap: start right after period, clamp to next period start
          breakStart = periodEnd;
          breakEnd = Math.min(periodEnd + duration, nextStart);
          // If gap is larger than duration, keep break at start of gap (after period)
          if (nextStart - periodEnd >= duration) {
            breakEnd = periodEnd + duration;
          }
        }

        if (breakEnd <= breakStart) {
          breakEnd = breakStart + duration;
        }

        result.push(
          makeBreakEntry({
            id: nextId++,
            day,
            start: minutesToTime(breakStart),
            end: minutesToTime(breakEnd),
            name: br.name || "Break",
          })
        );
      }
    }
  }

  // Preserve any days that somehow had only breaks (unlikely)
  return result.length ? result : entries;
}

function finalizeTimetableEntries(rawEntries, classInfo, breaks, selectedDays) {
  const normalized = normalizeTimetableEntries(rawEntries, classInfo);
  return injectTemplateBreaks(normalized, breaks, selectedDays);
}

async function callOpenRouterWithJson(opts) {
  const withJson = await callOpenRouter({
    ...opts,
    extra: {
      ...NO_REASONING,
      ...(opts.extra || {}),
      response_format: { type: "json_object" },
    },
  });
  if (withJson.ok) return withJson;

  const errMsg = String(withJson.data?.error?.message || "").toLowerCase();
  if (
    errMsg.includes("response_format") ||
    errMsg.includes("json") ||
    errMsg.includes("reasoning") ||
    errMsg.includes("effort")
  ) {
    console.warn(`${opts.tag || TAG} JSON/reasoning params unsupported — retrying plain + no-reasoning`);
    return callOpenRouter({
      ...opts,
      extra: { ...NO_REASONING, ...(opts.extra || {}) },
    });
  }
  return withJson;
}

async function generateTimetableJson({ apiKey, model, maxTokens, systemPrompt, userPrompt }) {
  console.log(`${TAG} Generating for model=${model}, max_tokens=${maxTokens}`);

  const primary = await callOpenRouterWithJson({
    apiKey,
    model,
    maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    tag: TAG,
  });

  if (!primary.ok) {
    console.error(`${TAG} Primary API error:`, primary.status, primary.data?.error || primary.data);
    return { error: primary.data?.error?.message || "AI API error" };
  }

  const primaryMessage = primary.data.choices?.[0]?.message;
  const primaryText = getMessageText(primaryMessage);
  const finishReason = primary.data.choices?.[0]?.finish_reason;
  const usage = primary.data.usage;

  console.log(`${TAG} Primary response — finish_reason=${finishReason || "unknown"}, chars=${primaryText.length}`);
  if (usage) console.log(`${TAG} Primary usage:`, usage);

  if (hasReasoningOnly(primaryMessage)) {
    console.warn(
      `${TAG} Reasoning-only reply (content=null). reasoning_tokens=` +
        `${usage?.completion_tokens_details?.reasoning_tokens ?? "?"}`
    );
  }

  let timetables = parseTimetableAIResponse(primaryText);
  if (timetables?.length) {
    console.log(`${TAG} Primary response parsed OK — ${timetables.length} timetable(s)`);
    return { timetables };
  }

  // Truncated / reasoning-only / empty content → one harder retry (do NOT repair thinking text)
  if (!primaryText || finishReason === "length" || hasReasoningOnly(primaryMessage)) {
    const retryTokens = Math.min(16000, Math.max(maxTokens * 2, 8000));
    console.warn(`${TAG} Retrying with max_tokens=${retryTokens} (strict JSON, no reasoning)`);

    const retry = await callOpenRouterWithJson({
      apiKey,
      model,
      maxTokens: retryTokens,
      messages: [
        {
          role: "system",
          content:
            "You are a JSON API. Output ONLY valid JSON. Never explain. Never think out loud. " +
            'Shape: {"timetables":[{"class_id":"...","entries":[...]}]}. First character must be {.',
        },
        { role: "user", content: userPrompt },
      ],
      tag: TAG,
    });

    if (retry.ok) {
      const retryMsg = retry.data.choices?.[0]?.message;
      const retryText = getMessageText(retryMsg);
      console.log(
        `${TAG} Retry — finish_reason=${retry.data.choices?.[0]?.finish_reason}, chars=${retryText.length}`
      );
      if (retry.data.usage) console.log(`${TAG} Retry usage:`, retry.data.usage);
      if (retryText) {
        console.warn(`${TAG} Retry text:\n${retryText.slice(0, 2000)}${retryText.length > 2000 ? "…" : ""}`);
      }

      timetables = parseTimetableAIResponse(retryText);
      if (timetables?.length) {
        console.log(`${TAG} Retry parsed OK — ${timetables.length} timetable(s)`);
        return { timetables };
      }

      if (retryText) {
        console.warn(`${TAG} Retry did not parse — JSON repair`);
        const repair = await callOpenRouterWithJson({
          apiKey,
          model,
          maxTokens: Math.min(retryTokens, 8192),
          messages: [
            {
              role: "system",
              content:
                'Repair invalid JSON. Output ONLY {"timetables":[{"class_id":"...","entries":[...]}]}. No markdown.',
            },
            { role: "user", content: `Fix this into valid timetable JSON:\n${retryText.slice(0, 12000)}` },
          ],
          tag: TAG,
        });
        if (repair.ok) {
          const repairText = getMessageText(repair.data.choices?.[0]?.message);
          console.warn(`${TAG} Repair text:\n${(repairText || "").slice(0, 2000)}`);
          timetables = parseTimetableAIResponse(repairText);
          if (timetables?.length) {
            console.log(`${TAG} Repair parsed OK — ${timetables.length} timetable(s)`);
            return { timetables };
          }
        }
      }
    }

    return {
      error:
        "Model returned no JSON (often burns all tokens on reasoning). Switch AI Config to openai/gpt-4o-mini or another non-reasoning model — openrouter/free frequently fails for this.",
      raw: null,
    };
  }

  console.warn(`${TAG} Primary response did not parse — running JSON repair`);
  console.warn(`${TAG} Primary text:\n${primaryText.slice(0, 2000)}${primaryText.length > 2000 ? "…" : ""}`);

  const repair = await callOpenRouterWithJson({
    apiKey,
    model,
    maxTokens: Math.min(maxTokens, 8192),
    messages: [
      {
        role: "system",
        content:
          'Repair invalid JSON. Output ONLY {"timetables":[{"class_id":"...","entries":[...]}]}. No markdown.',
      },
      { role: "user", content: `Fix this timetable JSON:\n${primaryText.slice(0, 12000)}` },
    ],
    tag: TAG,
  });

  if (!repair.ok) {
    console.error(`${TAG} Repair API error:`, repair.status, repair.data?.error || repair.data);
    return { error: repair.data?.error?.message || "AI repair failed", raw: primaryText.slice(0, 500) };
  }

  const repairText = getMessageText(repair.data.choices?.[0]?.message);
  console.log(`${TAG} Repair response — chars=${repairText.length}`);
  console.warn(`${TAG} Repair text:\n${(repairText || "").slice(0, 2000)}`);

  timetables = parseTimetableAIResponse(repairText);
  if (timetables?.length) {
    console.log(`${TAG} Repair parsed OK — ${timetables.length} timetable(s)`);
    return { timetables };
  }

  return {
    error: "AI returned invalid JSON. Try one class at a time or a simpler template.",
    raw: (repairText || primaryText).slice(0, 500),
  };
}

exports.getAvailableModels = async (req, res) => {
  try {
    const configs = await AIConfig.find({ use: usesForFeature(USE_TIMETABLE) })
      .select("config_id label model is_active")
      .sort({ is_active: -1, created_at: -1 })
      .lean();
    return res.json({ success: true, data: configs });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/ai-timetable/generate
 * Body: { school_id, subsession_id, template_id, notes, class_id?, configId? }
 *
 * Generates timetables for ALL classes (or a single class) in the school
 * for the given subsession using AI, then auto-saves each one to MongoDB.
 */
exports.generateTimetables = async (req, res) => {
  try {
    const { school_id, subsession_id, template_id, notes, class_id, configId } = req.body;

    if (!school_id || !template_id) {
      return res.status(400).json({ success: false, message: "school_id and template_id are required" });
    }
    if (!subsession_id) {
      return res.status(400).json({ success: false, message: "subsession_id is required" });
    }

    const planAccess = await checkAITimetableAccess(school_id);
    if (!planAccess.allowed) {
      return res.status(403).json({
        success: false,
        error: planAccess.error,
        code: planAccess.code,
        message: planAccess.message,
        plan_name: planAccess.plan_name,
      });
    }

    const config = configId
      ? await AIConfig.findOne({ config_id: configId, use: usesForFeature(USE_TIMETABLE) })
      : await getTimetableConfig();
    if (!config) {
      return res.status(404).json({ success: false, message: "AI config not found" });
    }
    if (!config.api_key?.trim()) {
      return res.status(500).json({ success: false, message: "AI config has no API key configured" });
    }

    // ── Gather context data ──────────────────────────────────────────────────
    const allClasses = await Class.find({ school_id, is_active: { $ne: false } }).lean();

    const template = await TimetableTemplate.findOne({ template_id }).lean();
    if (!template) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    const targetClasses = class_id
      ? allClasses.filter((c) => c.class_id === class_id)
      : allClasses;

    if (targetClasses.length === 0) {
      return res.status(404).json({ success: false, message: "No classes found" });
    }

    const targetClassIds = new Set(targetClasses.map((c) => c.class_id));
    const classSubjects = await ClassSubjectAssignment.find({
      class_id: { $in: [...targetClassIds] },
      is_active: { $ne: false },
    }).lean();
    const teacherSubjects = await TeacherSubjectAssignment.find({
      class_id: { $in: [...targetClassIds] },
      is_active: { $ne: false },
    }).lean();

    const subjectIds = [...new Set(classSubjects.map((cs) => cs.subject_id))];
    const teacherIds = [...new Set(teacherSubjects.map((ts) => ts.teacher_id).filter(Boolean))];

    const [allSubjects, staff] = await Promise.all([
      subjectIds.length
        ? Subject.find({ school_id, subject_id: { $in: subjectIds } }).lean()
        : [],
      teacherIds.length
        ? Staff.find({ staff_id: { $in: teacherIds } }).lean()
        : [],
    ]);

    // Load existing timetables for OTHER classes (for conflict context)
    const existingTimetables = await ClassTimetable.find({
      school_id,
      subsession_id,
      ...(class_id ? { class_id: { $ne: class_id } } : {}),
    }).lean();

    // Parse template JSON fields (stored as strings)
    const parseField = (v) => {
      if (!v || typeof v === "object") return v;
      try { return JSON.parse(v); } catch { return v; }
    };

    const selectedDays  = parseField(template.selected_days) || [];
    const dailyPeriods  = parseField(template.daily_periods) || {};
    const dailySchedule = parseField(template.daily_schedule) || {};
    const breaks        = parseField(template.breaks) || [];

    // Build per-class subject info
    const classesInfo = targetClasses.map((cls) => {
      const subjectAssignments = classSubjects.filter(
        (cs) => cs.class_id === cls.class_id
      );
      const subjects = subjectAssignments.map((cs) => {
        const subject = allSubjects.find((s) => s.subject_id === cs.subject_id);
        const teacherAssignment = teacherSubjects.find(
          (ts) => ts.subject_id === cs.subject_id && ts.class_id === cls.class_id
        );
        const teacher = teacherAssignment
          ? staff.find((s) => s.staff_id === teacherAssignment.teacher_id)
          : null;
        return {
          subject_id: cs.subject_id,
          subject_name: subject?.subject_name || "Unknown",
          subject_code: subject?.subject_code || "",
          teacher_name: teacher?.full_name || "Not assigned",
          stream: subject?.stream || "general",
        };
      });
      return {
        class_id: cls.class_id,
        class_name: cls.class_name,
        class_code: cls.class_code,
        class_type: cls.class_type,
        subjects,
      };
    });

    // ── Build the prompt ─────────────────────────────────────────────────────
    const systemPrompt = `You are a JSON timetable generator API.

OUTPUT RULES (absolute):
- Reply with ONLY one JSON object. No prose, no markdown, no code fences, no analysis.
- First character must be "{" and last character must be "}".
- Exact shape: {"timetables":[{"class_id":"...","entries":[...]}]}
- Do not write plans, reasoning, or explanations — emit the finished JSON immediately.

SCHEDULING RULES:
- Generate a complete weekly timetable for EACH class in the input.
- Every selected day must appear in entries.
- For each day, generate exactly daily_periods[day] SUBJECT periods, then insert break entries BETWEEN periods as specified (breaks do NOT count toward period count).
- Period duration = max_period_duration minutes. Stay within daily_schedule start/end for each day.
- Each period entry: id (unique int), day, start (HH:MM), end (HH:MM), name, teacher, stream, streamName, streamColor, subjects (array of OBJECTS — never strings).
- subjects item shape: {"id":"subject_id","name":"...","code":"...","teacher":"...","stream":"general|arts|science|commercial","streamName":"...","displayName":"..."}.
- Generate SUBJECT periods only. Do NOT create break/interval entries — the server inserts those from the template (after_period).
- Leave a time gap after the periods where breaks belong (e.g. after period 2 and after period 3) so a Morning/Afternoon Break fits.
- No teacher double-booked across classes at the same day+time.
- Every subject appears at least once per week per class.
- Stream colors: science=#10b981, arts=#3b82f6, commercial=#f59e0b, general=#6b7280.
- streamName: "Science Stream" | "Arts Stream" | "Commercial Stream" | "General (All Streams)".`;

    const userPrompt = `Return ONLY JSON for this request.

TEMPLATE:
- selected_days: ${JSON.stringify(selectedDays)}
- daily_periods: ${JSON.stringify(dailyPeriods)}
- daily_schedule: ${JSON.stringify(dailySchedule)}
- max_period_duration: ${template.max_period_duration}
- breaks: ${JSON.stringify(breaks)}

CLASSES:
${JSON.stringify(classesInfo)}

${existingTimetables.length > 0 ? `EXISTING_OTHER_CLASS_SLOTS (avoid conflicts):\n${JSON.stringify(summarizeExistingTimetables(existingTimetables))}\n` : ""}NOTES: ${notes || "None"}

Output: {"timetables":[{"class_id":"...","entries":[...]}]}`;

    const periodTotal = Object.values(dailyPeriods || {}).reduce(
      (sum, n) => sum + (Number(n) || 0),
      0
    ) * Math.max(1, targetClasses.length);

    const model = config.model;
    const maxTokens = estimateMaxTokens(targetClasses.length, periodTotal);

    const aiResult = await generateTimetableJson({
      apiKey: config.api_key,
      model,
      maxTokens,
      systemPrompt,
      userPrompt,
    });

    if (aiResult.error) {
      return res.status(422).json({
        success: false,
        message: aiResult.error,
        raw: aiResult.raw,
      });
    }

    const generatedTimetables = aiResult.timetables;
    const classInfoById = Object.fromEntries(classesInfo.map((c) => [c.class_id, c]));

    // ── Auto-save each timetable to MongoDB ──────────────────────────────────
    const saved = [];

    for (const item of generatedTimetables) {
      if (!item.class_id || !Array.isArray(item.entries)) continue;

      const classInfo = classInfoById[item.class_id];
      const entries = finalizeTimetableEntries(
        item.entries,
        classInfo,
        breaks,
        selectedDays
      );
      if (!entries.length) {
        console.warn(`${TAG} Skipping class ${item.class_id} — no valid entries after normalize`);
        continue;
      }

      console.log(
        `${TAG} class ${item.class_id}: ${entries.filter((e) => !e.isBreak).length} periods, ` +
          `${entries.filter((e) => e.isBreak).length} breaks`
      );

      const record = {
        class_id: item.class_id,
        subsession_id,
        school_id,
        entries,
        generated_by: "ai",
        generated_at: new Date(),
        updated_at: new Date(),
      };

      const existing = await ClassTimetable.findOne({
        class_id: item.class_id,
        subsession_id,
      });

      if (existing) {
        Object.assign(existing, record);
        await existing.save();
      } else {
        await ClassTimetable.create({
          timetable_id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          ...record,
        });
      }

      saved.push({ class_id: item.class_id, entries_count: entries.length });
    }

    if (!saved.length) {
      return res.status(422).json({
        success: false,
        message: "AI returned timetables but none had valid entries to save.",
      });
    }

    res.json({
      success: true,
      message: `Generated and saved timetables for ${saved.length} class(es)`,
      data: saved,
      entries:
        class_id && saved.length > 0
          ? finalizeTimetableEntries(
              generatedTimetables.find((t) => t.class_id === class_id)?.entries || [],
              classInfoById[class_id],
              breaks,
              selectedDays
            )
          : undefined,
    });
  } catch (err) {
    console.error("AI timetable generation error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
