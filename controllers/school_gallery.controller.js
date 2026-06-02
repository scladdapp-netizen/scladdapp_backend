const SchoolGallery = require("../models/SchoolGallery.model");
const { checkStorageQuota } = require("../utils/storageCheck");

exports.getBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { page = 1, limit = 20, search = "" } = req.query;

    const query = { school_id: schoolId };
    if (search) {
      const q = { $regex: search, $options: "i" };
      query.$or = [{ caption: q }, { category: q }];
    }

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const totalRecords = await SchoolGallery.countDocuments(query);
    const totalPages   = Math.ceil(totalRecords / limitNum) || 1;
    const startIndex   = (pageNum - 1) * limitNum;

    const items = await SchoolGallery.find(query)
      .sort({ created_at: -1 })
      .skip(startIndex)
      .limit(limitNum)
      .lean();

    res.json({ success: true, data: items,
      pagination: { currentPage: pageNum, totalPages, totalRecords, recordsPerPage: limitNum,
        hasNextPage: pageNum < totalPages, hasPrevPage: pageNum > 1,
        startIndex: startIndex + 1, endIndex: Math.min(startIndex + limitNum, totalRecords) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { school_id, caption, category } = req.body;
    if (!school_id) return res.status(400).json({ success: false, message: "school_id is required" });
    if (!req.file)  return res.status(400).json({ success: false, message: "file is required" });

    const quota = await checkStorageQuota(school_id, req.file.size);
    if (!quota.allowed) return res.status(413).json({ success: false, message: quota.message });

    const url       = req.cloudinaryUrl;
    const public_id = req.cloudinaryPublicId;

    const item = await SchoolGallery.create({
      gallery_id:     Date.now().toString(),
      school_id,
      caption:        caption?.trim() || "",
      category:       category || "General",
      file_url:       url,
      file_public_id: public_id,
      file_name:      req.file.originalname,
      file_size:      req.file.size || 0,
    });

    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const item = await SchoolGallery.findOneAndDelete({ gallery_id: req.params.galleryId });
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
