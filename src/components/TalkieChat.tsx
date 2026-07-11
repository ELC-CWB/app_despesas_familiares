'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const LS_VOICE = 'talkie_voice';
type StatusMode = 'idle' | 'listening' | 'thinking' | 'speaking';
interface Correction { said: string; better: string; why?: string; }
interface Turn { role: 'user' | 'assistant'; text: string; corrections?: Correction[]; }
interface ChatResult { corrections?: Correction[]; reply: string; level: string; topic: string; memory: string; error?: string; }
interface SettingsRow { level: string; topic: string; memory: string; error?: string; }

function escapeHtml(s: string) {
  return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m] as string));
}

// Prefer cloud (non-local) voices — much better quality on Android
function pickVoice(voices: SpeechSynthesisVoice[], preferred: string): SpeechSynthesisVoice | undefined {
  if (preferred) { const e = voices.find(v => v.name === preferred); if (e) return e; }
  const cloud = voices.filter(v => !v.localService && v.lang.startsWith('en'));
  if (cloud.length) return cloud[0];
  return voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en'));
}

// ─── Jane Avatar ─────────────────────────────────────────────────────────────
function JaneAvatar({ mode }: { mode: StatusMode }) {
  return (
    <div className={`jane-wrap jane-${mode}`}>
      <svg viewBox="0 0 200 235" xmlns="http://www.w3.org/2000/svg" className="jane-svg">
        {/* Hair back */}
        <ellipse cx="100" cy="82" rx="58" ry="63" fill="#D4A820"/>
        <path d="M44 78 Q22 132 28 202 Q42 228 62 238 L66 210 Q46 184 46 148 Q44 112 54 82 Z" fill="#C89A18"/>
        <path d="M156 78 Q178 132 172 202 Q158 228 138 238 L134 210 Q154 184 154 148 Q156 112 146 82 Z" fill="#C89A18"/>
        {/* Face */}
        <ellipse cx="100" cy="96" rx="52" ry="60" fill="#FDCF96"/>
        {/* Ears */}
        <ellipse cx="48" cy="96" rx="7" ry="9" fill="#FDCF96"/>
        <ellipse cx="152" cy="96" rx="7" ry="9" fill="#FDCF96"/>
        {/* Front hair / fringe */}
        <path d="M48 65 Q60 18 100 14 Q140 18 152 65 Q132 44 118 46 Q105 42 100 44 Q95 42 82 46 Q68 44 48 65 Z" fill="#E8BE30"/>
        <path d="M72 22 Q100 13 128 22 Q112 16 100 15 Q88 16 72 22 Z" fill="rgba(255,240,160,0.5)"/>
        {/* Eyebrows */}
        <path d="M63 78 Q74 72 87 75" stroke="#7A5010" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M113 75 Q126 72 137 78" stroke="#7A5010" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        {/* Eye whites */}
        <ellipse cx="76" cy="89" rx="13" ry="11" fill="white"/>
        <ellipse cx="124" cy="89" rx="13" ry="11" fill="white"/>
        {/* Iris */}
        <ellipse cx="76" cy="90" rx="8" ry="8.5" fill="#5590D8"/>
        <ellipse cx="124" cy="90" rx="8" ry="8.5" fill="#5590D8"/>
        <ellipse cx="76" cy="90" rx="5.5" ry="6" fill="#3B6CB0"/>
        <ellipse cx="124" cy="90" rx="5.5" ry="6" fill="#3B6CB0"/>
        {/* Pupils */}
        <circle cx="77" cy="90" r="3.8" fill="#180E28"/>
        <circle cx="125" cy="90" r="3.8" fill="#180E28"/>
        {/* Sparkles */}
        <circle cx="80" cy="87" r="2" fill="white"/>
        <circle cx="128" cy="87" r="2" fill="white"/>
        <circle cx="74" cy="93" r="1" fill="rgba(255,255,255,0.5)"/>
        <circle cx="122" cy="93" r="1" fill="rgba(255,255,255,0.5)"/>
        {/* Eyelashes */}
        <path d="M63 82 Q70 76 80 79 Q88 76 89 83" stroke="#3A2505" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        <path d="M111 83 Q112 76 120 79 Q130 76 137 82" stroke="#3A2505" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        {/* Eyelids (blink via CSS) */}
        <ellipse cx="76" cy="89" rx="13" ry="11" fill="#FDCF96" className="jane-lid-L"/>
        <ellipse cx="124" cy="89" rx="13" ry="11" fill="#FDCF96" className="jane-lid-R"/>
        {/* Lower lash lines */}
        <path d="M63 95 Q76 100 89 95" stroke="#C8956A" strokeWidth="0.8" fill="none"/>
        <path d="M111 95 Q124 100 137 95" stroke="#C8956A" strokeWidth="0.8" fill="none"/>
        {/* Nose */}
        <path d="M95 113 Q91 122 94 126 Q97 129 100 129 Q103 129 106 126 Q109 122 105 113" stroke="#C08060" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        <path d="M94 126 Q100 128 106 126" stroke="#C08060" strokeWidth="1.5" fill="none"/>
        {/* Cheeks */}
        <ellipse cx="60" cy="112" rx="17" ry="9" fill="rgba(240,100,90,0.13)"/>
        <ellipse cx="140" cy="112" rx="17" ry="9" fill="rgba(240,100,90,0.13)"/>
        {/* Mouth */}
        <ellipse cx="100" cy="141" rx="13" ry="5" fill="#7A1C1C" className="jane-mouth-bg"/>
        <ellipse cx="100" cy="137" rx="11" ry="5" fill="#F0EEE8" className="jane-teeth"/>
        {/* Upper lip */}
        <path d="M84 134 Q92 129 100 131 Q108 129 116 134 Q108 136 100 135 Q92 136 84 134 Z" fill="#C04858"/>
        {/* Lower lip */}
        <path d="M84 134 Q100 148 116 134 Q108 142 100 144 Q92 142 84 134 Z" fill="#D86070" className="jane-lower-lip"/>
        {/* Neck */}
        <rect x="89" y="154" width="22" height="28" fill="#FDCF96" rx="2"/>
        <path d="M89 154 Q94 162 100 162 Q106 162 111 154" fill="rgba(0,0,0,0.04)"/>
        {/* Body */}
        <path d="M10 235 Q38 194 89 178 L111 178 Q162 194 190 235 Z" fill="#1D4ED8"/>
        <path d="M89 178 Q94 188 100 188 Q106 188 111 178 L108 182 Q100 192 92 182 Z" fill="#1E40AF"/>
        <path d="M12 235 Q45 204 89 185" stroke="rgba(255,255,255,0.12)" strokeWidth="10" fill="none" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function TalkieChat() {
  const [level, setLevel] = useState('intermediário');
  const [topic, setTopic] = useState('');
  const [memory, setMemory] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [active, setActive] = useState(false);
  const [statusMode, setStatusMode] = useState<StatusMode>('idle');
  const [statusMsg, setStatusMsg] = useState('Toque em Iniciar pra começar');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [recognitionSupported, setRecognitionSupported] = useState(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingApiRef = useRef(false);
  const activeRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVoiceName(localStorage.getItem(LS_VOICE) || '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setRecognitionSupported(!!SR);
    const loadVoices = () => {
      const v = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      if (v.length) setVoices(v);
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    (async () => {
      try {
        const resp = await fetch('/api/talkie-settings');
        const data: SettingsRow = await resp.json();
        if (!resp.ok || data.error) { setAuthError(true); return; }
        setLevel(data.level); setTopic(data.topic); setMemory(data.memory);
      } catch { setAuthError(true); }
      finally { setSettingsLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [turns]);

  const persistVoice = (v: string) => { setVoiceName(v); localStorage.setItem(LS_VOICE, v); };
  const saveSettings = useCallback(async (patch: { level?: string; topic?: string; memory?: string }) => {
    try {
      const r = await fetch('/api/talkie-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const d: SettingsRow = await r.json();
      if (r.ok && !d.error) { setLevel(d.level); setTopic(d.topic); setMemory(d.memory); }
    } catch {}
  }, []);
  const persistLevel = (v: string) => { setLevel(v); saveSettings({ level: v }); };
  const persistTopic = (v: string) => { setTopic(v); saveSettings({ topic: v }); };
  const resetMemory = () => { setMemory(''); saveSettings({ memory: '' }); };

  const speak = useCallback((text: string, rate = 1.0): Promise<void> => {
    return new Promise(resolve => {
      if (!text) { resolve(); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const chosen = pickVoice(voices, voiceName);
      if (chosen) u.voice = chosen;
      u.rate = rate; u.pitch = 1.05;
      setStatusMode('speaking');
      setStatusMsg(rate < 1 ? 'Reproduzindo devagar...' : 'Jane está falando...');
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }, [voices, voiceName]);

  const replayTurn = useCallback(async (text: string, rate = 1.0) => {
    await speak(text, rate);
    if (activeRef.current) { setStatusMode('listening'); setStatusMsg('Ouvindo...'); }
    else { setStatusMode('idle'); setStatusMsg('Toque em Iniciar pra começar'); }
  }, [speak]);

  const restartListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.start(); setStatusMode('listening'); setStatusMsg('Ouvindo...'); } catch {}
  }, []);

  const handleUserSpeech = useCallback(async (text: string) => {
    awaitingApiRef.current = true;
    setStatusMode('thinking'); setStatusMsg('Pensando...');
    try {
      const resp = await fetch('/api/talkie-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
      const data: ChatResult = await resp.json();
      if (!resp.ok || data.error) {
        setStatusMode('idle'); setStatusMsg('Erro: ' + (data.error || resp.status));
        awaitingApiRef.current = false;
        if (activeRef.current) restartListening();
        return;
      }
      setTurns(p => [...p, { role: 'user', text, corrections: data.corrections || [] }]);
      setTopic(data.topic); setMemory(data.memory);
      setTurns(p => [...p, { role: 'assistant', text: data.reply }]);
      awaitingApiRef.current = false;
      await speak(data.reply);
      if (activeRef.current) restartListening();
      else { setStatusMode('idle'); setStatusMsg('Toque em Iniciar pra começar'); }
    } catch {
      setStatusMode('idle'); setStatusMsg('Erro de conexão');
      awaitingApiRef.current = false;
    }
  }, [speak, restartListening]);

  const initRecognition = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR();
    rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
      if (final.trim()) { rec.stop(); handleUserSpeech(final.trim()); }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn('rec error', e.error); };
    rec.onend = () => {
      if (activeRef.current && !awaitingApiRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          try { rec.start(); setStatusMode('listening'); setStatusMsg('Ouvindo...'); } catch {}
        }, 300);
      }
    };
    recognitionRef.current = rec;
  }, [handleUserSpeech]);

  const startSession = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatusMsg('Microfone não suportado neste navegador ou contexto (requer HTTPS).');
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotFoundError') {
        setStatusMsg('Nenhum microfone encontrado. Conecte um microfone e tente novamente.');
      } else if (name === 'NotReadableError') {
        setStatusMsg('Microfone em uso por outro app. Feche os outros apps e tente novamente.');
      } else {
        setStatusMsg('Permissão de microfone negada. Ative o acesso nas configurações do navegador.');
      }
      return;
    }
    setActive(true); activeRef.current = true;
    initRecognition();
    awaitingApiRef.current = true;
    setStatusMode('thinking'); setStatusMsg('Iniciando...');
    try {
      const resp = await fetch('/api/talkie-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '[SESSION START] Greet me warmly and naturally in English to kick off our chat. If we have talked before, pick up from where we left off using the memory; otherwise suggest a light, friendly topic.' }) });
      const data: ChatResult = await resp.json();
      if (data && !data.error) {
        setTopic(data.topic); setMemory(data.memory);
        setTurns(p => [...p, { role: 'assistant', text: data.reply }]);
        awaitingApiRef.current = false;
        await speak(data.reply);
      } else { awaitingApiRef.current = false; }
    } catch { awaitingApiRef.current = false; }
    if (activeRef.current) restartListening();
  }, [initRecognition, speak, restartListening]);

  const stopSession = useCallback(() => {
    setActive(false); activeRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
    speechSynthesis.cancel();
    setStatusMode('idle'); setStatusMsg('Toque em Iniciar pra começar');
  }, []);

  if (authError) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', padding:'40px', textAlign:'center', fontFamily:'Inter,sans-serif', color:'#8B93A1' }}>
      <p>Não foi possível carregar suas configurações — você não está logado. Entre na conta e recarregue a página.</p>
    </div>
  );

  return (
    <div className="tk-root">

      {/* ── Header ── */}
      <header className="tk-header">
        <div className="tk-brand"><h1>Talkie</h1><span>English on the go</span></div>
        <div className="tk-header-actions">
          {!active
            ? <button className="tk-btn tk-btn-start" onClick={startSession} disabled={!settingsLoaded || !recognitionSupported}>▶ Iniciar</button>
            : <button className="tk-btn tk-btn-stop" onClick={stopSession}>■ Parar</button>}
          <button className="tk-gear" onClick={() => setPanelOpen(true)} aria-label="Configurações">⚙</button>
        </div>
      </header>

      {/* ── Avatar ── */}
      <div className="tk-avatar-section">
        <JaneAvatar mode={statusMode} />
        <div className="tk-status-bar">
          <span className={`tk-dot tk-dot-${statusMode}`}/>
          <span className="tk-status-text">{statusMsg}</span>
        </div>
        {topic && <div className="tk-topic">Topic: <em>{topic}</em></div>}
      </div>

      {!recognitionSupported && (
        <div className="tk-compat">Use Chrome no Android para melhor experiência com reconhecimento de voz.</div>
      )}

      {/* ── Transcript ── */}
      <div className="tk-transcript" ref={transcriptRef}>
        {turns.length === 0 && (
          <div className="tk-empty">
            {settingsLoaded ? 'Toque em Iniciar e comece a conversar com Jane em inglês.' : 'Carregando...'}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`tk-bubble tk-bubble-${t.role}`}>
            <div className="tk-bubble-inner">
              <div className="tk-label">{t.role === 'user' ? 'Você' : 'Jane'}</div>
              <div dangerouslySetInnerHTML={{ __html: escapeHtml(t.text) }}/>
              {t.role === 'user' && t.corrections?.map((c, j) => (
                <div className="tk-correction" key={j}>
                  <span className="tk-said">{c.said}</span>
                  <span className="tk-arrow"> → </span>
                  <span className="tk-better">{c.better}</span>
                  {c.why && <div className="tk-why">{c.why}</div>}
                </div>
              ))}
            </div>
            {t.role === 'assistant' && (
              <div className="tk-replay">
                <button className="tk-replay-btn" title="Ouvir novamente" onClick={() => replayTurn(t.text, 1.0)}>🔊</button>
                <button className="tk-replay-btn" title="Ouvir devagar" onClick={() => replayTurn(t.text, 0.65)}>🐢</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Settings panel ── */}
      {panelOpen && <div className="tk-overlay" onClick={() => setPanelOpen(false)}/>}
      <div className={`tk-panel ${panelOpen ? 'tk-panel-open' : ''}`}>
        <button className="tk-close" onClick={() => setPanelOpen(false)}>✕</button>
        <h2>Configurações</h2>
        <div className="tk-field">
          <label>Nível de inglês</label>
          <select value={level} onChange={e => persistLevel(e.target.value)}>
            <option value="iniciante">Iniciante</option>
            <option value="intermediário">Intermediário</option>
            <option value="avançado">Avançado</option>
          </select>
        </div>
        <div className="tk-field">
          <label>Tema da próxima conversa (opcional)</label>
          <input type="text" value={topic} onChange={e => persistTopic(e.target.value)} placeholder="ex: my weekend, work, football..."/>
        </div>
        <div className="tk-field">
          <label>Voz de resposta</label>
          <select value={voiceName} onChange={e => persistVoice(e.target.value)}>
            <option value="">Automática (melhor disponível)</option>
            {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang}){!v.localService ? ' ★' : ''}</option>)}
          </select>
          <p className="tk-hint">★ = voz premium (recomendada no celular)</p>
        </div>
        <div className="tk-field">
          <label>Memória de conversas</label>
          <div className="tk-membox">{memory || 'Nenhuma conversa anterior ainda.'}</div>
          <button className="tk-reset" onClick={() => { if (confirm('Apagar toda a memória?')) resetMemory(); }}>Apagar memória</button>
        </div>
      </div>

      {/* SVG animations need global scope */}
      <style jsx global>{`
        @keyframes jblink {
          0%, 92%, 100% { transform: scaleY(0); }
          96%            { transform: scaleY(1.1); }
        }
        .jane-lid-L { transform-origin: 76px 78px; animation: jblink 4.2s ease-in-out infinite; }
        .jane-lid-R { transform-origin: 124px 78px; animation: jblink 4.2s ease-in-out 0.08s infinite; }

        @keyframes jmouth  { 0%,100%{transform:scaleY(0.1);}  50%{transform:scaleY(1);} }
        @keyframes jteeth  { 0%,100%{transform:scaleY(0);opacity:0;} 40%,60%{transform:scaleY(1);opacity:1;} }
        @keyframes jlip    { 0%,100%{transform:translateY(0);} 50%{transform:translateY(5px);} }
        @keyframes jbreathe{ 0%,100%{transform:translateY(0);} 50%{transform:translateY(1.5px);} }

        .jane-svg { animation: jbreathe 3.5s ease-in-out infinite; }
        .jane-mouth-bg  { transform-origin: 100px 141px; transform: scaleY(0.1); }
        .jane-teeth     { transform-origin: 100px 137px; transform: scaleY(0); opacity: 0; }
        .jane-lower-lip { transform-origin: 100px 134px; }

        .jane-speaking .jane-mouth-bg  { animation: jmouth 0.28s ease-in-out infinite; }
        .jane-speaking .jane-teeth     { animation: jteeth 0.28s ease-in-out infinite; }
        .jane-speaking .jane-lower-lip { animation: jlip   0.28s ease-in-out infinite; }
      `}</style>

      <style jsx>{`
        .tk-root {
          --tk-bg:#12151A; --tk-panel:#1A1E26; --tk-panel2:#20242E;
          --tk-text:#F1EDE4; --tk-dim:#8B93A1; --tk-line:#2A2F3A;
          --tk-amber:#E8A33D; --tk-violet:#8B7FD1; --tk-teal:#4FBDBA;
          --tk-err:#E8637A; --tk-good:#7CC576;
          background:var(--tk-bg); color:var(--tk-text); font-family:'Inter',sans-serif;
          display:flex; flex-direction:column; height:100vh; overflow:hidden; position:relative;
        }
        .tk-header { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; border-bottom:1px solid var(--tk-line); flex-shrink:0; }
        .tk-brand { display:flex; align-items:baseline; gap:8px; }
        .tk-brand h1 { font-weight:800; font-size:18px; margin:0; }
        .tk-brand span { font-size:11px; color:var(--tk-dim); }
        .tk-header-actions { display:flex; align-items:center; gap:10px; }
        .tk-gear { background:none; border:none; color:var(--tk-dim); font-size:20px; padding:6px 8px; cursor:pointer; border-radius:8px; transition:color .15s; }
        .tk-gear:hover { color:var(--tk-text); }
        .tk-avatar-section { flex-shrink:0; display:flex; flex-direction:column; align-items:center; padding:8px 0 6px; border-bottom:1px solid var(--tk-line); }
        .jane-wrap { width:110px; height:110px; }
        .jane-svg  { width:100%; height:100%; }
        .tk-status-bar { display:flex; align-items:center; gap:6px; margin-top:5px; font-size:12px; color:var(--tk-dim); }
        .tk-dot { width:6px; height:6px; border-radius:50%; background:var(--tk-dim); flex-shrink:0; }
        @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:.35;} }
        .tk-dot-listening { background:var(--tk-amber); box-shadow:0 0 6px var(--tk-amber); animation:pulse 1.2s ease-in-out infinite; }
        .tk-dot-thinking  { background:var(--tk-violet); box-shadow:0 0 6px var(--tk-violet); animation:pulse .8s ease-in-out infinite; }
        .tk-dot-speaking  { background:var(--tk-teal); box-shadow:0 0 6px var(--tk-teal); animation:pulse .55s ease-in-out infinite; }
        .tk-topic { font-size:11px; color:var(--tk-dim); padding-bottom:4px; }
        .tk-topic em { color:var(--tk-amber); font-style:normal; }
        .tk-compat { background:#3a2430; color:#f3b8c4; border-top:1px solid var(--tk-err); padding:7px 14px; font-size:12px; text-align:center; flex-shrink:0; }
        .tk-transcript { flex:1; overflow-y:auto; padding:10px 14px 20px; display:flex; flex-direction:column; gap:12px; }
        .tk-empty { color:var(--tk-dim); text-align:center; margin-top:30px; font-size:13px; padding:0 20px; line-height:1.6; }
        .tk-bubble { display:flex; gap:8px; align-items:flex-start; }
        .tk-bubble-user { flex-direction:row-reverse; }
        .tk-bubble-inner { max-width:82%; padding:10px 13px; font-size:14px; line-height:1.5; border-radius:16px; }
        .tk-bubble-assistant .tk-bubble-inner { background:var(--tk-panel); border-bottom-left-radius:4px; }
        .tk-bubble-user .tk-bubble-inner { background:var(--tk-panel2); border-radius:16px 16px 4px 16px; }
        .tk-label { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:var(--tk-dim); margin-bottom:3px; }
        .tk-correction { margin-top:7px; padding-top:7px; border-top:1px dashed var(--tk-line); font-size:12px; }
        .tk-said   { color:var(--tk-err); text-decoration:line-through; opacity:.9; }
        .tk-arrow  { color:var(--tk-dim); }
        .tk-better { color:var(--tk-good); font-weight:600; }
        .tk-why    { color:var(--tk-dim); font-size:11px; margin-top:2px; }
        .tk-replay { display:flex; flex-direction:column; gap:4px; flex-shrink:0; padding-top:6px; }
        .tk-replay-btn { background:none; border:none; cursor:pointer; font-size:17px; padding:3px 5px; border-radius:6px; opacity:.5; transition:opacity .15s; line-height:1; }
        .tk-replay-btn:hover { opacity:1; background:var(--tk-panel2); }
        .tk-btn { font-weight:700; font-size:13px; border:none; border-radius:10px; padding:8px 16px; cursor:pointer; }
        .tk-btn:disabled { opacity:.5; cursor:default; }
        .tk-btn-start { background:var(--tk-amber); color:#241703; }
        .tk-btn-stop  { background:var(--tk-panel2); color:var(--tk-err); border:1px solid var(--tk-err); }
        .tk-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:10; }
        .tk-panel { position:fixed; right:0; top:0; bottom:0; width:min(340px,88vw); background:var(--tk-panel); transform:translateX(100%); transition:transform .25s ease; z-index:11; padding:20px; overflow-y:auto; }
        .tk-panel-open { transform:translateX(0); }
        .tk-panel h2 { font-size:15px; margin:0 0 16px; }
        .tk-field { margin-bottom:16px; }
        .tk-field label { display:block; font-size:12px; color:var(--tk-dim); margin-bottom:5px; }
        .tk-field input[type=text], .tk-field select { width:100%; background:var(--tk-panel2); border:1px solid var(--tk-line); color:var(--tk-text); border-radius:10px; padding:9px 11px; font-size:13px; }
        .tk-hint { font-size:11px; color:var(--tk-dim); margin-top:4px; }
        .tk-close { position:absolute; top:14px; right:16px; background:none; border:none; color:var(--tk-dim); font-size:20px; cursor:pointer; }
        .tk-membox { background:var(--tk-panel2); border-radius:10px; padding:10px 12px; font-size:12px; color:var(--tk-dim); max-height:110px; overflow-y:auto; line-height:1.5; }
        .tk-reset { background:none; border:1px solid var(--tk-err); color:var(--tk-err); border-radius:10px; padding:7px 12px; font-size:12px; cursor:pointer; margin-top:8px; }
      `}</style>
    </div>
  );
}
