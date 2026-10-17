import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  FeePayment,
  Student,
  ClassItem,
  TUITION_FEE_MONTHS,
  FeeMonth,
  SpecialFeeBreakdown,
  sortStudentsBoysFirst,
} from '../../types';
import { handleHorizontalWheel } from '../../hooks/useHorizontalScroll';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  CheckCircle,
  Clock,
  Printer,
  Trash2,
  Calendar,
  X,
  FileText,
  DollarSign,
  Download,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export const FeeManagement: React.FC = () => {
  const { fetchWithAuth, lang, t, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);

  // Filters & State
  const [selectedClassId, setSelectedClassId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<'ledger' | 'receipts'>('ledger');

  // New Payment Modal State
  const [showPayModal, setShowPayModal] = useState(false);
  const [payStudentId, setPayStudentId] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payAdmissionFee, setPayAdmissionFee] = useState<number>(0);
  const [paySelectedMonths, setPaySelectedMonths] = useState<FeeMonth[]>([]);
  const [paySpecialFees, setPaySpecialFees] = useState<SpecialFeeBreakdown>({});
  const [payDonation, setPayDonation] = useState<number>(0);
  const [payNotes, setPayNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // View/Print Receipt Modal State
  const [activeReceipt, setActiveReceipt] = useState<FeePayment | null>(null);
  const receiptPrintRef = useRef<HTMLDivElement>(null);

  const isMl = lang === 'ml';

  const loadData = async () => {
    setLoading(true);
    try {
      const [resC, resS, resP] = await Promise.all([
        fetchWithAuth('/api/classes'),
        fetchWithAuth('/api/students'),
        fetchWithAuth('/api/fees/payments'),
      ]);
      const cData: ClassItem[] = await resC.json();
      const sData: Student[] = await resS.json();
      const pData: FeePayment[] = await resP.json();

      const uniqueStudents = Array.from(
        new Map((sData || []).map(s => [s.admissionNo?.toString() || s.id, s])).values()
      );
      setStudents(sortStudentsBoysFirst(uniqueStudents));
      setPayments(pData);
      if (cData.length > 0 && !selectedClassId) {
        setSelectedClassId(cData[0].id);
      }
    } catch (err) {
      console.error('Error loading fees data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Helper to convert number to words for Indian Rupees
  const numberToWords = (num: number): string => {
    if (num <= 0) return 'Zero Rupees Only';
    const a = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (n: number): string => {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
      if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '');
      if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
      if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
      return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
    };

    return inWords(num).trim() + ' Rupees Only';
  };

  // Student already paid months lookup
  const getPaidMonthsForStudent = (sId: string): Set<string> => {
    const studentPayments = payments.filter(p => p.studentId === sId);
    const set = new Set<string>();
    studentPayments.forEach(p => {
      (p.tuitionFeeMonths || []).forEach(m => set.add(m));
    });
    return set;
  };

  // Open pay modal prefilled for a student
  const handleOpenPayForStudent = (student: Student) => {
    setPayStudentId(student.id);
    const paidMonths = getPaidMonthsForStudent(student.id);
    // Auto select the first unpaid month
    const nextUnpaid = TUITION_FEE_MONTHS.find(m => !paidMonths.has(m));
    setPaySelectedMonths(nextUnpaid ? [nextUnpaid] : []);
    setPayAdmissionFee(0);
    setPaySpecialFees({});
    setPayDonation(0);
    setPayNotes('');
    setPayDate(new Date().toISOString().split('T')[0]);
    setShowPayModal(true);
  };

  // Calculate totals for payment modal
  const tuitionAmount = paySelectedMonths.length * 300;
  const specialTotal = Object.values(paySpecialFees).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const grandTotal = (Number(payAdmissionFee) || 0) + tuitionAmount + specialTotal + (Number(payDonation) || 0);

  // Submit payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payStudentId) {
      alert('Please select a student.');
      return;
    }
    const student = students.find(s => s.id === payStudentId);
    if (!student) return;
    const cls = classes.find(c => c.id === student.classId);

    setIsSubmitting(true);
    try {
      const payload = {
        date: payDate,
        studentId: student.id,
        studentName: student.nameEn,
        admissionNo: student.admissionNo,
        classId: student.classId,
        className: cls?.name || 'Class',
        admissionFee: payAdmissionFee,
        tuitionFeeMonths: paySelectedMonths,
        tuitionFeeAmount: tuitionAmount,
        specialFeeComponents: paySpecialFees,
        specialFeeAmount: specialTotal,
        donationAmount: payDonation,
        totalAmount: grandTotal,
        amountInWords: numberToWords(grandTotal),
        notes: payNotes,
        collectedBy: user?.name || 'Office',
      };

      const res = await fetchWithAuth('/api/fees/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to record fee payment');
      }

      const createdPayment: FeePayment = await res.json();
      setShowPayModal(false);
      await loadData();
      setActiveReceipt(createdPayment);
    } catch (err: any) {
      alert(err.message || 'Error recording payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete payment receipt
  const handleDeletePayment = async (paymentId: string, receiptNo: string) => {
    if (!window.confirm(`Are you sure you want to delete fee receipt ${receiptNo}? This will revert student payment status.`)) {
      return;
    }
    try {
      const res = await fetchWithAuth(`/api/fees/payments/${paymentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete receipt');
      await loadData();
      alert(`Receipt ${receiptNo} deleted successfully.`);
    } catch (err: any) {
      alert(err.message || 'Error deleting receipt');
    }
  };

  // Filtering with strict Boys first, then Girls alphabetical sorting
  const filteredStudents = sortStudentsBoysFirst(
    students.filter(s => {
      const matchClass = selectedClassId ? s.classId === selectedClassId : true;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchClass;
      const matchQuery =
        s.nameEn.toLowerCase().includes(q) ||
        s.admissionNo.toLowerCase().includes(q) ||
        (s.parentNameEn && s.parentNameEn.toLowerCase().includes(q));
      return matchClass && matchQuery;
    })
  );

  const filteredPayments = payments.filter(p => {
    const matchClass = selectedClassId ? p.classId === selectedClassId : true;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchClass;
    const matchQuery =
      p.receiptNo.toLowerCase().includes(q) ||
      p.studentName.toLowerCase().includes(q) ||
      p.admissionNo.toLowerCase().includes(q);
    return matchClass && matchQuery;
  });

  // Overview metrics
  const totalCollections = payments.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
  const tuitionCollections = payments.reduce((sum, p) => sum + (Number(p.tuitionFeeAmount) || 0), 0);
  const specialCollections = payments.reduce((sum, p) => sum + (Number(p.specialFeeAmount) || 0), 0);
  const totalReceipts = payments.length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {isMl ? 'മദ്റസ ഫീസ് മാനേജ്മെന്റ്' : 'Madrasa Fees & Financial Ledger'}
          </h2>
          <p className="text-xs text-slate-500">
            {isMl
              ? 'പ്രതിമാസ ട്യൂഷൻ ഫീസ് (₹300/മാസം), പൊതുപരീക്ഷ, ദേശീയ പരീക്ഷ, വികാസനം എന്നിവയുടെ രസീത് മാനേജ്മെന്റ്.'
              : '12-month tuition installments (₹300/mo), board examination, special funds, and instant printable receipts.'}
          </p>
        </div>

        <button
          onClick={() => {
            setPayStudentId('');
            setPaySelectedMonths([]);
            setPayAdmissionFee(0);
            setPaySpecialFees({});
            setPayDonation(0);
            setPayNotes('');
            setPayDate(new Date().toISOString().split('T')[0]);
            setShowPayModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {isMl ? 'ഫീസ് രേഖപ്പെടുത്തുക' : 'Record Fee Payment'}
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-xs">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Total Collections</span>
          <span className="text-2xl font-black text-emerald-950 font-mono mt-1 block">
            ₹{totalCollections.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-slate-400">All fees & funds received</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Tuition Fees</span>
          <span className="text-2xl font-black text-blue-900 font-mono mt-1 block">
            ₹{tuitionCollections.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-slate-400">₹300 monthly installments</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Special & Exam Fees</span>
          <span className="text-2xl font-black text-purple-900 font-mono mt-1 block">
            ₹{specialCollections.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-slate-400">Board exams, Vikasanam, CCA</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase block">Receipts Issued</span>
          <span className="text-2xl font-black text-slate-900 font-mono mt-1 block">
            {totalReceipts}
          </span>
          <span className="text-[10px] text-slate-400">Sequential receipt records</span>
        </div>
      </div>

      {/* Control Bar: Class Filter, Search, Sub-tabs */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Class:
            </span>
            <select
              value={selectedClassId}
              onChange={e => setSelectedClassId(e.target.value)}
              className="p-2 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-none cursor-pointer"
            >
              <option value="">All Classes</option>
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.nameMl && `(${c.nameMl})`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveSubTab('ledger')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeSubTab === 'ledger'
                  ? 'bg-white text-emerald-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month-by-Month Progress Ledger
            </button>
            <button
              onClick={() => setActiveSubTab('receipts')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                activeSubTab === 'receipts'
                  ? 'bg-white text-emerald-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Receipts History ({payments.length})
            </button>
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search student, adm, receipt..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-xl bg-slate-50/50 text-xs focus:outline-none"
          />
        </div>
      </div>

      {/* VIEW 1: MONTH-BY-MONTH STUDENT PROGRESS LEDGER */}
      {activeSubTab === 'ledger' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                12-Month Tuition Installment Progress Tracker
              </h3>
              <p className="text-[11px] text-slate-500">
                Green badge indicates paid monthly installment (₹300). Click "Pay" to record newly received months.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-lg">
              {filteredStudents.length} Students Active
            </span>
          </div>

          <div
            onWheel={handleHorizontalWheel}
            className="overflow-x-auto"
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3 w-12 text-center">Roll</th>
                  <th className="py-2.5 px-3 w-24">Adm No</th>
                  <th className="py-2.5 px-3 min-w-[150px]">Student Name</th>
                  {TUITION_FEE_MONTHS.map(m => (
                    <th key={m} className="py-2 px-1 text-center font-mono text-[10px] w-12">
                      {m.split(' ')[0].substring(0, 3)}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-center">Paid / 12</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="p-8 text-center text-slate-400">
                      No student records found matching the current class and search query.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map(student => {
                    const paidMonths = getPaidMonthsForStudent(student.id);
                    const paidCount = paidMonths.size;

                    return (
                      <tr key={student.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-600">
                          {student.rollNo}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-700">
                          {student.admissionNo}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-bold text-slate-900 block">{student.nameEn}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {student.parentNameEn || '—'}
                          </span>
                        </td>

                        {/* 12 Months Indicators */}
                        {TUITION_FEE_MONTHS.map(m => {
                          const isPaid = paidMonths.has(m);
                          return (
                            <td key={m} className="py-2 px-1 text-center">
                              {isPaid ? (
                                <span
                                  title={`${m}: Paid`}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-emerald-600 text-white text-[10px] font-bold shadow-2xs"
                                >
                                  ✓
                                </span>
                              ) : (
                                <span
                                  title={`${m}: Pending`}
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 text-slate-400 text-[10px]"
                                >
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}

                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              paidCount === 12
                                ? 'bg-emerald-100 text-emerald-800'
                                : paidCount > 0
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {paidCount} / 12
                          </span>
                        </td>

                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleOpenPayForStudent(student)}
                            className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition shadow-2xs cursor-pointer"
                          >
                            Pay
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: RECEIPTS HISTORY */}
      {activeSubTab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-900">
              Receipt Records & Log ({filteredPayments.length})
            </h3>
          </div>

          <div
            onWheel={handleHorizontalWheel}
            className="overflow-x-auto"
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3 w-20">Receipt #</th>
                  <th className="py-2.5 px-3 w-24">Date</th>
                  <th className="py-2.5 px-3 w-24 font-mono">Adm No</th>
                  <th className="py-2.5 px-3">Student Name</th>
                  <th className="py-2.5 px-3">Class</th>
                  <th className="py-2.5 px-3">Tuition Months</th>
                  <th className="py-2.5 px-3 text-right">Total (₹)</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No fee receipt records found.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-900">
                        {p.receiptNo}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono">
                        {p.date}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {p.admissionNo}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {p.studentName}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium">
                          {p.className}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-600">
                        {(p.tuitionFeeMonths || []).length > 0 ? (
                          <span>
                            {p.tuitionFeeMonths.map(m => m.split(' ')[0]).join(', ')} ({p.tuitionFeeMonths.length} mos)
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-950 text-sm">
                        ₹{p.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setActiveReceipt(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 rounded-lg transition border border-emerald-300 cursor-pointer"
                            title="View & Print Official Receipt"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Receipt
                          </button>
                          <button
                            onClick={() => handleDeletePayment(p.id, p.receiptNo)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                            title="Delete receipt record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: RECORD FEE PAYMENT */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-800" />
                <h3 className="text-base font-bold text-slate-900">Record Madrasa Fee Payment</h3>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Student Selector */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Select Student *</label>
                  <select
                    value={payStudentId}
                    onChange={e => {
                      const sId = e.target.value;
                      setPayStudentId(sId);
                      const paid = getPaidMonthsForStudent(sId);
                      const next = TUITION_FEE_MONTHS.find(m => !paid.has(m));
                      setPaySelectedMonths(next ? [next] : []);
                    }}
                    required
                    className="w-full p-2.5 border border-slate-300 rounded-xl bg-slate-50 font-bold focus:outline-emerald-800 cursor-pointer"
                  >
                    <option value="">-- Choose Student --</option>
                    {students.map(s => {
                      const c = classes.find(cls => cls.id === s.classId);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.nameEn} (Adm: {s.admissionNo} • {c?.name})
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Payment Date */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receipt Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-xl font-mono focus:outline-emerald-800"
                    required
                  />
                </div>
              </div>

              {/* 12 Months Tuition Checkboxes */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-800">
                    Tuition Fee Months (₹300 / month):
                  </span>
                  <span className="font-mono font-bold text-emerald-900 text-xs">
                    ₹{tuitionAmount} ({paySelectedMonths.length} Months)
                  </span>
                </div>

                {payStudentId && (
                  <p className="text-[10px] text-slate-500 mb-3">
                    Months marked with checkmark (✓) are already paid. Check remaining months to include in this receipt.
                  </p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {TUITION_FEE_MONTHS.map(month => {
                    const alreadyPaid = payStudentId ? getPaidMonthsForStudent(payStudentId).has(month) : false;
                    const isSelected = paySelectedMonths.includes(month);

                    return (
                      <label
                        key={month}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-[11px] cursor-pointer transition ${
                          alreadyPaid
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900 cursor-not-allowed opacity-75'
                            : isSelected
                            ? 'bg-emerald-800 text-white border-emerald-900 font-bold shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={alreadyPaid}
                          checked={alreadyPaid || isSelected}
                          onChange={e => {
                            if (alreadyPaid) return;
                            if (e.target.checked) {
                              setPaySelectedMonths(prev => [...prev, month]);
                            } else {
                              setPaySelectedMonths(prev => prev.filter(m => m !== month));
                            }
                          }}
                          className="rounded text-emerald-700 focus:ring-0"
                        />
                        <span className="truncate">{month}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Special Fees Breakdown */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <span className="font-bold text-slate-800 block">
                  Special Fees & Exam Funds Breakdown (Optional):
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Board Exam Fee (₹500 for Cls 7/9)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={paySpecialFees.podhuPareeksha || ''}
                      onChange={e =>
                        setPaySpecialFees({
                          ...paySpecialFees,
                          podhuPareeksha: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Desheeya Pariksha
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={paySpecialFees.desheeyaPariksha || ''}
                      onChange={e =>
                        setPaySpecialFees({
                          ...paySpecialFees,
                          desheeyaPariksha: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Vikasanam (₹130)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={paySpecialFees.vikasanam || ''}
                      onChange={e =>
                        setPaySpecialFees({
                          ...paySpecialFees,
                          vikasanam: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Council & CCA Fund (₹200)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={paySpecialFees.unifiedCouncilFund || ''}
                      onChange={e =>
                        setPaySpecialFees({
                          ...paySpecialFees,
                          unifiedCouncilFund: Number(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Admission Fee (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={payAdmissionFee || ''}
                      onChange={e => setPayAdmissionFee(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">
                      Donation / Other (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={payDonation || ''}
                      onChange={e => setPayDonation(Number(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full p-2 border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes / Remarks (Optional)</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  placeholder="e.g. Paid via Cash / UPI by father"
                  className="w-full p-2.5 border border-slate-300 rounded-xl"
                />
              </div>

              {/* Grand Total Summary Box */}
              <div className="bg-emerald-950 text-white p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-200 block">Total Amount Received:</span>
                  <span className="text-2xl font-black font-mono text-amber-300">
                    ₹{grandTotal.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-emerald-300 block italic">
                    {numberToWords(grandTotal)}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || grandTotal <= 0}
                  className="px-6 py-2.5 text-xs font-bold text-emerald-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Recording...' : 'Generate Receipt & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PRINTABLE OFFICIAL FEE RECEIPT */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4 print:hidden">
              <span className="text-xs font-bold text-slate-700">Official Fee Receipt</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
                <button
                  onClick={() => setActiveReceipt(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Official Slip */}
            <div
              ref={receiptPrintRef}
              className="bg-white text-slate-900 border-2 border-emerald-900 p-6 rounded-xl font-sans relative"
            >
              {/* Header */}
              <div className="text-center border-b border-emerald-800 pb-3 mb-3">
                <div className="font-serif text-emerald-900 text-sm font-bold" dir="rtl">
                  بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                </div>
                <h1 className="text-base font-black uppercase text-emerald-950 font-serif mt-1">
                  Al-Madrasathul Islamiya Pallikkuth
                </h1>
                <h2 className="text-xs font-bold text-emerald-900">
                  അൽ മദ്റസത്തുൽ ഇസ്ലാമിയ്യ പള്ളിക്കുത്ത്
                </h2>
                <div className="text-[10px] font-semibold text-emerald-800 tracking-wide mt-0.5">
                  Islamic Education &amp; Digital Learning
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Reg. No: KEC-8492 • Official Fee Receipt (2026–2027)
                </p>
              </div>

              {/* Receipt Details Header */}
              <div className="flex items-center justify-between text-xs mb-3 font-mono bg-emerald-50/70 p-2 rounded-lg border border-emerald-100">
                <div>
                  <span className="text-slate-500">Receipt No: </span>
                  <strong className="text-emerald-950 text-sm">{activeReceipt.receiptNo}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Date: </span>
                  <strong className="text-slate-800">{activeReceipt.date}</strong>
                </div>
              </div>

              {/* Student Metadata */}
              <div className="text-xs space-y-1 mb-4 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <div className="flex justify-between">
                  <span className="text-slate-500">Student Name:</span>
                  <strong className="text-slate-900">{activeReceipt.studentName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Admission No:</span>
                  <span className="font-mono font-bold text-slate-800">{activeReceipt.admissionNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Class:</span>
                  <strong className="text-emerald-900">{activeReceipt.className}</strong>
                </div>
              </div>

              {/* Breakdown Table */}
              <table className="w-full text-xs mb-4 border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-600 font-bold">
                    <th className="py-1.5 text-left">Description</th>
                    <th className="py-1.5 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeReceipt.admissionFee > 0 && (
                    <tr>
                      <td className="py-1 text-slate-800">Admission Fee</td>
                      <td className="py-1 text-right font-mono">₹{activeReceipt.admissionFee}</td>
                    </tr>
                  )}
                  {activeReceipt.tuitionFeeAmount > 0 && (
                    <tr>
                      <td className="py-1 text-slate-800">
                        Tuition Fee ({activeReceipt.tuitionFeeMonths?.length || 0} months)
                        <div className="text-[10px] text-slate-500">
                          {(activeReceipt.tuitionFeeMonths || []).join(', ')}
                        </div>
                      </td>
                      <td className="py-1 text-right font-mono font-bold">₹{activeReceipt.tuitionFeeAmount}</td>
                    </tr>
                  )}
                  {activeReceipt.specialFeeComponents && Object.entries(activeReceipt.specialFeeComponents).map(([k, val]) => {
                    if (!val) return null;
                    return (
                      <tr key={k}>
                        <td className="py-1 text-slate-800 capitalize">{k.replace(/([A-Z])/g, ' $1')}</td>
                        <td className="py-1 text-right font-mono">₹{val}</td>
                      </tr>
                    );
                  })}
                  {activeReceipt.donationAmount > 0 && (
                    <tr>
                      <td className="py-1 text-slate-800">Donation / Other</td>
                      <td className="py-1 text-right font-mono">₹{activeReceipt.donationAmount}</td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-emerald-900 font-bold">
                    <td className="py-2 text-emerald-950 uppercase text-xs">Total Received</td>
                    <td className="py-2 text-right font-mono text-emerald-950 text-sm font-black">
                      ₹{activeReceipt.totalAmount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="text-[10px] text-slate-600 italic mb-6">
                <strong>In Words: </strong> {activeReceipt.amountInWords || numberToWords(activeReceipt.totalAmount)}
              </div>

              {/* Signature Row */}
              <div className="flex items-end justify-between pt-6 border-t border-slate-200 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Collected By:</div>
                  <div className="font-semibold text-slate-700">{activeReceipt.collectedBy || 'Office'}</div>
                </div>
                <div className="text-center">
                  <div className="font-serif italic font-bold text-emerald-900 text-xs mb-1">ASLAM TK</div>
                  <div className="border-t border-slate-400 pt-1 text-[10px] font-bold text-slate-600">
                    Authorized Signatory
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
