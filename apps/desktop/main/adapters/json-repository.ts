import fs from 'node:fs/promises';
import path from 'node:path';
import { stateSchema, type AppState } from '../../../../packages/contracts';
import { initialState } from '../../../../packages/core/state';
import type { StateRepository } from '../../../../packages/core/repository';
export class JsonRepository implements StateRepository {
  constructor(readonly directory: string) {}
  private get file() { return path.join(this.directory, 'state.json'); }
  async load() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    try { return { state: await this.read(this.file), notice: null }; }
    catch (error) {
      if (error instanceof Error && error.message === 'Unsupported state version') throw error;
      try { return { state: await this.read(`${this.file}.bak`), notice: 'Recovered the previous save after an interrupted or damaged save.' }; }
      catch (backupError) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && (backupError as NodeJS.ErrnoException).code === 'ENOENT') return { state: initialState(), notice: null };
        throw new Error('Saved data could not be read. Your files have been preserved. See docs/SETUP.md for recovery.');
      }
    }
  }
  private async read(file: string) {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (data.version !== 1) throw new Error('Unsupported state version');
    return stateSchema.parse(data);
  }
  async save(state: AppState) {
    const valid = stateSchema.parse(state);
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    try { const previous = await this.read(this.file); await this.atomicWrite(`${this.file}.bak`, previous); } catch { /* Never replace a good backup with damaged data. */ }
    await this.atomicWrite(this.file, valid);
  }
  private async atomicWrite(file: string, state: AppState) {
    const temporary = `${file}.tmp`;
    const handle = await fs.open(temporary, 'w', 0o600);
    try { await handle.writeFile(JSON.stringify(state, null, 2)); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, file);
  }
}
