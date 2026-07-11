'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

const LS_VOICE = 'talkie_voice';
type StatusMode = 'idle' | 'listening' | 'thinking' | 'speaking';
interface Correction { said: string; better: string; why?: string; }
interface Turn { role: 'user' | 'assistant'; text: string; corrections?: Correction[]; }
interface ChatResult { corrections?: Correction[]; reply: string; level: string; topic: string; memory: string; error?: string; }
interface SettingsRow { level: string; topic: string; memory: string; error?: string; }
interface Tooltip { word: string; context: string; x: number; y: number; text: string; loading: boolean; }

// Prefer cloud (non-local) voices — much better quality on Android
function pickVoice(voices: SpeechSynthesisVoice[], preferred: string): SpeechSynthesisVoice | undefined {
  if (preferred) { const e = voices.find(v => v.name === preferred); if (e) return e; }
  const cloud = voices.filter(v => !v.localService && v.lang.startsWith('en'));
  if (cloud.length) return cloud[0];
  return voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en'));
}

// ─── Photo Avatar ────────────────────────────────────────────────────────────
function JanePhoto({ mode }: { mode: StatusMode }) {
  return (
    <div className={`jane-wrap jane-${mode}`}>
      <div className="jane-outer-ring"/>
      <div className="jane-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/jane2.jpg" alt="Jane" className="jane-img"/>
        <div className="jane-waves">
          <div className="jane-bar jane-bar-1"/>
          <div className="jane-bar jane-bar-2"/>
          <div className="jane-bar jane-bar-3"/>
          <div className="jane-bar jane-bar-4"/>
          <div className="jane-bar jane-bar-5"/>
        </div>
      </div>
    </div>
  );
}

