const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    subscription_id: { type: String, required: true, unique: true },
    school_id: { type: String, required: true },
    plan_id: { type: mongoose.Schema.Types.Mixed, required: true }, // number or string
    subscription_type: { type: String, default: null }, // "free" or "paid"
    subscription_status: { type: String, default: "active" },
    start_date: { type: Date, default: null },
    end_date: { type: Date, default: null },
    canceled_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
