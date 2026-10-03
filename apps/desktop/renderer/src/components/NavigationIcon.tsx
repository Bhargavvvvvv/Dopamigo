type NavigationIconName = 'plan' | 'work' | 'return' | 'settings';

export function NavigationIcon({ name }: { name: NavigationIconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name === 'plan' && <><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/></>}
    {name === 'work' && <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></>}
    {name === 'return' && <><path d="M4 9h9a6 6 0 0 1 0 12h-2M8 5 4 9l4 4"/></>}
    {name === 'settings' && <><path d="M4 6h16M4 12h16M4 18h16"/><rect x="7" y="3.5" width="3" height="5" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="9.5" width="3" height="5" rx="1" fill="currentColor" stroke="none"/><rect x="8" y="15.5" width="3" height="5" rx="1" fill="currentColor" stroke="none"/></>}
  </svg>;
}
