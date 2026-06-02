const Admission = require("../models/Admission.model");
const Student = require("../models/Student.model");
const School = require("../models/School.model");
const Class = require("../models/Class.model");
const Alumni = require("../models/Alumni.model");
const Session = require("../models/Session.model");
const { checkStudentLimit } = require("../utils/planLimitCheck");

/**
 * Create a new admission record.
 * Called when a new student is created or an existing student is enrolled.
 */
const createAdmission = async (admissionData) => {
  try {
    console.log("Creating admission with data:", admissionData);

    if (!admissionData.student_id || !admissionData.school_id) {
      return { success: false, error: "Missing required fields", message: "student_id and school_id are required" };
    }

    const student = await Student.findOne({ student_id: admissionData.student_id });
    if (!student) {
      return { success: false, error: "Student not found", message: "Student does not exist in the system" };
    }

    const studentLimit = await checkStudentLimit(admissionData.school_id);
    if (!studentLimit.allowed) {
      return { success: false, error: "Plan limit reached", message: studentLimit.message, limitType: "students" };
    }

    const existingActive = await Admission.findOne({
      student_id: admissionData.student_id,
      school_id: admissionData.school_id,
      active_status: true,
    });

    if (existingActive) {
      return { success: false, error: "Student already admitted", message: "Student already has an active admission in this school" };
    }

    const newAdmission = await Admission.create({
      admission_id: Date.now().toString(),
      student_id: admissionData.student_id,
      school_id: admissionData.school_id,
      admitted_date: admissionData.admittedDate || new Date().toISOString().split("T")[0],
      close_date: null,
      admission_class: admissionData.admissionClass || null,
      admission_session: admissionData.admissionSession || null,
      admission_term: admissionData.admissionTerm || "Not Assigned",
      active_status: true,
      is_graduated: false,
      graduated_id: null,
      graduation_session_id: null,
      graduation_session_name: null,
      admission_type: admissionData.admissionType || "new",
      previous_school: admissionData.previousSchool || null,
      transfer_certificate: admissionData.transferCertificate || null,
      remarks: admissionData.remarks || null,
      created_by: admissionData.created_by || null,
    });

    console.log("Admission created with ID:", newAdmission.admission_id);

    return {
      success: true,
      data: { admission_id: newAdmission.admission_id, admission: newAdmission },
      message: "Admission created successfully",
    };
  } catch (error) {
    console.error("Create admission error:", error);
    return { success: false, error: "Create admission failed", message: error.message || "Failed to create admission" };
  }
};

/**
 * Get admission by ID
 */
const getAdmissionById = async (admissionId) => {
  try {
    const admission = await Admission.findOne({ admission_id: admissionId }).lean();
    if (!admission) {
      return { success: false, error: "Admission not found", message: "Admission record not found" };
    }
    return { success: true, data: admission, message: "Admission retrieved successfully" };
  } catch (error) {
    console.error("Get admission error:", error);
    return { success: false, error: "Get admission failed", message: error.message || "Failed to retrieve admission" };
  }
};

/**
 * Get all admissions for a student, enriched with school/class/alumni info
 */
const getAdmissionsByStudentId = async (studentId) => {
  try {
    const studentAdmissions = await Admission.find({ student_id: studentId })
      .sort({ admitted_date: -1 })
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Enrich each admission
    const enriched = await Promise.all(
      studentAdmissions.map(async (a) => {
        const [school, cls, alumniRec] = await Promise.all([
          School.findOne({ school_id: a.school_id }).lean(),
          a.admission_class ? Class.findOne({ class_id: a.admission_class }).lean() : null,
          Alumni.findOne({ student_id: a.student_id, school_id: a.school_id }).lean(),
        ]);

        let isGraduated = false;
        let graduationDate = null;

        if (alumniRec) {
          let sessionStarted = true;
          if (alumniRec.graduation_session_id) {
            const gradSession = await Session.findOne({ session_id: alumniRec.graduation_session_id }).lean();
            if (gradSession) {
              sessionStarted = new Date(gradSession.academic_year_start_date) <= today;
            }
          }
          isGraduated = sessionStarted;
          graduationDate = alumniRec.graduation_date || null;
        }

        return {
          ...a,
          school_name: school?.school_name || null,
          school_logo: (typeof school?.logo_url === "string" && school.logo_url) ? school.logo_url : null,
          admission_class_name: cls?.class_name || null,
          is_graduated: isGraduated,
          graduation_date: graduationDate,
          final_class_name: alumniRec?.final_class_name || null,
        };
      })
    );

    return { success: true, data: enriched, message: "Student admissions retrieved successfully" };
  } catch (error) {
    console.error("Get student admissions error:", error);
    return { success: false, error: "Get student admissions failed", message: error.message || "Failed to retrieve student admissions" };
  }
};

