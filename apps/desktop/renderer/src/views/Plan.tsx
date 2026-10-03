import { useRef, useState } from 'react';
import type { AppState, Command, Step } from '../../../../../packages/contracts';
import { AssignmentDetails } from '../components/AssignmentDetails';
import { currentProject } from '../../../../../packages/core/state';
import type { View } from '../App';

export type ViewProps = { state: AppState; command: (command: Command) => Promise<boolean>; navigate: (view: View) => void };

export function PlanView({ state, command, navigate }: ViewProps) {
  const project = currentProject(state);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const showForm = !project || creating;

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const result = await window.dopamigo.plan({ title, brief, deadline: deadline || undefined, clarification: question ? answer : undefined });
      if (!result.ok) setError(result.error);
      else if (result.value.kind === 'clarification') setQuestion(result.value.question);
      else { setCreating(false); setQuestion(''); setAnswer(''); }
    } catch { setError('The desktop connection was interrupted. Please retry.'); }
    finally { setBusy(false); }
  }

  return <section className={`page plan-page ${showForm ? 'compose-page' : ''}`}>
    <div className="section-heading">
      <div>
        <h2>{showForm ? 'What are you working on?' : project.title}</h2>
        <p className="lede">{showForm ? 'Add the task. We’ll help you work out the steps.' : 'Your plan. Change anything as you go.'}</p>
      </div>
      {project && <button className="secondary" onClick={() => setCreating(!creating)}>{creating ? 'Back to plan' : 'New task'}</button>}
    </div>

    {showForm ? <form className="task-form" onSubmit={e => { e.preventDefault(); void generate(); }}>
      <label className="task-title-field">Task name
        <input autoFocus required minLength={3} maxLength={180} placeholder="e.g. Literature review" value={title} onChange={e => setTitle(e.target.value)} disabled={busy || Boolean(question)}/>
      </label>
      <label>Assignment brief <span className="optional">Optional</span>
        <textarea rows={6} maxLength={30000} placeholder="Paste your instructions, or add a few details." value={brief} onChange={e => setBrief(e.target.value)} disabled={busy || Boolean(question)}/>
      </label>
      <label className="deadline">Due date <span className="optional">Optional</span>
        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} disabled={busy || Boolean(question)}/>
      </label>
      {question && <label>{question}<input required value={answer} maxLength={1000} onChange={e => setAnswer(e.target.value)}/></label>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="form-footer">
        <span className="source-label">{state.preferences.useMock ? 'Development mock · no AI request' : 'Your task and brief will be sent to Google Gemini.'}</span>
        <button className="primary" disabled={busy || state.session?.status === 'active'}>{busy ? 'Creating plan…' : 'Create plan'}</button>
      </div>
      {state.session?.status === 'active' && <small>Pause your focus session to plan another task.</small>}
    </form> : <>
      {project.assignment && <AssignmentDetails key={project.id} project={project} state={state} command={command}/>}
      <NextAction state={state} command={command} onStart={() => navigate('work')}/>
      <div className="roadmap-heading"><h3>Steps</h3><span>{project.plan?.steps.filter(s => s.status === 'done').length} of {project.plan?.steps.length} done</span></div>
      <div className="roadmap">{project.plan?.steps.map((step, index, steps) => <StepRow key={step.id} step={step} index={index} count={steps.length} active={step.id === project.activeStepId} command={command}/>)}</div>
      <p className="footnote plan-meta"><span>{project.plan?.source === 'starter' ? 'Starter step · add the brief when ready' : project.plan?.source === 'mock' ? 'Development mock plan' : 'Created with Gemini'}</span><span>Times are estimates.</span></p>
    </>}
  </section>;
}

