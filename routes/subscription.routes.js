const router = require("express").Router();
const ctrl = require("../controllers/subscription.controller");

router.get("/plans", ctrl.getPlans);
router.get("/school/:schoolId/dashboard", ctrl.getDashboard);
router.get("/school/:schoolId/payments/paginated", ctrl.getPaymentsPaginated);
router.post("/school/:schoolId/upgrade", ctrl.upgradeSubscription);
router.post("/school/:schoolId/cancel", ctrl.cancelSubscription);

module.exports = router;
