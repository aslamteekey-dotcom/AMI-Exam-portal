import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
  query,
  where,
} from 'firebase/firestore';
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from './firebase';
import { StudyMaterialFolder, StudyMaterialFile, DEFAULT_ROOT_FOLDERS } from '../types';

const FOLDERS_COLLECTION = 'study_materials_folders';
const FILES_COLLECTION = 'study_materials_files';
const LOCAL_FOLDERS_KEY = 'madrasa_local_study_folders';
const LOCAL_FILES_KEY = 'madrasa_local_study_files';

// Local storage fallback helpers
function getLocalFolders(): StudyMaterialFolder[] {
  try {
    const raw = localStorage.getItem(LOCAL_FOLDERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [...DEFAULT_ROOT_FOLDERS];
}

function saveLocalFolders(folders: StudyMaterialFolder[]) {
  try {
    localStorage.setItem(LOCAL_FOLDERS_KEY, JSON.stringify(folders));
  } catch {}
}

function getLocalFiles(): StudyMaterialFile[] {
  try {
    const raw = localStorage.getItem(LOCAL_FILES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLocalFiles(files: StudyMaterialFile[]) {
  try {
    localStorage.setItem(LOCAL_FILES_KEY, JSON.stringify(files));
  } catch {}
}

export class StudyMaterialsService {
  private static instance: StudyMaterialsService;

  public static getInstance(): StudyMaterialsService {
    if (!StudyMaterialsService.instance) {
      StudyMaterialsService.instance = new StudyMaterialsService();
    }
    return StudyMaterialsService.instance;
  }

  // Ensure default root folders exist in Firestore and local storage
  public async initDefaultFolders(): Promise<void> {
    try {
      const snap = await getDocs(collection(db, FOLDERS_COLLECTION));
      const existingIds = new Set(snap.docs.map(d => d.id));

      for (const root of DEFAULT_ROOT_FOLDERS) {
        if (!existingIds.has(root.id)) {
          await setDoc(doc(db, FOLDERS_COLLECTION, root.id), {
            ...root,
            createdAt: new Date().toISOString(),
          }, { merge: true });
        }
      }
    } catch (err) {
      console.warn('Firestore default folders init notice (using local storage fallback):', err);
      const local = getLocalFolders();
      const existingLocalIds = new Set(local.map(f => f.id));
      let changed = false;
      for (const root of DEFAULT_ROOT_FOLDERS) {
        if (!existingLocalIds.has(root.id)) {
          local.push(root);
          changed = true;
        }
      }
      if (changed) saveLocalFolders(local);
    }
  }

  // Subscribe to all folders
  public subscribeFolders(callback: (folders: StudyMaterialFolder[]) => void): Unsubscribe {
    // Initial call with local data
    const local = getLocalFolders();
    callback(local);

    try {
      return onSnapshot(
        collection(db, FOLDERS_COLLECTION),
        snapshot => {
          if (!snapshot.empty) {
            const list = snapshot.docs.map(d => ({
              ...d.data(),
              id: d.id,
            } as StudyMaterialFolder));

            // Guarantee the 3 permanent root folders are always included
            const listIds = new Set(list.map(f => f.id));
            DEFAULT_ROOT_FOLDERS.forEach(root => {
              if (!listIds.has(root.id)) {
                list.push(root);
              }
            });

            saveLocalFolders(list);
            callback(list);
          } else {
            // Seed defaults if empty
            this.initDefaultFolders().catch(() => {});
            callback(DEFAULT_ROOT_FOLDERS);
          }
        },
        err => {
          handleFirestoreError(err, OperationType.LIST, FOLDERS_COLLECTION);
          callback(getLocalFolders());
        }
      );
    } catch (err) {
      console.warn('Real-time folders listener error:', err);
      callback(getLocalFolders());
      return () => {};
    }
  }

  // Subscribe to all files (or filter by folder in memory)
  public subscribeFiles(callback: (files: StudyMaterialFile[]) => void): Unsubscribe {
    callback(getLocalFiles());

    try {
      return onSnapshot(
        collection(db, FILES_COLLECTION),
        snapshot => {
          const list = snapshot.docs.map(d => ({
            ...d.data(),
            id: d.id,
          } as StudyMaterialFile));
          saveLocalFiles(list);
          callback(list);
        },
        err => {
          handleFirestoreError(err, OperationType.LIST, FILES_COLLECTION);
          callback(getLocalFiles());
        }
      );
    } catch (err) {
      console.warn('Real-time files listener error:', err);
      callback(getLocalFiles());
      return () => {};
    }
  }

  // Create a new sub-folder
  public async createFolder(data: {
    name: string;
    nameMl?: string;
    parentId: string | null;
    createdBy?: string;
  }): Promise<StudyMaterialFolder> {
    const id = `folder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newFolder: StudyMaterialFolder = {
      id,
      name: data.name.trim(),
      nameMl: data.nameMl?.trim() || undefined,
      parentId: data.parentId || null,
      isPermanent: false,
      createdAt: new Date().toISOString(),
      createdBy: data.createdBy || 'Admin',
    };

    // Save to Firestore
    try {
      await setDoc(doc(db, FOLDERS_COLLECTION, id), newFolder);
    } catch (err) {
      console.warn('Firestore folder create error (fallback to local):', err);
    }

    // Always update local cache
    const local = getLocalFolders();
    local.push(newFolder);
    saveLocalFolders(local);

    return newFolder;
  }

  // Delete a folder and all its descendant subfolders and files
  public async deleteFolder(folderId: string): Promise<void> {
    // Cannot delete default permanent root folders
    const root = DEFAULT_ROOT_FOLDERS.find(r => r.id === folderId);
    if (root) {
      throw new Error(`Cannot delete permanent root category: "${root.name}"`);
    }

    const localFolders = getLocalFolders();
    const localFiles = getLocalFiles();

    // Find all descendant folder IDs recursively
    const foldersToDelete = new Set<string>([folderId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of localFolders) {
        if (f.parentId && foldersToDelete.has(f.parentId) && !foldersToDelete.has(f.id)) {
          foldersToDelete.add(f.id);
          added = true;
        }
      }
    }

    // Delete files belonging to these folders
    const filesToDelete = localFiles.filter(f => foldersToDelete.has(f.folderId));
    for (const file of filesToDelete) {
      await this.deleteFile(file).catch(e => console.warn('File delete during folder deletion error:', e));
    }

    // Delete folders from Firestore
    for (const fId of foldersToDelete) {
      try {
        await deleteDoc(doc(db, FOLDERS_COLLECTION, fId));
      } catch (err) {
        console.warn(`Firestore folder delete error for ${fId}:`, err);
      }
    }

    // Update local cache
    const updatedFolders = localFolders.filter(f => !foldersToDelete.has(f.id));
    saveLocalFolders(updatedFolders);
  }

  // Upload file to Firebase Storage with Firestore metadata
  public async uploadFile(
    file: File,
    folderId: string,
    onProgress?: (percent: number) => void,
    uploadedBy: string = 'Admin'
  ): Promise<StudyMaterialFile> {
    const id = `file_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `studyMaterials/${folderId}/${Date.now()}_${sanitizedName}`;

    let downloadUrl = '';

    try {
      const sRef = storageRef(storage, storagePath);
      const uploadTask = uploadBytesResumable(sRef, file, {
        contentType: file.type || 'application/octet-stream',
      });

      await new Promise<void>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          snapshot => {
            if (snapshot.totalBytes > 0 && onProgress) {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              onProgress(Math.round(progress));
            }
          },
          error => {
            console.warn('Firebase Storage upload error:', error);
            reject(error);
          },
          async () => {
            try {
              downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve();
            } catch (urlErr) {
              reject(urlErr);
            }
          }
        );
      });
    } catch (storageError) {
      console.warn('Firebase Storage direct upload failed, switching to base64 data-URI fallback:', storageError);
      // Fallback: convert to data URL so the file can be viewed and downloaded offline / preview
      downloadUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    const newFile: StudyMaterialFile = {
      id,
      name: file.name,
      folderId,
      downloadUrl,
      storagePath,
      fileType: file.type || 'application/octet-stream',
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
    };

    // Save metadata in Firestore
    try {
      await setDoc(doc(db, FILES_COLLECTION, id), newFile);
    } catch (dbErr) {
      console.warn('Firestore file metadata save error (persisting locally):', dbErr);
    }

    // Always update local cache
    const local = getLocalFiles();
    local.push(newFile);
    saveLocalFiles(local);

    return newFile;
  }

  // Delete file from Firebase Storage & Firestore
  public async deleteFile(file: StudyMaterialFile): Promise<void> {
    // 1. Delete from Firebase Storage if storagePath exists
    if (file.storagePath) {
      try {
        const sRef = storageRef(storage, file.storagePath);
        await deleteObject(sRef);
      } catch (err) {
        console.warn('Firebase Storage delete warning (continuing to remove record):', err);
      }
    }

    // 2. Delete document from Firestore
    try {
      await deleteDoc(doc(db, FILES_COLLECTION, file.id));
    } catch (err) {
      console.warn('Firestore file delete warning:', err);
    }

    // 3. Update local cache
    const local = getLocalFiles();
    const updated = local.filter(f => f.id !== file.id);
    saveLocalFiles(updated);
  }
}

export const studyMaterialsService = StudyMaterialsService.getInstance();
