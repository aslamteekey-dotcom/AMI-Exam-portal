import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Hash, Sparkles, Check, X, Loader2 } from 'lucide-react';

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
  const { fetchWithAuth } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<StudentRegItem[]>([]);
  const [regMap, setRegMap] = useState<Record<string, string>>({});
  const [prefix, setPrefix] = useState('260');

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
        setStudents(data);
        const initialMap: Record<string, string> = {};
        data.forEach(s => {
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

  const handleAutoGenerate = () => {
    const newMap: Record<string, string> = {};
    students.forEach((s, idx) => {
      const numStr = String(idx + 1).padStart(2, '0');
      newMap[s.studentId] = `${prefix}${numStr}`;
    });
    setRegMap(newMap);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(
        `/api/examinations/${examinationId}/classes/${classId}/register-numbers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registerNumbers: regMap }),
        }
      );
      if (res.ok) {
        alert('Exam register numbers successfully assigned and saved!');
        onSaved();
        onClose();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save register numbers');
      }
    } catch (err: any) {
      alert(err.message || 'Error saving register numbers');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                <Hash className="w-4 h-4" />
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Assign Exam Register Numbers
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {className} • {examinationName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Generation Helper Bar */}
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-emerald-950">Number Prefix:</span>
            <input
              type="text"
              value={prefix}
              onChange={e => setPrefix(e.target.value)}
              className="w-24 px-2 py-1 bg-white border border-emerald-300 rounded-lg font-mono text-xs font-bold"
              placeholder="e.g. 260"
            />
          </div>

          <button
            type="button"
            onClick={handleAutoGenerate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-2xs transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Auto-Generate Sequential ({prefix}01, {prefix}02...)
          </button>
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
                  <th className="py-2.5 px-3 w-14 text-center">Roll</th>
                  <th className="py-2.5 px-3 w-28">Adm No</th>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3 w-40 text-center">Exam Register No</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((student) => (
                  <tr key={student.studentId} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600">
                      {student.rollNo}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
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
                        placeholder={`e.g. ${prefix}${String(student.rollNo).padStart(2, '0')}`}
                        className="w-full px-2.5 py-1 text-center font-mono font-bold border border-slate-300 rounded-lg text-emerald-950 focus:ring-1 focus:ring-emerald-700 focus:outline-none bg-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl shadow-xs transition disabled:opacity-50"
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
