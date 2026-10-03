import { useState } from 'react';
import type { Project } from '../../../../../packages/contracts';
import type { ViewProps } from '../views/Plan';
export function AssignmentDetails({ project, state, command }: { project: Project } & Pick<ViewProps, 'state' | 'command'>) {
  const [brief, setBrief] = useState(project.brief); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const source = project.assignment!;
  async function importFile() { setError(''); setBusy(true); try { const result = await window.dopamigo.importBrief(); if (result.ok && result.value) setBrief(result.value.text); else if (!result.ok) setError(result.error); } finally { setBusy(false); } }
  async function generate() {
    setError(''); setBusy(true);
    try {
      if (!await command({ type: 'project.brief', brief })) return;
      const result = await window.dopamigo.plan({ projectId: project.id, title: project.title, brief, deadline: project.deadline });
      if (!result.ok) setError(result.error); else if (result.value.kind === 'clarification') setError(`${result.value.question} Add that detail to the brief and try again.`);
    } finally { setBusy(false); }
  }
  return <div className="assignment-details">
    <p className="assignment-meta"><strong>{project.subject}</strong><span>Due {project.deadline?.length === 10 ? project.deadline : project.deadline ? new Date(project.deadline).toLocaleString() : 'date unavailable'}</span><span>From {source.calendarName}</span></p>
    {source.status !== 'active' && <p className="inline-error">{source.status === 'cancelled' ? 'This calendar event was cancelled. Your work is preserved.' : source.status === 'unavailable' ? 'The calendar event is no longer accessible. Your work is preserved.' : 'The calendar event changed and may no longer describe an assignment deadline.'}</p>}
    <p className="muted">{source.documentStatus === 'found' ? `Matching document found: ${source.document?.name}` : source.documentStatus === 'ambiguous' ? 'Several documents may match. Add the correct link in Work.' : source.documentStatus === 'not_found' ? 'No matching document found in the connected folder yet.' : 'Drive document check is pending or unavailable.'}{source.document && <button className="quiet" onClick={() => { void window.dopamigo.openResource(`drive-${source.document!.id}`).then(result => { if (!result.ok) setError(result.error); }); }}>Open document ↗</button>}</p>
    <details><summary>{project.brief ? 'Assignment brief' : 'Add the professor’s brief · optional'}</summary><p className="muted">Paste instructions or import a text-based PDF, TXT or Markdown file. You can also start with the small step below.</p><label>Professor’s assignment brief<textarea rows={5} maxLength={30000} value={brief} onChange={event => setBrief(event.target.value)} disabled={busy}/></label><div className="actions"><button className="secondary" disabled={busy} onClick={() => void importFile()}>Import brief document</button><button className="secondary" disabled={busy} onClick={() => void command({ type: 'project.brief', brief })}>Save brief</button>{project.plan?.source === 'starter' && <button className="primary" disabled={busy || Boolean(state.session && state.session.status !== 'ended')} onClick={() => void generate()}>{busy ? 'Preparing…' : 'Build plan from brief'}</button>}</div><p className="footnote">{state.preferences.useMock ? 'Sample planning is on. Turn it off in Settings for Gemini.' : 'Building a plan sends the task and brief to Google Gemini.'}{state.session && state.session.status !== 'ended' ? ' End the current session before building a new plan.' : ''}</p></details>
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
