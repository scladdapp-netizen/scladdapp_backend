const Subsession = require("../models/Subsession.model");
const CombinedTemplate = require("../models/CombinedTemplate.model");

const calculateSubsessionStatus = (startDate, endDate) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(startDate); start.setHours(0, 0, 0, 0);
  const end   = new Date(endDate);   end.setHours(0, 0, 0, 0);
  if (today < start) return "draft";
  if (today >= start && today <= end) return "active";
  return "completed";
};

const withStatus = (sub) => ({ ...sub, term_status: calculateSubsessionStatus(sub.term_start_date, sub.term_end_date) });

const createSubsession = async (subsessionData) => {
  try {
    if (!subsessionData.term_name || !subsessionData.term_code || !subsessionData.session_id || !subsessionData.school_id) {
      return { success: false, error: "Missing required fields", message: "Term name, term code, session ID, and school ID are required", errors: [] };
    }
    if (!subsessionData.term_start_date || !subsessionData.term_end_date) {
      return { success: false, error: "Missing required fields", message: "Term start date and end date are required", errors: [] };
    }
    if (!subsessionData.grading_template_id) {
      return { success: false, error: "Missing required template", message: "A template is required", errors: ["Template must be selected"] };
    }

    const startDate = new Date(subsessionData.term_start_date);
    const endDate   = new Date(subsessionData.term_end_date);
    if (startDate >= endDate) {
      return { success: false, error: "Invalid dates", message: "Term start date must be before end date", errors: ["Start date must be before end date"] };
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endCheck = new Date(subsessionData.term_end_date); endCheck.setHours(0, 0, 0, 0);
    if (endCheck < today) {
      return { success: false, error: "Invalid dates", message: "Cannot create a subsession that has already ended. The end date must be today or in the future.", errors: ["The end date must be today or in the future"] };
    }

    const duplicate = await Subsession.findOne({ term_code: subsessionData.term_code, session_id: subsessionData.session_id });
    if (duplicate) {
      return { success: false, error: "Duplicate term code", message: "A term with this code already exists in this session", errors: ["Term code must be unique within the session"] };
    }

    // Resolve template name if not provided
    let gradingTemplateName = subsessionData.grading_template_name || null;
    if (subsessionData.grading_template_id && !gradingTemplateName) {
      const template = await CombinedTemplate.findOne({ template_id: String(subsessionData.grading_template_id) }).lean();
      if (template) gradingTemplateName = template.name;
    }

    const newSubsession = await Subsession.create({
      term_id:               `${Date.now()}${Math.floor(Math.random() * 10000)}`,
      school_id:             subsessionData.school_id,
      session_id:            subsessionData.session_id,
      term_name:             subsessionData.term_name,
      term_code:             subsessionData.term_code,
      term_start_date:       subsessionData.term_start_date,
      term_end_date:         subsessionData.term_end_date,
      term_status:           calculateSubsessionStatus(subsessionData.term_start_date, subsessionData.term_end_date),
      is_archived:           false,
      grading_template_id:   subsessionData.grading_template_id || null,
      grading_template_name: gradingTemplateName,
      fee_bill_template_id:  subsessionData.fee_bill_template_id || null,
      created_by:            subsessionData.created_by || null,
      created_by_name:       subsessionData.created_by_name || null,
      created_by_role:       subsessionData.created_by_role || null,
    });

    return { success: true, data: newSubsession, message: "Subsession created successfully" };
  } catch (error) {
    console.error("Create subsession error:", error);
    return { success: false, error: "Create subsession failed", message: error.message || "Failed to create subsession", errors: [error.message] };
  }
};

const getSubsessionsBySessionId = async (sessionId) => {
  try {
    const subsessions = await Subsession.find({ session_id: sessionId }).sort({ term_start_date: 1 }).lean();
    return { success: true, data: subsessions.map(withStatus), message: "Subsessions retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get subsessions failed", message: error.message || "Failed to retrieve subsessions" };
  }
};

const getSubsessionsBySchoolId = async (schoolId) => {
  try {
    const subsessions = await Subsession.find({ school_id: schoolId }).sort({ term_start_date: -1 }).lean();
    return { success: true, data: subsessions.map(withStatus), message: "Subsessions retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get subsessions failed", message: error.message || "Failed to retrieve subsessions" };
  }
};

const getSubsessionById = async (termId) => {
  try {
    const subsession = await Subsession.findOne({ term_id: termId }).lean();
    if (!subsession) return { success: false, error: "Subsession not found", message: "Subsession not found" };
    return { success: true, data: subsession, message: "Subsession retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get subsession failed", message: error.message || "Failed to retrieve subsession" };
  }
};

const updateSubsession = async (termId, subsessionData) => {
  try {
    const subsession = await Subsession.findOne({ term_id: termId });
    if (!subsession) return { success: false, error: "Subsession not found", message: "Subsession not found" };

    if (subsessionData.term_start_date && subsessionData.term_end_date) {
      const start = new Date(subsessionData.term_start_date);
      const end   = new Date(subsessionData.term_end_date);
      if (start >= end) return { success: false, error: "Invalid dates", message: "Term start date must be before end date", errors: ["Start date must be before end date"] };

      const today    = new Date(); today.setHours(0, 0, 0, 0);
      const endCheck = new Date(subsessionData.term_end_date); endCheck.setHours(0, 0, 0, 0);
      if (endCheck < today) return { success: false, error: "Invalid dates", message: "Cannot update a subsession that has already ended.", errors: ["The end date must be today or in the future"] };
    }

    if (subsessionData.term_code && subsessionData.term_code !== subsession.term_code) {
      const dup = await Subsession.findOne({ term_code: subsessionData.term_code, session_id: subsession.session_id, term_id: { $ne: termId } });
      if (dup) return { success: false, error: "Term code already exists", message: "Another term with this code already exists in this session", errors: ["Term code must be unique within the session"] };
    }

    const fields = ["term_name","term_code","term_start_date","term_end_date","term_status","is_archived"];
    fields.forEach((f) => { if (subsessionData[f] !== undefined) subsession[f] = subsessionData[f]; });
    subsession.updated_at = new Date();
    await subsession.save();

    return { success: true, data: subsession, message: "Subsession updated successfully" };
  } catch (error) {
    return { success: false, error: "Update subsession failed", message: error.message || "Failed to update subsession", errors: [error.message] };
  }
};

const updateSubsessionStatus = async (termId, status) => {
  try {
    const valid = ["draft","active","completed","archived"];
    if (!valid.includes(status)) return { success: false, error: "Invalid status", message: `Status must be one of: ${valid.join(", ")}` };

    const subsession = await Subsession.findOne({ term_id: termId });
    if (!subsession) return { success: false, error: "Subsession not found", message: "Subsession not found" };

    subsession.term_status = status;
    subsession.updated_at  = new Date();
    await subsession.save();

    return { success: true, data: subsession, message: "Subsession status updated successfully" };
  } catch (error) {
    return { success: false, error: "Update status failed", message: error.message || "Failed to update subsession status" };
  }
};

const deleteSubsession = async (termId) => {
  try {
    const subsession = await Subsession.findOneAndDelete({ term_id: termId });
    if (!subsession) return { success: false, error: "Subsession not found", message: "Subsession not found" };
    return { success: true, message: "Subsession deleted successfully" };
  } catch (error) {
    return { success: false, error: "Delete subsession failed", message: error.message || "Failed to delete subsession" };
  }
};

module.exports = { createSubsession, getSubsessionsBySessionId, getSubsessionsBySchoolId, getSubsessionById, updateSubsession, updateSubsessionStatus, deleteSubsession };
