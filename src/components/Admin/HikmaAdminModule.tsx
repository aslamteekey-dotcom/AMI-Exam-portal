import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  ClassItem,
  Student,
  ALL_STANDARD_CLASSES,
  sortStudentsBoysFirst,
  sortStudentsGirlsFirst,
  determineStudentGender,
  HIKMA_EXAM_ID,
} from '../../types';
import {
  HikmaExamConfig,
  DEFAULT_HIKMA_CONFIG,
  getHikmaExamConfig,
  saveHikmaExamConfig,
  saveStudentHikmaRegNo,
  batchSaveHikmaRegNumbers,
  isStudentInSchoolClass,
  isStudentHikmaParticipating,
  getHikmaExcludedStudentIds,
  getHikmaSavedRegNumbers,
  setHikmaStudentParticipation,
} from '../../services/hikmaExamService';
import { HikmaUnifiedScoreSheet } from './HikmaUnifiedScoreSheet';
import {
  Users,
  Settings,
  Table,
  Award,
  Hash,
  Sparkles,
  Save,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  Loader2,
  Sliders,
  ShieldCheck,
  RefreshCw,
  BookOpen,
} from 'lucide-react';

// School classes standard 1 through 9
const SCHOOL_CLASSES: ClassItem[] = ALL_STANDARD_CLASSES.filter(
  c => c.numericGrade >= 1 && c.numericGrade <= 9
);

// Module-level cache to make switching back to Hikma Exam tab instantaneous (0ms)
let cachedStudentsList: Student[] | null = null;
let cachedActiveSubTab: 'registration' | 'settings' | 'score_sheet' = 'registration';
let cachedSelectedClassId: string = SCHOOL_CLASSES[4]?.id || 'cls_5';

