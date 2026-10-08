const express = require("express");
const router = express.Router({ mergeParams: true });
const { ask } = require("../controllers/schoolAssistant.controller");

router.post("/", ask);

module.exports = router;
