const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/student_trait_score.controller");

// GET trait score for student in subsession
router.get("/student/:studentId/subsession/:subsessionId", async (req, res) => {
  const result = await ctrl.getTraitScore(req.params.studentId, req.params.subsessionId);
  res.status(result.success ? 200 : 404).json(result);
});

// POST/PUT — create or update trait score
router.post("/student/:studentId/subsession/:subsessionId", async (req, res) => {
  const result = await ctrl.saveTraitScore(req.params.studentId, req.params.subsessionId, req.body);
  res.status(result.success ? 200 : 400).json(result);
});

module.exports = router;
