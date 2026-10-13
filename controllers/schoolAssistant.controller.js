const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const AIConfig = require("../models/AIConfig.model");
const { USE_SCHOOL_ASSISTANT } = require("../utils/aiConfigUse");
const { extractJsonFromText, getMessageText } = require("../utils/parseAiJson");
const { groqChat } = require("../utils/groqChat");
const { buildRecordPdf } = require("../utils/simplePdf");
const SCHEMA_PATH = path.join(__dirname, "../data/assistantSchema.json");
const DOCS_PATH = path.join(__dirname, "../data/docsContent.json");
const OPS = new Set(["eq", "ne", "contains", "gte", "lte", "empty", "notEmpty"]);
const METRICS = new Set(["count", "sum", "avg", "min", "max"]);
const MAX_LIMIT = 50;

function logAssistant(step, detail) {
  const text = detail == null ? "" : typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`[AI-ASSISTANT] ${step}${text ? ` ${text}` : ""}`);
}
const MAX_SCAN = 8000;
const PAGES = [
  { label: "Academic Sessions", aliases: ["Academic Session"], path: "/acedemic_seasion" },
  { label: "School Directory", path: "/school_directory" },
  { label: "School Accounts", path: "/fee_billing/accounts" },
  { label: "Income & Expenses", aliases: ["Income and Expenses"], path: "/fee_billing/income-expenses" },
  { label: "Fee Billing", path: "/fee_billing" },
  { label: "Students", path: "/school_directory/students" },
  { label: "Classes", path: "/school_directory/classes" },
  { label: "Teachers", path: "/school_directory/teachers" },
  { label: "Staff", path: "/school_directory/staff" },
  { label: "Subjects", path: "/school_directory/subjects" },
  { label: "Admins", path: "/school_directory/admins" },
  { label: "Notifications", path: "/communication/notifications" },
  { label: "Communication", path: "/communication" },
  { label: "Templates", path: "/templates" },
  { label: "Alumni", path: "/alumni" },
  { label: "Applications", path: "/applications" },
  { label: "Settings", path: "/settings" },
  { label: "Dashboard", path: "/" },
  { label: "School", path: "/school", bracketOnly: true },
].sort((a, b) => b.label.length - a.label.length);
const PAGE_NAMES = PAGES.map((page) => page.label).join(", ");

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const docsRaw = JSON.parse(fs.readFileSync(DOCS_PATH, "utf8"));
const collectionMap = new Map(schema.collections.map((c) => [c.name, c]));

function loadModels() {
  const dir = path.join(__dirname, "../models");
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".js")) require(path.join(dir, file));
  }
}
loadModels();

function compactDocs(raw) {
  return (Array.isArray(raw) ? raw : []).map((section) => ({
    section: section.section,
    items: (section.items || []).filter((item) => item.id).map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content || "",
      steps: (item.steps || []).map((step) => ({ step: step.step, desc: step.desc })),
      callout: item.callout || null,
    })),
  }));
}

const docs = compactDocs(docsRaw);

function compactSchema(source) {
  return {
    rules: source.rules,
    collections: source.collections.map((c) => ({
      name: c.name,
      note: c.note || undefined,
      fields: c.fields.filter((f) => f.name !== "_id").map((f) => `${f.name}:${f.type}`),
      links: c.links,
    })),
  };
}

function findArticle(docId) {
  for (const section of docs) {
    const item = section.items.find((entry) => entry.id === docId);
    if (item) return { section: section.section, item };
  }
  return null;
}

function hasField(collection, name) {
  return collection.fields.some((field) => field.name === name);
}

function plainValue(value) {
  if (typeof value === "string") return value.trim().slice(0, 80);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  throw new Error("Filter values must be text, a number, or true/false.");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  if (Array.isArray(value)) {
    const total = value.reduce((sum, item) => {
      if (item && typeof item === "object") return sum + (numericValue(item.amount ?? item.score) || 0);
      return sum + (numericValue(item) || 0);
    }, 0);
    return total;
  }
  if (value && typeof value === "object") {
    return Object.values(value).reduce((sum, item) => sum + (numericValue(item) || 0), 0);
  }
  return null;
}

async function activeConfig() {
  return AIConfig.findOne({ use: USE_SCHOOL_ASSISTANT, is_active: true });
}

function findPage(name) {
  const wanted = String(name || "").trim().toLowerCase();
  return PAGES.find((page) => page.label.toLowerCase() === wanted || (page.aliases || []).some((alias) => alias.toLowerCase() === wanted)) || null;
}

function linkParts(text) {
  const source = String(text || "");
  const parts = [];
  let i = 0;
  const pushText = (value) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last?.type === "text") last.text += value;
    else parts.push({ type: "text", text: value });
  };
  while (i < source.length) {
    const bracket = source.slice(i).match(/^\[\[([^\]]+)\]\]/);
    if (bracket) {
      const page = findPage(bracket[1]);
      if (page) parts.push({ type: "link", text: page.label, path: page.path });
      else pushText(bracket[1]);
      i += bracket[0].length;
      continue;
    }
    let matched = null;
    for (const page of PAGES) {
      if (page.bracketOnly) continue;
      const names = [page.label, ...(page.aliases || [])];
      for (const name of names) {
        if (source.slice(i, i + name.length).toLowerCase() !== name.toLowerCase()) continue;
        const before = i === 0 || !/[A-Za-z]/.test(source[i - 1]);
        const after = i + name.length >= source.length || !/[A-Za-z]/.test(source[i + name.length]);
        if (before && after) matched = { page, length: name.length };
        if (matched) break;
      }
      if (matched) break;
    }
    if (matched) {
      parts.push({ type: "link", text: matched.page.label, path: matched.page.path });
      i += matched.length;
      continue;
    }
    pushText(source[i]);
    i += 1;
  }
  return parts;
}

function cleanItems(raw) {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, 8)
    .map((item) => {
      const title = typeof item?.title === "string" ? item.title.trim().slice(0, 80) : "";
      const text = typeof item?.text === "string" ? item.text.trim().slice(0, 400) : "";
      return text ? { title, text } : null;
    })
    .filter(Boolean);
}

