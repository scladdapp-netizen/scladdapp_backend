const bcrypt = require("bcryptjs");
const Staff = require("../models/Staff.model");
const User = require("../models/User.model");
const Teacher = require("../models/Teacher.model");
const Admin = require("../models/Admin.model");
const Session = require("../models/Session.model");
const Subsession = require("../models/Subsession.model");
const TeacherAssignmentHistory = require("../models/TeacherAssignmentHistory.model");
const { checkStaffLimit } = require("../utils/planLimitCheck");

const composeResidenceAddress = (d) => {
  if (d.address && String(d.address).trim()) return d.address.trim();
  return [
    d.houseNumberStreet,
    d.areaEstate,
    d.city,
    d.lgaOfResidence,
    d.stateOfResidence,
    d.landmark,
  ]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter(Boolean)
    .join(", ") || null;
};

const pickStr = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const createStaff = async (staffData) => {
  try {
    if (!staffData.fullName || !staffData.email || !staffData.phone || !staffData.position || !staffData.department || !staffData.school_id) {
      return { success: false, error: "Missing required fields", message: "Full name, email, phone, position, department, and school_id are required" };
    }

    const staffLimit = await checkStaffLimit(staffData.school_id);
    if (!staffLimit.allowed) return { success: false, error: "Plan limit reached", message: staffLimit.message, limitType: "staff" };

    const normalizedEmail = staffData.email.toLowerCase().trim();

    const [existingStaff, existingUser] = await Promise.all([
      Staff.findOne({ email: normalizedEmail }),
      User.findOne({ email: normalizedEmail }),
    ]);

    if (existingStaff) return { success: false, error: "Staff already exists", message: "A staff member with this email already exists in the system" };
    if (existingUser)  return { success: false, error: "User already exists", message: "A user with this email already exists in the system" };

    const newStaff = await Staff.create({
      staff_id:                       Date.now().toString(),
      school_id:                      staffData.school_id,
      full_name:                      staffData.fullName,
      email:                          normalizedEmail,
      phone:                          staffData.phone,
      whatsapp:                       pickStr(staffData.whatsapp),
      position:                       staffData.position,
      job_title:                      staffData.position,
      department:                     staffData.department,
      qualification:                  pickStr(staffData.qualification),
      experience_years:               staffData.experience ? parseInt(staffData.experience) : 0,
      employment_type:                staffData.employmentType || "Full-time",
      employment_status:              "active",
      record_status:                  "active",
      joining_date:                   staffData.joiningDate || new Date().toISOString().split("T")[0],
      date_of_birth:                  pickStr(staffData.dateOfBirth),
      gender:                         pickStr(staffData.gender),
      religion:                       pickStr(staffData.religion),
      marital_status:                 pickStr(staffData.maritalStatus),
      nationality:                    pickStr(staffData.nationality),
      state_of_origin:                pickStr(staffData.stateOfOrigin),
      place_of_birth:                 pickStr(staffData.placeOfBirth),
      lga_of_origin:                  pickStr(staffData.lgaOfOrigin),
      tribe:                          pickStr(staffData.tribe),
      nin:                            pickStr(staffData.nin),
      national_id:                    pickStr(staffData.nin),
      address:                        composeResidenceAddress(staffData),
      house_number_street:            pickStr(staffData.houseNumberStreet),
      area_estate:                    pickStr(staffData.areaEstate),
      city:                           pickStr(staffData.city),
      lga_of_residence:               pickStr(staffData.lgaOfResidence),
      state_of_residence:             pickStr(staffData.stateOfResidence),
      landmark:                       pickStr(staffData.landmark),
      blood_group:                    pickStr(staffData.bloodGroup),
      genotype:                       pickStr(staffData.genotype),
      staff_photo:                    staffData.staffPhoto || null,
      emergency_contact_name:         pickStr(staffData.emergencyContact),
      emergency_contact_phone:        pickStr(staffData.emergencyContactPhone),
      emergency_contact_whatsapp:     pickStr(staffData.emergencyContactWhatsapp),
      emergency_contact_relationship: pickStr(staffData.emergencyContactRelationship),
      two_factor_auth:                false,
      is_active:                      true,
      created_by:                     staffData.created_by || null,
    });

    if (staffData.password) {
      const hashedPassword = await bcrypt.hash(staffData.password, 10);
      await User.create({
        user_id:      (Date.now() + 1).toString(),
        user_type:    "staff",
        reference_id: newStaff.staff_id,
        email:        normalizedEmail,
        password:     hashedPassword,
        is_active:    true,
      });
    }

    return { success: true, data: { staff_id: newStaff.staff_id, staff: newStaff, message: "Staff member created successfully" }, message: "Staff member created successfully" };
  } catch (error) {
    console.error("Create staff error:", error);
    return { success: false, error: "Create staff failed", message: error.message || "Failed to create staff member" };
  }
};

