const Class = require("../models/Class.model");
const ClassHeadmaster = require("../models/ClassHeadmaster.model");
const Admission = require("../models/Admission.model");

const getClassesBySchoolIdPaginated = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 20, search = "", searchField = "", sortBy = "created_at", sortOrder = "desc" } = req.query;

    console.log(`Fetching paginated classes - School: ${schoolId}, Page: ${page}, Limit: ${limit}, Search: "${search}"`);

    // Build query
    const query = { school_id: schoolId };
    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: "i" };
      query[searchField && searchField.trim() ? searchField : "$or"] = searchField && searchField.trim()
        ? regex
        : [{ class_name: regex }, { class_code: regex }, { class_section: regex }, { class_type: regex }];
    }

    const currentPage = parseInt(page);
    const recordsPerPage = parseInt(limit);
    const sortDir = sortOrder === "asc" ? 1 : -1;

    const totalRecords = await Class.countDocuments(query);
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    const skip = (currentPage - 1) * recordsPerPage;

    const classes = await Class.find(query)
      .sort({ [sortBy]: sortDir })
      .skip(skip)
      .limit(recordsPerPage)
      .lean();

    // Batch-fetch active headmasters and admission counts
    const classIds = classes.map((c) => c.class_id);

    const [headmasters, admissionCounts] = await Promise.all([
      ClassHeadmaster.find({ class_id: { $in: classIds }, is_active: true }).lean(),
      Admission.aggregate([
        { $match: { school_id: schoolId, admission_class: { $in: classIds }, active_status: true } },
        { $group: { _id: "$admission_class", count: { $sum: 1 } } },
      ]),
    ]);

    const headmasterMap = {};
    headmasters.forEach((h) => { headmasterMap[h.class_id] = h; });

    const countMap = {};
    admissionCounts.forEach((a) => { countMap[a._id] = a.count; });

    const enriched = classes.map((c) => ({
      ...c,
      headmaster_name: headmasterMap[c.class_id]?.teacher_name || null,
      headmaster_id:   headmasterMap[c.class_id]?.teacher_id || null,
      students_count:  countMap[c.class_id] || 0,
    }));

    console.log(`Returning ${enriched.length} classes (page ${currentPage} of ${totalPages})`);

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
    console.error("Get paginated classes error:", error);
    return res.status(500).json({ success: false, error: "Get classes failed", message: error.message || "Failed to retrieve classes" });
  }
};

module.exports = { getClassesBySchoolIdPaginated };
