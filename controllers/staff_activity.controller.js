const StaffActivityLog = require("../models/StaffActivityLog.model");

/**
 * Internal helper — called by other controllers to log an action.
 * Non-blocking: errors are swallowed so they never break the caller.
 */
const logActivity = async (user_id, school_id, action, category, description, status = "success", staff_type = "staff") => {
  try {
    await StaffActivityLog.create({
      log_id:      Date.now().toString() + Math.random().toString(36).slice(2, 6),
      staff_type,
      user_id,
      school_id:   school_id || null,
      action,
      category,
      description,
      status,
      performed_at: new Date(),
    });
  } catch (err) {
    console.error("Failed to write activity log:", err.message);
  }
};

// Shared paginated query helper (in-memory sort/search after DB fetch)
const paginateLogs = (logs, query) => {
  const { page = 1, limit = 20, search = "", searchField = "", sortBy = "performed_at", sortOrder = "desc" } = query;

  let filtered = logs;
  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    filtered = logs.filter((l) => {
      if (searchField && searchField.trim()) return String(l[searchField] || "").toLowerCase().includes(q);
      return Object.values(l).some((v) => String(v || "").toLowerCase().includes(q));
    });
  }

  filtered.sort((a, b) => {
    const aVal = sortBy === "performed_at" ? new Date(a[sortBy]).getTime() : (a[sortBy] || "");
    const bVal = sortBy === "performed_at" ? new Date(b[sortBy]).getTime() : (b[sortBy] || "");
    return sortOrder === "asc" ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
  });

  const totalRecords   = filtered.length;
  const currentPage    = parseInt(page);
  const recordsPerPage = parseInt(limit);
  const totalPages     = Math.ceil(totalRecords / recordsPerPage) || 1;
  const startIndex     = (currentPage - 1) * recordsPerPage;
  const endIndex       = startIndex + recordsPerPage;

  return {
    data: filtered.slice(startIndex, endIndex),
    pagination: {
      currentPage, totalPages, totalRecords, recordsPerPage,
      hasNextPage: currentPage < totalPages,
      hasPrevPage: currentPage > 1,
      startIndex: totalRecords === 0 ? 0 : startIndex + 1,
      endIndex: Math.min(endIndex, totalRecords),
    },
  };
};

// GET all logs for a staff member
exports.getByStaff = async (req, res) => {
  try {
    const logs = await StaffActivityLog.find({ user_id: req.params.staffId, staff_type: "staff" })
      .sort({ performed_at: -1 }).lean();
    res.json({ success: true, data: logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET paginated logs for a staff member
exports.getByStaffPaginated = async (req, res) => {
  try {
    const logs = await StaffActivityLog.find({ user_id: req.params.staffId, staff_type: "staff" }).lean();
    res.json({ success: true, ...paginateLogs(logs, req.query) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET all logs for an admin
exports.getByAdmin = async (req, res) => {
  try {
    const logs = await StaffActivityLog.find({ user_id: req.params.adminId, staff_type: "admin" })
      .sort({ performed_at: -1 }).lean();
    res.json({ success: true, data: logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET paginated logs for an admin
exports.getByAdminPaginated = async (req, res) => {
  try {
    const logs = await StaffActivityLog.find({ user_id: req.params.adminId, staff_type: "admin" }).lean();
    res.json({ success: true, ...paginateLogs(logs, req.query) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST create a log entry manually
exports.create = async (req, res) => {
  try {
    const { user_id, staff_type, school_id, action, category, description, status } = req.body;
    if (!user_id || !action || !description) {
      return res.status(400).json({ success: false, message: "user_id, action, and description are required" });
    }
    await logActivity(user_id, school_id, action, category || "General", description, status || "success", staff_type || "staff");
    res.status(201).json({ success: true, message: "Activity logged" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE all logs for a user
exports.clearByUser = async (req, res) => {
  try {
    await StaffActivityLog.deleteMany({ user_id: req.params.userId });
    res.json({ success: true, message: "Activity logs cleared" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.clearByStaff = exports.clearByUser;
exports.logActivity  = logActivity;
