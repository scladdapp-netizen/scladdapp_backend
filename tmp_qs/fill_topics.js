const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", "docsContent.json");
const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));

const get = (id) => {
  for (const s of data) {
    const it = (s.items || []).find((x) => x.id === id);
    if (it) return it;
  }
  throw new Error("missing " + id);
};

const S = (step, desc, extra = []) => ({
  step,
  desc,
  blocks: [desc, ...extra].map((text) => ({ type: "paragraph", text })),
});

const fill = (id, intro, steps, callout) => {
  const it = get(id);
  it.content = intro;
  it.blocks = [{ type: "paragraph", text: intro }];
  it.steps = steps;
  it.callout = callout;
  it.video = null;
};

fill(
  "generating-reports",
  "Report cards are created per student per term (subsession). Scores and trait ratings can be entered first; then an admin creates the report card, adds remarks, publishes it, and optionally emails a download link. Open a term and go to Student Report, or open a student profile and use the Report tab.",
  [
    S(
      "Set up the grading template first",
      "A report card uses the grading template assigned to the school: assessment fields (each with a max score), the grading scheme (letter grades with min/max percentage ranges), behavioural traits, and the visual report layout. Create and assign that template under Templates → Grading before you generate reports. If no template is assigned, scores have nowhere to land and the preview has no layout."
    ),
    S(
      "Enter scores before or after creating the card",
      "Teachers (or admins) enter assessment scores per subject. Admins: open a subject, then Assessments — the table is Student Name, Class, one column per grading field labelled like CA (/20), and Total. Double-click a cell (or double-tap on mobile) to type a number from 0 to that field's max score; press Enter or click away to save. Empty shows as —, first save creates the student's score record, later saves update it. Teachers: open the subject assignment and use Student Assessments — same columns plus a search box, filtered to their assigned class. Totals are the sum of the fields. Letter grades and class/subject positions are calculated on the report card from the grading scheme, not on this table."
    ),
    S(
      "Open Student Report for the term",
      "From Academic Sessions, open the term (subsession) and click Student Report. The page title is Student Report, subtitle All students in this subsession with their report card status. You need the student_report permission (create, edit, or read) unless you are Super Admin.",
      [
        "Columns: Student Name, Admission No., Class, Report Status, Actions. Report Status is No Report, Draft (created but not published), or Published.",
        "Click a row to open that student's Report tab. The Actions menu (three dots) has Create Report (disabled if a report already exists), Publish Result or Unpublish, and View Report (opens Report Card Preview)."
      ]
    ),
    S(
      "Create report cards in bulk",
      "Select students, then Create Report. The Create Report Cards modal shows how many students you selected, and warns how many already have a report.",
      [
        "Teacher's Remark — optional textarea, placeholder Enter teacher's remark (optional).",
        "Principal's Remark — optional textarea, placeholder Enter principal's remark (optional).",
        "Override remarks for students that already have a report — checkbox, only shown when some selected students already have a report. If it is off, those students are skipped.",
        "Confirm creates or updates the cards. Status becomes Draft until you publish."
      ]
    ),
    S(
      "Create a card on one student",
      "Open the student → Report tab for this term. If none exists, you see No report card has been created for this student yet. Click Create Report Card. The Create Report Card panel lists every subject assigned to the student's class. All are checked by default; uncheck any you want to leave off. You must keep at least one. Confirm creates the card with those subjects snapshotted onto it."
    ),
    S(
      "Academic Scores on the student's Report tab",
      "The Academic Scores table lists each subject on the card. Columns: Subject, one column per grading field (same names and max scores as the template), Total, Grade, Position. Stats at the top include Class Avg, Position, and Students.",
      [
        "Double-click a score cell to edit (0 to the field's max). Saving writes the subject score the same way as Subject Assessments.",
        "Grand Total at the bottom sums every subject total. Grade uses the template grading scheme against the percentage of the maximum possible. Position is the subject's rank in the class for this term."
      ]
    ),
    S(
      "Behavioral Traits",
      "The Behavioral Traits table has Trait and Rating. Traits come from the grading template (the 16 defaults plus any custom ones you added). Double-click a rating to choose Excellent, Very Good, Good, or Needs Improvement. Unset traits show Not set."
    ),
    S(
      "Remarks",
      "Teacher's Remark and Principal's Remark show next to the traits. Open the Remarks panel to edit:",
      [
        "Teacher's Remark — textarea, placeholder Enter teacher's remark...",
        "Principal's Remark — textarea, placeholder Enter principal's remark...",
        "Save writes both onto the report card. You can also set them in the bulk Create Report Cards modal."
      ]
    ),
    S(
      "Subjects on the report card",
      "Subjects on Report lists Subject Name and Code. + Add Subject opens a panel of class subjects not already on the card; tick the ones to add. Remove takes a subject off the card (scores for that subject still exist on the assessments table, they just will not print on this card)."
    ),
    S(
      "Preview, export, publish, and email",
      "View Report (term list) or the preview on the student Report tab opens Report Card Preview using the assigned layout and this student's scores, traits, and remarks.",
      [
        "Export PDF downloads a printable PDF of the hydrated report.",
        "Publish Report Card / Unpublish: publishing makes the card visible. The panel shows Status (Published or Not Published), Last Updated, Teacher's Remark, and Principal's Remark. The prompt is Publishing makes this report card visible. Make sure all scores and remarks are complete before publishing. Unpublish hides it again.",
        "Send Email (bulk on Student Report, or Send Email on the student Report tab) only sends for published cards that have an email address. Students with no report, unpublished cards, or no email are skipped. The Send Result Emails modal shows today's email quota (remaining of daily_limit) and how many are already queued; extras go to the next period. Publish the report card before sending email."
      ]
    ),
    S(
      "What students see",
      "After a card is published, the student can open the term Report page in their portal: subjects, scores, totals, grades, traits, remarks, and Export PDF. Unpublished cards stay admin-only."
    ),
  ],
  "Create the card, finish scores and remarks, then publish. Emails go only to published reports that have an address, and they count against the daily email quota."
);

