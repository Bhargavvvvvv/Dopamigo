export type NudgeContext = { sessionId: string | null; enabled: boolean; domain: string | null; dwellMs: number; cooldownMs: number };
export class NudgeRules {
  private sessionId: string | null = null; private domain: string | null = null; private since = 0;
  private lastNudge = -Infinity; private visitSuppressed = false; private research = new Set<string>();
  update(context: NudgeContext, now: number): boolean {
    if (this.sessionId !== context.sessionId) { this.sessionId = context.sessionId; this.research.clear(); this.lastNudge = -Infinity; this.domain = null; this.visitSuppressed = false; }
    const domain = context.enabled ? context.domain : null;
    if (this.domain !== domain) { this.domain = domain; this.since = now; this.visitSuppressed = false; }
    if (!domain || this.visitSuppressed || this.research.has(domain)) return false;
    if (now - this.since < context.dwellMs || now - this.lastNudge < context.cooldownMs) return false;
    this.lastNudge = now; this.visitSuppressed = true; return true;
  }
  dismiss(research = false) { this.visitSuppressed = true; if (research && this.domain) this.research.add(this.domain); }
}
