import { useState } from 'react';
import { currentProject } from '../../../../../packages/core/state';
import { NextAction, type ViewProps } from './Plan';
export function ReturnView({ state, command, navigate }: ViewProps) {
  const project = currentProject(state); const [error, setError] = useState('');
  const checkpoint = state.checkpoints.find(c => c.projectId === project?.id);
  async function bringBack() {
    setError('');
    if (state.session?.projectId === project?.id && ['paused', 'break'].includes(state.session!.status)) { if (!await command({ type: 'session.transition', action: 'resume' })) return; }
    const resource = project?.resources[0];
    if (resource) { const result = await window.dopamigo.openResource(resource.id); if (!result.ok) { setError(result.error); return; } }
    navigate('work');
  }
  return <section className="page return-page"><h2>Where you left off</h2><p className="lede">Your saved work, ready when you are.</p>
    {!project ? <div className="card empty"><h3>No saved work yet.</h3><button className="primary" onClick={() => navigate('plan')}>Create a plan</button></div> : <><NextAction state={state} command={command} onStart={() => void bringBack()} startLabel="Continue working"/><div className="card return-card"><div className="card-heading"><h3>Saved context</h3><small>{checkpoint ? `Saved ${new Date(checkpoint.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Your saved plan'}</small></div><h3 className="return-project">{project.title}</h3>{checkpoint && <><p className="return-step"><span>Working on</span>{checkpoint.stepTitle}</p>{checkpoint.completed.length > 0 && <div className="saved-detail"><span className="eyebrow">Completed</span><ul>{checkpoint.completed.slice(-3).map((title, index) => <li key={index}>✓ {title}</li>)}</ul></div>}<div className="saved-detail"><span className="eyebrow">Notes</span><p className="saved-notes">{checkpoint.notes || 'No notes saved for this session.'}</p></div></>}{project.resources.length > 0 && <div className="saved-detail"><span className="eyebrow">Links</span><div className="resource-chips">{project.resources.map(resource => <button key={resource.id} className="secondary" onClick={async () => { const result = await window.dopamigo.openResource(resource.id); if (!result.ok) setError(result.error); }}>↗ {resource.label}</button>)}</div></div>}</div>{!project.activeStepId && <button className="primary" onClick={() => navigate('work')}>Review work</button>}<p className="footnote">Saved on this Mac.</p>{error && <p role="alert" className="inline-error">{error}</p>}</>}
  </section>;
}
