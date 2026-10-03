# PRD — SmartAttend: QR-Based College Attendance System

## 1. Product Name

**SmartAttend — QR-Based College Attendance System**

---

## 2. Product Overview

SmartAttend is a web-based attendance management system designed for colleges. Teachers can create temporary QR codes for their classes, and students can scan the QR code using their phones to mark themselves present.

The system reduces manual attendance work, provides students with real-time attendance information, and maintains a centralized digital attendance record.

---

## 3. Problem Statement

Traditional college attendance is often recorded manually using paper registers or spreadsheets. This can:

- Consume valuable classroom time.
- Lead to manual errors.
- Make attendance records difficult to manage.
- Make it inconvenient for students to track their attendance.
- Make it difficult for teachers to quickly analyze attendance data.

SmartAttend aims to provide a simple digital alternative using QR codes.

---

## 4. Goals

### Primary Goals

1. Allow teachers to create attendance sessions.
2. Generate temporary QR codes for attendance.
3. Allow authenticated students to scan QR codes.
4. Automatically record attendance.
5. Prevent duplicate attendance.
6. Allow students to view attendance percentages.
7. Allow teachers to view attendance records.

### Secondary Goals

- Provide attendance history.
- Allow teachers to export attendance data.
- Add QR expiration for basic security.
- Provide a clean, mobile-friendly interface.

---

## 5. Target Users

### Student

Students use the system to:

- Log in.
- Scan attendance QR codes.
- View attendance percentage.
- View attendance history.

### Teacher

Teachers use the system to:

- Log in.
- Manage their subjects.
- Start attendance sessions.
- Display QR codes.
- View students marked present.
- View attendance history.
- Export attendance data.

### Administrator — Optional

An administrator can:

- Add students.
- Add teachers.
- Create subjects.
- Assign teachers to subjects.
- Manage the overall system.

---

## 6. Core User Flow

### Teacher Flow

```text
Teacher Login
      ↓
Teacher Dashboard
      ↓
Select Subject
      ↓
Start Attendance Session
      ↓
Generate Temporary QR
      ↓
Students Scan QR
      ↓
Live Attendance Updates
      ↓
Teacher Ends Session
```

### Student Flow

```text
Student Login
      ↓
Student Dashboard
      ↓
Scan QR
      ↓
QR Verification
      ↓
Attendance Recorded
      ↓
"Attendance Marked Successfully"
      ↓
Attendance Percentage Updated
```

---

## 7. Functional Requirements

### 7.1 Authentication

The system must provide separate authentication for students and teachers.

Requirements:

- Login using email/college credentials.
- Secure authentication.
- Role-based access.
- Students cannot access teacher functionality.
- Teachers cannot modify student attendance directly through the student interface.

### 7.2 Student Dashboard

The dashboard should display:

- Student name.
- Roll number.
- Overall attendance.
- Subject-wise attendance.
- Recent attendance records.
- Scan QR button.

Example:

```text
Welcome, Student

Overall Attendance
82%

DSA              85%
DBMS             78%
COA              91%

[ Scan Attendance QR ]

Recent Attendance
────────────────────────
DSA       03 Oct       Present
DBMS      02 Oct       Present
COA       01 Oct       Absent
```

### 7.3 Teacher Dashboard

The dashboard should display:

- Teacher information.
- Assigned subjects.
- Attendance session controls.
- Attendance history.

Example:

```text
Welcome, Professor

My Subjects

[ DSA ]
[ DBMS ]
[ COA ]

Select DSA

[ Start Attendance ]

Today's Attendance
Present: 42
Absent: 8
```

---

## 8. QR Attendance System

This is the core feature.

When a teacher starts an attendance session, the backend generates a unique temporary token.

Example:

```text
Session ID:
827391

Token:
X7K92AB83

Expires:
11:45 AM
```

The token is converted into a QR code.

The teacher displays the QR code on the classroom projector/screen.

Students scan the QR code.

---

## 9. QR Validation

When a student scans the QR code, the system should verify:

### Check 1 — Is the QR valid?

If expired:

```text
QR Code Expired
```

### Check 2 — Is the student logged in?

If not:

```text
Please log in first.
```

### Check 3 — Is this attendance session active?

If not:

```text
Attendance session is closed.
```

### Check 4 — Has the student already attended?

If yes:

```text
Attendance already recorded.
```

### Check 5 — Record attendance

If all checks pass:

```text
✓ Attendance marked successfully
```

---

## 10. Attendance Data

Each attendance record should contain:

```text
Attendance ID
Student ID
Subject ID
Session ID
Date
Time
Status
```

Example:

```text
Student: Student Name
Subject: DSA
Date: 03/10/2026
Time: 11:42 AM
Status: Present
```

---

## 11. Attendance Calculation

Attendance percentage:

