const router = require("express").Router();
const { generateTimetables } = require("../controllers/ai_timetable.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

// POST /api/ai-timetable/generate
router.post("/generate", async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.generated_by || "system",
        req.body.school_id,
        "GENERATE_TIMETABLE",
        "Timetable",
        `AI generated timetable(s) for school ${req.body.school_id} in subsession ${req.body.subsession_id}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  generateTimetables(req, res, next);
});

module.exports = router;