const updateStaff = async (staffId, staffData) => {
  try {
    const staffMember = await Staff.findOne({ staff_id: staffId });
    if (!staffMember) return { success: false, error: "Staff not found", message: "Staff member not found" };

    if (staffData.email) {
      const newEmail = staffData.email.toLowerCase().trim();
      if (newEmail !== staffMember.email) {
        const [emailExists, userEmailExists] = await Promise.all([
          Staff.findOne({ email: newEmail, staff_id: { $ne: staffId } }),
          User.findOne({ email: newEmail, reference_id: { $ne: staffId } }),
        ]);
        if (emailExists)    return { success: false, error: "Email already exists", message: "Another staff member with this email already exists in the system" };
        if (userEmailExists) return { success: false, error: "Email already exists", message: "A user with this email already exists in the system" };
      }
    }

    const fieldMap = {
      fullName: "full_name", email: null, phone: "phone", whatsapp: "whatsapp",
      position: "position", department: "department", qualification: "qualification",
      employmentType: "employment_type", joiningDate: "joining_date",
      dateOfBirth: "date_of_birth", gender: "gender", religion: "religion", maritalStatus: "marital_status",
      nationality: "nationality", stateOfOrigin: "state_of_origin",
      placeOfBirth: "place_of_birth", lgaOfOrigin: "lga_of_origin", tribe: "tribe", nin: "nin",
      houseNumberStreet: "house_number_street", areaEstate: "area_estate", city: "city",
      lgaOfResidence: "lga_of_residence", stateOfResidence: "state_of_residence", landmark: "landmark",
      bloodGroup: "blood_group", genotype: "genotype", staffPhoto: "staff_photo",
      emergencyContact: "emergency_contact_name", emergencyContactPhone: "emergency_contact_phone",
      emergencyContactWhatsapp: "emergency_contact_whatsapp",
      emergencyContactRelationship: "emergency_contact_relationship",
    };

    Object.entries(fieldMap).forEach(([src, dest]) => {
      if (staffData[src] !== undefined && dest) staffMember[dest] = staffData[src];
    });
    if (staffData.email)      staffMember.email           = staffData.email.toLowerCase().trim();
    if (staffData.experience !== undefined && staffData.experience !== "") {
      staffMember.experience_years = parseInt(staffData.experience);
    }
    if (staffData.nin !== undefined) staffMember.national_id = staffData.nin;
    if (staffData.position !== undefined) staffMember.job_title = staffData.position;
    if (
      staffData.houseNumberStreet !== undefined ||
      staffData.areaEstate !== undefined ||
      staffData.city !== undefined ||
      staffData.lgaOfResidence !== undefined ||
      staffData.stateOfResidence !== undefined ||
      staffData.landmark !== undefined
    ) {
      staffMember.address = composeResidenceAddress({
        houseNumberStreet: staffMember.house_number_street,
        areaEstate: staffMember.area_estate,
        city: staffMember.city,
        lgaOfResidence: staffMember.lga_of_residence,
        stateOfResidence: staffMember.state_of_residence,
        landmark: staffMember.landmark,
      });
    }
    staffMember.updated_at = new Date();
    await staffMember.save();

    // Update user record
    const user = await User.findOne({ user_type: "staff", reference_id: staffId });
    if (user) {
      if (staffData.email) user.email = staffData.email.toLowerCase().trim();
      if (staffData.password) user.password = await bcrypt.hash(staffData.password, 10);
      await user.save();
    } else if (staffData.password) {
      await User.create({
        user_id: (Date.now() + 1).toString(), user_type: "staff", reference_id: staffId,
        email: staffMember.email, password: await bcrypt.hash(staffData.password, 10), is_active: true,
      });
    }

    return { success: true, data: { staff_id: staffId, staff: staffMember, message: "Staff member updated successfully" }, message: "Staff member updated successfully" };
  } catch (error) {
    return { success: false, error: "Update staff failed", message: error.message || "Failed to update staff member" };
  }
};

