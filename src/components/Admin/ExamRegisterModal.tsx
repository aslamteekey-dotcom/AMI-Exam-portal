import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Hash, Sparkles, Check, X, Loader2, GripHorizontal, Users, CheckCircle, AlertCircle } from 'lucide-react';
import { sortStudentsBoysFirst, isBoyStudent } from '../../types';
import { firestoreSync } from '../../services/firestoreSync';
import { logAuditEvent } from '../../services/auditLogger';

interface Props {
  classId: string;
  className: string;
  examinationId: string;
  examinationName: string;
  onClose: () => void;
  onSaved: () => void;
}

interface StudentRegItem {
  studentId: string;
  admissionNo: string;
  rollNo: number;
  nameEn: string;
  nameMl: string;
  gender?: 'M' | 'F' | string;
  examRegisterNo: string;
}

export const ExamRegisterModal: React.FC<Props> = ({
  classId,
  className,
  examinationId,
  examinationName,
  onClose,
  onSaved,
}) => {
  const { fetchWithAuth, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentRegItem[]>([]);
  const [regMap, setRegMap] = useState<Record<string, string>>({});

  // Auto-generation sequence numbers: extract class numeral (e.g., "Class 7" -> 7)
  const classNumeral = (className || '').replace(/[^0-9]/g, '') || '7';
  const [boyStartNo, setBoyStartNo] = useState(`${classNumeral}101`);
  const [girlStartNo, setGirlStartNo] = useState(`${classNumeral}201`);

  useEffect(() => {
    const num = (className || '').replace(/[^0-9]/g, '') || '7';
    setBoyStartNo(`${num}101`);
    setGirlStartNo(`${num}201`);
  }, [className]);

  // Draggable window state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag from the header/grip bar (do not drag when clicking inputs/buttons)
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: position.x,
      startY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setPosition({
        x: dragStartRef.current.startX + dx,
        y: dragStartRef.current.startY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    loadStudents();
  }, [classId, examinationId]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(
        `/api/examinations/${examinationId}/classes/${classId}/register-numbers`
      );
      if (res.ok) {
        const data: StudentRegItem[] = await res.json();
        // Strict deduplication by admissionNo or studentId
        const unique = Array.from(
          new Map((data || []).map(s => [s.admissionNo?.toString() || s.studentId, s])).values()
        );
        // Strict Unified Sort: Boys (male/boy) A-Z first, then Girls (female/girl) A-Z
        const sorted = sortStudentsBoysFirst(unique).map((s, idx) => ({
          ...s,
          rollNo: idx + 1,
        }));

        setStudents(sorted);
        const initialMap: Record<string, string> = {};
        sorted.forEach(s => {
          initialMap[s.studentId] = s.examRegisterNo || '';
        });
        setRegMap(initialMap);
      }
    } catch (err) {
      console.error('Error loading students for register numbers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate sequential register numbers:
  // Parse starting integer counters and increment strictly for each subsequent student
  // Boys (A-Z) get boyCounter++, Girls (A-Z) get girlCounter++
  const handleAutoGenerateGenderSequential = () => {
    let boyCounter = parseInt(boyStartNo, 10);
    if (isNaN(boyCounter)) {
      boyCounter = parseInt(`${classNumeral}101`, 10) || 1101;
    }
    let girlCounter = parseInt(girlStartNo, 10);
    if (isNaN(girlCounter)) {
      girlCounter = parseInt(`${classNumeral}201`, 10) || 1201;
    }

    const newMap: Record<string, string> = { ...regMap };

    // Strictly sort students: Boys A-Z first, then Girls A-Z
    const sorted = sortStudentsBoysFirst(students);

    sorted.forEach((student) => {
      if (isBoyStudent(student.gender)) {
        newMap[student.studentId] = boyCounter.toString();
        boyCounter++;
      } else {
        newMap[student.studentId] = girlCounter.toString();
        girlCounter++;
      }
    });

    setRegMap(newMap);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // 1. Direct Cloud Persistence to Firestore
      await firestoreSync.updateExamRegisterNumbers(
        examinationId,
        regMap,
        students.map(s => ({ id: s.studentId, admissionNo: s.admissionNo, classId } as any))
      );

      // 2. Also execute through API to update local state and broadcast
      const res = await fetchWithAuth(
        `/api/examinations/${examinationId}/classes/${classId}/register-numbers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registerNumbers: regMap }),
        }
      );

      if (res.ok) {
        logAuditEvent({
          action: 'EXAM_REG_UPDATED',
          details: `User ${user?.name || 'Administrator'} updated exam register numbers for ${className} (${examinationName}).`,
          currentUser: user,
          recordType: 'exam_register_numbers',
          recordId: `${examinationId}_${classId}`,
        }).catch(e => console.warn('Audit log error:', e));

        setSavedSuccess(true);
        setTimeout(() => {
          onSaved();
          onClose();
        }, 800);
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to save register numbers');
      }
    } catch (err: any) {
      setError(err.message || 'Error saving register numbers');
    } finally {
      setSaving(false);
    }
  };

  const boysCount = students.filter(s => !(s.gender || 'M').toUpperCase().startsWith('F')).length;
  const girlsCount = students.filter(s => (s.gender || 'M').toUpperCase().startsWith('F')).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
        className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5 transition-shadow"
      >
        {/* Modal Header & Draggable Grip */}
        <div
          onMouseDown={handleMouseDown}
          className="flex items-start justify-between border-b border-slate-200 pb-3 cursor-grab active:cursor-grabbing select-none"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                <Hash className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Assign Exam Register Numbers
              </h2>
              <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium ml-1">
                <GripHorizontal className="w-3 h-3 text-slate-400" /> Movable Dialog
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {className} • {examinationName} ({students.length} Students: {boysCount} Boys, {girlsCount} Girls)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Advanced Auto-Generation Tool for Boys & Girls */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="font-bold text-emerald-950 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-700" />
              Sequential Starting Numbers (Boys &amp; Girls)
            </span>
            <span className="text-[11px] text-emerald-900 font-semibold bg-emerald-100/70 px-2.5 py-0.5 rounded-md border border-emerald-300/60">
              Boys start from {boyStartNo || '—'}, Girls start from {girlStartNo || '—'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-lg border border-emerald-200 flex items-center justify-between shadow-xs">
              <div className="pr-2">
                <label htmlFor="boyStartNoInput" className="font-bold text-blue-900 block text-[11px]">
                  Boy Starting Number (e.g. 1101 or 7101)
                </label>
                <span className="text-[10px] text-slate-500">
                  Boys start from {boyStartNo || '—'}
                </span>
              </div>
              <input
                id="boyStartNoInput"
                type="text"
                value={boyStartNo}
                onChange={e => setBoyStartNo(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-24 px-2.5 py-1 text-center bg-blue-50/50 border border-blue-300 rounded font-mono text-xs font-bold text-blue-950 focus:outline-emerald-700 focus:ring-1 focus:ring-emerald-700"
                placeholder={`${classNumeral}101`}
              />
            </div>

            <div className="bg-white p-3 rounded-lg border border-emerald-200 flex items-center justify-between shadow-xs">
              <div className="pr-2">
                <label htmlFor="girlStartNoInput" className="font-bold text-purple-900 block text-[11px]">
                  Girl Starting Number (e.g. 1201 or 7201)
                </label>
                <span className="text-[10px] text-slate-500">
                  Girls start from {girlStartNo || '—'}
                </span>
              </div>
              <input
                id="girlStartNoInput"
                type="text"
                value={girlStartNo}
                onChange={e => setGirlStartNo(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-24 px-2.5 py-1 text-center bg-purple-50/50 border border-purple-300 rounded font-mono text-xs font-bold text-purple-950 focus:outline-emerald-700 focus:ring-1 focus:ring-emerald-700"
                placeholder={`${classNumeral}201`}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-slate-500">
              Sorted strictly: Boys A-Z first, then Girls A-Z
            </span>
            <button
              type="button"
              onClick={handleAutoGenerateGenderSequential}
              className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg shadow-xs transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Auto-Generate Sequential Register Numbers
            </button>
          </div>
        </div>

        {/* Student Table */}
        {loading ? (
          <div className="py-12 text-center text-xs text-slate-500 flex justify-center items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
            Loading class students...
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 w-12 text-center font-mono">Roll</th>
                  <th className="py-2.5 px-3 w-16 text-center">Gender</th>
                  <th className="py-2.5 px-2 w-20 text-center font-mono">Adm No</th>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3 w-28 text-center font-mono">Reg No</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => {
                  const isGirl = !isBoyStudent(student.gender);
                  return (
                    <tr key={student.studentId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600">
                        {student.rollNo}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isGirl ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {isGirl ? 'Girl' : 'Boy'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600 w-20">
                        {student.admissionNo}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {student.nameEn}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="text"
                          value={regMap[student.studentId] ?? ''}
                          onChange={e =>
                            setRegMap({
                              ...regMap,
                              [student.studentId]: e.target.value,
                            })
                          }
                          placeholder={isGirl ? (girlStartNo || '7201') : (boyStartNo || '7101')}
                          className="w-full px-2.5 py-1 text-center font-mono font-bold border border-slate-300 rounded-lg text-emerald-950 focus:ring-1 focus:ring-emerald-700 focus:outline-none bg-white"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {savedSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">
              Exam register numbers successfully synced to Firestore and saved permanently!
            </span>
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                Save Exam Register Numbers
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
