import type { AppState } from '../contracts';
import type { StateRepository } from './repository';
export class Store {
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(state: AppState) => void>();
  constructor(public state: AppState, private repository: StateRepository) {}
  subscribe(listener: (state: AppState) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async whenIdle() { await this.queue; return structuredClone(this.state); }
  update(change: (state: AppState) => void): Promise<AppState> {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.state); change(next); next.revision++;
      await this.repository.save(next); this.state = next;
      for (const listener of this.listeners) listener(structuredClone(next));
      return structuredClone(next);
    });
    this.queue = operation.catch(() => undefined); return operation;
  }
}
