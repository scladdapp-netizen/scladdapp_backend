/**
 * Server-side report card HTML hydration for emails.
 * Mirrors frontend exportReportHtml / ReportCardPreview placeholder map.
 */
const ReportCardTheme = require("../models/ReportCardTheme.model");

const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildWatermarkContent = (school = {}) => {
  const schoolLogo = school?.logo_url || "";
  const schoolName = school?.school_name || "";
  if (schoolLogo) {
    return `<img data-hle-id="rc-watermark-img" src="${esc(schoolLogo)}" alt="" style="width:260px;height:260px;object-fit:contain;opacity:0.07;user-select:none"/>`;
  }
  const letter = schoolName ? schoolName.charAt(0).toUpperCase() : "S";
  return `<span data-hle-id="rc-watermark-fallback" style="font-size:200px;font-weight:900;color:#111111;opacity:0.04;line-height:1;user-select:none">${esc(letter)}</span>`;
};

/** Same full report-card layout as frontend generateDefaultReportHtml. */
const generateDefaultReportHtml = ({
  grading_fields = [],
  grading_scheme = [],
  behavioral_traits = [],
  school = {},
}) => {
  const schoolName = school?.school_name || "";
  const schoolAddress = school?.address || "";
  const schoolPhone = school?.phone_number || "";
  const schoolEmail = school?.email || "";
  const schoolLogo = school?.logo_url || "";

  const logoHtml = schoolLogo
    ? `<img src="${esc(schoolLogo)}" alt="logo" style="width:40px;height:40px;object-fit:contain;border-radius:50%"/>`
    : schoolName
      ? `<span>${esc(schoolName.charAt(0).toUpperCase())}</span>`
      : `<span>S</span>`;

  const scoreCols = grading_fields
    .map(
      (f) =>
        `<th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:center;white-space:nowrap">${esc(String(f.field_name).toUpperCase())}<span style="font-weight:400;opacity:.7;font-size:8px">/${esc(f.max_score)}</span></th>`
    )
    .join("");

  const tfootCols = grading_fields
    .map(() => `<td style="padding:6px 8px;font-weight:700;font-size:10px;text-align:center"></td>`)
    .join("");

  const traitRows = behavioral_traits
    .map(
      (t, i) => `<tr style="background:${i % 2 === 0 ? "rgba(249,250,251,0.7)" : "rgba(255,255,255,0.5)"}">
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:left;font-size:10px">${esc(t)}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:10px;font-weight:600">{{trait_${String(t).replace(/[^a-zA-Z0-9]/g, "_")}}}</td>
    </tr>`
    )
    .join("");

  const schemeRows = grading_scheme
    .map(
      (s, i) => `<tr style="background:${i % 2 === 0 ? "rgba(249,250,251,0.7)" : "rgba(255,255,255,0.5)"}">
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:10px;font-weight:700">${esc(s.grade_letter || "—")}</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:10px">${esc(s.min_range)}–${esc(s.max_range)}%</td>
      <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:10px">${esc(s.pass_fail ?? "—")}</td>
    </tr>`
    )
    .join("");

  const hasSide = behavioral_traits.length > 0 || grading_scheme.length > 0;
  const contact = [schoolPhone, schoolEmail].filter(Boolean).map(esc).join(" · ");

  return `
<div style="position:relative;background:#ffffff;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;font-size:11px;color:#111111;font-family:Arial,Helvetica,sans-serif">
  <div aria-hidden="true" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;overflow:hidden">
    {{watermarkContent}}
  </div>
  <div style="position:relative;z-index:1">
  <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.88);border-bottom:1px solid #e5e7eb">
    <div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#555555;flex-shrink:0;overflow:hidden">${logoHtml}</div>
    <div style="flex:1;text-align:center">
      <p style="margin:0;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#111111">${esc(schoolName)}</p>
      <p style="margin:1px 0 0;font-size:9px;color:#6b7280">${esc(schoolAddress)}</p>
      <p style="margin:1px 0 0;font-size:9px;color:#6b7280">${contact}</p>
    </div>
    <div style="flex-shrink:0;text-align:right">
      <p style="margin:0;font-size:9px;font-weight:700;color:#111111">STUDENT REPORT CARD</p>
      <p style="margin:2px 0 0;font-size:8px;color:#9ca3af">{{session}} · {{term}}</p>
    </div>
  </div>
  <div style="text-align:center;font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#ffffff;background:#111111;padding:4px 0">STUDENT REPORT CARD</div>
  <div style="display:flex;gap:10px;padding:10px 14px;background:rgba(249,250,251,0.75);border-bottom:1px solid #e5e7eb">
    <div style="width:48px;height:60px;border-radius:4px;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#888888;flex-shrink:0;border:1px solid #d1d5db;overflow:hidden">{{studentInitial}}</div>
    <div style="flex:1;display:flex;flex-direction:column;gap:6px">
      <div style="display:flex">
        <div style="flex:1"><p style="margin:0;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af">Student</p><p style="margin:0;font-size:10px;font-weight:600;color:#111111">{{studentName}}</p></div>
        <div style="flex:1"><p style="margin:0;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af">Class</p><p style="margin:0;font-size:10px;font-weight:600;color:#111111">{{class}}</p></div>
        <div style="flex:1"><p style="margin:0;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af">Session</p><p style="margin:0;font-size:10px;font-weight:600;color:#111111">{{session}}</p></div>
      </div>
      <div style="display:flex">
        <div style="flex:1"><p style="margin:0;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af">Term</p><p style="margin:0;font-size:10px;font-weight:600;color:#111111">{{term}}</p></div>
        <div style="flex:1"><p style="margin:0;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af">Admission ID</p><p style="margin:0;font-size:10px;font-weight:600;color:#111111">{{admissionId}}</p></div>
        <div style="flex:1"><p style="margin:0;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af">Position</p><p style="margin:0;font-size:10px;font-weight:600;color:#111111">{{position}}</p></div>
      </div>
    </div>
  </div>
  <div style="padding:12px 14px;display:flex;flex-direction:column;gap:12px">
    ${
      grading_fields.length > 0
        ? `<div>
      <p style="margin:0 0 5px;font-size:10px;font-weight:700;color:#111111">Academic Scores</p>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:10px">
          <thead style="background:#111111;color:#ffffff">
            <tr>
              <th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:left;white-space:nowrap">SUBJECT</th>
              ${scoreCols}
              <th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:center;white-space:nowrap">TOTAL</th>
              <th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:center;white-space:nowrap">GRD</th>
              <th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:center;white-space:nowrap">POS</th>
            </tr>
          </thead>
          <tbody>{{subjectTableRows}}</tbody>
          <tfoot style="background:#111111;color:#ffffff">
            <tr>
              <td style="padding:6px 8px;font-weight:700;font-size:10px;text-align:left">GRAND TOTAL</td>
              ${tfootCols}
              <td style="padding:6px 8px;font-weight:700;font-size:10px;text-align:center">{{grandTotal}}</td>
              <td style="padding:6px 8px"></td>
              <td style="padding:6px 8px"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>`
        : ""
    }
    ${
      hasSide
        ? `<div style="display:flex;gap:12px;align-items:flex-start">
      ${
        behavioral_traits.length > 0
          ? `<div style="flex:1 1 0;min-width:0">
        <p style="margin:0 0 5px;font-size:10px;font-weight:700;color:#111111">Behavioral Traits</p>
        <table style="width:100%;border-collapse:collapse;font-size:10px">
          <thead style="background:#111111;color:#ffffff"><tr>
            <th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:left">TRAIT</th>
            <th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:center">RATING</th>
          </tr></thead>
          <tbody>${traitRows}</tbody>
        </table>
      </div>`
          : ""
      }
      ${
        grading_scheme.length > 0
          ? `<div style="flex:0 0 148px">
        <p style="margin:0 0 5px;font-size:10px;font-weight:700;color:#111111">Grading Scale</p>
        <table style="width:100%;border-collapse:collapse;font-size:10px">
          <thead style="background:#111111;color:#ffffff"><tr>
            <th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:center">GRADE</th>
            <th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:center">RANGE</th>
            <th style="padding:6px 8px;font-weight:700;font-size:9px;text-align:center">P/F</th>
          </tr></thead>
          <tbody>${schemeRows}</tbody>
        </table>
      </div>`
          : ""
      }
    </div>`
        : ""
    }
    <div style="display:flex;gap:12px">
      <div style="flex:1">
        <p style="margin:0 0 3px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af">Teacher's Remark</p>
        <div style="height:1px;background:#e5e7eb;margin:0 0 5px"></div>
        <p style="margin:0;font-size:10px;color:#374151;font-style:italic;line-height:1.5">{{teacherRemark}}</p>
      </div>
      <div style="flex:1">
        <p style="margin:0 0 3px;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9ca3af">Principal's Remark</p>
        <div style="height:1px;background:#e5e7eb;margin:0 0 5px"></div>
        <p style="margin:0;font-size:10px;color:#374151;font-style:italic;line-height:1.5">{{principalRemark}}</p>
      </div>
    </div>
  </div>
  </div>
</div>`.trim();
};