function validatePlan(raw) {
  const kind = raw?.kind;
  if (kind === "chat") {
    const answer = typeof raw.answer === "string" ? raw.answer.trim().slice(0, 800) : "";
    return answer ? { kind: "chat", answer } : { kind: "unknown" };
  }
  if (kind === "unknown") return { kind: "unknown" };
  if (kind === "clarify") {
    const answer = typeof raw.answer === "string" ? raw.answer.trim().slice(0, 400) : "";
    return answer ? { kind: "clarify", answer } : { kind: "unknown" };
  }
  if (kind === "docs") {
    const docId = typeof raw.docId === "string" ? raw.docId.trim() : "";
    const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 80) : "";
    const answer = typeof raw.answer === "string" ? raw.answer.trim().slice(0, 1800) : "";
    const items = cleanItems(raw.items);
    if (!docId) return { kind: "docs", docId: null, title, items, answer };
    if (!findArticle(docId)) throw new Error("That help article is not in the docs.");
    return { kind: "docs", docId, title, items, answer };
  }
  if (kind !== "query") throw new Error("The assistant must choose a docs article or a data query.");

  const fromName = canonicalCollection(raw.from);
  if (fromName && fromName !== raw.from) logAssistant("collection", `${raw.from} -> ${fromName}`);
  const collection = fromName && collectionMap.get(fromName);
  if (!collection) throw new Error(`Collection "${raw.from || ""}" is not available. Use one of: ${[...collectionMap.keys()].join(", ")}.`);

  const where = Array.isArray(raw.where) ? raw.where.slice(0, 8) : [];
  const filters = where
    .filter((clause) => clause && clause.field && clause.field !== "school_id" && clause.field !== "_id")
    .map((clause) => {
      let op = clause.op;
      const missing = clause.value == null || clause.value === "";
      if (missing && (op === "eq" || op === "empty")) op = "empty";
      if (missing && (op === "ne" || op === "notEmpty")) op = "notEmpty";
      if (!OPS.has(op)) throw new Error(`Filter ${clause.field} uses an unsupported comparison.`);
      if (!hasField(collection, clause.field)) throw new Error(`${clause.field} is not a field on ${collection.name}.`);
      return { field: clause.field, op, value: op === "empty" || op === "notEmpty" ? "" : plainValue(clause.value) };
    });

  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.round(Number(raw.limit)) || 10));
  const sort = raw.sort === "asc" ? "asc" : "desc";
  const groupBy = typeof raw.groupBy === "string" ? raw.groupBy : "";
  let metric = null;
  if (groupBy) {
    if (!hasField(collection, groupBy) || groupBy === "school_id" || groupBy === "_id") {
      throw new Error("Group by a listed field.");
    }
    const op = raw.metric?.op;
    const field = raw.metric?.field || "";
    if (!METRICS.has(op)) throw new Error("Use count, sum, avg, min, or max.");
    if (op !== "count" && !hasField(collection, field)) throw new Error("The metric field is not on that collection.");
    metric = { op, field: op === "count" ? "" : field };
  }

  const requestedLookups = Array.isArray(raw.lookup) ? raw.lookup : raw.lookup ? [raw.lookup] : [];
  const lookups = requestedLookups.slice(0, 2).map((lookup) => {
    const link = collection.links.find((item) =>
      item.to === lookup.from && item.field === lookup.localField && item.toField === lookup.foreignField
    );
    if (!link) throw new Error("That join is not a known link.");
    const target = collectionMap.get(link.to);
    let pick = (Array.isArray(lookup.pick) ? lookup.pick : []).filter((name) => hasField(target, name) && name !== "_id").slice(0, 6);
    if (!pick.length) pick = displayFields(target);
    if (!pick.length) throw new Error(`Choose fields to show from ${link.to}.`);
    return { from: link.to, localField: link.field, foreignField: link.toField, pick };
  });

  let pick = (Array.isArray(raw.pick) ? raw.pick : []).filter((name) => hasField(collection, name) && name !== "_id" && name !== "school_id").slice(0, 8);
  if (!groupBy && !pick.length) {
    pick = collection.fields
      .map((field) => field.name)
      .filter((name) => !["_id", "school_id"].includes(name) && !/Mixed|Array/.test(collection.fields.find((field) => field.name === name)?.type || ""))
      .slice(0, 6);
  }

  if (groupBy && lookups.some((lookup) => lookup.localField !== groupBy)) {
    throw new Error("Join the same field you group by.");
  }

  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 80) : "Result";
  const answer = typeof raw.answer === "string" ? raw.answer.trim().slice(0, 240) : "";
  const shape = !groupBy && raw.shape === "count" ? "count" : "list";
  return { kind: "query", shape, title, answer, from: collection.name, where: filters, groupBy, metric, sort, limit, lookup: lookups, pick };
}

function mongoMatch(plan, schoolId) {
  const match = { school_id: String(schoolId) };
  const extra = [];
  for (const clause of plan.where) {
    if (clause.op === "eq") match[clause.field] = clause.value;
    else if (clause.op === "ne") match[clause.field] = { $ne: clause.value };
    else if (clause.op === "contains") match[clause.field] = new RegExp(escapeRegex(clause.value), "i");
    else if (clause.op === "gte") match[clause.field] = { $gte: clause.value };
    else if (clause.op === "lte") match[clause.field] = { $lte: clause.value };
    else if (clause.op === "empty") extra.push({ $or: [{ [clause.field]: null }, { [clause.field]: "" }] });
    else if (clause.op === "in") match[clause.field] = { $in: clause.value };
    else if (clause.op === "className") {
      const ors = classPatterns(clause.value).flatMap((pattern) => [{ [clause.field]: pattern }]);
      if (clause.ids?.length) ors.push({ [clause.field]: { $in: clause.ids } });
      extra.push({ $or: ors });
    }
    else extra.push({ [clause.field]: { $nin: [null, ""] } });
  }
  if (extra.length) match.$and = extra;
  return match;
}

async function classesNamed(schoolId, value) {
  const patterns = classPatterns(value);
  return mongoose.model("Class").find({
    school_id: String(schoolId),
    $or: patterns.flatMap((pattern) => [{ class_name: pattern }, { class_code: pattern }]),
  }).select("class_id class_name class_code").limit(12).lean();
}

async function resolveClauses(plan, schoolId) {
  const where = [];
  for (const clause of plan.where) {
    const next = { ...clause };
    if (next.field === "is_active" && next.op === "eq") {
      next.value = next.value === true || String(next.value).toLowerCase() === "true";
    }
    if (next.field === "attendance_date" && typeof next.value === "string") {
      if (/today/i.test(next.value)) next.value = calendarDate(0);
      else if (/yesterday/i.test(next.value)) next.value = calendarDate(-1);
    }
    if ((next.field === "current_class" || next.field === "class_name") && (next.op === "eq" || next.op === "contains") && next.value) {
      const found = await classesNamed(schoolId, next.value);
      where.push({ field: next.field, op: "className", value: next.value, ids: found.map((item) => item.class_id) });
      continue;
    }
    if (next.field === "class_id" && (next.op === "eq" || next.op === "contains") && next.value) {
      const exact = await mongoose.model("Class").findOne({
        school_id: String(schoolId),
        class_id: String(next.value),
      }).select("class_id").lean();
      if (exact) {
        where.push({ field: "class_id", op: "eq", value: exact.class_id });
        continue;
      }
      const found = await classesNamed(schoolId, next.value);
      if (found.length) {
        where.push({ field: "class_id", op: "in", value: found.map((item) => item.class_id) });
        continue;
      }
    }
    where.push(next);
  }
  return where;
}

