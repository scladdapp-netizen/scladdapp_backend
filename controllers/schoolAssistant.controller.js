"use strict";

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const AIConfig = require("../models/AIConfig.model");
const { USE_SCHOOL_ASSISTANT } = require("../utils/aiConfigUse");
const { extractJsonFromText, getMessageText } = require("../utils/parseAiJson");
const { groqChat } = require("../utils/groqChat");
const { openRouterChat } = require("../utils/openRouterChat");
const { buildRecordPdf } = require("../utils/simplePdf");
const { checkAssistantDataAccess } = require("../utils/planLimitCheck");
const { AccessDenied, resolveAccess } = require("../utils/assistantAccess");
const {
  createToolbox, ToolError, keySheet, sheetFor, collectionIndex, present, calendarDate,
} = require("../utils/assistantData");

const DOCS_PATH = path.join(__dirname, "../data/docsContent.json");
const MAX_STEPS = 6;
const MAX_TOOL_CHARS = 5000;
const CHAT_ROWS = 50;
const REPORT_ROWS = 300;

function logAssistant(step, detail) {
  const text = detail == null ? "" : typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`[AI-ASSISTANT] ${step}${text ? ` ${text}` : ""}`);
}

/* ---------- pages and docs ---------- */

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

const docsRaw = JSON.parse(fs.readFileSync(DOCS_PATH, "utf8"));
const docs = (Array.isArray(docsRaw) ? docsRaw : []).map((section) => ({
  section: section.section,
  items: (section.items || []).filter((item) => item.id).map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content || "",
    steps: (item.steps || []).map((step) => ({ step: step.step, desc: step.desc })),
    callout: item.callout || null,
  })),
}));
const DOC_INDEX = docs.flatMap((section) => section.items.map((item) => `${item.id} (${item.title})`)).join("; ");

function findArticle(docId) {
  for (const section of docs) {
    const item = section.items.find((entry) => entry.id === docId);
    if (item) return { section: section.section, item };
  }
  return null;
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

function stripBrackets(text) {
  return String(text || "").replace(/\[\[([^\]]+)\]\]/g, "$1");
}

/* ---------- model ---------- */

// config_id -> time (ms) when that model may be tried again after running out of quota.
const cooldowns = new Map();

/** Every active School Assistant model, lowest order number first. */
async function activeConfigs() {
  const list = await AIConfig.find({ use: USE_SCHOOL_ASSISTANT, is_active: true }).lean();
  return list.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || new Date(a.created_at) - new Date(b.created_at));
}

/** How long Groq says to wait ("try again in 8m49.2s"); a sensible guess otherwise. */
function waitMs(message) {
  const found = /try again in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?/i.exec(String(message || ""));
  if (found && (found[1] || found[2] || found[3])) {
    return (((+found[1] || 0) * 3600) + ((+found[2] || 0) * 60) + (+found[3] || 0)) * 1000;
  }
  return /per[ -]day|TPD|daily/i.test(String(message || "")) ? 15 * 60000 : 60000;
}

/**
 * One chat completion that moves to the next configured model when the current one
 * is out of quota (or its key or model is no longer valid).
 */
async function callModel(pool, params) {
  const now = Date.now();
  const ready = pool.filter((config) => (cooldowns.get(config.config_id) || 0) <= now);
  if (!ready.length) {
    const soonest = Math.min(...pool.map((config) => cooldowns.get(config.config_id) || 0));
    const error = new Error("Every assistant model is out of quota right now.");
    error.status = 429;
    error.retryAfterMs = Math.max(0, soonest - now);
    throw error;
  }
  let lastError;
  for (const config of ready) {
    try {
      const viaOpenRouter = /^sk-or-/i.test(String(config.api_key || "").trim());
      const completion = viaOpenRouter
        ? await openRouterChat({
          apiKey: config.api_key.trim(),
          model: config.model,
          maxTokens: params.maxTokens,
          temperature: params.temperature,
          messages: params.messages,
          responseFormat: params.responseFormat,
        })
        : await groqChat({
          ...params,
          apiKey: config.api_key,
          model: config.model,
          maxRetries: pool.length > 1 ? 0 : undefined,
        });
      if (config !== pool[0]) logAssistant("model", { using: config.model, via: viaOpenRouter ? "openrouter" : "groq" });
      if (completion && typeof completion === "object") completion.config_id = config.config_id;
      return completion;
    } catch (error) {
      lastError = error;
      const message = String(error.message || "");
      const noCredit = error.status === 402;
      const outOfQuota = noCredit || error.status === 429 || /rate limit|quota|too many requests|free-models-per-day/i.test(message);
      // A model that cannot do this job at all (bad key, wrong model name, a classifier, a tiny
      // context) is skipped. A reply that is merely badly formatted JSON is not the model's fault here.
      const badOutput = Boolean(error.failedGeneration) || /failed to validate json|parsing failed/i.test(message);
      const unusable = !badOutput && (
        [400, 401, 403, 404, 422].includes(error.status)
        || /invalid api key|model .*(not found|does not exist|decommissioned)|text classification|max_tokens|context length/i.test(message)
      );
      if (!outOfQuota && !unusable) throw error;
      const wait = outOfQuota ? (error.retryAfterMs || (noCredit ? 30 * 60000 : waitMs(message))) : 5 * 60000;
      cooldowns.set(config.config_id, Date.now() + wait);
      logAssistant(outOfQuota ? "model-out-of-quota" : "model-unusable", { model: config.model, retry_in_s: Math.round(wait / 1000) });
      if (!error.retryAfterMs) error.retryAfterMs = wait;
    }
  }
  const error = new Error(lastError?.message || "Every assistant model is out of quota right now.");
  error.status = 429;
  error.retryAfterMs = lastError?.retryAfterMs;
  throw error;
}

