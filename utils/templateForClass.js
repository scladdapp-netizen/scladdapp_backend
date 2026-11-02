/** Pick assessment fields, grades, and traits for one class. Unlisted classes use the template default. */

function sliceOf(template, classId) {
  const base = {
    grading_fields: template?.grading_fields || [],
    grading_scheme: template?.grading_scheme || [],
    behavioral_traits: template?.behavioral_traits || [],
  };
  if (!template || classId == null || classId === "") return base;
  const id = String(classId);
  const hit = (template.class_overrides || []).find((row) =>
    (row.class_ids || []).some((cid) => String(cid) === id)
  );
  if (!hit) return base;
  return {
    grading_fields: hit.grading_fields || [],
    grading_scheme: hit.grading_scheme || [],
    behavioral_traits: hit.behavioral_traits || [],
  };
}

function applyClassOverride(template, classId) {
  if (!template) return template;
  return { ...template, ...sliceOf(template, classId) };
}

function unionFields(template, classIds) {
  const seen = new Map();
  const add = (fields) => {
    (fields || []).forEach((field) => {
      const name = field?.field_name;
      if (name && !seen.has(name)) seen.set(name, field);
    });
  };
  const ids = (classIds || []).map(String).filter(Boolean);
  if (!ids.length) add(template?.grading_fields);
  else ids.forEach((id) => add(sliceOf(template, id).grading_fields));
  return [...seen.values()];
}

module.exports = { sliceOf, applyClassOverride, unionFields };
