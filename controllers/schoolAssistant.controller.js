const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const AIConfig = require("../models/AIConfig.model");
const { USE_SCHOOL_ASSISTANT } = require("../utils/aiConfigUse");
const { extractJsonFromText, getMessageText } = require("../utils/parseAiJson");
const { groqChat } = require("../utils/groqChat");
const SCHEMA_PATH = path.join(__dirname, "../data/assistantSchema.json");
const DOCS_PATH = path.join(__dirname, "../data/docsContent.json");
const OPS = new Set(["eq", "ne", "contains", "gte", "lte", "empty", "notEmpty"]);
const METRICS = new Set(["count", "sum", "avg", "min", "max"]);
const MAX_LIMIT = 50;
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

  const collection = collectionMap.get(raw.from);
  if (!collection) throw new Error("That collection is not available.");

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
    const pick = (Array.isArray(lookup.pick) ? lookup.pick : []).filter((name) => hasField(target, name) && name !== "_id").slice(0, 6);
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
    else extra.push({ [clause.field]: { $nin: [null, ""] } });
  }
  if (extra.length) match.$and = extra;
  return match;
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
    const total = plan.metric && plan.metric.op !== "count" ? metricValue(docs, plan.metric) : docs.length;
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
    rows = rows.map((row, index) => ({ rank: index + 1, ...row }));
    return { columns: toColumns(rows), rows, truncated: docs.length >= MAX_SCAN };
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
    plan.pick.forEach((name) => { row[name] = doc[name] ?? "—"; });
    plan.lookup.forEach((lookup) => { row[lookup.localField] = doc[lookup.localField]; });
    return row;
  });
  if (plan.lookup.length) await attachLookups(rows, plan.lookup, schoolId);
  rows = rows.map((row, index) => ({ rank: index + 1, ...row }));
  return { columns: toColumns(rows), rows, truncated: docs.length >= MAX_SCAN };
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

function packFor(question) {
  const q = question.trim();
  const detailFollow = /\b(in detail|explain more|more detail|tell me more|go on)\b/i.test(q);
  const greeting = /^(hi|hello|hey|yo|thanks|thank you|how are you|how r you|how u doing|how's it going|whats up|what's up|good morning|good afternoon|good evening)\b/i.test(q) && q.length < 60;
  const howTo = /\b(how do i|how to|how can i|where do i|where can i|what is|help me)\b/i.test(q);
  const records = /\b(how many|number of|count|which|who has|who is|best|highest|lowest|average|student|staff|teacher|class|score|fee|record|session)\b/i.test(q);
  if (detailFollow && !records) return "docs";
  if (greeting) return "chat";
  if (howTo && !/\bhow many\b|\bnumber of\b|\bcount of\b/i.test(q)) return "docs";
  return "chat";
}

function systemPrompt(pack) {
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
      "The question asks for this school's records. Set kind to query and use only the collections, fields, and links in the schema.",
      "Query fields: kind, shape, title, answer, from, where (field, op eq|ne|contains|gte|lte|empty|notEmpty, value), groupBy, metric {op count|sum|avg|min|max, field}, sort asc|desc, limit, lookup {from, localField, foreignField, pick}, pick.",
      "How many uses shape count, metric count, and no pick. Write answer as one sentence with {n} for the number, then ask if they want the list. Example: There are {n} staff in this school. Do you want the list?",
      "If the user then says yes, list, list them, or list it, use shape list for that same collection and the same filters. Pick only the useful fields.",
      "A blank or missing value uses op empty and no value. A filled value uses op notEmpty.",
      "A ranking such as the best student uses shape list, groupBy, a metric, sort, limit, and a lookup. Best student: from StudentScore, groupBy student_id, metric avg of scores, sort desc, limit 1, lookup Student, pick full_name.",
      "Do not include school_id. Do not write database code.",
      `Schema: ${JSON.stringify(compactSchema(schema))}`,
    ]).join("\n");
  }
  return base.concat([
    "Answer the question in one or two short sentences. Set kind to chat and put the reply in answer. Do not query the database.",
  ]).join("\n");
}

async function askModel(config, question, history) {
  const pack = packFor(question);
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
  const data = table.countOnly ? { count: table.total } : { rows: (table.rows || []).slice(0, 8) };
  return completeJson(config, [
    {
      role: "system",
      content: "Turn this query result into the answer a school admin should read. Return one JSON object. If the rows answer the question, use {\"answer\":\"two short sentences\"}. For a count, say the number and ask if they want the list. If the rows do not answer the question, use {\"retry\":true,\"reason\":\"what to change\"}.",
    },
    { role: "user", content: `Question: ${question}\nData: ${JSON.stringify(data)}` },
  ], 300);
}

async function answerFromQuery(config, question, history, schoolId) {
  let messages = [
    { role: "system", content: systemPrompt("query") },
    ...history,
    { role: "user", content: question },
  ];
  let lastError = "The assistant could not build that query.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parsed = await completeJson(config, messages, attempt === 0 ? 700 : 500);
    try {
      const plan = applyQuestionShape(validatePlan(parsed), question);
      if (plan.kind !== "query") throw new Error("Return a query for this question.");
      const table = await runQuery(plan, schoolId);
      let verdict = null;
      try {
        verdict = await phraseResult(config, question, table);
      } catch (err) {
        const fallback = table.countOnly ? countReply(plan, table.total) : plan.title;
        return queryPayload(plan, table, fallback);
      }
      if (verdict?.retry && attempt < 2) {
        messages = [
          { role: "system", content: "The query ran but did not answer the question. Return a better JSON query only." },
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
      return queryPayload(plan, table, message);
    } catch (err) {
      lastError = err.message;
      messages = [
        { role: "system", content: "Rewrite one JSON query. Use only real collection and field names from the error." },
        {
          role: "user",
          content: `Question: ${question}\nRejected query: ${JSON.stringify(parsed).slice(0, 1200)}\nError: ${err.message}.${fieldHint(err.message)}`,
        },
      ];
    }
  }
  throw new Error(lastError);
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
    console.warn("[AI-ASSISTANT]", error.message);
    return res.status(200).json({ success: true, kind: "chat", message: "Please try again." });
  }
};
