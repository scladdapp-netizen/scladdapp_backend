const express = require("express");
const router = express.Router();
const {
  createSubject,
  getSubjectDetail,
  getSubjectById,
  getSubjectsBySchoolId,
  updateSubject,
  deleteSubject,
  hardDeleteSubject,
} = require("../controllers/subject.controller");
const {
  getSubjectsPaginated,
} = require("../controllers/subject.controller.paginated");
const { logActivity } = require("../controllers/staff_activity.controller");

router.post("/", async (req, res) => {
  try {
    const result = await createSubject(req.body);
    if (result.success) {
      logActivity(
        req.body.created_by || "system",
        req.body.school_id,
        "CREATE_SUBJECT",
        "Subjects",
        `Created subject "${req.body.subjectName}" (${req.body.subjectCode})`,
        "success",
        "admin"
      );
    }
    res.status(result.success ? 201 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

router.get("/:subjectId/detail", async (req, res) => {
  try {
    const result = await getSubjectDetail(req.params.subjectId);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

router.get("/:subjectId", async (req, res) => {
  try {
    const result = await getSubjectById(req.params.subjectId);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

router.get("/school/:schoolId/paginated", async (req, res) => {
  try {
    const params = {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      sortBy: req.query.sortBy,
      sortOrder: req.query.sortOrder,
    };
    const result = await getSubjectsPaginated(req.params.schoolId, params);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

router.get("/school/:schoolId", async (req, res) => {
  try {
    const result = await getSubjectsBySchoolId(req.params.schoolId);
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

router.put("/:subjectId", async (req, res) => {
  try {
    const result = await updateSubject(req.params.subjectId, req.body);
    if (result.success) {
      logActivity(
        req.body.modified_by || "system",
        result.data?.school_id,
        "EDIT_SUBJECT",
        "Subjects",
        `Updated subject "${result.data?.subject_name}" (${req.params.subjectId})`,
        "success",
        "admin"
      );
    }
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

router.delete("/:subjectId/hard", async (req, res) => {
  try {
    const { readData } = require("../utils/file");
    const subjects = readData(require("path").join(__dirname, "../data/subjects.json"));
    const subject = subjects.find((s) => s.subject_id === req.params.subjectId);

    const result = await hardDeleteSubject(req.params.subjectId);
    if (result.success) {
      logActivity(
        req.body?.deleted_by || "system",
        subject?.school_id,
        "DELETE_SUBJECT",
        "Subjects",
        `Permanently deleted subject "${subject?.subject_name}" (${req.params.subjectId})`,
        "success",
        "admin"
      );
    }
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

router.delete("/:subjectId", async (req, res) => {
  try {
    const { readData } = require("../utils/file");
    const subjects = readData(require("path").join(__dirname, "../data/subjects.json"));
    const subject = subjects.find((s) => s.subject_id === req.params.subjectId);

    const result = await deleteSubject(req.params.subjectId);
    if (result.success) {
      logActivity(
        req.body?.deleted_by || "system",
        subject?.school_id,
        "DELETE_SUBJECT",
        "Subjects",
        `Deleted subject "${subject?.subject_name}" (${req.params.subjectId})`,
        "success",
        "admin"
      );
    }
    res.status(result.success ? 200 : 404).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: "Server error", message: error.message });
  }
});

module.exports = router;
