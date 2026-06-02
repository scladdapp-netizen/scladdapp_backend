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
        `Saved timetable for class ${req.params.classId} in subsession ${req.params.subsessionId}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  upsertClassTimetable(req, res, next);
});

router.delete("/:classId/subsession/:subsessionId", (req, res, next) => {
  const { readData } = require("../utils/file");
  const path = require("path");
  const timetables = readData(path.join(__dirname, "../data/class_timetables.json"));
  const record = timetables.find(
    (t) => t.class_id === req.params.classId && t.subsession_id === req.params.subsessionId
  );

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        record?.school_id,
        "DELETE_TIMETABLE",
        "Timetable",
        `Deleted timetable for class ${req.params.classId} in subsession ${req.params.subsessionId}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  deleteClassTimetable(req, res, next);
});

module.exports = router;