/**
 * Get all admissions for a school
 */
const getAdmissionsBySchoolId = async (schoolId, activeOnly = true) => {
  try {
    const query = { school_id: schoolId };
    if (activeOnly) query.active_status = true;

    const admissions = await Admission.find(query).lean();
    return { success: true, data: admissions, message: "School admissions retrieved successfully" };
  } catch (error) {
    console.error("Get school admissions error:", error);
    return { success: false, error: "Get school admissions failed", message: error.message || "Failed to retrieve school admissions" };
  }
};

/**
 * Update admission record
 */
const updateAdmission = async (admissionId, admissionData) => {
  try {
    console.log("Updating admission with ID:", admissionId);

    const admission = await Admission.findOne({ admission_id: admissionId });
    if (!admission) {
      return { success: false, error: "Admission not found", message: "Admission record not found" };
    }

    if (admissionData.admittedDate !== undefined)         admission.admitted_date          = admissionData.admittedDate;
    if (admissionData.closeDate !== undefined)            admission.close_date             = admissionData.closeDate;
    if (admissionData.admissionClass !== undefined)       admission.admission_class        = admissionData.admissionClass;
    if (admissionData.admissionSession !== undefined)     admission.admission_session      = admissionData.admissionSession;
    if (admissionData.admissionTerm !== undefined)        admission.admission_term         = admissionData.admissionTerm;
    if (admissionData.activeStatus !== undefined)         admission.active_status          = admissionData.activeStatus;
    if (admissionData.isGraduated !== undefined)          admission.is_graduated           = admissionData.isGraduated;
    if (admissionData.graduatedId !== undefined)          admission.graduated_id           = admissionData.graduatedId;
    if (admissionData.graduationSessionId !== undefined)  admission.graduation_session_id  = admissionData.graduationSessionId;
    if (admissionData.graduationSessionName !== undefined) admission.graduation_session_name = admissionData.graduationSessionName;
    if (admissionData.admissionType !== undefined)        admission.admission_type         = admissionData.admissionType;
    if (admissionData.previousSchool !== undefined)       admission.previous_school        = admissionData.previousSchool;
    if (admissionData.transferCertificate !== undefined)  admission.transfer_certificate   = admissionData.transferCertificate;
    if (admissionData.remarks !== undefined)              admission.remarks                = admissionData.remarks;

    admission.updated_at = new Date();
    await admission.save();

    console.log("Admission updated with ID:", admissionId);

    return {
      success: true,
      data: { admission_id: admissionId, admission },
      message: "Admission updated successfully",
    };
  } catch (error) {
    console.error("Update admission error:", error);
    return { success: false, error: "Update admission failed", message: error.message || "Failed to update admission" };
  }
};

/**
 * Close admission (when student leaves school)
 */
const closeAdmission = async (admissionId, closeDate, remarks) => {
  try {
    const admission = await Admission.findOne({ admission_id: admissionId });
    if (!admission) {
      return { success: false, error: "Admission not found", message: "Admission record not found" };
    }

    admission.close_date = closeDate || new Date().toISOString().split("T")[0];
    admission.active_status = false;
    if (remarks) admission.remarks = remarks;
    admission.updated_at = new Date();
    await admission.save();

    console.log("Admission closed with ID:", admissionId);
    return { success: true, message: "Admission closed successfully" };
  } catch (error) {
    console.error("Close admission error:", error);
    return { success: false, error: "Close admission failed", message: error.message || "Failed to close admission" };
  }
};

/**
 * Delete admission (hard delete)
 */
const deleteAdmission = async (admissionId) => {
  try {
    const admission = await Admission.findOneAndDelete({ admission_id: admissionId });
    if (!admission) {
      return { success: false, error: "Admission not found", message: "Admission record not found" };
    }
    console.log("Admission deleted with ID:", admissionId);
    return { success: true, message: "Admission deleted successfully" };
  } catch (error) {
    console.error("Delete admission error:", error);
    return { success: false, error: "Delete admission failed", message: error.message || "Failed to delete admission" };
  }
};

module.exports = {
  createAdmission,
  getAdmissionById,
  getAdmissionsByStudentId,
  getAdmissionsBySchoolId,
  updateAdmission,
  closeAdmission,
  deleteAdmission,
};
