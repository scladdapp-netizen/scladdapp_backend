require("dotenv").config();
const mongoose = require("mongoose");
const Plan = require("../models/Plan.model");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME });
  const filter = { $or: [{ plan_id: "1236" }, { plan_id: 1236 }, { plan_name: "Basic Plan" }] };
  const result = await Plan.updateMany(filter, {
    $set: {
      max_students: "200",
      max_staff: "50",
      max_subadmin: "4",
      max_storage_gb: 5,
    },
  });
  console.log("matched", result.matchedCount, "modified", result.modifiedCount);
  const plans = await Plan.find(filter).lean();
  console.log(JSON.stringify(plans.map((p) => ({
    plan_id: p.plan_id,
    plan_name: p.plan_name,
    max_students: p.max_students,
    max_staff: p.max_staff,
    max_subadmin: p.max_subadmin,
    max_storage_gb: p.max_storage_gb,
  })), null, 2));
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
