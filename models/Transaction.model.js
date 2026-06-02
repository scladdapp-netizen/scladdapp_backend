const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    transaction_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    type: { type: String, enum: ["income", "expense"], required: true },
    title: { type: String, required: true },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "NGN" },
    category: { type: String, default: null },
    description: { type: String, default: null },
    date: { type: String, default: null },
    payment_method: { type: String, default: null },
    reference: { type: String, default: null },
    status: { type: String, default: "completed" },
    school_account_id: { type: String, default: null },
    created_by_id: { type: String, default: null },
    created_by_name: { type: String, default: null },
    approved_by_id: { type: String, default: null },
    approved_by_name: { type: String, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Transaction", transactionSchema);