export const HikmaAdminModule: React.FC = () => {
  const { lang, institutionSettings, fetchWithAuth } = useAuth();
  const isMl = lang === 'ml';

  // Sub-tab selection: 'registration' | 'settings' | 'score_sheet'
  const [activeSubTab, setActiveSubTab] = useState<'registration' | 'settings' | 'score_sheet'>(
    cachedActiveSubTab
  );
  const [selectedClassId, setSelectedClassId] = useState<string>(cachedSelectedClassId);
  const [students, setStudents] = useState<Student[]>(cachedStudentsList || []);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(!cachedStudentsList || cachedStudentsList.length === 0);

  // Registration state
  const [regMap, setRegMap] = useState<Record<string, string>>({});
  const [participatingMap, setParticipatingMap] = useState<Record<string, boolean>>({});
  const [savedRegStatus, setSavedRegStatus] = useState<Record<string, 'saved' | 'saving' | 'dirty'>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const [batchSaveMessage, setBatchSaveMessage] = useState<string | null>(null);

  // Sequence generator configuration
  const selectedClass = useMemo(
    () => SCHOOL_CLASSES.find(c => c.id === selectedClassId) || SCHOOL_CLASSES[0],
    [selectedClassId]
  );
  const gradeNum = selectedClass ? selectedClass.numericGrade : 5;
  const [seqPrefix, setSeqPrefix] = useState(`2609${gradeNum}`);
  const [seqStart, setSeqStart] = useState('101');
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  useEffect(() => {
    setSeqPrefix(`2609${gradeNum}`);
    setSeqStart('101');
  }, [gradeNum]);

  // Exam Settings state
  const [examConfig, setExamConfig] = useState<HikmaExamConfig>(DEFAULT_HIKMA_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaveSuccess, setConfigSaveSuccess] = useState(false);

  // Sync state to module cache
  useEffect(() => {
    cachedActiveSubTab = activeSubTab;
  }, [activeSubTab]);

  useEffect(() => {
    cachedSelectedClassId = selectedClassId;
  }, [selectedClassId]);

  // Load students list with caching
  useEffect(() => {
    let isMounted = true;
    if (cachedStudentsList && cachedStudentsList.length > 0) {
      setStudents(cachedStudentsList);
      setLoadingStudents(false);
    }

    const loadStudents = async () => {
      try {
        const local = localStorage.getItem('madrasa_students');
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            cachedStudentsList = parsed;
            if (isMounted) {
              setStudents(parsed);
              setLoadingStudents(false);
            }
          }
        }

        const res = await fetchWithAuth('/api/students');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            cachedStudentsList = data;
            if (isMounted) {
              setStudents(data);
              setLoadingStudents(false);
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch students in HikmaAdminModule:', e);
      } finally {
        if (isMounted) setLoadingStudents(false);
      }
    };

    loadStudents();

    const handleStudentsUpdated = (e: any) => {
      if (Array.isArray(e.detail) && isMounted) {
        cachedStudentsList = e.detail;
        setStudents(e.detail);
      }
    };

    window.addEventListener('madrasa_students_updated', handleStudentsUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener('madrasa_students_updated', handleStudentsUpdated);
    };
  }, [fetchWithAuth]);

  // Load exam config
  useEffect(() => {
    let isMounted = true;
    getHikmaExamConfig().then(cfg => {
      if (isMounted) {
        setExamConfig(cfg);
        setLoadingConfig(false);
      }
    });
  }, []);

  // Filter students belonging STRICTLY to the chosen School Class (1 to 9) using schoolClass attribute
  // Official KMEB / HIKMA Sorting: Girls First (A-Z), then Boys (A-Z)
  const classStudents = useMemo(() => {
    const list = students.filter(s => isStudentInSchoolClass(s, selectedClassId, selectedClass));
    const sorted = sortStudentsGirlsFirst(list);

    return sorted.map((s, idx) => ({
      ...s,
      rollNo: idx + 1,
      gender: determineStudentGender(s),
    }));
  }, [students, selectedClassId, selectedClass]);

  // Synchronize regMap and participatingMap when classStudents load or change
  useEffect(() => {
    const excluded = getHikmaExcludedStudentIds();
    const savedRegs = getHikmaSavedRegNumbers();
    const map: Record<string, string> = {};
    const partMap: Record<string, boolean> = {};

    classStudents.forEach(st => {
      // Find existing saved registration number from all available sources
      const existingReg =
        st.hikmaRegNo ||
        st.examRegisterNumbers?.[HIKMA_EXAM_ID] ||
        st.examRegisterNos?.[HIKMA_EXAM_ID] ||
        savedRegs[st.id] ||
        (st.admissionNo ? savedRegs[st.admissionNo] : '') ||
        st.regNo ||
        '';
      map[st.id] = existingReg;

      const isPart = isStudentHikmaParticipating(st, excluded);
      partMap[st.id] = isPart;
    });

    setRegMap(prev => {
      const merged: Record<string, string> = { ...map };
      // Preserve user typed edits during current session
      Object.keys(prev).forEach(id => {
        if (prev[id] && prev[id].trim()) {
          merged[id] = prev[id];
        }
      });
      return merged;
    });
    setParticipatingMap(prev => ({ ...partMap, ...prev }));
  }, [classStudents]);

  // Search filtered student list
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return classStudents;
    const q = searchQuery.toLowerCase().trim();
    return classStudents.filter(
      st =>
        st.nameEn.toLowerCase().includes(q) ||
        (st.nameMl && st.nameMl.includes(q)) ||
        (st.admissionNo && st.admissionNo.toLowerCase().includes(q)) ||
        (regMap[st.id] && regMap[st.id].toLowerCase().includes(q)) ||
        String(st.rollNo).includes(q)
    );
  }, [classStudents, searchQuery, regMap]);

  // Registration metrics with participating & excluded counts
  const participatingStudents = useMemo(() => {
    return classStudents.filter(s => participatingMap[s.id] !== false);
  }, [classStudents, participatingMap]);

  const excludedCount = classStudents.length - participatingStudents.length;

  const registeredCount = useMemo(() => {
    return participatingStudents.filter(s => Boolean(String(regMap[s.id] || '').trim())).length;
  }, [participatingStudents, regMap]);

  const pendingCount = Math.max(0, participatingStudents.length - registeredCount);

  // Toggle single student participation
  const handleToggleParticipation = (studentId: string, current: boolean) => {
    const nextVal = !current;
    setParticipatingMap(prev => ({ ...prev, [studentId]: nextVal }));
    if (!nextVal) {
      setRegMap(prev => ({ ...prev, [studentId]: '' }));
    }
  };

  // Single student Reg No & Participation save
  const handleSaveSingleRegNo = async (student: Student) => {
    const val = regMap[student.id] || '';
    const isPart = participatingMap[student.id] !== false;
    setSavedRegStatus(prev => ({ ...prev, [student.id]: 'saving' }));
    try {
      await setHikmaStudentParticipation(student.id, isPart, student.admissionNo);
      await saveStudentHikmaRegNo(student.id, student.admissionNo, isPart ? val : '');
      setSavedRegStatus(prev => ({ ...prev, [student.id]: 'saved' }));
      setTimeout(() => {
        setSavedRegStatus(prev => {
          const next = { ...prev };
          delete next[student.id];
          return next;
        });
      }, 2500);
    } catch (e) {
      console.error('Failed to save student reg no:', e);
      setSavedRegStatus(prev => ({ ...prev, [student.id]: 'dirty' }));
    }
  };

  // Batch Save all Registration Numbers & Participation Statuses
  const handleSaveAllRegNumbers = async () => {
    setIsBatchSaving(true);
    setBatchSaveMessage(null);
    try {
      await batchSaveHikmaRegNumbers(regMap, classStudents, participatingMap);
      setBatchSaveMessage(
        `Successfully saved registration numbers & exam participation for ${classStudents.length} students.`
      );
      setTimeout(() => setBatchSaveMessage(null), 4000);
    } catch (e) {
      console.error('Failed to batch save reg numbers:', e);
      setBatchSaveMessage('Failed to save some registration numbers. Please retry.');
    } finally {
      setIsBatchSaving(false);
    }
  };

  // Auto-generate sequential numbers for participating students without hyphens
  // Supports Overwrite existing option (force regeneration) vs Safe fill (empty fields only)
  const handleAutoGenerateSequence = () => {
    let startInt = parseInt(seqStart, 10);
    if (isNaN(startInt)) startInt = parseInt(`${gradeNum}01`, 10) || 101;

    const cleanPrefix = (seqPrefix || '').trim();
    const newMap: Record<string, string> = { ...regMap };
    let assignedCount = 0;
    let preservedCount = 0;
    let skippedCount = 0;

    // If NOT overwriting, gather all existing registration numbers in this class to avoid duplicates
    const assignedNumbers = new Set<string>();
    if (!overwriteExisting) {
      classStudents.forEach(st => {
        const existing = String(
          regMap[st.id] ||
          st.hikmaRegNo ||
          st.examRegisterNumbers?.[HIKMA_EXAM_ID] ||
          ''
        ).trim();
        if (existing) {
          assignedNumbers.add(existing);
        }
      });
    }

    classStudents.forEach(st => {
      const isParticipating = participatingMap[st.id] !== false;
      if (!isParticipating) {
        // Excluded student - do not assign auto-generated registration number
        newMap[st.id] = '';
        skippedCount++;
        return;
      }

      // If NOT overwriting, preserve existing registration number
      if (!overwriteExisting) {
        const existingVal = String(
          regMap[st.id] ||
          st.hikmaRegNo ||
          st.examRegisterNumbers?.[HIKMA_EXAM_ID] ||
          ''
        ).trim();

        if (existingVal) {
          // STRICT PROTECTION: Preserve existing registration number without altering or overwriting
          newMap[st.id] = existingVal;
          preservedCount++;
          return;
        }

        // Only fill empty registration fields
        // Ensure the generated number does not collide with an already assigned number
        while (assignedNumbers.has(`${cleanPrefix}${startInt}`)) {
          startInt++;
        }
      }

      // Assign sequence number
      const generated = `${cleanPrefix}${startInt}`;
      newMap[st.id] = generated;
      if (!overwriteExisting) {
        assignedNumbers.add(generated);
      }
      startInt++;
      assignedCount++;
    });

    setRegMap(newMap);
    if (overwriteExisting) {
      setBatchSaveMessage(
        `Fill Sequence: Regenerated & overwritten all ${assignedCount} registration numbers from ${cleanPrefix}${seqStart}${
          skippedCount > 0 ? ` (${skippedCount} excluded skipped)` : ''
        }. Click "Save All" to commit.`
      );
    } else {
      setBatchSaveMessage(
        `Fill Sequence: Filled ${assignedCount} empty fields${
          preservedCount > 0 ? ` (${preservedCount} existing numbers strictly preserved)` : ''
        }${skippedCount > 0 ? `, ${skippedCount} excluded skipped` : ''}. Click "Save All" to commit.`
      );
    }
    setTimeout(() => setBatchSaveMessage(null), 5000);
  };

  // Exam Settings update
  const handleSaveSettings = async () => {
    setSavingConfig(true);
    setConfigSaveSuccess(false);
    try {
      await saveHikmaExamConfig(examConfig);
      setConfigSaveSuccess(true);
      setTimeout(() => setConfigSaveSuccess(false), 3500);
    } catch (e) {
      console.error('Failed to save HIKMA exam config:', e);
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
              Principal Portal • HIKMA Exam Module
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500 font-mono">Academic Year 2026–2027</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
            <Award className="w-6 h-6 text-amber-600" />
            <span>HIKMA Model Examination</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administer school-class based registration, 3-model exam parameters, and consolidated comparative scoring.
          </p>
        </div>

        {/* School Class Selector Dropdown */}
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl shrink-0">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">
            School Class:
          </label>
          <div className="relative">
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="text-xs font-bold bg-transparent text-emerald-950 pr-7 py-0.5 focus:outline-none cursor-pointer"
            >
              {SCHOOL_CLASSES.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.nameMl ? `(${c.nameMl})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-0 top-1 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Primary Sub-tabs Navigation */}
      <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center gap-1.5 overflow-x-auto border border-slate-200/80">
        <button
          type="button"
          onClick={() => setActiveSubTab('registration')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'registration'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Hash className="w-4 h-4 shrink-0" />
          <span>Registration</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
              activeSubTab === 'registration'
                ? 'bg-emerald-700 text-emerald-100'
                : 'bg-slate-200 text-slate-700'
            }`}
          >
            {classStudents.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('settings')}
          className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'settings'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Sliders className="w-4 h-4 shrink-0" />
          <span>Exam Settings</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('score_sheet')}
          className={`flex-1 min-w-[160px] py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
            activeSubTab === 'score_sheet'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <Table className="w-4 h-4 shrink-0" />
          <span>Consolidated Score Sheet</span>
        </button>
      </div>

      {/* SUB-TAB A: REGISTRATION */}
      {activeSubTab === 'registration' && (
        <div className="space-y-4">
          {/* Summary & Helper Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  Total Class
                </span>
                <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono mt-0.5">
                  {classStudents.length}
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">
                  Writing Exam
                </span>
                <div className="text-xl sm:text-2xl font-black text-indigo-900 font-mono mt-0.5">
                  {participatingStudents.length}
                </div>
                {excludedCount > 0 && (
                  <div className="text-[10px] text-amber-600 font-semibold">{excludedCount} excluded</div>
                )}
              </div>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                  Registered
                </span>
                <div className="text-xl sm:text-2xl font-black text-emerald-800 font-mono mt-0.5">
                  {registeredCount}
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center">
                <Hash className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">
                  Pending
                </span>
                <div className="text-xl sm:text-2xl font-black text-amber-800 font-mono mt-0.5">
                  {pendingCount}
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Action Toolbar: Auto-generator & Search */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Quick Sequence Generator without hyphen */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Auto-Generate:
                </span>
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                  <span className="text-[11px] text-slate-500 font-semibold">Prefix:</span>
                  <input
                    type="text"
                    value={seqPrefix}
                    onChange={e => setSeqPrefix(e.target.value)}
                    className="w-20 font-mono text-xs font-bold text-slate-900 bg-transparent focus:outline-none"
                    placeholder="e.g. 26092"
                  />
                </div>
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                  <span className="text-[11px] text-slate-500 font-semibold">Start:</span>
                  <input
                    type="text"
                    value={seqStart}
                    onChange={e => setSeqStart(e.target.value)}
                    className="w-14 font-mono text-xs font-bold text-slate-900 bg-transparent focus:outline-none"
                    placeholder="101"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAutoGenerateSequence}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg border transition cursor-pointer flex items-center gap-1 shadow-2xs ${
                    overwriteExisting
                      ? 'text-amber-900 bg-amber-50 hover:bg-amber-100 border-amber-300'
                      : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-300'
                  }`}
                  title={
                    overwriteExisting
                      ? 'Forcibly regenerates and overwrites all registration numbers in sequence for participating students.'
                      : 'Directly joins prefix and start number without hyphens (e.g. 26092101). Only fills empty fields, strictly preserving existing numbers and skipping excluded students.'
                  }
                >
                  <span>{overwriteExisting ? 'Force Overwrite Sequence' : 'Fill Sequence'}</span>
                </button>
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 select-none cursor-pointer hover:bg-slate-100 transition shadow-2xs">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={e => setOverwriteExisting(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                  />
                  <span className={overwriteExisting ? 'font-bold text-amber-900' : 'font-medium text-slate-700'}>
                    Overwrite existing
                  </span>
                </label>
                <span className="text-[10px] text-slate-500 hidden xl:inline-block">
                  {overwriteExisting ? (
                    <span className="text-amber-700 font-semibold">⚠️ Will overwrite ALL existing numbers in sequence for participating students</span>
                  ) : (
                    <span>(No hyphen e.g. {seqPrefix || '26092'}{seqStart || '101'} • Only fills empty fields • Preserves existing numbers)</span>
                  )}
                </span>
              </div>

              {/* Search & Save All */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search name, roll, adm..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700 w-44 sm:w-56"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveAllRegNumbers}
                  disabled={isBatchSaving}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isBatchSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save All</span>
                </button>
              </div>
            </div>

            {batchSaveMessage && (
              <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{batchSaveMessage}</span>
              </div>
            )}
          </div>

          {/* Student Registration Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {loadingStudents ? (
              <div className="p-12 text-center text-xs text-slate-500 font-semibold flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                <span>Loading class students...</span>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-500 font-semibold">
                No students found in {selectedClass?.name || 'this class'}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider select-none">
                      <th className="py-2.5 px-3 text-center w-12 border-r border-slate-200">Roll</th>
                      <th className="py-2.5 px-3 w-16 border-r border-slate-200">Adm No</th>
                      <th className="py-2.5 px-3 text-center w-28 border-r border-slate-200" title="Un-tick to exclude student from HIKMA Exam">
                        Writing Exam
                      </th>
                      <th className="py-2.5 px-4 min-w-[200px] border-r border-slate-200">Student Name</th>
                      <th className="py-2.5 px-3 text-center w-20 border-r border-slate-200">Gender</th>
                      <th className="py-2.5 px-4 min-w-[220px] border-r border-slate-200">
                        HIKMA Registration Number
                      </th>
                      <th className="py-2.5 px-3 text-center w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map((st, idx) => {
                      const currentVal = regMap[st.id] ?? '';
                      const isParticipating = participatingMap[st.id] !== false;
                      const isSaved = savedRegStatus[st.id] === 'saved';
                      const isSaving = savedRegStatus[st.id] === 'saving';
                      const hasValue = Boolean(String(currentVal).trim());

                      return (
                        <tr
                          key={st.id}
                          className={`transition-colors ${
                            !isParticipating
                              ? 'bg-amber-50/25 hover:bg-amber-50/40 opacity-80'
                              : idx % 2 === 1
                              ? 'bg-slate-50/30 hover:bg-slate-50/80'
                              : 'bg-white hover:bg-slate-50/80'
                          }`}
                        >
                          {/* Roll */}
                          <td className="py-2 px-3 text-center font-mono font-bold text-slate-900 border-r border-slate-200">
                            {st.rollNo}
                          </td>

                          {/* Admission No */}
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-600 border-r border-slate-200">
                            {st.admissionNo || '—'}
                          </td>

                          {/* Participating Checkbox */}
                          <td className="py-2 px-3 text-center border-r border-slate-200">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isParticipating}
                                onChange={() => handleToggleParticipation(st.id, isParticipating)}
                                className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-600 focus:ring-offset-0 border-slate-300 cursor-pointer"
                              />
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition ${
                                  isParticipating
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                                }`}
                              >
                                {isParticipating ? 'Writing' : 'Excluded'}
                              </span>
                            </label>
                          </td>

                          {/* Student Name */}
                          <td className="py-2 px-4 border-r border-slate-200">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-bold ${
                                  isParticipating ? 'text-slate-900' : 'text-slate-500 line-through'
                                }`}
                              >
                                {st.nameEn}
                              </span>
                              {!isParticipating && (
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.2 rounded-sm shrink-0">
                                  Excluded
                                </span>
                              )}
                            </div>
                            {st.nameMl && (
                              <div
                                className={`text-[10px] font-ml ${
                                  isParticipating ? 'text-slate-500' : 'text-slate-400'
                                }`}
                              >
                                {st.nameMl}
                              </div>
                            )}
                          </td>

                          {/* Gender */}
                          <td className="py-2 px-3 text-center border-r border-slate-200">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                st.gender === 'Boy'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {st.gender}
                            </span>
                          </td>

                          {/* Reg No Input Field */}
                          <td className="py-2 px-4 border-r border-slate-200">
                            {isParticipating ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={currentVal}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setRegMap(prev => ({ ...prev, [st.id]: val }));
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleSaveSingleRegNo(st);
                                  }}
                                  placeholder={`e.g. ${seqPrefix || '26092'}${st.rollNo + 100}`}
                                  className={`w-full px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition ${
                                    hasValue
                                      ? 'border-emerald-300 bg-emerald-50/40 text-emerald-950 focus:bg-white focus:border-emerald-600'
                                      : 'border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:border-emerald-600'
                                  } focus:outline-none`}
                                />
                                {hasValue && (
                                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">
                                    Set
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] font-mono text-slate-400 italic px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                                <span>— Skipped (Not Writing Exam) —</span>
                              </div>
                            )}
                          </td>

                          {/* Action Button */}
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleSaveSingleRegNo(st)}
                              disabled={isSaving}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer mx-auto ${
                                isSaved
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 hover:bg-emerald-800 hover:text-white text-slate-700'
                              }`}
                            >
                              {isSaving ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : isSaved ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-white" />
                                  <span>Saved</span>
                                </>
                              ) : (
                                <>
                                  <Save className="w-3 h-3" />
                                  <span>Save</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB B: EXAM SETTINGS */}
      {activeSubTab === 'settings' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-800" />
                  <span>HIKMA 3-Model Examination Configuration</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure Max Marks, Passing Thresholds, and Grading Scales for Model 1, Model 2, and Model 3.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingConfig}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {savingConfig ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Save Exam Settings</span>
              </button>
            </div>

            {configSaveSuccess && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>HIKMA Exam configuration saved successfully!</span>
              </div>
            )}

            {/* Model 1, Model 2, Model 3 Configuration Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              {/* MODEL 1 */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-900">
                    Model 1 Exam
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Phase I</span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Preliminary Assessment</h3>

                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Total Marks (Max Marks):
                    </label>
                    <input
                      type="number"
                      value={examConfig.models.model_1.totalMarks}
                      onChange={e => {
                        const val = Number(e.target.value) || 50;
                        setExamConfig(prev => ({
                          ...prev,
                          models: {
                            ...prev.models,
                            model_1: { ...prev.models.model_1, totalMarks: val },
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-bold font-mono rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Pass Mark:
                    </label>
                    <input
                      type="number"
                      value={examConfig.models.model_1.passMark}
                      onChange={e => {
                        const val = Number(e.target.value) || 18;
                        setExamConfig(prev => ({
                          ...prev,
                          models: {
                            ...prev.models,
                            model_1: { ...prev.models.model_1, passMark: val },
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-bold font-mono rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Grade System Definition:
                    </label>
                    <textarea
                      rows={3}
                      value={examConfig.models.model_1.gradeSystem}
                      onChange={e => {
                        const val = e.target.value;
                        setExamConfig(prev => ({
                          ...prev,
                          models: {
                            ...prev.models,
                            model_1: { ...prev.models.model_1, gradeSystem: val },
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
                      placeholder="e.g. A: >= 40, B: >= 30, C: >= 20, D: < 20"
                    />
                  </div>
                </div>
              </div>

              {/* MODEL 2 */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900">
                    Model 2 Exam
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Phase II</span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Intermediate Assessment</h3>

                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Total Marks (Max Marks):
                    </label>
                    <input
                      type="number"
                      value={examConfig.models.model_2.totalMarks}
                      onChange={e => {
                        const val = Number(e.target.value) || 50;
                        setExamConfig(prev => ({
                          ...prev,
                          models: {
                            ...prev.models,
                            model_2: { ...prev.models.model_2, totalMarks: val },
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-bold font-mono rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Pass Mark:
                    </label>
                    <input
                      type="number"
                      value={examConfig.models.model_2.passMark}
                      onChange={e => {
                        const val = Number(e.target.value) || 18;
                        setExamConfig(prev => ({
                          ...prev,
                          models: {
                            ...prev.models,
                            model_2: { ...prev.models.model_2, passMark: val },
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-bold font-mono rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Grade System Definition:
                    </label>
                    <textarea
                      rows={3}
                      value={examConfig.models.model_2.gradeSystem}
                      onChange={e => {
                        const val = e.target.value;
                        setExamConfig(prev => ({
                          ...prev,
                          models: {
                            ...prev.models,
                            model_2: { ...prev.models.model_2, gradeSystem: val },
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
                      placeholder="e.g. A: >= 40, B: >= 30, C: >= 20, D: < 20"
                    />
                  </div>
                </div>
              </div>

              {/* MODEL 3 */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-900">
                    Model 3 Exam
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">Phase III</span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm">Grand Final Assessment</h3>

                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Total Marks (Max Marks):
                    </label>
                    <input
                      type="number"
                      value={examConfig.models.model_3.totalMarks}
                      onChange={e => {
                        const val = Number(e.target.value) || 50;
                        setExamConfig(prev => ({
                          ...prev,
                          models: {
                            ...prev.models,
                            model_3: { ...prev.models.model_3, totalMarks: val },
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-bold font-mono rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Pass Mark:
                    </label>
                    <input
                      type="number"
                      value={examConfig.models.model_3.passMark}
                      onChange={e => {
                        const val = Number(e.target.value) || 18;
                        setExamConfig(prev => ({
                          ...prev,
                          models: {
                            ...prev.models,
                            model_3: { ...prev.models.model_3, passMark: val },
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs font-bold font-mono rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Grade System Definition:
                    </label>
                    <textarea
                      rows={3}
                      value={examConfig.models.model_3.gradeSystem}
                      onChange={e => {
                        const val = e.target.value;
                        setExamConfig(prev => ({
                          ...prev,
                          models: {
                            ...prev.models,
                            model_3: { ...prev.models.model_3, gradeSystem: val },
                          },
                        }));
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-700"
                      placeholder="e.g. A: >= 40, B: >= 30, C: >= 20, D: < 20"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Global Negative Marking Scheme */}
            <div className="mt-5 p-4 rounded-xl bg-amber-50/60 border border-amber-200/80">
              <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5 mb-2">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <span>Negative Marking Scheme Rules</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-semibold text-slate-700 block mb-1">
                    Positive Mark per Correct Answer:
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.25"
                      value={examConfig.positiveMarkPerCorrect}
                      onChange={e =>
                        setExamConfig(prev => ({
                          ...prev,
                          positiveMarkPerCorrect: Number(e.target.value) || 1.0,
                        }))
                      }
                      className="w-24 px-3 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg"
                    />
                    <span className="text-[11px] text-slate-500">marks (+1.00 standard)</span>
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-slate-700 block mb-1">
                    Negative Penalty per Wrong Answer:
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.05"
                      value={examConfig.negativeMarkingPerWrong}
                      onChange={e =>
                        setExamConfig(prev => ({
                          ...prev,
                          negativeMarkingPerWrong: Number(e.target.value) || 0.25,
                        }))
                      }
                      className="w-24 px-3 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg"
                    />
                    <span className="text-[11px] text-slate-500">marks deducted (-0.25 standard)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB C: CONSOLIDATED SCORE SHEET */}
      {activeSubTab === 'score_sheet' && (
        <HikmaUnifiedScoreSheet
          selectedClassId={selectedClassId}
          onClassChange={setSelectedClassId}
          hideHeaderBar={true}
          classes={SCHOOL_CLASSES}
          allStudents={students}
        />
      )}
    </div>
  );
};
