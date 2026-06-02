const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    payment_id: { type: String, required: true, unique: true },
    subscription_id: { type: String, required: true },
    school_id: { type: String, required: true },
    payment_provider: { type: String, default: null },
    provider_transaction_id: { type: String, default: null },
    payment_method: { type: String, default: null },
    amount_paid: { type: Number, default: 0 },
    currency: { type: String, default: "NGN" },
    tax_amount: { type: Number, default: 0 },
    discount_amount: { type: Number, default: 0 },
    total_amount: { type: Number, default: 0 },
    billing_cycle: { type: String, default: null },
    billing_period_start: { type: Date, default: null },
    billing_period_end: { type: Date, default: null },
    payment_status: { type: String, enum: ["pending", "completed", "failed", "refunded"], default: "pending" },
    payment_date: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Payment", paymentSchema);
