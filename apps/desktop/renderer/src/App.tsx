import { useEffect, useState } from 'react';
import type { AppState, Command, RuntimeInfo } from '../../../../packages/contracts';
import { Settings } from './views/Settings';
import { NextAction, PlanView, StepRow } from './views/Plan';
import { NavigationIcon } from './components/NavigationIcon';
import { WorkView } from './views/Work';
import { ReturnView } from './views/Return';
import { BrowserBadge } from './components/BrowserSettings';
import { AudioPlayer, NudgeCard } from './components/Nudge';
export type View = 'plan' | 'work' | 'return' | 'settings';
export function App() {
  const [state, setState] = useState<AppState>();
  const [runtime, setRuntime] = useState<RuntimeInfo>();
  const [view, setView] = useState<View>('plan');
  const [planVersion, setPlanVersion] = useState(0);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  async function deleteTask(projectId: string) {
    setDeleting(true);
    try { await command({ type: 'project.delete', projectId }); }
    catch { setError('Could not delete this task. Please try again.'); }
    finally { setDeleting(false); }
  }
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [view, state?.selectedProjectId]);
  useEffect(() => window.dopamigo.onNavigate(next => { void navigate(next); }), []);
  useEffect(() => window.dopamigo.onSaveError(() => setError('Autosave failed. Your latest edits remain in memory. Check disk access and retry before quitting.')), []);
  useEffect(() => {
    window.dopamigo.load().then(result => { if (result.ok) { setState(result.value.state); setRuntime(result.value.runtime); if (result.value.state.checkpoints.length) setView('return'); } else setError(result.error); });
    return window.dopamigo.onState(next => setState(previous => !previous || next.revision >= previous.revision ? next : previous));
  }, []);
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', ','].includes(e.key)) { e.preventDefault(); void navigate(({ '1': 'plan', '2': 'work', '3': 'return', ',': 'settings' } as Record<string, View>)[e.key]); } };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, []);
  async function command(value: Command) {
    setError(''); const result = await window.dopamigo.command(value);
    if (result.ok) setState(previous => !previous || result.value.revision >= previous.revision ? result.value : previous); else setError(result.error);
    return result.ok;
  }
  async function navigate(next: View) {
    const result = await window.dopamigo.flush();
    if (!result.ok) { setError(result.error); return; }
    setState(previous => !previous || result.value.revision >= previous.revision ? result.value : previous);
    setView(next);
  }
  const project = state?.projects.find(item => item.id === state.selectedProjectId);
  return <div className={`app ${state?.preferences.reduceMotion ? 'reduce-motion' : ''}`}>
    <aside className="sidebar"><div className="brand"><span className="brand-mark" aria-hidden="true">d.</span><h1>Dopamigo</h1></div>
      <nav aria-label="Main navigation">{(['plan', 'work', 'return'] as View[]).map((item, index) => <button key={item} className={view === item ? 'nav-item selected' : 'nav-item'} aria-current={view === item ? 'page' : undefined} onClick={() => void navigate(item)}><NavigationIcon name={item}/>{item[0].toUpperCase() + item.slice(1)}<kbd>⌘{index + 1}</kbd></button>)}</nav>

      <div className="sidebar-bottom"><button className={`nav-item ${view === 'settings' ? 'selected' : ''}`} aria-current={view === 'settings' ? 'page' : undefined} onClick={() => void navigate('settings')}><NavigationIcon name="settings"/>Settings<kbd>⌘,</kbd></button><p className="local-status">Stored on this Mac</p></div>
    </aside>
    <main><header className="topbar"><span className="view-title">{view[0].toUpperCase() + view.slice(1)}</span><BrowserBadge/><span className="workspace-status">{state?.session?.status === 'active' ? 'Focus session running' : 'Local workspace'}</span></header>
      {error && <div role="alert" className="notice error">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {runtime?.storageNotice && <div className="notice">{runtime.storageNotice}</div>}
      <AudioPlayer/><NudgeCard/>
      {!state || !runtime ? <div className="page"><h2>{error ? 'Unable to load your workspace' : 'Opening your workspace…'}</h2></div> : view === 'settings' ? <Settings preferences={state.preferences} runtime={runtime} command={command}/> : view === 'plan' ? <PlanView key={planVersion} state={state} command={command} navigate={next => void navigate(next)}/> : view === 'work' ? <WorkView state={state} command={command} navigate={next => void navigate(next)}/> : <ReturnView state={state} command={command} navigate={next => void navigate(next)}/>}
    </main>
    <aside className="task-panel" aria-label="To-do tasks">
      <div className="sidebar-tasks"><div className="task-panel-heading"><h2>To-do tasks</h2><span>{state?.projects.length ?? 0}</span></div>{state?.projects.length ? <div className="task-list">{[...new Set(state.projects.map(project => project.subject || 'My tasks'))].map(subject => <div key={subject} className="subject-group"><h3>{subject}</h3>{state.projects.filter(project => (project.subject || 'My tasks') === subject).map(project => <div key={project.id} className="task-row"><button className={`task-link ${state.selectedProjectId === project.id ? 'current' : ''}`} aria-label={`Open plan for ${project.title}`} onClick={async () => { if (await command({ type: 'project.select', projectId: project.id })) { setPlanVersion(value => value + 1); setView('plan'); } }}><span>{project.title}</span>{project.deadline && <small>Due {project.deadline.slice(0,10)}</small>}</button><button className="task-delete" disabled={deleting} aria-label={`Delete task ${project.title}`} title="Delete task" onClick={() => void deleteTask(project.id)}>×</button></div>)}</div>)}</div> : <p className="sidebar-empty">Your tasks will appear here.</p>}</div>
      {view === 'work' && state && project && <section className="task-panel-steps" aria-label="Current task steps">
        <NextAction state={state} command={command} onComplete={() => void command({ type: 'step.status', stepId: project.activeStepId!, status: 'done' })}/>
        <div className="roadmap-heading"><h3>Steps</h3><span>{project.plan?.steps.filter(step => step.status === 'done').length ?? 0} of {project.plan?.steps.length ?? 0} done</span></div>
        <div className="roadmap">{project.plan?.steps.map((step, index, steps) => <StepRow key={step.id} step={step} index={index} count={steps.length} active={step.id === project.activeStepId} command={command}/>)}</div>
      </section>}
    </aside>
  </div>;
}
