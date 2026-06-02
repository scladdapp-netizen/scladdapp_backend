const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const adminController = require("../controllers/admin.controller");
const {
  getAdminsBySchoolIdPaginated,
} = require("../controllers/admin.controller.paginated");
const User  = require("../models/User.model");
const Admin = require("../models/Admin.model");

// ── Security: Change Password ─────────────────────────────────────────────
router.post("/:adminId/change-password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: "currentPassword and newPassword are required" });

    const admin = await Admin.findOne({ admin_id: req.params.adminId });
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    const user = await User.findOne({ reference_id: req.params.adminId, user_type: "admin" });
    if (!user) return res.status(404).json({ success: false, message: "User account not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ success: false, message: "Current password is incorrect" });

    if (newPassword.length < 8)
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Security: Toggle 2FA ──────────────────────────────────────────────────
router.patch("/:adminId/two-fac-auth", async (req, res) => {
  try {
    const { enabled } = req.body;
    const admin = await Admin.findOne({ admin_id: req.params.adminId });
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    admin.two_fac_auth = !!enabled;
    admin.updated_at = new Date();
    await admin.save();

    res.json({ success: true, message: `2FA ${enabled ? "enabled" : "disabled"}`, data: { two_fac_auth: admin.two_fac_auth } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create admin from staff promotion
router.post("/create-from-staff", adminController.createFromStaff);

// Get all admins for a school with pagination (NEW - server-side pagination)
router.get("/school/:schoolId/paginated", getAdminsBySchoolIdPaginated);

// Get all admins for a school (OLD - returns all admins)
router.get("/school/:schoolId", adminController.getAdminsBySchool);

// Get admin by staff ID
router.get("/staff/:staffId", adminController.getAdminByStaffId);

// Get admin by ID with staff details
router.get("/:adminId/detail", adminController.getAdminDetail);

// Get admin by ID
router.get("/:adminId", adminController.getAdminById);

// Update admin
router.put("/:adminId", adminController.updateAdmin);

// Delete admin
router.delete("/:adminId", adminController.deleteAdmin);

// Deactivate admin (soft delete)
router.patch("/:adminId/deactivate", adminController.deactivateAdmin);

module.exports = router;
