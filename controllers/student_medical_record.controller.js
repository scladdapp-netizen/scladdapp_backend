const StudentMedicalRecord = require("../models/StudentMedicalRecord.model");

const createMedicalRecord = async (recordData) => {
  try {
    if (!recordData.student_id || !recordData.school_id) {
      return { success: false, error: "Missing required fields", message: "student_id and school_id are required" };
    }
    const record = await StudentMedicalRecord.create({
      record_id:          Date.now().toString(),
      student_id:         recordData.student_id,
      school_id:          recordData.school_id,
      record_date:        recordData.record_date || new Date().toISOString().split("T")[0],
      record_type:        recordData.record_type || "general",
      diagnosis:          recordData.diagnosis || null,
      symptoms:           recordData.symptoms || null,
      treatment:          recordData.treatment || null,
      prescription:       recordData.prescription || null,
      doctor_name:        recordData.doctor_name || null,
      hospital_clinic:    recordData.hospital_clinic || null,
      doctor_phone:       recordData.doctor_phone || null,
      allergies:          recordData.allergies || null,
      chronic_conditions: recordData.chronic_conditions || null,
      medications:        recordData.medications || null,
      notes:              recordData.notes || null,
      follow_up_required: recordData.follow_up_required || false,
      follow_up_date:     recordData.follow_up_date || null,
      attachments:        recordData.attachments || [],
      is_active:          true,
      created_by:         recordData.created_by || null,
    });
    console.log("Medical record created with ID:", record.record_id);
    return { success: true, data: record, message: "Medical record created successfully" };
  } catch (error) {
    console.error("Create medical record error:", error);
    return { success: false, error: "Create medical record failed", message: error.message || "Failed to create medical record" };
  }
};

const updateMedicalRecord = async (recordId, recordData) => {
  try {
    const record = await StudentMedicalRecord.findOne({ record_id: recordId });
    if (!record) return { success: false, error: "Medical record not found", message: "Medical record not found" };

    const fields = ["record_date","record_type","diagnosis","symptoms","treatment","prescription",
                    "doctor_name","hospital_clinic","doctor_phone","allergies","chronic_conditions",
                    "medications","notes","follow_up_required","follow_up_date","attachments"];
    fields.forEach((f) => { if (recordData[f] !== undefined) record[f] = recordData[f]; });
    record.updated_at = new Date();
    await record.save();

    return { success: true, data: record, message: "Medical record updated successfully" };
  } catch (error) {
    return { success: false, error: "Update medical record failed", message: error.message || "Failed to update medical record" };
  }
};

const getMedicalRecordsByStudentId = async (studentId) => {
  try {
    const records = await StudentMedicalRecord.find({ student_id: studentId, is_active: true })
      .sort({ record_date: -1 }).lean();
    return { success: true, data: records, message: "Medical records retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get medical records failed", message: error.message || "Failed to retrieve medical records" };
  }
};

const getMedicalRecordById = async (recordId) => {
  try {
    const record = await StudentMedicalRecord.findOne({ record_id: recordId }).lean();
    if (!record) return { success: false, error: "Medical record not found", message: "Medical record not found" };
    return { success: true, data: record, message: "Medical record retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get medical record failed", message: error.message || "Failed to retrieve medical record" };
  }
};

const deleteMedicalRecord = async (recordId) => {
  try {
    const record = await StudentMedicalRecord.findOne({ record_id: recordId });
    if (!record) return { success: false, error: "Medical record not found", message: "Medical record not found" };
    record.is_active  = false;
    record.updated_at = new Date();
    await record.save();
    return { success: true, message: "Medical record deleted successfully" };
  } catch (error) {
    return { success: false, error: "Delete medical record failed", message: error.message || "Failed to delete medical record" };
  }
};

module.exports = { createMedicalRecord, updateMedicalRecord, getMedicalRecordsByStudentId, getMedicalRecordById, deleteMedicalRecord };
