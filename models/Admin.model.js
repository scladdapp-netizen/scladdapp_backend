const mongoose = require("mongoose");

const permissionActionSchema = new mongoose.Schema(
  {
    read: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
  },
  { _id: false }
);

const adminSchema = new mongoose.Schema(
  {
    admin_id: { type: String, required: true, unique: true },
    staff_id: { type: String, default: null },
    school_id: { type: String, required: true },
    username: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, default: null },
    admin_role: { type: String, default: "Super Admin" },
    access_scope: { type: String, enum: ["full", "limited"], default: "full" },
    // permissions can be ["ALL"] array or an object of module permissions
    permissions: { type: mongoose.Schema.Types.Mixed, default: ["ALL"] },
    is_active: { type: Boolean, default: true },
    assigned_by: { type: String, default: null },
    assigned_at: { type: Date, default: Date.now },
    revoked_at: { type: Date, default: null },
    two_fac_auth: { type: Boolean, default: false },
    updated_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

module.exports = mongoose.model("Admin", adminSchema);
