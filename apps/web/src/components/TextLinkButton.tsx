/** Adds a safe http(s) URL to a plain-text field; displayed text is linkified elsewhere. */
export function TextLinkButton({ value, onChange, disabled = false, className = '' }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const addLink = () => {
    const rawUrl = window.prompt('Paste the link (https://...)');
    if (!rawUrl) return;
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      window.alert('Please enter a valid http(s) link.');
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      window.alert('Only http(s) links can be added.');
      return;
    }
    const label = window.prompt('Optional link label');
    const text = label?.trim() ? `${label.trim()}: ${url.toString()}` : url.toString();
    onChange(value.trim() ? `${value}\n${text}` : text);
  };

  return (
    <button type="button" disabled={disabled} onClick={addLink} className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 dark:border-[#2d2d2d] dark:bg-[#1a1a1a] dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:text-indigo-400 ${className}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.07.07l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" /><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15" /></svg>
      Add link
    </button>
  );
}
