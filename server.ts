import express, { Request, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import {
  dbManager,
  hashPassword,
  verifyPassword,
  User,
  Student,
  MarkSheet,
  StudentMarkEntry,
  AuditLog,
  InstitutionSettings,
} from './server/db.js';
import {
  authMiddleware,
  AuthenticatedRequest,
  generateSessionToken,
  revokeSessionToken,
  requireAuth,
  requireAdmin,
  requireTeacher,
  requireParent,
} from './server/auth.js';
import {
  generateStudentProgressReport,
  getComponentsForClass,
  getSubjectDisplayName,
  calculateClassRanks,
} from './server/calculations.js';

const app = express();
const PORT = 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(authMiddleware);

/**
 * Helper: Find the elder child of a parent and set the parent's login password
 * to that elder child's admission number.
 * Elder child is defined as highest class (numericGrade desc), then lowest admissionNo.
 */
function updateParentPasswordToElderChild(parent: User) {
  const db = dbManager.getDB();
  const children = db.students.filter(s => s.parentUserId === parent.id);
  if (children.length === 0) return;

  const sortedChildren = [...children].sort((a, b) => {
    const classA = db.classes.find(c => c.id === a.classId)?.numericGrade || 0;
    const classB = db.classes.find(c => c.id === b.classId)?.numericGrade || 0;
    if (classB !== classA) return classB - classA; // higher class first (elder)
    return a.admissionNo.localeCompare(b.admissionNo); // lowest admission number
  });

  const elderChild = sortedChildren[0];
  if (elderChild && elderChild.admissionNo) {
    const pass = elderChild.admissionNo.trim();
    parent.plainPassword = pass;
    parent.passwordHash = hashPassword(pass);
  }
}

// ==========================================
// 1. AUTHENTICATION & USER MANAGEMENT
// ==========================================

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const db = dbManager.getDB();
  const cleanUsername = username.trim().toLowerCase();
  const user = db.users.find(u => u.username.toLowerCase() === cleanUsername);

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  if (!user.active) {
    return res.status(403).json({ error: 'Your account has been deactivated. Please contact the Principal.' });
  }

  if (!verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = generateSessionToken(user.id);
  const { passwordHash, ...safeUser } = user;

  dbManager.logAudit({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'USER_LOGIN',
    recordType: 'user',
    recordId: user.id,
    details: `${user.name} logged into the system.`,
  });

  res.json({
    token,
    user: safeUser,
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const user = req.user!;
  const { passwordHash, ...safeUser } = user;

  let extraData: any = {};
  if (user.role === 'teacher') {
    extraData.assignments = db.teacherAssignments.filter(ta => ta.teacherId === user.id);
  } else if (user.role === 'parent') {
    extraData.children = db.students.filter(s => s.parentUserId === user.id);
  }

  res.json({
    user: safeUser,
    ...extraData,
  });
});

app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    revokeSessionToken(authHeader.substring(7));
  }
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.post('/api/auth/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new passwords are required.' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters.' });
  }

  const db = dbManager.getDB();
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  user.passwordHash = hashPassword(newPassword);
  user.plainPassword = newPassword;
  dbManager.save();

  dbManager.logAudit({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'CHANGE_PASSWORD',
    recordType: 'user',
    recordId: user.id,
    details: 'User updated their account password.',
  });

  res.json({ success: true, message: 'Password changed successfully.' });
});

// Update Admin / User Profile & Credentials (Username & Password)
app.put('/api/auth/profile-credentials', requireAuth, (req: AuthenticatedRequest, res) => {
  const { newUsername, newPassword, name, nameMl } = req.body;
  const db = dbManager.getDB();
  const user = db.users.find(u => u.id === req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (newUsername && newUsername.trim()) {
    const cleanU = newUsername.trim().toLowerCase();
    const existing = db.users.find(u => u.id !== user.id && u.username.toLowerCase() === cleanU);
    if (existing) {
      return res.status(400).json({ error: `Username "${newUsername}" is already taken.` });
    }
    user.username = newUsername.trim();
  }

  if (newPassword && newPassword.trim()) {
    if (newPassword.trim().length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }
    user.plainPassword = newPassword.trim();
    user.passwordHash = hashPassword(newPassword.trim());
  }

  if (name && name.trim()) user.name = name.trim();
  if (nameMl && nameMl.trim()) user.nameMl = nameMl.trim();

  // If admin changed principal name, sync with settings.principalNameEn/Ml
  if (user.role === 'admin') {
    if (name) db.settings.principalNameEn = name.trim();
    if (nameMl) db.settings.principalNameMl = nameMl.trim();
  }

  dbManager.save();

  dbManager.logAudit({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'UPDATE_CREDENTIALS',
    recordType: 'user',
    recordId: user.id,
    details: `${user.role.toUpperCase()} updated login credentials (Username: ${user.username})`,
  });

  const { passwordHash, ...safeUser } = user;
  res.json({ success: true, message: 'Credentials updated successfully.', user: safeUser });
});

// ==========================================
// 2. SETTINGS & INSTITUTION INFO
// ==========================================

app.get('/api/settings', (req, res) => {
  const db = dbManager.getDB();
  res.json(db.settings);
});

app.put('/api/settings', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  db.settings = { ...db.settings, ...req.body };
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: req.user!.role,
    action: 'UPDATE_SETTINGS',
    recordType: 'settings',
    recordId: 'institution_settings',
    details: 'Administrator updated institution details and report format configuration.',
    newValue: req.body,
  });

  res.json({ success: true, settings: db.settings });
});

// ==========================================
// 3. ACADEMIC YEARS & EXAMINATIONS
// ==========================================

app.get('/api/academic-years', (req, res) => {
  const db = dbManager.getDB();
  res.json(db.academicYears);
});

app.post('/api/academic-years', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { year, isCurrent } = req.body;
  if (!year) return res.status(400).json({ error: 'Academic year name is required.' });

  const db = dbManager.getDB();
  if (isCurrent) {
    db.academicYears.forEach(ay => (ay.isCurrent = false));
  }
  const newAy = {
    id: `ay_${Date.now()}`,
    year,
    isCurrent: !!isCurrent,
  };
  db.academicYears.push(newAy);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'CREATE_ACADEMIC_YEAR',
    recordType: 'academic_year',
    recordId: newAy.id,
    details: `Created new academic year: ${year}`,
  });

  res.json(newAy);
});

app.get('/api/examinations', (req, res) => {
  const db = dbManager.getDB();
  res.json(db.examinations);
});

