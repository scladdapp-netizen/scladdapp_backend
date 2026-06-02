const StudentGuardian = require("../models/StudentGuardian.model");
const Student = require("../models/Student.model");

const createGuardian = async (guardianData) => {
  try {
    if (!guardianData.student_id || !guardianData.guardian_name || !guardianData.guardian_phone) {
      return { success: false, error: "Missing required fields", message: "student_id, guardian_name, and guardian_phone are required" };
    }

    const student = await Student.findOne({ student_id: guardianData.student_id });
    if (!student) return { success: false, error: "Student not found", message: "Student does not exist in the system" };

    const newGuardian = await StudentGuardian.create({
      guardian_id:            Date.now().toString(),
      student_id:             guardianData.student_id,
      guardian_name:          guardianData.guardian_name,
      guardian_relationship:  guardianData.guardian_relationship || null,
      guardian_phone:         guardianData.guardian_phone,
      guardian_email:         guardianData.guardian_email || null,
      guardian_address:       guardianData.guardian_address || null,
      guardian_occupation:    guardianData.guardian_occupation || null,
      is_primary:             guardianData.is_primary !== undefined ? guardianData.is_primary : true,
      is_active:              true,
      created_by:             guardianData.created_by || null,
    });

    console.log("Guardian created with ID:", newGuardian.guardian_id);
    return { success: true, data: { guardian_id: newGuardian.guardian_id, guardian: newGuardian }, message: "Guardian created successfully" };
  } catch (error) {
    console.error("Create guardian error:", error);
    return { success: false, error: "Create guardian failed", message: error.message || "Failed to create guardian" };
  }
};

const getGuardianById = async (guardianId) => {
  try {
    const guardian = await StudentGuardian.findOne({ guardian_id: guardianId }).lean();
    if (!guardian) return { success: false, error: "Guardian not found", message: "Guardian record not found" };
    return { success: true, data: guardian, message: "Guardian retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get guardian failed", message: error.message || "Failed to retrieve guardian" };
  }
};

const getGuardiansByStudentId = async (studentId) => {
  try {
    const guardians = await StudentGuardian.find({ student_id: studentId, is_active: true }).lean();
    return { success: true, data: guardians, message: "Student guardians retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get student guardians failed", message: error.message || "Failed to retrieve student guardians" };
  }
};

const updateGuardian = async (guardianId, guardianData) => {
  try {
    const guardian = await StudentGuardian.findOne({ guardian_id: guardianId });
    if (!guardian) return { success: false, error: "Guardian not found", message: "Guardian record not found" };

    const fields = ["guardian_name", "guardian_relationship", "guardian_phone", "guardian_email", "guardian_address", "guardian_occupation", "is_primary"];
    fields.forEach((f) => { if (guardianData[f] !== undefined) guardian[f] = guardianData[f]; });
    guardian.updated_at = new Date();
    await guardian.save();

    return { success: true, data: { guardian_id: guardianId, guardian }, message: "Guardian updated successfully" };
  } catch (error) {
    return { success: false, error: "Update guardian failed", message: error.message || "Failed to update guardian" };
  }
};

const deleteGuardian = async (guardianId) => {
  try {
    const guardian = await StudentGuardian.findOneAndDelete({ guardian_id: guardianId });
    if (!guardian) return { success: false, error: "Guardian not found", message: "Guardian record not found" };
    return { success: true, message: "Guardian deleted successfully" };
  } catch (error) {
    return { success: false, error: "Delete guardian failed", message: error.message || "Failed to delete guardian" };
  }
};

const setPrimaryGuardian = async (guardianId, studentId) => {
  try {
    const guardian = await StudentGuardian.findOne({ guardian_id: guardianId });
    if (!guardian) return { success: false, error: "Guardian not found", message: "Guardian record not found" };

    // Unset all primaries for this student, then set the target
    await StudentGuardian.updateMany({ student_id: studentId }, { $set: { is_primary: false } });
    guardian.is_primary = true;
    guardian.updated_at = new Date();
    await guardian.save();

    return { success: true, message: "Primary guardian set successfully" };
  } catch (error) {
    return { success: false, error: "Set primary guardian failed", message: error.message || "Failed to set primary guardian" };
  }
};

module.exports = { createGuardian, getGuardianById, getGuardiansByStudentId, updateGuardian, deleteGuardian, setPrimaryGuardian };