fill(
  "attendance-tracking",
  "Attendance is marked per student, per class, per term, for one calendar date at a time. Statuses are Present, Absent, and Excused. Admins mark from the class Attendance tab or from a student's Attendance calendar; teachers mark from their class Session Attendance page.",
  [
    S(
      "Open class Attendance",
      "Open a class, pick the term, then Attendance. The heading is {term name} — Attendance with the term start and end dates underneath. You need classes.edit (or Super Admin) to change marks. The grid lists every student in the class with a cell per school date in the term."
    ),
    S(
      "Mark Attendance for one day",
      "Click Mark Attendance. The slide-in panel heading is Mark Attendance, with the term name and date range.",
      [
        "Select Date * — date picker. Limited to the term start and end. Defaults to today if today is inside the term, otherwise the term start. Changing the date loads any existing marks for that day.",
        "Mark all as: — Present, Absent, or Excused. Applies that status to every student in the class.",
        "Each student row shows the name and student id, then P (Present), A (Absent), and E (Excused). Leave a student blank to skip them. The footer shows {marked} / {total} marked.",
        "Save Attendance writes only the students you marked. Cancel closes without saving. Empty class shows No students in this class."
      ]
    ),
    S(
      "Edit from the class grid",
      "On the Attendance table you can change a cell directly. Each change saves immediately for that student and date (school, class, session, and term are stored with the record). Click a student row to jump to that student's Attendance tab for the same term."
    ),
    S(
      "Student Attendance calendar",
      "Open a student → Attendance. Heading: Attendance in {session} - {term}. Attendance Overview cards: Present, Absent, Excused, Total Days (weekdays from the term start through today or the term end, whichever is earlier), and Attendance Rate as a percentage of those weekdays.",
      [
        "Attendance Calendar: click a weekday inside the term. Select Attendance Status: Present, Absent, Excused, or Remove (deletes the mark for that date). Weekends are not used. Legend: Present ✓, Absent ✗, Excused !. You need students.edit (or Super Admin) to change a student's calendar."
      ]
    ),
    S(
      "Teachers marking attendance",
      "Teachers open the class dashboard for the term → Session Attendance. They pick a date inside the term and set Present / Absent / Excused per student, then save. The grid shows weekdays in the term only (Saturday and Sunday are skipped)."
    ),
  ],
  "Marks are Present, Absent, or Excused, one date at a time, and the date must sit inside the term. Unmarked days stay empty; they are not counted as absent."
);

