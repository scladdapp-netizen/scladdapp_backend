const StaffPerformance = require("../models/StaffPerformance.model");

exports.getByStaff = async (req, res) => {
  try {
    const data = await StaffPerformance.find({ staff_id: req.params.staffId })
      .sort({ created_at: -1 }).lean();
    res.json({ success: true, data, count: data.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getByStaffPaginated = async (req, res) => {
  try {
    const { staffId } = req.params;
    const { page = 1, limit = 10, search = "", searchField = "", sortBy = "created_at", sortOrder = "desc" } = req.query;

    const query = { staff_id: staffId };
    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: "i" };
      query[searchField && searchField.trim() ? searchField : "$or"] = searchField && searchField.trim()
        ? regex
        : [{ evaluation_type: regex }, { evaluation_period: regex }, { evaluator: regex }, { status: regex }, { overall_rating: regex }];
    }

    const currentPage    = parseInt(page);
    const recordsPerPage = parseInt(limit);
    const skip           = (currentPage - 1) * recordsPerPage;
    const sortDir        = sortOrder === "asc" ? 1 : -1;

    const [totalRecords, data] = await Promise.all([
      StaffPerformance.countDocuments(query),
      StaffPerformance.find(query).sort({ [sortBy]: sortDir }).skip(skip).limit(recordsPerPage).lean(),
    ]);

    const totalPages = Math.ceil(totalRecords / recordsPerPage) || 1;
    res.json({
      success: true, data,
      pagination: {
        currentPage, totalPages, totalRecords, recordsPerPage,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1,
        startIndex: totalRecords === 0 ? 0 : skip + 1,
        endIndex: Math.min(skip + recordsPerPage, totalRecords),
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const record = await StaffPerformance.findOne({ evaluation_id: req.params.id }).lean();
    if (!record) return res.status(404).json({ success: false, message: "Evaluation not found" });
    res.json({ success: true, data: record });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { staff_id, evaluation_type, evaluator, evaluation_date } = req.body;
    if (!staff_id || !evaluation_type || !evaluator || !evaluation_date) {
      return res.status(400).json({ success: false, message: "staff_id, evaluation_type, evaluator, and evaluation_date are required" });
    }
    const record = await StaffPerformance.create({
      evaluation_id:         Date.now().toString(),
      staff_id,
      school_id:             req.body.school_id || null,
      evaluation_type,
      evaluation_period:     req.body.evaluation_period || "",
      evaluator,
      evaluator_role:        req.body.evaluator_role || "",
      evaluation_date,
      status:                req.body.status || "Scheduled",
      overall_rating:        req.body.overall_rating || "Good",
      categories:            req.body.categories || {},
      strengths:             req.body.strengths || [],
      areas_for_improvement: req.body.areas_for_improvement || [],
      goals:                 req.body.goals || [],
      comments:              req.body.comments || "",
      entered_by_id:         req.body.entered_by_id || null,
      entered_by_name:       req.body.entered_by_name || null,
    });
    res.status(201).json({ success: true, data: record, message: "Evaluation created" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const record = await StaffPerformance.findOne({ evaluation_id: req.params.id });
    if (!record) return res.status(404).json({ success: false, message: "Evaluation not found" });

    const protect = ["evaluation_id", "staff_id", "created_at"];
    Object.entries(req.body).forEach(([k, v]) => { if (!protect.includes(k)) record[k] = v; });
    record.updated_at = new Date();
    await record.save();

    res.json({ success: true, data: record, message: "Evaluation updated" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    const record = await StaffPerformance.findOneAndDelete({ evaluation_id: req.params.id });
    if (!record) return res.status(404).json({ success: false, message: "Evaluation not found" });
    res.json({ success: true, message: "Evaluation deleted" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
