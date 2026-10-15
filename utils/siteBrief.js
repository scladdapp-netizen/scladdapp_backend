/**
 * The "Generate description" text for the site builder.
 *
 * It says WHAT the page should talk about for this school, using the school's own details
 * (name, motto, classes, fees, contact). It never says how anything should look: no hero,
 * cards, columns, buttons or "three points". The look comes from the template image.
 */
const School = require("../models/School.model");
const Class = require("../models/Class.model");
const Bill = require("../models/Bill.model");
const UserBill = require("../models/UserBill.model");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");

const naira = (value) => `₦${Number(value || 0).toLocaleString("en-NG")}`;

const STAGE_SHORT = { jss: "Junior Secondary", sss: "Senior Secondary", ss: "Senior Secondary" };

/** "Junior Secondary School 2" -> "Junior Secondary", "Primary 3A" -> "Primary", "JSS 1" -> "Junior Secondary". */
function stageOf(className) {
  const raw = String(className || "").trim();
  const base = raw
    .replace(/\s*\d+\s*[A-Za-z]?$/, "")
    .replace(/\s+school$/i, "")
    .trim();
  if (!base) return raw;
  return STAGE_SHORT[base.toLowerCase()] || base;
}

/**
 * What a family at each stage is billed: the most common total of the active fee bills
 * among that stage's students. A stage nobody is billed in yet takes the school-wide bills
 * (the ones meant for all students). Returns [{ stage, amount }] in class order.
 */
async function feesByStage(schoolId, classes, activeBills) {
  const stages = [];
  const stageOfClass = new Map();
  classes.forEach((item) => {
    const stage = stageOf(item.class_name);
    if (!stage) return;
    stageOfClass.set(String(item.class_id), stage);
    if (!stages.includes(stage)) stages.push(stage);
  });
  if (!stages.length || !activeBills.length) return [];

  const billIds = activeBills.map((bill) => String(bill.bill_id));
  const roster = await StudentClassAssignment.find({
    school_id: schoolId,
    class_id: { $in: [...stageOfClass.keys()] },
    is_active: { $ne: false },
  }).select("student_id class_id").lean();
  const stageOfStudent = new Map();
  roster.forEach((row) => {
    if (!stageOfStudent.has(String(row.student_id))) stageOfStudent.set(String(row.student_id), stageOfClass.get(String(row.class_id)));
  });

  const billed = stageOfStudent.size
    ? await UserBill.find({ school_id: schoolId, bill_id: { $in: billIds }, user_id: { $in: [...stageOfStudent.keys()] } }).select("user_id amount_due").lean()
    : [];
  const totals = new Map();
  billed.forEach((row) => totals.set(String(row.user_id), (totals.get(String(row.user_id)) || 0) + Number(row.amount_due || 0)));

  const counts = new Map();
  totals.forEach((total, studentId) => {
    if (!(total > 0)) return;
    const stage = stageOfStudent.get(studentId);
    if (!counts.has(stage)) counts.set(stage, new Map());
    counts.get(stage).set(total, (counts.get(stage).get(total) || 0) + 1);
  });

  const schoolWide = activeBills
    .filter((bill) => ["all_students", "whole_school"].includes(String(bill.target_type)))
    .reduce((sum, bill) => sum + Number(bill.total_amount || 0), 0);

  return stages
    .map((stage) => {
      const seen = counts.get(stage);
      if (seen && seen.size) {
        const [amount] = [...seen.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
        return { stage, amount };
      }
      return schoolWide > 0 ? { stage, amount: schoolWide } : null;
    })
    .filter(Boolean);
}

async function schoolFacts(schoolId) {
  const id = String(schoolId);
  const [school, classes, bills] = await Promise.all([
    School.findOne({ school_id: id }).lean(),
    Class.find({ school_id: id, is_active: { $ne: false } }).select("class_id class_name").limit(40).lean(),
    Bill.find({ school_id: id, status: "Active" }).select("bill_id fee_name total_amount target_type").limit(20).lean(),
  ]);
  classes.sort((a, b) => String(a.class_name).trim().localeCompare(String(b.class_name).trim(), "en", { numeric: true }));
  const stageFees = await feesByStage(id, classes, bills);
  return { school: school || {}, classes, bills, stageFees };
}

function buildSiteBrief({ school, classes, bills, stageFees }) {
  const name = school.school_name || "the school";
  const motto = school.motto ? ` Its motto is "${school.motto}".` : "";
  const classNames = [...new Set(classes.map((item) => String(item.class_name || "").trim()).filter(Boolean))];
  const billLines = bills
    .filter((bill) => bill.fee_name && Number(bill.total_amount) > 0)
    .map((bill) => `${bill.fee_name} ${naira(bill.total_amount)}`);
  const contact = [school.address, school.phone_number, school.email].filter(Boolean);

  const lines = [];
  lines.push(`Home: the name ${name}${school.motto ? `, the motto "${school.motto}"` : ""}, and a few sentences on the kind of students the school raises and the care parents can expect. Parents can apply to join.`);
  lines.push(`About: the story of ${name}.${motto} What a good education means here, the values children grow up with, how teachers know children by name, and how parents are kept involved.`);
  lines.push(
    classNames.length
      ? `Academics: the school teaches ${classNames.join(", ")}. Say what children learn at each stage, the habits they practise, and how a teacher helps a child who finds a subject hard.`
      : "Academics: the stages the school runs, what children learn at each stage, the habits they practise, and how a teacher helps a child who finds a subject hard.",
  );
  lines.push(`Team: introduce the people who run and teach at ${name}: the head of the school, a senior teacher and a few class teachers. Give each a name, a role and a sentence on what they care about.`);
  const closing = "Say what the fees cover, that the office confirms the current figure, and that families can ask about a payment plan.";
  if (stageFees && stageFees.length) {
    lines.push(`Fees: the school's fees in Nigerian naira with the ₦ sign, for each stage: ${stageFees.map((item) => `${item.stage} ${naira(item.amount)}`).join("; ")}. Use exactly these figures and add none of your own. ${closing}`);
  } else if (billLines.length) {
    lines.push(`Fees: the school's fees in Nigerian naira with the ₦ sign. Use exactly these figures and add none of your own: ${billLines.join("; ")}. ${closing}`);
  } else {
    lines.push(`Fees: the school's fees in Nigerian naira with the ₦ sign: tuition, books, uniform and other charges, as a guide. ${closing}`);
  }
  lines.push("Admissions: how a family joins the school. Enquire, visit, then apply; say what the parent does and what the school does next.");
  lines.push(
    contact.length
      ? `Contact: ${contact.join(", ")}. Invite parents to call, email or visit, and mention office hours on school days.`
      : "Contact: the school's address, phone and email, and office hours on school days. Invite parents to call, email or visit.",
  );
  return lines.join("\n\n");
}

async function siteBriefFor(schoolId) {
  return buildSiteBrief(await schoolFacts(schoolId));
}

module.exports = { siteBriefFor, buildSiteBrief, stageOf };
