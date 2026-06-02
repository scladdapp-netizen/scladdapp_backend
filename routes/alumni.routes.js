const express = require("express");
const router = express.Router();
const {
  getAlumniBySessionId,
  getAlumniBySchoolId,
  getAlumniBySchoolIdPaginated,
  getAlumniById,
  getAlumniByStudentId,
  createAlumni,
  updateAlumni,
} = require("../controllers/alumni.controller");

// POST /api/alumni — create alumni manually
router.post("/", async (req, res) => {
  const result = await createAlumni(req.body);
  if (result.success) {
    logActivity(
      req.body.created_by || "system",
      req.body.school_id,
      "CREATE_ALUMNI",
      "Graduate",
      `Added alumni record for student ${req.body.student_id}`,
      "success",
      "admin"
    );
  }
  res.status(result.success ? 201 : 400).json(result);
});
const { logActivity } = require("../controllers/staff_activity.controller");

// GET /api/alumni/school/:schoolId/paginated
router.get("/school/:schoolId/paginated", async (req, res) => {
  const { schoolId } = req.params;
  const result = await getAlumniBySchoolIdPaginated(schoolId, req.query);
  res.status(result.success ? 200 : 500).json(result);
});

// GET /api/alumni/session/:sessionId — paginated alumni for a session
router.get("/session/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const result = await getAlumniBySessionId(sessionId, req.query);
  res.status(result.success ? 200 : 500).json(result);
});

// GET /api/alumni/school/:schoolId — all alumni for a school
router.get("/school/:schoolId", async (req, res) => {
  const { schoolId } = req.params;
  const result = await getAlumniBySchoolId(schoolId);
  res.status(result.success ? 200 : 500).json(result);
});

// GET /api/alumni/student/:studentId — alumni record for a specific student
router.get("/student/:studentId", async (req, res) => {
  const result = await getAlumniByStudentId(req.params.studentId);
  res.status(result.success ? 200 : 404).json(result);
});

// GET /api/alumni/:alumniId — single alumni record
router.get("/:alumniId", async (req, res) => {
  const { alumniId } = req.params;
  const result = await getAlumniById(alumniId);
  res.status(result.success ? 200 : 404).json(result);
});

// PUT /api/alumni/:alumniId — update alumni record
router.put("/:alumniId", async (req, res) => {
  const { alumniId } = req.params;
  const result = await updateAlumni(alumniId, req.body);
  if (result.success) {
    logActivity(
      req.body.modified_by || "system",
      result.data?.alumni?.school_id,
      "EDIT_ALUMNI",
      "Graduate",
      `Updated alumni profile for student ${result.data?.alumni?.student_id}`,
      "success",
      "admin"
    );
  }
  res.status(result.success ? 200 : 404).json(result);
});

module.exports = router;