const hydratePlaceholders = (htmlTemplate, template, student) => {
  const gradingFields = template?.grading_fields || [];
  const behavioralTraits = template?.behavioral_traits || [];
  const subjects = student?.subjects || [];
  const primaryColor = template?.styling?.primaryColor || "#111111";

  const subjectTableHeaders = (() => {
    const cols = gradingFields
      .map(
        (f) =>
          `<th style="text-align:center">${esc(f.field_name)}<span style="font-weight:400;opacity:.7;font-size:8px">/${esc(f.max_score)}</span></th>`
      )
      .join("");
    return `<th style="text-align:left">Subject</th>${cols}<th style="text-align:center">Total</th><th style="text-align:center">Grade</th><th style="text-align:center">Position</th>`;
  })();

  const subjectTableRows = subjects
    .map((row) => {
      const scoreCells = gradingFields
        .map(
          (f) =>
            `<td style="text-align:center">${esc(row.scores?.[f.field_name] ?? "—")}</td>`
        )
        .join("");
      return `<tr>
      <td style="text-align:left;font-weight:500">${esc(row.name)}</td>
      ${scoreCells}
      <td style="text-align:center;font-weight:700">${esc(row.total ?? "—")}</td>
      <td style="text-align:center"><span style="display:inline-block;padding:1px 5px;border-radius:8px;background:#111;color:#fff;font-weight:700;font-size:9px">${esc(row.grade ?? "—")}</span></td>
      <td style="text-align:center">${esc(row.position ?? "—")}</td>
    </tr>`;
    })
    .join("");

  const subjectTableFooter = (() => {
    const colTotals = gradingFields
      .map(
        (f) =>
          `<td style="text-align:center">${subjects.reduce(
            (s, r) => s + (Number(r.scores?.[f.field_name]) || 0),
            0
          )}</td>`
      )
      .join("");
    const grandTotal = subjects.reduce((s, r) => s + (Number(r.total) || 0), 0);
    return `<td style="text-align:left"><strong>Total</strong></td>${colTotals}<td style="text-align:center"><strong>${grandTotal}</strong></td><td></td><td></td>`;
  })();

  const traitsRows = behavioralTraits
    .map(
      (t) =>
        `<div class="rc-trait-row"><span>${esc(t)}</span><span class="rc-trait-val">${esc(student.traits?.[t] ?? "—")}</span></div>`
    )
    .join("");

  const schoolInitial = student.schoolLogo
    ? `<img src="${esc(student.schoolLogo)}" alt="logo" style="width:40px;height:40px;object-fit:contain;border-radius:50%"/>`
    : esc(student.schoolName?.charAt(0) || "S");

  const studentInitial = student.profileImg
    ? `<img src="${esc(student.profileImg)}" alt="student" style="width:100%;height:100%;object-fit:cover"/>`
    : esc(student.studentName?.charAt(0) || "S");

  const grandTotal = subjects.reduce((s, r) => s + (Number(r.total) || 0), 0);

  const traitReplacements = {};
  behavioralTraits.forEach((t) => {
    const key = `trait_${String(t).replace(/[^a-zA-Z0-9]/g, "_")}`;
    traitReplacements[key] = student.traits?.[t] ?? "—";
  });

  const replacements = {
    schoolInitial,
    schoolName: student.schoolName || "",
    schoolAddress: student.schoolAddress || "",
    schoolPhone: student.schoolPhone || "",
    schoolEmail: student.schoolEmail || "",
    watermarkContent: buildWatermarkContent({
      logo_url: student.schoolLogo,
      school_name: student.schoolName,
    }),
    studentInitial,
    studentName: student.studentName || "—",
    gender: student.gender || "—",
    class: student.class || "—",
    session: student.session || "—",
    term: student.term || "—",
    admissionId: student.admissionId || "—",
    dob: student.dob || "—",
    position: student.position || "—",
    attendanceOpened: student.attendance?.opened ?? "—",
    attendancePresent: student.attendance?.present ?? "—",
    attendanceAbsent: student.attendance?.absent ?? "—",
    attendanceExcused: student.attendance?.excused ?? "—",
    attendanceRate: student.attendance?.rate ?? "—",
    teacherRemark: student.teacherRemark || "—",
    principalRemark: student.principalRemark || "—",
    primaryColor,
    subjectTableHeaders,
    subjectTableRows,
    subjectTableFooter,
    traitsRows,
    grandTotal: String(grandTotal),
    ...traitReplacements,
  };

  return Object.entries(replacements).reduce(
    (acc, [key, val]) => acc.split(`{{${key}}}`).join(val == null ? "" : String(val)),
    htmlTemplate
  );
};

