const StudentResource = require("../models/StudentResource.model");

exports.getByStudent = async (req, res) => {
  try {
    const resources = await StudentResource.find({ student_id: req.params.studentId }).lean();
    res.json({ success: true, data: resources, count: resources.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const r = await StudentResource.findOne({ resource_id: req.params.resourceId }).lean();
    if (!r) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { student_id, school_id, name, description, category, uploaded_by_id, uploaded_by_name } = req.body;
    if (!student_id)   return res.status(400).json({ success: false, message: "student_id is required" });
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name is required" });
    if (!req.file)     return res.status(400).json({ success: false, message: "file is required" });

    const url       = req.cloudinaryUrl;
    const public_id = req.cloudinaryPublicId;
    const r = await StudentResource.create({
      resource_id:      Date.now().toString(),
      student_id,
      school_id:        school_id || null,
      name:             name.trim(),
      description:      description?.trim() || "",
      category:         category || "General",
      file_name:        req.file.originalname,
      file_type:        req.file.originalname.split(".").pop().toLowerCase(),
      file_url:         url,
      file_public_id:   public_id,
      download_count:   0,
      uploaded_by_id:   uploaded_by_id || null,
      uploaded_by_name: uploaded_by_name || null,
    });
    res.status(201).json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const r = await StudentResource.findOne({ resource_id: req.params.resourceId });
    if (!r) return res.status(404).json({ success: false, message: "Resource not found" });
    const { name, description, category } = req.body;
    if (name !== undefined)        r.name        = name.trim();
    if (description !== undefined) r.description = description.trim();
    if (category !== undefined)    r.category    = category;
    r.updated_at = new Date();
    await r.save();
    res.json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.incrementDownload = async (req, res) => {
  try {
    const r = await StudentResource.findOne({ resource_id: req.params.resourceId });
    if (!r) return res.status(404).json({ success: false, message: "Resource not found" });
    r.download_count = (r.download_count || 0) + 1;
    await r.save();
    res.json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    const r = await StudentResource.findOneAndDelete({ resource_id: req.params.resourceId });
    if (!r) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data: r });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