app.post('/api/examinations', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { academicYearId, nameEn, nameMl, startDate, endDate, classesParticipating, passMarkPercentage } = req.body;
  if (!nameEn || !academicYearId) {
    return res.status(400).json({ error: 'Examination name and academic year are required.' });
  }

  const db = dbManager.getDB();
  const newExam = {
    id: `exam_${Date.now()}`,
    academicYearId,
    nameEn,
    nameMl: nameMl || nameEn,
    startDate: startDate || new Date().toISOString().split('T')[0],
    endDate: endDate || new Date().toISOString().split('T')[0],
    isPublished: false,
    status: 'draft' as const,
    classesParticipating: classesParticipating || db.classes.map(c => c.id),
    passMarkPercentage: passMarkPercentage || 35,
  };
  db.examinations.push(newExam);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'CREATE_EXAMINATION',
    recordType: 'examination',
    recordId: newExam.id,
    details: `Created new examination: ${nameEn}`,
  });

  res.json(newExam);
});

app.put('/api/examinations/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const exam = db.examinations.find(e => e.id === req.params.id);
  if (!exam) return res.status(404).json({ error: 'Examination not found.' });

  const prev = { ...exam };
  Object.assign(exam, req.body);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'UPDATE_EXAMINATION',
    recordType: 'examination',
    recordId: exam.id,
    details: `Updated examination settings for ${exam.nameEn}`,
    previousValue: prev,
    newValue: req.body,
  });

  res.json(exam);
});

// Publication readiness checklist
app.get('/api/examinations/:id/readiness', requireAdmin, (req, res) => {
  const db = dbManager.getDB();
  const exam = db.examinations.find(e => e.id === req.params.id);
  if (!exam) return res.status(404).json({ error: 'Examination not found.' });

  const classes = db.classes.filter(c => exam.classesParticipating.includes(c.id));
  const checklist: any[] = [];
  let totalRequiredSheets = 0;
  let totalSubmitted = 0;
  let totalApproved = 0;
  let totalLocked = 0;

  classes.forEach(cls => {
    const applicableSubjects = db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));
    applicableSubjects.forEach(sub => {
      totalRequiredSheets++;
      const ms = db.markSheets.find(m => m.examinationId === exam.id && m.classId === cls.id && m.subjectId === sub.id);
      const assignment = db.teacherAssignments.find(ta => ta.classId === cls.id && ta.subjectId === sub.id);
      const teacher = assignment ? db.users.find(u => u.id === assignment.teacherId) : null;

      const status = ms?.status || 'not_started';
      if (status === 'submitted') totalSubmitted++;
      if (status === 'approved') totalApproved++;
      if (status === 'locked') totalLocked++;

      const subName = sub.id === 'sub_history_buhuth' && cls.numericGrade === 9 ? 'ബുഹൂസ്' : (sub.nameMl || sub.nameEn);

      checklist.push({
        classId: cls.id,
        className: cls.name,
        subjectId: sub.id,
        subjectName: subName,
        teacherName: teacher ? teacher.name : 'Unassigned',
        status,
        isReady: status === 'approved' || status === 'locked',
      });
    });
  });

  const allApprovedOrLocked = checklist.length > 0 && checklist.every(item => item.isReady);
  const unassignedCount = checklist.filter(item => item.teacherName === 'Unassigned').length;

  res.json({
    examination: exam,
    totalRequiredSheets,
    totalSubmitted,
    totalApproved,
    totalLocked,
    unassignedCount,
    allApprovedOrLocked,
    items: checklist,
  });
});

// Result publication toggle / schedule / revoke
app.post('/api/examinations/:id/publish', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { action, scheduledPublishDate } = req.body;
  const db = dbManager.getDB();
  const exam = db.examinations.find(e => e.id === req.params.id);
  if (!exam) return res.status(404).json({ error: 'Examination not found.' });

  if (action === 'publish_now') {
    exam.isPublished = true;
    exam.publishedAt = new Date().toISOString();
    exam.scheduledPublishDate = undefined;
    exam.status = 'published';

    dbManager.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      userRole: 'admin',
      action: 'PUBLISH_EXAMINATION_RESULTS',
      recordType: 'examination',
      recordId: exam.id,
      details: `Published results immediately for ${exam.nameEn}. Parents can now view reports.`,
    });
  } else if (action === 'schedule') {
    if (!scheduledPublishDate) {
      return res.status(400).json({ error: 'Scheduled publish date & time is required.' });
    }
    exam.scheduledPublishDate = scheduledPublishDate;
    exam.isPublished = new Date(scheduledPublishDate) <= new Date();
    if (exam.isPublished) {
      exam.publishedAt = new Date().toISOString();
      exam.status = 'published';
    } else {
      exam.status = 'ready_to_publish';
    }

    dbManager.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      userRole: 'admin',
      action: 'SCHEDULE_PUBLISH_RESULTS',
      recordType: 'examination',
      recordId: exam.id,
      details: `Scheduled result publication for ${exam.nameEn} on ${scheduledPublishDate}`,
    });
  } else if (action === 'revoke') {
    exam.isPublished = false;
    exam.publishedAt = undefined;
    exam.scheduledPublishDate = undefined;
    exam.status = 'evaluating';

    dbManager.logAudit({
      userId: req.user!.id,
      userName: req.user!.name,
      userRole: 'admin',
      action: 'REVOKE_PUBLISHED_RESULTS',
      recordType: 'examination',
      recordId: exam.id,
      details: `Revoked publication of results for ${exam.nameEn}. Parent access disabled.`,
    });
  }

  dbManager.save();
  res.json({ success: true, examination: exam });
});

// ==========================================
// 4. CLASSES & SUBJECTS CONFIGURATION
// ==========================================

app.get('/api/classes', (req, res) => {
  const db = dbManager.getDB();
  res.json(db.classes);
});

app.post('/api/classes', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { name, nameMl, numericGrade, division } = req.body;
  if (!name || !numericGrade) return res.status(400).json({ error: 'Class name and numeric grade are required.' });

  const db = dbManager.getDB();
  const newClass = {
    id: `cls_${numericGrade}_${Date.now()}`,
    name,
    nameMl: nameMl || name,
    numericGrade: Number(numericGrade),
    division,
    active: true,
  };
  db.classes.push(newClass);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'CREATE_CLASS',
    recordType: 'class',
    recordId: newClass.id,
    details: `Added new class: ${name}`,
  });

  res.json(newClass);
});

app.get('/api/subjects', (req, res) => {
  const db = dbManager.getDB();
  res.json(db.subjects);
});

app.put('/api/subjects/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const sub = db.subjects.find(s => s.id === req.params.id);
  if (!sub) return res.status(404).json({ error: 'Subject not found.' });

  Object.assign(sub, req.body);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'UPDATE_SUBJECT',
    recordType: 'subject',
    recordId: sub.id,
    details: `Updated subject configuration for ${sub.nameMl || sub.nameEn}`,
  });

  res.json(sub);
});

// ==========================================
// 5. STUDENT MANAGEMENT & CSV IMPORT/EXPORT
// ==========================================