/**
 * Resolve theme/template HTML and hydrate with preview student data.
 * @returns {{ html: string, css: string } | null}
 */
const resolveAndHydrateReportHtml = async (template, student) => {
  if (!template || !student) return null;

  let htmlTemplate = null;
  let themeCss = "";
  const themeId = template?.styling?.theme_id;

  if (themeId) {
    const theme = await ReportCardTheme.findOne({ theme_id: themeId }).lean();
    if (theme?.html_template) {
      htmlTemplate = theme.html_template;
      themeCss = theme.css || "";
    }
  }

  if (!htmlTemplate && template.html_template) {
    htmlTemplate = template.html_template;
  }

  if (!htmlTemplate) {
    htmlTemplate = generateDefaultReportHtml({
      grading_fields: template.grading_fields || [],
      grading_scheme: template.grading_scheme || [],
      behavioral_traits: template.behavioral_traits || [],
      school: {
        school_name: student.schoolName,
        address: student.schoolAddress,
        phone_number: student.schoolPhone,
        email: student.schoolEmail,
        logo_url: student.schoolLogo,
      },
    });
    themeCss = "";
  }

  const primaryColor = template?.styling?.primaryColor || "#111111";
  const css = String(themeCss || "").split("{{primaryColor}}").join(primaryColor);
  const html = hydratePlaceholders(htmlTemplate, template, student);
  return { html, css };
};

module.exports = { resolveAndHydrateReportHtml, hydratePlaceholders };
