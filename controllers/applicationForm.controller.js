const jwt = require("jsonwebtoken");
const multer = require("multer");
const School = require("../models/School.model");
const Class = require("../models/Class.model");
const ApplicationFormConfig = require("../models/ApplicationFormConfig.model");
const StudentApplication = require("../models/StudentApplication.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const {
  APPLICATION_FORM_SECTIONS,
  getDefaultEnabledFields,
  getFieldById,
  getAllFieldIds,
} = require("../data/applicationFormFields");

const FILE_FIELD_IDS = new Set(
  APPLICATION_FORM_SECTIONS.flatMap((s) => s.fields.filter((f) => f.type === "file").map((f) => f.id))
);

function makeId(prefix) {
  return `${prefix}_${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: "No token provided" });
  try {
    req.jwtPayload = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
}

async function getOrCreateConfig(schoolId) {
  let config = await ApplicationFormConfig.findOne({ school_id: schoolId });
  if (!config) {
    config = await ApplicationFormConfig.create({
      school_id: schoolId,
      enabled_fields: getDefaultEnabledFields(),
      is_active: true,
    });
  }
  if (!config.enabled_fields?.length) {
    config.enabled_fields = getDefaultEnabledFields();
    await config.save();
  }
  return config;
}

function normalizeLogo(logo) {
  if (!logo) return null;
  if (typeof logo === "string") return logo;
  return logo.url || logo.secure_url || null;
}

function formatClassLabel(cls) {
  return `${cls.class_name}${cls.class_section ? ` ${cls.class_section}` : ""}`.trim();
}

function injectClassOptions(sections, classOptions) {
  return sections.map((section) => ({
    ...section,
    fields: section.fields.map((field) => {
      if (field.id !== "class_applying") return field;
      return {
        ...field,
        type: "select",
        options: classOptions,
      };
    }),
  }));
}

exports.getPublicForm = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const school = await School.findOne({ school_id: schoolId, is_active: true }).lean();
    if (!school) return res.status(404).json({ success: false, message: "School not found" });

    const config = await getOrCreateConfig(schoolId);
    if (!config.is_active) {
      return res.status(403).json({ success: false, message: "Applications are currently closed for this school." });
    }

    const enabledSet = new Set(config.enabled_fields);
    const sections = APPLICATION_FORM_SECTIONS.map((section) => ({
      ...section,
      fields: section.fields.filter((f) => enabledSet.has(f.id)),
    })).filter((s) => s.fields.length > 0);

    const activeClasses = await Class.find({ school_id: schoolId, is_active: true })
      .sort({ class_name: 1, class_section: 1 })
      .lean();
    const classOptions = activeClasses.map(formatClassLabel);
    const sectionsWithClasses = injectClassOptions(sections, classOptions);

    return res.json({
      success: true,
      data: {
        school: {
          school_id: school.school_id,
          school_name: school.school_name,
          logo_url: normalizeLogo(school.logo_url),
          motto: school.motto,
          address: school.address,
          phone_number: school.phone_number,
          email: school.email,
        },
        sections: sectionsWithClasses,
        enabled_fields: config.enabled_fields,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAdminConfig = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const config = await getOrCreateConfig(schoolId);
    return res.json({
      success: true,
      data: {
        enabled_fields: config.enabled_fields,
        is_active: config.is_active,
        sections: APPLICATION_FORM_SECTIONS,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateAdminConfig = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { enabled_fields, is_active } = req.body;

    if (!Array.isArray(enabled_fields)) {
      return res.status(400).json({ success: false, message: "enabled_fields must be an array" });
    }

    const validIds = new Set(getAllFieldIds());
    const cleaned = [...new Set(enabled_fields.filter((id) => validIds.has(id)))];

    if (!cleaned.length) {
      return res.status(400).json({ success: false, message: "At least one field must be enabled" });
    }

    const config = await ApplicationFormConfig.findOneAndUpdate(
      { school_id: schoolId },
      {
        $set: {
          enabled_fields: cleaned,
          is_active: is_active !== false,
          updated_by: req.jwtPayload?.reference_id || req.jwtPayload?.admin_id || null,
          updated_at: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      data: {
        enabled_fields: config.enabled_fields,
        is_active: config.is_active,
      },
      message: "Application form settings saved",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

function getUploadedFile(req, fieldId) {
  if (!req.files) return null;
  if (Array.isArray(req.files)) {
    return req.files.find((f) => f.fieldname === fieldId) || null;
  }
  const entry = req.files[fieldId];
  if (Array.isArray(entry)) return entry[0] || null;
  return entry || null;
}

exports.submitApplication = async (req, res) => {
  const tag = "[APP-FORM-SUBMIT]";
  try {
    const { schoolId } = req.params;
    const school = await School.findOne({ school_id: schoolId, is_active: true });
    if (!school) return res.status(404).json({ success: false, message: "School not found" });

    const config = await getOrCreateConfig(schoolId);
    if (!config.is_active) {
      return res.status(403).json({ success: false, message: "Applications are currently closed." });
    }

    let payload = {};
    try {
      payload = JSON.parse(req.body.data || "{}");
    } catch (_) {
      return res.status(400).json({ success: false, message: "Invalid form data" });
    }

    const enabledSet = new Set(config.enabled_fields);
    const data = {};
    const files = {};

    for (const fieldId of enabledSet) {
      const field = getFieldById(fieldId);
      if (!field) continue;

      if (field.type === "file") {
        const file = getUploadedFile(req, fieldId);
        if (file) {
          const { url, public_id } = await uploadToCloudinary(
            file.buffer,
            `scladapp/schools/${schoolId}/applications`,
            "image",
            file.originalname
          );
          files[fieldId] = { url, public_id, label: field.label };
        }
        continue;
      }

      const value = payload[fieldId];
      if (field.type === "checkbox") {
        data[fieldId] = value === true || value === "true" || value === "on";
      } else if (value !== undefined && value !== null && String(value).trim() !== "") {
        data[fieldId] = String(value).trim();
      }
    }

    const requiredCore = ["full_name", "class_applying", "guardian_phone"];
    for (const reqId of requiredCore) {
      if (enabledSet.has(reqId) && !data[reqId]) {
        const field = getFieldById(reqId);
        return res.status(400).json({
          success: false,
          message: `${field?.label || reqId} is required`,
        });
      }
    }

    if (enabledSet.has("information_accurate") && !data.information_accurate) {
      return res.status(400).json({ success: false, message: "Please confirm the information is correct." });
    }
    if (enabledSet.has("agree_terms") && !data.agree_terms) {
      return res.status(400).json({ success: false, message: "Please agree to the school rules and data use." });
    }

    const application = await StudentApplication.create({
      application_id: makeId("app"),
      school_id: schoolId,
      status: "pending",
      data,
      files,
    });

    console.log(`${tag} New application ${application.application_id} for school ${schoolId}`);
    return res.status(201).json({
      success: true,
      message: "Application submitted successfully. The school will contact you soon.",
      data: { application_id: application.application_id },
    });
  } catch (err) {
    console.error(`${tag} Error:`, err);
    return res.status(500).json({ success: false, message: err.message || "Submission failed" });
  }
};

exports.listApplications = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 20));
    const search = (req.query.search || "").trim();
    const status = (req.query.status || "").trim();

    const filter = { school_id: schoolId };
    if (["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { "data.full_name": { $regex: search, $options: "i" } },
        { "data.class_applying": { $regex: search, $options: "i" } },
        { "data.guardian_phone": { $regex: search, $options: "i" } },
        { "data.guardian_email": { $regex: search, $options: "i" } },
        { application_id: { $regex: search, $options: "i" } },
      ];
    }

    const totalRecords = await StudentApplication.countDocuments(filter);
    const totalPages = Math.ceil(totalRecords / limitNum) || 1;
    const start = (pageNum - 1) * limitNum;

    const rows = await StudentApplication.find(filter)
      .sort({ submitted_at: -1 })
      .skip(start)
      .limit(limitNum)
      .lean();

    const data = rows.map((row) => ({
      application_id: row.application_id,
      status: row.status,
      is_seen: !!row.is_seen,
      submitted_at: row.submitted_at,
      full_name: row.data?.full_name || "—",
      class_applying: row.data?.class_applying || "—",
      guardian_phone: row.data?.guardian_phone || "—",
      guardian_email: row.data?.guardian_email || "—",
    }));

    return res.json({
      success: true,
      data,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        startIndex: totalRecords === 0 ? 0 : start + 1,
        endIndex: Math.min(start + limitNum, totalRecords),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getApplication = async (req, res) => {
  try {
    const { schoolId, applicationId } = req.params;
    const application = await StudentApplication.findOneAndUpdate(
      { school_id: schoolId, application_id: applicationId },
      {
        $set: {
          is_seen: true,
          seen_at: new Date(),
        },
      },
      { new: true }
    ).lean();

    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    return res.json({ success: true, data: application });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    const { schoolId, applicationId } = req.params;
    const { status, review_notes } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const application = await StudentApplication.findOneAndUpdate(
      { school_id: schoolId, application_id: applicationId },
      {
        $set: {
          status,
          review_notes: review_notes != null ? String(review_notes).trim() : null,
          reviewed_at: new Date(),
          reviewed_by: req.jwtPayload?.reference_id || req.jwtPayload?.admin_id || null,
        },
      },
      { new: true }
    ).lean();

    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    return res.json({
      success: true,
      message: `Application marked as ${status}`,
      data: application,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUnseenCount = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const count = await StudentApplication.countDocuments({
      school_id: schoolId,
      is_seen: { $ne: true },
    });

    return res.json({
      success: true,
      data: { count },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.verifyToken = verifyToken;
