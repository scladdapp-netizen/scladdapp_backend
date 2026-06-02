const Subscription = require("../models/Subscription.model");
const Plan = require("../models/Plan.model");
const ClassResource = require("../models/ClassResource.model");
const TeacherResource = require("../models/TeacherResource.model");
const StaffResource = require("../models/StaffResource.model");
const SubjectResource = require("../models/SubjectResource.model");
const StaffCredential = require("../models/StaffCredential.model");
const SchoolResource = require("../models/SchoolResource.model");
const SchoolGallery = require("../models/SchoolGallery.model");

/**
 * Check if a school has enough storage quota to upload a file.
 * @param {string} schoolId
 * @param {number} newFileSizeBytes
 * @returns {Promise<{ allowed: boolean, message?: string, usedGB: number, limitGB: number }>}
 */
const checkStorageQuota = async (schoolId, newFileSizeBytes = 0) => {
  try {
    const activeSub = await Subscription.findOne({
      school_id: schoolId,
      subscription_status: { $in: ["active", "trialing"] },
    }).sort({ end_date: -1 });

    const plan = activeSub ? await Plan.findOne({ plan_id: String(activeSub.plan_id) }) : null;
    const limitGB = plan?.max_storage_gb || 1;
    const limitBytes = limitGB * 1024 * 1024 * 1024;

    // Sum file_size across all resource collections for this school
    const collections = [
      ClassResource, TeacherResource, StaffResource,
      SubjectResource, StaffCredential, SchoolResource, SchoolGallery,
    ];

    let usedBytes = 0;
    for (const Model of collections) {
      try {
        const result = await Model.aggregate([
          { $match: { school_id: schoolId } },
          { $group: { _id: null, total: { $sum: "$file_size" } } },
        ]);
        usedBytes += result[0]?.total || 0;
      } catch { /* collection may be empty */ }
    }

    const usedGB = parseFloat((usedBytes / (1024 ** 3)).toFixed(3));

    if (usedBytes + newFileSizeBytes > limitBytes) {
      const newTotalGB = parseFloat(((usedBytes + newFileSizeBytes) / (1024 ** 3)).toFixed(3));
      return {
        allowed: false,
        usedGB,
        limitGB,
        message: `Storage limit exceeded. Used: ${usedGB} GB, Limit: ${limitGB} GB, File would bring total to: ${newTotalGB} GB.`,
      };
    }

    return { allowed: true, usedGB, limitGB };
  } catch {
    return { allowed: true, usedGB: 0, limitGB: 1 };
  }
};

module.exports = { checkStorageQuota };
