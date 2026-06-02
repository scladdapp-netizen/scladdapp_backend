const Admin = require("../models/Admin.model");
const Staff = require("../models/Staff.model");
const Session = require("../models/Session.model");
const Subsession = require("../models/Subsession.model");
const { checkSubAdminLimit } = require("../utils/planLimitCheck");

// Create admin from staff promotion
exports.createFromStaff = async (req, res) => {
  try {
    const {
      staff_id,
      school_id,
      username,
      email,
      password,
      admin_role,
      access_scope,
      permissions,
      is_active,
      assigned_by,
      two_fac_auth,
    } = req.body;

    if (!staff_id || !school_id || !email || !admin_role) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const staffMember = await Staff.findOne({ staff_id });
    if (!staffMember) {
      return res.status(404).json({ success: false, message: "Staff member not found" });
    }

    const existingAdmin = await Admin.findOne({ staff_id });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: "This staff member is already an administrator" });
    }

    const subAdminLimit = await checkSubAdminLimit(school_id);
    if (!subAdminLimit.allowed) {
      return res.status(403).json({ success: false, message: subAdminLimit.message, limitType: "subadmin" });
    }

    const newAdmin = await Admin.create({
      admin_id: Date.now().toString(),
      staff_id,
      school_id,
      username: username || staffMember.full_name,
      email,
      password: password || "ChangeMe@123",
      admin_role,
      access_scope: access_scope || "limited",
      permissions: permissions || {},
      is_active: is_active !== undefined ? is_active : true,
      assigned_by: assigned_by || null,
      assigned_at: new Date(),
      revoked_at: null,
      two_fac_auth: two_fac_auth || false,
    });

    res.status(201).json({
      success: true,
      message: "Staff member promoted to administrator successfully",
      data: newAdmin,
    });
  } catch (error) {
    console.error("Error creating admin from staff:", error);
    res.status(500).json({ success: false, message: "Failed to create administrator", error: error.message });
  }
};

// Get all admins for a school
exports.getAdminsBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const admins = await Admin.find({ school_id: schoolId }).lean();
    res.json({ success: true, data: admins });
  } catch (error) {
    console.error("Error fetching admins:", error);
    res.status(500).json({ success: false, message: "Failed to fetch administrators", error: error.message });
  }
};

// Get admin by ID with staff details and sessions
exports.getAdminDetail = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await Admin.findOne({ admin_id: adminId }).lean();
    if (!admin) {
      return res.status(404).json({ success: false, message: "Administrator not found" });
    }

    let staffDetails = null;
    if (admin.staff_id) {
      staffDetails = await Staff.findOne({ staff_id: admin.staff_id }).lean();
    }

    const adminCreatedDate = new Date(admin.created_at);
    adminCreatedDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get non-archived sessions for this school that have started
    const allSessions = await Session.find({
      school_id: admin.school_id,
      is_archived: { $ne: true },
      session_status: { $ne: "archived" },
      academic_year_start_date: { $lte: today.toISOString().split("T")[0] },
      academic_year_end_date: { $gte: adminCreatedDate.toISOString().split("T")[0] },
    }).lean();

    const validSessions = [];

    for (const session of allSessions) {
      const subsessions = await Subsession.find({
        session_id: session.session_id,
        term_end_date: { $gte: adminCreatedDate.toISOString().split("T")[0] },
      }).lean();

      if (subsessions.length === 0) continue;

      validSessions.push({
        session_id: session.session_id,
        session_name: session.session_name,
        subsessions: subsessions.map((sub) => ({
          subsession_id: sub.term_id,
          subsession_name: sub.term_name,
        })),
      });
    }

    console.log(`Found ${validSessions.length} sessions for admin ${admin.username}`);

    res.json({
      success: true,
      data: { admin, staff: staffDetails, sessions: validSessions },
    });
  } catch (error) {
    console.error("Error fetching admin detail:", error);
    res.status(500).json({ success: false, message: "Failed to fetch administrator details", error: error.message });
  }
};

// Get admin by ID
exports.getAdminById = async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await Admin.findOne({ admin_id: adminId }).lean();
    if (!admin) {
      return res.status(404).json({ success: false, message: "Administrator not found" });
    }
    res.json({ success: true, data: admin });
  } catch (error) {
    console.error("Error fetching admin:", error);
    res.status(500).json({ success: false, message: "Failed to fetch administrator", error: error.message });
  }
};

// Update admin
exports.updateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const updates = req.body;

    const admin = await Admin.findOne({ admin_id: adminId });
    if (!admin) {
      return res.status(404).json({ success: false, message: "Administrator not found" });
    }

    // Prevent ID change
    delete updates.admin_id;

    // Handle revoked_at based on is_active
    if (updates.is_active === false && !admin.revoked_at) {
      updates.revoked_at = new Date();
    } else if (updates.is_active === true) {
      updates.revoked_at = null;
    }

    updates.updated_at = new Date();

    Object.assign(admin, updates);
    await admin.save();

    res.json({ success: true, message: "Administrator updated successfully", data: admin });
  } catch (error) {
    console.error("Error updating admin:", error);
    res.status(500).json({ success: false, message: "Failed to update administrator", error: error.message });
  }
};

// Delete admin
exports.deleteAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await Admin.findOneAndDelete({ admin_id: adminId }).lean();
    if (!admin) {
      return res.status(404).json({ success: false, message: "Administrator not found" });
    }
    res.json({ success: true, message: "Administrator deleted successfully", data: admin });
  } catch (error) {
    console.error("Error deleting admin:", error);
    res.status(500).json({ success: false, message: "Failed to delete administrator", error: error.message });
  }
};

// Get admin by staff ID
exports.getAdminByStaffId = async (req, res) => {
  try {
    const { staffId } = req.params;
    const admin = await Admin.findOne({ staff_id: staffId }).lean();
    if (!admin) {
      return res.status(404).json({ success: false, message: "No admin assignment found for this staff member" });
    }
    res.json({ success: true, data: admin });
  } catch (error) {
    console.error("Error fetching admin by staff ID:", error);
    res.status(500).json({ success: false, message: "Failed to fetch admin assignment", error: error.message });
  }
};

// Deactivate admin (soft delete)
exports.deactivateAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await Admin.findOne({ admin_id: adminId });
    if (!admin) {
      return res.status(404).json({ success: false, message: "Administrator not found" });
    }

    admin.is_active = false;
    admin.revoked_at = new Date();
    admin.updated_at = new Date();
    await admin.save();

    res.json({ success: true, message: "Administrator deactivated successfully", data: admin });
  } catch (error) {
    console.error("Error deactivating admin:", error);
    res.status(500).json({ success: false, message: "Failed to deactivate administrator", error: error.message });
  }
};
