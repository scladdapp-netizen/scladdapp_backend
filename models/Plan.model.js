const mongoose = require("mongoose");

const planSchema = new mongoose.Schema(
  {
    plan_id: { type: String, required: true, unique: true }, // maps to $id
    plan_name: { type: String, required: true },
    plan_type: { type: String, default: null }, // "Free" or "paid"
    description: { type: String, default: "" },
    max_students: { type: String, default: null },
    max_staff: { type: String, default: null },
    max_subadmin: { type: String, default: null },
    max_storage_gb: { type: Number, default: 0 },
    ai_assistant: { type: Boolean, default: false },
    price: { type: mongoose.Schema.Types.Mixed, default: 0 }, // can be string "₦0" or number
    featured: { type: Boolean, default: false },
    quataly_price: { type: Number, default: 0 },
    yearly_price: { type: Number, default: 0 },
    monthly_price: { type: Number, default: 0 },
    features: { type: [String], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("Plan", planSchema);