app.get('/api/students', (req, res) => {
  const db = dbManager.getDB();
  const { classId, search, parentUserId } = req.query;

  let list = db.students;
  if (classId) {
    list = list.filter(s => s.classId === classId);
  }
  if (parentUserId) {
    list = list.filter(s => s.parentUserId === parentUserId);
  }
  if (search) {
    const q = String(search).toLowerCase();
    list = list.filter(s =>
      s.nameEn.toLowerCase().includes(q) ||
      s.nameMl.includes(q) ||
      s.admissionNo.toLowerCase().includes(q) ||
      String(s.rollNo).includes(q)
    );
  }
  res.json(list);
});

app.post('/api/students', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { admissionNo, rollNo, nameEn, nameMl, classId, parentNameEn, parentNameMl, parentPhone, parentUserId, gender } = req.body;
  if (!admissionNo || !nameEn || !classId) {
    return res.status(400).json({ error: 'Admission No, Student Name, and Class are required.' });
  }

  const db = dbManager.getDB();
  if (db.students.some(s => s.admissionNo.toLowerCase() === admissionNo.trim().toLowerCase())) {
    return res.status(400).json({ error: `A student with Admission No "${admissionNo}" already exists.` });
  }

  // Automatic parent account creation / update:
  // Parent Name is the Username, and student Admission No is the Password
  let assignedParentId = parentUserId;
  const pName = (parentNameEn || '').trim();

  if (!assignedParentId && pName) {
    let parentUser = db.users.find(u =>
      u.role === 'parent' &&
      (u.username.toLowerCase() === pName.toLowerCase() || u.name.toLowerCase() === pName.toLowerCase())
    );
    if (!parentUser) {
      parentUser = {
        id: `usr_prnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        username: pName,
        name: pName,
        nameMl: parentNameMl || pName,
        role: 'parent',
        passwordHash: hashPassword(admissionNo.trim()),
        plainPassword: admissionNo.trim(),
        active: true,
        phone: parentPhone || '',
        createdAt: new Date().toISOString(),
      };
      db.users.push(parentUser);
    }
    assignedParentId = parentUser.id;
  }

  const newStudent: Student = {
    id: `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    admissionNo: admissionNo.trim(),
    rollNo: Number(rollNo) || (db.students.filter(s => s.classId === classId).length + 1),
    nameEn: nameEn.trim(),
    nameMl: nameMl ? nameMl.trim() : nameEn.trim(),
    classId,
    academicYearId: db.settings.activeAcademicYearId || 'ay_2026_2027',
    parentNameEn: parentNameEn || '',
    parentNameMl: parentNameMl || parentNameEn || '',
    parentPhone: parentPhone || '',
    parentUserId: assignedParentId || undefined,
    status: 'active',
    gender: gender || 'M',
  };

  db.students.push(newStudent);

  // If assigned to a parent, update parent's password to elder child's admission number
  if (assignedParentId) {
    const parent = db.users.find(u => u.id === assignedParentId);
    if (parent) {
      updateParentPasswordToElderChild(parent);
    }
  }

  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'CREATE_STUDENT',
    recordType: 'student',
    recordId: newStudent.id,
    details: `Added student ${newStudent.nameEn} (Adm: ${newStudent.admissionNo}) to class`,
  });

  res.json(newStudent);
});

app.put('/api/students/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const student = db.students.find(s => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const prev = { ...student };
  Object.assign(student, req.body);

  if (student.parentUserId) {
    const parent = db.users.find(u => u.id === student.parentUserId);
    if (parent) {
      updateParentPasswordToElderChild(parent);
    }
  }

  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'UPDATE_STUDENT',
    recordType: 'student',
    recordId: student.id,
    details: `Updated details of student ${student.nameEn}`,
    previousValue: prev,
    newValue: req.body,
  });

  res.json(student);
});

