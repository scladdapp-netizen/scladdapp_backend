const School = require("../models/School.model");
const Admission = require("../models/Admission.model");
const Staff = require("../models/Staff.model");
const Alumni = require("../models/Alumni.model");
const Admin = require("../models/Admin.model");
const Student = require("../models/Student.model");
const StudentAttendance = require("../models/StudentAttendance.model");
const Transaction = require("../models/Transaction.model");
const StaffActivityLog = require("../models/StaffActivityLog.model");
const Teacher = require("../models/Teacher.model");
const Subject = require("../models/Subject.model");
const Class = require("../models/Class.model");
const Session = require("../models/Session.model");
const Notification = require("../models/Notification.model");
const Bill = require("../models/Bill.model");

exports.getProfile = async (req, res) => {
  try {
    const school = await School.findOne({ school_id: req.params.schoolId }).lean();
    if (!school) return res.status(404).json({ success: false, message: "School not found" });
    res.json({ success: true, data: school });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateProfile = async (req, res) => {
  try {
    const school = await School.findOne({ school_id: req.params.schoolId });
    if (!school) return res.status(404).json({ success: false, message: "School not found" });
    const fields = ["school_name","motto","address","phone_number","email","website","instagram","state","country"];
    fields.forEach((f) => { if (req.body[f] !== undefined) school[f] = req.body[f]; });
    school.updated_at = new Date();
    await school.save();
    res.json({ success: true, data: school, message: "Profile saved" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getBio = async (req, res) => {
  try {
    const school = await School.findOne({ school_id: req.params.schoolId }).lean();
    if (!school) return res.status(404).json({ success: false, message: "School not found" });
    res.json({ success: true, bio: school.bio || "" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateBio = async (req, res) => {
  try {
    const school = await School.findOne({ school_id: req.params.schoolId });
    if (!school) return res.status(404).json({ success: false, message: "School not found" });
    school.bio = req.body.bio || "";
    school.updated_at = new Date();
    await school.save();
    res.json({ success: true, data: school, message: "Bio saved" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getStats = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const [activeIds, allIds, totalStaff, totalGraduates, totalAdmins] = await Promise.all([
      Admission.distinct("student_id", { school_id: schoolId, active_status: true, is_graduated: { $ne: true } }),
      Admission.distinct("student_id", { school_id: schoolId }),
      Staff.countDocuments({ school_id: schoolId, is_active: { $ne: false } }),
      Alumni.countDocuments({ school_id: schoolId }),
      Admin.countDocuments({ school_id: schoolId, is_active: { $ne: false } }),
    ]);
    res.json({ success: true, data: { students: activeIds.length, admitted: allIds.length, staff: totalStaff, graduates: totalGraduates, admins: totalAdmins } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getTodayAttendance = async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const records = await StudentAttendance.find({ school_id: req.params.schoolId, attendance_date: today }).lean();
    res.json({ success: true, data: {
      present: records.filter((a) => a.status === "present").length,
      absent:  records.filter((a) => a.status === "absent").length,
      excused: records.filter((a) => a.status === "excused").length,
      total: records.length, date: today,
    }});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getFeePayments = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const range = req.query.range || "today";
    const now = new Date(); now.setHours(23, 59, 59, 999);
    const from = new Date();
    if (range === "week") from.setDate(from.getDate() - 6);
    else if (range === "month") from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);

    const transactions = await Transaction.find({
      school_id: schoolId, type: "income", status: "completed",
      date: { $gte: from.toISOString().split("T")[0], $lte: now.toISOString().split("T")[0] },
    }).lean();

    const total = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const dailyMap = {};
    transactions.forEach((t) => { dailyMap[t.date] = (dailyMap[t.date] || 0) + (parseFloat(t.amount) || 0); });

    const chartData = [];
    const cursor = new Date(from);
    while (cursor <= now) {
      const key = cursor.toISOString().split("T")[0];
      chartData.push({ date: key, label: cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }), amount: dailyMap[key] || 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    res.json({ success: true, data: { total, count: transactions.length, range, from: from.toISOString().split("T")[0], chartData } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getGenderDistribution = async (req, res) => {
  try {
    const result = await Student.aggregate([
      { $match: { school_id: req.params.schoolId, is_active: { $ne: false } } },
      { $group: { _id: "$gender", count: { $sum: 1 } } },
    ]);
    res.json({ success: true, data: result.map((r) => ({ gender: r._id || "Unknown", count: r.count })) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getEnrollmentTrend = async (req, res) => {
  try {
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("default", { month: "short", year: "2-digit" }), count: 0 });
    }
    const admissions = await Admission.find({ school_id: req.params.schoolId }).lean();
    admissions.forEach((a) => {
      if (!a.admitted_date) return;
      const m = months.find((x) => x.key === a.admitted_date.substring(0, 7));
      if (m) m.count++;
    });
    res.json({ success: true, data: months });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getRecentActivities = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 5;

    const total = await StaffActivityLog.countDocuments({ school_id: schoolId });
    const logs = await StaffActivityLog.find({ school_id: schoolId })
      .sort({ performed_at: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean();

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const [staffList, adminList] = await Promise.all([
      Staff.find({ staff_id: { $in: userIds } }).lean(),
      Admin.find({ $or: [{ staff_id: { $in: userIds } }, { admin_id: { $in: userIds } }] }).lean(),
    ]);
    const staffMap = {};
    staffList.forEach((s) => { staffMap[s.staff_id] = s; });
    const adminMap = {};
    adminList.forEach((a) => { adminMap[a.staff_id] = a; adminMap[a.admin_id] = a; });

    const slice = logs.map((l) => {
      const s = staffMap[l.user_id];
      if (s) return { ...l, user_name: s.full_name, profile_id: s.staff_id, profile_type: l.staff_type };
      const a = adminMap[l.user_id];
      if (a) return { ...l, user_name: a.username || a.email, profile_id: a.admin_id, profile_type: "admin" };
      return { ...l, user_name: "Unknown", profile_id: null, profile_type: l.staff_type };
    });

    res.json({ success: true, data: slice, total, page, pageSize, hasMore: page * pageSize < total });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMonthlyFinancials = async (req, res) => {
  try {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, month: d.toLocaleString("default", { month: "short", year: "2-digit" }), income: 0, expenses: 0 });
    }
    const transactions = await Transaction.find({ school_id: req.params.schoolId, status: "completed" }).lean();
    transactions.forEach((t) => {
      if (!t.date) return;
      const m = months.find((x) => x.key === t.date.substring(0, 7));
      if (!m) return;
      if (t.type === "income")  m.income   += parseFloat(t.amount) || 0;
      if (t.type === "expense") m.expenses += parseFloat(t.amount) || 0;
    });
    res.json({ success: true, data: months });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.search = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const q = (req.query.q || "").trim();
    const limit = parseInt(req.query.limit) || 5;
    if (!q) return res.json({ success: true, data: [] });

    const regex = { $regex: q, $options: "i" };

    const [activeAdmissionIds, students, staffList, teacherList, subjectList, classList,
           adminList, sessionList, notifList, billList, alumniList] = await Promise.all([
      Admission.distinct("student_id", { school_id: schoolId, active_status: true, is_graduated: { $ne: true } }),
      Student.find({ school_id: schoolId, $or: [{ full_name: regex }, { student_id: regex }, { admission_number: regex }] }).limit(limit).lean(),
      Staff.find({ school_id: schoolId, is_active: { $ne: false }, $or: [{ full_name: regex }, { staff_id: regex }] }).limit(limit).lean(),
      Teacher.find({ school_id: schoolId, is_active: { $ne: false } }).lean(),
      Subject.find({ school_id: schoolId, is_active: { $ne: false }, $or: [{ subject_name: regex }, { subject_code: regex }] }).limit(limit).lean(),
      Class.find({ school_id: schoolId, is_active: { $ne: false }, $or: [{ class_name: regex }, { class_code: regex }] }).limit(limit).lean(),
      Admin.find({ school_id: schoolId, is_active: { $ne: false }, $or: [{ username: regex }, { email: regex }, { admin_id: regex }] }).limit(limit).lean(),
      Session.find({ school_id: schoolId, is_archived: { $ne: true }, $or: [{ session_name: regex }, { session_code: regex }] }).limit(limit).lean(),
      Notification.find({ school_id: schoolId, title: regex }).limit(limit).lean(),
      Bill.find({ school_id: schoolId, $or: [{ fee_name: regex }, { fee_code: regex }, { category: regex }] }).limit(limit).lean(),
      Alumni.find({ school_id: schoolId }).lean(),
    ]);

    const activeSet = new Set(activeAdmissionIds);
    const studentMap = {};
    students.forEach((s) => { studentMap[s.student_id] = s; });

    const activeStudents = students
      .filter((s) => activeSet.has(s.student_id))
      .map((s) => ({ type: "student", id: s.student_id, name: s.full_name, sub: s.current_class || "Active Student" }));

    const graduates = alumniList
      .filter((a) => {
        const s = studentMap[a.student_id];
        return s && (new RegExp(q, "i").test(s.full_name) || new RegExp(q, "i").test(a.student_id));
      })
      .slice(0, limit)
      .map((a) => ({ type: "graduate", id: a.alumni_id, name: studentMap[a.student_id]?.full_name || "Unknown", sub: `Graduated · ${a.final_class_name || ""}` }));

    const staffIds = teacherList.map((t) => t.staff_id);
    const staffForTeachers = await Staff.find({ staff_id: { $in: staffIds } }).lean();
    const staffForTeacherMap = {};
    staffForTeachers.forEach((s) => { staffForTeacherMap[s.staff_id] = s; });

    const teachers = teacherList
      .filter((t) => {
        const s = staffForTeacherMap[t.staff_id];
        return (s && new RegExp(q, "i").test(s.full_name)) || new RegExp(q, "i").test(t.teacher_code || "");
      })
      .slice(0, limit)
      .map((t) => ({ type: "teacher", id: t.teacher_id, name: staffForTeacherMap[t.staff_id]?.full_name || "Unknown", sub: t.teacher_code || "" }));

    res.json({ success: true, data: [
      ...activeStudents,
      ...graduates,
      ...classList.map((c) => ({ type: "class", id: c.class_id, name: `${c.class_name} ${c.class_section || ""}`.trim(), sub: c.class_code || "" })),
      ...staffList.map((s) => ({ type: "staff", id: s.staff_id, name: s.full_name, sub: s.position || s.job_title || "" })),
      ...teachers,
      ...subjectList.map((s) => ({ type: "subject", id: s.subject_id, name: s.subject_name, sub: s.subject_code || "" })),
      ...adminList.map((a) => ({ type: "admin", id: a.admin_id, name: a.username || a.email, sub: a.admin_role || "" })),
      ...sessionList.map((s) => ({ type: "session", id: s.session_id, name: s.session_name, sub: s.session_code || "" })),
      ...notifList.map((n) => ({ type: "notification", id: n.notification_id, name: (n.title || "").replace(/<[^>]*>/g, ""), sub: `${n.target_type || ""} · ${(n.delivery_channels || []).join(", ")}` })),
      ...billList.map((b) => ({ type: "bill", id: b.bill_id, name: b.fee_name, sub: `${b.fee_code || ""} · ${b.category || ""}` })),
    ]});
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