fill(
  "grade-management",
  "Grades come from three places that must match: the grading template (fields, max scores, letter-grade ranges, traits), the scores entered per subject per student per term, and the report card that totals those scores, assigns a letter grade, and ranks the class.",
  [
    S(
      "Define fields and grade letters on the template",
      "Under Templates → Grading, the assigned template owns the assessment fields (name, max score; weights must add to 100%) and the grading scheme (grade letter, min range, max range from 0–100% with no overlap). Behavioural traits on the same template appear on the report card. Changing a published template that is already assigned is locked — see Grading Templates in this guide."
    ),
    S(
      "Enter scores as an admin",
      "Open a subject → Assessments. Heading: Student Assessments. Subtitle: Double-click a score cell to edit · Scores for this subject in the selected subsession. You need subject.edit (or Super Admin).",
      [
        "Columns: Student Name (with student id underneath), Class, one column per template field labelled FIELD (/max), Total.",
        "Double-click (or double-tap) a cell. Type a number from 0 to that field's max; invalid values show 0 – {max}. Enter or click away saves. First save for a student creates the score row; later saves update it. Students with no record show —. Total is the sum of the field scores. There is no separate Submit button."
      ]
    ),
    S(
      "Enter scores as a teacher",
      "Open the assigned subject for that class → Student Assessments. Same field columns and Total, plus Search student…. The list is filtered to the teacher's assigned class. Double-click a cell, type 0 to the max (error text Max {max}), Enter or blur to save."
    ),
    S(
      "How totals, grades, and positions are calculated",
      "On the student's Report tab, each subject Total is the sum of that subject's field scores. Grand Total sums every subject on the card. The letter Grade is the grading-scheme band that contains (total ÷ max possible) × 100. Subject Position is the rank in the class for that subject this term. Class Avg, Position, and Students on the report header come from the same class set. Positions update as scores are saved — you do not run a separate calculate step."
    ),
    S(
      "Trait ratings (not numeric grades)",
      "Behavioural traits are rated Excellent, Very Good, Good, or Needs Improvement on the student's Report tab (double-click Rating). They do not change the numeric total or letter grade. They print on the report card from the template's trait list."
    ),
  ],
  "Scores are typed into the template's fields (0 to each field's max). The report card adds them up, maps the percentage to a letter grade, and ranks the class — there is no separate grading-scale page outside the template."
);

fill(
  "timetables",
  "Each class has one weekly timetable per term. Build it by hand (day, start, end, subjects or a break) or let AI Generate draft it from a timetable template. Students and teachers see the saved timetable; nothing extra is required to 'publish' besides saving.",
  [
    S(
      "Create a timetable template first (for AI)",
      "Under Templates → Timetable, set the school days, periods, max duration, and breaks. AI Generate requires a Timetable Template. You can still build a class timetable by hand without one. See Timetable Templates in this guide for every template field."
    ),
    S(
      "Term view: Subsession Timetables",
      "Open the term → Timetable. Heading: Subsession Timetables, with how many classes are in the term. Each class card shows class name, class code, and either the weekly grid or Click \"Create Timetable\" to get started. Buttons: Create Timetable or Edit, and AI Generate. You need classes.edit (or Super Admin)."
    ),
    S(
      "Class view: Timetable tab",
      "Open the class → Timetable. Heading: Timetable — {class name}, subtitle Weekly class schedule. Empty state: No Timetable Yet, then Create Timetable. If a timetable exists: Export PDF (landscape weekly grid with day, period name, start–end, teacher) and Edit Timetable."
    ),
    S(
      "Add or edit a period by hand",
      "Create Timetable / Edit Timetable opens Edit Timetable. Add entry / Edit entry:",
      [
        "Day * — Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.",
        "Start * and End * — time pickers.",
        "What: Subject or Break / Interval.",
        "For Subject: Subjects — searchable list of subjects assigned to this class (subtitle is subject code • teacher). You can pick more than one for the same slot. Teacher and stream come from the class-subject assignment (Not assigned if none).",
        "For Break / Interval: Break name * — e.g. Morning Break, Lunch (default Break).",
        "Add Entry or Update Entry. Edit or delete any row in the list, then save the whole timetable. Cancel edit clears the form without discarding other unsaved rows."
      ]
    ),
    S(
      "AI Generate",
      "On a class card, or AI Generate inside the editor, opens AI Generate — {class name} (Generate a timetable for this class only).",
      [
        "AI Model — the active model is selected by default.",
        "Timetable Template * — required. Pick a school timetable template (days, periods, breaks).",
        "Notes / Instructions — optional free text for the generator.",
        "Generate. Review the draft in the editor, then save. Message: AI timetable generated — review and save."
      ]
    ),
  ],
  "Saving the class timetable for the term is what makes it live. AI Generate always needs a timetable template; manual entries only need day, times, and a subject or break name."
);

