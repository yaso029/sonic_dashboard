import { useEffect, useRef } from 'react';

// A dependency-free Word-like rich text editor built on contentEditable +
// document.execCommand. Stores/emits HTML. Notes are private per user.

const CSS = `
.rte { display:flex; flex-direction:column; flex:1 1 auto; min-height:0; height:100%; }
.rte-toolbar { display:flex; flex-wrap:wrap; align-items:center; gap:3px; padding:8px 10px;
  border-bottom:1px solid var(--border); background:var(--surface-2); position:sticky; top:0; z-index:2; }
.rte-grp { display:flex; align-items:center; gap:2px; padding:0 6px; border-right:1px solid var(--border); }
.rte-grp:last-child { border-right:none; }
.rte-btn { min-width:30px; height:30px; padding:0 7px; border:1px solid transparent; border-radius:6px;
  background:transparent; color:var(--text); cursor:pointer; font-size:14px; line-height:1;
  display:inline-flex; align-items:center; justify-content:center; }
.rte-btn:hover { background:var(--surface); border-color:var(--border); }
.rte-sel { height:30px; border:1px solid var(--border); border-radius:6px; background:var(--surface);
  color:var(--text); font-size:13px; padding:0 6px; cursor:pointer; }
.rte-sw { width:18px; height:18px; border-radius:4px; border:1px solid rgba(0,0,0,0.25); cursor:pointer; padding:0; }
.rte-content { flex:1; overflow-y:auto; padding:22px 26px; outline:none; color:var(--text);
  font-size:15px; line-height:1.7; }
.rte-content:empty:before { content: attr(data-placeholder); color: var(--text-muted); }
.rte-content h1 { font-size:1.7em; font-weight:800; margin:.5em 0 .3em; }
.rte-content h2 { font-size:1.4em; font-weight:700; margin:.5em 0 .3em; }
.rte-content h3 { font-size:1.15em; font-weight:700; margin:.4em 0 .2em; }
.rte-content p { margin:0 0 .6em; }
.rte-content ul { list-style:disc; padding-left:1.6em; margin:0 0 .6em; }
.rte-content ol { list-style:decimal; padding-left:1.6em; margin:0 0 .6em; }
.rte-content blockquote { border-left:3px solid #7c5cff; margin:0 0 .6em; padding:.2em 0 .2em 1em; color:var(--text-muted); }
.rte-content a { color:#2563eb; text-decoration:underline; }
`;

const TEXT_COLORS = ['#111827', '#ef4444', '#2563eb', '#16a34a', '#7c3aed', '#ea580c'];
const HILITES = [['#fff59d', 'Yellow'], ['#bbf7d0', 'Green'], ['#fbcfe8', 'Pink'], ['#bfdbfe', 'Blue'], ['transparent', 'None']];

function escapeAndBreak(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\n/g, '<br>');
}

export default function RichTextEditor({ value, onChange, docKey, placeholder = 'Write your note here…' }) {
  const ref = useRef(null);

  // Load content only when the open note changes — never on every keystroke
  // (which would reset the caret).
  useEffect(() => {
    if (!ref.current) return;
    const html = value && value.indexOf('<') !== -1 ? value : escapeAndBreak(value || '');
    ref.current.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  const emit = () => onChange(ref.current ? ref.current.innerHTML : '');

  const exec = (cmd, val = null) => {
    if (ref.current) ref.current.focus();
    try { document.execCommand(cmd, false, val); } catch { /* deprecated but supported */ }
    emit();
  };

  // Keep the text selection when clicking toolbar controls.
  const hold = (e) => e.preventDefault();

  const Btn = ({ cmd, val, title, children }) => (
    <button type="button" className="rte-btn" title={title} onMouseDown={hold} onClick={() => exec(cmd, val)}>
      {children}
    </button>
  );

  const setBlock = (e) => { const v = e.target.value; exec('formatBlock', `<${v}>`); e.target.value = 'p'; };
  const setSize = (e) => { exec('fontSize', e.target.value); e.target.value = '3'; };
  const addLink = () => { const url = window.prompt('Link URL:', 'https://'); if (url) exec('createLink', url); };

  return (
    <div className="rte">
      <style>{CSS}</style>
      <div className="rte-toolbar">
        <div className="rte-grp">
          <select className="rte-sel" defaultValue="p" onMouseDown={hold} onChange={setBlock} title="Paragraph style">
            <option value="p">Normal</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="blockquote">Quote</option>
          </select>
          <select className="rte-sel" defaultValue="3" onMouseDown={hold} onChange={setSize} title="Font size">
            <option value="2">Small</option>
            <option value="3">Normal</option>
            <option value="5">Large</option>
            <option value="7">Huge</option>
          </select>
        </div>

        <div className="rte-grp">
          <Btn cmd="bold" title="Bold"><b>B</b></Btn>
          <Btn cmd="italic" title="Italic"><i>I</i></Btn>
          <Btn cmd="underline" title="Underline"><u>U</u></Btn>
          <Btn cmd="strikeThrough" title="Strikethrough"><s>S</s></Btn>
        </div>

        <div className="rte-grp" title="Text color">
          {TEXT_COLORS.map(c => (
            <button key={c} type="button" className="rte-sw" style={{ background: c }} title={`Text ${c}`}
              onMouseDown={hold} onClick={() => exec('foreColor', c)} />
          ))}
        </div>

        <div className="rte-grp" title="Highlight">
          {HILITES.map(([c, name]) => (
            <button key={c} type="button" className="rte-sw"
              style={{ background: c === 'transparent' ? 'var(--surface)' : c, ...(c === 'transparent' ? { fontSize: 10 } : {}) }}
              title={`Highlight ${name}`} onMouseDown={hold}
              onClick={() => exec('hiliteColor', c === 'transparent' ? '#ffffff' : c)}>
              {c === 'transparent' ? '∅' : ''}
            </button>
          ))}
        </div>

        <div className="rte-grp">
          <Btn cmd="insertUnorderedList" title="Bullet list">•≡</Btn>
          <Btn cmd="insertOrderedList" title="Numbered list">1.</Btn>
        </div>

        <div className="rte-grp">
          <Btn cmd="justifyLeft" title="Align left">⬅</Btn>
          <Btn cmd="justifyCenter" title="Align center">⬌</Btn>
          <Btn cmd="justifyRight" title="Align right">➡</Btn>
        </div>

        <div className="rte-grp">
          <button type="button" className="rte-btn" title="Insert link" onMouseDown={hold} onClick={addLink}>🔗</button>
          <Btn cmd="removeFormat" title="Clear formatting">✕</Btn>
        </div>
      </div>

      <div
        ref={ref}
        className="rte-content"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
      />
    </div>
  );
}
