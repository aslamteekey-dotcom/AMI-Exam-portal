import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ClassItem, Examination, StudentProgressReport, InstitutionSettings } from '../../types';
import { ProgressReportCard } from '../Report/ProgressReportCard';
import { Printer, Download, Eye, Layers } from 'lucide-react';

export const BulkReportsPrint: React.FC = () => {
  const { fetchWithAuth, lang, t } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [examinations, setExaminations] = useState<Examination[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [reportsData, setReportsData] = useState<{
    reports: StudentProgressReport[];
    settings: InstitutionSettings;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [activeSingleReport, setActiveSingleReport] = useState<StudentProgressReport | null>(null);

  const isMl = lang === 'ml';

  const loadInitial = async () => {
    setLoading(true);
    try {
      const [resC, resE] = await Promise.all([
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/examinations'),
      ]);
      const cData = await resC.json();
      const eData = await resE.json();
      setClasses(cData);
      setExaminations(eData);
      if (cData.length > 0) setSelectedClassId(cData[2]?.id || cData[0].id); // default to Class 3
      if (eData.length > 0) setSelectedExamId(eData[0].id);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  const handleFetchClassReports = async () => {
    if (!selectedClassId || !selectedExamId) return;
    setFetching(true);
    try {
      const res = await fetchWithAuth(`/api/reports/class/${selectedClassId}/exam/${selectedExamId}`);
      if (res.ok) {
        const data = await res.json();
        setReportsData(data);
      }
    } catch (err) {
      alert('Failed to generate batch reports');
    } finally {
      setFetching(false);
    }
  };

  if (loading) {
    return <div className="text-center py-10 text-xs text-slate-500">Loading progress report center...</div>;
  }

  if (activeSingleReport && reportsData) {
    return (
      <ProgressReportCard
        report={activeSingleReport}
        settings={reportsData.settings}
        onBack={() => setActiveSingleReport(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Class Progress Report Generator & Printing</h2>
          <p className="text-xs text-slate-500">
            Generate, inspect, and batch-print official A4 Progress Reports for any class in the Madrasa.
          </p>
        </div>

        {reportsData && (
          <a
            href={`/api/export/class-results-csv?classId=${selectedClassId}&examId=${selectedExamId}`}
            download
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export Class Results CSV
          </a>
        )}
      </div>

      {/* Selector Box */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-4 text-xs">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Select Class:</label>
          <select
            value={selectedClassId}
            onChange={e => {
              setSelectedClassId(e.target.value);
              setReportsData(null);
            }}
            className="p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-none"
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-bold text-slate-700 mb-1">Select Examination:</label>
          <select
            value={selectedExamId}
            onChange={e => {
              setSelectedExamId(e.target.value);
              setReportsData(null);
            }}
            className="p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-none"
          >
            {examinations.map(e => (
              <option key={e.id} value={e.id}>
                {isMl ? e.nameMl : e.nameEn}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-4">
          <button
            onClick={handleFetchClassReports}
            disabled={fetching}
            className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50"
          >
            {fetching ? 'Generating...' : 'Load Class Reports'}
          </button>
        </div>
      </div>

      {/* Reports Roster */}
      {reportsData && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h3 className="text-base font-bold text-slate-900">
              Student Progress Reports ({reportsData.reports.length} students)
            </h3>
            <span className="text-xs text-slate-500">
              Click "View & Print" to inspect student's official A4 Progress Report card.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportsData.reports.map(rep => (
              <div
                key={rep.student.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-md">
                      Roll #{rep.student.rollNo}
                    </span>
                    <span className="text-xs font-bold text-amber-700 font-mono">
                      {rep.classRank ? `Rank #${rep.classRank}` : 'No Rank'}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm mt-2">
                    {rep.student.nameEn}
                  </h4>
                  <p className="text-xs text-slate-500">{rep.student.nameMl}</p>

                  <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-600">
                      Total: <strong>{rep.totalObtainedMarks} / {rep.totalMaxMarks}</strong>
                    </span>
                    <span className="font-bold text-emerald-900">
                      {rep.percentage !== null ? `${rep.percentage}%` : 'N/A'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveSingleReport(rep)}
                  className="w-full py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-2xs flex items-center justify-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View, Download & Print A4 Report
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
