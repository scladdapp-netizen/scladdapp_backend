const ClassResource = require("../models/ClassResource.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const cloudinary = require("cloudinary").v2;
const { checkStorageQuota } = require("../utils/storageCheck");

// GET /api/class-resource/class/:classId
exports.getByClass = async (req, res) => {
  try {
    const resources = await ClassResource.find({ class_id: req.params.classId }).lean();
    res.json({ success: true, data: resources, count: resources.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/class-resource/:resourceId
exports.getById = async (req, res) => {
  try {
    const resource = await ClassResource.findOne({ resource_id: req.params.resourceId }).lean();
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/class-resource — multipart/form-data with "file" field
exports.create = async (req, res) => {
  try {
    const { class_id, school_id, name, description, category, session_id, subsession_id, uploaded_by } = req.body;

    if (!class_id)    return res.status(400).json({ success: false, message: "class_id is required" });
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name is required" });
    if (!req.file)    return res.status(400).json({ success: false, message: "file is required" });

    const quota = await checkStorageQuota(school_id, req.file.size);
    if (!quota.allowed) return res.status(413).json({ success: false, message: quota.message });

    const { url, public_id } = await uploadToCloudinary(req.file.buffer, "scladapp/class_resources", "auto");

    const resource = await ClassResource.create({
      resource_id:    Date.now().toString(),
      class_id,
      school_id:      school_id || null,
      name:           name.trim(),
      description:    description?.trim() || "",
      category:       category || "General",
      file_name:      req.file.originalname,
      file_type:      req.file.originalname.split(".").pop().toLowerCase(),
      file_url:       url,
      file_public_id: public_id,
      file_size:      req.file.size || 0,
      session_id:     session_id || null,
      subsession_id:  subsession_id || null,
      download_count: 0,
      uploaded_by:    uploaded_by || null,
    });

    res.status(201).json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/class-resource/:resourceId/download
exports.incrementDownload = async (req, res) => {
  try {
    const resource = await ClassResource.findOne({ resource_id: req.params.resourceId });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });

    resource.download_count = (resource.download_count || 0) + 1;
    await resource.save();

    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/class-resource/:resourceId
exports.remove = async (req, res) => {
  try {
    const resource = await ClassResource.findOneAndDelete({ resource_id: req.params.resourceId });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });

    if (resource.file_public_id) {
      await cloudinary.uploader.destroy(resource.file_public_id, { resource_type: "auto" }).catch(() => {});
    }

    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
