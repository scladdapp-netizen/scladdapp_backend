require("dotenv").config();
const mongoose = require("mongoose");
const Plan = require("../models/Plan.model");

function halfYearRate(plan) {
  const monthly = Number(plan.monthly_price) || 0;
  const quarterly = Number(plan.quataly_price) || 0;
  const yearly = Number(plan.yearly_price) || 0;
  if (!monthly && !quarterly && !yearly) return 0;
  if (quarterly && yearly) return Math.round(((quarterly + yearly) / 2) / 100) * 100;
  if (monthly) return Math.round((monthly * 0.85) / 100) * 100;
  return quarterly || yearly;
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME });
  const plans = await Plan.find({}).lean();
  const updates = [];

  for (const plan of plans) {
    const current = Number(plan.half_year_price) || 0;
    if (current > 0) {
      updates.push({ plan_name: plan.plan_name, half_year_price: current, action: "kept" });
      continue;
    }
    const next = halfYearRate(plan);
    await Plan.collection.updateOne({ _id: plan._id }, { $set: { half_year_price: next } });
    updates.push({ plan_name: plan.plan_name, half_year_price: next, action: "set" });
  }

  const saved = await Plan.find({}).select("plan_name monthly_price quataly_price half_year_price yearly_price").lean();
  console.log(JSON.stringify(saved.map((p) => ({
    plan_name: p.plan_name,
    monthly: p.monthly_price,
    quarterly: p.quataly_price,
    half_year: p.half_year_price,
    yearly: p.yearly_price,
  })), null, 2));
  console.log("updates", JSON.stringify(updates));
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
