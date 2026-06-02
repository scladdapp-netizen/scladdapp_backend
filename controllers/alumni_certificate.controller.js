const AlumniCertificate = require("../models/AlumniCertificate.model");
const { uploadFile, deleteFile } = require("../utils/upload");

// GET /api/alumni-certificates/alumni/:alumniId
exports.getByAlumni = async (req, res) => {
  try {
    const { alumniId } = req.params;
    const certs = await AlumniCertificate.find({ alumni_id: alumniId }).lean();
    res.json({ success: true, data: certs, count: certs.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/alumni-certificates/:certificateId
exports.getById = async (req, res) => {
  try {
    const cert = await AlumniCertificate.findOne({ certificate_id: req.params.certificateId }).lean();
    if (!cert) return res.status(404).json({ success: false, message: "Certificate not found" });
    res.json({ success: true, data: cert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/alumni-certificates  — multipart/form-data with "file" field
exports.upload = async (req, res) => {
  try {
    const { alumni_id, school_id, name, description, uploaded_by_id, uploaded_by_name } = req.body;

    if (!alumni_id) return res.status(400).json({ success: false, message: "alumni_id is required" });
    if (!req.file) return res.status(400).json({ success: false, message: "file is required" });

    const { url, public_id } = uploadFile(req.file);

    const cert = await AlumniCertificate.create({
      certificate_id:    Date.now().toString(),
      alumni_id,
      school_id:         school_id || null,
      name:              name?.trim() || req.file.originalname,
      description:       description?.trim() || "",
      type:              req.file.originalname.split(".").pop().toLowerCase(),
      size:              `${(req.file.size / (1024 * 1024)).toFixed(1)} MB`,
      file_url:          url,
      public_id,
      status:            "Pending",
      uploaded_by_id:    uploaded_by_id || null,
      uploaded_by_name:  uploaded_by_name || null,
      upload_date:       new Date().toISOString().split("T")[0],
    });

    res.status(201).json({ success: true, data: cert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/alumni-certificates/:certificateId/status
exports.updateStatus = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { status } = req.body;

    const allowed = ["Verified", "Pending", "Rejected"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(", ")}` });
    }

    const cert = await AlumniCertificate.findOne({ certificate_id: certificateId });
    if (!cert) return res.status(404).json({ success: false, message: "Certificate not found" });

    cert.status = status;
    cert.updated_at = new Date();
    await cert.save();

    res.json({ success: true, data: cert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/alumni-certificates/:certificateId
exports.remove = async (req, res) => {
  try {
    const cert = await AlumniCertificate.findOneAndDelete({ certificate_id: req.params.certificateId });
    if (!cert) return res.status(404).json({ success: false, message: "Certificate not found" });

    if (cert.public_id) deleteFile(cert.public_id);

    res.json({ success: true, data: cert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