function ensureStudentLookup(plan) {
  const collection = collectionMap.get(plan.from);
  const link = collection?.links?.find((item) => item.to === "Student" && item.field === "student_id");
  if (!link || plan.lookup.some((item) => item.from === "Student")) return plan;
  const hasName = plan.pick.includes("full_name") || plan.pick.includes("student_name");
  if (hasName && plan.groupBy !== "student_id") return plan;
  if (plan.groupBy && plan.groupBy !== "student_id") return plan;
  plan.lookup = [{ from: "Student", localField: "student_id", foreignField: "student_id", pick: ["full_name"] }, ...plan.lookup].slice(0, 2);
  return plan;
}

function showValue(value) {
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

function reportPick(collection) {
  const preferred = ["full_name", "student_name", "class_name", "current_class", "admission_number", "subject_name", "status", "attendance_date", "gender", "session_name"];
  const names = new Set(collection.fields.map((field) => field.name));
  const pick = preferred.filter((name) => names.has(name));
  if (pick.length) return pick.slice(0, 6);
  return collection.fields
    .map((field) => field.name)
    .filter((name) => !["_id", "school_id"].includes(name) && !/Mixed|Array/.test(collection.fields.find((field) => field.name === name)?.type || ""))
    .slice(0, 6);
}

async function recordsForReport(plan, schoolId) {
  const collection = collectionMap.get(plan.from);
  const pick = reportPick(collection);
  if (plan.from === "StudentClassAssignment" && hasField(collection, "student_id") && !pick.includes("student_id")) {
    pick.push("student_id");
  }
  const listed = await runQuery(ensureStudentLookup({
    ...plan,
    shape: "list",
    groupBy: "",
    metric: null,
    pick,
    lookup: [],
    limit: 100,
    sort: "asc",
  }), schoolId);
  if (plan.from !== "StudentClassAssignment") return listed;
  const seen = new Set();
  const rows = (listed.rows || []).filter((row) => {
    const id = String(row.student_id || row.full_name || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((row) => {
    const next = { ...row };
    delete next.student_id;
    return next;
  });
  return presentTable({ ...listed, rows });
}

function pdfFileName(title) {
  const slug = String(title || "records").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "records"}.pdf`;
}

async function withReport(schoolId, question, plan, table, payload) {
  try {
    const report = table.countOnly ? await recordsForReport(plan, schoolId) : table;
    const school = await mongoose.model("School").findOne({ school_id: String(schoolId) }).select("school_name").lean();
    const columns = report.columns || [];
    const rows = (report.rows || []).map((row) => {
      const next = {};
      columns.forEach((col) => { next[col.key] = showValue(row[col.key]); });
      return next;
    });
    const summary = table.countOnly
      ? `${table.total} matching record${table.total === 1 ? "" : "s"}.`
      : `${rows.length} record${rows.length === 1 ? "" : "s"}.`;
    const note = report.truncated || (table.countOnly && table.total > rows.length)
      ? "This file shows the first matching records, not every row in the school."
      : "";
    const buffer = buildRecordPdf({
      schoolName: school?.school_name || "School",
      title: payload.title || plan.title || "Records",
      question,
      summary: payload.message || summary,
      columns,
      rows,
      note,
    });
    return {
      ...payload,
      pdf: { filename: pdfFileName(payload.title || plan.title), base64: buffer.toString("base64") },
    };
  } catch (err) {
    console.warn("[AI-ASSISTANT] pdf", err.message);
    return payload;
  }
}

function metricValue(docs, metric) {
  if (metric.op === "count") return docs.length;
  const nums = docs.map((doc) => numericValue(doc[metric.field])).filter((n) => n != null);
  if (!nums.length) return 0;
  if (metric.op === "sum") return nums.reduce((sum, n) => sum + n, 0);
  if (metric.op === "min") return Math.min(...nums);
  if (metric.op === "max") return Math.max(...nums);
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function metricKey(metric) {
  if (metric.op === "count") return "count";
  return `${metric.op}_${metric.field}`;
}

function round(value) {
  return typeof value === "number" ? Math.round(value * 100) / 100 : value;
}

async function attachLookups(rows, lookups, schoolId) {
  for (const lookup of lookups) {
    const ids = [...new Set(rows.map((row) => row[lookup.localField]).filter((id) => id != null && id !== ""))];
    if (!ids.length) continue;
    const Model = mongoose.model(lookup.from);
    const related = await Model.find({
      school_id: String(schoolId),
      [lookup.foreignField]: { $in: ids },
    }).select([...lookup.pick, lookup.foreignField].join(" ")).lean();
    const byId = new Map(related.map((doc) => [String(doc[lookup.foreignField]), doc]));
    rows.forEach((row) => {
      const match = byId.get(String(row[lookup.localField]));
      lookup.pick.forEach((name) => { row[name] = match?.[name] ?? "—"; });
    });
  }
  return rows;
}

function toColumns(rows) {
  const keys = rows[0] ? Object.keys(rows[0]) : [];
  return keys.map((key) => ({
    key,
    label: key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }));
}

function presentTable(table) {
  const rowsIn = table.rows || [];
  if (!rowsIn.length) return table;
  const keys = Object.keys(rowsIn[0]);
  const nameKey = keys.includes("full_name") ? "full_name" : keys.includes("student_name") ? "student_name" : "";
  const classKey = keys.includes("class_name") ? "class_name" : keys.includes("current_class") ? "current_class" : "";
  const show = keys.includes("rank") && nameKey && classKey
    ? ["rank", nameKey, classKey]
    : keys.filter((key) => !/_id$/.test(key) && key !== "stream");
  const labels = {
    rank: "Rank",
    full_name: "Student",
    student_name: "Student",
    class_name: "Class",
    current_class: "Class",
  };
  const columns = show.map((key) => ({
    key,
    label: labels[key] || key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }));
  const rows = rowsIn.map((row) => {
    const next = {};
    show.forEach((key) => { next[key] = row[key]; });
    return next;
  });
  return { ...table, columns, rows };
}

function countReply(plan, total) {
  const number = String(total);
  let text = (plan.answer || "").replaceAll("{n}", number).trim();
  if (!text) text = `${plan.title}: ${number}. Do you want the list?`;
  if (!/\blist\b/i.test(text)) text = `${text.replace(/[.?\s]+$/, "")}. Do you want the list?`;
  return text;
}

function describe(plan) {
  const filters = plan.where.map((clause) => (
    clause.op === "empty" || clause.op === "notEmpty" ? `${clause.field} ${clause.op}` : `${clause.field} ${clause.op} ${clause.value}`
  )).join(", ");
  const where = filters ? ` where ${filters}` : "";
  if (plan.shape === "count") return `Count from ${plan.from}${where}.`;
  if (plan.groupBy) {
    const what = plan.metric.op === "count" ? "count rows" : `${plan.metric.op} ${plan.metric.field}`;
    return `From ${plan.from}${where}, ${what} for each ${plan.groupBy}, ${plan.sort === "asc" ? "lowest" : "highest"} first, limit ${plan.limit}.`;
  }
  return `From ${plan.from}${where}, show ${plan.pick.join(", ")}, limit ${plan.limit}.`;
}

async function runQuery(plan, schoolId) {
  const Model = mongoose.model(plan.from);
  const match = mongoMatch(plan, schoolId);
  const docs = await Model.find(match).limit(MAX_SCAN).lean();

  if (plan.shape === "count") {
    const seen = new Set();
    const counted = plan.from === "StudentClassAssignment"
      ? docs.filter((doc) => {
        const id = String(doc.student_id || doc._id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      : docs;
    const total = plan.metric && plan.metric.op !== "count" ? metricValue(counted, plan.metric) : counted.length;
    return { countOnly: true, total: round(total), truncated: docs.length >= MAX_SCAN };
  }

  if (plan.groupBy) {
    const groups = new Map();
    docs.forEach((doc) => {
      const key = doc[plan.groupBy];
      if (key == null || key === "") return;
      const id = String(key);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(doc);
    });
    const valueKey = metricKey(plan.metric);
    let rows = [...groups.entries()].map(([id, group]) => ({
      [plan.groupBy]: id,
      [valueKey]: round(metricValue(group, plan.metric)),
      records: group.length,
    }));
    rows.sort((a, b) => plan.sort === "asc" ? a[valueKey] - b[valueKey] : b[valueKey] - a[valueKey]);
    rows = rows.slice(0, plan.limit);
    await attachLookups(rows, plan.lookup, schoolId);
    rows = rows.map((row, index) => {
      const next = { rank: index + 1 };
      Object.keys(row).forEach((key) => { next[key] = showValue(row[key]); });
      return next;
    });
    return presentTable({ columns: toColumns(rows), rows, truncated: docs.length >= MAX_SCAN });
  }

  const sortField = plan.pick.find((name) => docs[0] && docs[0][name] != null) || plan.pick[0];
  const sorted = [...docs].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (av === bv) return 0;
    return plan.sort === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });
  let rows = sorted.slice(0, plan.limit).map((doc) => {
    const row = {};
    plan.pick.forEach((name) => { row[name] = doc[name]; });
    plan.lookup.forEach((lookup) => { row[lookup.localField] = doc[lookup.localField]; });
    return row;
  });
  if (plan.lookup.length) await attachLookups(rows, plan.lookup, schoolId);
  rows = rows.map((row, index) => {
    const next = { rank: index + 1 };
    plan.pick.forEach((name) => { next[name] = showValue(row[name]); });
    plan.lookup.forEach((lookup) => {
      lookup.pick.forEach((name) => { next[name] = showValue(row[name]); });
    });
    return next;
  });
  return presentTable({ columns: toColumns(rows), rows, truncated: docs.length >= MAX_SCAN });
}

function cleanHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-8)
    .map((item) => {
      const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : "";
      const text = String(item?.text || "").trim().slice(0, 500);
      return role && text ? { role, content: text } : null;
    })
    .filter(Boolean);
}

function packFor(question, history = []) {
  const q = question.trim();
  const detailFollow = /\b(in detail|explain more|more detail|tell me more|go on)\b/i.test(q);
  const greeting = /^(hi|hello|hey|yo|thanks|thank you|how are you|how r you|how u doing|how's it going|whats up|what's up|good morning|good afternoon|good evening)\b/i.test(q) && q.length < 60;
  const howTo = /\b(how do i|how to|how can i|where do i|where can i|what is|help me)\b/i.test(q);
  const records = /\b(how many|number of|count|which|who has|who is|best|highest|lowest|top|average|present|absent|student|staff|teacher|class|score|fee|record|attendance|perform)\b/i.test(q);
  const listFollow = /^(yes|yeah|yep|ok|okay|sure|list|list them|list it|show them|show the list|give me the list|the list)\b/i.test(q);
  if (detailFollow && !records) return "docs";
  if (greeting) return "chat";
  if (howTo && !/\bhow many\b|\bnumber of\b|\bcount of\b/i.test(q)) return "docs";
  if (listFollow) {
    const previous = [...history].reverse().find((item) => item.role === "assistant");
    if (previous && /\b(list|student|staff|teacher|class|score|record|attendance|fee|jss|sss)\b/i.test(previous.content)) return "query";
  }
  if (classMentions(q).length) return "query";
  const earlier = history.map((item) => item.content || "").join("\n");
  const continuesRecords = /\b(student|attendance|present|class|score|jss|sss|rank|list)\b/i.test(earlier);
  if (continuesRecords && /\b(give me|i want|for jss|for sss|that is|instead|not that|wrong class|switch)\b/i.test(q)) return "query";
  if (records) return "query";
  return "chat";
}

function periodIdentity(question) {
  const q = String(question || "").trim();
  const sessionWord = /\b(seasi?ons?|sessions?|academic years?)\b/i;
  const termWord = /\b(sub\s?seasi?ons?|sub\s?sessions?|terms?)\b/i;
  const askedSession = sessionWord.test(q);
  const askedTerm = termWord.test(q);
  if (!askedSession && !askedTerm) return null;
  if (/\b(class|student|staff|teacher|timetable|time\s*table|attendance|score|fee|bill|subject|how many|who)\b/i.test(q)) return null;
  if (!/\b(what|which|current|active|now|today)\b/i.test(q) && q.split(/\s+/).length > 6) return null;
  return { session: askedSession, term: askedTerm };
}

function periodQuestion(question, history = []) {
  const direct = periodIdentity(question);
  if (direct) return direct;
  const q = String(question || "").trim();
  const correction = /^(no|nope|wrong|not that|that is not|in my school|this school|my school)\b/i.test(q) && q.length < 80;
  if (!correction) return null;
  const previous = [...history].reverse().find((item) => item.role === "assistant");
  const text = previous?.content || "";
  if (!/active (session|term)/i.test(text)) return null;
  return { session: /session/i.test(text), term: /term/i.test(text) };
}

function missingTimetableQuestion(question) {
  const q = String(question || "");
  return /\b(timetables?|time\s*tables?)\b/i.test(q)
    && /\b(not|no|without|don'?t|do not|missing|yet|lack|haven'?t|has no|have no|does not|doesn'?t)\b/i.test(q);
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

async function classesMissingTimetable(schoolId, question) {
  const period = await activePeriod(schoolId);
  const termName = period.term?.term_name || "";
  if (!period.term) {
    return { success: true, kind: "chat", message: "This school has no active term, so I cannot check class timetables." };
  }
  const [classes, timetables] = await Promise.all([
    mongoose.model("Class").find({ school_id: String(schoolId), is_active: { $ne: false } }).select("class_id class_name").lean(),
    mongoose.model("ClassTimetable").find({ school_id: String(schoolId), subsession_id: period.term.term_id }).select("class_id entries").lean(),
  ]);
  const covered = new Set(
    timetables
      .filter((item) => !Array.isArray(item.entries) || item.entries.length > 0)
      .map((item) => String(item.class_id))
  );
  const missing = classes
    .filter((item) => item.class_id && !covered.has(String(item.class_id)))
    .map((item) => String(item.class_name || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  logAssistant("timetable-gap", { term: termName, classes: classes.length, withTimetable: covered.size, missing: missing.length });
  const title = `Classes without a timetable in ${termName}`;
  const message = missing.length
    ? `${missing.length === 1 ? joinNames(missing) + " does" : `${missing.length} classes do`} not have a timetable for ${termName} yet${missing.length > 1 && missing.length <= 6 ? `: ${joinNames(missing)}` : ""}.`
    : `Every active class already has a timetable for ${termName}.`;
  const columns = [{ key: "class_name", label: "Class" }];
  const rows = missing.map((name) => ({ class_name: name }));
  const payload = { success: true, kind: "query", title, message, columns, rows, truncated: false };
  if (!rows.length) return { success: true, kind: "chat", message };
  return withReport(schoolId, question, { from: "Class", title, where: [] }, { columns, rows, truncated: false }, payload);
}

async function answerActivePeriod(schoolId, which) {
  const period = await activePeriod(schoolId);
  logAssistant("period", {
    session: period.session?.session_name || null,
    term: period.term?.term_name || null,
    which,
  });
  const parts = [];
  if (which.session) {
    parts.push(period.session
      ? `The active session in this school is ${period.session.session_name}.`
      : "This school has no active session right now.");
  }
  if (which.term) {
    parts.push(period.term
      ? `The active term in this school is ${period.term.term_name}.`
      : "This school has no active term right now.");
  }
  return { success: true, kind: "chat", message: parts.join(" ") };
}

function calendarDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

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

function classPatterns(value) {
  return nameForms(value).map(flexibleRegex);
}

function canonicalCollection(name) {
  const raw = String(name || "").trim();
  if (collectionMap.has(raw)) return raw;
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  const aliases = {
    student: "Student",
    students: "Student",
    class: "Class",
    classes: "Class",
    subject: "Subject",
    subjects: "Subject",
    attendance: "StudentAttendance",
    studentattendance: "StudentAttendance",
    score: "StudentScore",
    scores: "StudentScore",
    studentscore: "StudentScore",
    studentscores: "StudentScore",
    studentclassassignment: "StudentClassAssignment",
    classassignment: "StudentClassAssignment",
    session: "Session",
    sessions: "Session",
    subsession: "Subsession",
    subsessions: "Subsession",
    term: "Subsession",
    terms: "Subsession",
    bill: "Bill",
    bills: "Bill",
    fee: "Bill",
    fees: "Bill",
    payment: "Payment",
    payments: "Payment",
    staff: "Staff",
    teacher: "Teacher",
    teachers: "Teacher",
  };
  if (aliases[key] && collectionMap.has(aliases[key])) return aliases[key];
  return [...collectionMap.keys()].find((item) => item.toLowerCase() === key) || null;
}

function periodStatus(startDate, endDate, archived) {
  if (archived) return "archived";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "draft";
  if (today < start) return "draft";
  if (today <= end) return "active";
  return "completed";
}

function displayFields(collection) {
  const preferred = ["full_name", "student_name", "class_name", "name", "subject_name", "session_name", "term_name", "title"];
  const names = new Set((collection?.fields || []).map((field) => field.name));
  const picked = preferred.filter((name) => names.has(name));
  if (picked.length) return picked.slice(0, 4);
  return (collection?.fields || [])
    .map((field) => field.name)
    .filter((name) => !["_id", "school_id"].includes(name))
    .slice(0, 4);
}

function classMentions(text) {
  const source = String(text || "");
  const found = [];
  [
    /junior\s+secondary\s+school\s*\d+/ig,
    /senior\s+secondary\s+school\s*\d+/ig,
    /\bjss\s*\d+\b/ig,
    /\bsss\s*\d+\b/ig,
  ].forEach((pattern) => {
    (source.match(pattern) || []).forEach((item) => found.push(item.replace(/\s+/g, " ").trim()));
  });
  return [...new Set(found)];
}

function wantedClass(question) {
  const source = String(question || "");
  const directed = source.match(/\b(?:for|want(?:\s+for)?|switch to|instead(?:\s+of)?)\s+(?:the\s+)?((?:junior|senior)\s+secondary\s+school\s*\d+|jss\s*\d+|sss\s*\d+)/i);
  if (directed) return directed[1].replace(/\s+/g, " ").trim();
  const mentions = classMentions(source);
  if (mentions.length > 1 && /\b(that is|not|wrong|instead)\b/i.test(source)) return mentions[mentions.length - 1];
  return mentions[0] || "";
}

function questionTarget(question) {
  const wanted = wantedClass(question);
  if (wanted) return wanted;
  const match = String(question || "").match(/\b(?:in|for|of|from)\s+(.+?)(?:\?|$)/i);
  const tail = (match ? match[1] : "").replace(/^(the|a|an|that|this)\s+/i, "").trim();
  return tail.split(/\b(?:like|who|that|which|with)\b/i)[0].trim();
}

function continuedQuestion(question, history) {
  const wanted = wantedClass(question);
  if (!wanted) return question;
  const previous = [...history].reverse().find((item) => item.role === "user" && /\b(attend|present|score|student|best|top|how many|rank)\b/i.test(item.content || ""));
  if (!previous) return question;
  const previousClass = classMentions(previous.content)[0] || "";
  const same = previousClass && previousClass.replace(/\s+/g, "").toLowerCase() === wanted.replace(/\s+/g, "").toLowerCase();
  if (same) return question;
  return `${question}\nRun the same request again for ${wanted} only. Use that class. Do not use the previous class or the previous student names.`;
}

function wantsAttendanceRank(question, history) {
  if (/\bhow many\b|\bnumber of\b|\bcount of\b/i.test(question)) return false;
  const earlier = history.filter((item) => item.role === "user").map((item) => item.content || "").join("\n");
  const blob = `${question}\n${earlier}`;
  if (!/\b(attendance|attendace|present)\b/i.test(blob) || !/\b(most|highest|who|rank|top)\b/i.test(blob)) return false;
  const askingNow = /\b(attendance|attendace|present|most)\b/i.test(question);
  const switching = Boolean(wantedClass(question)) && /\b(give me|i want|that is|instead|for jss|for sss|wrong)\b/i.test(question);
  return askingNow || switching;
}

function attendanceRankPlan(named) {
  const cls = named.classes[0];
  return {
    kind: "query",
    shape: "list",
    title: `Most present in ${cls.class_name}`,
    answer: "",
    from: "StudentAttendance",
    where: [
      { field: "class_id", op: "eq", value: cls.class_id },
      { field: "status", op: "eq", value: "present" },
    ],
    groupBy: "student_id",
    metric: { op: "count", field: "" },
    sort: "desc",
    limit: 10,
    lookup: [],
    pick: [],
  };
}

function pinClass(plan, named) {
  if (named.classes.length !== 1) return plan;
  const cls = named.classes[0];
  const collection = collectionMap.get(plan.from);
  if (!collection) return plan;
  const has = (name) => collection.fields.some((field) => field.name === name);
  if (has("class_id")) {
    plan.where = plan.where.filter((clause) => clause.field !== "class_id" && clause.field !== "class_name");
    plan.where.push({ field: "class_id", op: "eq", value: cls.class_id });
  } else if (has("class_name")) {
    plan.where = plan.where.filter((clause) => clause.field !== "class_name");
    plan.where.push({ field: "class_name", op: "eq", value: cls.class_name });
  }
  return plan;
}

function labelClass(table, className) {
  if (!className || !table?.rows?.length) return table;
  const rows = table.rows.map((row) => ({ ...row, class_name: row.class_name && row.class_name !== "—" ? row.class_name : className }));
  return presentTable({ ...table, rows });
}

function lookupText(question, history = []) {
  if (classMentions(question).length) return question;
  const follow = /^(yes|yeah|yep|ok|okay|sure|list|list them|list it|show them|show the list|give me the list|the list)\b/i.test(String(question || "").trim());
  if (!follow) return question;
  const previous = [...history].reverse().find((item) => item.role === "user" && classMentions(item.content).length);
  return previous ? previous.content : question;
}

async function activePeriod(schoolId) {
  const sessions = await mongoose.model("Session").find({ school_id: String(schoolId) }).lean();
  const session = sessions.find((item) => periodStatus(item.academic_year_start_date, item.academic_year_end_date, item.is_archived) === "active") || null;
  const terms = session
    ? await mongoose.model("Subsession").find({ school_id: String(schoolId), session_id: session.session_id }).lean()
    : [];
  const term = terms.find((item) => periodStatus(item.term_start_date, item.term_end_date, item.is_archived) === "active") || null;
  return {
    session: session ? { session_id: session.session_id, session_name: session.session_name } : null,
    term: term ? { term_id: term.term_id, term_name: term.term_name } : null,
  };
}

async function namedThings(schoolId, question, history = []) {
  const target = questionTarget(lookupText(question, history));
  if (!target) return { target: "", classes: [], subjects: [] };
  const patterns = classPatterns(target);
  const [classes, subjects] = await Promise.all([
    mongoose.model("Class").find({
      school_id: String(schoolId),
      $or: patterns.flatMap((pattern) => [{ class_name: pattern }, { class_code: pattern }]),
    }).select("class_id class_name").limit(6).lean(),
    mongoose.model("Subject").find({
      school_id: String(schoolId),
      $or: patterns.flatMap((pattern) => [{ subject_name: pattern }, { subject_code: pattern }]),
    }).select("subject_id subject_name").limit(6).lean(),
  ]);
  return { target, classes, subjects };
}

function applyActivePeriod(plan, period, question) {
  if (/\b(all time|every session|all sessions|past sessions|history)\b/i.test(question)) return plan;
  const collection = collectionMap.get(plan.from);
  if (!collection) return plan;
  const has = (name) => collection.fields.some((field) => field.name === name);
  if (period.session && has("session_id") && !plan.where.some((clause) => clause.field === "session_id")) {
    plan.where.push({ field: "session_id", op: "eq", value: period.session.session_id });
  }
  if (plan.from === "StudentClassAssignment") {
    plan.where = plan.where.filter((clause) => clause.field !== "subsession_id");
    return plan;
  }
  if (period.term && has("subsession_id") && !plan.where.some((clause) => clause.field === "subsession_id")) {
    plan.where.push({ field: "subsession_id", op: "eq", value: period.term.term_id });
  }
  return plan;
}

function contextText(period, named) {
  const lines = [];
  if (period.session) {
    lines.push(`Active session: ${period.session.session_name} (session_id ${period.session.session_id}).`);
  } else {
    lines.push("No active session. Do not invent a session id.");
  }
  if (period.term) {
    lines.push(`Active term, also called a subsession: ${period.term.term_name} (term_id ${period.term.term_id}). Other collections store this id as subsession_id.`);
  } else {
    lines.push("No active term.");
  }
  lines.push("Unless the user names another session or says all time, add session_id and subsession_id filters with these ids when the collection has those fields. Scores, attendance, fees, and class membership belong to this session and term.");
  if (named.target && named.classes.length && !named.subjects.length) {
    const listed = named.classes.map((item) => `${item.class_name} (class_id ${item.class_id})`).join("; ");
    lines.push(`"${named.target}" is a class: ${listed}. It is not a subject. Students in that class are StudentClassAssignment rows with that class_id.`);
  } else if (named.target && named.subjects.length && !named.classes.length) {
    const listed = named.subjects.map((item) => `${item.subject_name} (subject_id ${item.subject_id})`).join("; ");
    lines.push(`"${named.target}" is a subject: ${listed}. It is not a class.`);
  } else if (!named.target) {
    lines.push("If a name could be a class, a subject, staff, or an admin and you cannot tell from the schema, set kind to clarify and ask one question.");
  }
  return lines.join(" ");
}

function systemPrompt(pack, context = "") {
  const base = [
    "You answer a school admin by returning one JSON object and nothing else.",
    "Earlier messages are the conversation. A short follow-up continues the last topic. Do not ask them to repeat it.",
  ];
  if (pack === "docs") {
    return base.concat([
      "The question is how to use the product. Read the docs and set kind to docs. Set docId to the article you used. Do not invent an id. Set title to a short heading. Set items to a list of steps, each with a short title and one sentence in text. A first answer is two or three items. If they ask for detail, add a few more items from that same article. Do not paste the article.",
      `When a step names a dashboard page, wrap that name in [[double brackets]]. Use only these names: ${PAGE_NAMES}. Example: go to [[Academic Sessions]].`,
      `Docs: ${JSON.stringify(docs)}`,
    ]).join("\n");
  }
  if (pack === "query") {
    return base.concat([
      "The question asks for this school's records. Read the schema first. Set kind to query only when you know which collection answers it. Use only the collection names in the schema.",
      "Query fields: kind, shape, title, answer, from, where (field, op eq|ne|contains|gte|lte|empty|notEmpty, value), groupBy, metric {op count|sum|avg|min|max, field}, sort asc|desc, limit, lookup {from, localField, foreignField, pick}, pick.",
      "If you are not sure what a name refers to, or you do not understand the question, set kind to clarify and put one short question in answer. Do not query.",
      "A clarify reply is {\"kind\":\"clarify\",\"answer\":\"Is JSS 1 a class or a subject?\"}.",
      context,
      `Today is ${calendarDate()}. Attendance dates are YYYY-MM-DD. When they say today, set attendance_date eq ${calendarDate()}.`,
      "How many students in a class uses shape count, from StudentClassAssignment, where class_name or class_id matches that class and is_active eq true. JSS 1 and Junior Secondary School 1 are the same class.",
      "Students present today: from StudentAttendance, where status eq present and attendance_date eq the date above, lookup Student, pick full_name.",
      "Who was present the most: from StudentAttendance, where status eq present and class_id is the class they named, groupBy student_id, metric count, sort desc, lookup Student, pick full_name. Do not use StudentClassAssignment for attendance.",
      "Best or top students: from StudentScore, groupBy student_id, metric avg of scores, sort desc, limit 10, lookup Student, pick full_name. Limit it to the class and to the active session and term.",
      "Fees use Bill or Payment. Read the schema fields before you choose.",
      "If the user then says yes, list them, or names another class, repeat the same request for that class. Do not ask again. Do not copy the previous students into the new answer.",
      "A blank or missing value uses op empty and no value. A filled value uses op notEmpty.",
      "Do not include school_id. Do not write database code.",
      `Schema: ${JSON.stringify(compactSchema(schema))}`,
    ]).join("\n");
  }
  return base.concat([
    "Answer the question in one or two short sentences. Set kind to chat and put the reply in answer. Do not query the database.",
  ]).join("\n");
}

async function askModel(config, question, history) {
  const pack = packFor(question, history);
  const messages = [
    { role: "system", content: systemPrompt(pack) },
    ...history,
    { role: "user", content: question },
  ];
  const ceiling = 700;
  const maxTokens = pack === "chat" ? Math.min(400, ceiling) : ceiling;
  let thread = messages;
  let lastText = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await groqChat({
      apiKey: config.api_key,
      model: config.model,
      maxTokens,
      temperature: 0.1,
      messages: thread,
      reasoningEffort: "low",
    });
    lastText = planText(completion?.choices?.[0]?.message);
    const parsed = extractJsonFromText(lastText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    thread = [
      ...messages,
      { role: "assistant", content: String(lastText || "").slice(0, 800) },
      { role: "user", content: "Reply again with one JSON object only." },
    ];
  }
  if (lastText.trim()) return { kind: "chat", answer: lastText.trim().slice(0, 800) };
  throw new Error("Please try again.");
}

function planText(message) {
  const content = getMessageText(message);
  if (content) return content;
  if (typeof message?.reasoning === "string" && message.reasoning.trim()) return message.reasoning.trim();
  if (Array.isArray(message?.reasoning_details)) {
    return message.reasoning_details.map((part) => part?.text || part?.content || "").join("\n").trim();
  }
  return "";
}

async function completeJson(config, messages, maxTokens) {
  let thread = messages;
  let lastText = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await groqChat({
      apiKey: config.api_key,
      model: config.model,
      maxTokens,
      temperature: 0.1,
      messages: thread,
      reasoningEffort: "low",
      responseFormat: { type: "json_object" },
    });
    const message = completion?.choices?.[0]?.message;
    lastText = planText(message);
    const parsed = extractJsonFromText(lastText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    console.warn(`[AI-ASSISTANT] unusable plan, finish=${completion?.choices?.[0]?.finish_reason || "none"}, chars=${lastText.length}`);
    thread = [
      ...messages,
      { role: "assistant", content: String(lastText || "").slice(0, 800) },
      { role: "user", content: "Reply again with one JSON object only. Put the JSON in the answer, not in your reasoning." },
    ];
  }
  throw new Error("The model did not return a usable plan.");
}

function fieldHint(errorMessage) {
  const name = String(errorMessage).match(/from ([A-Za-z0-9_]+)/)?.[1];
  const collection = name && collectionMap.get(name);
  if (!collection) return "";
  const fields = collection.fields.map((field) => field.name).filter((field) => !["_id", "school_id"].includes(field));
  return ` Use only these ${name} fields: ${fields.join(", ")}.`;
}

function applyQuestionShape(plan, question) {
  if (plan.kind !== "query") return plan;
  if (/\bhow many\b|\bnumber of\b|\bcount of\b/i.test(question) && !plan.groupBy) plan.shape = "count";
  if (/^(yes|yeah|yep|ok|okay|sure|list|list them|list it|show them|show the list|give me the list)\b/i.test(question)) plan.shape = "list";
  return plan;
}

function queryPayload(plan, table, message) {
  if (table.countOnly) {
    return { success: true, kind: "query", title: plan.title, count: table.total, message };
  }
  return {
    success: true,
    kind: "query",
    title: plan.title,
    message,
    columns: table.columns,
    rows: table.rows,
    truncated: table.truncated,
  };
}

async function phraseResult(config, question, table) {
  const data = table.countOnly ? { count: table.total } : { rows: (table.rows || []).slice(0, 12) };
  return completeJson(config, [
    {
      role: "system",
      content: "Turn this query result into the answer a school admin should read. Return one JSON object. Use the numbers and names in the data only. If the rows answer the question, use {\"answer\":\"two or three short sentences\"}. For a count, say the number. For a ranking, name who is first and name the class in the rows. A count of attendance rows is present days, not a score. Rank is not a score. If the rows do not answer the question, use {\"retry\":true,\"reason\":\"what to change\"}.",
    },
    { role: "user", content: `Question: ${question}\nData: ${JSON.stringify(data)}` },
  ], 300);
}

async function answerFromQuery(config, question, history, schoolId) {
  const period = await activePeriod(schoolId);
  const named = await namedThings(schoolId, question, history);
  logAssistant("context", {
    question,
    session: period.session?.session_name || null,
    term: period.term?.term_name || null,
    target: named.target || null,
    classes: named.classes.map((item) => item.class_name),
    subjects: named.subjects.map((item) => item.subject_name),
  });
  if (named.classes.length && named.subjects.length) {
    logAssistant("clarify", "name matches both a class and a subject");
    const classNames = named.classes.map((item) => item.class_name).join(", ");
    const subjectNames = named.subjects.map((item) => item.subject_name).join(", ");
    return {
      success: true,
      kind: "chat",
      message: `"${named.target}" matches the class ${classNames} and the subject ${subjectNames}. Which one do you mean?`,
    };
  }
  if (wantsAttendanceRank(question, history) && named.classes.length === 1) {
    const plan = applyActivePeriod(ensureStudentLookup(attendanceRankPlan(named)), period, question);
    logAssistant("query", {
      from: plan.from,
      shape: plan.shape,
      where: plan.where,
      groupBy: plan.groupBy || null,
      metric: plan.metric,
      pick: plan.pick,
      forced: "attendance-rank",
    });
    const table = await runQuery(plan, schoolId);
    logAssistant("result", { rows: (table.rows || []).length, truncated: table.truncated });
    let message = plan.title;
    try {
      const verdict = await phraseResult(config, continuedQuestion(question, history), table);
      if (typeof verdict?.answer === "string" && verdict.answer.trim()) message = verdict.answer.trim();
    } catch (err) {
      /* the title is enough */
    }
    const shown = labelClass(table, named.classes[0].class_name);
    return withReport(schoolId, question, plan, shown, queryPayload(plan, shown, message));
  }
  const context = contextText(period, named);
  let messages = [
    { role: "system", content: systemPrompt("query", context) },
    ...history,
    { role: "user", content: continuedQuestion(question, history) },
  ];
  let lastError = "The assistant could not build that query.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parsed = await completeJson(config, messages, attempt === 0 ? 700 : 500);
    logAssistant("plan", { attempt: attempt + 1, kind: parsed?.kind || null, from: parsed?.from || null, shape: parsed?.shape || null });
    try {
      if (parsed?.kind === "clarify") {
        const answer = String(parsed.answer || "").trim();
        if (answer) {
          logAssistant("clarify", answer);
          return { success: true, kind: "chat", message: answer };
        }
      }
      let plan = validatePlan(parsed);
      if (plan.kind === "clarify") {
        logAssistant("clarify", plan.answer);
        return { success: true, kind: "chat", message: plan.answer };
      }
      if (plan.kind !== "query") throw new Error("Return a query for this question, or kind clarify if you need to ask.");
      plan = ensureStudentLookup(applyQuestionShape(plan, question));
      plan.where = await resolveClauses(plan, schoolId);
      if (plan.from === "StudentClassAssignment" && !/\b(all time|past|former|previous|history)\b/i.test(question) && !plan.where.some((clause) => clause.field === "is_active")) {
        plan.where.push({ field: "is_active", op: "eq", value: true });
      }
      applyActivePeriod(plan, period, question);
      pinClass(plan, named);
      logAssistant("query", {
        from: plan.from,
        shape: plan.shape,
        where: plan.where,
        groupBy: plan.groupBy || null,
        metric: plan.metric,
        pick: plan.pick,
      });
      const table = await runQuery(plan, schoolId);
      logAssistant("result", table.countOnly ? { count: table.total } : { rows: (table.rows || []).length, truncated: table.truncated });
      let verdict = null;
      try {
        verdict = await phraseResult(config, question, table);
      } catch (err) {
        const fallback = table.countOnly ? countReply(plan, table.total) : plan.title;
        return withReport(schoolId, question, plan, table, queryPayload(plan, table, fallback));
      }
      logAssistant("answer", typeof verdict?.answer === "string" ? verdict.answer : verdict?.retry ? `retry: ${verdict.reason || ""}` : "none");
      if (verdict?.retry && attempt < 2) {
        messages = [
          { role: "system", content: `The query ran but did not answer the question. Return a better JSON query, or kind clarify if you need to ask. ${context}` },
          {
            role: "user",
            content: `Question: ${question}\nProblem: ${verdict.reason || "wrong result"}\nPrevious query: ${JSON.stringify({ from: plan.from, where: plan.where, groupBy: plan.groupBy, metric: plan.metric, lookup: plan.lookup, pick: plan.pick }).slice(0, 800)}`,
          },
        ];
        continue;
      }
      const message = typeof verdict?.answer === "string" && verdict.answer.trim()
        ? verdict.answer.trim()
        : (table.countOnly ? countReply(plan, table.total) : plan.title);
      return withReport(schoolId, question, plan, table, queryPayload(plan, table, message));
    } catch (err) {
      lastError = err.message;
      logAssistant("rejected", err.message);
      messages = [
        { role: "system", content: `Rewrite one JSON query, or set kind to clarify and ask a question. from must be a schema collection name. ${context}` },
        {
          role: "user",
          content: `Question: ${question}\nRejected query: ${JSON.stringify(parsed).slice(0, 1200)}\nError: ${err.message}.${fieldHint(err.message)}`,
        },
      ];
    }
  }
  const backup = await backupClassQuery(question, named, period);
  if (!backup) throw new Error(lastError);
  logAssistant("backup", { from: backup.from, where: backup.where, shape: backup.shape });
  const table = await runQuery(backup, schoolId);
  let message = table.countOnly ? `There are ${table.total} students in ${named.classes[0].class_name}.` : backup.title;
  try {
    const verdict = await phraseResult(config, question, table);
    if (typeof verdict?.answer === "string" && verdict.answer.trim()) message = verdict.answer.trim();
  } catch (err) {
    /* the count or title is enough */
  }
  return withReport(schoolId, question, backup, table, queryPayload(backup, table, message));
}

function backupClassQuery(question, named, period) {
  if (named.classes.length !== 1 || named.subjects.length) return null;
  const cls = named.classes[0];
  const ranking = /\b(best|top|highest|perform)\b/i.test(question);
  const aboutStudents = /\bstudent/i.test(question);
  if (!ranking && !aboutStudents) return null;
  const plan = ranking
    ? {
      kind: "query",
      shape: "list",
      title: `Top students in ${cls.class_name}`,
      answer: "",
      from: "StudentScore",
      where: [{ field: "class_id", op: "eq", value: cls.class_id }],
      groupBy: "student_id",
      metric: { op: "avg", field: "scores" },
      sort: "desc",
      limit: 10,
      lookup: [],
      pick: [],
    }
    : {
      kind: "query",
      shape: "count",
      title: `Students in ${cls.class_name}`,
      answer: "",
      from: "StudentClassAssignment",
      where: [
        { field: "class_id", op: "eq", value: cls.class_id },
        { field: "is_active", op: "eq", value: true },
      ],
      groupBy: "",
      metric: null,
      sort: "desc",
      limit: 10,
      lookup: [],
      pick: ["class_name"],
    };
  return applyActivePeriod(ensureStudentLookup(plan), period, question);
}

exports.ask = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const question = String(req.body?.question || "").trim();
    if (!question) return res.status(400).json({ success: false, message: "Type a question first." });
    if (question.length > 400) return res.status(400).json({ success: false, message: "Keep the question under 400 characters." });

    const config = await activeConfig();
    if (!config) return res.status(400).json({ success: false, message: "No active School Assistant model. In AI Config, set Use to School Assistant and turn it on." });

    const history = cleanHistory(req.body?.history);
    if (missingTimetableQuestion(question)) {
      logAssistant("ask", { schoolId, pack: "timetable-gap", question });
      return res.json(await classesMissingTimetable(schoolId, question));
    }
    const periodAsk = periodQuestion(question, history);
    if (periodAsk) {
      logAssistant("ask", { schoolId, pack: "period", question });
      return res.json(await answerActivePeriod(schoolId, periodAsk));
    }
    const pack = packFor(question, history);
    logAssistant("ask", { schoolId, pack, question });
    if (pack === "query") {
      const payload = await answerFromQuery(config, question, history, schoolId);
      return res.json(payload);
    }
    const parsed = await askModel(config, question, history);
    const plan = validatePlan(parsed);

    if (plan.kind === "chat") {
      return res.json({ success: true, kind: "chat", message: plan.answer, parts: linkParts(plan.answer) });
    }

    if (plan.kind === "unknown") {
      return res.json({
        success: true,
        kind: "unknown",
        message: "Please try again.",
      });
    }

    if (plan.kind === "docs") {
      const items = (plan.items.length ? plan.items : plan.answer ? [{ title: "", text: plan.answer }] : [])
        .map((item) => ({ title: item.title, text: item.text, parts: linkParts(item.text) }));
      if (!plan.docId || !items.length) {
        return res.json({ success: true, kind: "docs", message: plan.answer || "That is not covered in the docs.", parts: linkParts(plan.answer || "") });
      }
      return res.json({ success: true, kind: "docs", title: plan.title, items });
    }

    const reply = typeof plan.answer === "string" && plan.answer.trim() ? plan.answer.trim() : "Please try again.";
    return res.json({ success: true, kind: "chat", message: reply });
  } catch (error) {
    logAssistant("error", error.message);
    return res.status(200).json({ success: true, kind: "chat", message: "Please try again." });
  }
};
