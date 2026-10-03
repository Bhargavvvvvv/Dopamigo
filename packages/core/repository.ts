import type { AppState } from '../contracts';
export interface StateRepository { load(): Promise<{ state: AppState; notice: string | null }>; save(state: AppState): Promise<void>; }
