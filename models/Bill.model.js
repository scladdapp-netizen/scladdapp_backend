const mongoose = require("mongoose");

const billItemSchema = new mongoose.Schema(
  {
    item_name: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    bill_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    template_id: { type: String, default: null },
    fee_code: { type: String, default: null },
    fee_name: { type: String, default: null },
    category: { type: String, default: null },
    description: { type: String, default: "" },
    total_amount: { type: Number, default: 0 },
    currency: { type: String, default: "NGN" },
    allow_installments: { type: Boolean, default: false },
    installment_count: { type: Number, default: null },
    min_payment: { type: Number, default: null },
    bill_items: { type: [billItemSchema], default: [] },
    school_account_id: { type: String, default: null },
    mandatory: { type: Boolean, default: false },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    target_type: { type: String, default: "whole_school" },
    created_by_id: { type: String, default: null },
    created_by_name: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Bill", billSchema);
