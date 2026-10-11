import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ClassItem, SubjectItem, SubjectAssessmentRule } from '../../types';
import { BookOpen, Layers, CheckCircle, Info, Edit, Plus, AlertCircle } from 'lucide-react';

export const ClassSubjectConfig: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<ClassItem | null>(null);

  // Edit component modal
  const [editingSubject, setEditingSubject] = useState<SubjectItem | null>(null);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resCls, resSubs] = await Promise.all([
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/subjects'),
      ]);
      const clsData = await resCls.json();
      const subsData = await resSubs.json();
      setClasses(clsData);
      setSubjects(subsData);
      if (clsData.length > 0) {
        setSelectedClass(clsData[0]);
      }
    } catch (err) {
      console.error('Error loading config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return <div className="text-center py-10 text-xs text-slate-500">Loading curriculum settings...</div>;
  }

  // Get subjects applicable to selected class
  const classSubjects = selectedClass
    ? subjects.filter(s => s.applicableClasses.includes(selectedClass.numericGrade))
    : [];

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-lg font-bold text-slate-900">{t.navClassesSubjects}</h2>
        <p className="text-xs text-slate-500">
          Classes 1 to 9 curriculum, subject mappings, and 50-mark assessment component breakdown.
        </p>
      </div>

      {/* Madrasa Rule Notice Banner */}
      <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-xs space-y-1.5 text-emerald-950">
        <div className="flex items-center gap-2 font-bold text-emerald-900">
          <Info className="w-4 h-4 text-emerald-700" />
          <span>Institutional Assessment Rules & Curriculum Configuration:</span>
        </div>
        <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-emerald-900/90 leading-relaxed">
          <li>
            <strong>Class 1:</strong> Does NOT have Tilawah (Tilawah is omitted per syllabus).
          </li>
          <li>
            <strong>Classes 2–3:</strong> Tilawah component 2 is <em>Tilawati (10)</em>.
          </li>
          <li>
            <strong>Classes 4–9:</strong> Tilawah component 2 is <em>Tajweed (10)</em>.
          </li>
          <li>
            <strong>Class 9:</strong> Subject name is <em>Buhuth (ബുഹൂസ്)</em> instead of History.
          </li>
          <li>
            <strong>Max Marks:</strong> All subjects total 50 marks. Component distributions sum to 50.
          </li>
        </ul>
      </div>

      {/* Class Selection Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2">
        {classes.map(c => {
          const isSelected = selectedClass?.id === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedClass(c)}
              className={`p-3 rounded-xl border text-center transition font-bold text-xs ${
                isSelected
                  ? 'bg-emerald-800 text-white border-emerald-900 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}
            >
              <div>{isMl ? c.nameMl : c.name}</div>
              <div className="text-[10px] font-normal opacity-80 mt-0.5">Grade {c.numericGrade}</div>
            </button>
          );
        })}
      </div>

      {/* Selected Class Subjects View */}
      {selectedClass && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Subjects for {isMl ? selectedClass.nameMl : selectedClass.name} ({classSubjects.length} subjects)
              </h3>
              <p className="text-xs text-slate-500">
                Total Max Marks:{' '}
                <strong className="text-emerald-900 font-mono font-bold">
                  {classSubjects.length * 50}
                </strong>{' '}
                marks
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classSubjects.map(sub => {
              // Strictly Malayalam subject display
              const displayName =
                selectedClass.numericGrade === 9 && (sub.id === 'sub_history_buhuth' || sub.code === 'HST')
                  ? 'ബുഹൂസ്'
                  : sub.nameMl || sub.nameEn;

              // Check override components
              const components: SubjectAssessmentRule[] =
                sub.classComponentOverrides && sub.classComponentOverrides[selectedClass.numericGrade]
                  ? sub.classComponentOverrides[selectedClass.numericGrade]
                  : sub.defaultComponents;

              const totalMarks = components.reduce((sum, c) => sum + c.maxMarks, 0);

              return (
                <div
                  key={sub.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        {displayName}
                      </h4>
                      <span className="text-[10px] font-mono text-slate-400">{sub.code}</span>
                    </div>
                    <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                      {totalMarks} Marks
                    </span>
                  </div>

                  {/* Components Breakdown */}
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Assessment Components:
                    </span>
                    {components.map(comp => (
                      <div
                        key={comp.componentKey}
                        className="flex justify-between items-center text-slate-700 py-0.5 border-b border-slate-100 last:border-none"
                      >
                        <span className="font-medium">
                          {comp.labelEn}
                        </span>
                        <span className="font-mono font-bold text-emerald-900">
                          {comp.maxMarks}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
