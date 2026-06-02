const router = require("express").Router();
const ctrl = require("../controllers/notification.controller");
const { logActivity } = require("../controllers/staff_activity.controller");

router.post("/", (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body.created_by_id || "system",
        req.body.school_id,
        "SEND_NOTIFICATION",
        "Notifications",
        `Sent notification to ${body.data?.recipients_count || 0} recipient(s) (${req.body.target_type})`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.createNotification(req, res, next);
});

router.get("/school/:schoolId/paginated", ctrl.getNotificationsBySchoolPaginated);
router.get("/school/:schoolId", ctrl.getNotificationsBySchool);
router.get("/user/:userId/paginated", ctrl.getUserNotificationsPaginated);
router.get("/user/:userId", ctrl.getUserNotifications);
router.get("/:notificationId/recipients/paginated", ctrl.getRecipientsPaginated);
router.get("/:notificationId", ctrl.getNotificationById);
router.patch("/user/:userNotificationId/read", ctrl.markAsRead);

router.delete("/:notificationId", (req, res, next) => {
  const { readData } = require("../utils/file");
  const notifications = readData("./data/notifications.json");
  const notification = notifications.find((n) => n.notification_id === req.params.notificationId);

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body?.success) {
      logActivity(
        req.body?.deleted_by || "system",
        notification?.school_id,
        "DELETE_NOTIFICATION",
        "Notifications",
        `Deleted notification (${req.params.notificationId})`,
        "success",
        "admin"
      );
    }
    return originalJson(body);
  };
  ctrl.deleteNotification(req, res, next);
});

module.exports = router;
