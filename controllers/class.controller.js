const Class = require("../models/Class.model");
const ClassHeadmaster = require("../models/ClassHeadmaster.model");
const Session = require("../models/Session.model");
const Subsession = require("../models/Subsession.model");

const createClass = async (classData) => {
  try {
    if (!classData.className || !classData.classCode || !classData.classSection || !classData.school_id || !classData.classType) {
      return { success: false, error: "Missing required fields", message: "Class name, class code, class section, school_id, and class type are required" };
    }

    const existing = await Class.findOne({ class_code: classData.classCode, school_id: classData.school_id });
    if (existing) {
      return { success: false, error: "Class already exists", message: "A class with this code already exists in this school" };
    }

    const newClass = await Class.create({
      class_id:      Date.now().toString(),
      class_name:    classData.className,
      class_code:    classData.classCode,
      class_section: classData.classSection,
      school_id:     classData.school_id,
      class_type:    classData.classType,
      room_number:   classData.roomNumber || null,
      is_active:     true,
      created_by:    classData.created_by || null,
    });

    console.log("Class created with ID:", newClass.class_id);
    return { success: true, data: { class_id: newClass.class_id, class: newClass }, message: "Class created successfully" };
  } catch (error) {
    console.error("Create class error:", error);
    return { success: false, error: "Create class failed", message: error.message || "Failed to create class" };
  }
};

const getClassDetail = async (classId) => {
  try {
    const classItem = await Class.findOne({ class_id: classId }).lean();
    if (!classItem) return { success: false, error: "Class not found", message: "Class not found" };

    const classHeadmasters = await ClassHeadmaster.find({ class_id: classId }).sort({ start_date: -1 }).lean();

    const classCreatedDate = new Date(classItem.created_at);
    classCreatedDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allSessions = await Session.find({
      school_id: classItem.school_id,
      is_archived: { $ne: true },
      session_status: { $ne: "archived" },
      academic_year_start_date: { $lte: today.toISOString().split("T")[0] },
      academic_year_end_date:   { $gte: classCreatedDate.toISOString().split("T")[0] },
    }).lean();

    const validSessions = [];
    for (const session of allSessions) {
      const subsessions = await Subsession.find({
        session_id: session.session_id,
        term_end_date: { $gte: classCreatedDate.toISOString().split("T")[0] },
      }).lean();

      if (subsessions.length === 0) continue;

      validSessions.push({
        session_id:         session.session_id,
        session_name:       session.session_name,
        session_start_date: session.academic_year_start_date,
        session_end_date:   session.academic_year_end_date,
        subsessions: subsessions.map((sub) => ({
          subsession_id:   sub.term_id,
          subsession_name: sub.term_name,
        })),
      });
    }

    console.log(`Found ${validSessions.length} active sessions for class ${classItem.class_name}`);
    return { success: true, data: { class: classItem, headmaster_assignments: classHeadmasters, sessions: validSessions }, message: "Class detail retrieved successfully" };
  } catch (error) {
    console.error("Get class detail error:", error);
    return { success: false, error: "Get class detail failed", message: error.message || "Failed to retrieve class detail" };
  }
};

const getClassById = async (classId) => {
  try {
    const classItem = await Class.findOne({ class_id: classId }).lean();
    if (!classItem) return { success: false, error: "Class not found", message: "Class not found" };
    return { success: true, data: classItem, message: "Class retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get class failed", message: error.message || "Failed to retrieve class" };
  }
};

const getClassesBySchoolId = async (schoolId) => {
  try {
    const classes = await Class.find({ school_id: schoolId, is_active: true }).lean();
    return { success: true, data: classes, message: "Classes retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get classes failed", message: error.message || "Failed to retrieve classes" };
  }
};

const updateClass = async (classId, classData) => {
  try {
    const classItem = await Class.findOne({ class_id: classId });
    if (!classItem) return { success: false, error: "Class not found", message: "Class not found" };

    if (classData.classCode && classData.classCode !== classItem.class_code) {
      const duplicate = await Class.findOne({ class_code: classData.classCode, school_id: classItem.school_id, class_id: { $ne: classId } });
      if (duplicate) return { success: false, error: "Class code already exists", message: "Another class with this code already exists in this school" };
    }

    if (classData.className !== undefined)   classItem.class_name    = classData.className;
    if (classData.classCode !== undefined)   classItem.class_code    = classData.classCode;
    if (classData.classSection !== undefined) classItem.class_section = classData.classSection;
    if (classData.classType !== undefined)   classItem.class_type    = classData.classType;
    if (classData.roomNumber !== undefined)  classItem.room_number   = classData.roomNumber;
    if (classData.is_active !== undefined)   classItem.is_active     = classData.is_active;
    classItem.updated_at = new Date();
    await classItem.save();

    return { success: true, data: { class_id: classId, class: classItem }, message: "Class updated successfully" };
  } catch (error) {
    return { success: false, error: "Update class failed", message: error.message || "Failed to update class" };
  }
};

const deleteClass = async (classId) => {
  try {
    const classItem = await Class.findOne({ class_id: classId });
    if (!classItem) return { success: false, error: "Class not found", message: "Class not found" };
    classItem.is_active = false;
    classItem.updated_at = new Date();
    await classItem.save();
    return { success: true, message: "Class deleted successfully" };
  } catch (error) {
    return { success: false, error: "Delete class failed", message: error.message || "Failed to delete class" };
  }
};

const updateClassStatus = async (classId, isActive) => {
  try {
    const classItem = await Class.findOne({ class_id: classId });
    if (!classItem) return { success: false, error: "Class not found", message: "Class not found" };
    classItem.is_active = isActive;
    classItem.updated_at = new Date();
    await classItem.save();
    return { success: true, message: `Class ${isActive ? "activated" : "deactivated"} successfully` };
  } catch (error) {
    return { success: false, error: "Update class status failed", message: error.message || "Failed to update class status" };
  }
};

const hardDeleteClass = async (classId) => {
  try {
    const classItem = await Class.findOneAndDelete({ class_id: classId });
    if (!classItem) return { success: false, error: "Class not found", message: "Class not found" };
    return { success: true, message: "Class permanently deleted" };
  } catch (error) {
    return { success: false, error: "Hard delete class failed", message: error.message || "Failed to permanently delete class" };
  }
};

module.exports = { createClass, getClassById, getClassDetail, getClassesBySchoolId, updateClass, deleteClass, updateClassStatus, hardDeleteClass };