// CSV Import Preview & Commit with automatic Parent Account Generation
app.post('/api/students/import-preview', requireAdmin, (req, res) => {
  const { csvText, targetClassId } = req.body;
  if (!csvText || !targetClassId) {
    return res.status(400).json({ error: 'CSV data and target class are required.' });
  }

  const db = dbManager.getDB();
  const lines = csvText.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
  if (lines.length < 2) {
    return res.status(400).json({ error: 'CSV must contain at least a header and 1 student record.' });
  }

  const headers = lines[0].split(',').map((h: string) => h.trim().toLowerCase().replace(/['"]/g, ''));
  const parsedRecords: any[] = [];
  const errors: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(',').map((c: string) => c.trim().replace(/^["']|["']$/g, ''));
    if (rawCols.length < 2) continue;

    const rowObj: any = {};
    headers.forEach((h: string, idx: number) => {
      rowObj[h] = rawCols[idx] || '';
    });

    const admissionNo = rowObj['admission_no'] || rowObj['admissionno'] || rowObj['adm_no'] || rowObj['admission'];
    const nameEn = rowObj['student_name'] || rowObj['name'] || rowObj['name_en'] || rowObj['student'];
    const nameMl = rowObj['name_ml'] || rowObj['malayalam_name'] || nameEn;
    const rollNo = parseInt(rowObj['roll_no'] || rowObj['rollno'] || rowObj['roll']) || i;
    const parentName = rowObj['parent_name'] || rowObj['guardian_name'] || rowObj['parent'] || '';
    const parentPhone = rowObj['phone'] || rowObj['mobile'] || rowObj['contact'] || '';

    const rowErrors: string[] = [];
    if (!admissionNo) rowErrors.push('Missing Admission Number');
    if (!nameEn) rowErrors.push('Missing Student Name');

    if (admissionNo && db.students.some(s => s.admissionNo.toLowerCase() === admissionNo.toLowerCase())) {
      rowErrors.push(`Admission No "${admissionNo}" already exists in system.`);
    }

    const record = {
      rowNumber: i,
      admissionNo: admissionNo || '',
      rollNo,
      nameEn: nameEn || '',
      nameMl: nameMl || '',
      parentNameEn: parentName,
      parentPhone,
      isValid: rowErrors.length === 0,
      errors: rowErrors,
    };

    parsedRecords.push(record);
    if (rowErrors.length > 0) {
      errors.push({ row: i, errors: rowErrors });
    }
  }

  res.json({
    totalRows: parsedRecords.length,
    validRows: parsedRecords.filter(r => r.isValid).length,
    errorRows: errors.length,
    records: parsedRecords,
  });
});

app.post('/api/students/import-commit', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { records, targetClassId } = req.body;
  if (!records || !Array.isArray(records) || !targetClassId) {
    return res.status(400).json({ error: 'Valid records and target class are required.' });
  }

  const db = dbManager.getDB();
  const cls = db.classes.find(c => c.id === targetClassId);
  let importedCount = 0;
  const affectedParentUsers = new Set<User>();

  records.forEach((r: any) => {
    if (r.isValid && r.admissionNo && r.nameEn) {
      const admNo = r.admissionNo.trim();
      const pName = (r.parentNameEn || '').trim();
      let parentUserId: string | undefined;

      // Automatically create or link Parent account
      // Parent Name is the Username, and student Admission Number is Password
      if (pName) {
        let parentUser = db.users.find(u =>
          u.role === 'parent' &&
          (u.username.toLowerCase() === pName.toLowerCase() || u.name.toLowerCase() === pName.toLowerCase())
        );
        if (!parentUser) {
          parentUser = {
            id: `usr_prnt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            username: pName,
            name: pName,
            nameMl: pName,
            role: 'parent',
            passwordHash: hashPassword(admNo),
            plainPassword: admNo,
            active: true,
            phone: r.parentPhone || '',
            createdAt: new Date().toISOString(),
          };
          db.users.push(parentUser);
        }
        parentUserId = parentUser.id;
        affectedParentUsers.add(parentUser);
      }

      const newStd: Student = {
        id: `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        admissionNo: admNo,
        rollNo: Number(r.rollNo) || 1,
        nameEn: r.nameEn.trim(),
        nameMl: r.nameMl ? r.nameMl.trim() : r.nameEn.trim(),
        classId: targetClassId,
        academicYearId: db.settings.activeAcademicYearId || 'ay_2026_2027',
        parentNameEn: pName,
        parentNameMl: pName,
        parentPhone: r.parentPhone || '',
        parentUserId,
        status: 'active',
      };
      db.students.push(newStd);
      importedCount++;
    }
  });

  // Re-evaluate elder child admission number password for each affected parent
  affectedParentUsers.forEach(parent => {
    updateParentPasswordToElderChild(parent);
  });

  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'CSV_IMPORT_STUDENTS',
    recordType: 'student',
    recordId: targetClassId,
    details: `Imported ${importedCount} students via CSV to ${cls?.name || targetClassId}. Created/updated parent login accounts with student admission numbers as passwords.`,
  });

  res.json({ success: true, importedCount });
});

// CSV Export
app.get('/api/students/export-csv', requireAdmin, (req, res) => {
  const { classId } = req.query;
  const db = dbManager.getDB();
  let list = db.students;
  if (classId) {
    list = list.filter(s => s.classId === classId);
  }

  const header = 'Admission No,Roll No,Student Name (EN),Student Name (ML),Class,Parent Name,Parent Phone\n';
  const rows = list.map(s => {
    const cls = db.classes.find(c => c.id === s.classId)?.name || '';
    return `"${s.admissionNo}",${s.rollNo},"${s.nameEn}","${s.nameMl}","${cls}","${s.parentNameEn}","${s.parentPhone}"`;
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="students_list.csv"');
  res.send(header + rows);
});

// ==========================================
// 6. TEACHER MANAGEMENT & ASSIGNMENTS
// ==========================================

app.get('/api/teachers', requireAdmin, (req, res) => {
  const db = dbManager.getDB();
  const teachers = db.users.filter(u => u.role === 'teacher').map(u => {
    const { passwordHash, ...safe } = u;
    const assignments = db.teacherAssignments.filter(ta => ta.teacherId === u.id);
    return {
      ...safe,
      plainPassword: u.plainPassword || '—',
      assignments,
    };
  });
  res.json(teachers);
});

app.post('/api/teachers', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { name, nameMl, username, password, email, phone } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Teacher Name, Username, and Password are required.' });
  }

  const db = dbManager.getDB();
  if (db.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Username already taken.' });
  }

  const newTeacher: User = {
    id: `usr_tch_${Date.now()}`,
    username: username.trim(),
    name: name.trim(),
    nameMl: nameMl ? nameMl.trim() : name.trim(),
    role: 'teacher',
    passwordHash: hashPassword(password.trim()),
    plainPassword: password.trim(),
    active: true,
    email: email || '',
    phone: phone || '',
    createdAt: new Date().toISOString(),
  };

  db.users.push(newTeacher);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'CREATE_TEACHER',
    recordType: 'user',
    recordId: newTeacher.id,
    details: `Created teacher account for ${newTeacher.name} (Username: ${newTeacher.username})`,
  });

  const { passwordHash, ...safe } = newTeacher;
  res.json(safe);
});

app.put('/api/teachers/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const teacher = db.users.find(u => u.id === req.params.id && u.role === 'teacher');
  if (!teacher) return res.status(404).json({ error: 'Teacher not found.' });

  const { name, nameMl, username, phone, plainPassword } = req.body;
  if (name) teacher.name = name.trim();
  if (nameMl) teacher.nameMl = nameMl.trim();
  if (username) teacher.username = username.trim();
  if (phone !== undefined) teacher.phone = phone;
  if (plainPassword) {
    teacher.plainPassword = plainPassword.trim();
    teacher.passwordHash = hashPassword(plainPassword.trim());
  }

  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'UPDATE_TEACHER',
    recordType: 'user',
    recordId: teacher.id,
    details: `Updated teacher account for ${teacher.name}`,
  });

  const { passwordHash, ...safe } = teacher;
  res.json({ success: true, teacher: safe });
});

app.delete('/api/teachers/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const index = db.users.findIndex(u => u.id === req.params.id && u.role === 'teacher');
  if (index === -1) return res.status(404).json({ error: 'Teacher not found.' });

  const teacherName = db.users[index].name;
  db.teacherAssignments = db.teacherAssignments.filter(ta => ta.teacherId !== req.params.id);
  db.users.splice(index, 1);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'DELETE_TEACHER',
    recordType: 'user',
    recordId: req.params.id,
    details: `Deleted teacher account ${teacherName} and removed assignments.`,
  });

  res.json({ success: true, message: 'Teacher deleted successfully.' });
});

app.get('/api/teacher-assignments', (req, res) => {
  const db = dbManager.getDB();
  res.json(db.teacherAssignments);
});

app.post('/api/teacher-assignments', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { teacherId, classId, subjectId } = req.body;
  if (!teacherId || !classId || !subjectId) {
    return res.status(400).json({ error: 'Teacher, Class, and Subject are required.' });
  }

  const db = dbManager.getDB();
  db.teacherAssignments = db.teacherAssignments.filter(ta => !(ta.classId === classId && ta.subjectId === subjectId));

  const newAssignment = {
    id: `ta_${Date.now()}`,
    teacherId,
    classId,
    subjectId,
  };
  db.teacherAssignments.push(newAssignment);
  dbManager.save();

  const teacher = db.users.find(u => u.id === teacherId);
  const cls = db.classes.find(c => c.id === classId);
  const sub = db.subjects.find(s => s.id === subjectId);

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'ASSIGN_TEACHER',
    recordType: 'teacher_assignment',
    recordId: newAssignment.id,
    details: `Assigned ${teacher?.name} to ${cls?.name} - ${sub?.nameMl || sub?.nameEn}`,
  });

  res.json(newAssignment);
});

