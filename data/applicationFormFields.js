/** Catalog of all configurable student application form fields (sections 1–9). */

const APPLICATION_FORM_SECTIONS = [
  {
    id: "application_details",
    title: "1. Application Details",
    fields: [
      { id: "class_applying", label: "Class applying for", type: "select", options: [], defaultEnabled: true },
      { id: "admission_type", label: "Admission type", type: "select", options: ["New student", "Transfer"], defaultEnabled: true },
      { id: "previous_school", label: "Previous school name", type: "text", defaultEnabled: false },
      { id: "last_class_completed", label: "Last class completed", type: "text", defaultEnabled: false },
      { id: "reason_for_leaving", label: "Reason for leaving previous school", type: "textarea", defaultEnabled: false },
      { id: "how_heard_about_us", label: "How did you hear about us?", type: "text", defaultEnabled: false },
    ],
  },
  {
    id: "student_personal",
    title: "2. Student Personal Information",
    fields: [
      { id: "full_name", label: "Full name", type: "text", defaultEnabled: true },
      { id: "date_of_birth", label: "Date of birth", type: "date", defaultEnabled: true },
      { id: "gender", label: "Gender", type: "select", options: ["Male", "Female"], defaultEnabled: true },
      { id: "student_photo", label: "Student photo", type: "file", defaultEnabled: true },
      { id: "email", label: "Student email", type: "email", defaultEnabled: true, locked: true },
      { id: "phone", label: "Student phone", type: "tel", defaultEnabled: false },
      { id: "whatsapp", label: "Student WhatsApp", type: "tel", defaultEnabled: false },
      { id: "nationality", label: "Nationality", type: "text", defaultEnabled: false },
      { id: "state_of_origin", label: "State of origin", type: "text", defaultEnabled: false },
      { id: "lga_of_origin", label: "LGA of origin", type: "text", defaultEnabled: false },
      { id: "place_of_birth", label: "Place of birth", type: "text", defaultEnabled: false },
      { id: "religion", label: "Religion", type: "text", defaultEnabled: false },
      { id: "nin", label: "NIN", type: "text", defaultEnabled: false },
      { id: "blood_group", label: "Blood group", type: "text", defaultEnabled: false },
      { id: "genotype", label: "Genotype", type: "text", defaultEnabled: false },
    ],
  },
  {
    id: "home_family",
    title: "3. Home & Family",
    fields: [
      { id: "address", label: "Home address", type: "textarea", defaultEnabled: true },
      { id: "house_number_street", label: "House number & street", type: "text", defaultEnabled: false },
      { id: "area_estate", label: "Area / estate", type: "text", defaultEnabled: false },
      { id: "city", label: "City", type: "text", defaultEnabled: false },
      { id: "lga_of_residence", label: "LGA of residence", type: "text", defaultEnabled: false },
      { id: "state_of_residence", label: "State of residence", type: "text", defaultEnabled: false },
      { id: "landmark", label: "Landmark", type: "text", defaultEnabled: false },
      { id: "lives_with", label: "Who does the child live with?", type: "text", defaultEnabled: false },
      { id: "number_of_siblings", label: "Number of siblings", type: "text", defaultEnabled: false },
      { id: "family_position", label: "Family position", type: "text", defaultEnabled: false },
    ],
  },
  {
    id: "parent_guardian",
    title: "4. Parent / Guardian",
    fields: [
      { id: "guardian_name", label: "Parent/guardian full name", type: "text", defaultEnabled: true },
      { id: "guardian_relationship", label: "Relationship to student", type: "text", defaultEnabled: true },
      { id: "guardian_phone", label: "Parent/guardian phone", type: "tel", defaultEnabled: true },
      { id: "guardian_whatsapp", label: "Parent/guardian WhatsApp", type: "tel", defaultEnabled: false },
      { id: "guardian_email", label: "Parent/guardian email", type: "email", defaultEnabled: true },
      { id: "guardian_occupation", label: "Parent/guardian occupation", type: "text", defaultEnabled: false },
      { id: "guardian_address", label: "Parent/guardian address", type: "textarea", defaultEnabled: false },
      { id: "second_guardian_name", label: "Second parent/guardian name", type: "text", defaultEnabled: false },
      { id: "second_guardian_phone", label: "Second parent/guardian phone", type: "tel", defaultEnabled: false },
      { id: "second_guardian_email", label: "Second parent/guardian email", type: "email", defaultEnabled: false },
    ],
  },
  {
    id: "emergency_contact",
    title: "5. Emergency Contact",
    fields: [
      { id: "emergency_contact_name", label: "Emergency contact name", type: "text", defaultEnabled: true },
      { id: "emergency_contact_phone", label: "Emergency contact phone", type: "tel", defaultEnabled: true },
      { id: "emergency_contact_whatsapp", label: "Emergency contact WhatsApp", type: "tel", defaultEnabled: false },
      { id: "emergency_contact_relationship", label: "Relationship to student", type: "text", defaultEnabled: false },
    ],
  },
  {
    id: "academic_background",
    title: "6. Academic Background",
    fields: [
      { id: "years_in_last_school", label: "Years spent in last school", type: "text", defaultEnabled: false },
      { id: "performance_summary", label: "Subjects / performance summary", type: "textarea", defaultEnabled: false },
      { id: "transfer_certificate", label: "Transfer certificate upload", type: "file", defaultEnabled: false },
      { id: "last_report_card", label: "Last report card upload", type: "file", defaultEnabled: false },
    ],
  },
  {
    id: "medical_information",
    title: "7. Medical Information",
    fields: [
      { id: "allergies", label: "Known allergies", type: "textarea", defaultEnabled: false },
      { id: "medical_conditions", label: "Medical conditions", type: "textarea", defaultEnabled: false },
      { id: "medication_needs", label: "Medication needs", type: "textarea", defaultEnabled: false },
      { id: "doctor_contact", label: "Doctor/hospital contact", type: "text", defaultEnabled: false },
      { id: "special_needs", label: "Special needs / learning support", type: "textarea", defaultEnabled: false },
    ],
  },
  {
    id: "documents",
    title: "8. Documents",
    fields: [
      { id: "birth_certificate", label: "Birth certificate upload", type: "file", defaultEnabled: false },
      { id: "medical_report", label: "Medical report upload", type: "file", defaultEnabled: false },
    ],
  },
  {
    id: "declaration",
    title: "9. Declaration",
    fields: [
      { id: "declarant_name", label: "Parent/guardian full name (declaration)", type: "text", defaultEnabled: true },
      { id: "information_accurate", label: "I confirm the information is correct", type: "checkbox", defaultEnabled: true },
      { id: "agree_terms", label: "I agree to school rules and data use", type: "checkbox", defaultEnabled: true },
      { id: "declaration_signature", label: "Signature (type full name)", type: "text", defaultEnabled: true },
      { id: "declaration_date", label: "Date", type: "date", defaultEnabled: true },
    ],
  },
];

function getDefaultEnabledFields() {
  return APPLICATION_FORM_SECTIONS.flatMap((section) =>
    section.fields.filter((f) => f.defaultEnabled || f.locked).map((f) => f.id)
  );
}

function getLockedFieldIds() {
  return APPLICATION_FORM_SECTIONS.flatMap((section) =>
    section.fields.filter((f) => f.locked).map((f) => f.id)
  );
}

function ensureLockedFields(fieldIds = []) {
  const locked = getLockedFieldIds();
  return [...new Set([...(fieldIds || []), ...locked])];
}

function getFieldById(fieldId) {
  for (const section of APPLICATION_FORM_SECTIONS) {
    const field = section.fields.find((f) => f.id === fieldId);
    if (field) return { ...field, sectionId: section.id, sectionTitle: section.title };
  }
  return null;
}

function getAllFieldIds() {
  return APPLICATION_FORM_SECTIONS.flatMap((s) => s.fields.map((f) => f.id));
}

module.exports = {
  APPLICATION_FORM_SECTIONS,
  getDefaultEnabledFields,
  getLockedFieldIds,
  ensureLockedFields,
  getFieldById,
  getAllFieldIds,
};
