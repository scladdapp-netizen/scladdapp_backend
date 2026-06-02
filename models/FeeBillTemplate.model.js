const mongoose = require("mongoose");

const feeBillTemplateSchema = new mongoose.Schema(
  {
    template_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    category: { type: String, default: null },
    // stored as JSON string in original data
    bill_items: { type: String, default: "[]" },
    total_amount: { type: Number, default: 0 },
    currency: { type: String, default: "NGN" },
    due_date_value: { type: String, default: null },
    allow_installments: { type: Boolean, default: false },
    installment_count: { type: Number, default: 1 },
    min_payment: { type: Number, default: 0 },
    created_by: { type: String, default: null },
    last_modified: { type: Date, default: Date.now },
    modified_by: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("FeeBillTemplate", feeBillTemplateSchema);
