const Staff = require("../models/Staff.model");

const getStaffBySchoolIdPaginated = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "", sortBy = "created_at", sortOrder = "desc" } = req.query;

    const query = { school_id: schoolId };
    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: "i" };
      query[searchField && searchField.trim() ? searchField : "$or"] = searchField && searchField.trim()
        ? regex
        : [{ full_name: regex }, { email: regex }, { position: regex }, { department: regex }, { staff_id: regex }];
    }

    const currentPage    = parseInt(page);
    const recordsPerPage = parseInt(limit);
    const sortDir        = sortOrder === "asc" ? 1 : -1;
    const skip           = (currentPage - 1) * recordsPerPage;

    const [totalRecords, staff] = await Promise.all([
      Staff.countDocuments(query),
      Staff.find(query).sort({ [sortBy]: sortDir }).skip(skip).limit(recordsPerPage).lean(),
    ]);

    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    console.log(`Returning ${staff.length} staff members (page ${currentPage} of ${totalPages})`);

    return res.json({
      success: true,
      data: staff,
      pagination: {
        currentPage,
        totalPages,
        totalRecords,
        recordsPerPage,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        startIndex: skip + 1,
        endIndex: Math.min(skip + recordsPerPage, totalRecords),
      },
    });
  } catch (error) {
    console.error("Get paginated staff error:", error);
    return res.status(500).json({ success: false, error: "Get staff failed", message: error.message || "Failed to retrieve staff members" });
  }
};

module.exports = { getStaffBySchoolIdPaginated };
