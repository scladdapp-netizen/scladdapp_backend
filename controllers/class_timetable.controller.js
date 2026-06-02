const ClassTimetable = require("../models/ClassTimetable.model");

// GET /api/class-timetable/:classId/subsession/:subsessionId
const getClassTimetable = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;
    const record = await ClassTimetable.findOne({ class_id: classId, subsession_id: subsessionId }).lean();
    return res.json({
      success: true,
      data: record || { class_id: classId, subsession_id: subsessionId, entries: [] },
    });
  } catch (error) {
    console.error("getClassTimetable error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/class-timetable/:classId/subsession/:subsessionId
const upsertClassTimetable = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;
    const { school_id, entries } = req.body;

    if (!Array.isArray(entries)) {
      return res.status(400).json({ success: false, message: "entries must be an array" });
    }

    const existing = await ClassTimetable.findOne({ class_id: classId, subsession_id: subsessionId });

    if (existing) {
      if (school_id) existing.school_id = school_id;
      existing.entries    = entries;
      existing.updated_at = new Date();
      await existing.save();
      return res.json({ success: true, data: existing });
    }

    const created = await ClassTimetable.create({
      timetable_id:  Date.now().toString(),
      class_id:      classId,
      subsession_id: subsessionId,
      school_id:     school_id || null,
      entries,
      updated_at:    new Date(),
    });

    return res.json({ success: true, data: created });
  } catch (error) {
    console.error("upsertClassTimetable error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/class-timetable/:classId/subsession/:subsessionId
const deleteClassTimetable = async (req, res) => {
  try {
    const { classId, subsessionId } = req.params;
    const deleted = await ClassTimetable.findOneAndDelete({ class_id: classId, subsession_id: subsessionId });
    if (!deleted) return res.status(404).json({ success: false, message: "Timetable not found" });
    return res.json({ success: true, message: "Timetable deleted" });
  } catch (error) {
    console.error("deleteClassTimetable error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getClassTimetable, upsertClassTimetable, deleteClassTimetable };
