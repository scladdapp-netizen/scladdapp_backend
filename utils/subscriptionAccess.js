/**
 * School subscription access helpers.
 * Active = status active|trialing AND end_date in the future.
 */
const Subscription = require("../models/Subscription.model");

const getLatestSubscription = async (schoolId) => {
  if (!schoolId) return null;
  return Subscription.findOne({ school_id: String(schoolId) })
    .sort({ end_date: -1, created_at: -1 })
    .lean();
};

/**
 * @returns {{ canMutate: boolean, isExpired: boolean, hasSubscription: boolean, subscription: object|null, message: string }}
 */
const getSubscriptionAccess = async (schoolId) => {
  const subscription = await getLatestSubscription(schoolId);
  if (!subscription) {
    return {
      canMutate: false,
      isExpired: false,
      hasSubscription: false,
      subscription: null,
      message:
        "Renew your plan to continue with daily school activity.",
      code: "subscription_missing",
    };
  }

  const now = new Date();
  const end = subscription.end_date ? new Date(subscription.end_date) : null;
  const statusOk =
    subscription.subscription_status === "active" ||
    subscription.subscription_status === "trialing";
  const notExpired = end && end > now;
  const canMutate = !!(statusOk && notExpired);
  const isExpired = !!(end && end <= now);
  const isCancelled =
    String(subscription.subscription_status || "").toLowerCase() === "cancelled" ||
    String(subscription.subscription_status || "").toLowerCase() === "canceled";

  if (canMutate) {
    return {
      canMutate: true,
      isExpired: false,
      hasSubscription: true,
      subscription,
      message: "",
      code: null,
    };
  }

  return {
    canMutate: false,
    isExpired,
    hasSubscription: true,
    subscription,
    message: isCancelled
      ? "Your subscription was cancelled. Renew to continue with daily school activity."
      : isExpired
        ? "Your subscription has expired. Renew to continue with daily school activity."
        : "Renew your plan to continue with daily school activity.",
    code: isCancelled
      ? "subscription_cancelled"
      : isExpired
        ? "subscription_expired"
        : "subscription_inactive",
  };
};

module.exports = { getLatestSubscription, getSubscriptionAccess };
