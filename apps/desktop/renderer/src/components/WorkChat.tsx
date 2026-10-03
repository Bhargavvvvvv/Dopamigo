import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Project } from '../../../../../packages/contracts';
export function WorkChat({ project, saveToNotes }: { project: Project; saveToNotes: (text: string) => Promise<void> }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const messages = project.chat ?? [];
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages.length, sending]);
  useLayoutEffect(() => {
    const resize = () => {
      if (!input.current) return;
      input.current.style.height = 'auto';
      input.current.style.height = `${Math.min(input.current.scrollHeight, 200)}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [message]);
  async function send() {
    const text = message.trim(); if (!text || submitting.current || attaching) return;
    submitting.current = true; setSending(true); setPending(text); setError(''); setMessage('');
    try {
      const result = await window.dopamigo.chat({ projectId: project.id, text });
      if (!result.ok) { setError(result.error); setMessage(text); }
    } catch { setError('Could not reach the workspace. Your message is ready to retry.'); setMessage(text); }
    finally { submitting.current = false; setSending(false); setPending(''); input.current?.focus(); }
  }
  async function attach() {
    setAttaching(true); setError('');
    try { const result = await window.dopamigo.attachPDF(project.id); if (!result.ok) setError(result.error); }
    catch { setError('Could not attach this PDF. Please try again.'); }
    finally { setAttaching(false); }
  }
  async function remove(documentId: string) {
    setAttaching(true); setError('');
    try { const result = await window.dopamigo.removePDF({ projectId: project.id, documentId }); if (!result.ok) setError(result.error); }
    catch { setError('Could not remove this PDF. Please try again.'); }
    finally { setAttaching(false); }
  }
  return <section className="work-chat" aria-label="Assignment work chat">
    <div className="chat-heading"><div><h3>Assignment chat</h3><p>Ask about your brief, notes, or PDFs.</p></div><span className="chat-provider">Gemini</span></div>
    <div className="chat-context"><div className="chat-context-heading"><span>Context {project.brief && <span className="chat-brief-status">· Brief included</span>}</span><button className="secondary" disabled={sending || attaching} onClick={() => void attach()}>{attaching ? 'Updating…' : 'Add PDF'}</button></div>
      <div className="chat-documents">{project.documents?.map(document => <span className="chat-document" key={document.id}><span>PDF · {document.name}</span><button aria-label={`Remove PDF ${document.name}`} disabled={sending || attaching} onClick={() => void remove(document.id)}>×</button></span>)}</div>
      {!project.documents?.length && <p className="chat-context-hint">Add readings or a rubric to include in the conversation.</p>}
      {project.assignment?.document && !project.documents?.length && <p className="chat-context-hint">Your Drive document is linked. Download and add its PDF here to include the full document.</p>}
    </div>
    <div className={`chat-log ${messages.length || sending ? 'has-messages' : ''}`} ref={log} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
      {!messages.length && !sending && <div className="chat-welcome"><p>Start with a question, or try one of these.</p><div className="chat-starters">{[
        { label: 'Explain the brief', text: 'Help me understand this assignment' },
        { label: 'Outline a draft', text: 'Draft an outline for this assignment using the available context' },
        { label: 'Review my notes', text: 'Review my notes against the brief' },
      ].map(({ label, text }) => <button type="button" key={label} onClick={() => { setMessage(text); input.current?.focus(); }}>{label}<span aria-hidden="true">↗</span></button>)}</div></div>}
      {messages.map(item => <article key={item.id} className={`chat-message ${item.role}`}><div className="chat-message-label">{item.role === 'user' ? 'You' : 'Gemini'}</div><div className={`chat-message-text ${item.role === 'model' ? 'chat-markdown' : ''}`}>{item.role === 'model' ? <Markdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children }) => <span>{children}</span>, img: ({ alt }) => <span>{alt}</span> }}>{item.text}</Markdown> : item.text}</div>{item.role === 'model' && <button className="quiet" onClick={async () => { try { await saveToNotes(item.text); setSaved(item.id); } catch (error) { setError(error instanceof Error ? error.message : 'Could not save to notes.'); } }}>{saved === item.id ? 'Saved to notes' : 'Add to notes'}</button>}</article>)}
      {sending && <><article className="chat-message user"><div className="chat-message-label">You</div><div className="chat-message-text">{pending}</div></article><p className="chat-thinking" role="status">Gemini is responding…</p></>}
    </div>
    {error && <p role="alert" className="inline-error">{error}</p>}
    <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}><label className="sr-only" htmlFor="chat-message">Message Gemini</label><textarea ref={input} id="chat-message" rows={3} maxLength={12000} value={message} disabled={sending} aria-describedby="chat-shortcuts chat-data-note" placeholder="Ask about this assignment…" onChange={event => setMessage(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/><div className="chat-composer-footer"><span id="chat-shortcuts">Enter to send · Shift + Enter for a new line</span><button className="primary" disabled={sending || attaching || !message.trim()}>{sending ? 'Sending…' : <>Send<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 15V5m-4 4 4-4 4 4"/></svg></>}</button></div></form>
    <p className="chat-disclosure" id="chat-data-note">Messages, notes, the brief, and PDFs are sent to Gemini. Chat is saved on this Mac. Check answers and citations.</p>
  </section>;
}
