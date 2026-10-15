"use strict";

/**
 * Read-only data tools for the School Assistant.
 * Every call is limited to one school. Nothing here writes to the database.
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { accessFor } = require("./assistantAccess");

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/assistantSchema.json"), "utf8"));

const EXTRA_FIELDS = {
  StudentReportCard: [
    { name: "result_emailed_at", type: "Date" },
    { name: "result_email_status", type: "String" },
  ],
};

const HINTS = {
  Student: "A student. Class membership is in StudentClassAssignment, not here. To list a class's students with details: find the class, get its roster (StudentClassAssignment), then query Student where student_id in that result and select full_name, gender, age, date_of_birth, admission_number, phone, email. age is a computed select field (from date_of_birth).",
  Class: "class_name is the full name; JSS 1 = Junior Secondary School 1.",
  StudentClassAssignment: "Roster: students in a class = rows with that class_id (active session and is_active are added for you). Never filter by subsession_id. Count distinct student_id.",
  StudentAttendance: "One row per student per day. status: present, absent, excused, late. Present days = count where status present.",
  StudentScore: "One subject result per student per term. scores is an object of marks; avg/sum over scores adds them. Best student: groupBy student_id, avg scores, sort desc, join Student full_name.",
  UserBill: "One fee charged to one person (a copy of a Bill for that student), so its row count is NOT the number of fee bills. user_id is a student_id when user_type is student. Balance = amount_due - amount_paid. No class or session field: get the class's student ids from StudentClassAssignment first. A student can have several bills, so groupBy user_id and sum. Each payment a student made is recorded inside the bill (payments list). To see when, how much, by what method and who recorded a payment, add \"unwind\":\"payments\" to the query: every payment becomes a row with payment_amount, payment_paid_at, payment_method, payment_reference, payment_note, payment_recorded_by_name. This is where fee payments live, never the Payment collection.",
  Bill: "The fee bills listed on the Fee Billing page (fee_name, total_amount, target_type, status Active or Inactive). Count or list fee bills here, and filter status for active or inactive ones. Who owes what is in UserBill; who paid and when is in UserBill payments.",
  Payment: "Only the school's own subscription payments to the platform. NOT student fees: for student fee payments use UserBill.",
  StudentReportCard: "One report card per student per term. A row = created. is_published true = released to the student. result_emailed_at/result_email_status are set when the result email is sent (older emails were not recorded; say so if the list looks short).",
  StudentReport: "Generated score report per student per term. Report cards are in StudentReportCard.",
  ClassTimetable: "One timetable per class per term. Classes without one: query ClassTimetable groupBy class_id, then Class where class_id notIn that result.",
  Subsession: "A term. term_id is called subsession_id in other collections.",
  Session: "An academic year. session_id is its id and session_name its name.",
};

for (const collection of schema.collections) {
  for (const field of EXTRA_FIELDS[collection.name] || []) {
    if (!collection.fields.some((item) => item.name === field.name)) collection.fields.push(field);
  }
  if (HINTS[collection.name]) {
    collection.note = [collection.note, HINTS[collection.name]].filter(Boolean).join(" ");
  }
}

const collectionMap = new Map(schema.collections.map((item) => [item.name, item]));

function loadModels() {
  const dir = path.join(__dirname, "../models");
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".js")) require(path.join(dir, file));
  }
}
loadModels();

const MAX_SCAN = 20000;
const KEEP_ROWS = 2000;
const VIEW_ROWS = 25;
const MAX_VIEW_CHARS = 4000;

const AUTO_JOINS = [
  { names: ["full_name", "student_name"], from: "Student", via: "student_id" },
  { names: ["class_name", "class_code"], from: "Class", via: "class_id" },
  { names: ["subject_name"], from: "Subject", via: "subject_id" },
];

const CLAUSE_OPS = new Set(["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in", "notIn", "empty", "notEmpty"]);
const METRIC_OPS = new Set(["count", "sum", "avg", "min", "max", "distinct"]);
const COMPUTE_OPS = new Set(["subtract", "add", "multiply", "divide", "percent"]);
const NAME_FIELDS = ["full_name", "student_name", "class_name", "class_code", "subject_name", "subject_code", "session_name", "term_name", "fee_name", "name", "title"];
const ID_FIELDS = {
  Student: "student_id",
  Class: "class_id",
  Subject: "subject_id",
  Staff: "staff_id",
  Teacher: "teacher_id",
  Admin: "admin_id",
  Session: "session_id",
  Subsession: "term_id",
  Bill: "bill_id",
  UserBill: "user_bill_id",
};
const OP_ALIASES = {
  "=": "eq", "==": "eq", equals: "eq", is: "eq",
  "!=": "ne", "<>": "ne", not: "ne",
  ">": "gt", ">=": "gte", "<": "lt", "<=": "lte",
  like: "contains", includes: "contains",
  nin: "notIn", not_in: "notIn", notin: "notIn",
  is_empty: "empty", isempty: "empty",
  not_empty: "notEmpty", notempty: "notEmpty", exists: "notEmpty",
};

class ToolError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint || "";
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasField(collection, name) {
  return collection.fields.some((field) => field.name === name);
}

function fieldType(collection, name) {
  return collection.fields.find((field) => field.name === name)?.type || "String";
}

function fieldList(collection) {
  const names = collection.fields
    .filter((field) => !["_id", "school_id"].includes(field.name))
    .map((field) => `${field.name}:${field.type}`);
  return `${collection.name} fields: ${names.join(", ")}`;
}

function schoolFieldOf(collection) {
  return collection.schoolField || "school_id";
}

function idFieldOf(collection) {
  if (ID_FIELDS[collection.name] && hasField(collection, ID_FIELDS[collection.name])) return ID_FIELDS[collection.name];
  const found = collection.fields.find((field) => /_id$/.test(field.name) && field.name !== "school_id");
  return found ? found.name : "";
}

function canonicalCollection(name) {
  const raw = String(name || "").trim();
  if (collectionMap.has(raw)) return raw;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  const aliases = {
    student: "Student", students: "Student", pupil: "Student", pupils: "Student",
    class: "Class", classes: "Class",
    subject: "Subject", subjects: "Subject",
    attendance: "StudentAttendance", studentattendance: "StudentAttendance",
    score: "StudentScore", scores: "StudentScore", studentscore: "StudentScore", studentscores: "StudentScore", result: "StudentScore", results: "StudentScore",
    roster: "StudentClassAssignment", classroster: "StudentClassAssignment", classassignment: "StudentClassAssignment", classassignments: "StudentClassAssignment", studentclassassignment: "StudentClassAssignment",
    session: "Session", sessions: "Session",
    subsession: "Subsession", subsessions: "Subsession", term: "Subsession", terms: "Subsession",
    bill: "Bill", bills: "Bill", fee: "Bill", fees: "Bill",
    userbill: "UserBill", userbills: "UserBill", studentbill: "UserBill", studentbills: "UserBill", feebalance: "UserBill",
    staff: "Staff", teacher: "Teacher", teachers: "Teacher",
    reportcard: "StudentReportCard", reportcards: "StudentReportCard", studentreportcard: "StudentReportCard",
    report: "StudentReport", reports: "StudentReport", studentreport: "StudentReport",
    timetable: "ClassTimetable", timetables: "ClassTimetable", classtimetable: "ClassTimetable",
  };
  if (aliases[key] && collectionMap.has(aliases[key])) return aliases[key];
  return [...collectionMap.keys()].find((item) => item.toLowerCase() === key || item.toLowerCase().replace(/[^a-z]/g, "") === key) || null;
}

function resolveCollection(name) {
  const key = canonicalCollection(name);
  const collection = key && collectionMap.get(key);
  if (!collection) {
    throw new ToolError(`"${name || ""}" is not a collection.`, `Collections: ${[...collectionMap.keys()].join(", ")}`);
  }
  return collection;
}

function modelFor(collection) {
  try {
    return mongoose.model(collection.name);
  } catch (err) {
    throw new ToolError(`${collection.name} cannot be read here.`);
  }
}

/* ---------- dates and periods ---------- */

