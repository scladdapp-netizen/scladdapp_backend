const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/staff_activity.controller");

// Staff routes
router.get("/staff/:staffId/paginated", ctrl.getByStaffPaginated);
router.get("/staff/:staffId", ctrl.getByStaff);

// Admin routes
router.get("/admin/:adminId/paginated", ctrl.getByAdminPaginated);
router.get("/admin/:adminId", ctrl.getByAdmin);

// POST create a log entry
router.post("/", ctrl.create);

// DELETE all logs for a user
router.delete("/:userId", ctrl.clearByUser);

module.exports = router;