function modelText(message) {
  const content = getMessageText(message);
  if (content) return content;
  if (typeof message?.reasoning === "string" && message.reasoning.trim()) return message.reasoning.trim();
  if (Array.isArray(message?.reasoning_details)) {
    return message.reasoning_details.map((part) => part?.text || part?.content || "").join("\n").trim();
  }
  return "";
}

async function completeJson(pool, messages, maxTokens) {
  let thread = messages;
  let spoken = "";
  const ATTEMPTS = 3;
  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    let completion;
    try {
      completion = await callModel(pool, {
        maxTokens,
        temperature: 0.1,
        messages: thread,
        reasoningEffort: "low",
        // Strict JSON mode rejects slightly malformed output; later attempts drop it.
        responseFormat: attempt === 0 ? { type: "json_object" } : undefined,
      });
    } catch (error) {
      if (error.status === 429 || error.status === 401) throw error;
      const rescued = extractJsonFromText(error.failedGeneration || "");
      if (rescued && typeof rescued === "object" && !Array.isArray(rescued)) return rescued;
      console.warn(`[AI-ASSISTANT] model call failed (attempt ${attempt + 1}): ${error.message}`);
      if (attempt === ATTEMPTS - 1) throw error;
      continue;
    }
    const message = completion?.choices?.[0]?.message;
    const text = modelText(message);
    spoken = getMessageText(message) || spoken;
    const parsed = extractJsonFromText(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    const finish = completion?.choices?.[0]?.finish_reason || "none";
    console.warn(`[AI-ASSISTANT] unusable reply, finish=${finish}, chars=${text.length}`);
    // A model that answers in plain text, with no JSON at all, is not following the format
    // (for example a safety classifier). Skip it for a while when another model can take over.
    if (pool.length > 1 && finish === "stop" && !text.includes("{") && completion?.config_id) {
      cooldowns.set(completion.config_id, Date.now() + 10 * 60000);
      logAssistant("model-benched", { reason: "reply was not JSON", minutes: 10 });
    }
    thread = [
      ...messages,
      { role: "assistant", content: String(text || "").slice(0, 600) },
      { role: "user", content: "Reply again with one JSON object only, with an \"action\"." },
    ];
  }
  // Plain words from the model can stand in as the answer, unless they are clearly not one
  // (too short, or the verdict line of a safety classifier).
  // Never show a half-written action or tool-call text as if it were the answer.
  const words = spoken.trim();
  const looksLikeAction = /^[\[{`]|"action"\s*:|<\|[a-z_]+\|>|\bquery\(|\bfrom\s*=/i.test(words);
  if (words.length > 20 && !looksLikeAction && !/^(user|response) safety|^(un)?safe\b/i.test(words)) {
    return { action: "answer", answer: words.slice(0, 900), spoken: true };
  }
  throw new Error("The model did not return a usable reply.");
}

function normalizeAction(raw) {
  if (!raw || typeof raw !== "object") return null;
  let action = String(raw.action || raw.kind || "").trim().toLowerCase();
  if (!action) {
    if (raw.from) action = "query";
    else if (raw.question && !raw.answer) action = "ask";
    else if (raw.answer) action = "answer";
  }
  const aliases = { final: "answer", chat: "answer", reply: "answer", clarify: "ask", question: "ask", search: "find", lookup: "find", schema: "describe", periods: "period", doc: "docs", help: "docs" };
  action = aliases[action] || action;
  if (!action) return null;
  return { ...raw, action };
}

/* ---------- prompt ---------- */

function dateLine(label, item) {
  if (!item) return `${label}: none right now.`;
  const name = item.session_name || item.term_name;
  const id = item.session_id || item.term_id;
  return `${label}: ${name} (id ${id}), ${item.start} to ${item.end}, ${item.days_total ?? "?"} days long, ${item.days_left ?? "?"} days left.`;
}

function buildSystemPrompt(box, collections) {
  const { session, term } = box.periods;
  return [
    "You are the assistant inside a school admin dashboard. You help the admin of ONE school. You can read this school's records and explain how to use the app. You cannot change records or send anything.",
    "Reply with exactly ONE JSON object per turn and nothing else. It must have an \"action\".",
    "",
    "ACTIONS (one per turn, or several in order as {\"actions\":[{...},{...}]} to save time)",
    "- {\"action\":\"find\",\"from\":\"Class\",\"text\":\"jss 1\"} finds a student, class, subject, staff, session or term by name and returns ids. JSS 1 and Junior Secondary School 1 are the same class.",
    "- {\"action\":\"query\",...} reads records (see QUERY).",
    "- {\"action\":\"describe\",\"collections\":[\"UserBill\"]} lists all fields of collections. {\"action\":\"period\"} lists every session and term with ids and dates. {\"action\":\"docs\",\"text\":\"how to promote students\"} returns the matching how-to help article.",
    "- {\"action\":\"ask\",\"question\":\"...\"} asks the admin one short question, only when the request has two real meanings the data cannot settle.",
    "- {\"action\":\"answer\",\"answer\":\"...\",\"table\":null,\"steps\":null} is your final reply (see ANSWER).",
    "Every find and query result gets a ref in the order it runs in THIS request: r1, r2, r3... so you can chain them inside one batch. Refs start again at r1 for every new message: never use a ref from an earlier message, run the step again instead.",
    "Class names: SS 2, SSS 2 and Senior Secondary School 2 are the same class; JSS 2 is the junior one. Do not ask which when the admin wrote SS or SSS.",
    "",
    "QUERY",
    "{\"action\":\"query\",\"from\":\"UserBill\",\"where\":[{\"field\":\"user_id\",\"op\":\"in\",\"fromResult\":\"r2\",\"resultField\":\"student_id\"}],\"groupBy\":[\"user_id\"],\"metrics\":[{\"name\":\"due\",\"op\":\"sum\",\"field\":\"amount_due\"},{\"name\":\"paid\",\"op\":\"sum\",\"field\":\"amount_paid\"}],\"compute\":[{\"name\":\"balance\",\"op\":\"subtract\",\"left\":\"due\",\"right\":\"paid\"}],\"having\":[{\"field\":\"balance\",\"op\":\"gt\",\"value\":0}],\"join\":[{\"from\":\"Student\",\"localField\":\"user_id\",\"foreignField\":\"student_id\",\"pick\":[\"full_name\"]}],\"sort\":{\"by\":\"balance\",\"dir\":\"desc\"},\"limit\":10,\"scope\":\"term\"}",
    "- unwind: add \"unwind\":\"payments\" to expand a list stored inside each record into one row per item (see the collection's hint).",
    "- where ops: eq ne gt gte lt lte contains in notIn empty notEmpty. fromResult+resultField takes a column of an earlier result. notIn with fromResult finds what is missing.",
    "- metrics ops: count sum avg min max distinct (a metric may have its own where). groupBy alone gives a count. Metrics without groupBy give one overall row. compute ops: subtract add multiply divide percent. having filters grouped rows. select picks fields when not grouping. join adds fields from another collection.",
    "- scope: term (default) adds the current session_id and subsession_id when the collection has them; session adds only session_id; all adds nothing. For another term, find its id with period and put subsession_id in where.",
    "",
    "ANSWER",
    "{\"action\":\"answer\",\"answer\":\"one to three short sentences\",\"table\":{\"result\":\"r4\",\"title\":\"Short title\",\"columns\":[{\"key\":\"full_name\",\"label\":\"Student\"},{\"key\":\"balance\",\"label\":\"Balance\"}],\"rank\":false},\"steps\":null}",
    "- table: for a list or ranking of several rows; result is an earlier ref; columns are keys of it (names and amounts, never ids); rank true adds a Rank column; null for a single fact. For one person's record (several details) also pass a table with the detail columns, and write the details in your answer text (Name, Gender, Date of birth...): the app shows your text and offers a PDF of the record.",
    `- steps: only for how-to answers, 2 to 6 items [{"title":"...","text":"..."}]. Wrap dashboard page names in [[double brackets]] using only these: ${PAGE_NAMES}.`,
    "",
    "RULES",
    "1. Never guess a number, name, date or id. State only what a tool result or CONTEXT shows; otherwise look it up or say you do not know.",
    "2. Find a named class, student, staff member or subject with find before filtering by it. If several match, ask which.",
    "3. A short follow-up continues the previous request; [data used: ...] shows what the last turn queried. If the admin names a different class, term or student, repeat the same request for the new one. A correction (\"or no, I mean the names, ages and gender\") keeps the same class, term and filter and changes only what is shown: list every person that matches, never just one.",
    "4. Defaults: current session and term, all classes and students. Do not ask about what you can assume; state the assumption.",
    "5. Do the reasoning with the tools (group, count, sum, sort), batching dependent steps, then name the result from the data. At most 6 turns.",
    "6. An empty result does not prove nothing exists: say what you checked, and check another collection if one could hold the answer.",
    "7. You cannot send emails, SMS or notifications or change records; say so in one sentence and point to the page, e.g. [[Notifications]].",
    "8. Plain words for a school admin: no ids, field names or JSON. Thousands separators for money, no currency unless the data has one.",
    "9. Be short. Do not repeat the table in the text; say what stands out. Do not mention PDFs; the app offers that itself.",
    "10. Greetings, thanks and small talk (hi, thanks, ok): answer in one friendly sentence with action answer and no tools. Do not repeat or continue the previous request unless the admin asks.",
    "",
    "CONTEXT",
    `Today: ${calendarDate()}.`,
    dateLine("Current session", session),
    dateLine("Current term (also called a subsession; other collections store its id as subsession_id)", term),
    "",
    "COLLECTIONS FOR THIS REQUEST (describe lists every field of any collection; an error lists all collection names)",
    (() => {
      if (collections === null) return keySheet();
      const sheet = sheetFor(collections);
      if (sheet) return sheet;
      return collections.length ? keySheet() : "(none: this is a how-to question, use docs)";
    })(),
  ].join("\n");
}

/* ---------- step 1: decide what data is needed (small prompt) ---------- */

/**
 * Free, Basic and no active subscription: no record look-ups, only how-to help.
 * No school data (not even the dates of the session) goes into this prompt.
 */
function buildHelpPrompt() {
  return [
    "You are the assistant inside a school admin dashboard. On this plan you can only explain how to use the app. You cannot read or look up any of the school's records.",
    "Reply with exactly ONE JSON object per turn and nothing else. It must have an \"action\".",
    "",
    "ACTIONS",
    "- {\"action\":\"docs\",\"text\":\"how to promote students\"} returns the matching how-to help article. Use it for every how-to question.",
    "- {\"action\":\"answer\",\"answer\":\"one to three short sentences\",\"steps\":null} is your final reply. For how-to answers, steps is 2 to 6 items [{\"title\":\"...\",\"text\":\"...\"}]; copy them from the article.",
    `  Wrap dashboard page names in [[double brackets]] using only these: ${PAGE_NAMES}.`,
    "- {\"action\":\"upgrade\"} when the request needs any of this school's records: students, staff, classes, fees, payments, scores, attendance, results, counts, lists, dates of sessions or terms, or anything to look up or total up.",
    "",
    "RULES",
    "1. Never state any fact about this school. Only explain how the app works, from the help article.",
    "2. Greetings, thanks and small talk: answer in one friendly sentence with action answer.",
    "3. Plain words for a school admin. Be short.",
  ].join("\n");
}

function routePrompt(box, restricted = false) {
  return [
    "You route requests for the assistant of a school admin dashboard. Reply with ONE JSON object only.",
    `Today: ${calendarDate()}.`,
    restricted
      ? "On this plan the assistant can only explain how to use the dashboard. It cannot read the school's records."
      : "The assistant can read this school's records and explain how to use the dashboard. It cannot change anything.",
    "- {\"kind\":\"chat\",\"answer\":\"...\"} for a greeting, thanks, small talk, or a question about what the assistant can do. One friendly sentence.",
    "- {\"kind\":\"data\",\"collections\":[\"StudentScore\",\"Class\"]} for anything about this school's records, or a how-to question. List the 1 to 4 collections the request needs (use [] for a how-to question). A short follow-up continues the previous request, so reuse what it used.",
    "Fee bills (how many, active or inactive, amounts) are in Bill. What each student owes or paid, and when, is in UserBill (and Bill). The Payment collection is only the school's subscription to the platform, never student fees.",
    `Collections: ${collectionIndex()}`,
  ].join("\n");
}

const ASKS_FOR_WORK = /\b(list|show|give|get|find|display|how many|count|total|who|which|students?|pupils?|teachers?|staff|fees?|paid|unpaid|owe|owing|balance|scores?|results?|attendance|class(es)?|jss|sss?)\b/i;
const ABOUT_ASSISTANT = /\b(what can you|what do you do|who are you|can you help|how can you help)\b/i;

async function planRequest(pool, question, history, box, restricted = false) {
  const lines = history.slice(-4).map((item) => {
    const who = item.role === "assistant" ? "Assistant" : "Admin";
    const used = item.used && item.used.length ? ` (looked at: ${item.used.join(", ")})` : "";
    return `${who}: ${item.brief.slice(0, 250)}${used}`;
  });
  const content = `${lines.length ? `Conversation so far:\n${lines.join("\n")}\n\n` : ""}New message from the admin: ${question}`;
  try {
    const raw = await completeJson(pool, [
      { role: "system", content: routePrompt(box, restricted) },
      { role: "user", content },
    ], 700);
    // Small talk is only believed when the message does not ask for anything to be looked up.
    const asksForWork = ASKS_FOR_WORK.test(question) && !ABOUT_ASSISTANT.test(question);
    if (raw && String(raw.kind || "").toLowerCase() === "chat" && String(raw.answer || "").trim() && !asksForWork) {
      return { kind: "chat", answer: String(raw.answer).trim().slice(0, 400) };
    }
    if (raw && String(raw.kind || "").toLowerCase() === "chat" && asksForWork) {
      logAssistant("route-overruled", "chat reply to a request for records");
      return { kind: "data", collections: null };
    }
    if (raw && Array.isArray(raw.collections)) {
      return { kind: "data", collections: raw.collections.map(String).slice(0, 5) };
    }
    // Loose plain text here is not a real decision: carry on and look at the data.
    if (raw && String(raw.action || "") === "answer" && String(raw.answer || "").trim() && !raw.spoken && !asksForWork) {
      return { kind: "chat", answer: String(raw.answer).trim().slice(0, 400) };
    }
  } catch (error) {
    if (error.status === 429) throw error;
    logAssistant("route-failed", error.message);
  }
  return { kind: "data", collections: null };
}

/* ---------- history and memory ---------- */

function memoCollections(memo) {
  const names = [];
  (Array.isArray(memo) ? memo : []).forEach((item) => {
    const found = /"from":"([A-Za-z]+)"/.exec(String(item?.args || ""));
    if (found && !names.includes(found[1])) names.push(found[1]);
  });
  return names;
}

/**
 * Last few turns, kept short. `content` is what the query step sees (the latest turn that
 * looked at data also carries a short note of what it queried); `brief` and `used` feed step 1.
 */
function cleanHistory(raw) {
  const list = (Array.isArray(raw) ? raw : []).slice(-8).map((item) => {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : "";
    const text = String(item?.text || "").trim().slice(0, role === "assistant" ? 700 : 400);
    if (!role || !text) return null;
    const memo = role === "assistant" && Array.isArray(item?.memo) && item.memo.length ? item.memo : null;
    return { role, content: text, brief: text, memo, used: memo ? memoCollections(memo) : [] };
  }).filter(Boolean);
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (!list[i].memo) continue;
    try {
      list[i].content = `${list[i].content}\n[data used: ${JSON.stringify(list[i].memo).slice(0, 1200)}]`;
    } catch (err) {
      /* ignore a memo that cannot be read */
    }
    break;
  }
  return list;
}

function sampleRows(rows) {
  return rows.slice(0, 3).map((row) => {
    const next = {};
    Object.keys(row).slice(0, 6).forEach((key) => { next[key] = present(row[key]); });
    return next;
  });
}

function buildMemo(trace) {
  const items = trace.slice(-4).map((item) => ({
    tool: item.tool,
    args: item.args,
    ref: item.ref,
    total: item.total,
    sample: item.sample,
  }));
  while (items.length > 1 && JSON.stringify(items).length > 2400) items.shift();
  return items;
}

function briefArgs(action) {
  const { action: name, ...rest } = action;
  const text = JSON.stringify(rest);
  return text.length > 450 ? text.slice(0, 450) : text;
}

/* ---------- answers ---------- */

function humanize(key) {
  return String(key).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildTable(spec, box) {
  if (!spec || typeof spec !== "object") return null;
  let result = box.results.get(String(spec.result || spec.ref || spec.from || ""));
  if (!result) {
    const refs = [...box.results.values()].filter((item) => item.rows.length > 0);
    result = refs[refs.length - 1];
  }
  if (!result || !result.rows.length) return null;
  const available = new Set(result.columns);
  let columns = (Array.isArray(spec.columns) ? spec.columns : [])
    .map((col) => (typeof col === "string" ? { key: col, label: humanize(col) } : { key: String(col?.key || ""), label: String(col?.label || humanize(col?.key || "")) }))
    .filter((col) => col.key && available.has(col.key))
    .slice(0, 8);
  if (!columns.length) {
    columns = result.columns
      .filter((key) => !/_id$/.test(key) && key !== "stream")
      .slice(0, 6)
      .map((key) => ({ key, label: humanize(key) }));
  }
  if (!columns.length) return null;
  const withRank = spec.rank === true;
  const rows = result.rows.slice(0, REPORT_ROWS).map((row, index) => {
    const next = {};
    if (withRank) next.rank = index + 1;
    columns.forEach((col) => { next[col.key] = present(row[col.key]); });
    return next;
  });
  const finalColumns = withRank ? [{ key: "rank", label: "Rank" }, ...columns] : columns;
  if (rows.length === 1 && !withRank && finalColumns.length > 2) {
    // One record (a single student, say): shown as text in the chat, and as Detail / Value lines in the PDF.
    return {
      title: String(spec.title || "").trim().slice(0, 80) || "Record",
      columns: [{ key: "detail", label: "Detail" }, { key: "value", label: "Value" }],
      rows: finalColumns.map((col) => ({ detail: col.label, value: rows[0][col.key] })),
      total: 1,
      record: true,
    };
  }
  return {
    title: String(spec.title || "").trim().slice(0, 80) || "Result",
    columns: finalColumns,
    rows,
    total: result.total,
  };
}

function finishAnswer(action, box, trace, question) {
  const memo = buildMemo(trace);
  const text = String(action.answer || "").replace(/\s+\n/g, "\n").trim().slice(0, 1200);

  // A help article was read: show its own steps in full and in order, not a retelling.
  const article = box.article;
  if (article && Array.isArray(article.steps) && article.steps.length >= 2 && !action.table) {
    const articleItems = article.steps
      .map((item) => {
        const body = String(item.desc || "").trim();
        const title = String(item.step || "").trim();
        return body || title ? { title, text: body || title, parts: linkParts(body || title) } : null;
      })
      .filter(Boolean);
    if (article.callout) {
      const note = String(article.callout).trim();
      articleItems.push({ title: "Good to know", text: note, parts: linkParts(note) });
    }
    return {
      success: true,
      kind: "docs",
      title: String(article.title || "").slice(0, 80),
      intro: "Follow these steps in order, in detail:",
      items: articleItems,
      memo,
    };
  }

  const steps = Array.isArray(action.steps) ? action.steps : [];
  const items = steps.slice(0, 8).map((item) => {
    const title = typeof item?.title === "string" ? item.title.trim().slice(0, 80) : "";
    const body = typeof item?.text === "string" ? item.text.trim().slice(0, 400) : "";
    return body ? { title, text: body, parts: linkParts(body) } : null;
  }).filter(Boolean);
  if (items.length) {
    const title = String(action.title || "").trim().slice(0, 80);
    return { success: true, kind: "docs", title, items, memo };
  }

  const table = buildTable(action.table, box);
  if (table) {
    const offer = table.rows.length > 0;
    let message = stripBrackets(text) || table.title;
    if (table.record) {
      // The details are written out in the chat; add any the model left out.
      const lowered = message.toLowerCase();
      const missing = table.rows.filter((row) => row.value !== "—" && !lowered.includes(String(row.value).toLowerCase()));
      if (missing.length) {
        message = `${message.replace(/[.\s]+$/, "")}.\n${missing.map((row) => `${row.detail}: ${row.value}`).join("\n")}`;
      }
    }
    const spoken = offer && !/\bpdf\b/i.test(message) ? `${message.replace(/[.?\s]+$/, "")}.\nShould I give you the PDF?` : message;
    const payload = {
      success: true,
      kind: "query",
      title: table.title,
      message: spoken,
      columns: table.record ? [] : table.columns,
      rows: table.record ? [] : table.rows.slice(0, CHAT_ROWS),
      total: table.total,
      truncated: table.record ? false : table.rows.length > CHAT_ROWS,
      memo,
    };
    if (offer) {
      payload.offerPdf = true;
      payload.report = {
        title: table.title,
        question: String(question || "").slice(0, 200),
        summary: stripBrackets(text).slice(0, 240),
        columns: table.columns,
        rows: table.rows,
      };
    }
    return payload;
  }

  const message = text || "I could not work that out. Try asking it another way.";
  return { success: true, kind: "chat", message, parts: linkParts(message), memo };
}

/* ---------- pdf ---------- */

const PDF_REPLY = /^(yes|yeah|yep|yup|y|ok|okay|sure|please|pls|send( it)?|give( it| me)?( the)?( pdf)?|the pdf|pdf|download( it)?|go ahead)([\s,.!?]+(please|pls|yes))?[\s.!?]*$/i;

function isPdfRequest(question) {
  const q = String(question || "").trim();
  return PDF_REPLY.test(q) || (/\bpdf\b/i.test(q) && q.split(/\s+/).length <= 8);
}

function pdfFileName(title) {
  const slug = String(title || "records").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${slug || "records"}.pdf`;
}

async function deliverPdf(schoolId, report) {
  const columns = (Array.isArray(report?.columns) ? report.columns : [])
    .map((col) => ({ key: String(col?.key || ""), label: String(col?.label || col?.key || "") }))
    .filter((col) => col.key)
    .slice(0, 8);
  const rows = (Array.isArray(report?.rows) ? report.rows : []).slice(0, REPORT_ROWS).map((row) => {
    const next = {};
    columns.forEach((col) => { next[col.key] = present(row?.[col.key]); });
    return next;
  });
  if (!columns.length || !rows.length) {
    return { success: true, kind: "chat", message: "There is nothing to put in a PDF." };
  }
  const title = String(report.title || "Records").slice(0, 80);
  const school = await mongoose.model("School").findOne({ school_id: String(schoolId) }).select("school_name").lean();
  const buffer = buildRecordPdf({
    schoolName: school?.school_name || "School",
    title,
    question: String(report.question || ""),
    summary: String(report.summary || `${rows.length} record${rows.length === 1 ? "" : "s"}.`),
    columns,
    rows,
    note: "",
  });
  return {
    success: true,
    kind: "query",
    title,
    message: `Here is the PDF for "${title}" (${rows.length} row${rows.length === 1 ? "" : "s"}).`,
    pdf: { filename: pdfFileName(title), base64: buffer.toString("base64") },
  };
}

/* ---------- the loop ---------- */

function searchArticles(text) {
  const words = String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  if (!words.length) return [];
  const scored = [];
  docs.forEach((section) => section.items.forEach((item) => {
    const title = String(item.title || "").toLowerCase();
    const body = JSON.stringify([item.content, item.steps, item.callout]).toLowerCase();
    const score = words.reduce((sum, word) => sum + (title.includes(word) ? 3 : 0) + (body.includes(word) ? 1 : 0), 0);
    if (score > 0) scored.push({ id: item.id, title: item.title, score });
  }));
  return scored.sort((a, b) => b.score - a.score).slice(0, 4);
}

function docsTool(action) {
  const wanted = String(action.docId || action.id || "");
  if (!wanted && action.text) {
    const matches = searchArticles(action.text);
    if (!matches.length) throw new ToolError("No help article matches that.", "Try other words.");
    if (matches.length > 1 && matches[0].score === matches[1].score) {
      return { matches: matches.map(({ id, title }) => ({ id, title })), note: "Pick one and call docs again with its docId." };
    }
    action = { ...action, docId: matches[0].id };
  }
  const found = findArticle(String(action.docId || action.id || ""));
  if (!found) throw new ToolError("That help article does not exist.", `Article ids: ${DOC_INDEX}`);
  return {
    id: found.item.id,
    section: found.section,
    title: found.item.title,
    content: found.item.content,
    // Just the title and text of each step: the full blocks repeat the same words.
    steps: (found.item.steps || []).map((item) => ({ step: item.step, desc: item.desc })),
    callout: found.item.callout,
  };
}

function toolMessage(name, result, limit = MAX_TOOL_CHARS) {
  let text = JSON.stringify(result);
  if (text.length > limit) text = `${text.slice(0, limit)}...`;
  return `TOOL RESULT (${name}): ${text}`;
}

async function runTool(box, action, trace) {
  try {
    const result = action.action === "docs" ? docsTool(action) : await box.run(action);
    // Remember the help article that was read, so the answer can show its steps as written.
    if (action.action === "docs" && result.id) box.article = result;
    if (action.action === "query" || action.action === "find") {
      const stored = box.results.get(result.ref);
      trace.push({
        tool: action.action,
        args: briefArgs(action),
        ref: result.ref,
        total: result.total ?? result.matches,
        sample: stored ? sampleRows(stored.rows) : [],
      });
    }
    logAssistant("result", { action: action.action, ref: result.ref, total: result.total ?? result.matches ?? null, note: result.note || null });
    return { result, failed: false };
  } catch (err) {
    if (!(err instanceof ToolError)) throw err;
    logAssistant("tool-error", err.message);
    return { result: { error: err.message, hint: err.hint || undefined }, failed: true };
  }
}

function upgradeReply(access) {
  const message = access.message;
  logAssistant("plan-blocked", { plan: access.plan_name || "none" });
  return { success: true, kind: "chat", upgrade: true, message, parts: linkParts(message), memo: [] };
}

const DATA_ACTIONS = ["find", "query", "describe", "period"];

/** A sub-admin asked for data their permissions do not cover. */
function deniedReply(error) {
  logAssistant("permission-denied", { sections: error.sections });
  return { success: true, kind: "chat", denied: true, message: error.message, parts: linkParts(error.message), memo: [] };
}

async function converse(pool, question, history, schoolId, permissions) {
  try {
    return await runConversation(pool, question, history, schoolId, permissions);
  } catch (error) {
    if (error instanceof AccessDenied) return deniedReply(error);
    throw error;
  }
}

async function runConversation(pool, question, history, schoolId, permissions) {
  // Free, Basic or no active subscription: general answers and how-to help only.
  const access = await checkAssistantDataAccess(schoolId);
  const restricted = !access.allowed;
  const box = await createToolbox(schoolId, permissions);

  // Step 1 (small prompt): is this small talk, or which data does it need?
  const plan = await planRequest(pool, question, history, box, restricted);
  logAssistant("plan", plan.kind === "chat" ? { kind: "chat" } : { kind: "data", collections: plan.collections });
  if (plan.kind === "chat") {
    return { success: true, kind: "chat", message: plan.answer, parts: linkParts(plan.answer), memo: [] };
  }
  // Records were asked for: stop here, no data call is made.
  if (restricted && Array.isArray(plan.collections) && plan.collections.length) return upgradeReply(access);

  // Step 2+: only the chosen collections go into the prompt.
  const messages = [
    { role: "system", content: restricted ? buildHelpPrompt() : buildSystemPrompt(box, plan.collections) },
    ...history.map(({ role, content }) => ({ role, content })),
    { role: "user", content: question },
  ];
  const trace = [];
  const repeats = new Map();
  logAssistant("prompt", { chars: messages[0].content.length });

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const raw = await completeJson(pool, messages, 1800);
    const batch = Array.isArray(raw?.actions)
      ? raw.actions.map(normalizeAction).filter((item) => item && !["answer", "ask"].includes(item.action)).slice(0, 5)
      : [];
    // Hard stop on a restricted plan: whatever the model says, no record is ever read.
    if (restricted && batch.some((item) => item.action === "upgrade" || DATA_ACTIONS.includes(item.action))) {
      return upgradeReply(access);
    }
    if (batch.length) {
      logAssistant("step", { n: step + 1, batch: batch.map((item) => item.action).join(",") });
      messages.push({ role: "assistant", content: JSON.stringify({ actions: batch }).slice(0, 2500) });
      const outputs = [];
      for (const item of batch) {
        const { result, failed } = await runTool(box, item, trace);
        outputs.push(toolMessage(item.action, result, Math.floor(MAX_TOOL_CHARS / batch.length)));
        if (failed) break;
      }
      messages.push({ role: "user", content: outputs.join("\n") });
      continue;
    }
    const action = normalizeAction(raw);
    if (!action) {
      logAssistant("step", { n: step + 1, problem: "no action" });
      messages.push({ role: "assistant", content: JSON.stringify(raw).slice(0, 600) });
      messages.push({ role: "user", content: "That was not a valid action. Reply with one JSON object that has an \"action\"." });
      continue;
    }
    logAssistant("step", { n: step + 1, action: action.action, args: briefArgs(action).slice(0, 220) });
    if (restricted && (action.action === "upgrade" || DATA_ACTIONS.includes(action.action))) return upgradeReply(access);

    if (action.action === "answer") {
      const payload = finishAnswer(action, box, trace, question);
      logAssistant("answer", { kind: payload.kind, rows: payload.rows ? payload.rows.length : 0, text: String(payload.message || payload.title || "").slice(0, 160) });
      return payload;
    }
    if (action.action === "ask") {
      const message = String(action.question || action.answer || "").trim().slice(0, 400);
      if (message) {
        logAssistant("ask-user", message);
        return { success: true, kind: "chat", message, parts: linkParts(message), memo: buildMemo(trace) };
      }
    }

    const signature = JSON.stringify(action);
    const times = (repeats.get(signature) || 0) + 1;
    repeats.set(signature, times);
    messages.push({ role: "assistant", content: signature.slice(0, 1500) });
    if (times > 1) {
      messages.push({ role: "user", content: "You already ran exactly this. Use the earlier result, change the request, or give the final answer." });
      if (times > 2) break;
      continue;
    }

    const { result } = await runTool(box, action, trace);
    messages.push({ role: "user", content: toolMessage(action.action, result) });
  }

  messages.push({
    role: "user",
    content: "Stop using tools. Give the final answer now as {\"action\":\"answer\",...} using only the results above. If you could not get the data, say exactly what you checked.",
  });
  const last = normalizeAction(await completeJson(pool, messages, 1200));
  if (last && last.action === "answer") return finishAnswer(last, box, trace, question);
  const message = "I could not finish working that out. Please try asking it a little differently.";
  return { success: true, kind: "chat", message, parts: linkParts(message), memo: buildMemo(trace) };
}

/* ---------- route ---------- */

exports.ask = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const question = String(req.body?.question || "").trim();
    if (!question) return res.status(400).json({ success: false, message: "Type a question first." });
    if (question.length > 400) return res.status(400).json({ success: false, message: "Keep the question under 400 characters." });

    // Who is asking: only admins of this school, and a sub-admin only reads what their
    // permissions allow.
    const who = await resolveAccess(req, schoolId);
    if (who.error) return res.status(who.error.status).json({ success: false, message: who.error.message });

    const pool = await activeConfigs();
    if (!pool.length) return res.status(400).json({ success: false, message: "No active School Assistant model. In AI Config, set Use to School Assistant and turn it on." });

    const report = req.body?.report;
    if (isPdfRequest(question) && Array.isArray(report?.rows) && report.rows.length) {
      logAssistant("ask", { schoolId, mode: "pdf", question });
      return res.json(await deliverPdf(schoolId, report));
    }

    const history = cleanHistory(req.body?.history);
    logAssistant("ask", { schoolId, question, history: history.length });
    return res.json(await converse(pool, question, history, schoolId, who.access));
  } catch (error) {
    logAssistant("error", error.message);
    const busy = error.status === 429 || /rate limit|too many requests/i.test(error.message || "");
    const minutes = error.retryAfterMs ? Math.max(1, Math.ceil(error.retryAfterMs / 60000)) : 0;
    const busyText = minutes
      ? `The assistant's AI models are out of quota right now. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}, or ask an admin to add another model.`
      : "The assistant is busy right now. Please try again in a moment.";
    return res.status(200).json({
      success: true,
      kind: "chat",
      message: busy ? busyText : "Please try again.",
    });
  }
};