app.delete('/api/teacher-assignments/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  db.teacherAssignments = db.teacherAssignments.filter(ta => ta.id !== req.params.id);
  dbManager.save();
  res.json({ success: true });
});

// ==========================================
// 7. PARENT MANAGEMENT & CHILD LINKING
// ==========================================

app.get('/api/parents', requireAdmin, (req, res) => {
  const db = dbManager.getDB();
  const parents = db.users.filter(u => u.role === 'parent').map(u => {
    const { passwordHash, ...safe } = u;
    const children = db.students.filter(s => s.parentUserId === u.id);
    return {
      ...safe,
      plainPassword: u.plainPassword || '—',
      children,
    };
  });
  res.json(parents);
});

app.post('/api/parents', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { name, nameMl, username, password, phone, studentIds } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, Username, and Password are required.' });
  }

  const db = dbManager.getDB();
  if (db.users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Username already taken.' });
  }

  const newParent: User = {
    id: `usr_prnt_${Date.now()}`,
    username: username.trim(),
    name: name.trim(),
    nameMl: nameMl ? nameMl.trim() : name.trim(),
    role: 'parent',
    passwordHash: hashPassword(password.trim()),
    plainPassword: password.trim(),
    active: true,
    phone: phone || '',
    createdAt: new Date().toISOString(),
  };

  db.users.push(newParent);

  if (Array.isArray(studentIds)) {
    studentIds.forEach(sId => {
      const std = db.students.find(s => s.id === sId);
      if (std) {
        std.parentUserId = newParent.id;
      }
    });
  }

  updateParentPasswordToElderChild(newParent);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'CREATE_PARENT_ACCOUNT',
    recordType: 'user',
    recordId: newParent.id,
    details: `Created parent account for ${newParent.name} with ${studentIds?.length || 0} linked children`,
  });

  const { passwordHash, ...safe } = newParent;
  res.json(safe);
});

app.put('/api/parents/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const parent = db.users.find(u => u.id === req.params.id && u.role === 'parent');
  if (!parent) return res.status(404).json({ error: 'Parent not found.' });

  const { name, nameMl, username, phone, plainPassword } = req.body;
  if (name) parent.name = name.trim();
  if (nameMl) parent.nameMl = nameMl.trim();
  if (username) parent.username = username.trim();
  if (phone !== undefined) parent.phone = phone;
  if (plainPassword) {
    parent.plainPassword = plainPassword.trim();
    parent.passwordHash = hashPassword(plainPassword.trim());
  }

  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'UPDATE_PARENT_ACCOUNT',
    recordType: 'user',
    recordId: parent.id,
    details: `Updated parent account ${parent.name}`,
  });

  const { passwordHash, ...safe } = parent;
  res.json({ success: true, parent: safe });
});

app.delete('/api/parents/:id', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const index = db.users.findIndex(u => u.id === req.params.id && u.role === 'parent');
  if (index === -1) return res.status(404).json({ error: 'Parent not found.' });

  const parentName = db.users[index].name;

  // Unlink children
  db.students.forEach(s => {
    if (s.parentUserId === req.params.id) {
      s.parentUserId = undefined;
    }
  });

  db.users.splice(index, 1);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'DELETE_PARENT_ACCOUNT',
    recordType: 'user',
    recordId: req.params.id,
    details: `Deleted parent account ${parentName}. Linked children unlinked.`,
  });

  res.json({ success: true, message: 'Parent account deleted successfully.' });
});

// Link child to parent - automatically updates parent password to elder child's admission number!
app.post('/api/parents/:id/link-student', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { studentId } = req.body;
  const db = dbManager.getDB();
  const parent = db.users.find(u => u.id === req.params.id && u.role === 'parent');
  const student = db.students.find(s => s.id === studentId);

  if (!parent || !student) {
    return res.status(404).json({ error: 'Parent or Student not found.' });
  }

  student.parentUserId = parent.id;
  updateParentPasswordToElderChild(parent);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'LINK_PARENT_STUDENT',
    recordType: 'student',
    recordId: student.id,
    details: `Linked child ${student.nameEn} to parent ${parent.name}. Password updated to elder child admission number (${parent.plainPassword}).`,
  });

  res.json({ success: true, student, parentPassword: parent.plainPassword });
});

// Link multiple children to parent - automatically updates parent password to elder child's admission number!
app.post('/api/parents/:id/link-students', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { studentIds } = req.body;
  const db = dbManager.getDB();
  const parent = db.users.find(u => u.id === req.params.id && u.role === 'parent');

  if (!parent) {
    return res.status(404).json({ error: 'Parent not found.' });
  }

  if (Array.isArray(studentIds)) {
    studentIds.forEach((sId: string) => {
      const student = db.students.find(s => s.id === sId);
      if (student) {
        student.parentUserId = parent.id;
      }
    });
  }

  updateParentPasswordToElderChild(parent);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'LINK_PARENT_MULTIPLE_STUDENTS',
    recordType: 'parent',
    recordId: parent.id,
    details: `Linked multiple children to parent ${parent.name}. Password updated to elder child admission number (${parent.plainPassword}).`,
  });

  const children = db.students.filter(s => s.parentUserId === parent.id);
  res.json({ success: true, children, parentPassword: parent.plainPassword });
});

// Admin direct reset / edit password for any Teacher or Parent
app.put('/api/users/:id/password', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.trim().length < 3) {
    return res.status(400).json({ error: 'Password must be at least 3 characters.' });
  }

  const db = dbManager.getDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User account not found.' });

  const pass = newPassword.trim();
  user.plainPassword = pass;
  user.passwordHash = hashPassword(pass);
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'ADMIN_RESET_PASSWORD',
    recordType: 'user',
    recordId: user.id,
    details: `Admin updated login password for ${user.role} ${user.name} (@${user.username})`,
  });

  res.json({ success: true, message: 'Password successfully updated.', plainPassword: user.plainPassword });
});

// Unlink child from parent
app.post('/api/parents/:id/unlink-student', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { studentId } = req.body;
  const db = dbManager.getDB();
  const parent = db.users.find(u => u.id === req.params.id && u.role === 'parent');
  const student = db.students.find(s => s.id === studentId);

  if (!parent || !student) {
    return res.status(404).json({ error: 'Parent or Student not found.' });
  }

  student.parentUserId = undefined;
  updateParentPasswordToElderChild(parent);
  dbManager.save();

  res.json({ success: true, student, parentPassword: parent.plainPassword });
});

// ==========================================
// 8. MARK ENTRY & VERIFICATION WORKFLOW
// ==========================================

