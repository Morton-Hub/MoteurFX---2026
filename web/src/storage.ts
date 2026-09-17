/**
 * Reprise de session (IndexedDB) et fichiers portables.
 *
 * IndexedDB sert à **reprendre** une session ; le fichier exporté reste la
 * sauvegarde transportable (§14). Toute erreur est rapportée, jamais avalée :
 * un enregistrement qui échoue en silence est pire que pas d'enregistrement.
 */

import type { Project } from '../../src/exporter/project.js';

const DB_NAME = 'motorfx2';
const STORE = 'sessions';
const KEY = 'atelier';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible'));
  });
}

export async function saveSession(project: Project): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Écriture impossible'));
  });
  db.close();
}

export async function loadSession(): Promise<Project | null> {
  const db = await open();
  const value = await new Promise<Project | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as Project | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Lecture impossible'));
  });
  db.close();
  return value;
}

export async function clearSession(): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Suppression impossible'));
  });
  db.close();
}

export function downloadFile(name: string, data: Uint8Array | string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
