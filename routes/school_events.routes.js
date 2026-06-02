const express = require("express");
const router = express.Router();
const eventsController = require("../controllers/school_events.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

// Create a new event
router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.created_by || "system",
        req.body.school_id,
        "CREATE_EVENT",
        "School Events",
        `Created event "${req.body.title}" on ${req.body.event_date}`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  eventsController.createEvent(req, res, next);
});

// Get all events for a subsession (with pagination)
router.get("/subsession/:subsessionId", eventsController.getEventsBySubsession);

// Get all events for a school
router.get("/school/:schoolId", eventsController.getEventsBySchool);

// Get event by ID
router.get("/:eventId", eventsController.getEventById);

// Update event
router.put("/:eventId", (req, res, next) => {
  // Read event before update to get school_id and title for the log
  const { readData } = require("../utils/file");
  const events = readData("./data/school_events.json");
  const event = events.find((e) => e.event_id === req.params.eventId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.modified_by || req.body.created_by || "system",
        event?.school_id,
        "EDIT_EVENT",
        "School Events",
        `Updated event "${body.data?.title || event?.title}"`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  eventsController.updateEvent(req, res, next);
});

// Delete event
router.delete("/:eventId", (req, res, next) => {
  const { readData } = require("../utils/file");
  const events = readData("./data/school_events.json");
  const event = events.find((e) => e.event_id === req.params.eventId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || req.body?.modified_by || "system",
        event?.school_id,
        "DELETE_EVENT",
        "School Events",
        `Deleted event "${event?.title}" (${event?.event_date})`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  eventsController.deleteEvent(req, res, next);
});

module.exports = router;