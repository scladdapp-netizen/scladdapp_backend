const StudentTraitScore = require("../models/StudentTraitScore.model");

const getTraitScore = async (studentId, subsessionId) => {
  try {
    const record = await StudentTraitScore.findOne({ student_id: studentId, subsession_id: subsessionId }).lean();
    if (!record) return { success: false, message: "Trait score not found" };
    return { success: true, data: record };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

const saveTraitScore = async (studentId, subsessionId, body) => {
  try {
    const existing = await StudentTraitScore.findOne({ student_id: studentId, subsession_id: subsessionId });

    if (existing) {
      existing.traits     = { ...existing.traits, ...body.traits };
      existing.updated_at = new Date();
      await existing.save();
      return { success: true, data: existing };
    }

    const record = await StudentTraitScore.create({
      score_id:      `TSCORE-${Date.now()}`,
      student_id:    studentId,
      student_name:  body.student_name || "",
      school_id:     body.school_id    || null,
      session_id:    body.session_id   || null,
      subsession_id: subsessionId,
      class_id:      body.class_id     || null,
      traits:        body.traits       || {},
      updated_at:    new Date(),
    });

    return { success: true, data: record };
  } catch (err) {
    return { success: false, message: err.message };
  }
};

module.exports = { getTraitScore, saveTraitScore };