// ─── Bubble text with per-word hover translation ──────────────────────────────
function BubbleText({
  text,
  onHover,
  onLeave,
}: {
  text: string;
  onHover: (word: string, context: string, x: number, y: number) => void;
  onLeave: () => void;
}) {
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
        const clean = token.replace(/^[^a-zA-Z'']+|[^a-zA-Z'']+$/g, '');
        if (!clean) return <span key={i}>{token}</span>;
        return (
          <span
            key={i}
            className="tk-word"
            onMouseEnter={e => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onHover(clean, text, r.left + r.width / 2, r.top);
            }}
            onMouseLeave={onLeave}
            onClick={e => {
              e.stopPropagation();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onHover(clean, text, r.left + r.width / 2, r.top);
            }}
          >{token}</span>
        );
      })}
    </>
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
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingApiRef = useRef(false);
  const activeRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationCacheRef = useRef(new Map<string, string>());

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
  const resetMemory  = () => { setMemory(''); saveSettings({ memory: '' }); };

  // Translation tooltip with debounce + cache
  const handleWordHover = useCallback((word: string, context: string, x: number, y: number) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (!word) { setTooltip(null); return; }
    const cached = translationCacheRef.current.get(word.toLowerCase());
    if (cached !== undefined) {
      setTooltip({ word, context, x, y, text: cached, loading: false });
      return;
    }
    setTooltip({ word, context, x, y, text: '', loading: true });
    hoverTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch('/api/talkie-translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, context }),
        });
        const data = await resp.json();
        if (data.translation) {
          translationCacheRef.current.set(word.toLowerCase(), data.translation);
          setTooltip(t => t?.word === word ? { ...t, text: data.translation, loading: false } : t);
        }
      } catch {
        setTooltip(t => t?.word === word ? { ...t, text: '—', loading: false } : t);
      }
    }, 450);
  }, []);

  const handleWordLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setTooltip(null);
  }, []);

  // Always fetch the freshest voice list at speak time (fixes Android stale-state issue)
  const speak = useCallback((text: string, rate = 1.0): Promise<void> => {
    return new Promise(resolve => {
      if (!text) { resolve(); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const live = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      const chosen = pickVoice(live.length ? live : voices, voiceName);
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
      setStatusMsg('Microfone não suportado neste navegador (requer HTTPS).');
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

      {/* ── Orb ── */}
      <div className="tk-avatar-section">
        <JanePhoto mode={statusMode} />
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
      <div className="tk-transcript" ref={transcriptRef} onClick={() => setTooltip(null)}>
        {turns.length === 0 && (
          <div className="tk-empty">
            {settingsLoaded ? 'Toque em Iniciar e comece a conversar com Jane em inglês.' : 'Carregando...'}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`tk-bubble tk-bubble-${t.role}`}>
            <div className="tk-bubble-inner">
              <div className="tk-label">{t.role === 'user' ? 'Você' : 'Jane'}</div>
              {t.role === 'assistant'
                ? <div><BubbleText text={t.text} onHover={handleWordHover} onLeave={handleWordLeave}/></div>
                : <div>{t.text}</div>
              }
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

      {/* ── Translation tooltip ── */}
      {tooltip && (
        <div className="tk-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <span className="tk-tooltip-word">{tooltip.word}</span>
          <span className="tk-tooltip-text">{tooltip.loading ? '···' : (tooltip.text || '—')}</span>
        </div>
      )}

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
          <p className="tk-hint">★ = voz premium · No Android, selecione uma voz Google ★ para melhor qualidade</p>
        </div>
        <div className="tk-field">
          <label>Memória de conversas</label>
          <div className="tk-membox">{memory || 'Nenhuma conversa anterior ainda.'}</div>
          <button className="tk-reset" onClick={() => { if (confirm('Apagar toda a memória?')) resetMemory(); }}>Apagar memória</button>
        </div>
      </div>

      {/* Global styles — needed for child components and tooltip */}
      <style jsx global>{`
        /* ── Keyframes ── */
        @keyframes jbreathe   { 0%,100%{transform:scale(1);}    50%{transform:scale(1.018);} }
        @keyframes jbar       { 0%,100%{transform:scaleY(0.12);} 50%{transform:scaleY(1);} }
        @keyframes jpulse-out { 0%{box-shadow:0 0 0 0 rgba(232,163,61,0.65);} 70%{box-shadow:0 0 0 10px rgba(232,163,61,0);} 100%{box-shadow:0 0 0 0 rgba(232,163,61,0);} }
        @keyframes jthink-glow{ 0%,100%{box-shadow:0 0 6px rgba(139,127,209,0.22);} 50%{box-shadow:0 0 24px rgba(139,127,209,0.58);} }
        @keyframes jring-fade { 0%{transform:scale(1);opacity:0.35;} 80%{transform:scale(1.22);opacity:0;} 100%{transform:scale(1.22);opacity:0;} }

        /* ── Base photo frame ── */
        .jane-wrap {
          position:relative;
          width:130px; height:130px;
          display:flex; align-items:center; justify-content:center;
        }
        .jane-outer-ring {
          position:absolute;
          inset:-13px;
          border-radius:50%;
          border:1.5px solid transparent;
          pointer-events:none;
          transition:border-color 0.3s;
        }
        .jane-frame {
          width:130px; height:130px;
          border-radius:50%;
          overflow:hidden;
          position:relative;
          border:3px solid rgba(129,140,248,0.20);
          transition:border-color 0.3s, box-shadow 0.35s;
        }
        .jane-img {
          width:100%; height:100%;
          object-fit:cover;
          object-position:center 15%;
          display:block;
        }

        /* ── Wave bars at bottom of photo ── */
        .jane-waves {
          position:absolute; bottom:0; left:0; right:0; height:42%;
          display:flex; align-items:flex-end; justify-content:center; gap:4px;
          padding-bottom:12px;
          background:linear-gradient(to top, rgba(8,11,18,0.68) 0%, transparent 100%);
          border-radius:0 0 9999px 9999px;
          opacity:0;
          transition:opacity 0.22s ease;
        }
        .jane-bar {
          width:4px; height:18px;
          background:white; border-radius:2px;
          transform-origin:bottom center;
          transform:scaleY(0.12);
        }

        /* ── Idle ── */
        .jane-idle .jane-frame { animation:jbreathe 4s ease-in-out infinite; }

        /* ── Listening ── */
        .jane-listening .jane-frame {
          border-color:#E8A33D;
          animation:jbreathe 4s ease-in-out infinite, jpulse-out 1.3s ease-out infinite;
        }
        .jane-listening .jane-outer-ring {
          border-color:rgba(232,163,61,0.28);
          animation:jring-fade 1.6s ease-out infinite;
        }

        /* ── Speaking ── */
        .jane-speaking .jane-frame {
          border-color:#818cf8;
          box-shadow:0 0 20px rgba(129,140,248,0.55), 0 0 42px rgba(129,140,248,0.22);
          animation:none;
        }
        .jane-speaking .jane-outer-ring { border-color:rgba(129,140,248,0.18); }
        .jane-speaking .jane-waves      { opacity:1; }
        .jane-speaking .jane-bar-1 { animation:jbar 0.60s ease-in-out -0.12s infinite; }
        .jane-speaking .jane-bar-2 { animation:jbar 0.50s ease-in-out -0.26s infinite; }
        .jane-speaking .jane-bar-3 { animation:jbar 0.44s ease-in-out 0s    infinite; }
        .jane-speaking .jane-bar-4 { animation:jbar 0.54s ease-in-out -0.18s infinite; }
        .jane-speaking .jane-bar-5 { animation:jbar 0.48s ease-in-out -0.07s infinite; }

        /* ── Thinking ── */
        .jane-thinking .jane-frame {
          border-color:rgba(139,127,209,0.45);
          animation:jbreathe 1.0s ease-in-out infinite, jthink-glow 1.0s ease-in-out infinite;
        }
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
        .tk-bubble-inner { max-width:82%; padding:10px 13px; font-size:14px; line-height:1.6; border-radius:16px; }
        .tk-bubble-assistant .tk-bubble-inner { background:var(--tk-panel); border-bottom-left-radius:4px; }
        .tk-bubble-user .tk-bubble-inner { background:var(--tk-panel2); border-radius:16px 16px 4px 16px; }
        .tk-label { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:var(--tk-dim); margin-bottom:3px; }
        .tk-word { cursor:pointer; border-radius:3px; padding:0 1px; transition:background 0.12s; }
        .tk-word:hover { background:rgba(129,140,248,0.22); }
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
        .tk-tooltip {
          position:fixed;
          z-index:200;
          pointer-events:none;
          transform:translateX(-50%) translateY(calc(-100% - 10px));
          background:rgba(20,24,34,0.97);
          border:1px solid var(--tk-line);
          border-radius:9px;
          padding:6px 12px;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:2px;
          min-width:80px;
          max-width:220px;
          text-align:center;
          box-shadow:0 4px 18px rgba(0,0,0,0.55);
          backdrop-filter:blur(10px);
        }
        .tk-tooltip-word { font-size:11px; color:var(--tk-dim); }
        .tk-tooltip-text { font-size:13px; color:var(--tk-text); font-weight:500; white-space:nowrap; }
      `}</style>
    </div>
  );
}
