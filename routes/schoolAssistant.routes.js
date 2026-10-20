const express = require("express");
const router = express.Router({ mergeParams: true });
const { ask } = require("../controllers/schoolAssistant.controller");
const { designFromImage } = require("../controllers/idCardDesign.controller");

router.post("/", ask);
router.post("/id-card-design", designFromImage);

module.exports = router;
