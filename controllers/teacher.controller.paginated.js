const Teacher = require("../models/Teacher.model");
const Staff = require("../models/Staff.model");
const Admin = require("../models/Admin.model");

const getTeachersBySchoolIdPaginated = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "", sortBy = "appointed_at", sortOrder = "desc" } = req.query;

    console.log(`Fetching paginated teachers - School: ${schoolId}, Page: ${page}, Limit: ${limit}, Search: "${search}"`);

    const currentPage    = parseInt(page);
    const recordsPerPage = parseInt(limit);
    const sortDir        = sortOrder === "asc" ? 1 : -1;

    // Get all teachers for this school (active + inactive)
    const allTeachers = await Teacher.find({ school_id: schoolId }).sort({ [sortBy]: sortDir }).lean();

    // Batch-fetch staff and admins
    const staffIds       = [...new Set(allTeachers.map((t) => t.staff_id))];
    const appointedByIds = [...new Set(allTeachers.map((t) => t.appointed_by).filter(Boolean))];

    const [staffList, adminList] = await Promise.all([
      Staff.find({ staff_id: { $in: staffIds } }).lean(),
      Admin.find({ admin_id: { $in: appointedByIds } }).lean(),
    ]);

    const staffMap = {};
    staffList.forEach((s) => { staffMap[s.staff_id] = s; });
    const adminMap = {};
    adminList.forEach((a) => { adminMap[a.admin_id] = a; });

    let enriched = allTeachers.map((t) => {
      const s = staffMap[t.staff_id];
      const a = t.appointed_by ? adminMap[t.appointed_by] : null;
      return {
        ...t,
        staff: s || null,
        appointed_by_admin: a ? { admin_id: a.admin_id, full_name: a.username || a.full_name, email: a.email, admin_role: a.admin_role || "Admin" } : null,
      };
    });

    // Search
    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      enriched = enriched.filter((t) => {
        if (searchField && searchField.trim()) {
          // Support nested fields like "staff.full_name"
          if (searchField.includes(".")) {
            const [parent, child] = searchField.split(".");
            return String(t[parent]?.[child] || "").toLowerCase().includes(q);
          }
          return String(t[searchField] || "").toLowerCase().includes(q);
        }
        const text = [t.teacher_id, t.teacher_code, t.staff?.full_name, t.staff?.email, t.staff?.phone, t.appointed_by_admin?.full_name].filter(Boolean).join(" ").toLowerCase();
        return text.includes(q);
      });
    }

    const totalRecords = enriched.length;
    const totalPages   = Math.ceil(totalRecords / recordsPerPage);
    const startIndex   = (currentPage - 1) * recordsPerPage;
    const paged        = enriched.slice(startIndex, startIndex + recordsPerPage);

    console.log(`Returning ${paged.length} teachers (page ${currentPage} of ${totalPages})`);

    return res.json({
      success: true,
      data: paged,
      pagination: {
        currentPage, totalPages, totalRecords, recordsPerPage,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        startIndex: startIndex + 1,
        endIndex: Math.min(startIndex + recordsPerPage, totalRecords),
      },
    });
  } catch (error) {
    console.error("Get paginated teachers error:", error);
    return res.status(500).json({ success: false, error: "Get teachers failed", message: error.message || "Failed to retrieve teachers" });
  }
};

module.exports = { getTeachersBySchoolIdPaginated };