function dayStart(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function periodStatus(startDate, endDate, archived) {
  if (archived) return "archived";
  const today = dayStart(new Date());
  const start = dayStart(startDate);
  const end = dayStart(endDate);
  if (!start || !end) return "draft";
  if (today < start) return "upcoming";
  if (today <= end) return "active";
  return "completed";
}

function dayCount(from, to) {
  const a = dayStart(from);
  const b = dayStart(to);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000) + 1;
}

function daysLeft(end) {
  const today = dayStart(new Date());
  const last = dayStart(end);
  if (!last) return null;
  return Math.max(0, Math.round((last - today) / 86400000));
}

function calendarDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function loadPeriods(schoolId) {
  const id = String(schoolId);
  const [sessions, terms] = await Promise.all([
    mongoose.model("Session").find({ school_id: id }).lean(),
    mongoose.model("Subsession").find({ school_id: id }).lean(),
  ]);
  const sessionRows = sessions
    .map((item) => ({
      session_id: item.session_id,
      session_name: item.session_name,
      start: item.academic_year_start_date || "",
      end: item.academic_year_end_date || "",
      status: periodStatus(item.academic_year_start_date, item.academic_year_end_date, item.is_archived),
    }))
    .sort((a, b) => String(b.start).localeCompare(String(a.start)));
  const termRows = terms
    .map((item) => ({
      term_id: item.term_id,
      term_name: item.term_name,
      session_id: item.session_id,
      start: item.term_start_date || "",
      end: item.term_end_date || "",
      status: periodStatus(item.term_start_date, item.term_end_date, item.is_archived),
    }))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const activeSession = sessionRows.find((item) => item.status === "active") || null;
  const activeTerm = activeSession
    ? termRows.find((item) => item.session_id === activeSession.session_id && item.status === "active") || null
    : null;
  const withDays = (item, startKey = "start", endKey = "end") => (item ? {
    ...item,
    days_total: dayCount(item[startKey], item[endKey]),
    days_left: daysLeft(item[endKey]),
  } : null);
  return {
    session: withDays(activeSession),
    term: withDays(activeTerm),
    sessions: sessionRows.slice(0, 6).map((item) => ({
      ...item,
      terms: termRows.filter((term) => term.session_id === item.session_id).map((term) => ({
        term_id: term.term_id,
        term_name: term.term_name,
        start: term.start,
        end: term.end,
        status: term.status,
      })),
    })),
  };
}

