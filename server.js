require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME })
  .then(() => console.log(`Connected to MongoDB: ${process.env.DB_NAME}`))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });

const app = express();

// Middlewares
app.use(cors()); // allow frontend requests
app.use(express.json({ limit: "50mb" })); // parse JSON body

// Routes
app.use("/setup", require("./routes/setup.routes"));
app.use("/login", require("./routes/login.routes"));
app.use("/set-password", require("./routes/set_password.routes"));
app.use("/forgot-password", require("./routes/forgot_password.routes"));
app.use("/api/download-proxy", require("./routes/download_proxy.routes"));
app.use("/admin", require("./routes/admin.routes"));
app.use("/staff", require("./routes/staff.routes"));
app.use("/teacher", require("./routes/teacher.routes"));
app.use("/student", require("./routes/student.routes"));
app.use("/admission", require("./routes/admission.routes"));
app.use("/guardian", require("./routes/guardian.routes"));
app.use("/class", require("./routes/class.routes"));
app.use("/headmaster", require("./routes/headmaster.routes"));
app.use("/subject", require("./routes/subject.routes"));
app.use("/teacher-subject", require("./routes/teacher_subject.routes"));
app.use("/class-subject", require("./routes/class_subject.routes"));
app.use("/grading-template", require("./routes/combined_template.routes"));
app.use("/school-account", require("./routes/school_account.routes"));
app.use("/fee-bill-template", require("./routes/fee_bill_template.routes"));
app.use("/timetable-template", require("./routes/timetable_template.routes"));
app.use(
  "/announcement-template",
  require("./routes/announcement_template.routes")
);
app.use(
  "/class-promotion-template",
  require("./routes/class_promotion_template.routes")
);
app.use("/session", require("./routes/session.routes"));
app.use("/subsession", require("./routes/subsession.routes"));
app.use("/api/student-class-assignment", require("./routes/student_class_assignment.routes"));
app.use("/api/student-medical-record", require("./routes/student_medical_record.routes"));
app.use("/api/student-attendance", require("./routes/student_attendance.routes"));
app.use("/api/student-report", require("./routes/student_report.routes"));
app.use("/api/student-trait-score", require("./routes/student_trait_score.routes"));
app.use("/api/school-events", require("./routes/school_events.routes"));
app.use("/api/school-calendar", require("./routes/school_calendar.routes"));
app.use("/api/report-card-theme", require("./routes/report_card_theme.routes"));
app.use("/api/alumni", require("./routes/alumni.routes"));
app.use("/api/class-resource", require("./routes/class_resource.routes"));
app.use("/api/class-students", require("./routes/class_students.routes"));
app.use("/api/class-subjects", require("./routes/class_subjects.routes"));
app.use("/api/class-attendance", require("./routes/class_attendance.routes"));
app.use("/api/class-timetable", require("./routes/class_timetable.routes"));
app.use("/api/teacher-resource", require("./routes/teacher_resource.routes"));
app.use("/api/staff-credential", require("./routes/staff_credential.routes"));
app.use("/api/staff-resource", require("./routes/staff_resource.routes"));
app.use("/api/staff-activity", require("./routes/staff_activity.routes"));
app.use("/api/staff-performance", require("./routes/staff_performance.routes"));
app.use("/api/app-feedback", require("./routes/app_feedback.routes"));
app.use("/api/subject-books", require("./routes/subject_book.routes"));
app.use("/api/subject-resources", require("./routes/subject_resource.routes"));
app.use("/api/student-resources", require("./routes/student_resource.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));
app.use("/api/bills", require("./routes/bill.routes"));
app.use("/api/transactions", require("./routes/transaction.routes"));
app.use("/api/alumni-certificates", require("./routes/alumni_certificate.routes"));
app.use("/api/subscription", require("./routes/subscription.routes"));
app.use("/api/school-resources", require("./routes/school_resource.routes"));
app.use("/api/school-gallery", require("./routes/school_gallery.routes"));
app.use("/api/schools", require("./routes/school.routes"));
app.use("/api/ai-timetable", require("./routes/ai_timetable.routes"));
app.use("/api/contact", require("./routes/contact.routes"));
app.use("/api/otp", require("./routes/otp.routes"));

// Serve uploaded files
const path = require("path");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