fill(
  "fee-bills",
  "Fee Billing Management has three tabs: Bills, School Accounts, and Income & Expenses. Bills are created from a fee bill template, assigned to students or classes, then collected as payments on each recipient. School Accounts (bank + Paystack) has its own topic. This topic covers Bills, recording payments, bill reports, and Income & Expenses.",
  [
    S(
      "Open Fee Billing",
      "Go to Fee Billing Management (subtitle Manage school fees, billing, and bank accounts). Tabs: Bills, School Accounts, Income & Expenses. You need bill_income_expense create/edit/delete (or Super Admin) for bills and transactions."
    ),
    S(
      "Create a fee bill template first",
      "Every fee is created from a fee bill template. The template sets bill items, total amount, currency, and installment options. If none exist, Add New Fee shows No fee bill template yet and a link to Templates → Fee Bill. See Fee Bill Templates in this guide."
    ),
    S(
      "Add New Fee",
      "On Bills, click Add New Fee. Heading: Add New Fee, Create a new fee structure for your school.",
      [
        "Fee Bill Template * — Search and select a template. Preview shows Template name, Total, category, currency, Single payment or {n} installments, description, and each bill item with amount. + New template goes to the template page.",
        "Fee Code * — e.g. SCH-001, UNI-002.",
        "Fee Type — Mandatory or Optional.",
        "School Account * — Searchable list of school bank accounts (account name — bank, subtitle type · number · Default). New bills pre-select the default account.",
        "Applicable To * — who receives the bill. Types (staff targets are hidden here): Whole School, All Students, All Alumni, Alumni by Year, All Guardians, Specific Classes, Specific Students, Specific Alumni, Specific Guardians. Pick classes, people, or a graduation year when the type needs a list.",
        "Status — Active, Inactive, or Draft.",
        "Notes — optional textarea. Additional notes about this fee...",
        "Create Fee. The Bills table columns are Fee Code, Fee Name (category underneath), Amount (currency + total), Target, Recipients ({count} and {paid} paid), Status, Created. Click a row to open the bill."
      ]
    ),
    S(
      "Bill Overview",
      "The bill page has Overview, Recipients, and Reports. Overview cards: Category, Target, Status, Type (Mandatory or Optional), Recipients, Paid. Total Amount shows currency and total; if the template allowed installments it also shows {n} installments · min ₦{min} each. Description, Bill Items (each item_name and amount), and Created (by whom, when). Deactivate / Activate hides or shows the bill in active listings without deleting records."
    ),
    S(
      "Record a payment",
      "Recipients columns: Name, Type, Amount Due, Amount Paid, Status (paid / partial / unpaid), Paid At. Click a recipient.",
      [
        "Summary: Amount Due, Amount Paid, Balance, Status.",
        "Record Payment (only if a balance remains and you have edit permission): Amount (₦) * — cannot exceed the remaining balance; if installments are on, cannot be below the template min payment. Method — Cash, Bank Transfer, Card, Cheque, Online, Other (default Cash). Reference (optional) — Transaction ref / receipt no. Note (optional). Record Payment.",
        "Payment History lists each payment. You can edit amount/method/reference/note or delete a payment. Amounts still cannot exceed what would remain due."
      ]
    ),
    S(
      "Bill Reports",
      "Reports for that bill: Total Recipients, Collection Rate (% fully paid), Total Expected, Total Collected, Outstanding, Avg per Recipient. Payment Status Breakdown: Paid, Partial, Unpaid (count and %). By Recipient Type, and Payment Methods (how many transactions and how much per method)."
    ),
    S(
      "Income & Expenses",
      "Third tab of Fee Billing. Heading: Income & Expenses. Show filter: Last 7 days, Last 30 days, Last 60 days, Last 90 days, Last year. Cards: Total Income, Total Expenses, Net Balance (Surplus or Deficit), plus a Financial Trend chart.",
      [
        "Table columns: Type (Income / Expense), Title, Amount, Category, Date, Method, Reference.",
        "Add Transaction / Edit Transaction: Type — Income or Expense. Title * — e.g. School Fees Collection. Amount * — e.g. 120000. Category — e.g. Tuition, Salaries, Utilities. Date. Payment Method — Bank Transfer, Cash, Online Payment, Cheque (or blank). Reference — e.g. TXN-001. Description — optional notes. Add Transaction / Update.",
        "Click a row for the detail panel. These entries are a manual cashbook; they are separate from bill payments on Recipients."
      ]
    ),
  ],
  "A bill always starts from a fee bill template and a school account. Payments are recorded per recipient (amount cannot exceed the balance). Income & Expenses is a separate cashbook on the same Fee Billing page."
);