```text
Attendance % =
(Present Classes / Total Classes) × 100
```

Example:

```text
Present = 18
Total = 22

Attendance =
18 / 22 × 100

= 81.8%
```

The student dashboard should automatically update after attendance is recorded.

---

## 12. Database Design

### Students

```text
id
name
roll_no
email
auth_id
```

### Teachers

```text
id
name
email
auth_id
```

### Subjects

```text
id
name
teacher_id
```

### Attendance Sessions

```text
id
subject_id
token
created_at
expires_at
```

### Attendance

```text
id
student_id
subject_id
session_id
date
time
status
```

---

## 13. Technology Stack

### Frontend

**React + Vite**

Used for:

- User interface
- Dashboards
- Login pages
- QR scanner
- Attendance views

### Styling

**Tailwind CSS**

Used for:

- Responsive layouts
- Dashboard UI
- Buttons
- Cards
- Tables

### Backend / Database

**Supabase**

Used for:

- PostgreSQL database
- Authentication
- Database queries
- Row Level Security

### QR Generation

A JavaScript QR-generation library such as:

```text
qrcode
```

### QR Scanning

A browser-based scanner such as:

```text
html5-qrcode
```

### Deployment

**Vercel**

For deploying the React application.

### Version Control

**Git + GitHub**

---

## 14. Security Requirements

The first version should include:

### Temporary QR Codes

QR codes should expire after a short period.

Example:

```text
QR lifetime = 2 minutes
```

### Unique Attendance

A student should only be able to register attendance once for a particular session.

### Authentication

Only authenticated students should be able to mark attendance.

### Role-Based Access

Students should not have access to teacher/admin operations.

### Database Security

Supabase Row Level Security should prevent unauthorized users from accessing or modifying data.

---

## 15. Future Security Features

These are **not required for the MVP**, but can be added later:

- Classroom geolocation verification.
- Rotating QR codes.
- Device verification.
- Suspicious scan detection.
- IP/device-based anomaly detection.
- Teacher approval for attendance corrections.

---

## 16. MVP Scope

The Minimum Viable Product should contain only:

### Student

- Login
- Dashboard
- Scan QR
- Attendance confirmation
- Attendance percentage
- Attendance history

### Teacher

- Login
- Dashboard
- Subject selection
- Generate QR
- View live attendance
- End attendance session

### Backend

- Authentication
- Student database
- Teacher database
- Subjects
- Attendance sessions
- Attendance records
- QR expiration
- Duplicate prevention

---

## 17. Out of Scope for MVP

The first version will NOT include:

- Facial recognition.
- AI attendance detection.
- Biometric authentication.
- Complex admin management.
- Native Android/iOS apps.
- Payment systems.
- Advanced analytics.
- Automated college ERP integration.

These can be considered future improvements.

---

## 18. Success Criteria

The MVP will be considered successful if:

1. A teacher can log in.
2. A teacher can select a subject.
3. A teacher can start an attendance session.
4. A QR code is generated.
5. A student can log in.
6. A student can scan the QR code.
7. The system validates the QR.
8. Attendance is stored in the database.
9. Duplicate attendance is prevented.
10. Student attendance percentage updates correctly.
11. Teacher can see the attendance list.

---

## 19. Development Roadmap

### Phase 1 — Foundation

- Create React project.
- Set up Tailwind.
- Set up GitHub repository.
- Create Supabase project.
- Design database.

### Phase 2 — Authentication

- Student login.
- Teacher login.
- Role-based routing.

### Phase 3 — Dashboards

- Student dashboard.
- Teacher dashboard.
- Subject management.

### Phase 4 — QR System

- Generate attendance session.
- Generate QR.
- Create QR scanner.
- Validate QR.

### Phase 5 — Attendance

- Store attendance.
- Prevent duplicates.
- Calculate percentages.
- Display attendance history.

### Phase 6 — Security & Polish

- QR expiration.
- Row Level Security.
- Error handling.
- Loading states.
- Responsive UI.

### Phase 7 — Deployment

- Push to GitHub.
- Deploy frontend to Vercel.
- Configure production Supabase.
- Test on actual phones.

---

## 20. Final Product Flow

The completed system should allow a real classroom to operate like this:

```text
             TEACHER
                │
                ▼
        Selects "DSA"
                │
                ▼
       Starts Attendance
                │
                ▼
          ┌──────────┐
          │ QR CODE  │
          └──────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
    Student 1       Student 2
      scans            scans
        │               │
        └───────┬───────┘
                ▼
           QR Validation
                │
                ▼
        Attendance Database
                │
          ┌─────┴─────┐
          ▼           ▼
       Teacher      Student
        View        Dashboard
```

**Core principle:** Build the MVP first, then add advanced features. The QR → validation → database → attendance flow is the heart of the project.
