const StaffCredential = require("../models/StaffCredential.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const cloudinary = require("cloudinary").v2;
const { checkStorageQuota } = require("../utils/storageCheck");

exports.getByStaff = async (req, res) => {
  try {
    const creds = await StaffCredential.find({ staff_id: req.params.staffId }).lean();
    res.json({ success: true, data: creds, count: creds.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const c = await StaffCredential.findOne({ credential_id: req.params.credentialId }).lean();
    if (!c) return res.status(404).json({ success: false, message: "Credential not found" });
    res.json({ success: true, data: c });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { staff_id, school_id, title, description, category, issuer,
            documentNumber, expiryDate, isRequired, verificationStatus, uploaded_by } = req.body;
    if (!staff_id)     return res.status(400).json({ success: false, message: "staff_id is required" });
    if (!title?.trim()) return res.status(400).json({ success: false, message: "title is required" });
    if (!req.file)     return res.status(400).json({ success: false, message: "file is required" });

    const quota = await checkStorageQuota(school_id, req.file.size);
    if (!quota.allowed) return res.status(413).json({ success: false, message: quota.message });

    const { url, public_id } = await uploadToCloudinary(req.file.buffer, "scladapp/staff_credentials", "auto");
    const c = await StaffCredential.create({
      credential_id:      `CRED-${Date.now()}`,
      staff_id,
      school_id:          school_id || null,
      title:              title.trim(),
      description:        description?.trim() || "",
      category:           category || "General",
      fileName:           req.file.originalname,
      type:               req.file.originalname.split(".").pop().toLowerCase(),
      size:               `${(req.file.size / (1024 * 1024)).toFixed(1)} MB`,
      file_url:           url,
      file_public_id:     public_id,
      file_size:          req.file.size || 0,
      issuer:             issuer?.trim() || "",
      documentNumber:     documentNumber?.trim() || "",
      uploadDate:         new Date().toISOString().split("T")[0],
      expiryDate:         expiryDate || null,
      status:             "Active",
      isRequired:         isRequired === "true" || isRequired === true,
      verificationStatus: verificationStatus || "Pending",
      downloadCount:      0,
      uploaded_by:        uploaded_by || null,
    });
    res.status(201).json({ success: true, data: c });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const c = await StaffCredential.findOne({ credential_id: req.params.credentialId });
    if (!c) return res.status(404).json({ success: false, message: "Credential not found" });
    const { title, description, category, issuer, documentNumber,
            expiryDate, isRequired, verificationStatus, status } = req.body;
    if (title !== undefined)              c.title              = title.trim();
    if (description !== undefined)        c.description        = description.trim();
    if (category !== undefined)           c.category           = category;
    if (issuer !== undefined)             c.issuer             = issuer.trim();
    if (documentNumber !== undefined)     c.documentNumber     = documentNumber.trim();
    if (expiryDate !== undefined)         c.expiryDate         = expiryDate || null;
    if (isRequired !== undefined)         c.isRequired         = isRequired === "true" || isRequired === true;
    if (verificationStatus !== undefined) c.verificationStatus = verificationStatus;
    if (status !== undefined)             c.status             = status;
    c.updated_at = new Date();
    await c.save();
    res.json({ success: true, data: c });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.incrementDownload = async (req, res) => {
  try {
    const c = await StaffCredential.findOne({ credential_id: req.params.credentialId });
    if (!c) return res.status(404).json({ success: false, message: "Credential not found" });
    c.downloadCount = (c.downloadCount || 0) + 1;
    await c.save();
    res.json({ success: true, data: c });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    const c = await StaffCredential.findOneAndDelete({ credential_id: req.params.credentialId });
    if (!c) return res.status(404).json({ success: false, message: "Credential not found" });
    if (c.file_public_id) {
      await cloudinary.uploader.destroy(c.file_public_id, { resource_type: "raw" }).catch(() => {});
    }
    res.json({ success: true, data: c });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