fill(
  "school-accounts",
  "School Bank Accounts is the second tab of Fee Billing Management. Each account is a bank destination for fee payments. On add, Paystack verifies the 10-digit account number against the bank, then creates a Paystack subaccount so settlements can go to that account. Mark one account Default so new bills pick it automatically.",
  [
    S(
      "Open School Accounts",
      "Fee Billing → School Accounts. Heading: School Bank Accounts, Manage your school's bank accounts and financial information. You need school_account create/edit/delete (or Super Admin). Empty state: No school accounts found, then Add New Account. Each card shows account name, description or bank, Default badge if set, status, Account No. (hidden until you click the eye), Bank, and Type."
    ),
    S(
      "Add School Account — fields",
      "Add New Account opens Add School Account.",
      [
        "Account Name * — e.g. School Main Account.",
        "Account Number * — must be exactly 10 digits.",
        "Bank * — searchable list loaded from Paystack (Search bank...). Selecting a bank stores its name and code.",
        "Account Type * — Savings, Current, or Fixed Deposit (default Savings).",
        "Description — optional textarea.",
        "Set as Default Account — checkbox.",
        "Add Account runs verification first (button shows Verifying...)."
      ]
    ),
    S(
      "Paystack verification and subaccount",
      "After you submit, Paystack looks up the account number at that bank. A popup asks Is this your account? with Account Name (the name Paystack returned) and Account Number. Yes, this is mine creates a Paystack subaccount (business name = your Account Name, percentage_charge 0) and then saves the school account with the subaccount code. No, go back returns to the form.",
      [
        "If Paystack is in test mode and has hit its daily check limit, the popup is Save this account? and explains the account was not verified. You can still Save account; settlement is not created until verification works.",
        "If verification fails for another reason you see Could not verify account. Check account number and bank."
      ]
    ),
    S(
      "Default, edit, and delete",
      "Set Default / Set as Default on a card or the detail panel. New bills auto-select this account. Edit Account uses the same fields (except bank re-verify is not required); Update Account. You cannot delete the default account — Set another as default first. Detail panel: Account Name, Bank Name, Account Type, Status, Default Account (Yes/No), Account Number, Description, Created, Last Updated, Created By, Updated By."
    ),
    S(
      "How bills use the account",
      "When you Add New Fee, School Account * is required. Online fee collection settles to the Paystack subaccount on that bank account. If you saved an account without a subaccount (test-mode limit), keep it as a record but online settlement will not be attached until Paystack can verify it."
    ),
  ],
  "Account number must be 10 digits and match the bank Paystack knows. Confirm the name Paystack returns, then set one account as Default for new bills. You cannot delete the default account."
);

