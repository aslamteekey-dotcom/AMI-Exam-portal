import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Folder,
  FileText,
  File,
  Image as ImageIcon,
  Eye,
  Download,
  ChevronRight,
  ArrowLeft,
  Search,
  BookOpen,
  HelpCircle,
  FileQuestion,
  Sparkles,
  HardDrive,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { StudyMaterialFolder, StudyMaterialFile, DEFAULT_ROOT_FOLDERS } from '../../types';
import { studyMaterialsService } from '../../services/studyMaterialsService';

interface Props {
  onBackToHome?: () => void;
}

export const StudyMaterialsView: React.FC<Props> = ({ onBackToHome }) => {
  const { lang, t } = useAuth();
  const isMl = lang === 'ml';

  const [folders, setFolders] = useState<StudyMaterialFolder[]>([]);
  const [files, setFiles] = useState<StudyMaterialFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Real-time Firestore subscriptions for folders & files
  useEffect(() => {
    studyMaterialsService.initDefaultFolders().catch(console.warn);

    const unsubFolders = studyMaterialsService.subscribeFolders(list => {
      setFolders(list);
    });

    const unsubFiles = studyMaterialsService.subscribeFiles(list => {
      setFiles(list);
    });

    return () => {
      unsubFolders();
      unsubFiles();
    };
  }, []);

  // Current folder
  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    return folders.find(f => f.id === currentFolderId) || null;
  }, [currentFolderId, folders]);

  // Breadcrumbs path
  const breadcrumbs = useMemo(() => {
    const crumbs: StudyMaterialFolder[] = [];
    let curId = currentFolderId;
    while (curId) {
      const f = folders.find(item => item.id === curId);
      if (f) {
        crumbs.unshift(f);
        curId = f.parentId;
      } else {
        break;
      }
    }
    return crumbs;
  }, [currentFolderId, folders]);

  // Subfolders of current location
  const displayedFolders = useMemo(() => {
    return folders.filter(f => {
      const matchesParent = currentFolderId ? f.parentId === currentFolderId : f.parentId === null;
      if (!matchesParent) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        f.name.toLowerCase().includes(q) ||
        (f.nameMl && f.nameMl.toLowerCase().includes(q))
      );
    });
  }, [folders, currentFolderId, searchQuery]);

  // Files in current location
  const displayedFiles = useMemo(() => {
    if (!currentFolderId) return [];
    return files.filter(f => {
      const inFolder = f.folderId === currentFolderId;
      if (!inFolder) return false;
      if (!searchQuery.trim()) return true;
      return f.name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [files, currentFolderId, searchQuery]);

  // Helper to count items in a folder
  const getItemCount = (fId: string) => {
    const subFolderCount = folders.filter(f => f.parentId === fId).length;
    const fileCount = files.filter(f => f.folderId === fId).length;
    return { subFolderCount, fileCount, total: subFolderCount + fileCount };
  };

  // Helper for file size display
  const formatFileSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Helper for file type icon
  const getFileIcon = (fileType: string, fileName: string) => {
    const lower = (fileName + ' ' + fileType).toLowerCase();
    if (lower.includes('pdf')) {
      return (
        <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5" />
        </div>
      );
    }
    if (lower.includes('png') || lower.includes('jpg') || lower.includes('jpeg') || lower.includes('webp') || lower.includes('image')) {
      return (
        <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center shrink-0">
          <ImageIcon className="w-5 h-5" />
        </div>
      );
    }
    if (lower.includes('doc') || lower.includes('word') || lower.includes('text')) {
      return (
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
          <File className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center justify-center shrink-0">
        <File className="w-5 h-5" />
      </div>
    );
  };

  // Direct download file trigger
  const handleDownload = async (file: StudyMaterialFile) => {
    try {
      const response = await fetch(file.downloadUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      const a = document.createElement('a');
      a.href = file.downloadUrl;
      a.download = file.name;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Root folder descriptive text & color accents
  const getRootFolderMeta = (fId: string) => {
    if (fId === 'root_question_papers') {
      return {
        icon: <FileQuestion className="w-8 h-8 text-emerald-800" />,
        badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        cardBg: 'from-emerald-50/80 via-white to-emerald-50/40 border-emerald-200 hover:border-emerald-500',
        desc: isMl
          ? 'വാർഷിക, അർദ്ധവാർഷിക പരീക്ഷാ ചോദ്യപേപ്പറുകളും മുൻവർഷ ചോദ്യശേഖരങ്ങളും.'
          : 'Term examinations, model question papers, and past question papers for revision.',
      };
    }
    if (fId === 'root_hikma_questions') {
      return {
        icon: <HelpCircle className="w-8 h-8 text-amber-700" />,
        badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
        cardBg: 'from-amber-50/80 via-white to-amber-50/40 border-amber-200 hover:border-amber-500',
        desc: isMl
          ? 'ഹിക്മ പരീക്ഷകൾ, ക്വിസ് മത്സര ചോദ്യങ്ങൾ, ഇസ്ലാമിക് ജനറൽ നോളജ് ചോദ്യങ്ങൾ.'
          : 'Hikma competition questions, quiz modules, and Islamic knowledge worksheets.',
      };
    }
    if (fId === 'root_textbooks') {
      return {
        icon: <BookOpen className="w-8 h-8 text-teal-800" />,
        badgeBg: 'bg-teal-100 text-teal-900 border-teal-300',
        cardBg: 'from-teal-50/80 via-white to-teal-50/40 border-teal-200 hover:border-teal-500',
        desc: isMl
          ? 'മദ്റസ സിലബസ് പാഠപുസ്തകങ്ങൾ, ഖുർആൻ തജ്‌വീദ് പാഠങ്ങൾ, ഡിജിറ്റൽ പുസ്തകങ്ങൾ.'
          : 'Official board textbooks, syllabus curriculum modules, and reference texts.',
      };
    }
    return {
      icon: <Folder className="w-8 h-8 text-emerald-800" />,
      badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      cardBg: 'from-slate-50 via-white to-slate-50 border-slate-200 hover:border-emerald-400',
      desc: 'Madrasa study materials and learning resources.',
    };
  };

  return (
    <div className="space-y-6">
      {/* Forest Green Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 text-white rounded-3xl p-6 sm:p-7 shadow-md relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          <div className="font-serif text-emerald-300 text-sm font-bold text-center sm:text-left" dir="rtl">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-800/90 text-emerald-200 border border-emerald-700/60 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>{isMl ? 'ഡിജിറ്റൽ പഠന വിഭവങ്ങൾ' : 'Student Resource Library'}</span>
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold font-serif text-white tracking-tight">
                {isMl ? 'പഠന സാമഗ്രികൾ & ചോദ്യപേപ്പറുകൾ' : 'Study Materials & Question Papers'}
              </h1>
              <p className="text-xs text-emerald-200 max-w-2xl leading-relaxed mt-1">
                {isMl
                  ? 'ചോദ്യപേപ്പറുകൾ, ഹിക്മ ചോദ്യങ്ങൾ, ഡിജിറ്റൽ പാഠപുസ്തകങ്ങൾ എന്നിവ ഡൗൺലോഡ് ചെയ്യാനും പരിശോധിക്കാനും ഇവിടെ ലഭ്യമാണ്.'
                  : 'Access official examination question papers, Hikma competition preparation materials, and digital textbooks.'}
              </p>
            </div>

            {onBackToHome && (
              <button
                type="button"
                onClick={onBackToHome}
                className="self-start sm:self-center flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-100 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{isMl ? 'ഹോം പേജിലേക്ക്' : 'Back to Home'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Study Materials Explorer */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Navigation Breadcrumb Bar & Search */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs flex-wrap font-medium">
            <button
              type="button"
              onClick={() => setCurrentFolderId(null)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl transition cursor-pointer ${
                currentFolderId === null
                  ? 'bg-emerald-800 text-white font-bold shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{isMl ? 'എല്ലാ വിഭാഗങ്ങളും' : 'All Categories'}</span>
            </button>

            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(crumb.id)}
                    className={`px-3 py-1.5 rounded-xl transition cursor-pointer max-w-[200px] truncate ${
                      isLast
                        ? 'bg-emerald-800 text-white font-bold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    {isMl && crumb.nameMl ? crumb.nameMl : crumb.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Quick Search & Back Button */}
          <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
            {currentFolderId && (
              <button
                type="button"
                onClick={() => {
                  const parentId = currentFolder?.parentId || null;
                  setCurrentFolderId(parentId);
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{isMl ? 'മുകളിലേക്ക്' : 'Up One Level'}</span>
              </button>
            )}

            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={isMl ? 'തിരയുക...' : 'Search study materials...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl bg-white focus:outline-emerald-800 focus:ring-1 focus:ring-emerald-800"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Contents Area */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* ROOT LEVEL: Show 3 Permanent Categories as Large, Prominent Modern Cards */}
          {currentFolderId === null && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <h2 className="text-sm font-bold text-slate-900">
                  {isMl ? 'പ്രധാന പഠന വിഭാഗങ്ങൾ' : 'Core Study Material Categories'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a category below to explore class-wise question papers, Hikma questions, and textbook downloads.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
                {DEFAULT_ROOT_FOLDERS.map(root => {
                  const counts = getItemCount(root.id);
                  const meta = getRootFolderMeta(root.id);

                  return (
                    <div
                      key={root.id}
                      onClick={() => setCurrentFolderId(root.id)}
                      className={`group p-6 rounded-3xl bg-gradient-to-br ${meta.cardBg} border shadow-xs hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col justify-between`}
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="w-14 h-14 rounded-2xl bg-white shadow-xs border border-slate-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            {meta.icon}
                          </div>

                          <span className={`px-2.5 py-1 text-[11px] font-bold rounded-full border ${meta.badgeBg}`}>
                            {counts.total} items
                          </span>
                        </div>

                        <div>
                          <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-950 transition-colors">
                            {root.name}
                          </h3>
                          {root.nameMl && (
                            <h4 className="text-xs font-semibold text-emerald-800 mt-0.5">
                              {root.nameMl}
                            </h4>
                          )}
                          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                            {meta.desc}
                          </p>
                        </div>
                      </div>

                      <div className="mt-6 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs font-bold text-emerald-800 group-hover:text-emerald-950">
                        <span>
                          {counts.subFolderCount} {counts.subFolderCount === 1 ? 'folder' : 'folders'} • {counts.fileCount} {counts.fileCount === 1 ? 'file' : 'files'}
                        </span>
                        <span className="flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          <span>Explore</span>
                          <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* INSIDE A FOLDER: Subfolders + Files */}
          {currentFolderId !== null && (
            <div className="space-y-6">
              {/* Folder Title Bar */}
              <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-800 text-white flex items-center justify-center shrink-0">
                    <Folder className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                      {isMl && currentFolder?.nameMl ? currentFolder.nameMl : currentFolder?.name}
                    </h2>
                    <p className="text-[11px] text-slate-500">
                      {displayedFolders.length} sub-folders • {displayedFiles.length} files available in this section
                    </p>
                  </div>
                </div>
              </div>

              {/* Sub-Folders Grid */}
              {displayedFolders.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-emerald-800" />
                    <span>{isMl ? 'സബ് ഫോൾഡറുകൾ' : 'Sub-Folders'} ({displayedFolders.length})</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                    {displayedFolders.map(sub => {
                      const counts = getItemCount(sub.id);
                      return (
                        <div
                          key={sub.id}
                          onClick={() => setCurrentFolderId(sub.id)}
                          className="group p-4 rounded-2xl border border-slate-200 bg-white hover:border-emerald-400 hover:shadow-xs transition cursor-pointer flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                              <Folder className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate group-hover:text-emerald-900">
                                {sub.name}
                              </h4>
                              {sub.nameMl && (
                                <p className="text-[11px] text-emerald-800 font-semibold truncate">
                                  {sub.nameMl}
                                </p>
                              )}
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {counts.total} items
                              </span>
                            </div>
                          </div>

                          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-800 group-hover:translate-x-0.5 transition-transform shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Files List */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-800" />
                  <span>{isMl ? 'ലഭ്യമായ ഫയലുകൾ' : 'Available Files'} ({displayedFiles.length})</span>
                </h3>

                {displayedFiles.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-1.5">
                    <BookOpen className="w-7 h-7 text-slate-300 mx-auto" />
                    <p className="font-semibold text-slate-600">
                      {isMl ? 'ഈ ഫോൾഡറിൽ ഫയലുകൾ ഒന്നും ലഭ്യമല്ല' : 'No files in this folder yet'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {isMl
                        ? 'അധ്യാപകരും അഡ്മിനിസ്ട്രേറ്ററും ഉടൻ തന്നെ ഫയലുകൾ അപ്‌ലോഡ് ചെയ്യുന്നതാണ്.'
                        : 'Study materials uploaded by teachers/administrator will appear here.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    {displayedFiles.map(file => (
                      <div
                        key={file.id}
                        className="p-4 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {getFileIcon(file.fileType, file.name)}
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                              {file.name}
                            </h4>
                            <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                              <span className="font-mono">{formatFileSize(file.fileSize)}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-300" />
                                {new Date(file.uploadedAt).toLocaleDateString([], {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Distinct VIEW and DOWNLOAD action buttons */}
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {/* 1. View Button (Opens in new browser tab) */}
                          <a
                            href={file.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50 border border-emerald-300 rounded-xl transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isMl ? 'കാണുക (View)' : 'View'}</span>
                          </a>

                          {/* 2. Download Button (Triggers direct file download) */}
                          <button
                            type="button"
                            onClick={() => handleDownload(file)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{isMl ? 'ഡൗൺലോഡ്' : 'Download'}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