app.get('/api/mark-sheets', requireAuth, (req: AuthenticatedRequest, res) => {
  const { examinationId, classId, subjectId } = req.query;
  const user = req.user!;
  const db = dbManager.getDB();

  if (user.role === 'teacher') {
    const isAssigned = db.teacherAssignments.some(ta =>
      ta.teacherId === user.id &&
      (!classId || ta.classId === classId) &&
      (!subjectId || ta.subjectId === subjectId)
    );
    if (!isAssigned) {
      return res.status(403).json({ error: 'Access denied: You are not assigned to this class/subject.' });
    }
  }

  let list = db.markSheets;
  if (examinationId) list = list.filter(ms => ms.examinationId === examinationId);
  if (classId) list = list.filter(ms => ms.classId === classId);
  if (subjectId) list = list.filter(ms => ms.subjectId === subjectId);

  res.json(list);
});

app.get('/api/mark-sheet-detail', requireAuth, (req: AuthenticatedRequest, res) => {
  const { examinationId, classId, subjectId } = req.query;
  const user = req.user!;
  const db = dbManager.getDB();

  if (!examinationId || !classId || !subjectId) {
    return res.status(400).json({ error: 'examinationId, classId, and subjectId are required.' });
  }

  const cls = db.classes.find(c => c.id === classId);
  const sub = db.subjects.find(s => s.id === subjectId);
  const exam = db.examinations.find(e => e.id === examinationId);

  if (!cls || !sub || !exam) {
    return res.status(404).json({ error: 'Class, Subject, or Examination not found.' });
  }

  if (user.role === 'teacher') {
    const isAssigned = db.teacherAssignments.some(ta => ta.teacherId === user.id && ta.classId === classId && ta.subjectId === subjectId);
    if (!isAssigned) {
      return res.status(403).json({ error: 'Access denied: You are not assigned to this subject in this class.' });
    }
  }

  const students = db.students.filter(s => s.classId === classId && s.status === 'active')
    .sort((a, b) => a.rollNo - b.rollNo);

  const components = getComponentsForClass(sub, cls.numericGrade);
  const displayName = getSubjectDisplayName(sub, cls.numericGrade);

  let markSheet = db.markSheets.find(ms =>
    ms.examinationId === examinationId &&
    ms.classId === classId &&
    ms.subjectId === subjectId
  );

  if (!markSheet) {
    const assignment = db.teacherAssignments.find(ta => ta.classId === classId && ta.subjectId === subjectId);
    markSheet = {
      id: `ms_${classId}_${subjectId}_${examinationId}`,
      examinationId: String(examinationId),
      academicYearId: exam.academicYearId,
      classId: String(classId),
      subjectId: String(subjectId),
      assignedTeacherId: assignment?.teacherId || user.id,
      status: 'not_started',
      studentMarks: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  res.json({
    markSheet,
    class: cls,
    subject: {
      ...sub,
      displayNameEn: displayName.nameEn,
      displayNameMl: displayName.nameMl,
    },
    examination: exam,
    components,
    students,
  });
});

app.post('/api/mark-sheets/save-draft', requireTeacher, (req: AuthenticatedRequest, res) => {
  const { examinationId, classId, subjectId, studentMarks } = req.body;
  const user = req.user!;
  const db = dbManager.getDB();

  if (!examinationId || !classId || !subjectId) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  if (user.role === 'teacher') {
    const isAssigned = db.teacherAssignments.some(ta => ta.teacherId === user.id && ta.classId === classId && ta.subjectId === subjectId);
    if (!isAssigned) {
      return res.status(403).json({ error: 'You are not assigned to this class and subject.' });
    }
  }

  let markSheet = db.markSheets.find(ms =>
    ms.examinationId === examinationId &&
    ms.classId === classId &&
    ms.subjectId === subjectId
  );

  if (markSheet && (markSheet.status === 'locked' || markSheet.status === 'approved')) {
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'This mark sheet is locked or approved. Cannot edit without Principal unlock.' });
    }
  }

  const cls = db.classes.find(c => c.id === classId);
  const sub = db.subjects.find(s => s.id === subjectId);
  if (!cls || !sub) return res.status(404).json({ error: 'Class or subject not found.' });

  const components = getComponentsForClass(sub, cls.numericGrade);
  const compMaxMap = new Map<string, number>();
  components.forEach(c => compMaxMap.set(c.componentKey, c.maxMarks));

  const sanitizedMarks: Record<string, StudentMarkEntry> = {};
  for (const [studentId, entry] of Object.entries(studentMarks as Record<string, any>)) {
    if (entry.isAbsent) {
      sanitizedMarks[studentId] = {
        studentId,
        isAbsent: true,
        componentMarks: {},
        subjectTotal: 0,
        remarks: entry.remarks || 'Absent',
      };
    } else {
      let sum = 0;
      const cleanComp: Record<string, number> = {};
      for (const [key, val] of Object.entries(entry.componentMarks || {})) {
        if (val === '' || val === null || val === undefined) {
          // CE mark intentionally empty/not entered -> kept empty so Withheld rule can trigger
          continue;
        }
        const numVal = parseInt(String(val), 10);
        if (isNaN(numVal) || numVal < 0) {
          return res.status(400).json({ error: `Invalid mark value for student: ${val}. Must be positive integer.` });
        }
        const max = compMaxMap.get(key) || 50;
        if (numVal > max) {
          return res.status(400).json({ error: `Mark ${numVal} exceeds maximum of ${max} for component "${key}".` });
        }
        cleanComp[key] = numVal;
        sum += numVal;
      }
      sanitizedMarks[studentId] = {
        studentId,
        isAbsent: false,
        componentMarks: cleanComp,
        subjectTotal: sum,
        remarks: entry.remarks,
      };
    }
  }

  if (!markSheet) {
    const assignment = db.teacherAssignments.find(ta => ta.classId === classId && ta.subjectId === subjectId);
    markSheet = {
      id: `ms_${classId}_${subjectId}_${examinationId}`,
      examinationId,
      academicYearId: db.examinations.find(e => e.id === examinationId)?.academicYearId || 'ay_2026_2027',
      classId,
      subjectId,
      assignedTeacherId: assignment?.teacherId || user.id,
      status: 'draft',
      studentMarks: sanitizedMarks,
      lastUpdated: new Date().toISOString(),
    };
    db.markSheets.push(markSheet);
  } else {
    markSheet.studentMarks = sanitizedMarks;
    markSheet.status = markSheet.status === 'returned_for_correction' ? 'draft' : (markSheet.status === 'not_started' ? 'draft' : markSheet.status);
    markSheet.lastUpdated = new Date().toISOString();
  }

  dbManager.save();
  res.json({ success: true, markSheet });
});