const getStaffById = async (staffId) => {
  try {
    const staffMember = await Staff.findOne({ staff_id: staffId }).lean();
    if (!staffMember) return { success: false, error: "Staff not found", message: "Staff member not found" };
    return { success: true, data: staffMember, message: "Staff member retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get staff failed", message: error.message || "Failed to retrieve staff member" };
  }
};

const getStaffBySchoolId = async (schoolId) => {
  try {
    const staff = await Staff.find({ school_id: schoolId }).lean();
    return { success: true, data: staff, message: "Staff members retrieved successfully" };
  } catch (error) {
    return { success: false, error: "Get school staff failed", message: error.message || "Failed to retrieve staff members" };
  }
};

const getStaffDetail = async (staffId) => {
  try {
    const staffMember = await Staff.findOne({ staff_id: staffId }).lean();
    if (!staffMember) return { success: false, error: "Staff not found", message: "Staff member not found" };

    const [teacherAssignments, assignmentHistory] = await Promise.all([
      Teacher.find({ staff_id: staffId, is_active: true }).lean(),
      TeacherAssignmentHistory.find({ $or: [{ old_staff_id: staffId }, { new_staff_id: staffId }] }).sort({ changed_at: -1 }).lean(),
    ]);

    // Enrich teacher assignments with admin info
    const appointedByIds = teacherAssignments.map((t) => t.appointed_by).filter(Boolean);
    const admins = await Admin.find({ admin_id: { $in: appointedByIds } }).lean();
    const adminMap = {};
    admins.forEach((a) => { adminMap[a.admin_id] = a; });

    const teacherAssignmentsWithAdmin = teacherAssignments.map((t) => ({
      ...t,
      appointed_by_admin: t.appointed_by && adminMap[t.appointed_by] ? {
        admin_id:   adminMap[t.appointed_by].admin_id,
        full_name:  adminMap[t.appointed_by].username || adminMap[t.appointed_by].full_name,
        email:      adminMap[t.appointed_by].email,
        admin_role: adminMap[t.appointed_by].admin_role || "Admin",
      } : null,
    }));

    // Get sessions/subsessions for this school filtered by staff creation date
    const staffCreatedDate = new Date(staffMember.created_at);
    staffCreatedDate.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    const createdStr = staffCreatedDate.toISOString().split("T")[0];

    const allSessions = await Session.find({
      school_id:                staffMember.school_id,
      is_archived:              { $ne: true },
      session_status:           { $ne: "archived" },
      academic_year_start_date: { $lte: todayStr },
      academic_year_end_date:   { $gte: createdStr },
    }).lean();

    const validSessions = [];
    for (const session of allSessions) {
      const subsessions = await Subsession.find({
        session_id:   session.session_id,
        term_end_date: { $gte: createdStr },
      }).lean();
      if (subsessions.length === 0) continue;
      validSessions.push({
        session_id:   session.session_id,
        session_name: session.session_name,
        subsessions:  subsessions.map((sub) => ({ subsession_id: sub.term_id, subsession_name: sub.term_name })),
      });
    }

    return {
      success: true,
      data: { staff: staffMember, teacher_assignments: teacherAssignmentsWithAdmin, assignment_history: assignmentHistory, sessions: validSessions },
      message: "Staff detail retrieved successfully",
    };
  } catch (error) {
    return { success: false, error: "Get staff detail failed", message: error.message || "Failed to retrieve staff detail" };
  }
};

const deleteStaff = async (staffId) => {
  try {
    const staffMember = await Staff.findOne({ staff_id: staffId });
    if (!staffMember) return { success: false, error: "Staff not found", message: "Staff member not found" };

    staffMember.is_active  = false;
    staffMember.updated_at = new Date();
    await staffMember.save();

    await User.updateOne({ user_type: "staff", reference_id: staffId }, { $set: { is_active: false } });

    return { success: true, message: "Staff member deleted successfully" };
  } catch (error) {
    return { success: false, error: "Delete staff failed", message: error.message || "Failed to delete staff member" };
  }
};

module.exports = { createStaff, updateStaff, getStaffById, getStaffDetail, getStaffBySchoolId, deleteStaff };
