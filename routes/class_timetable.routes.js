const express = require("express");
const router = express.Router();
const {
  getClassTimetable,
  upsertClassTimetable,
  deleteClassTimetable,
} = require("../controllers/class_timetable.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

router.get("/:classId/subsession/:subsessionId", getClassTimetable);

router.put("/:classId/subsession/:subsessionId", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.modified_by || "system",
        body.data?.school_id,
        "SAVE_TIMETABLE",
        "Timetable",
        `Saved timetable${req.body?.name ? ` "${req.body.name}"` : ""} for class ${req.params.classId} in subsession ${req.params.subsessionId}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  upsertClassTimetable(req, res, next);
});

router.delete("/:classId/subsession/:subsessionId/:timetableId", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        body.data?.school_id,
        "DELETE_TIMETABLE",
        "Timetable",
        `Deleted timetable "${body.data?.name || req.params.timetableId}" for class ${req.params.classId} in subsession ${req.params.subsessionId}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  deleteClassTimetable(req, res, next);
});

module.exports = router;
