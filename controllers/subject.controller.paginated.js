const Subject = require("../models/Subject.model");
const ClassSubjectAssignment = require("../models/ClassSubjectAssignment.model");
const TeacherSubjectAssignment = require("../models/TeacherSubjectAssignment.model");

const getSubjectsPaginated = async (schoolId, params) => {
  try {
    const page  = parseInt(params.page)  || 1;
    const limit = parseInt(params.limit) || 15;
    const sortBy    = params.sortBy    || "created_at";
    const sortOrder = params.sortOrder === "asc" ? 1 : -1;

    const query = { school_id: schoolId };
    if (params.search) {
      const regex = { $regex: params.search, $options: "i" };
      query.$or = [{ subject_name: regex }, { subject_code: regex }, { subject_description: regex }];
    }

    const totalItems = await Subject.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;

    const subjects = await Subject.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(startIndex)
      .limit(limit)
      .lean();

    // Batch-fetch active class and teacher assignments
    const subjectIds = subjects.map((s) => s.subject_id);
    const [classAssignments, teacherAssignments] = await Promise.all([
      ClassSubjectAssignment.find({ subject_id: { $in: subjectIds }, is_active: true }).lean(),
      TeacherSubjectAssignment.find({ subject_id: { $in: subjectIds }, is_active: true }).lean(),
    ]);

    const classMap   = {};
    classAssignments.forEach((a) => { classMap[a.subject_id] = a; });
    const teacherMap = {};
    teacherAssignments.forEach((a) => { teacherMap[a.subject_id] = a; });

    const enriched = subjects.map((s) => ({
      ...s,
      class_name:    classMap[s.subject_id]?.class_name   || null,
      class_code:    classMap[s.subject_id]?.class_code   || null,
      teacher_name:  teacherMap[s.subject_id]?.teacher_name  || null,
      teacher_email: teacherMap[s.subject_id]?.teacher_email || null,
      students_count: 0,
    }));

    return {
      success: true,
      data: enriched,
      pagination: { currentPage: page, totalPages, totalItems, itemsPerPage: limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      message: "Subjects retrieved successfully",
    };
  } catch (error) {
    console.error("Get subjects paginated error:", error);
    return { success: false, error: "Get subjects paginated failed", message: error.message || "Failed to retrieve subjects" };
  }
};

module.exports = { getSubjectsPaginated };
