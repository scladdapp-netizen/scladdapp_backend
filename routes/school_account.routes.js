const express = require("express");
const router = express.Router();
const schoolAccountController = require("../controllers/school_account.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

// Fetch bank list from Paystack
router.get("/banks", schoolAccountController.getBankList);

// Verify bank account via Paystack
router.get("/verify", schoolAccountController.verifyBankAccount);

// Create Paystack subaccount
router.post("/subaccount", schoolAccountController.createPaystackSubaccount);

// Create a new school account
router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.created_by || "system",
        req.body.school_id,
        "CREATE_ACCOUNT",
        "School Account",
        `Created account "${req.body.account_name}" at ${req.body.bank_name}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  schoolAccountController.createSchoolAccount(req, res, next);
});

// Get all school accounts for a school
router.get("/school/:schoolId", schoolAccountController.getSchoolAccountsBySchool);

// Get a single school account by ID
router.get("/:accountId", schoolAccountController.getSchoolAccountById);

// Update a school account
router.put("/:accountId", (req, res, next) => {
  const { readData } = require("../utils/file");
  const accounts = readData("./data/school_accounts.json");
  const account = accounts.find((a) => a.account_id === req.params.accountId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.modified_by || "system",
        account?.school_id,
        "EDIT_ACCOUNT",
        "School Account",
        `Updated account "${body.data?.account_name || account?.account_name}"`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  schoolAccountController.updateSchoolAccount(req, res, next);
});

// Delete a school account
router.delete("/:accountId", (req, res, next) => {
  const { readData } = require("../utils/file");
  const accounts = readData("./data/school_accounts.json");
  const account = accounts.find((a) => a.account_id === req.params.accountId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        account?.school_id,
        "DELETE_ACCOUNT",
        "School Account",
        `Deleted account "${account?.account_name}" at ${account?.bank_name}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  schoolAccountController.deleteSchoolAccount(req, res, next);
});

// Set account as default
router.patch("/:accountId/default", (req, res, next) => {
  const { readData } = require("../utils/file");
  const accounts = readData("./data/school_accounts.json");
  const account = accounts.find((a) => a.account_id === req.params.accountId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.modified_by || "system",
        account?.school_id,
        "SET_DEFAULT_ACCOUNT",
        "School Account",
        `Set "${account?.account_name}" as default account`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  schoolAccountController.setDefaultAccount(req, res, next);
});

module.exports = router;
