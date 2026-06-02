const { readData, writeData } = require("../utils/file");
const { createAdmission } = require("./admission.controller");
const { createGuardian } = require("./guardian.controller");
const { checkStudentLimit } = require("../utils/planLimitCheck");
const Student = require("../models/Student.model");
const StudentClassAssignment = require("../models/StudentClassAssignment.model");
const Session = require("../models/Session.model");
const Subsession = require("../models/Subsession.model");

const studentsFilePath = "./data/students.json";
const usersFilePath = "./data/users.json";
const admissionsFilePath = "./data/admissions.json";

// Create student function
const createStudent = async (studentData) => {
  try {
    console.log("Creating student with data:", studentData);

    // Step 1: Validate required fields
    if (
      !studentData.fullName ||
      !studentData.email ||
      !studentData.dateOfBirth ||
      !studentData.gender ||
      !studentData.school_id
    ) {
      return {
        success: false,
        error: "Missing required fields",
        message:
          "Full name, email, date of birth, gender, and school_id are required",
      };
    }

    // Step 1.5: Check student plan limit
    const studentLimit = await checkStudentLimit(studentData.school_id);
    if (!studentLimit.allowed) {
      return { success: false, error: "Plan limit reached", message: studentLimit.message, limitType: "students" };
    }

    // Step 1.5: Get active session and subsession from server date (if not provided)
    let admissionSession = studentData.admissionSession;
    let admissionTerm = studentData.admissionTerm;

    if (!admissionSession || !admissionTerm) {
      console.log("Admission session/term not provided, calculating from server date...");
      
      const sessionsFilePath = "./data/sessions.json";
      const subsessionsFilePath = "./data/subsessions.json";
      const sessions = readData(sessionsFilePath);
      const subsessions = readData(subsessionsFilePath);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find active session
      const activeSession = sessions.find((s) => {
        if (s.school_id !== studentData.school_id) return false;
        if (s.is_archived === true) return false;

        const startDate = new Date(s.academic_year_start_date);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(s.academic_year_end_date);
        endDate.setHours(0, 0, 0, 0);

        return today >= startDate && today <= endDate;
      });

      if (activeSession) {
        admissionSession = `${activeSession.session_name} (${activeSession.session_code})`;
        console.log("Active session found:", admissionSession);

        // Find active subsession
        const activeSubsession = subsessions.find((sub) => {
          if (sub.session_id !== activeSession.session_id) return false;
          if (sub.is_archived === true) return false;

          const subStartDate = new Date(sub.term_start_date);
          subStartDate.setHours(0, 0, 0, 0);
          
          const subEndDate = new Date(sub.term_end_date);
          subEndDate.setHours(0, 0, 0, 0);

          return today >= subStartDate && today <= subEndDate;
        });

        if (activeSubsession) {
          admissionTerm = activeSubsession.term_name;
          console.log("Active subsession found:", admissionTerm);
        } else {
          console.log("No active subsession found, using default");
          admissionTerm = "Not Assigned";
        }
      } else {
        console.log("No active session found, using defaults");
        admissionSession = "Not Assigned";
        admissionTerm = "Not Assigned";
      }
    }

    // Step 2: Check if student with email already exists (across ALL students in database)
    const students = readData(studentsFilePath);
    const normalizedEmail = studentData.email.toLowerCase().trim();
    const existingStudent = students.find(
      (s) => s.email && s.email.toLowerCase().trim() === normalizedEmail
    );

    if (existingStudent) {
      return {
        success: false,
        error: "Student already exists",
        message: "A student with this email already exists in the system",
      };
    }

    // Step 3: Check if user with email already exists (across ALL users in database)
    const users = readData(usersFilePath);
    const existingUser = users.find(
      (u) => u.email && u.email.toLowerCase().trim() === normalizedEmail
    );

    if (existingUser) {
      return {
        success: false,
        error: "User already exists",
        message: "A user with this email already exists in the system",
      };
    }

    // Step 4: Create new student record (WITHOUT guardian info - stored separately)
    const newStudent = {
      student_id: Date.now().toString(),
      school_id: studentData.school_id,
      admission_number: studentData.admissionNumber || `STU-${Date.now()}`,
      full_name: studentData.fullName,
      email: studentData.email.toLowerCase().trim(),
      phone: studentData.phone || null,
      date_of_birth: studentData.dateOfBirth,
      gender: studentData.gender,

      // Personal Information
      religion: studentData.religion || null,
      nationality: studentData.nationality || null,
      state_of_origin: studentData.stateOfOrigin || null,
      address: studentData.address || null,
      blood_group: studentData.bloodGroup || null,
      genotype: studentData.genotype || null,
      student_photo: studentData.studentPhoto || null,

      // Academic Information
      current_class: studentData.currentClass || null,
      admission_date:
        studentData.admissionDate || new Date().toISOString().split("T")[0],
      student_status: studentData.studentStatus || "active",

      // Emergency Contact
      emergency_contact_name: studentData.emergencyContactName || null,
      emergency_contact_phone: studentData.emergencyContactPhone || null,
      emergency_contact_relationship:
        studentData.emergencyContactRelationship || null,

      // System fields
      is_active: true,
      created_by: studentData.created_by || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Step 5: Save student record to JSON file
    students.push(newStudent);
    writeData(studentsFilePath, students);
    console.log("Student created with ID:", newStudent.student_id);

    // Step 5b: Save student to MongoDB so admission/class-assignment controllers can find it
    await Student.create({
      student_id:                    newStudent.student_id,
      school_id:                     newStudent.school_id,
      admission_number:              newStudent.admission_number,
      full_name:                     newStudent.full_name,
      email:                         newStudent.email,
      phone:                         newStudent.phone,
      date_of_birth:                 newStudent.date_of_birth,
      gender:                        newStudent.gender,
      religion:                      newStudent.religion,
      nationality:                   newStudent.nationality,
      state_of_origin:               newStudent.state_of_origin,
      address:                       newStudent.address,
      blood_group:                   newStudent.blood_group,
      genotype:                      newStudent.genotype,
      student_photo:                 newStudent.student_photo,
      current_class:                 newStudent.current_class,
      admission_date:                newStudent.admission_date,
      student_status:                newStudent.student_status,
      emergency_contact_name:        newStudent.emergency_contact_name,
      emergency_contact_phone:       newStudent.emergency_contact_phone,
      emergency_contact_relationship: newStudent.emergency_contact_relationship,
      is_active:                     true,
      created_by:                    newStudent.created_by,
    });

    // Step 6: User creation is handled in the route (MongoDB + email invite)

    // Step 7: Create guardian records if guardian information is provided
    let guardianResults = [];
    if (studentData.guardians && Array.isArray(studentData.guardians) && studentData.guardians.length > 0) {
      console.log("Step 7: Creating guardian records...");
      
      for (const guardianData of studentData.guardians) {
        if (guardianData.guardianName && guardianData.guardianPhone) {
          const guardianResult = await createGuardian({
            student_id: newStudent.student_id,
            guardian_name: guardianData.guardianName,
            guardian_relationship: guardianData.guardianRelationship || null,
            guardian_phone: guardianData.guardianPhone,
            guardian_email: guardianData.guardianEmail || null,
            guardian_address: guardianData.guardianAddress || null,
            guardian_occupation: guardianData.guardianOccupation || null,
            is_primary: guardianData.isPrimary || false,
            created_by: studentData.created_by || null,
          });

          if (!guardianResult.success) {
            console.error("Failed to create guardian:", guardianResult.message);
          } else {
            console.log(
              "Guardian created with ID:",
              guardianResult.data.guardian_id
            );
            guardianResults.push(guardianResult.data);
          }
        }
      }
    } else if (studentData.guardianName && studentData.guardianPhone) {
      // Fallback for old single guardian format
      console.log("Step 7: Creating single guardian record (legacy format)...");
      const guardianResult = await createGuardian({
        student_id: newStudent.student_id,
        guardian_name: studentData.guardianName,
        guardian_relationship: studentData.guardianRelationship || null,
        guardian_phone: studentData.guardianPhone,
        guardian_email: studentData.guardianEmail || null,
        guardian_address: studentData.guardianAddress || null,
        guardian_occupation: studentData.guardianOccupation || null,
        is_primary: true,
        created_by: studentData.created_by || null,
      });

      if (!guardianResult.success) {
        console.error("Failed to create guardian:", guardianResult.message);
      } else {
        console.log(
          "Guardian created with ID:",
          guardianResult.data.guardian_id
        );
        guardianResults.push(guardianResult.data);
      }
    }

    // Step 8: Create admission record automatically
    const admissionResult = await createAdmission({
      student_id: newStudent.student_id,
      school_id: studentData.school_id,
      admittedDate:
        studentData.admissionDate || new Date().toISOString().split("T")[0],
      admissionClass: studentData.admissionClass || studentData.currentClass || null,
      admissionSession: admissionSession, // Use calculated value
      admissionTerm: admissionTerm, // Use calculated value
      admissionType: studentData.admissionType || "new",
      previousSchool: studentData.previousSchool || null,
      transferCertificate: studentData.transferCertificate || null,
      remarks: studentData.remarks || null,
      created_by: studentData.created_by || null,
    });

    if (!admissionResult.success) {
      console.error("Failed to create admission:", admissionResult.message);
      // Note: Student is already created, but admission failed
      // You may want to handle this differently based on your requirements
    } else {
      console.log(
        "Admission created with ID:",
        admissionResult.data.admission_id
      );
    }

    // Step 9: Create student class assignment if class is provided
    let classAssignmentResult = null;
    if (studentData.admissionClass) {
      console.log("Step 9: Creating student class assignment...");
      const { createAssignment } = require("./student_class_assignment.controller");
      
      // Use provided session info or get active session info
      if (studentData.sessionId) {
        console.log("DEBUG: Using provided session ID:", studentData.sessionId);
        
        classAssignmentResult = await createAssignment({
          student_id: newStudent.student_id,
          school_id: studentData.school_id,
          class_id: studentData.admissionClass,
          session_id: studentData.sessionId,
          session_name: studentData.sessionName || null,
          subsession_id: studentData.subsessionId || null,
          subsession_name: studentData.subsessionName || null,
          assignment_method: "admission",
          assigned_by: studentData.created_by || null,
          assigned_date: studentData.admissionDate || new Date().toISOString().split("T")[0],
          remarks: "Initial class assignment on admission",
        });

        if (!classAssignmentResult.success) {
          console.error("Failed to create class assignment:", classAssignmentResult.message);
        } else {
          console.log(
            "Class assignment created with ID:",
            classAssignmentResult.data.assignment_id
          );
        }
      } else {
        console.log("No session ID provided, skipping class assignment");
      }
    }

    return {
      success: true,
      data: {
        student_id: newStudent.student_id,
        student: newStudent,
        admission_id: admissionResult.success
          ? admissionResult.data.admission_id
          : null,
        admission: admissionResult.success
          ? admissionResult.data.admission
          : null,
        guardian_ids: guardianResults.map(g => g.guardian_id),
        guardians: guardianResults,
        class_assignment_id:
          classAssignmentResult && classAssignmentResult.success
            ? classAssignmentResult.data.assignment_id
            : null,
        class_assignment:
          classAssignmentResult && classAssignmentResult.success
            ? classAssignmentResult.data
            : null,
        message: `Student, admission, ${guardianResults.length} guardian(s), and class assignment created successfully`,
      },
      message: `Student, admission, ${guardianResults.length} guardian(s), and class assignment created successfully`,
    };
  } catch (error) {
    console.error("Create student error:", error);
    console.error("Create student error stack:", error.stack);
    return {
      success: false,
      error: "Create student failed",
      message: error.message || "Failed to create student",
    };
  }
};

// Update student function
const updateStudent = async (studentId, studentData) => {
  try {
    console.log("Updating student with ID:", studentId, "Data:", studentData);

    // Step 1: Get existing student
    const students = readData(studentsFilePath);
    const studentIndex = students.findIndex((s) => s.student_id === studentId);

    if (studentIndex === -1) {
      return {
        success: false,
        error: "Student not found",
        message: "Student not found",
      };
    }

    const existingStudent = students[studentIndex];

    // Step 2: Check if email is being changed and if new email already exists
    if (studentData.email) {
      const newEmail = studentData.email.toLowerCase().trim();
      const existingEmail = existingStudent.email
        ? existingStudent.email.toLowerCase().trim()
        : "";

      if (newEmail !== existingEmail) {
        const emailExists = students.find(
          (s) =>
            s.email &&
            s.email.toLowerCase().trim() === newEmail &&
            s.student_id !== studentId
        );
        if (emailExists) {
          return {
            success: false,
            error: "Email already exists",
            message:
              "Another student with this email already exists in the system",
          };
        }

        // Check if email exists in users table
        const users = readData(usersFilePath);
        const userEmailExists = users.find(
          (u) => u.email && u.email.toLowerCase().trim() === newEmail
        );
        if (userEmailExists && userEmailExists.reference_id !== studentId) {
          return {
            success: false,
            error: "Email already exists",
            message: "A user with this email already exists in the system",
          };
        }
      }
    }

    // Step 3: Update student record
    const updatedStudent = {
      ...existingStudent,
      full_name: studentData.fullName || existingStudent.full_name,
      email: studentData.email
        ? studentData.email.toLowerCase().trim()
        : existingStudent.email,
      phone:
        studentData.phone !== undefined
          ? studentData.phone
          : existingStudent.phone,
      date_of_birth: studentData.dateOfBirth || existingStudent.date_of_birth,
      gender: studentData.gender || existingStudent.gender,

      // Personal Information
      religion:
        studentData.religion !== undefined
          ? studentData.religion
          : existingStudent.religion,
      nationality:
        studentData.nationality !== undefined
          ? studentData.nationality
          : existingStudent.nationality,
      state_of_origin:
        studentData.stateOfOrigin !== undefined
          ? studentData.stateOfOrigin
          : existingStudent.state_of_origin,
      address:
        studentData.address !== undefined
          ? studentData.address
          : existingStudent.address,
      blood_group:
        studentData.bloodGroup !== undefined
          ? studentData.bloodGroup
          : existingStudent.blood_group,
      genotype:
        studentData.genotype !== undefined
          ? studentData.genotype
          : existingStudent.genotype,
      student_photo:
        studentData.studentPhoto !== undefined
          ? studentData.studentPhoto
          : existingStudent.student_photo,

      // Academic Information
      current_class:
        studentData.currentClass !== undefined
          ? studentData.currentClass
          : existingStudent.current_class,
      admission_date:
        studentData.admissionDate || existingStudent.admission_date,
      student_status:
        studentData.studentStatus || existingStudent.student_status,
      admission_number:
        studentData.admissionNumber || existingStudent.admission_number,

      // Emergency Contact
      emergency_contact_name:
        studentData.emergencyContactName !== undefined
          ? studentData.emergencyContactName
          : existingStudent.emergency_contact_name,
      emergency_contact_phone:
        studentData.emergencyContactPhone !== undefined
          ? studentData.emergencyContactPhone
          : existingStudent.emergency_contact_phone,
      emergency_contact_relationship:
        studentData.emergencyContactRelationship !== undefined
          ? studentData.emergencyContactRelationship
          : existingStudent.emergency_contact_relationship,

      // System fields
      updated_at: new Date().toISOString(),
    };

    // Step 4: Save updated student record
    students[studentIndex] = updatedStudent;
    writeData(studentsFilePath, students);
    console.log("Student updated with ID:", studentId);

    // Step 5: Update user record if email or password changed
    const users = readData(usersFilePath);
    const userIndex = users.findIndex(
      (u) => u.user_type === "student" && u.reference_id === studentId
    );

    if (userIndex !== -1) {
      const updatedUser = {
        ...users[userIndex],
        email: studentData.email
          ? studentData.email.toLowerCase().trim()
          : users[userIndex].email,
      };

      // Update password if provided
      if (studentData.password) {
        updatedUser.password = studentData.password; // In production, hash this
      }

      users[userIndex] = updatedUser;
      writeData(usersFilePath, users);
      console.log("User updated for student ID:", studentId);
    } else if (studentData.password) {
      // Create user record if it doesn't exist and password is provided
      const newUser = {
        user_id: (Date.now() + 1).toString(),
        user_type: "student",
        reference_id: studentId,
        email: updatedStudent.email,
        password: studentData.password, // In production, hash this
        is_active: true,
        created_at: new Date().toISOString(),
      };

      users.push(newUser);
      writeData(usersFilePath, users);
      console.log("User created for existing student ID:", studentId);
    }

    return {
      success: true,
      data: {
        student_id: studentId,
        student: updatedStudent,
        message: "Student updated successfully",
      },
      message: "Student updated successfully",
    };
  } catch (error) {
    console.error("Update student error:", error);
    return {
      success: false,
      error: "Update student failed",
      message: error.message || "Failed to update student",
    };
  }
};

// Get student by ID
const getStudentById = async (studentId) => {
  try {
    const students = readData(studentsFilePath);
    const student = students.find((s) => s.student_id === studentId);

    if (!student) {
      return {
        success: false,
        error: "Student not found",
        message: "Student not found",
      };
    }

    return {
      success: true,
      data: student,
      message: "Student retrieved successfully",
    };
  } catch (error) {
    console.error("Get student error:", error);
    return {
      success: false,
      error: "Get student failed",
      message: error.message || "Failed to retrieve student",
    };
  }
};

// Get student detail with admissions, guardians, and class assignments
const getStudentDetail = async (studentId, schoolId) => {
  try {
    console.log("Fetching student detail for ID:", studentId);

    // Step 1: Get student information (MongoDB first, fallback to JSON)
    let student = await Student.findOne({ student_id: studentId }).lean();
    if (!student) {
      const students = readData(studentsFilePath);
      student = students.find((s) => s.student_id === studentId);
    }

    if (!student) {
      return {
        success: false,
        error: "Student not found",
        message: "Student not found",
      };
    }

    // Step 2: Get admission records for this student (MongoDB)
    const Admission = require("../models/Admission.model");
    const Class     = require("../models/Class.model");
    const School    = require("../models/School.model");

    const studentAdmissionsRaw = await Admission.find({ student_id: studentId })
      .sort({ admitted_date: -1 }).lean();

    const admissionsWithClassNames = await Promise.all(studentAdmissionsRaw.map(async (admission) => {
      const [classInfo, schoolInfo] = await Promise.all([
        admission.admission_class ? Class.findOne({ class_id: admission.admission_class }).lean() : null,
        School.findOne({ school_id: admission.school_id }).lean(),
      ]);
      return {
        ...admission,
        admission_class_name: classInfo ? `${classInfo.class_name} ${classInfo.class_section || ""}`.trim() : null,
        school_name: schoolInfo?.school_name || null,
        school_logo: (typeof schoolInfo?.logo_url === "string" && schoolInfo.logo_url.length > 0) ? schoolInfo.logo_url : null,
      };
    }));

    const studentAdmissions = studentAdmissionsRaw;

    // Step 3: Get guardian records for this student (MongoDB)
    const StudentGuardian = require("../models/StudentGuardian.model");
    const studentGuardians = await StudentGuardian.find({ student_id: studentId, is_active: true })
      .sort({ is_primary: -1 }).lean();

    // Step 4: Get class assignments for this student in this school (MongoDB)
    const targetSchoolId = schoolId || student.school_id;

    const studentClassAssignments = await StudentClassAssignment.find({
      student_id: studentId,
      school_id:  targetSchoolId,
    }).sort({ created_at: -1 }).lean();

    // Step 4.5: Get medical records for this student (MongoDB)
    const StudentMedicalRecord = require("../models/StudentMedicalRecord.model");
    const studentMedicalRecords = await StudentMedicalRecord.find({ student_id: studentId, is_active: true })
      .sort({ record_date: -1 }).lean();

    // Step 5: Extract unique sessions from class assignments (MongoDB)
    const studentAdmissionDate = studentAdmissions.length > 0
      ? new Date(studentAdmissions[studentAdmissions.length - 1].admitted_date)
      : null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sessionsMap = new Map();

    for (const assignment of studentClassAssignments) {
      if (!assignment.session_id || sessionsMap.has(assignment.session_id)) continue;

      const session = await Session.findOne({ session_id: assignment.session_id }).lean();
      if (!session) continue;
      if (session.is_archived === true || session.session_status === "archived") continue;

      const sessionStartDate = new Date(session.academic_year_start_date);
      sessionStartDate.setHours(0, 0, 0, 0);
      if (today < sessionStartDate) continue;

      const sessionSubsessions = await Subsession.find({
        session_id: assignment.session_id,
      }).lean();

      const validSubsessions = sessionSubsessions.filter((sub) => {
        const subStart = new Date(sub.term_start_date);
        subStart.setHours(0, 0, 0, 0);
        if (today < subStart) return false;
        if (studentAdmissionDate && studentAdmissionDate > new Date(sub.term_end_date)) return false;
        return true;
      });

      if (validSubsessions.length === 0) continue;

      sessionsMap.set(assignment.session_id, {
        session_id:         assignment.session_id,
        session_name:       assignment.session_name,
        session_start_date: session.academic_year_start_date,
        session_end_date:   session.academic_year_end_date,
        subsessions: validSubsessions.map((sub) => ({
          subsession_id:   sub.term_id,
          subsession_name: sub.term_name,
          term_status:     sub.term_status,
        })),
      });
    }

    // Convert map to array
    const studentSessions = Array.from(sessionsMap.values());

    console.log(
      `Found ${admissionsWithClassNames.length} admissions, ${studentGuardians.length} guardians, ${studentClassAssignments.length} class assignments, ${studentMedicalRecords.length} medical records, and ${studentSessions.length} unique sessions for student`
    );

    return {
      success: true,
      data: {
        student: student,
        admissions: admissionsWithClassNames,
        guardians: studentGuardians,
        class_assignments: studentClassAssignments,
        medical_records: studentMedicalRecords,
        sessions: studentSessions,
      },
      message: "Student detail fetched successfully",
    };
  } catch (error) {
    console.error("Get student detail error:", error);
    return {
      success: false,
      error: "Get student detail failed",
      message: error.message || "Failed to retrieve student detail",
    };
  }
};

// Get all students by school ID (with their admission data)
const getStudentsBySchoolId = async (schoolId) => {
  try {
    console.log("Fetching students for school ID:", schoolId);

    // Step 1: Get all admissions for this school (active and inactive)
    const admissions = readData(admissionsFilePath);
    const schoolAdmissions = admissions.filter((a) => a.school_id === schoolId);

    console.log(`Found ${schoolAdmissions.length} admissions for school`);

    // Step 2: Get all students
    const students = readData(studentsFilePath);

    // Step 3: Join students with their admissions
    const studentsWithAdmissions = schoolAdmissions.map((admission) => {
      // Find the student for this admission
      const student = students.find(
        (s) => s.student_id === admission.student_id
      );

      if (!student) {
        console.warn(
          `Student not found for admission ${admission.admission_id}`
        );
        return null;
      }

      // Combine student data with admission data
      return {
        // Student information
        student_id: student.student_id,
        full_name: student.full_name,
        email: student.email,
        phone: student.phone,
        date_of_birth: student.date_of_birth,
        gender: student.gender,
        student_photo: student.student_photo,

        // Admission information
        admission_id: admission.admission_id,
        admitted_date: admission.admitted_date,
        close_date: admission.close_date,
        admission_class: admission.admission_class,
        admission_session: admission.admission_session,
        admission_term: admission.admission_term,
        active_status: admission.active_status,
        admission_type: admission.admission_type,

        // Status for display
        status: admission.active_status ? "Active" : "Inactive",

        // Additional student info (if needed)
        religion: student.religion,
        nationality: student.nationality,
        blood_group: student.blood_group,
        genotype: student.genotype,
        emergency_contact_name: student.emergency_contact_name,
        emergency_contact_phone: student.emergency_contact_phone,
      };
    });

    // Filter out null entries (students not found)
    const validStudents = studentsWithAdmissions.filter((s) => s !== null);

    console.log(
      `Returning ${validStudents.length} students with admission data`
    );

    return {
      success: true,
      data: validStudents,
      message: "Students retrieved successfully",
    };
  } catch (error) {
    console.error("Get school students error:", error);
    return {
      success: false,
      error: "Get school students failed",
      message: error.message || "Failed to retrieve students",
    };
  }
};

// Delete student (soft delete)
const deleteStudent = async (studentId) => {
  try {
    const students = readData(studentsFilePath);
    const studentIndex = students.findIndex((s) => s.student_id === studentId);

    if (studentIndex === -1) {
      return {
        success: false,
        error: "Student not found",
        message: "Student not found",
      };
    }

    // Soft delete - mark as inactive
    students[studentIndex].is_active = false;
    students[studentIndex].updated_at = new Date().toISOString();
    writeData(studentsFilePath, students);

    // Also deactivate user account
    const users = readData(usersFilePath);
    const userIndex = users.findIndex(
      (u) => u.user_type === "student" && u.reference_id === studentId
    );

    if (userIndex !== -1) {
      users[userIndex].is_active = false;
      writeData(usersFilePath, users);
    }

    return {
      success: true,
      message: "Student deleted successfully",
    };
  } catch (error) {
    console.error("Delete student error:", error);
    return {
      success: false,
      error: "Delete student failed",
      message: error.message || "Failed to delete student",
    };
  }
};

// Update student status
const updateStudentStatus = async (studentId, recordStatus) => {
  try {
    const students = readData(studentsFilePath);
    const studentIndex = students.findIndex((s) => s.student_id === studentId);

    if (studentIndex === -1) {
      return {
        success: false,
        error: "Student not found",
        message: "Student not found",
      };
    }

    students[studentIndex].student_status = recordStatus;
    students[studentIndex].updated_at = new Date().toISOString();
    writeData(studentsFilePath, students);

    return {
      success: true,
      message: "Student status updated successfully",
    };
  } catch (error) {
    console.error("Update student status error:", error);
    return {
      success: false,
      error: "Update student status failed",
      message: error.message || "Failed to update student status",
    };
  }
};

// Enroll existing student (for "Enroll by Key" scenario)
const enrollExistingStudent = async (studentId, enrollmentData) => {
  try {
    console.log(
      "Enrolling existing student with ID:",
      studentId,
      "Data:",
      enrollmentData
    );

    // Step 1: Check if student exists
    const students = readData(studentsFilePath);
    const student = students.find((s) => s.student_id === studentId);

    if (!student) {
      return {
        success: false,
        error: "Student not found",
        message: "Student does not exist in the system",
      };
    }

    // Step 2: Validate required fields for enrollment
    if (!enrollmentData.school_id) {
      return {
        success: false,
        error: "Missing required fields",
        message: "school_id is required for enrollment",
      };
    }

    // Step 3: Check if student already has an active admission in this school
    const admissions = readData(admissionsFilePath);
    const existingActiveAdmission = admissions.find(
      (a) =>
        a.student_id === studentId &&
        a.school_id === enrollmentData.school_id &&
        a.active_status === true
    );

    if (existingActiveAdmission) {
      return {
        success: false,
        error: "Student already enrolled",
        message: `${student.full_name} is already enrolled in this school. The student has an active admission record.`,
        data: {
          student_id: studentId,
          student_name: student.full_name,
          admission_id: existingActiveAdmission.admission_id,
          admitted_date: existingActiveAdmission.admitted_date,
          admission_class: existingActiveAdmission.admission_class,
        },
      };
    }

    // Step 3.5: Get session and subsession info (use provided data or fallback to server date calculation)
    let admissionSession = enrollmentData.admissionSession;
    let admissionTerm = enrollmentData.admissionTerm;
    let sessionId = enrollmentData.sessionId;
    let subsessionId = enrollmentData.subsessionId;

    if (!admissionSession || !admissionTerm) {
      console.log("Admission session/term not provided, calculating from server date...");
      
      const sessionsFilePath = "./data/sessions.json";
      const subsessionsFilePath = "./data/subsessions.json";
      const sessions = readData(sessionsFilePath);
      const subsessions = readData(subsessionsFilePath);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find active session
      const activeSession = sessions.find((s) => {
        if (s.school_id !== enrollmentData.school_id) return false;
        if (s.is_archived === true) return false;

        const startDate = new Date(s.academic_year_start_date);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(s.academic_year_end_date);
        endDate.setHours(0, 0, 0, 0);

        return today >= startDate && today <= endDate;
      });

      if (activeSession) {
        sessionId = activeSession.session_id;
        admissionSession = `${activeSession.session_name} (${activeSession.session_code})`;
        console.log("Active session found:", admissionSession);

        // Find active subsession
        const activeSubsession = subsessions.find((sub) => {
          if (sub.session_id !== activeSession.session_id) return false;
          if (sub.is_archived === true) return false;

          const subStartDate = new Date(sub.term_start_date);
          subStartDate.setHours(0, 0, 0, 0);
          
          const subEndDate = new Date(sub.term_end_date);
          subEndDate.setHours(0, 0, 0, 0);

          return today >= subStartDate && today <= subEndDate;
        });

        if (activeSubsession) {
          subsessionId = activeSubsession.term_id;
          admissionTerm = activeSubsession.term_name;
          console.log("Active subsession found:", admissionTerm);
        } else {
          console.log("No active subsession found, using default");
          admissionTerm = "Not Assigned";
        }
      } else {
        console.log("No active session found, using defaults");
        admissionSession = "Not Assigned";
        admissionTerm = "Not Assigned";
      }
    } else {
      console.log("Using provided session/term:", admissionSession, admissionTerm);
    }

    // Step 4: Create admission record for this student
    const admissionResult = await createAdmission({
      student_id: studentId,
      school_id: enrollmentData.school_id,
      admittedDate:
        enrollmentData.admittedDate || new Date().toISOString().split("T")[0],
      admissionClass: enrollmentData.admissionClass || null,
      admissionSession: admissionSession, // Use calculated value
      admissionTerm: admissionTerm, // Use calculated value
      admissionType: enrollmentData.admissionType || "new",
      previousSchool: enrollmentData.previousSchool || null,
      transferCertificate: enrollmentData.transferCertificate || null,
      remarks: enrollmentData.remarks || null,
      created_by: enrollmentData.created_by || null,
    });

    if (!admissionResult.success) {
      return {
        success: false,
        error: "Enrollment failed",
        message: admissionResult.message || "Failed to create admission record",
      };
    }

    // Step 4.5: Create student class assignment if class is provided
    let classAssignmentResult = null;
    console.log("=== DEBUG: Class Assignment Creation ===");
    console.log("admissionClass provided:", enrollmentData.admissionClass);
    
    if (enrollmentData.admissionClass) {
      console.log("Step 4.5: Creating student class assignment for enrollment...");
      const { createAssignment } = require("./student_class_assignment.controller");
      
      // Use provided session info or get active session info
      if (sessionId) {
        console.log("DEBUG: Using provided session ID:", sessionId);
        
        classAssignmentResult = await createAssignment({
          student_id: studentId,
          school_id: enrollmentData.school_id,
          class_id: enrollmentData.admissionClass,
          session_id: sessionId,
          session_name: enrollmentData.sessionName || null,
          subsession_id: subsessionId || null,
          subsession_name: enrollmentData.subsessionName || null,
          assignment_method: "admission",
          assigned_by: enrollmentData.created_by || null,
          assigned_date: enrollmentData.admittedDate || new Date().toISOString().split("T")[0],
          remarks: "Class assignment on enrollment",
        });

        console.log("DEBUG: createAssignment result:", classAssignmentResult);

        if (!classAssignmentResult.success) {
          console.error("Failed to create class assignment:", classAssignmentResult.message);
        } else {
          console.log(
            "Class assignment created with ID:",
            classAssignmentResult.data.assignment_id
          );
        }
      } else {
        console.log("No session ID available, skipping class assignment");
      }
    } else {
      console.log("DEBUG: No admissionClass provided, skipping class assignment");
    }

    // Step 5: Optionally update student information if provided
    if (enrollmentData.updateStudentInfo) {
      const studentIndex = students.findIndex(
        (s) => s.student_id === studentId
      );

      students[studentIndex] = {
        ...students[studentIndex],
        current_class:
          enrollmentData.admissionClass || students[studentIndex].current_class,
        updated_at: new Date().toISOString(),
      };

      writeData(studentsFilePath, students);
      console.log("Student information updated for ID:", studentId);
    }

    return {
      success: true,
      data: {
        student_id: studentId,
        student: student,
        admission_id: admissionResult.data.admission_id,
        admission: admissionResult.data.admission,
        class_assignment_id:
          classAssignmentResult && classAssignmentResult.success
            ? classAssignmentResult.data.assignment_id
            : null,
        class_assignment:
          classAssignmentResult && classAssignmentResult.success
            ? classAssignmentResult.data
            : null,
      },
      message: "Student enrolled successfully",
    };
  } catch (error) {
    console.error("Enroll existing student error:", error);
    return {
      success: false,
      error: "Enrollment failed",
      message: error.message || "Failed to enroll student",
    };
  }
};

module.exports = {
  createStudent,
  updateStudent,
  getStudentById,
  getStudentDetail,
  getStudentsBySchoolId,
  deleteStudent,
  updateStudentStatus,
  enrollExistingStudent,
};
