const mongoose = require("mongoose");

const billPaymentSchema = new mongoose.Schema(
  {
    payment_id: { type: String, default: null },
    amount: { type: Number, default: 0 },
    payment_method: { type: String, default: null },
    reference: { type: String, default: null },
    note: { type: String, default: null },
    paid_at: { type: Date, default: null },
    recorded_by_id: { type: String, default: null },
    recorded_by_name: { type: String, default: null },
  },
  { _id: false }
);

const userBillSchema = new mongoose.Schema(
  {
    user_bill_id: { type: String, required: true, unique: true },
    bill_id: { type: String, required: true },
    school_id: { type: String, required: true },
    user_id: { type: String, required: true },
    user_name: { type: String, default: null },
    user_type: { type: String, default: null }, // "student", "staff", "alumni"
    amount_due: { type: Number, default: 0 },
    amount_paid: { type: Number, default: 0 },
    payment_status: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },
    due_date: { type: Date, default: null },
    paid_at: { type: Date, default: null },
    payments: { type: [billPaymentSchema], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("UserBill", userBillSchema);
