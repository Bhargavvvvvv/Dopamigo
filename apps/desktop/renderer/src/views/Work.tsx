import { useEffect, useState } from 'react';
import { WorkChat } from '../components/WorkChat';
import { currentProject } from '../../../../../packages/core/state';
import { type ViewProps } from './Plan';
export function WorkView(props: ViewProps) {
  const project = currentProject(props.state);
  if (!project) return <section className="page"><h2>A place to work</h2><div className="empty"><p>Create a task first. Your notes and next step will live here.</p><button className="primary" onClick={() => props.navigate('plan')}>Create a plan</button></div></section>;
  return <WorkEditor key={project.id} {...props}/>;
}
function WorkEditor({ state, command, navigate }: ViewProps) {
  const project = currentProject(state)!;
  const [notes, setNotes] = useState(project.notes); const [nextAction, setNextAction] = useState(project.nextAction); const [resourceLabel, setResourceLabel] = useState(''); const [resourceUrl, setResourceUrl] = useState(''); const [error, setError] = useState('');
  const session = state.session?.projectId === project.id ? state.session : null;
  useEffect(() => { setNextAction(project.nextAction); }, [project.activeStepId]);
  const saved = notes === project.notes && nextAction === project.nextAction;
  async function draft(patch: { notes?: string; nextAction?: string }) { const result = await window.dopamigo.draft({ projectId: project.id, ...patch }); if (!result.ok) setError(result.error); }
  async function flush() { const result = await window.dopamigo.flush(); if (!result.ok) setError(result.error); }
  return <section className="page work-page"><div className="section-heading"><div><h2>{project.title}</h2></div><span className={`session-badge ${session?.status === 'active' ? 'live' : ''}`}>{session?.status === 'active' ? 'In session' : session?.status === 'break' ? 'On a break' : session?.status === 'paused' ? 'Paused' : 'Session not started'}</span></div>
    <div className="session-controls">{!session || session.status === 'ended' ? <button className="primary" disabled={!project.activeStepId} onClick={() => void command({ type: 'session.transition', action: 'start' })}>Start session</button> : <>{session.status === 'active' ? <button className="secondary" onClick={() => void command({ type: 'session.transition', action: 'pause' })}>Pause</button> : <button className="primary" onClick={() => void command({ type: 'session.transition', action: 'resume' })}>Resume session</button>}{session.status !== 'break' && <button className="secondary" onClick={() => void command({ type: 'session.transition', action: 'break' })}>Take a break</button>}<button className="quiet" onClick={() => void command({ type: 'session.transition', action: 'end' })}>End session</button></>}</div>
    {error && <p role="alert" className="inline-error">{error}</p>}
    <WorkChat project={project} saveToNotes={async text => {
      const updated = [notes, text].filter(Boolean).join('\n\n');
      if (updated.length > 100000) throw new Error('Your notes are full. Shorten them before adding this response.');
      const result = await window.dopamigo.draft({ projectId: project.id, notes: updated });
      if (!result.ok) throw new Error(result.error);
      setNotes(updated);
      const flushed = await window.dopamigo.flush(); if (!flushed.ok) throw new Error(flushed.error);
    }}/>
    <div className="notes-card"><div className="card-heading"><h3>Notes</h3><span role="status" className="save-status">{saved ? 'Saved' : 'Saving…'}</span></div><label htmlFor="work-notes" className="sr-only">Work notes</label><textarea id="work-notes" maxLength={100000} rows={6} placeholder="Write something down…" value={notes} onChange={e => { setNotes(e.target.value); void draft({ notes: e.target.value }); }} onBlur={() => void flush()}/><label className="next-edit">Next time, start with<input aria-label="My exact next action" maxLength={500} value={nextAction} onChange={e => { setNextAction(e.target.value); void draft({ nextAction: e.target.value }); }} onBlur={() => void flush()}/></label></div>
    <div className="resources-section"><div className="card-heading"><h3>Links</h3></div>{project.resources.map(resource => <div className="resource-row" key={resource.id}><span>↗ {resource.label}<small>{new URL(resource.url).hostname}</small></span><button className="quiet" aria-label={`Remove ${resource.label}`} onClick={() => void command({ type: 'resource.remove', resourceId: resource.id })}>Remove</button></div>)}<form className="resource-form" onSubmit={async e => { e.preventDefault(); if (await command({ type: 'resource.add', label: resourceLabel, url: resourceUrl })) { setResourceLabel(''); setResourceUrl(''); } }}><label>Link name<input required maxLength={120} placeholder="My draft" value={resourceLabel} onChange={e => setResourceLabel(e.target.value)}/></label><label>Resource URL<input required type="url" maxLength={2048} placeholder="https://…" value={resourceUrl} onChange={e => setResourceUrl(e.target.value)}/></label><button className="secondary">Save link</button></form></div>
    <button className="quiet" onClick={() => navigate('return')}>View saved progress</button>
  </section>;
}
