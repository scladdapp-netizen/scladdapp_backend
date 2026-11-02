const ClassTimetable = require("../models/ClassTimetable.model");

function makeTimetableId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 6);
}

function displayName(doc, index) {
  const name = String(doc?.name || "").trim();
  if (name) return name;
  return index === 0 ? "Timetable" : `Timetable ${index + 1}`;
}

function present(doc, index) {
  const plain = doc?.toObject ? doc.toObject() : { ...doc };
  return {
    ...plain,
    name: displayName(plain, index),
    entries: plain.entries || [],
  };
}

async function listForClass(classId, subsessionId) {
  const records = await ClassTimetable.find({ class_id: classId, subsession_id: subsessionId })
    .sort({ created_at: 1 })
    .lean();
  return records.map(present);
}

// GET /api/class-timetable/:classId/subsession/:subsessionId
const getClassTimetable = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;
    const timetables = await listForClass(classId, subsessionId);
    const first = timetables[0];
    return res.json({
      success: true,
      data: {
        class_id: classId,
        subsession_id: subsessionId,
        timetable_id: first?.timetable_id || null,
        name: first?.name || null,
        entries: first?.entries || [],
        timetables,
      },
    });
  } catch (error) {
    console.error("getClassTimetable error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

async function saveClassTimetableRecord({
  class_id,
  subsession_id,
  school_id,
  entries,
  timetable_id,
  name,
  generated_by,
}) {
  const now = new Date();
  const trimmedName = String(name || "").trim();

  if (timetable_id) {
    const existing = await ClassTimetable.findOne({ timetable_id, class_id, subsession_id });
    if (existing) {
      if (school_id) existing.school_id = school_id;
      existing.entries = entries;
      if (trimmedName) existing.name = trimmedName;
      if (generated_by) {
        existing.generated_by = generated_by;
        existing.generated_at = now;
      }
      existing.updated_at = now;
      await existing.save();
      const siblings = await listForClass(class_id, subsession_id);
      const index = Math.max(0, siblings.findIndex((item) => item.timetable_id === existing.timetable_id));
      return present(existing, index);
    }
  }

  const count = await ClassTimetable.countDocuments({ class_id, subsession_id });
  const autoName = generated_by === "ai"
    ? (count === 0 ? "AI timetable" : `AI timetable ${count + 1}`)
    : (count === 0 ? "Timetable" : `Timetable ${count + 1}`);

  const created = await ClassTimetable.create({
    timetable_id: makeTimetableId(),
    name: trimmedName || autoName,
    class_id,
    subsession_id,
    school_id: school_id || null,
    entries,
    generated_by: generated_by || null,
    generated_at: generated_by ? now : null,
    updated_at: now,
  });

  return present(created, count);
}

// PUT /api/class-timetable/:classId/subsession/:subsessionId
// Updates timetable_id when one is sent. Otherwise creates another timetable
// for the same class and term.
const upsertClassTimetable = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;
    const { school_id, entries, timetable_id, name } = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({ success: false, message: "entries must be an array" });
    }

    const saved = await saveClassTimetableRecord({
      class_id: classId,
      subsession_id: subsessionId,
      school_id,
      entries,
      timetable_id,
      name,
    });

    return res.json({ success: true, data: saved });
  } catch (error) {
    console.error("upsertClassTimetable error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/class-timetable/:classId/subsession/:subsessionId/:timetableId
const deleteClassTimetable = async (req, res) => {
  try {
    const { classId, subsessionId, timetableId } = req.params;
    if (!timetableId) {
      return res.status(400).json({ success: false, message: "timetable id is required" });
    }
    const deleted = await ClassTimetable.findOneAndDelete({
      timetable_id: timetableId,
      class_id: classId,
      subsession_id: subsessionId,
    });
    if (!deleted) return res.status(404).json({ success: false, message: "Timetable not found" });
    return res.json({ success: true, message: "Timetable deleted", data: present(deleted, 0) });
  } catch (error) {
    console.error("deleteClassTimetable error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getClassTimetable,
  upsertClassTimetable,
  deleteClassTimetable,
  saveClassTimetableRecord,
};