app.post('/api/mark-sheets/:id/submit', requireTeacher, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const ms = db.markSheets.find(m => m.id === req.params.id);
  if (!ms) return res.status(404).json({ error: 'Mark sheet not found.' });

  const user = req.user!;
  if (user.role === 'teacher' && ms.assignedTeacherId !== user.id) {
    return res.status(403).json({ error: 'You are not assigned to submit this mark sheet.' });
  }

  if (ms.status === 'locked' || ms.status === 'approved') {
    return res.status(400).json({ error: 'Mark sheet is already approved/locked.' });
  }

  const students = db.students.filter(s => s.classId === ms.classId && s.status === 'active');
  const missingStudents = students.filter(s => !ms.studentMarks[s.id]);
  if (missingStudents.length > 0) {
    return res.status(400).json({
      error: `Cannot submit: ${missingStudents.length} student(s) have missing marks. Please enter marks or mark as Absent.`,
    });
  }

  ms.status = 'submitted';
  ms.submittedAt = new Date().toISOString();
  ms.lastUpdated = new Date().toISOString();
  dbManager.save();

  dbManager.logAudit({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'SUBMIT_MARK_SHEET',
    recordType: 'mark_sheet',
    recordId: ms.id,
    details: `${user.name} submitted mark sheet for verification.`,
  });

  res.json({ success: true, markSheet: ms });
});

app.post('/api/mark-sheets/:id/approve', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const ms = db.markSheets.find(m => m.id === req.params.id);
  if (!ms) return res.status(404).json({ error: 'Mark sheet not found.' });

  ms.status = 'approved';
  ms.verifiedAt = new Date().toISOString();
  ms.verifiedBy = req.user!.id;
  ms.lastUpdated = new Date().toISOString();
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'APPROVE_MARK_SHEET',
    recordType: 'mark_sheet',
    recordId: ms.id,
    details: `Principal approved mark sheet.`,
  });

  res.json({ success: true, markSheet: ms });
});

app.post('/api/mark-sheets/:id/lock', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const ms = db.markSheets.find(m => m.id === req.params.id);
  if (!ms) return res.status(404).json({ error: 'Mark sheet not found.' });

  ms.status = 'locked';
  ms.lockedAt = new Date().toISOString();
  ms.lastUpdated = new Date().toISOString();
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'LOCK_MARK_SHEET',
    recordType: 'mark_sheet',
    recordId: ms.id,
    details: `Principal locked mark sheet to prevent further modifications.`,
  });

  res.json({ success: true, markSheet: ms });
});

app.post('/api/mark-sheets/:id/unlock', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  const ms = db.markSheets.find(m => m.id === req.params.id);
  if (!ms) return res.status(404).json({ error: 'Mark sheet not found.' });

  ms.status = 'approved';
  ms.lockedAt = undefined;
  ms.lastUpdated = new Date().toISOString();
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'UNLOCK_MARK_SHEET',
    recordType: 'mark_sheet',
    recordId: ms.id,
    details: `Principal unlocked mark sheet for editing.`,
  });

  res.json({ success: true, markSheet: ms });
});

app.post('/api/mark-sheets/:id/return-correction', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Reason for return is required.' });

  const db = dbManager.getDB();
  const ms = db.markSheets.find(m => m.id === req.params.id);
  if (!ms) return res.status(404).json({ error: 'Mark sheet not found.' });

  ms.status = 'returned_for_correction';
  ms.returnedReason = reason;
  ms.lastUpdated = new Date().toISOString();
  dbManager.save();

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'RETURN_MARK_SHEET_FOR_CORRECTION',
    recordType: 'mark_sheet',
    recordId: ms.id,
    details: `Returned mark sheet to teacher. Reason: ${reason}`,
  });

  res.json({ success: true, markSheet: ms });
});

app.post('/api/mark-sheets/:id/admin-correct', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { studentId, componentKey, newMark, reason } = req.body;
  if (!studentId || !componentKey || newMark === undefined || !reason) {
    return res.status(400).json({ error: 'studentId, componentKey, newMark, and reason are required.' });
  }

  const db = dbManager.getDB();
  const ms = db.markSheets.find(m => m.id === req.params.id);
  if (!ms) return res.status(404).json({ error: 'Mark sheet not found.' });

  const entry = ms.studentMarks[studentId];
  if (!entry) return res.status(404).json({ error: 'Student mark entry not found.' });

  const oldMark = entry.componentMarks[componentKey];
  entry.componentMarks[componentKey] = Number(newMark);

  entry.subjectTotal = Object.values(entry.componentMarks).reduce((a, b) => a + b, 0);
  ms.lastUpdated = new Date().toISOString();
  dbManager.save();

  const std = db.students.find(s => s.id === studentId);

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'ADMIN_CORRECT_MARK',
    recordType: 'mark_sheet',
    recordId: ms.id,
    details: `Principal corrected ${std?.nameEn}'s mark in ${componentKey} from ${oldMark} to ${newMark}. Reason: ${reason}`,
    previousValue: oldMark,
    newValue: newMark,
  });

  res.json({ success: true, markSheet: ms, updatedEntry: entry });
});

// ==========================================
// 9. MONITORING & STATS
// ==========================================

app.get('/api/monitoring/overview', requireAdmin, (req, res) => {
  const db = dbManager.getDB();
  const totalStudents = db.students.filter(s => s.status === 'active').length;
  const totalTeachers = db.users.filter(u => u.role === 'teacher' && u.active).length;
  const totalClasses = db.classes.filter(c => c.active).length;
  const totalSubjects = db.subjects.length;

  const currentExam = db.examinations.find(e => e.id === db.settings.activeExamId) || db.examinations[0];
  const examSheets = currentExam ? db.markSheets.filter(ms => ms.examinationId === currentExam.id) : [];

  let countNotStarted = 0;
  let countDraft = 0;
  let countSubmitted = 0;
  let countApproved = 0;
  let countLocked = 0;
  let countReturned = 0;

  examSheets.forEach(ms => {
    if (ms.status === 'draft') countDraft++;
    else if (ms.status === 'submitted') countSubmitted++;
    else if (ms.status === 'approved') countApproved++;
    else if (ms.status === 'locked') countLocked++;
    else if (ms.status === 'returned_for_correction') countReturned++;
  });

  let totalRequiredSheets = 0;
  if (currentExam) {
    db.classes.filter(c => currentExam.classesParticipating.includes(c.id)).forEach(cls => {
      const applicable = db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));
      totalRequiredSheets += applicable.length;
    });
  }
  countNotStarted = Math.max(0, totalRequiredSheets - examSheets.length);

  res.json({
    totalStudents,
    totalTeachers,
    totalClasses,
    totalSubjects,
    activeExam: currentExam,
    isPublished: currentExam?.isPublished || false,
    stats: {
      totalRequiredSheets,
      countNotStarted,
      countDraft,
      countSubmitted,
      countApproved,
      countLocked,
      countReturned,
    },
    recentLogs: db.auditLogs.slice(0, 10),
  });
});

