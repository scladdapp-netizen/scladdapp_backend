const express = require("express");
const router = express.Router();
const calendarController = require("../controllers/school_calendar.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

// Create a new calendar item
router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.created_by || "system",
        req.body.school_id,
        "CREATE_CALENDAR",
        "School Calendar",
        `Created calendar item "${req.body.title}" on ${req.body.calendar_date}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  calendarController.createCalendarItem(req, res, next);
});

// Get all calendar items for a subsession (with pagination)
router.get("/subsession/:subsessionId", calendarController.getCalendarItemsBySubsession);

// Get all calendar items for a school
router.get("/school/:schoolId", calendarController.getCalendarItemsBySchool);

// Get calendar item by ID
router.get("/:calendarId", calendarController.getCalendarItemById);

// Update calendar item
router.put("/:calendarId", (req, res, next) => {
  const { readData } = require("../utils/file");
  const items = readData("./data/school_calendar.json");
  const item = items.find((c) => c.calendar_id === req.params.calendarId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.modified_by || req.body.created_by || "system",
        item?.school_id,
        "EDIT_CALENDAR",
        "School Calendar",
        `Updated calendar item "${body.data?.title || item?.title}"`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  calendarController.updateCalendarItem(req, res, next);
});

// Delete calendar item
router.delete("/:calendarId", (req, res, next) => {
  const { readData } = require("../utils/file");
  const items = readData("./data/school_calendar.json");
  const item = items.find((c) => c.calendar_id === req.params.calendarId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || req.body?.modified_by || "system",
        item?.school_id,
        "DELETE_CALENDAR",
        "School Calendar",
        `Deleted calendar item "${item?.title}" (${item?.calendar_date})`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  calendarController.deleteCalendarItem(req, res, next);
});

module.exports = router;