const SchoolResource = require("../models/SchoolResource.model");
const { checkStorageQuota } = require("../utils/storageCheck");

exports.getBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 15, search = "", visibility = "" } = req.query;

    const query = { school_id: schoolId };
    if (visibility) query.visibility = visibility;
    if (search) {
      const q = { $regex: search, $options: "i" };
      query.$or = [{ name: q }, { category: q }, { description: q }];
    }

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const totalRecords = await SchoolResource.countDocuments(query);
    const totalPages   = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex   = (pageNum - 1) * limitNum;

    const resources = await SchoolResource.find(query)
      .sort({ created_at: -1 })
      .skip(startIndex)
      .limit(limitNum)
      .lean();

    res.json({ success: true, data: resources,
      pagination: { currentPage: pageNum, totalPages, totalRecords, recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
        startIndex: startIndex + 1, endIndex: Math.min(startIndex + limitNum, totalRecords) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const resource = await SchoolResource.findOne({ resource_id: req.params.resourceId }).lean();
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { school_id, name, description, category, visibility } = req.body;
    if (!school_id)    return res.status(400).json({ success: false, message: "school_id is required" });
    if (!name?.trim()) return res.status(400).json({ success: false, message: "name is required" });
    if (!req.file)     return res.status(400).json({ success: false, message: "file is required" });

    const quota = await checkStorageQuota(school_id, req.file.size);
    if (!quota.allowed) return res.status(413).json({ success: false, message: quota.message });

    const url       = req.cloudinaryUrl;
    const public_id = req.cloudinaryPublicId;

    const resource = await SchoolResource.create({
      resource_id:    Date.now().toString(),
      school_id,
      name:           name.trim(),
      description:    description?.trim() || "",
      category:       category || "General",
      visibility:     visibility === "private" ? "private" : "public",
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

exports.update = async (req, res) => {
  try {
    const resource = await SchoolResource.findOne({ resource_id: req.params.resourceId });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });

    const { name, description, category, visibility } = req.body;
    if (name        !== undefined) resource.name        = name.trim();
    if (description !== undefined) resource.description = description.trim();
    if (category    !== undefined) resource.category    = category;
    if (visibility  !== undefined) resource.visibility  = visibility === "private" ? "private" : "public";
    await resource.save();

    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.incrementDownload = async (req, res) => {
  try {
    const resource = await SchoolResource.findOne({ resource_id: req.params.resourceId });
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
    const resource = await SchoolResource.findOneAndDelete({ resource_id: req.params.resourceId });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
