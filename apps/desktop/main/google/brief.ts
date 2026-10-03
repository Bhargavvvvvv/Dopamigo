import fs from 'node:fs/promises';
import path from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
export async function readBrief(file: string) {
  const info = await fs.stat(file); if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('Choose a text or PDF document smaller than 10 MB.');
  const bytes = await fs.readFile(file); const extension = path.extname(file).toLowerCase(); let text: string;
  if (extension === '.pdf') {
    try { const pdf = await getDocumentProxy(new Uint8Array(bytes)); try { if (pdf.numPages > 100) throw new Error(); text = (await extractText(pdf, { mergePages: true })).text; } finally { await pdf.loadingTask.destroy(); } }
    catch { throw new Error('This PDF could not be read. Try an unlocked text-based PDF, or paste the assignment text.'); }
  } else if (['.txt', '.md'].includes(extension)) text = bytes.toString('utf8');
  else throw new Error('Use a PDF, TXT or Markdown brief, or paste its text.');
  text = text.trim(); if (!text) throw new Error('No text was found. For a scanned PDF, paste the assignment instructions instead.');
  if (text.length > 30000) throw new Error('The brief exceeds 30,000 characters. Paste the relevant assignment instructions.');
  return { text, name: path.basename(file) };
}
