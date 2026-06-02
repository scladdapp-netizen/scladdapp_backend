const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/staff_performance.controller");

router.get("/:staffId", ctrl.getByStaff);
router.get("/:staffId/paginated", ctrl.getByStaffPaginated);
router.get("/record/:id", ctrl.getById);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
