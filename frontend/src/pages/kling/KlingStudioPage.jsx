import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';

// Scoped 1:1 port of the original Kling Studio interface. All selectors are
// namespaced under .kling-studio so the styles never leak into the dashboard.
const CSS = `
.kling-studio {
  --kbg:#0a0a0f; --kpanel:#15151f; --kpanel2:#1d1d2a; --kborder:#2a2a3a;
  --ktext:#e8e8f0; --kdim:#8a8a99; --kacc:#7c5cff; --kacc2:#ff5cb4;
  --ksuccess:#4ade80; --kerror:#ff5c7c;
  min-height:100vh; color:var(--ktext);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  background:var(--kbg);
  background-image:radial-gradient(circle at 20% 0%,rgba(124,92,255,0.15),transparent 50%),
                   radial-gradient(circle at 80% 100%,rgba(255,92,180,0.1),transparent 50%);
}
.kling-studio * { box-sizing:border-box; }
.kling-studio .container { max-width:1100px; margin:0 auto; padding:24px; }
.kling-studio .topbar { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
.kling-studio .back { padding:7px 13px; background:var(--kpanel2); border:1px solid var(--kborder); border-radius:8px; color:var(--kdim); cursor:pointer; font-size:13px; }
.kling-studio .back:hover { color:var(--ktext); }
.kling-studio header { text-align:center; margin:24px 0 32px; }
.kling-studio h1 { font-size:2.3rem; font-weight:800; letter-spacing:-0.02em;
  background:linear-gradient(135deg,var(--kacc),var(--kacc2)); -webkit-background-clip:text;
  -webkit-text-fill-color:transparent; background-clip:text; }
.kling-studio header p { color:var(--kdim); margin-top:8px; }
.kling-studio .notice { max-width:1100px; margin:0 auto 16px; background:rgba(255,92,124,0.12); border:1px solid var(--kerror); color:#ffd0d8; padding:12px 16px; border-radius:10px; font-size:0.9rem; }
.kling-studio .tabs { display:flex; gap:8px; background:var(--kpanel); padding:6px; border-radius:12px; margin-bottom:24px; border:1px solid var(--kborder); }
.kling-studio .tab { flex:1; padding:12px 16px; border:none; background:transparent; color:var(--kdim); border-radius:8px; cursor:pointer; font-size:0.95rem; font-weight:500; transition:all 0.2s; }
.kling-studio .tab:hover { color:var(--ktext); }
.kling-studio .tab.active { background:linear-gradient(135deg,var(--kacc),var(--kacc2)); color:#fff; }
.kling-studio .panel { background:var(--kpanel); border:1px solid var(--kborder); border-radius:16px; padding:28px; }
.kling-studio .form-row { display:grid; gap:16px; margin-bottom:16px; }
.kling-studio .form-row.cols-2 { grid-template-columns:1fr 1fr; }
.kling-studio .form-row.cols-3 { grid-template-columns:1fr 1fr 1fr; }
@media (max-width:600px){ .kling-studio .form-row.cols-2,.kling-studio .form-row.cols-3{ grid-template-columns:1fr; } }
.kling-studio label { display:block; font-size:0.85rem; color:var(--kdim); margin-bottom:6px; font-weight:500; }
.kling-studio input[type="text"],.kling-studio textarea,.kling-studio select {
  width:100%; padding:12px 14px; background:var(--kpanel2); border:1px solid var(--kborder);
  border-radius:10px; color:var(--ktext); font-size:0.95rem; font-family:inherit; transition:border-color 0.2s; }
.kling-studio input:focus,.kling-studio textarea:focus,.kling-studio select:focus { outline:none; border-color:var(--kacc); }
.kling-studio textarea { resize:vertical; min-height:80px; }
.kling-studio .file-drop { border:2px dashed var(--kborder); border-radius:12px; padding:24px; text-align:center; cursor:pointer; transition:all 0.2s; background:var(--kpanel2); display:block; }
.kling-studio .file-drop:hover { border-color:var(--kacc); background:rgba(124,92,255,0.05); }
.kling-studio .file-drop.has-file { border-style:solid; border-color:var(--kacc); padding:8px; }
.kling-studio .file-drop input[type="file"] { display:none; }
.kling-studio .file-drop .placeholder { color:var(--kdim); font-size:0.9rem; }
.kling-studio .file-drop img { max-width:100%; max-height:180px; border-radius:8px; display:block; margin:0 auto; }
.kling-studio button.primary { width:100%; padding:14px; margin-top:8px; border:none; border-radius:10px;
  background:linear-gradient(135deg,var(--kacc),var(--kacc2)); color:#fff; font-size:1rem; font-weight:600; cursor:pointer; transition:transform 0.1s; }
.kling-studio button.primary:hover { transform:translateY(-1px); }
.kling-studio button.primary:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
.kling-studio .status { margin-top:24px; padding:16px; border-radius:10px; background:var(--kpanel2); border:1px solid var(--kborder); }
.kling-studio .status .row { display:flex; align-items:center; gap:10px; }
.kling-studio .spinner { width:18px; height:18px; border:2px solid var(--kborder); border-top-color:var(--kacc); border-radius:50%; animation:kspin 0.8s linear infinite; flex-shrink:0; }
@keyframes kspin { to { transform:rotate(360deg); } }
.kling-studio .status .msg { font-size:0.9rem; color:var(--kdim); }
.kling-studio .status.error { border-color:var(--kerror); }
.kling-studio .status.error .msg { color:var(--kerror); }
.kling-studio .status.success { border-color:var(--ksuccess); }
.kling-studio video { width:100%; margin-top:16px; border-radius:10px; background:#000; }
.kling-studio .download-btn { display:inline-block; margin-top:12px; padding:10px 16px; background:var(--kpanel2); color:var(--ktext); border:1px solid var(--kborder); border-radius:8px; text-decoration:none; font-size:0.9rem; }
.kling-studio .download-btn:hover { border-color:var(--kacc); }
.kling-studio .frame-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:600px){ .kling-studio .frame-grid{ grid-template-columns:1fr; } }
`;