/* ---------- values ---------- */

function plain(value) {
  if (typeof value === "string") return value.trim().slice(0, 120);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  throw new ToolError("Filter values must be text, a number, true/false, or a list of those.");
}

function castValue(type, value) {
  if (type === "Number" && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  if (type === "Boolean" && typeof value === "string") {
    if (/^true$/i.test(value)) return true;
    if (/^false$/i.test(value)) return false;
  }
  if (type === "Date" && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return value;
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => {
      if (item && typeof item === "object") return sum + (numericValue(item.amount ?? item.score) || 0);
      return sum + (numericValue(item) || 0);
    }, 0);
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.values(value).reduce((sum, item) => sum + (numericValue(item) || 0), 0);
  }
  return null;
}

function round(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

function present(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return round(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const total = numericValue(value);
    return total == null ? "—" : round(total);
  }
  return String(value);
}

function toList(value) {
  if (value == null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

/* ---------- filters ---------- */

function comparable(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return String(value ?? "").toLowerCase();
}

function sameValue(a, b) {
  if (a == null || b == null) return false;
  if (a instanceof Date) {
    const other = new Date(b);
    return !Number.isNaN(other.getTime()) && a.getTime() === other.getTime();
  }
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function docMatches(doc, clause) {
  const value = doc[clause.field];
  const empty = value == null || value === "";
  switch (clause.op) {
    case "eq": return sameValue(value, clause.value);
    case "ne": return !sameValue(value, clause.value);
    case "contains": return !empty && String(value).toLowerCase().includes(String(clause.value).toLowerCase());
    case "in": return toList(clause.value).some((item) => sameValue(value, item));
    case "notIn": return !toList(clause.value).some((item) => sameValue(value, item));
    case "empty": return empty;
    case "notEmpty": return !empty;
    case "gt": case "gte": case "lt": case "lte": {
      if (empty) return false;
      let left = comparable(value);
      let right = comparable(value instanceof Date ? new Date(clause.value) : clause.value);
      if (typeof left !== typeof right) { left = String(left); right = String(right); }
      if (clause.op === "gt") return left > right;
      if (clause.op === "gte") return left >= right;
      if (clause.op === "lt") return left < right;
      return left <= right;
    }
    default: return true;
  }
}

/** Whole years since a date of birth, or null when there is none. */
function ageFrom(value) {
  if (!value) return null;
  const born = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(born.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - born.getFullYear();
  const beforeBirthday = today.getMonth() < born.getMonth()
    || (today.getMonth() === born.getMonth() && today.getDate() < born.getDate());
  if (beforeBirthday) years -= 1;
  return years >= 0 && years < 120 ? years : null;
}

/** The where list as an array, whether it was sent as an array or as {field: value}. */
function rawClauses(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([field, value]) => ({ field, op: Array.isArray(value) ? "in" : "eq", value }));
  }
  return [];
}

/**
 * Turn a list stored inside each record (UserBill.payments) into one row per item.
 * The item's fields get a prefix, so payments.amount becomes payment_amount.
 */
function unwindDocs(docs, field) {
  const prefix = `${field.replace(/s$/, "")}_`;
  const types = new Map();
  const out = [];
  docs.forEach((doc) => {
    const { [field]: list, ...rest } = doc;
    (Array.isArray(list) ? list : []).forEach((item) => {
      const flat = {};
      if (item && typeof item === "object" && !(item instanceof Date)) {
        Object.entries(item).forEach(([key, value]) => {
          if (key === "_id" || (value && typeof value === "object" && !(value instanceof Date))) return;
          const name = key.startsWith(prefix) ? key : `${prefix}${key}`;
          flat[name] = value;
          if (!types.has(name)) types.set(name, value instanceof Date ? "Date" : typeof value === "number" ? "Number" : "String");
        });
      } else {
        flat[`${prefix}value`] = item;
        types.set(`${prefix}value`, typeof item === "number" ? "Number" : "String");
      }
      out.push({ ...rest, ...flat });
    });
  });
  return { docs: out, fields: [...types].map(([name, type]) => ({ name, type })) };
}

function normalizeClauses(raw, collection, ctx, { check = true } = {}) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === "object") {
    list = Object.entries(raw).map(([field, value]) => ({ field, op: Array.isArray(value) ? "in" : "eq", value }));
  }
  const out = [];
  for (const item of list.slice(0, 12)) {
    if (!item || !item.field) continue;
    const field = String(item.field);
    if (check && (field === "school_id" || field === "_id")) continue;
    if (check && !hasField(collection, field)) {
      throw new ToolError(`${field} is not a field on ${collection.name}.`, fieldList(collection));
    }
    let op = String(item.op || "").trim();
    op = OP_ALIASES[op.toLowerCase()] || op;
    let value = item.value;
    if (item.fromResult) {
      const source = ctx.results.get(String(item.fromResult));
      if (!source) {
        throw new ToolError(`There is no earlier result called ${item.fromResult}.`, `Earlier results: ${[...ctx.results.keys()].join(", ") || "none"}`);
      }
      const key = String(item.resultField || field);
      if (source.rows.length && !(key in source.rows[0])) {
        throw new ToolError(`${item.fromResult} has no column ${key}.`, `Columns: ${source.columns.join(", ")}`);
      }
      value = [...new Set(source.rows.map((row) => row[key]).filter((entry) => entry != null && entry !== "").map(String))].slice(0, KEEP_ROWS);
      if (!op) op = "in";
    }
    if (!op) op = Array.isArray(value) ? "in" : "eq";
    if (!CLAUSE_OPS.has(op)) {
      throw new ToolError(`Comparison "${item.op}" is not supported.`, `Use: ${[...CLAUSE_OPS].join(", ")}`);
    }
    if (op === "in" || op === "notIn") {
      value = toList(value).slice(0, KEEP_ROWS).map(plain);
    } else if (op === "empty" || op === "notEmpty") {
      value = "";
    } else {
      if (Array.isArray(value)) {
        op = op === "ne" ? "notIn" : "in";
        value = value.slice(0, KEEP_ROWS).map(plain);
      } else if (value == null || value === "") {
        if (op === "eq") op = "empty";
        else if (op === "ne") op = "notEmpty";
        else throw new ToolError(`Filter ${field} needs a value.`);
        value = "";
      } else {
        value = plain(value);
      }
    }
    if (check && value !== "" && !Array.isArray(value)) value = castValue(fieldType(collection, field), value);
    out.push({ field, op, value });
  }
  return out;
}

function mongoCondition(collection, clause) {
  const { field, op } = clause;
  const type = fieldType(collection, field);
  const { value } = clause;
  const cast = (entry) => castValue(type, entry);
  const looseText = type === "String" && typeof value === "string" && !/(^|_)id$|_code$/.test(field);
  switch (op) {
    case "eq":
      return looseText ? { [field]: new RegExp(`^${escapeRegex(value)}$`, "i") } : { [field]: value };
    case "ne":
      return looseText ? { [field]: { $not: new RegExp(`^${escapeRegex(value)}$`, "i") } } : { [field]: { $ne: value } };
    case "contains": return { [field]: new RegExp(escapeRegex(String(value)), "i") };
    case "gt": return { [field]: { $gt: value } };
    case "gte": return { [field]: { $gte: value } };
    case "lt": return { [field]: { $lt: value } };
    case "lte": return { [field]: { $lte: value } };
    case "in": return { [field]: { $in: value.map(cast) } };
    case "notIn": return { [field]: { $nin: value.map(cast) } };
    case "empty": return { $or: [{ [field]: null }, { [field]: "" }] };
    default: return { [field]: { $nin: [null, ""] } };
  }
}

function buildMatch(collection, schoolId, clauses) {
  const match = { [schoolFieldOf(collection)]: String(schoolId) };
  const and = clauses.map((clause) => mongoCondition(collection, clause));
  if (and.length) match.$and = and;
  return match;
}

function applyScope(collection, clauses, scope, period) {
  const applied = [];
  if (scope === "all") return applied;
  const has = (name) => hasField(collection, name);
  const mentioned = (name) => clauses.some((clause) => clause.field === name);
  const sessionClause = clauses.find((clause) => clause.field === "session_id" && clause.op === "eq");
  if (period.session && has("session_id") && !mentioned("session_id")) {
    clauses.push({ field: "session_id", op: "eq", value: period.session.session_id });
    applied.push(`session ${period.session.session_name}`);
  }
  if (collection.name === "StudentClassAssignment") {
    if (has("is_active") && !mentioned("is_active")) {
      clauses.push({ field: "is_active", op: "eq", value: true });
      applied.push("is_active true");
    }
    return applied;
  }
  const otherSession = sessionClause && period.session && String(sessionClause.value) !== String(period.session.session_id);
  if (scope !== "session" && period.term && has("subsession_id") && !mentioned("subsession_id") && !otherSession) {
    clauses.push({ field: "subsession_id", op: "eq", value: period.term.term_id });
    applied.push(`term ${period.term.term_name}`);
  }
  return applied;
}

/* ---------- metrics and rows ---------- */

function metricValue(docs, metric) {
  const rows = metric.where && metric.where.length
    ? docs.filter((doc) => metric.where.every((clause) => docMatches(doc, clause)))
    : docs;
  if (metric.op === "count") return rows.length;
  if (metric.op === "distinct") {
    return new Set(rows.map((doc) => doc[metric.field]).filter((entry) => entry != null && entry !== "").map(String)).size;
  }
  const nums = rows.map((doc) => numericValue(doc[metric.field])).filter((entry) => entry != null);
  if (!nums.length) return 0;
  if (metric.op === "sum") return nums.reduce((sum, entry) => sum + entry, 0);
  if (metric.op === "min") return Math.min(...nums);
  if (metric.op === "max") return Math.max(...nums);
  return nums.reduce((sum, entry) => sum + entry, 0) / nums.length;
}

function normalizeMetrics(raw, collection, groupBy, ctx) {
  const list = toList(raw).slice(0, 8);
  const used = new Set(groupBy);
  return list.map((item, index) => {
    if (!item || typeof item !== "object") throw new ToolError("Each metric needs op and field.");
    let op = String(item.op || "count").toLowerCase();
    op = ({ average: "avg", mean: "avg", total: "sum", count_distinct: "distinct", unique: "distinct" })[op] || op;
    if (!METRIC_OPS.has(op)) throw new ToolError(`Metric op "${item.op}" is not supported.`, `Use: ${[...METRIC_OPS].join(", ")}`);
    const field = item.field ? String(item.field) : "";
    if (op !== "count" && !field) throw new ToolError(`Metric ${op} needs a field.`);
    if (field && !hasField(collection, field)) throw new ToolError(`${field} is not a field on ${collection.name}.`, fieldList(collection));
    let name = String(item.name || (op === "count" ? "count" : `${op}_${field}`)).replace(/[^A-Za-z0-9_]/g, "_");
    if (used.has(name)) name = `${name}_${index + 1}`;
    used.add(name);
    return { name, op, field, where: normalizeClauses(item.where, collection, ctx) };
  });
}

function normalizeCompute(raw, available) {
  const list = toList(raw).slice(0, 6);
  return list.map((item) => {
    const op = String(item?.op || "").toLowerCase();
    if (!COMPUTE_OPS.has(op)) throw new ToolError(`Compute op "${item?.op}" is not supported.`, `Use: ${[...COMPUTE_OPS].join(", ")}`);
    const name = String(item.name || op).replace(/[^A-Za-z0-9_]/g, "_");
    const check = (side) => {
      if (typeof side === "number") return side;
      const key = String(side);
      if (Number.isFinite(Number(key)) && key.trim() !== "") return Number(key);
      if (!available.has(key)) throw new ToolError(`compute uses ${key}, which is not a column.`, `Columns: ${[...available].join(", ")}`);
      return key;
    };
    const next = { name, op, left: check(item.left), right: check(item.right) };
    available.add(name);
    return next;
  });
}

function runCompute(rows, computes) {
  computes.forEach((item) => {
    rows.forEach((row) => {
      const pick = (side) => (typeof side === "number" ? side : numericValue(row[side]) || 0);
      const left = pick(item.left);
      const right = pick(item.right);
      let value = null;
      if (item.op === "subtract") value = left - right;
      else if (item.op === "add") value = left + right;
      else if (item.op === "multiply") value = left * right;
      else if (item.op === "divide") value = right ? left / right : null;
      else if (item.op === "percent") value = right ? (left / right) * 100 : null;
      row[item.name] = value == null ? null : round(value);
    });
  });
}

function sortRows(rows, sort) {
  if (!sort || !sort.by) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  return rows.sort((a, b) => {
    const x = comparable(a[sort.by]);
    const y = comparable(b[sort.by]);
    if (x === y) return 0;
    if (typeof x !== typeof y) return String(x) > String(y) ? dir : -dir;
    return x > y ? dir : -dir;
  });
}

function parseSort(raw, columns) {
  if (!raw) return null;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    if (/^(asc|desc)$/i.test(text)) return { by: "", dir: text.toLowerCase() };
    return text.startsWith("-") ? { by: text.slice(1), dir: "desc" } : { by: text, dir: "asc" };
  }
  const by = String(raw.by || raw.field || "").trim();
  const dir = String(raw.dir || raw.direction || raw.order || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  return { by, dir };
}

async function attachJoins(rows, joins, schoolId, acl) {
  for (const join of toList(joins).slice(0, 3)) {
    if (!join || typeof join !== "object") continue;
    const target = resolveCollection(join.from);
    const model = modelFor(target);
    const localField = String(join.localField || "");
    if (!rows.length) continue;
    if (!(localField in rows[0])) {
      throw new ToolError(`join localField ${localField || "(missing)"} is not a column of the result.`, `Columns: ${Object.keys(rows[0]).join(", ")}`);
    }
    const foreignField = String(join.foreignField || idFieldOf(target));
    if (!hasField(target, foreignField)) throw new ToolError(`${foreignField} is not a field on ${target.name}.`, fieldList(target));
    const pickRaw = toList(join.pick || join.select).map(String);
    let pick = pickRaw.filter((name) => hasField(target, name) && name !== "_id" && name !== "school_id").slice(0, 6);
    if (pickRaw.length && !pick.length) throw new ToolError(`None of the join fields exist on ${target.name}.`, fieldList(target));
    if (!pick.length) {
      pick = NAME_FIELDS.filter((name) => hasField(target, name)).slice(0, 2);
      if (!pick.length) throw new ToolError(`Choose fields to pick from ${target.name}.`, fieldList(target));
    }
    // A collection the admin may not read can still lend names to a row, nothing else.
    if (!acl.canRead(target.name)) {
      const onlyNames = acl.allowsNamesOnly(target.name) && pick.every((name) => NAME_FIELDS.includes(name) || name === idFieldOf(target));
      if (!onlyNames) acl.require(target.name);
    }
    const values = [...new Set(rows.map((row) => row[localField]).filter((entry) => entry != null && entry !== "").map(String))];
    const docs = values.length
      ? await model.find({ [schoolFieldOf(target)]: String(schoolId), [foreignField]: { $in: values } }).select([foreignField, ...pick].join(" ")).lean()
      : [];
    const byKey = new Map(docs.map((doc) => [String(doc[foreignField]), doc]));
    rows.forEach((row) => {
      const doc = byKey.get(String(row[localField]));
      pick.forEach((name) => {
        const taken = name in row && row[name] != null && row[name] !== "";
        const key = taken ? `${target.name.charAt(0).toLowerCase()}${target.name.slice(1)}_${name}` : name;
        row[key] = doc ? (doc[name] ?? null) : null;
      });
    });
  }
}

function clipRows(rows) {
  const view = rows.slice(0, VIEW_ROWS).map((row) => {
    const next = {};
    Object.keys(row).forEach((key) => { next[key] = present(row[key]); });
    return next;
  });
  while (view.length > 3 && JSON.stringify(view).length > MAX_VIEW_CHARS) view.pop();
  return view;
}

/* ---------- the toolbox ---------- */

/**
 * `access` (utils/assistantAccess) says which collections the person asking may read. Without
 * it nothing but name look-ups works, so a missing argument can never open everything.
 */
async function createToolbox(schoolId, access) {
  const acl = access || accessFor(null);
  const periods = await loadPeriods(schoolId);
  const ctx = { schoolId: String(schoolId), period: periods, results: new Map(), counter: 0 };

  function register(entry) {
    ctx.counter += 1;
    const ref = `r${ctx.counter}`;
    ctx.results.set(ref, { ...entry, ref });
    return ref;
  }

  async function queryTool(spec) {
    let collection = resolveCollection(spec.from || spec.collection);
    acl.require(collection.name);
    const model = modelFor(collection);
    const unwindField = spec.unwind ? String(spec.unwind) : "";
    if (unwindField && !hasField(collection, unwindField)) {
      throw new ToolError(`${unwindField} is not a field on ${collection.name}, so it cannot be unwound.`, fieldList(collection));
    }
    // With unwind, conditions on the list's own fields run after the list is expanded.
    const rawWhere = rawClauses(spec.where);
    const realWhere = unwindField ? rawWhere.filter((item) => item && hasField(collection, String(item.field))) : rawWhere;
    const lateWhere = unwindField ? rawWhere.filter((item) => item && !hasField(collection, String(item.field))) : [];
    const clauses = normalizeClauses(realWhere, collection, ctx);
    const lateClauses = normalizeClauses(lateWhere, null, ctx, { check: false });
    const scope = ["session", "all", "term"].includes(spec.scope) ? spec.scope : "term";
    const scoped = applyScope(collection, clauses, scope, periods);

    let docs = await model.find(buildMatch(collection, schoolId, clauses)).limit(MAX_SCAN).lean();
    const scanCapped = docs.length >= MAX_SCAN;
    if (unwindField) {
      const unwound = unwindDocs(docs, unwindField);
      docs = unwound.docs.filter((row) => lateClauses.every((clause) => docMatches(row, clause)));
      collection = {
        ...collection,
        fields: [...collection.fields.filter((field) => field.name !== unwindField), ...unwound.fields],
      };
      lateClauses.forEach((clause) => {
        if (!collection.fields.some((field) => field.name === clause.field)) {
          throw new ToolError(`${clause.field} is not a field on ${collection.name} or its ${unwindField}.`, fieldList(collection));
        }
      });
    }

    const groupBy = toList(spec.groupBy).map(String).filter(Boolean).slice(0, 3);
    groupBy.forEach((field) => {
      if (!hasField(collection, field) || field === "_id" || field === "school_id") {
        throw new ToolError(`Cannot group by ${field}.`, fieldList(collection));
      }
    });
    let metricsRaw = spec.metrics ?? spec.metric;
    if (!toList(metricsRaw).length && (groupBy.length || spec.count === true || spec.shape === "count")) {
      metricsRaw = [{ name: "count", op: "count" }];
    }
    const metrics = normalizeMetrics(metricsRaw, collection, groupBy, ctx);

    let rows;
    if (groupBy.length || metrics.length) {
      const groups = new Map();
      docs.forEach((doc) => {
        const keys = groupBy.map((field) => doc[field]);
        if (groupBy.length && keys.some((entry) => entry == null || entry === "")) return;
        const id = keys.map(String).join("\u0001");
        if (!groups.has(id)) groups.set(id, { keys, docs: [] });
        groups.get(id).docs.push(doc);
      });
      if (!groupBy.length && !groups.size) groups.set("", { keys: [], docs: [] });
      rows = [...groups.values()].map((group) => {
        const row = {};
        groupBy.forEach((field, index) => { row[field] = group.keys[index]; });
        metrics.forEach((metric) => { row[metric.name] = round(metricValue(group.docs, metric)); });
        return row;
      });
    } else {
      let select = toList(spec.select || spec.pick).map(String).filter(Boolean);
      // "age" is worked out from date_of_birth when the collection has one.
      const wantsAge = select.includes("age") && !hasField(collection, "age") && hasField(collection, "date_of_birth");
      if (wantsAge) select = select.filter((name) => name !== "age");
      // A name field that lives on another collection (full_name on a report card) becomes a join.
      const autoJoins = [];
      AUTO_JOINS.forEach((rule) => {
        const wanted = select.filter((name) => rule.names.includes(name) && !hasField(collection, name));
        if (!wanted.length || !hasField(collection, rule.via)) return;
        select = select.filter((name) => !wanted.includes(name));
        if (!select.includes(rule.via)) select.push(rule.via);
        autoJoins.push({ from: rule.from, localField: rule.via, foreignField: rule.via, pick: wanted });
      });
      if (autoJoins.length) spec = { ...spec, join: [...toList(spec.join || spec.lookup), ...autoJoins] };
      const bad = select.filter((name) => !hasField(collection, name));
      if (bad.length) throw new ToolError(`${bad.join(", ")} is not a field on ${collection.name}.`, fieldList(collection));
      if (!select.length) {
        select = collection.fields
          .filter((field) => !["_id", "school_id", "created_at", "updated_at"].includes(field.name) && !/Mixed|Array|Embedded/.test(field.type))
          .map((field) => field.name)
          .slice(0, 10);
      }
      rows = docs.map((doc) => {
        const row = {};
        select.forEach((name) => { row[name] = doc[name] ?? null; });
        if (wantsAge) row.age = ageFrom(doc.date_of_birth);
        return row;
      });
    }

    const available = new Set(rows.length ? Object.keys(rows[0]) : [...groupBy, ...metrics.map((metric) => metric.name)]);
    const computes = normalizeCompute(spec.compute, available);
    runCompute(rows, computes);

    const having = normalizeClauses(spec.having, null, ctx, { check: false });
    if (having.length) {
      having.forEach((clause) => {
        if (rows.length && !(clause.field in rows[0])) {
          throw new ToolError(`having uses ${clause.field}, which is not a column.`, `Columns: ${Object.keys(rows[0]).join(", ")}`);
        }
      });
      rows = rows.filter((row) => having.every((clause) => docMatches(row, clause)));
    }

    let sort = parseSort(spec.sort ?? spec.orderBy, null);
    if (sort && !sort.by) sort = { by: metrics[0]?.name || "", dir: sort.dir };
    if (!sort && metrics.length && groupBy.length) sort = { by: metrics[0].name, dir: "desc" };
    if (sort && sort.by && rows.length && !(sort.by in rows[0]) && !toList(spec.join).length) {
      throw new ToolError(`sort uses ${sort.by}, which is not a column.`, `Columns: ${Object.keys(rows[0]).join(", ")}`);
    }
    if (sort && rows.length && sort.by in rows[0]) sortRows(rows, sort);

    const total = rows.length;
    const keep = spec.limit ? Math.max(1, Math.min(KEEP_ROWS, Math.round(Number(spec.limit)) || 50)) : KEEP_ROWS;
    rows = rows.slice(0, keep);
    await attachJoins(rows, spec.join || spec.lookup, schoolId, acl);
    if (sort && rows.length && sort.by in rows[0]) sortRows(rows, sort);

    const columns = rows.length ? Object.keys(rows[0]) : [...groupBy, ...metrics.map((metric) => metric.name)];
    const ref = register({ from: collection.name, rows, columns, total });
    const out = { ref, from: collection.name, total, matched_records: docs.length, columns, rows: clipRows(rows), scope_added: scoped };
    if (total > out.rows.length) out.showing = `first ${out.rows.length} of ${total} (all ${rows.length} kept as ${ref})`;
    if (scanCapped) out.warning = `Only the first ${MAX_SCAN} matching records were read.`;
    if (!docs.length) {
      out.note = "No records matched these filters.";
      out.checked = { from: collection.name, where: clauses.map((clause) => `${clause.field} ${clause.op}${clause.value === "" ? "" : ` ${Array.isArray(clause.value) ? `[${clause.value.length} values]` : clause.value}`}`) };
    }
    return out;
  }

  async function findTool(spec) {
    const collection = resolveCollection(spec.from || spec.collection || spec.entity);
    // Without read access a name look-up still works (to turn a name into an id), but it
    // returns only the id and the name.
    const namesOnly = acl.allowsNamesOnly(collection.name);
    if (!namesOnly) acl.require(collection.name);
    const model = modelFor(collection);
    const text = String(spec.text || spec.name || spec.query || "").trim().slice(0, 80);
    if (!text) throw new ToolError("find needs the text to look for.");
    const fields = NAME_FIELDS.filter((name) => hasField(collection, name)).slice(0, 4);
    if (!fields.length) throw new ToolError(`${collection.name} has no name field to search.`, fieldList(collection));
    const regexes = nameRegexes(text);
    if (!regexes.length) throw new ToolError("find needs letters or numbers to look for.");
    const or = fields.flatMap((field) => regexes.map((regex) => ({ [field]: regex })));
    const idField = idFieldOf(collection);
    const docs = await model.find({ [schoolFieldOf(collection)]: ctx.schoolId, $or: or }).limit(12).lean();
    const extras = namesOnly ? [] : ["current_class", "class_name", "stream", "admission_number", "status", "is_active"];
    const keys = [...new Set([idField, ...fields, ...extras])].filter((name) => name && hasField(collection, name));
    const rows = docs.map((doc) => {
      const row = {};
      keys.forEach((name) => { row[name] = doc[name] ?? null; });
      return row;
    });
    const ref = register({ from: collection.name, rows, columns: keys, total: rows.length });
    const out = { ref, from: collection.name, id_field: idField, matches: rows.length, rows: clipRows(rows) };
    if (!rows.length) out.note = `Nothing in ${collection.name} matched "${text}". Try another spelling or part of the name.`;
    return out;
  }

  function describeTool(spec) {
    const names = toList(spec.collections || spec.collection || spec.from).slice(0, 6);
    if (!names.length) throw new ToolError("describe needs collection names.");
    return {
      collections: names.map((name) => {
        const collection = resolveCollection(name);
        return {
          name: collection.name,
          note: collection.note || undefined,
          id_field: idFieldOf(collection) || undefined,
          fields: collection.fields.filter((field) => field.name !== "_id").map((field) => `${field.name}:${field.type}`),
          links: (collection.links || []).map((link) => `${link.field} -> ${link.to}.${link.toField}${link.meaning ? ` (${link.meaning})` : ""}`),
        };
      }),
    };
  }

  function periodTool() {
    return {
      today: calendarDate(),
      active_session: periods.session,
      active_term: periods.term,
      sessions: periods.sessions,
    };
  }

  async function run(action) {
    switch (action.action) {
      case "query": return queryTool(action);
      case "find": return findTool(action);
      case "describe": return describeTool(action);
      case "period": return periodTool();
      default: throw new ToolError(`Unknown action "${action.action}".`, "Use describe, find, period, docs, query, ask or answer.");
    }
  }

  return { periods, results: ctx.results, run };
}

/* ---------- names ---------- */

function flexibleRegex(value) {
  const compact = String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!compact) return /$^/;
  const body = [...compact].map((ch) => escapeRegex(ch)).join("[^a-z0-9]*");
  return new RegExp(`${body}${/\d$/.test(compact) ? "(?!\\d)" : ""}`, "i");
}

