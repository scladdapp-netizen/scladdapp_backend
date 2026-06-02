const FeeBillTemplate = require("../models/FeeBillTemplate.model");

const parseItems = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") { try { return JSON.parse(val); } catch { return []; } }
  return [];
};

const toResponse = (doc) => ({ ...doc, bill_items: parseItems(doc.bill_items) });

const validate = (data) => {
  const errors = [];
  if (!data.name?.trim())                                    errors.push("Template name is required");
  if (!data.bill_items?.length)                              errors.push("At least one bill item is required");
  if (!data.total_amount || parseFloat(data.total_amount) <= 0) errors.push("Total amount must be greater than 0");
  (data.bill_items || []).forEach((item, i) => {
    if (!item.item_name?.trim())              errors.push(`Bill item ${i + 1}: Item name is required`);
    if (!item.amount || parseFloat(item.amount) <= 0) errors.push(`Bill item ${i + 1}: Amount must be greater than 0`);
  });
  if (data.allow_installments) {
    if (!data.installment_count || data.installment_count < 2) errors.push("Installment count must be at least 2");
    if (!data.min_payment || parseFloat(data.min_payment) <= 0) errors.push("Minimum payment must be greater than 0");
  }
  return errors;
};

const normItems = (items) =>
  items.map((item) => ({ item_name: item.item_name || item.itemName, amount: parseFloat(item.amount) || 0, description: item.description || "" }));

// POST /fee-bill-template
exports.createFeeBillTemplate = async (req, res) => {
  try {
    if (!req.body.school_id) return res.status(400).json({ success: false, message: "School ID is required" });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const { school_id, name, description, category, bill_items, total_amount, currency,
            due_date_value, allow_installments, installment_count, min_payment, created_by } = req.body;

    const billItemsArray = normItems(bill_items);

    const template = await FeeBillTemplate.create({
      template_id:        Date.now().toString(),
      school_id,
      name:               name.trim(),
      description:        description?.trim() || "",
      status:             "active",
      category:           category || "Fees",
      bill_items:         JSON.stringify(billItemsArray),
      total_amount:       parseFloat(total_amount) || 0,
      currency:           currency || "NGN",
      due_date_value:     due_date_value?.trim() || "",
      allow_installments: allow_installments || false,
      installment_count:  allow_installments ? parseInt(installment_count) || 1 : 1,
      min_payment:        allow_installments ? parseFloat(min_payment) || 0 : 0,
      created_by:         created_by || null,
      last_modified:      new Date(),
      modified_by:        created_by || null,
    });

    console.log("Fee bill template created:", template.template_id);
    res.status(201).json({ success: true, message: "Fee bill template created successfully", data: toResponse(template.toObject()) });
  } catch (error) {
    console.error("Create fee bill template error:", error);
    res.status(500).json({ success: false, message: "Failed to create fee bill template", error: error.message });
  }
};

// GET /fee-bill-template/school/:schoolId
exports.getFeeBillTemplatesBySchool = async (req, res) => {
  try {
    const { schoolId } = req.params;
    if (!schoolId) return res.status(400).json({ success: false, message: "School ID is required" });

    const templates = await FeeBillTemplate.find({ school_id: schoolId }).lean();
    res.json({ success: true, data: templates.map(toResponse), count: templates.length });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve fee bill templates", error: error.message });
  }
};

// GET /fee-bill-template/:templateId
exports.getFeeBillTemplateById = async (req, res) => {
  try {
    const template = await FeeBillTemplate.findOne({ template_id: req.params.templateId }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Fee bill template not found" });
    res.json({ success: true, data: toResponse(template) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to retrieve fee bill template", error: error.message });
  }
};

// PUT /fee-bill-template/:templateId
exports.updateFeeBillTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    if (!templateId) return res.status(400).json({ success: false, message: "Template ID is required" });

    const errors = validate(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: "Validation failed", errors });

    const { name, description, category, bill_items, total_amount, currency,
            due_date_value, allow_installments, installment_count, min_payment, status, modified_by } = req.body;

    const template = await FeeBillTemplate.findOne({ template_id: templateId });
    if (!template) return res.status(404).json({ success: false, message: "Fee bill template not found" });

    const billItemsArray = bill_items ? normItems(bill_items) : parseItems(template.bill_items);

    if (name !== undefined)               template.name               = name.trim();
    if (description !== undefined)        template.description        = description.trim();
    if (category !== undefined)           template.category           = category;
    if (status !== undefined)             template.status             = status;
    if (total_amount !== undefined)       template.total_amount       = parseFloat(total_amount) || 0;
    if (currency !== undefined)           template.currency           = currency;
    if (due_date_value !== undefined)     template.due_date_value     = due_date_value.trim();
    if (allow_installments !== undefined) template.allow_installments = allow_installments;
    if (installment_count !== undefined)  template.installment_count  = parseInt(installment_count) || 1;
    if (min_payment !== undefined)        template.min_payment        = parseFloat(min_payment) || 0;
    template.bill_items    = JSON.stringify(billItemsArray);
    template.last_modified = new Date();
    template.modified_by   = modified_by || template.modified_by;
    await template.save();

    console.log("Fee bill template updated:", templateId);
    res.json({ success: true, message: "Fee bill template updated successfully", data: toResponse(template.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update fee bill template", error: error.message });
  }
};

// DELETE /fee-bill-template/:templateId
exports.deleteFeeBillTemplate = async (req, res) => {
  try {
    const template = await FeeBillTemplate.findOneAndDelete({ template_id: req.params.templateId }).lean();
    if (!template) return res.status(404).json({ success: false, message: "Fee bill template not found" });
    res.json({ success: true, message: "Fee bill template deleted successfully", data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete fee bill template", error: error.message });
  }
};

// POST /fee-bill-template/:templateId/duplicate
exports.duplicateFeeBillTemplate = async (req, res) => {
  try {
    const original = await FeeBillTemplate.findOne({ template_id: req.params.templateId }).lean();
    if (!original) return res.status(404).json({ success: false, message: "Fee bill template not found" });

    const { _id, ...rest } = original;
    const duplicate = await FeeBillTemplate.create({
      ...rest,
      template_id:   Date.now().toString(),
      name:          `${original.name} (Copy)`,
      status:        "draft",
      created_by:    req.body.created_by || original.created_by,
      last_modified: new Date(),
      modified_by:   req.body.created_by || original.created_by,
    });

    res.status(201).json({ success: true, message: "Fee bill template duplicated successfully", data: toResponse(duplicate.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to duplicate fee bill template", error: error.message });
  }
};

// PATCH /fee-bill-template/:templateId/status
exports.updateTemplateStatus = async (req, res) => {
  try {
    const { status, modified_by } = req.body;
    if (!["active", "draft", "archived"].includes(status)) {
      return res.status(400).json({ success: false, message: "Valid status is required (active, draft, or archived)" });
    }

    const template = await FeeBillTemplate.findOne({ template_id: req.params.templateId });
    if (!template) return res.status(404).json({ success: false, message: "Fee bill template not found" });

    template.status        = status;
    template.last_modified = new Date();
    template.modified_by   = modified_by || template.modified_by;
    await template.save();

    const label = status === "active" ? "activated" : status === "archived" ? "archived" : "set to draft";
    res.json({ success: true, message: `Fee bill template ${label} successfully`, data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to update template status", error: error.message });
  }
};

module.exports = exports;
