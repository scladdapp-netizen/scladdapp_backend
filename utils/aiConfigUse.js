const USE_WEBSITE = "website_editor";
const USE_TIMETABLE = "timetable_generator";
const USE_BOTH = "both";
const USE_TEMPLATE_IMAGE = "template_image";
const USE_TEMPLATE_CODE = "template_code";
const USE_SCHOOL_ASSISTANT = "school_assistant";

const OWN_USES = [USE_TEMPLATE_IMAGE, USE_TEMPLATE_CODE, USE_SCHOOL_ASSISTANT];

const VALID_USES = [USE_WEBSITE, USE_TIMETABLE, USE_BOTH, USE_TEMPLATE_IMAGE, USE_TEMPLATE_CODE, USE_SCHOOL_ASSISTANT];

/** Mongo filter: configs usable for a feature (website editor or timetable). */
function usesForFeature(feature) {
  if (OWN_USES.includes(feature)) return feature;
  return { $in: [feature, USE_BOTH] };
}

/** Config `use` values that conflict when activating another config. */
function conflictingUses(use) {
  if (OWN_USES.includes(use)) return [use];
  if (use === USE_BOTH) return [USE_WEBSITE, USE_TIMETABLE, USE_BOTH];
  return [use, USE_BOTH];
}

function configCoversFeature(configUse, feature) {
  if (OWN_USES.includes(feature)) return configUse === feature;
  return configUse === feature || configUse === USE_BOTH;
}

module.exports = {
  USE_WEBSITE,
  USE_TIMETABLE,
  USE_BOTH,
  USE_TEMPLATE_IMAGE,
  USE_TEMPLATE_CODE,
  USE_SCHOOL_ASSISTANT,
  VALID_USES,
  usesForFeature,
  conflictingUses,
  configCoversFeature,
};
