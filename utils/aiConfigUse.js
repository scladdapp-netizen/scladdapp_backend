const USE_WEBSITE = "website_editor";
const USE_TIMETABLE = "timetable_generator";
const USE_BOTH = "both";

const VALID_USES = [USE_WEBSITE, USE_TIMETABLE, USE_BOTH];

/** Mongo filter: configs usable for a feature (website editor or timetable). */
function usesForFeature(feature) {
  return { $in: [feature, USE_BOTH] };
}

/** Config `use` values that conflict when activating another config. */
function conflictingUses(use) {
  if (use === USE_BOTH) return [USE_WEBSITE, USE_TIMETABLE, USE_BOTH];
  return [use, USE_BOTH];
}

function configCoversFeature(configUse, feature) {
  return configUse === feature || configUse === USE_BOTH;
}

module.exports = {
  USE_WEBSITE,
  USE_TIMETABLE,
  USE_BOTH,
  VALID_USES,
  usesForFeature,
  conflictingUses,
  configCoversFeature,
};
