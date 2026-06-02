const Admin = require("../models/Admin.model");
const Staff = require("../models/Staff.model");

// Get admins by school ID with server-side pagination
const getAdminsBySchoolIdPaginated = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const {
      page = 1,
      limit = 20,
      search = "",
      searchField = "",
      sortBy = "created_at",
      sortOrder = "desc",
    } = req.query;

    console.log(`Fetching paginated admins - School: ${schoolId}, Page: ${page}, Limit: ${limit}, Search: "${search}"`);

    // Step 1: Build query
    const query = { school_id: schoolId };

    if (search && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: "i" };
      if (searchField && searchField.trim()) {
        query[searchField] = searchRegex;
      } else {
        query.$or = [
          { username: searchRegex },
          { email: searchRegex },
          { admin_role: searchRegex },
          { admin_id: searchRegex },
        ];
      }
    }

    // Step 2: Sort
    const sortDir = sortOrder === "asc" ? 1 : -1;
    const sortObj = { [sortBy]: sortDir };

    // Step 3: Count total
    const totalRecords = await Admin.countDocuments(query);

    // Step 4: Paginate
    const currentPage = parseInt(page);
    const recordsPerPage = parseInt(limit);
    const skip = (currentPage - 1) * recordsPerPage;
    const totalPages = Math.ceil(totalRecords / recordsPerPage);

    const admins = await Admin.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(recordsPerPage)
      .lean();

    // Step 5: Enrich with staff info
    const staffIds = admins.filter((a) => a.staff_id).map((a) => a.staff_id);
    const staffMap = {};
    if (staffIds.length > 0) {
      const staffList = await Staff.find({ staff_id: { $in: staffIds } }).lean();
      staffList.forEach((s) => { staffMap[s.staff_id] = s; });
    }

    const enriched = admins.map((admin) => {
      if (admin.staff_id && staffMap[admin.staff_id]) {
        const s = staffMap[admin.staff_id];
        return {
          ...admin,
          full_name: s.full_name,
          phone: s.phone,
          department: s.department,
          position: s.position,
          staff_photo: s.staff_photo,
        };
      }
      return {
        ...admin,
        full_name: admin.username || "N/A",
        phone: "N/A",
        department: "N/A",
        position: admin.admin_role,
        staff_photo: null,
      };
    });

    console.log(`Returning ${enriched.length} admins (page ${currentPage} of ${totalPages})`);

    return res.json({
      success: true,
      data: enriched,
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
    console.error("Get paginated admins error:", error);
    return res.status(500).json({
      success: false,
      error: "Get admins failed",
      message: error.message || "Failed to retrieve admins",
    });
  }
};

module.exports = { getAdminsBySchoolIdPaginated };
