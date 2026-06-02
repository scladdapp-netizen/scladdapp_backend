const router = require("express").Router();
const ctrl = require("../controllers/transaction.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.created_by_id || "system",
        req.body.school_id,
        "CREATE_TRANSACTION",
        "Transactions",
        `Created ${req.body.type} transaction "${req.body.title}" — ${req.body.amount} ${req.body.currency || "NGN"}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.createTransaction(req, res, next);
});

router.get("/school/:schoolId/paginated", ctrl.getTransactionsPaginated);
router.get("/:transactionId", ctrl.getTransactionById);

router.put("/:transactionId", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.modified_by_id || req.body.created_by_id || "system",
        req.body.school_id,
        "EDIT_TRANSACTION",
        "Transactions",
        `Updated transaction "${body.data?.title}"`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.updateTransaction(req, res, next);
});

router.delete("/:transactionId", async (req, res, next) => {
  // Fetch from MongoDB for the activity log
  const Transaction = require("../models/Transaction.model");
  const transaction = await Transaction.findOne({ transaction_id: req.params.transactionId }).lean().catch(() => null);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        transaction?.school_id,
        "DELETE_TRANSACTION",
        "Transactions",
        `Deleted ${transaction?.type} transaction "${transaction?.title}" — ${transaction?.amount} ${transaction?.currency || "NGN"}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.deleteTransaction(req, res, next);
});

module.exports = router;
