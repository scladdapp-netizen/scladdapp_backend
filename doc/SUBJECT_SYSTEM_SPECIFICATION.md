# Subject Management System - Implementation Specification

## Overview

Implement a complete Subject management system following the Class/Headmaster pattern, including backend controllers, routes, and frontend components.

## Backend Implementation

### 1. Data Files Created

- ✅ `backend/data/subjects.json` - Stores subject records
- ✅ `backend/data/teacher_subject_assignments.json` - Stores teacher-subject assignments

### 2. Subject Data Structure

```javascript
{
  subject_id: string (generated: Date.now().toString()),
  subject_name: string,
  subject_code: string,
  class_id: string,
  subject_description: string,
  school_id: string,
  is_active: boolean (default: true),
  created_by: string | null,
  created_at: ISO timestamp,
  updated_at: ISO timestamp
}
```

### 3. Teacher-Subject Assignment Data Structure

```javascript
{
  assignment_id: string (generated: Date.now().toString()),
  subject_id: string,
  teacher_id: string,
  teacher_name: string (fetched from staff),
  teacher_email: string (fetched from staff),
  school_id: string,
  start_date: string (YYYY-MM-DD),
  end_date: string | null,
  is_active: boolean (default: true),
  assigned_by: string | null,
  notes: string | null,
  created_at: ISO timestamp,
  updated_at: ISO timestamp
}
```

### 4. Backend Controllers Needed

#### `backend/controllers/subject.controller.js`

Functions:

- `createSubject(subjectData)` - Create new subject
- `getSubjectById(subjectId)` - Get single subject
- `getSubjectDetail(subjectId)` - Get subject with teacher assignments
- `getSubjectsBySchoolId(schoolId)` - Get all subjects for school
- `updateSubject(subjectId, subjectData)` - Update subject
- `deleteSubject(subjectId)` - Soft delete (set is_active = false)
- `hardDeleteSubject(subjectId)` - Permanently delete

#### `backend/controllers/subject.controller.paginated.js`

Functions:

- `getSubjectsPaginated(schoolId, params)` - Server-side pagination
  - Returns: subjects with teacher name, class name, student count

#### `backend/controllers/teacher_subject.controller.js`

Functions:

- `assignTeacherToSubject(assignmentData)` - Create assignment
- `getTeacherSubjectAssignments(subjectId)` - Get all assignments for subject
- `updateTeacherSubjectAssignment(assignmentId, assignmentData)` - Update assignment
- `deactivateTeacherSubjectAssignment(assignmentId)` - Set is_active = false

### 5. Backend Routes Needed

#### `backend/routes/subject.routes.js`

```javascript
POST   /subject                    - Create subject
GET    /subject/:subjectId/detail  - Get subject with assignments
GET    /subject/:subjectId         - Get subject by ID
GET    /subject/school/:schoolId   - Get subjects by school
PUT    /subject/:subjectId         - Update subject
DELETE /subject/:subjectId         - Soft delete
DELETE /subject/:subjectId/hard    - Hard delete
GET    /subject/school/:schoolId/paginated - Paginated subjects
```

#### `backend/routes/teacher_subject.routes.js`

```javascript
POST   /teacher-subject            - Assign teacher to subject
GET    /teacher-subject/subject/:subjectId - Get assignments for subject
PUT    /teacher-subject/:assignmentId - Update assignment
PATCH  /teacher-subject/:assignmentId/deactivate - Deactivate assignment
```

### 6. Register Routes in `backend/server.js`

```javascript
const subjectRoutes = require("./routes/subject.routes");
const teacherSubjectRoutes = require("./routes/teacher_subject.routes");

app.use("/subject", subjectRoutes);
app.use("/teacher-subject", teacherSubjectRoutes);
```

## Frontend Implementation

### 1. API Hooks Needed

#### `src/api_call/useSubject.js`

Functions:

- `createSubject(subjectData)`
- `getSubjectById(subjectId)`
- `getSubjectsBySchoolId(schoolId)`
- `updateSubject(subjectId, subjectData)`
- `deleteSubject(subjectId)`

#### `src/api_call/useFetchSubjectsPaginated.js`

Functions:

- `getSubjectsPaginated(schoolId, params)`

#### `src/api_call/useFetchSubjectDetail.js`

Functions:

- `fetchSubjectDetail(subjectId)`

