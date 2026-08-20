/**
 * PortalAdmin — dedicated collection for the scladdapp_admin portal
 *
 * Completely separate from the main app's Admin / User collections.
 * Collection name: portal_admins
 */

const mongoose = require("mongoose");

const portalAdminSchema = new mongoose.Schema(
  {
    portal_admin_id: { type: String, required: true, unique: true },

    // identity
    username:   { type: String, required: true },
    email:      { type: String, required: true, unique: true },

    // auth — null means "no password set yet" (triggers create-password flow)
    password:   { type: String, default: null },

    // role inside the portal
    role:       { type: String, enum: ["super_admin", "admin"], default: "super_admin" },

    // status
    is_active:  { type: Boolean, default: true },

    // audit
    last_login_at: { type: Date, default: null },
    updated_at:    { type: Date, default: null },
  },
  {
    timestamps:  { createdAt: "created_at", updatedAt: false },
    collection:  "portal_admins",   // explicit collection name — never touches admin / users
  }
);

module.exports = mongoose.model("PortalAdmin", portalAdminSchema);