const TABS = [
  { id: 't2v', label: '📝 Text → Video' },
  { id: 'i2v', label: '🖼️ Image + Prompt → Video' },
  { id: 'f2v', label: '🎬 First + Last Frame' },
];

function Status({ s }) {
  if (!s) return null;
  const cls = s.kind === 'error' ? 'status error' : s.kind === 'success' ? 'status success' : 'status';
  return (
    <div className={cls}>
      {s.kind === 'loading' && (
        <div className="row"><div className="spinner" /><div className="msg">{s.msg}</div></div>
      )}
      {s.kind === 'error' && <div className="msg">✗ {s.msg}</div>}
      {s.kind === 'success' && (
        <>
          <div className="msg" style={{ color: 'var(--ksuccess)' }}>✓ {s.msg}</div>
          {s.video && (
            <>
              <video src={s.video} controls autoPlay loop />
              <a className="download-btn" href={s.video} download="kling-video.mp4" target="_blank" rel="noreferrer">⬇️ Download MP4</a>
            </>
          )}
        </>
      )}
    </div>
  );
}

function FileDrop({ id, label, file, onPick }) {
  const inputRef = useRef(null);
  const preview = file ? URL.createObjectURL(file) : null;
  return (
    <label className={'file-drop' + (file ? ' has-file' : '')}>
      <input ref={inputRef} type="file" accept="image/*" onChange={e => onPick(e.target.files[0] || null)} />
      {preview ? <img src={preview} alt="" /> : <div className="placeholder">{label}</div>}
    </label>
  );
}