### 2. Components to Update/Create

#### `src/pages/AdminSec/AdminPages/SchoolDirectory/Subjects/AddSubjectPanel.jsx` (NEW)

Features:

- Separate component for Add/Edit subject
- Load active teachers on open (SearchableSelect)
- Load active classes on open (SearchableSelect)
- Fields:
  - Subject Name (text)
  - Subject Code (text)
  - Class (SearchableSelect - active classes)
  - Teacher (SearchableSelect - active teachers)
  - Subject Description (textarea)
- On submit:
  - Create subject in subjects.json
  - If teacher selected, create assignment in teacher_subject_assignments.json
- Support edit mode (isEditMode prop)

#### `src/pages/AdminSec/AdminPages/SchoolDirectory/Subjects/Subjects.jsx` (UPDATE)

Changes:

- Replace SmartTable with ServerSmartTable
- Use useFetchSubjectsPaginated hook
- Add Status column
- Update columns: ID, Code, Subject Name, Class, Teacher, Students, Status, Actions
- Use AddSubjectPanel component
- Implement create, update, delete operations

#### Subject Detail Pages (Future)

- SubjectOverview
- SubjectTeachers (manage teacher assignments)
- SubjectStudents
- SubjectResources
- SubjectAssessments

### 3. Form Fields in AddSubjectPanel

**Required Fields:**

- subject_name (text input)
- subject_code (text input)
- class_id (SearchableSelect with active classes)

**Optional Fields:**

- teacher_id (SearchableSelect with active teachers)
- subject_description (textarea)

**Auto-filled:**

- school_id (from params)
- created_by (from user context)
- is_active (default: true)
- created_at (auto-generated)
- updated_at (auto-generated)

### 4. SearchableSelect Data Loading

#### Classes SearchableSelect:

```javascript
// Fetch active classes
const classes = await getClassesBySchoolId(schoolId);
const classOptions = classes
  .filter((c) => c.is_active === true)
  .map((c) => ({
    value: c.class_id,
    label: `${c.class_name} (${c.class_code})`,
  }));
```

#### Teachers SearchableSelect:

```javascript
// Fetch active teachers
const teachers = await getTeachersBySchoolId(schoolId);
const teacherOptions = teachers
  .filter((t) => t.is_active === true && t.staff)
  .map((t) => ({
    value: t.teacher_id,
    label: `${t.staff.full_name} (${t.teacher_code})`,
    email: t.staff.email,
  }));
```

## Implementation Order

1. ✅ Create data files (subjects.json, teacher_subject_assignments.json)
2. ⏳ Create subject.controller.js
3. ⏳ Create subject.controller.paginated.js
4. ⏳ Create teacher_subject.controller.js
5. ⏳ Create subject.routes.js
6. ⏳ Create teacher_subject.routes.js
7. ⏳ Register routes in server.js
8. ⏳ Create useSubject.js hook
9. ⏳ Create useFetchSubjectsPaginated.js hook
10. ⏳ Create AddSubjectPanel.jsx component
11. ⏳ Update Subjects.jsx to use ServerSmartTable
12. ⏳ Test create, read, update, delete operations

## Testing Checklist

### Backend

- [ ] Create subject successfully
- [ ] Create subject with teacher assignment
- [ ] Get subject by ID
- [ ] Get subject detail with assignments
- [ ] Get subjects by school (paginated)
- [ ] Update subject
- [ ] Delete subject (soft delete)
- [ ] Assign teacher to subject
- [ ] Teacher name/email fetched correctly
- [ ] Multiple teacher assignments supported
- [ ] Deactivate teacher assignment

### Frontend

- [ ] Add Subject panel opens
- [ ] Classes load in SearchableSelect
- [ ] Teachers load in SearchableSelect
- [ ] Only active classes/teachers shown
- [ ] Create subject without teacher
- [ ] Create subject with teacher
- [ ] Subject appears in table
- [ ] Status column shows correctly
- [ ] Edit subject works
- [ ] Delete subject works
- [ ] Server-side pagination works
- [ ] Search/filter works

## Notes

- Follow exact same pattern as Class/Headmaster system
- Use camelCase in frontend, snake_case in backend
- Backend handles field name conversion
- Teacher name/email fetched from staff table
- Support multiple teacher assignments per subject
- Only one active assignment per teacher-subject pair
- Soft delete preserves historical data