function nameForms(value) {
  const raw = String(value || "").trim();
  const forms = new Set([raw]);
  forms.add(raw.replace(/\bjss\b/ig, "junior secondary school").replace(/\bsss\b/ig, "senior secondary school"));
  forms.add(raw.replace(/junior\s+secondary\s+school/ig, "JSS").replace(/senior\s+secondary\s+school/ig, "SSS"));
  return [...forms].filter((item) => item.length > 1);
}

function nameRegexes(text) {
  const out = [];
  nameForms(text).forEach((form) => {
    const clean = form.trim();
    if (!clean) return;
    if (/\d/.test(clean)) {
      out.push(flexibleRegex(clean));
      return;
    }
    const tokens = clean.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (!tokens.length) return;
    out.push(new RegExp(tokens.map((token) => `(?=.*${escapeRegex(token)})`).join(""), "i"));
  });
  return out;
}

/* ---------- prompt helpers ---------- */

// The few fields worth showing up front. describe returns the rest on demand.
const KEY_FIELDS = {
  Student: "student_id, full_name, gender, date_of_birth, age (computed), admission_number, phone, email",
  StudentClassAssignment: "student_id, class_id, session_id",
  Class: "class_id, class_name, class_code",
  StudentAttendance: "student_id, class_id, session_id, subsession_id, attendance_date, status",
  StudentScore: "student_id, class_id, subject_id, subject_name, session_id, subsession_id, scores",
  UserBill: "user_id, user_type, bill_id, amount_due, amount_paid, payment_status, payments (list, use unwind)",
  Bill: "bill_id, fee_name, category, total_amount, status, target_type, mandatory",
  StudentReportCard: "student_id, class_id, session_id, subsession_id, is_published, result_emailed_at, result_email_status",
  StudentReport: "student_id, class_id, session_id, subsession_id, generated_at",
  ClassTimetable: "class_id, subsession_id",
  Subsession: "term_id, term_name, term_start_date, term_end_date",
};

