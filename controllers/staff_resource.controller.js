const StaffResource = require("../models/StaffResource.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const cloudinary = require("cloudinary").v2;
const { checkStorageQuota } = require("../utils/storageCheck");

exports.getByStaff = async (req, res) => {
  try {
    const resources = await StaffResource.find({ staff_id: req.params.staffId }).lean();
    res.json({ success: true, data: resources, count: resources.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const r = await StaffResource.findOne({ resource_id: req.params.resourceId }).lean();
    if (!r) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { staff_id, school_id, name, description, category, uploaded_by } = req.body;
    if (!staff_id)     return res.status(400).json({ success: false, message: "staff_id is required" });
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name is required" });
    if (!req.file)     return res.status(400).json({ success: false, message: "file is required" });

    const quota = await checkStorageQuota(school_id, req.file.size);
    if (!quota.allowed) return res.status(413).json({ success: false, message: quota.message });

    const { url, public_id } = await uploadToCloudinary(req.file.buffer, "scladapp/staff_resources", "auto");
    const r = await StaffResource.create({
      resource_id:    Date.now().toString(),
      staff_id,
      school_id:      school_id || null,
      name:           name.trim(),
      description:    description?.trim() || "",
      category:       category || "General",
      file_name:      req.file.originalname,
      file_type:      req.file.originalname.split(".").pop().toLowerCase(),
      file_url:       url,
      file_public_id: public_id,
      file_size:      req.file.size || 0,
      download_count: 0,
      uploaded_by:    uploaded_by || null,
    });
    res.status(201).json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const r = await StaffResource.findOne({ resource_id: req.params.resourceId });
    if (!r) return res.status(404).json({ success: false, message: "Resource not found" });
    const { name, description, category } = req.body;
    if (name !== undefined)        r.name        = name.trim();
    if (description !== undefined) r.description = description.trim();
    if (category !== undefined)    r.category    = category;
    await r.save();
    res.json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.incrementDownload = async (req, res) => {
  try {
    const r = await StaffResource.findOne({ resource_id: req.params.resourceId });
    if (!r) return res.status(404).json({ success: false, message: "Resource not found" });
    r.download_count = (r.download_count || 0) + 1;
    await r.save();
    res.json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    const r = await StaffResource.findOneAndDelete({ resource_id: req.params.resourceId });
    if (!r) return res.status(404).json({ success: false, message: "Resource not found" });
    if (r.file_public_id) {
      await cloudinary.uploader.destroy(r.file_public_id, { resource_type: "auto" }).catch(() => {});
    }
    res.json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
