
import { Project } from '../types';

const DB_NAME = 'MedExamDB';
const DB_VERSION = 6; // Incremented for User Auth Store
const STORE_NAME = 'projects';
const USER_STORE = 'users';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => reject('Error opening database');

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create projects store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }

      // Create users store for local auth
      if (!db.objectStoreNames.contains(USER_STORE)) {
        db.createObjectStore(USER_STORE, { keyPath: 'username' });
      }

      // Cleanup old stores if they exist (migration from v2)
      if (db.objectStoreNames.contains('app_state')) {
        db.deleteObjectStore('app_state');
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };
  });
};

// --- USER AUTHENTICATION METHODS ---

export const registerUser = async (username: string, password: string): Promise<boolean> => {
  const normalizedId = username.trim().toLowerCase();
  const originalId = username.trim();

  try {
    const db = await openDB();
    
    // Check if user exists (in EITHER format to prevent duplicates)
    const exists = await new Promise<boolean>((resolve) => {
        const transaction = db.transaction(USER_STORE, 'readonly');
        const store = transaction.objectStore(USER_STORE);
        
        const req1 = store.get(normalizedId);
        
        req1.onsuccess = () => {
            if (req1.result) { 
                resolve(true); 
            } else if (normalizedId !== originalId) {
                // Check original case as fallback
                const req2 = store.get(originalId);
                req2.onsuccess = () => resolve(!!req2.result);
                req2.onerror = () => resolve(false);
            } else {
                resolve(false);
            }
        };
        req1.onerror = () => resolve(false);
    });

    if (exists) {
        return false;
    }

    // Perform Add
    return await new Promise((resolve) => {
        const transaction = db.transaction(USER_STORE, 'readwrite');
        const store = transaction.objectStore(USER_STORE);
        // Always store new users in normalized lowercase format
        const addRequest = store.add({ username: normalizedId, password, createdAt: new Date().toISOString() });
        
        addRequest.onsuccess = () => resolve(true);
        addRequest.onerror = () => {
            console.error("Failed to write user to DB:", addRequest.error);
            resolve(false);
        };
    });

  } catch (error) {
    console.error('Registration failed:', error);
    return false;
  }
};

export const loginUser = async (username: string, password: string): Promise<boolean> => {
  const normalizedId = username.trim().toLowerCase();
  const originalId = username.trim();

  try {
    const db = await openDB();
    
    // Helper to get user from a specific key
    const getUserByKey = (key: string) => new Promise<any>((resolve) => {
        const transaction = db.transaction(USER_STORE, 'readonly');
        const store = transaction.objectStore(USER_STORE);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
    });

    // 1. Try finding user by normalized ID (Standard behavior)
    let user = await getUserByKey(normalizedId);

    // 2. If failed, and input had casing, try finding user by Original ID (Legacy behavior)
    if (!user && normalizedId !== originalId) {
        user = await getUserByKey(originalId);
    }

    if (user && user.password === password) {
      return true;
    }
    return false;
  } catch (error) {
    console.error('Login failed:', error);
    return false;
  }
};

// --- PROJECT METHODS ---

export const saveProject = async (project: Project): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Update last modified
    const updatedProject = { ...project, lastModified: new Date().toISOString() };
    
    store.put(updatedProject);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error(`Failed to save project ${project.id}:`, error);
  }
};

export const getAllProjects = async (userId: string): Promise<Project[]> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const allProjects = request.result as Project[];
        // Note: userId passed here might not be normalized if coming from legacy session, 
        // but since we normalize on login/register, we should normalize here too to match.
        const normalizedUserId = userId.toLowerCase();
        
        // Filter projects by user (case-insensitive check for legacy support)
        const userProjects = allProjects.filter(p => p.userId.toLowerCase() === normalizedUserId);
        
        // Sort by last modified descending
        userProjects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
        resolve(userProjects);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to load projects:', error);
    return [];
  }
};

export const getProject = async (id: string): Promise<Project | null> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as Project || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Failed to load project ${id}:`, error);
    return null;
  }
};

export const deleteProject = async (id: string): Promise<void> => {
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(id);
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Failed to delete project:', error);
  }
};
