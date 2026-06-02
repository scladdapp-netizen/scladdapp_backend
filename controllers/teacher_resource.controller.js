const TeacherResource = require("../models/TeacherResource.model");
const { uploadToCloudinary } = require("../utils/cloudinary");
const cloudinary = require("cloudinary").v2;
const { checkStorageQuota } = require("../utils/storageCheck");

exports.getByTeacher = async (req, res) => {
  try {
    const resources = await TeacherResource.find({ teacher_id: req.params.teacherId }).lean();
    res.json({ success: true, data: resources, count: resources.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const resource = await TeacherResource.findOne({ resource_id: req.params.resourceId }).lean();
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { teacher_id, school_id, name, description, category } = req.body;
    if (!teacher_id)   return res.status(400).json({ success: false, message: "teacher_id is required" });
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name is required" });
    if (!req.file)     return res.status(400).json({ success: false, message: "file is required" });

    const quota = await checkStorageQuota(school_id, req.file.size);
    if (!quota.allowed) return res.status(413).json({ success: false, message: quota.message });

    const { url, public_id } = await uploadToCloudinary(req.file.buffer, "scladapp/teacher_resources", "auto");

    const resource = await TeacherResource.create({
      resource_id:    Date.now().toString(),
      teacher_id,
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
    });

    res.status(201).json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.incrementDownload = async (req, res) => {
  try {
    const resource = await TeacherResource.findOne({ resource_id: req.params.resourceId });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    resource.download_count = (resource.download_count || 0) + 1;
    await resource.save();
    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const resource = await TeacherResource.findOneAndDelete({ resource_id: req.params.resourceId });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    if (resource.file_public_id) {
      await cloudinary.uploader.destroy(resource.file_public_id, { resource_type: "auto" }).catch(() => {});
    }
    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