export function NextAction({ state, command, onStart, onComplete, startLabel = 'Open workspace' }: {
  state: AppState;
  command: ViewProps['command'];
  onStart?: () => void;
  onComplete?: () => void;
  startLabel?: string;
}) {
  const project = currentProject(state);
  const step = project?.plan?.steps.find(s => s.id === project.activeStepId);
  return <div className="next-action">
    <div className="next-label"><span>{step ? 'Next step' : 'Finished'}</span>{step?.minutes && <span>About {step.minutes} min</span>}</div>
    <h3>{project?.nextAction || step?.title || 'All steps complete.'}</h3>
    {step && <p>{step.completion}</p>}
    {step && <div className="actions">
      {onStart && <button className="primary" onClick={onStart}>{startLabel}</button>}
      {onComplete && <button className="secondary" onClick={onComplete}>Complete step</button>}
      <button className="quiet" onClick={() => void command({ type: 'step.smaller' })}>Make it smaller</button>
    </div>}
  </div>;
}

export function StepRow({ step, index, count, active, command }: { step: Step; index: number; count: number; active: boolean; command: ViewProps['command'] }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(step.title);
  const [completion, setCompletion] = useState(step.completion);
  const [minutes, setMinutes] = useState(String(step.minutes ?? ''));
  const options = useRef<HTMLDetailsElement>(null);
  const closeOptions = () => { if (options.current) options.current.open = false; };

  return <div className={`step-row ${active ? 'active' : ''} ${step.status !== 'todo' ? 'finished' : ''}`}>
    <input className="step-checkbox" type="checkbox" checked={step.status === 'done'} aria-label={`Mark step ${index + 1} ${step.status === 'done' ? 'incomplete' : 'complete'}`} onChange={() => void command({ type: 'step.status', stepId: step.id, status: step.status === 'done' ? 'todo' : 'done' })}/>
    <div className="step-body">
      {editing ? <form className="step-edit" onSubmit={async e => {
        e.preventDefault();
        if (await command({ type: 'step.edit', stepId: step.id, title, completion, minutes: minutes ? Number(minutes) : undefined })) setEditing(false);
      }}>
        <label>Action<input autoFocus required maxLength={180} value={title} onChange={e => setTitle(e.target.value)}/></label>
        <label>Done when<input required maxLength={500} value={completion} onChange={e => setCompletion(e.target.value)}/></label>
        <label>Minutes <span className="optional">Optional</span><input type="number" min={1} max={180} value={minutes} onChange={e => setMinutes(e.target.value)}/></label>
        <button className="secondary">Save step</button><button type="button" className="quiet" onClick={() => setEditing(false)}>Cancel</button>
      </form> : <><strong>{step.title}</strong><p>{step.completion}</p>{step.status === 'skipped' && <small className="muted">Skipped</small>}</>}
    </div>
    <div className="step-aside">
      {step.minutes && <span className="step-time">{step.minutes} min</span>}
      <details className="step-options" ref={options} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false; }} onKeyDown={e => {
        if (e.key === 'Escape') { closeOptions(); options.current?.querySelector('summary')?.focus(); }
      }}>
        <summary aria-label={`Options for step ${index + 1}`}><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="4" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="16" cy="10" r="1.2"/></svg></summary>
        <div className="step-menu">
          <button onClick={() => { closeOptions(); setTitle(step.title); setCompletion(step.completion); setMinutes(String(step.minutes ?? '')); setEditing(true); }}>Edit step</button>
          <button disabled={index === 0} onClick={() => { closeOptions(); void command({ type: 'step.move', stepId: step.id, direction: 'up' }); }}>Move up</button>
          <button disabled={index === count - 1} onClick={() => { closeOptions(); void command({ type: 'step.move', stepId: step.id, direction: 'down' }); }}>Move down</button>
          <button onClick={() => { closeOptions(); void command({ type: 'step.status', stepId: step.id, status: step.status === 'todo' ? 'skipped' : 'todo' }); }}>{step.status === 'todo' ? 'Skip step' : 'Reopen step'}</button>
        </div>
      </details>
    </div>
  </div>;
}
