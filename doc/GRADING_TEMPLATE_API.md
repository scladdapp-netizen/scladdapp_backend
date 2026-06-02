# Grading Template API Documentation

## Overview

API endpoints for managing grading templates in the school management system.

## Base URL

```
http://localhost:3000/grading-template
```

## Endpoints

### 1. Create Grading Template

**POST** `/`

Create a new grading template for a school.

**Request Body:**

```json
{
  "school_id": "1771499128899",
  "name": "Standard Grading Scale",
  "description": "Traditional A-F grading system",
  "created_by": "1771420584068",
  "grading_fields": [
    {
      "field_name": "First Test",
      "weight": 20,
      "max_score": "30"
    },
    {
      "field_name": "Final Exam",
      "weight": 80,
      "max_score": "100"
    }
  ],
  "grading_scheme": [
    {
      "grade_letter": "A",
      "min_range": "90",
      "max_range": "100",
      "grade_point": "4.0",
      "pass_fail": "Yes"
    },
    {
      "grade_letter": "F",
      "min_range": "0",
      "max_range": "59",
      "grade_point": "0.0",
      "pass_fail": "No"
    }
  ]
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Grading template created successfully",
  "data": {
    "template_id": "1771234567890",
    "school_id": "1771499128899",
    "name": "Standard Grading Scale",
    "description": "Traditional A-F grading system",
    "status": "active",
    "created_by": "1771420584068",
    "created_at": "2024-01-15T10:30:00.000Z",
    "last_modified": "2024-01-15T10:30:00.000Z",
    "modified_by": "1771420584068",
    "grading_fields": [...],
    "grading_scheme": [...],
    "total_weight": 100
  }
}
```

**Validation Rules:**

- `school_id` is required
- `name` is required and cannot be empty
- At least one grading field is required
- At least one grading scheme entry is required
- Total weight of all grading fields must equal 100%
- Grading scheme ranges must cover 0-100% without overlaps
- For each grade, min_range must be <= max_range

---

### 2. Get All Templates for a School

**GET** `/school/:schoolId`

Retrieve all grading templates for a specific school.

**Parameters:**

- `schoolId` (path) - School ID

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "template_id": "1771234567890",
      "school_id": "1771499128899",
      "name": "Standard Grading Scale",
      "status": "active",
      ...
    }
  ],
  "count": 1
}
```

---

### 3. Get Template by ID

**GET** `/:templateId`

Retrieve a specific grading template by its ID.

**Parameters:**

- `templateId` (path) - Template ID

**Response (200):**

```json
{
  "success": true,
  "data": {
    "template_id": "1771234567890",
    "school_id": "1771499128899",
    "name": "Standard Grading Scale",
    ...
  }
}
```

**Response (404):**

```json
{
  "success": false,
  "message": "Grading template not found"
}
```

---

### 4. Update Grading Template

**PUT** `/:templateId`

Update an existing grading template.

**Parameters:**

- `templateId` (path) - Template ID

**Request Body:**

```json
{
  "name": "Updated Grading Scale",
  "description": "Updated description",
  "status": "active",
  "modified_by": "1771420584068",
  "grading_fields": [...],
  "grading_scheme": [...]
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Grading template updated successfully",
  "data": {
    "template_id": "1771234567890",
    "last_modified": "2024-01-16T10:30:00.000Z",
    ...
  }
}
```

---

### 5. Delete Grading Template

**DELETE** `/:templateId`

Delete a grading template.

**Parameters:**

- `templateId` (path) - Template ID

**Response (200):**

```json
{
  "success": true,
  "message": "Grading template deleted successfully",
  "data": {
    "template_id": "1771234567890",
    ...
  }
}
```

---

### 6. Duplicate Grading Template

**POST** `/:templateId/duplicate`

Create a copy of an existing grading template.

**Parameters:**

- `templateId` (path) - Template ID to duplicate

**Request Body:**

```json
{
  "created_by": "1771420584068"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Grading template duplicated successfully",
  "data": {
    "template_id": "1771234567891",
    "name": "Standard Grading Scale (Copy)",
    "status": "draft",
    ...
  }
}
```

---

### 7. Update Template Status

**PATCH** `/:templateId/status`

Update the status of a grading template (activate/deactivate/archive).

**Parameters:**

- `templateId` (path) - Template ID

**Request Body:**

```json
{
  "status": "active",
  "modified_by": "1771420584068"
}
```

**Valid Status Values:**

- `active` - Template is active and can be used
- `draft` - Template is in draft mode
- `archived` - Template is archived

**Response (200):**

```json
{
  "success": true,
  "message": "Grading template activated successfully",
  "data": {
    "template_id": "1771234567890",
    "status": "active",
    "last_modified": "2024-01-16T10:30:00.000Z",
    ...
  }
}
```

---

## Data Structure

### Grading Template Object

```json
{
  "template_id": "string",
  "school_id": "string",
  "name": "string",
  "description": "string",
  "status": "active|draft|archived",
  "created_by": "string",
  "created_at": "ISO 8601 datetime",
  "last_modified": "ISO 8601 datetime",
  "modified_by": "string",
  "grading_fields": [
    {
      "field_name": "string",
      "weight": number,
      "max_score": "string"
    }
  ],
  "grading_scheme": [
    {
      "grade_letter": "string",
      "min_range": "string",
      "max_range": "string",
      "grade_point": "string",
      "pass_fail": "Yes|No"
    }
  ],
  "total_weight": number
}
```

---

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    "Total weight must equal 100%. Current total: 95%",
    "Overlapping ranges detected: A (90-100) overlaps with B (85-95)"
  ]
}
```

### 404 Not Found

```json
{
  "success": false,
  "message": "Grading template not found"
}
```

### 500 Internal Server Error

```json
{
  "success": false,
  "message": "Failed to create grading template",
  "error": "Error details"
}
```

---

## Usage Examples

### Create a Template

```javascript
const response = await fetch("http://localhost:3000/grading-template", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    school_id: "1771499128899",
    name: "Nigerian Grading System",
    description: "Standard Nigerian university grading",
    created_by: "1771420584068",
    grading_fields: [
      { field_name: "Continuous Assessment", weight: 30, max_score: "30" },
      { field_name: "Final Examination", weight: 70, max_score: "70" },
    ],
    grading_scheme: [
      {
        grade_letter: "A",
        min_range: "70",
        max_range: "100",
        grade_point: "5.0",
        pass_fail: "Yes",
      },
      {
        grade_letter: "F",
        min_range: "0",
        max_range: "39",
        grade_point: "0.0",
        pass_fail: "No",
      },
    ],
  }),
});
```

### Get All Templates for a School

```javascript
const response = await fetch(
  "http://localhost:3000/grading-template/school/1771499128899"
);
const data = await response.json();
```

### Update Template Status

```javascript
const response = await fetch(
  "http://localhost:3000/grading-template/1771234567890/status",
  {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "archived",
      modified_by: "1771420584068",
    }),
  }
);
```
