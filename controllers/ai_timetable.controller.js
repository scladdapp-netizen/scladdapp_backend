const Class = require("../models/Class.model");
const Subject = require("../models/Subject.model");
const ClassSubjectAssignment = require("../models/ClassSubjectAssignment.model");
const TeacherSubjectAssignment = require("../models/TeacherSubjectAssignment.model");
const Staff = require("../models/Staff.model");
const TimetableTemplate = require("../models/TimetableTemplate.model");
const ClassTimetable = require("../models/ClassTimetable.model");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-4o-mini";

/**
 * POST /api/ai-timetable/generate
 * Body: { school_id, subsession_id, template_id, notes, class_id? }
 *
 * Generates timetables for ALL classes (or a single class) in the school
 * for the given subsession using AI, then auto-saves each one to MongoDB.
 */
exports.generateTimetables = async (req, res) => {
  try {
    const { school_id, subsession_id, template_id, notes, class_id } = req.body;

    if (!school_id || !template_id) {
      return res.status(400).json({ success: false, message: "school_id and template_id are required" });
    }
    if (!subsession_id) {
      return res.status(400).json({ success: false, message: "subsession_id is required" });
    }
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === "your_openrouter_api_key_here") {
      return res.status(500).json({ success: false, message: "OPENROUTER_API_KEY is not configured in .env" });
    }

    // ── Gather context data ──────────────────────────────────────────────────
    const allClasses = await Class.find({ school_id, is_active: { $ne: false } }).lean();
    const allSubjects = await Subject.find({}).lean();
    const classSubjects = await ClassSubjectAssignment.find({ is_active: { $ne: false } }).lean();
    const teacherSubjects = await TeacherSubjectAssignment.find({ is_active: { $ne: false } }).lean();
    const staff = await Staff.find({}).lean();

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
    const systemPrompt = `You are a school timetable scheduling AI.
You will receive school class data, subject assignments, and a timetable template.
You must generate a complete weekly timetable for EACH class.

STRICT OUTPUT RULES:
- Respond with ONLY a valid JSON array. No markdown, no explanation, no code blocks.
- Each element in the array represents one class timetable with "class_id" and "entries".
- CRITICAL: Generate entries for EVERY day listed in selected_days. If selected_days has 5 days, each class must have entries for all 5 days.
- For each day, generate exactly the number of periods specified in daily_periods for that day.
- Each period entry must have: id (unique integer), day (exact day name), start (HH:MM), end (HH:MM), name (subject name), teacher (teacher name), stream, streamName, streamColor, subjects (array with one subject object).
- Insert breaks as specified: a break entry with name equal to the break name, no subjects array needed.
- CRITICAL: Breaks are NOT counted as periods. If daily_periods says 4, generate exactly 4 subject periods PLUS the breaks inserted between them. The break is extra, not a replacement for a period.
- Example: 4 periods with a break after period 2 = period1, period2, BREAK, period3, period4 (5 entries total for that day).
- Respect daily_schedule start/end times for each day.
- Period duration = max_period_duration minutes.
- Do not schedule the same teacher in two different classes at the exact same time slot.
- Do not schedule the same subject in two different classes at the same day and time slot.
- Each class must have its own unique schedule — no two classes should have the same subject at the same time.
- Distribute subjects evenly across all days of the week.
- Every subject must appear at least once per week per class.
- STREAMS: Some subjects belong to a specific stream (science, arts, commercial, general). A single time slot can contain MULTIPLE subjects if they are for different streams. In that case, set name to "X Subjects" (e.g. "3 Subjects"), teacher to "Multiple Teachers", stream to "general", and populate the subjects array with all stream-specific subjects for that slot.
- If all subjects in a slot are the same stream, use that stream's color: science=#10b981, arts=#3b82f6, commercial=#f59e0b, general=#6b7280.
- streamName values: "Science Stream", "Arts Stream", "Commercial Stream", "General (All Streams)".`;

    const userPrompt = `Generate a FULL WEEKLY timetable for each class below.

TEMPLATE (use these exact days and period counts):
- Selected days: ${JSON.stringify(selectedDays)}
- Periods per day: ${JSON.stringify(dailyPeriods)}
- Daily schedule (start/end times per day): ${JSON.stringify(dailySchedule)}
- Max period duration: ${template.max_period_duration} minutes
- Breaks: ${JSON.stringify(breaks)}

CLASSES AND THEIR SUBJECTS:
${JSON.stringify(classesInfo, null, 2)}

${existingTimetables.length > 0 ? `EXISTING TIMETABLES FOR OTHER CLASSES (do NOT schedule the same subject or teacher at the same day+time as any of these):
${JSON.stringify(existingTimetables.map((t) => ({
  class_id: t.class_id,
  entries: t.entries.map((e) => ({
    day: e.day,
    start: e.start,
    end: e.end,
    subjects: (e.subjects || []).map((s) => ({ name: s.name, teacher: s.teacher })),
  })),
})), null, 2)}

` : ""}ADDITIONAL INSTRUCTIONS:
${notes || "None"}

REMINDER: Each class MUST have entries for ALL ${selectedDays.length} days: ${selectedDays.join(", ")}.

Return ONLY a JSON array:
[
  {
    "class_id": "class_id_here",
    "entries": [
      { "id": 1, "day": "Monday", "start": "08:00", "end": "08:40", "name": "Mathematics", "teacher": "Mr. Smith", "stream": "general", "streamName": "General (All Streams)", "streamColor": "#6b7280", "subjects": [{ "id": "subj_id", "name": "Mathematics", "code": "MATH", "teacher": "Mr. Smith", "stream": "general", "streamName": "General (All Streams)", "displayName": "Mathematics (General)" }] },
      ...
    ]
  }
]`;

    // ── First AI call ────────────────────────────────────────────────────────
    const firstResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        reasoning: { enabled: true },
      }),
    });

    const firstResult = await firstResponse.json();
    if (!firstResponse.ok) {
      return res.status(502).json({ success: false, message: firstResult.error?.message || "AI API error" });
    }

    const assistantMessage = firstResult.choices[0].message;

    // ── Second AI call — verify and confirm ──────────────────────────────────
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
      {
        role: "assistant",
        content: assistantMessage.content,
        reasoning_details: assistantMessage.reasoning_details,
      },
      {
        role: "user",
        content: `Review your timetable carefully. Verify that:
1. EVERY class has entries for ALL ${selectedDays.length} days: ${selectedDays.join(", ")}
2. Each day has EXACTLY the correct number of SUBJECT periods as specified in daily_periods — breaks do NOT count as periods
3. Breaks are inserted between periods (extra entries), not replacing any period
4. No teacher is double-booked at the same time across classes
5. No subject is scheduled in two different classes at the same day and time slot
6. Each class has a unique schedule
7. All subjects appear at least once per week
8. The JSON is valid with no trailing commas

Output the final corrected complete JSON array only. No explanation.`,
      },
    ];

    const secondResponse = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, messages }),
    });

    const secondResult = await secondResponse.json();
    if (!secondResponse.ok) {
      return res.status(502).json({ success: false, message: secondResult.error?.message || "AI verification error" });
    }

    const rawContent = secondResult.choices[0].message.content.trim();

    // ── Parse AI output ──────────────────────────────────────────────────────
    let generatedTimetables;
    try {
      const cleaned = rawContent.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      generatedTimetables = JSON.parse(cleaned);
    } catch {
      return res.status(422).json({ success: false, message: "AI returned invalid JSON", raw: rawContent.slice(0, 500) });
    }

    if (!Array.isArray(generatedTimetables)) {
      return res.status(422).json({ success: false, message: "AI output is not an array" });
    }

    // ── Auto-save each timetable to MongoDB ──────────────────────────────────
    const saved = [];

    for (const item of generatedTimetables) {
      if (!item.class_id || !Array.isArray(item.entries)) continue;

      const record = {
        class_id: item.class_id,
        subsession_id,
        school_id,
        entries: item.entries,
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

      saved.push({ class_id: item.class_id, entries_count: item.entries.length });
    }

    res.json({
      success: true,
      message: `Generated and saved timetables for ${saved.length} class(es)`,
      data: saved,
      entries:
        class_id && saved.length > 0
          ? generatedTimetables.find((t) => t.class_id === class_id)?.entries || []
          : undefined,
    });
  } catch (err) {
    console.error("AI timetable generation error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
