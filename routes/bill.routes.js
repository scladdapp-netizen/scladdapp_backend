const router = require("express").Router();
const ctrl = require("../controllers/bill.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

// Create bill
router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.created_by_id || "system",
        req.body.school_id,
        "CREATE_BILL",
        "Fee Billing",
        `Created bill "${req.body.fee_name}" for ${body.data?.recipients_count || 0} recipient(s) (${req.body.target_type})`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.createBill(req, res, next);
});

router.get("/school/:schoolId/paginated", ctrl.getBillsBySchoolPaginated);
router.get("/user/:userId", ctrl.getBillsByUser);
router.get("/:billId/recipients/paginated", ctrl.getRecipientsPaginated);
router.get("/:billId", ctrl.getBillById);

// Record payment
router.post("/:billId/recipients/:userBillId/payment", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.recorded_by_id || "system",
        body.data?.school_id,
        "RECORD_PAYMENT",
        "Fee Billing",
        `Recorded payment of ${req.body.amount} for bill ${req.params.billId} (user bill ${req.params.userBillId})`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.recordPayment(req, res, next);
});

// Update bill status
router.patch("/:billId/status", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.modified_by || "system",
        body.data?.school_id,
        req.body.status === "Active" ? "ACTIVATE_BILL" : "DEACTIVATE_BILL",
        "Fee Billing",
        `Changed bill status to "${req.body.status}"`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.updateBillStatus(req, res, next);
});

// Delete bill
router.delete("/:billId", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        null,
        "DELETE_BILL",
        "Fee Billing",
        `Deleted bill ${req.params.billId}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.deleteBill(req, res, next);
});

module.exports = router;