export default function KlingStudioPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('t2v');
  const [enabled, setEnabled] = useState(true);
  const [f, setF] = useState({
    t2v_prompt: '', t2v_negative: '', t2v_aspect: '16:9', t2v_duration: '5', t2v_mode: 'std',
    i2v_prompt: '', i2v_negative: '', i2v_duration: '5', i2v_mode: 'std',
    f2v_prompt: '', f2v_duration: '5', f2v_mode: 'std',
  });
  const [files, setFiles] = useState({ i2v_image: null, f2v_first: null, f2v_last: null });
  const [status, setStatus] = useState({}); // { t2v:{kind,msg,video}, ... }
  const [busy, setBusy] = useState({});

  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }));
  const setStat = (mode, kind, msg, video) => setStatus(p => ({ ...p, [mode]: { kind, msg, video } }));

  useEffect(() => {
    api.get('/api/kling/config').then(r => setEnabled(r.data.enabled)).catch(() => setEnabled(false));
  }, []);

  async function pollTask(mode, taskId, taskType) {
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const { data } = await api.get(`/api/kling/task/${taskType}/${taskId}`);
        const elapsed = (i + 1) * 3;
        setStat(mode, 'loading', `Status: ${data.status} · ${elapsed}s elapsed${data.status_msg ? ' · ' + data.status_msg : ''}`);
        if (data.status === 'succeed') {
          setStat(mode, 'success', 'Video ready!', data.videos[0]?.url);
          setBusy(b => ({ ...b, [mode]: false }));
          return;
        }
        if (data.status === 'failed') throw new Error(data.status_msg || 'Generation failed');
      } catch (err) {
        setStat(mode, 'error', err.response?.data?.detail || err.message);
        setBusy(b => ({ ...b, [mode]: false }));
        return;
      }
    }
    setStat(mode, 'error', 'Timed out after 6 minutes');
    setBusy(b => ({ ...b, [mode]: false }));
  }

  async function generate(mode) {
    try {
      let endpoint, body;
      if (mode === 't2v') {
        if (!f.t2v_prompt.trim()) return setStat('t2v', 'error', 'Please enter a prompt');
        endpoint = '/api/kling/text-to-video';
        body = {
          prompt: f.t2v_prompt, negative_prompt: f.t2v_negative,
          aspect_ratio: f.t2v_aspect, duration: f.t2v_duration, mode: f.t2v_mode,
        };
      } else if (mode === 'i2v') {
        if (!files.i2v_image) return setStat('i2v', 'error', 'Please upload an image');
        if (!f.i2v_prompt.trim()) return setStat('i2v', 'error', 'Please enter a prompt');
        endpoint = '/api/kling/image-to-video';
        body = new FormData();
        body.append('image', files.i2v_image);
        body.append('prompt', f.i2v_prompt);
        body.append('negative_prompt', f.i2v_negative);
        body.append('duration', f.i2v_duration);
        body.append('mode', f.i2v_mode);
      } else {
        if (!files.f2v_first || !files.f2v_last) return setStat('f2v', 'error', 'Please upload both first and last frames');
        endpoint = '/api/kling/frames-to-video';
        body = new FormData();
        body.append('first_frame', files.f2v_first);
        body.append('last_frame', files.f2v_last);
        body.append('prompt', f.f2v_prompt);
        body.append('duration', f.f2v_duration);
        body.append('mode', f.f2v_mode);
      }

      setBusy(b => ({ ...b, [mode]: true }));
      setStat(mode, 'loading', 'Submitting task to Kling...');
      const { data } = await api.post(endpoint, body);
      setStat(mode, 'loading', `Task submitted (${data.task_id}) — generating...`);
      const taskType = mode === 't2v' ? 'text2video' : 'image2video';
      pollTask(mode, data.task_id, taskType);
    } catch (err) {
      setStat(mode, 'error', err.response?.data?.detail || err.message);
      setBusy(b => ({ ...b, [mode]: false }));
    }
  }

  return (
    <div className="kling-studio">
      <style>{CSS}</style>
      <div className="container">
        <div className="topbar">
          <button className="back" onClick={() => navigate('/')}>← Home</button>
        </div>
        <header>
          <h1>Video Studio</h1>
          <p>Generate AI videos with three modes — powered by Kling</p>
        </header>

        {!enabled && (
          <div className="notice">
            ⚠️ Video Studio isn't configured yet. An admin must set <b>KLING_ACCESS_KEY</b> and <b>KLING_SECRET_KEY</b> on the server.
          </div>
        )}

        <div className="tabs">
          {TABS.map(t => (
            <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="panel">
          {/* MODE 1: Text -> Video */}
          {tab === 't2v' && (
            <div>
              <div className="form-row">
                <div>
                  <label>Prompt</label>
                  <textarea value={f.t2v_prompt} onChange={set('t2v_prompt')}
                    placeholder="A cinematic shot of a woman walking through Tokyo at night, neon reflections on wet streets..." />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Negative prompt (optional)</label>
                  <input type="text" value={f.t2v_negative} onChange={set('t2v_negative')} placeholder="blurry, low quality, distorted" />
                </div>
              </div>
              <div className="form-row cols-3">
                <div>
                  <label>Aspect ratio</label>
                  <select value={f.t2v_aspect} onChange={set('t2v_aspect')}>
                    <option value="16:9">16:9 (landscape)</option>
                    <option value="9:16">9:16 (vertical)</option>
                    <option value="1:1">1:1 (square)</option>
                  </select>
                </div>
                <div>
                  <label>Duration</label>
                  <select value={f.t2v_duration} onChange={set('t2v_duration')}>
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                  </select>
                </div>
                <div>
                  <label>Quality</label>
                  <select value={f.t2v_mode} onChange={set('t2v_mode')}>
                    <option value="std">Standard (faster)</option>
                    <option value="pro">Pro (higher quality)</option>
                  </select>
                </div>
              </div>
              <button className="primary" disabled={busy.t2v || !enabled} onClick={() => generate('t2v')}>
                {busy.t2v ? 'Generating…' : 'Generate Video'}
              </button>
              <Status s={status.t2v} />
            </div>
          )}

          {/* MODE 2: Image -> Video */}
          {tab === 'i2v' && (
            <div>
              <div className="form-row">
                <div>
                  <label>Reference image</label>
                  <FileDrop label="Click to upload an image (JPG/PNG, max 10 MB)" file={files.i2v_image}
                    onPick={file => setFiles(p => ({ ...p, i2v_image: file }))} />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Prompt (describe the motion / scene)</label>
                  <textarea value={f.i2v_prompt} onChange={set('i2v_prompt')}
                    placeholder="The character turns and smiles at the camera, soft wind blows hair..." />
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label>Negative prompt (optional)</label>
                  <input type="text" value={f.i2v_negative} onChange={set('i2v_negative')} placeholder="blurry, distorted face" />
                </div>
              </div>
              <div className="form-row cols-2">
                <div>
                  <label>Duration</label>
                  <select value={f.i2v_duration} onChange={set('i2v_duration')}>
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                  </select>
                </div>
                <div>
                  <label>Quality</label>
                  <select value={f.i2v_mode} onChange={set('i2v_mode')}>
                    <option value="std">Standard</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
              </div>
              <button className="primary" disabled={busy.i2v || !enabled} onClick={() => generate('i2v')}>
                {busy.i2v ? 'Generating…' : 'Generate Video'}
              </button>
              <Status s={status.i2v} />
            </div>
          )}

          {/* MODE 3: First + Last Frame */}
          {tab === 'f2v' && (
            <div>
              <div className="frame-grid">
                <div>
                  <label>First frame</label>
                  <FileDrop label="Upload start frame" file={files.f2v_first}
                    onPick={file => setFiles(p => ({ ...p, f2v_first: file }))} />
                </div>
                <div>
                  <label>Last frame</label>
                  <FileDrop label="Upload end frame" file={files.f2v_last}
                    onPick={file => setFiles(p => ({ ...p, f2v_last: file }))} />
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 16 }}>
                <div>
                  <label>Prompt (optional — describes the transition)</label>
                  <textarea value={f.f2v_prompt} onChange={set('f2v_prompt')}
                    placeholder="Smooth camera dolly forward, day turns to night..." />
                </div>
              </div>
              <div className="form-row cols-2">
                <div>
                  <label>Duration</label>
                  <select value={f.f2v_duration} onChange={set('f2v_duration')}>
                    <option value="5">5 seconds</option>
                    <option value="10">10 seconds</option>
                  </select>
                </div>
                <div>
                  <label>Quality</label>
                  <select value={f.f2v_mode} onChange={set('f2v_mode')}>
                    <option value="std">Standard</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
              </div>
              <button className="primary" disabled={busy.f2v || !enabled} onClick={() => generate('f2v')}>
                {busy.f2v ? 'Generating…' : 'Generate Video'}
              </button>
              <Status s={status.f2v} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
