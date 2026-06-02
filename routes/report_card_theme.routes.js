const express = require("express");
const router  = express.Router();
const ctrl    = require("../controllers/report_card_theme.controller");

// GET all themes — optional ?school_id= to filter school + global
router.get("/", async (req, res) => {
  const result = await ctrl.getAllThemes(req.query.school_id || null);
  res.status(result.success ? 200 : 400).json(result);
});

// GET single theme
router.get("/:theme_id", async (req, res) => {
  const result = await ctrl.getThemeById(req.params.theme_id);
  res.status(result.success ? 200 : 404).json(result);
});

// POST create theme
router.post("/", async (req, res) => {
  const result = await ctrl.createTheme(req.body);
  res.status(result.success ? 201 : 400).json(result);
});

// PATCH update theme
router.patch("/:theme_id", async (req, res) => {
  const result = await ctrl.updateTheme(req.params.theme_id, req.body);
  res.status(result.success ? 200 : 404).json(result);
});

// DELETE theme
router.delete("/:theme_id", async (req, res) => {
  const result = await ctrl.deleteTheme(req.params.theme_id);
  res.status(result.success ? 200 : 404).json(result);
});

module.exports = router;
