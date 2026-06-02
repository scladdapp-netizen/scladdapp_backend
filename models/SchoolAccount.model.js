const mongoose = require("mongoose");

const schoolAccountSchema = new mongoose.Schema(
  {
    account_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    account_name: { type: String, required: true },
    account_number: { type: String, default: null },
    bank_name: { type: String, default: null },
    account_type: { type: String, default: null },
    balance: { type: String, default: "0" },
    currency: { type: String, default: "NGN" },
    is_default: { type: Boolean, default: false },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    description: { type: String, default: "" },
    created_by: { type: String, default: null },
    last_modified: { type: Date, default: Date.now },
    modified_by: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("SchoolAccount", schoolAccountSchema);