function keySheet() {
  return Object.keys(KEY_FIELDS).map((name) => {
    if (!collectionMap.has(name)) return "";
    return `${name} (${KEY_FIELDS[name]}): ${HINTS[name] || ""}`.trim();
  }).filter(Boolean).join("\n");
}

/** Field list and hint for just the named collections (plus the ones they usually need). */
function sheetFor(names) {
  const picked = [];
  const add = (name) => {
    const key = canonicalCollection(name);
    if (key && collectionMap.has(key) && !picked.includes(key)) picked.push(key);
  };
  (names || []).forEach(add);
  if (!picked.length) return "";
  const named = [...picked];
  add("Student");
  add("Class");
  const studentLevel = ["UserBill", "Bill", "Student", "StudentScore", "StudentAttendance", "StudentReportCard", "StudentReport"];
  if (named.some((name) => studentLevel.includes(name))) add("StudentClassAssignment");
  return picked.map((name) => {
    const collection = collectionMap.get(name);
    const fields = KEY_FIELDS[name] || collection.fields
      .filter((field) => !["_id", "school_id", "created_at", "updated_at"].includes(field.name))
      .map((field) => field.name)
      .slice(0, 12)
      .join(", ");
    const note = HINTS[name] || String(collection.note || "").slice(0, 160);
    return `${name} (${fields})${note ? `: ${note}` : ""}`;
  }).join("\n");
}

function collectionIndex() {
  return schema.collections.map((collection) => collection.name).join(", ");
}

module.exports = {
  createToolbox,
  ToolError,
  keySheet,
  sheetFor,
  collectionIndex,
  present,
  calendarDate,
  round,
};
