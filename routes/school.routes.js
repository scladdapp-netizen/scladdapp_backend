const router = require("express").Router();
const multer = require("multer");
const ctrl = require("../controllers/school.controller");
const { uploadToCloudinary } = require("../utils/cloudinary");
const School = require("../models/School.model");

const upload = multer({ storage: multer.memoryStorage() });

// Dashboard data
router.get("/:schoolId/stats",               ctrl.getStats);
router.get("/:schoolId/attendance/today",    ctrl.getTodayAttendance);
router.get("/:schoolId/fee-payments",        ctrl.getFeePayments);
router.get("/:schoolId/gender-distribution", ctrl.getGenderDistribution);
router.get("/:schoolId/enrollment-trend",    ctrl.getEnrollmentTrend);
router.get("/:schoolId/recent-activities",   ctrl.getRecentActivities);
router.get("/:schoolId/monthly-financials",  ctrl.getMonthlyFinancials);
router.get("/:schoolId/search",              ctrl.search);

// School profile
router.get("/:schoolId/profile", ctrl.getProfile);

router.patch("/:schoolId/profile", upload.single("school_logo"), async (req, res, next) => {
  try {
    if (req.file) {
      const { url } = await uploadToCloudinary(req.file.buffer, "scladapp/school_logos", "image");
      await School.updateOne({ school_id: req.params.schoolId }, { $set: { logo_url: url } });
    }
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}, ctrl.updateProfile);

// School bio
router.get("/:schoolId/bio",   ctrl.getBio);
router.patch("/:schoolId/bio", ctrl.updateBio);

module.exports = router;
