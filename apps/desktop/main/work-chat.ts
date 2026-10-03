import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chatInputSchema, documentInputSchema } from '../../../packages/contracts';
import type { Store } from '../../../packages/core/store';
import { generateChat } from './adapters/gemini-chat';
const MAX_BYTES = 12 * 1024 * 1024;
export class WorkChat {
  private busy = new Set<string>();
  constructor(private store: Store, private directory: string, private key: string, private model: string, private generate = generateChat) {}
  private project(id: string) { const project = this.store.state.projects.find(p => p.id === id); if (!project) throw new Error('This assignment is no longer available.'); return project; }
  private file(id: string) { return path.join(this.directory, 'chat-pdfs', `${id}.pdf`); }
  async attach(input: unknown, file: string) {
    const { projectId } = documentInputSchema.parse(input);
    const info = await fs.stat(file);
    if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Choose a PDF smaller than 12 MB.');
    const bytes = await fs.readFile(file);
    if (bytes.length > MAX_BYTES || !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('This file is not a supported PDF.');
    const document = { id: randomUUID(), name: path.basename(file).slice(0, 255), size: bytes.length };
    await fs.mkdir(path.dirname(this.file(document.id)), { recursive: true });
    await fs.writeFile(this.file(document.id), bytes, { flag: 'wx', mode: 0o600 });
    try { await this.store.update(state => {
      const project = state.projects.find(p => p.id === projectId); if (!project) throw new Error('Assignment not found.');
      const documents = project.documents ?? [];
      if (documents.length >= 8 || documents.reduce((sum, d) => sum + d.size, 0) + bytes.length > MAX_BYTES) throw new Error('Each assignment supports up to 8 PDFs totaling 12 MB. Remove a PDF first.');
      project.documents = [...documents, document];
    }); } catch (error) { await fs.unlink(this.file(document.id)).catch(() => {}); throw error; }
  }
  async remove(input: unknown) {
    const { projectId, documentId } = documentInputSchema.parse(input);
    if (!documentId) throw new Error('Choose a PDF to remove.');
    if (this.busy.has(projectId)) throw new Error('Wait for Gemini to finish before removing a PDF.');
    const project = this.project(projectId);
    if (!project.documents?.some(d => d.id === documentId)) throw new Error('PDF not found.');
    await this.store.update(state => { const p = state.projects.find(p => p.id === projectId)!; p.documents = p.documents?.filter(d => d.id !== documentId); });
    await fs.unlink(this.file(documentId)).catch(() => {});
  }
  async send(input: unknown) {
    const { projectId, text } = chatInputSchema.parse(input);
    if (this.busy.has(projectId)) throw new Error('Gemini is already responding to this assignment.');
    this.busy.add(projectId);
    try {
      const project = structuredClone(this.project(projectId));
      if ((project.chat?.length ?? 0) >= 100 || (project.chat ?? []).reduce((sum, m) => sum + m.text.length, 0) > 400000) throw new Error('This conversation is full. Your saved chat and notes are preserved.');
      const documents = await Promise.all((project.documents ?? []).map(async d => {
        try { return { name: d.name, data: (await fs.readFile(this.file(d.id))).toString('base64') }; }
        catch { throw new Error(`“${d.name}” is unavailable. Remove it and attach the PDF again.`); }
      }));
      const answer = await this.generate(this.key, this.model, project, text, documents);
      await this.store.update(state => {
        const target = state.projects.find(p => p.id === projectId); if (!target) throw new Error('Assignment not found.');
        const at = new Date().toISOString();
        target.chat = [...(target.chat ?? []), { id: randomUUID(), role: 'user', text, at }, { id: randomUUID(), role: 'model', text: answer, at }];
      });
    } finally { this.busy.delete(projectId); }
  }
}