app.get('/api/monitoring/matrix', requireAdmin, (req, res) => {
  const { examinationId } = req.query;
  const db = dbManager.getDB();
  const examId = String(examinationId || db.settings.activeExamId || db.examinations[0]?.id);

  const matrix: any[] = [];
  db.classes.forEach(cls => {
    const applicableSubjects = db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));
    applicableSubjects.forEach(sub => {
      const ms = db.markSheets.find(m => m.examinationId === examId && m.classId === cls.id && m.subjectId === sub.id);
      const assignment = db.teacherAssignments.find(ta => ta.classId === cls.id && ta.subjectId === sub.id);
      const teacher = assignment ? db.users.find(u => u.id === assignment.teacherId) : null;
      const studentCount = db.students.filter(s => s.classId === cls.id && s.status === 'active').length;

      const subName = cls.numericGrade === 9 && sub.id === 'sub_history_buhuth' ? 'ബുഹൂസ്' : (sub.nameMl || sub.nameEn);

      matrix.push({
        classId: cls.id,
        className: cls.name,
        classNameMl: cls.nameMl,
        numericGrade: cls.numericGrade,
        subjectId: sub.id,
        subjectNameEn: subName,
        subjectNameMl: subName,
        teacherId: teacher?.id || null,
        teacherName: teacher ? teacher.name : 'Unassigned',
        status: ms?.status || 'not_started',
        studentCount,
        markSheetId: ms?.id || null,
        lastUpdated: ms?.lastUpdated || null,
      });
    });
  });

  res.json(matrix);
});

// ==========================================
// 10. PROGRESS REPORTS & PARENT ACCESS
// ==========================================

app.get('/api/reports/student/:studentId/exam/:examId', requireAuth, (req: AuthenticatedRequest, res) => {
  const { studentId, examId } = req.params;
  const user = req.user!;
  const db = dbManager.getDB();

  const student = db.students.find(s => s.id === studentId);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const exam = db.examinations.find(e => e.id === examId);
  if (!exam) return res.status(404).json({ error: 'Examination not found.' });

  if (user.role === 'parent') {
    if (student.parentUserId !== user.id) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to view this student\'s report.' });
    }
    if (!exam.isPublished) {
      return res.status(403).json({
        error: 'The results for this examination have not been published yet. Please check again later.',
        isUnpublished: true,
      });
    }
  }

  const report = generateStudentProgressReport(studentId, examId);
  if (!report) return res.status(500).json({ error: 'Failed to generate progress report.' });

  res.json({
    report,
    settings: db.settings,
  });
});

app.get('/api/reports/class/:classId/exam/:examId', requireAdmin, (req, res) => {
  const { classId, examId } = req.params;
  const db = dbManager.getDB();
  const students = db.students.filter(s => s.classId === classId && s.status === 'active')
    .sort((a, b) => a.rollNo - b.rollNo);

  const reports = students.map(s => generateStudentProgressReport(s.id, examId)).filter(Boolean);
  res.json({
    reports,
    settings: db.settings,
  });
});

// ==========================================
// 11. AUDIT LOGS, BACKUP & EXPORTS
// ==========================================

app.get('/api/audit-logs', requireAdmin, (req, res) => {
  const db = dbManager.getDB();
  const { action, limit } = req.query;
  let logs = db.auditLogs;
  if (action) {
    logs = logs.filter(l => l.action === action);
  }
  const max = parseInt(String(limit)) || 100;
  res.json(logs.slice(0, max));
});

// Full Database Backup Export (Returns JSON directly for Blob download)
app.get('/api/backup/download', requireAdmin, (req: AuthenticatedRequest, res) => {
  const db = dbManager.getDB();
  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'BACKUP_DATABASE',
    recordType: 'database',
    recordId: 'full_backup',
    details: 'Administrator downloaded full database backup.',
  });

  res.json(db);
});

// Database Restore from JSON
app.post('/api/backup/restore', requireAdmin, (req: AuthenticatedRequest, res) => {
  const { backupData } = req.body;
  if (!backupData) {
    return res.status(400).json({ error: 'Backup data payload is required.' });
  }

  const result = dbManager.restore(backupData);
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }

  dbManager.logAudit({
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: 'admin',
    action: 'RESTORE_DATABASE',
    recordType: 'database',
    recordId: 'full_restore',
    details: 'Administrator restored database from backup.',
  });

  res.json({ success: true, message: result.message });
});

// Export Class Examination Results CSV
app.get('/api/export/class-results-csv', requireAdmin, (req, res) => {
  const { classId, examId } = req.query;
  if (!classId || !examId) return res.status(400).json({ error: 'classId and examId are required.' });

  const db = dbManager.getDB();
  const cls = db.classes.find(c => c.id === classId);
  const exam = db.examinations.find(e => e.id === examId);
  if (!cls || !exam) return res.status(404).json({ error: 'Class or Exam not found.' });

  const students = db.students.filter(s => s.classId === classId && s.status === 'active')
    .sort((a, b) => a.rollNo - b.rollNo);
  const applicableSubjects = db.subjects.filter(s => s.applicableClasses.includes(cls.numericGrade));

  const subHeaders = applicableSubjects.map(s => `"${cls.numericGrade === 9 && s.id === 'sub_history_buhuth' ? 'ബുഹൂസ്' : (s.nameMl || s.nameEn)} (50)"`).join(',');
  const header = `Roll No,Admission No,Student Name,${subHeaders},Total Obtained,Max Marks,Percentage,Rank,Status\n`;

  const rankMap = calculateClassRanks(String(classId), String(examId));

  const rows = students.map(s => {
    const rInfo = rankMap.get(s.id);
    const subScores = applicableSubjects.map(sub => {
      const ms = db.markSheets.find(m => m.examinationId === examId && m.classId === classId && m.subjectId === sub.id);
      const entry = ms?.studentMarks?.[s.id];
      if (!entry) return 'Pending';
      if (entry.isAbsent) return 'Absent';
      return entry.subjectTotal;
    }).join(',');

    const rankStr = rInfo?.rank !== null && rInfo?.rank !== undefined ? rInfo.rank : 'N/A';
    const pctStr = rInfo?.pct !== null && rInfo?.pct !== undefined ? `${rInfo.pct}%` : 'N/A';
    const report = generateStudentProgressReport(s.id, String(examId));
    const statusStr = report ? report.resultStatus : 'Pending';

    return `${s.rollNo},"${s.admissionNo}","${s.nameEn}",${subScores},${rInfo?.total || 0},${rInfo?.max || 0},"${pctStr}","${rankStr}","${statusStr}"`;
  }).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="results_${cls.name.replace(/\s+/g, '_')}_${exam.nameEn.replace(/\s+/g, '_')}.csv"`);
  res.send(header + rows);
});

// ==========================================
// 12. VITE DEV / PRODUCTION INTEGRATION
// ==========================================

async function startServer() {
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Madrasa Management System running at http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