fill(
  "notifications",
  "Communication in admin is Notifications (Send Custom Alert). You compose from an announcement template, choose delivery, pick who should receive it, and send. Recipients see web notifications in their portal; email is optional except for guardians. School events and calendar items are a separate topic.",
  [
    S(
      "Open Notifications",
      "Go to Communication → Notifications. Heading: Notifications, Timeline of system alerts and custom notifications with delivery tracking. You need communication create (or Super Admin) to send. Table columns: Title (with By {name}), Target, Channels, Recipients, Read ({read} / {total}), Sent At. Send Custom Alert opens the compose panel. Click a row for the notification detail."
    ),
    S(
      "Create an announcement template first",
      "Send Custom Alert requires Announcement Template *. Templates live under Templates → Announcement (name, subject, rich-text content, placeholders such as {school_name}). + Add Template opens that page. If the list is empty, create a template before sending. See Announcement Templates in this guide."
    ),
    S(
      "Send Custom Alert — template and placeholders",
      "Announcement Template * — select a template. Any {placeholders} in the template become labelled text fields; fill them in. Content Preview shows the message with your values substituted. The sent title is the template subject (or name) with placeholders filled and HTML stripped."
    ),
    S(
      "Delivery Method",
      "Web Notification is Always On for students, staff, and alumni (Shows in the recipient's dashboard on the web app). It is N/A for Guardians because guardians don't have a web dashboard account.",
      [
        "Email Notification — optional toggle for school users; Required for guardian targets (Sent directly to recipient email addresses).",
        "Popup Notification — Coming Soon (disabled).",
        "WhatsApp — Coming Soon (disabled)."
      ]
    ),
    S(
      "Target Audience *",
      "Choose a type, then pick people or groups when the type needs a list. Types: Whole School (all students, staff, and alumni), All Students, All Staff, All Alumni, Alumni by Year, All Guardians (primary guardian per student, or all if none set), Specific Classes, Specific Students, Specific Staff, Specific Alumni, Specific Guardians. Send Alert is disabled until a template and a target type are set."
    ),
    S(
      "After you send",
      "The row appears with recipient and read counts. Open it: Info shows Target, Sent At, Sent By, Delivery channels, and the message body. Recipients columns: Name, Type, Email (No Email, ✓ Sent, or ✗ Not Sent, plus the address), Read / Unread, Read At, Delivered At. Delete removes the notification if you have communication.delete."
    ),
  ],
  "Every custom alert is built from an announcement template. Web delivery is always on except for guardians, who only get email. Popup and WhatsApp are not available yet."
);

fill(
  "calendar-events",
  "Each term has two lists: School Events (one-off happenings such as sports day) and School Calendar (dated academic items such as holidays and exams). Both live on the term: open the subsession and use School Events or School Calendar. They are visible to the school for that term; they are not the same as Notifications.",
  [
    S(
      "School Events — list",
      "Term → School Events. Columns: Event, Date & Time, Location, Category, Participants, Actions (view, edit, delete). You need school_event create/edit/delete (or Super Admin). Bulk select can delete several events."
    ),
    S(
      "Create or edit an event",
      "Required: Event Title * (e.g. Annual Sports Day), Description *, Date *, Time *, Location * (e.g. School Auditorium). Optional: Category (e.g. Academic, Sports — stored as General if left blank), Organizer (e.g. Sports Dept.), Participants (defaults to All Students if blank). New events save with status Upcoming. Category colours in the table include Academic, Sports, Cultural, and Social."
    ),
    S(
      "School Calendar — list",
      "Term → School Calendar. Columns: Calendar Item, Date & Time, Location, Type, Priority, Participants, Actions. You need school_calendar create/edit/delete (or Super Admin). Bulk delete is available."
    ),
    S(
      "Create or edit a calendar item",
      "Required: Title * (e.g. First Term Begins), Description *, Date *, Time *. Optional: Type — Academic, Holiday, Meeting, Examination, Sports, Cultural (default Academic). Priority — High, Medium, Low (default Medium). Location (e.g. School Auditorium). Duration (e.g. Full Day, 2 Hours). Participants (defaults to All Students & Staff if blank)."
    ),
    S(
      "How this differs from notifications",
      "Events and calendar items are dated records on the term. They do not send email or web alerts by themselves. To notify people, send a custom alert under Communication → Notifications using an announcement template."
    ),
  ],
  "Events need title, description, date, time, and location. Calendar items need title, description, date, and time. Both belong to the term you are viewing, not to a separate school-wide calendar page."
);

const out = JSON.stringify(data, null, 2);
JSON.parse(out);
fs.writeFileSync(file, out, "utf8");
const ids = [
  "generating-reports",
  "attendance-tracking",
  "grade-management",
  "timetables",
  "fee-bills",
  "school-accounts",
  "notifications",
  "calendar-events",
];
ids.forEach((id) => {
  const it = get(id);
  console.log(id, "steps", it.steps.length, "callout", (it.callout || "").slice(0, 60));
});
console.log("OK", out.length);
