import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Folder,
  FolderPlus,
  UploadCloud,
  FileText,
  File,
  Image as ImageIcon,
  Trash2,
  Eye,
  Download,
  ChevronRight,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HardDrive,
  Calendar,
  X,
  BookOpen,
  HelpCircle,
  FileQuestion,
  Sparkles,
} from 'lucide-react';
import { StudyMaterialFolder, StudyMaterialFile, DEFAULT_ROOT_FOLDERS } from '../../types';
import { studyMaterialsService } from '../../services/studyMaterialsService';

export const StudyMaterialsManagement: React.FC = () => {
  const { lang, t, user } = useAuth();
  const isMl = lang === 'ml';

  const [folders, setFolders] = useState<StudyMaterialFolder[]>([]);
  const [files, setFiles] = useState<StudyMaterialFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderNameMl, setNewFolderNameMl] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'folder' | 'file';
    item: StudyMaterialFolder | StudyMaterialFile;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

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

  // Current folder object
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

  // Child folders in current folder (or root folders if currentFolderId is null)
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

  // Child files in current folder
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

  // Icon for root folders
  const getRootFolderIcon = (fId: string) => {
    if (fId === 'root_question_papers') {
      return <FileQuestion className="w-6 h-6 text-emerald-800" />;
    }
    if (fId === 'root_hikma_questions') {
      return <HelpCircle className="w-6 h-6 text-amber-600" />;
    }
    if (fId === 'root_textbooks') {
      return <BookOpen className="w-6 h-6 text-teal-700" />;
    }
    return <Folder className="w-6 h-6 text-emerald-800" />;
  };

  // Create Sub-folder handler
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setIsCreatingFolder(true);
    try {
      await studyMaterialsService.createFolder({
        name: newFolderName.trim(),
        nameMl: newFolderNameMl.trim() || undefined,
        parentId: currentFolderId,
        createdBy: user?.name || 'Administrator',
      });
      setNewFolderName('');
      setNewFolderNameMl('');
      setShowFolderModal(false);
      showToast('Sub-folder created successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to create sub-folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Upload Files handler
  const handleUploadFiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFiles || selectedFiles.length === 0 || !currentFolderId) {
      alert('Please select files and ensure a folder is open.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    const totalFiles = selectedFiles.length;

    try {
      for (let i = 0; i < totalFiles; i++) {
        const file = selectedFiles[i];
        setUploadStatus(`Uploading (${i + 1}/${totalFiles}): ${file.name}`);
        await studyMaterialsService.uploadFile(
          file,
          currentFolderId,
          percent => {
            const overallPercent = Math.round(((i + percent / 100) / totalFiles) * 100);
            setUploadProgress(overallPercent);
          },
          user?.name || 'Administrator'
        );
      }
      setSelectedFiles(null);
      setShowUploadModal(false);
      setUploadProgress(100);
      showToast(`${totalFiles} file(s) uploaded successfully!`);
    } catch (err: any) {
      alert(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
      setUploadStatus('');
      setUploadProgress(0);
    }
  };

  // Delete target confirm handler
  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return;
    setIsDeleting(true);
    try {
      if (deleteConfirmTarget.type === 'folder') {
        const folder = deleteConfirmTarget.item as StudyMaterialFolder;
        await studyMaterialsService.deleteFolder(folder.id);
        showToast(`Folder "${folder.name}" deleted.`);
      } else {
        const file = deleteConfirmTarget.item as StudyMaterialFile;
        await studyMaterialsService.deleteFile(file);
        showToast(`File "${file.name}" deleted.`);
      }
      setDeleteConfirmTarget(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
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

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-lg border border-emerald-700 flex items-center gap-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 text-white rounded-2xl p-6 shadow-md print:hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-800/80 text-emerald-200 border border-emerald-700/60 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Study Materials Repository</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-serif">
              {isMl ? 'പഠന സാമഗ്രികൾ & ചോദ്യപേപ്പറുകൾ' : 'Study Materials Management'}
            </h1>
            <p className="text-xs text-emerald-200 mt-1 max-w-2xl leading-relaxed">
              Organize question papers, Hikma competition questions, and official textbooks with cloud storage and automatic parent access.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFolderModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl transition shadow-xs cursor-pointer"
            >
              <FolderPlus className="w-4 h-4 text-emerald-300" />
              <span>{isMl ? 'പുതിയ ഫോൾഡർ' : 'New Sub-Folder'}</span>
            </button>

            <button
              type="button"
              disabled={!currentFolderId}
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{isMl ? 'ഫയലുകൾ അപ്‌ലോഡ് ചെയ്യുക' : 'Upload Files'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main File Manager Workspace */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Navigation Toolbar & Breadcrumbs */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1.5 text-xs flex-wrap font-medium">
            <button
              type="button"
              onClick={() => setCurrentFolderId(null)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                currentFolderId === null
                  ? 'bg-emerald-800 text-white font-bold'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>All Categories</span>
            </button>

            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.id}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setCurrentFolderId(crumb.id)}
                    className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer max-w-[200px] truncate ${
                      isLast
                        ? 'bg-emerald-800 text-white font-bold'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    {crumb.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* Quick Search & Up Button */}
          <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
            {currentFolderId && (
              <button
                type="button"
                onClick={() => {
                  const parentId = currentFolder?.parentId || null;
                  setCurrentFolderId(parentId);
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Up Level</span>
              </button>
            )}

            <div className="relative flex-1 sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder={isMl ? 'തിരയുക...' : 'Search items...'}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-emerald-800 focus:ring-1 focus:ring-emerald-800"
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

        {/* Content Explorer Area */}
        <div className="p-5 sm:p-6 space-y-6">
          {/* Current location notification */}
          <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b border-slate-100">
            <span className="font-semibold text-slate-700">
              {currentFolder
                ? `Folder: ${currentFolder.name}`
                : 'Main Categories (3 Permanent Default Root Folders)'}
            </span>
            <span>
              {displayedFolders.length} Folders • {displayedFiles.length} Files
            </span>
          </div>

          {/* 1. SUB-FOLDERS GRID */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Folder className="w-3.5 h-3.5 text-emerald-800" />
              <span>Folders</span>
            </h3>

            {displayedFolders.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                No sub-folders in this location. Click <strong>"New Sub-Folder"</strong> above to create one.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3.5">
                {displayedFolders.map(folder => {
                  const counts = getItemCount(folder.id);
                  const isRoot = folder.isPermanent;
                  return (
                    <div
                      key={folder.id}
                      onClick={() => setCurrentFolderId(folder.id)}
                      className={`group relative p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                        isRoot
                          ? 'bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/40 border-emerald-200 hover:border-emerald-500 hover:shadow-xs'
                          : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                            {getRootFolderIcon(folder.id)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 text-sm truncate group-hover:text-emerald-900 transition-colors">
                              {folder.name}
                            </h4>
                            {folder.nameMl && (
                              <p className="text-[11px] text-emerald-800 font-semibold truncate">
                                {folder.nameMl}
                              </p>
                            )}
                          </div>
                        </div>

                        {!folder.isPermanent && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setDeleteConfirmTarget({ type: 'folder', item: folder });
                            }}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Folder"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-medium text-slate-500">
                          {counts.subFolderCount} folders • {counts.fileCount} files
                        </span>
                        <span className="text-emerald-800 font-bold group-hover:translate-x-0.5 transition-transform">
                          Open →
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. FILES SECTION (Visible only when inside a folder) */}
          {currentFolderId && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-800" />
                  <span>Files in this Folder ({displayedFiles.length})</span>
                </h3>

                <button
                  type="button"
                  onClick={() => setShowUploadModal(true)}
                  className="text-xs font-bold text-emerald-800 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload Files Here</span>
                </button>
              </div>

              {displayedFiles.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                  <UploadCloud className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-semibold text-slate-600">No files in this folder yet</p>
                  <p className="text-[11px] text-slate-400">
                    Upload question papers, Hikma modules, or textbooks (PDFs, Docs, Images).
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(true)}
                    className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    Upload File
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                  {displayedFiles.map(file => (
                    <div
                      key={file.id}
                      className="p-3.5 sm:p-4 hover:bg-slate-50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
                            {file.uploadedBy && (
                              <>
                                <span>•</span>
                                <span>By {file.uploadedBy}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        {/* View Button */}
                        <a
                          href={file.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 border border-emerald-200 rounded-xl transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </a>

                        {/* Download Button */}
                        <button
                          type="button"
                          onClick={() => handleDownload(file)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-xl transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmTarget({ type: 'file', item: file })}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                          title="Delete File"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CREATE SUB-FOLDER MODAL */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-emerald-800" />
                <span>Create New Sub-Folder</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowFolderModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-500 bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
              <span>Parent Location: </span>
              <strong className="text-emerald-950 font-bold">
                {currentFolder ? currentFolder.name : 'Root (Permanent Categories)'}
              </strong>
            </div>

            <form onSubmit={handleCreateFolder} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Folder Name (English) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Class 5, Model Papers 2026, Tafsir"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:outline-emerald-800 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Folder Name (Malayalam) <span className="font-normal text-slate-400">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="ഉദാ: ക്ലാസ്സ് 5, മോഡൽ ചോദ്യങ്ങൾ"
                  value={newFolderNameMl}
                  onChange={e => setNewFolderNameMl(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl focus:outline-emerald-800 font-semibold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFolder || !newFolderName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50"
                >
                  {isCreatingFolder ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Folder'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD FILES MODAL */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-emerald-800" />
                <span>Upload Files to Firebase Storage</span>
              </h3>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-500 bg-emerald-50/60 p-3 rounded-xl border border-emerald-200">
              <span>Target Folder: </span>
              <strong className="text-emerald-950 font-bold">
                {currentFolder?.name || 'Selected Folder'}
              </strong>
            </div>

            <form onSubmit={handleUploadFiles} className="space-y-4 text-xs">
              <div className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl p-6 text-center bg-emerald-50/30 transition">
                <input
                  type="file"
                  id="study-file-input"
                  multiple
                  onChange={e => setSelectedFiles(e.target.files)}
                  disabled={isUploading}
                  className="hidden"
                />
                <label
                  htmlFor="study-file-input"
                  className="flex flex-col items-center justify-center gap-2 cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-slate-800 text-sm">
                    Click to browse files or drag and drop
                  </span>
                  <span className="text-[11px] text-slate-400">
                    PDFs, Word documents, Textbooks, Scanned Question Papers, Images
                  </span>
                </label>
              </div>

              {selectedFiles && selectedFiles.length > 0 && (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 max-h-40 overflow-y-auto space-y-1">
                  <div className="text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Selected Files ({selectedFiles.length}):
                  </div>
                  {Array.from(selectedFiles).map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px] text-slate-600 py-0.5">
                      <span className="truncate max-w-[280px]">{f.name}</span>
                      <span className="font-mono text-slate-400">{formatFileSize(f.size)}</span>
                    </div>
                  ))}
                </div>
              )}

              {isUploading && (
                <div className="space-y-1.5 bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <div className="flex items-center justify-between text-xs text-emerald-900 font-semibold">
                    <span className="truncate">{uploadStatus}</span>
                    <span className="font-mono font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-800 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading || !selectedFiles || selectedFiles.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    `Upload ${selectedFiles ? selectedFiles.length : 0} File(s)`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-800">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-700" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Confirm Deletion
                </h3>
                <p className="text-xs text-slate-500">
                  {deleteConfirmTarget.type === 'folder'
                    ? 'Delete this folder and all nested materials?'
                    : 'Delete this file permanently?'}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <strong className="text-slate-800 truncate block">
                {deleteConfirmTarget.item.name}
              </strong>
              {deleteConfirmTarget.type === 'folder' && (
                <span className="text-[11px] text-rose-600 font-medium block mt-1">
                  ⚠️ Any nested sub-folders and files inside will also be deleted permanently.
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Permanently'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
