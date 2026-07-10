'use client';
// src/components/TalkieChat.tsx

import { useState, useRef, useEffect, useCallback } from 'react';

const LS_VOICE = 'talkie_voice'; // só a preferência de voz continua local (é por aparelho, não por conta)

type StatusMode = 'idle' | 'listening' | 'thinking' | 'speaking';

interface Correction {
  said: string;
  better: string;
  why?: string;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  corrections?: Correction[];
}

interface ChatResult {
  corrections?: Correction[];
  reply: string;
  level: string;
  topic: string;
  memory: string;
  error?: string;
}

interface SettingsRow {
  level: string;
  topic: string;
  memory: string;
  error?: string;
}

function escapeHtml(s: string): string {
  return (s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string));
}

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

  // ---------- Load settings from Supabase (server) + voice pref from localStorage ----------
  useEffect(() => {
    setVoiceName(localStorage.getItem(LS_VOICE) || '');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setRecognitionSupported(!!SR);

    const loadVoices = () => {
      const v = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
      setVoices(v);
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;

    (async () => {
      try {
        const resp = await fetch('/api/talkie-settings');
        const data: SettingsRow = await resp.json();
        if (!resp.ok || data.error) {
          setAuthError(true);
          return;
        }
        setLevel(data.level);
        setTopic(data.topic);
        setMemory(data.memory);
      } catch {
        setAuthError(true);
      } finally {
        setSettingsLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [turns]);

  const persistVoice = (v: string) => { setVoiceName(v); localStorage.setItem(LS_VOICE, v); };

  const saveSettings = useCallback(async (patch: { level?: string; topic?: string; memory?: string }) => {
    try {
      const resp = await fetch('/api/talkie-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data: SettingsRow = await resp.json();
      if (resp.ok && !data.error) {
        setLevel(data.level);
        setTopic(data.topic);
        setMemory(data.memory);
      }
    } catch {
      // silencioso: a próxima ação ainda funciona com o estado local atual
    }
  }, []);

  const persistLevel = (v: string) => { setLevel(v); saveSettings({ level: v }); };
  const persistTopicInput = (v: string) => { setTopic(v); saveSettings({ topic: v }); };
  const resetMemory = () => { setMemory(''); saveSettings({ memory: '' }); };

  // ---------- Backend call (auth via cookies, memória fica no Supabase) ----------
  const callBackend = useCallback(async (userText: string): Promise<ChatResult | null> => {
    setStatusMode('thinking');
    setStatusMsg('Pensando...');
    try {
      const resp = await fetch('/api/talkie-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });
      const data: ChatResult = await resp.json();
      if (!resp.ok || data.error) {
        setStatusMode('idle');
        setStatusMsg('Erro: ' + (data.error || resp.status));
        return null;
      }
      return data;
    } catch (err) {
      setStatusMode('idle');
      setStatusMsg('Erro de conexão: ' + (err instanceof Error ? err.message : 'desconhecido'));
      return null;
    }
  }, []);

  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!text) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      const list = speechSynthesis.getVoices();
      const chosen = list.find((v) => v.name === voiceName) || list.find((v) => v.lang === 'en-US') || list.find((v) => v.lang.startsWith('en'));
      if (chosen) u.voice = chosen;
      u.rate = 1.0;
      setStatusMode('speaking');
      setStatusMsg('Falando...');
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }, [voiceName]);

  const restartListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setStatusMode('listening');
      setStatusMsg('Ouvindo...');
    } catch {
      // already started
    }
  }, []);

  const handleUserSpeech = useCallback(async (text: string) => {
    awaitingApiRef.current = true;
    const result = await callBackend(text);
    awaitingApiRef.current = false;

    if (!result) {
      if (activeRef.current) restartListening();
      return;
    }

    setTurns((prev) => [...prev, { role: 'user', text, corrections: result.corrections || [] }]);
    setTopic(result.topic);
    setMemory(result.memory);

    setTurns((prev) => [...prev, { role: 'assistant', text: result.reply }]);
    await speak(result.reply);

    if (activeRef.current) restartListening();
  }, [callBackend, speak, restartListening]);

  const initRecognition = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      if (finalText.trim()) {
        recognition.stop();
        handleUserSpeech(finalText.trim());
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      console.warn('recognition error', e.error);
    };
    recognition.onend = () => {
      if (activeRef.current && !awaitingApiRef.current) {
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          try { recognition.start(); setStatusMode('listening'); setStatusMsg('Ouvindo...'); } catch {}
        }, 300);
      }
    };

    recognitionRef.current = recognition;
  }, [handleUserSpeech]);

  const startSession = useCallback(async () => {
    setActive(true);
    activeRef.current = true;
    initRecognition();

    awaitingApiRef.current = true;
    const result = await callBackend(
      '[SESSION START] Greet me warmly and naturally in English to kick off our chat. If we have talked before, pick up from where we left off using the memory; otherwise suggest a light, friendly topic.'
    );
    awaitingApiRef.current = false;

    if (result) {
      setTopic(result.topic);
      setMemory(result.memory);
      setTurns((prev) => [...prev, { role: 'assistant', text: result.reply }]);
      await speak(result.reply);
    }
    if (activeRef.current) restartListening();
  }, [initRecognition, callBackend, speak, restartListening]);

  const stopSession = useCallback(() => {
    setActive(false);
    activeRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
    speechSynthesis.cancel();
    setStatusMode('idle');
    setStatusMsg('Toque em Iniciar pra começar');
  }, []);

  if (authError) {
    return (
      <div className="tk-root tk-auth-error">
        <p>Não foi possível carregar suas configurações do Talkie — parece que você não está logado. Entre na conta da família e recarregue esta página.</p>
      </div>
    );
  }

  return (
    <div className="tk-root">
      <header className="tk-header">
        <div className="tk-brand"><h1>Talkie</h1><span>English on the go</span></div>
        <button className="tk-gear" onClick={() => setPanelOpen(true)} aria-label="Configurações">⚙</button>
      </header>

      {!recognitionSupported && (
        <div className="tk-compat-warning">
          Este navegador não tem suporte a reconhecimento de fala contínuo (comum no Safari/iPhone). Use Chrome no Android pra melhor experiência.
        </div>
      )}

      <div className="tk-stage">
        <div className="tk-orb-wrap">
          <div className={`tk-orb-ring ${statusMode === 'listening' ? 'tk-ring-listening' : statusMode === 'speaking' ? 'tk-ring-speaking' : ''}`} />
          <div className={`tk-orb tk-${statusMode}`} />
        </div>
        <div className="tk-status">{statusMsg}</div>
        {topic && <div className="tk-topic">Tema: {topic}</div>}
        <div className="tk-controls">
          {!active
            ? <button className="tk-btn tk-btn-start" onClick={startSession} disabled={!settingsLoaded}>▶ Iniciar</button>
            : <button className="tk-btn tk-btn-stop" onClick={stopSession}>■ Parar</button>}
        </div>
      </div>

      <div className="tk-transcript" ref={transcriptRef}>
        {turns.length === 0 && <div className="tk-empty">Sua conversa vai aparecer aqui.</div>}
        {turns.map((t, i) => (
          <div key={i} className={`tk-bubble tk-bubble-${t.role}`}>
            <div className="tk-label">{t.role === 'user' ? 'Você' : 'Talkie'}</div>
            <div dangerouslySetInnerHTML={{ __html: escapeHtml(t.text) }} />
            {t.role === 'user' && t.corrections && t.corrections.map((c, j) => (
              <div className="tk-correction" key={j}>
                <div className="tk-said">{c.said}</div>
                <div className="tk-better">→ {c.better}</div>
                {c.why && <div className="tk-why">{c.why}</div>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {panelOpen && <div className="tk-overlay" onClick={() => setPanelOpen(false)} />}
      <div className={`tk-panel ${panelOpen ? 'tk-panel-open' : ''}`}>
        <button className="tk-close" onClick={() => setPanelOpen(false)}>✕</button>
        <h2>Configurações</h2>

        <div className="tk-field">
          <label>Nível de inglês</label>
          <select value={level} onChange={(e) => persistLevel(e.target.value)}>
            <option value="iniciante">Iniciante</option>
            <option value="intermediário">Intermediário</option>
            <option value="avançado">Avançado</option>
          </select>
        </div>

        <div className="tk-field">
          <label>Tema da próxima conversa (opcional)</label>
          <input type="text" value={topic} onChange={(e) => persistTopicInput(e.target.value)} placeholder="ex: my weekend, work, football..." />
        </div>

        <div className="tk-field">
          <label>Voz de resposta</label>
          <select value={voiceName} onChange={(e) => persistVoice(e.target.value)}>
            {voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
          </select>
        </div>

        <div className="tk-field">
          <label>O que o app lembra até agora</label>
          <div className="tk-membox">{memory || 'Nenhuma conversa anterior ainda.'}</div>
          <button className="tk-reset" onClick={() => {
            if (confirm('Apagar toda a memória de conversas anteriores?')) resetMemory();
          }}>Apagar memória</button>
        </div>
      </div>

      <style jsx>{`
        .tk-root{ --tk-bg:#12151A; --tk-panel:#1A1E26; --tk-panel2:#20242E; --tk-text:#F1EDE4; --tk-dim:#8B93A1;
          --tk-line:#2A2F3A; --tk-amber:#E8A33D; --tk-violet:#8B7FD1; --tk-teal:#4FBDBA; --tk-err:#E8637A; --tk-good:#7CC576;
          background:var(--tk-bg); color:var(--tk-text); font-family:'Inter',sans-serif; display:flex; flex-direction:column;
          height:100vh; overflow:hidden; position:relative; border-radius:12px;
        }
        .tk-auth-error{ align-items:center; justify-content:center; padding:40px; text-align:center; color:var(--tk-dim); }
        .tk-header{ display:flex; align-items:center; justify-content:space-between; padding:16px 20px 10px; flex-shrink:0; }
        .tk-brand{ display:flex; align-items:baseline; gap:8px; }
        .tk-brand h1{ font-weight:800; font-size:20px; margin:0; }
        .tk-brand span{ font-size:12px; color:var(--tk-dim); }
        .tk-gear{ background:none; border:none; color:var(--tk-dim); font-size:22px; padding:6px 10px; cursor:pointer; border-radius:10px; }
        .tk-compat-warning{ background:#3a2430; color:#f3b8c4; border:1px solid var(--tk-err); border-radius:12px; padding:12px 14px; font-size:13px; margin:0 16px 10px; line-height:1.5; }
        .tk-stage{ flex-shrink:0; display:flex; flex-direction:column; align-items:center; padding:14px 0 8px; }
        .tk-orb-wrap{ position:relative; width:150px; height:150px; display:flex; align-items:center; justify-content:center; }
        .tk-orb-ring{ position:absolute; inset:0; border-radius:50%; border:2px solid var(--tk-line); }
        .tk-orb{ width:96px; height:96px; border-radius:50%; background:radial-gradient(circle at 35% 30%, #3a3f4a, #12151A 70%); transition:box-shadow .4s, background .4s; position:relative; z-index:2; }
        .tk-orb.tk-listening{ background:radial-gradient(circle at 35% 30%, var(--tk-amber), #7a5a1e 75%); box-shadow:0 0 30px 6px rgba(232,163,61,0.45); animation:tk-pulse 1.6s ease-in-out infinite; }
        .tk-orb.tk-thinking{ background:radial-gradient(circle at 35% 30%, var(--tk-violet), #4b3f8a 75%); box-shadow:0 0 30px 6px rgba(139,127,209,0.45); animation:tk-spin 1.1s linear infinite; }
        .tk-orb.tk-speaking{ background:radial-gradient(circle at 35% 30%, var(--tk-teal), #1f6b69 75%); box-shadow:0 0 34px 8px rgba(79,189,186,0.5); animation:tk-pulse .8s ease-in-out infinite; }
        @keyframes tk-pulse{ 0%,100%{transform:scale(1);} 50%{transform:scale(1.08);} }
        @keyframes tk-spin{ from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
        .tk-ring-listening{ animation:tk-ringpulse 1.6s ease-in-out infinite; }
        .tk-ring-speaking{ animation:tk-ringpulse .8s ease-in-out infinite; }
        @keyframes tk-ringpulse{ 0%,100%{transform:scale(1); opacity:.5;} 50%{transform:scale(1.18); opacity:0;} }
        .tk-status{ margin-top:14px; font-weight:600; font-size:15px; color:var(--tk-dim); }
        .tk-topic{ font-size:12px; color:var(--tk-dim); margin-top:2px; max-width:80vw; text-align:center; }
        .tk-controls{ display:flex; gap:12px; margin-top:16px; }
        .tk-btn{ font-weight:700; font-size:15px; border:none; border-radius:14px; padding:13px 26px; cursor:pointer; }
        .tk-btn:disabled{ opacity:.5; cursor:default; }
        .tk-btn-start{ background:var(--tk-amber); color:#241703; }
        .tk-btn-stop{ background:var(--tk-panel2); color:var(--tk-err); border:1px solid var(--tk-err); }
        .tk-transcript{ flex:1; overflow-y:auto; padding:10px 16px 100px; display:flex; flex-direction:column; gap:14px; }
        .tk-bubble{ max-width:88%; padding:12px 14px; border-radius:16px; font-size:15px; line-height:1.45; }
        .tk-bubble-assistant{ background:var(--tk-panel); align-self:flex-start; border-bottom-left-radius:4px; }
        .tk-bubble-user{ background:var(--tk-panel2); align-self:flex-end; border-bottom-right-radius:4px; }
        .tk-label{ font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:var(--tk-dim); margin-bottom:4px; }
        .tk-correction{ margin-top:8px; padding-top:8px; border-top:1px dashed var(--tk-line); font-size:13px; }
        .tk-said{ color:var(--tk-err); text-decoration:line-through; opacity:.9; }
        .tk-better{ color:var(--tk-good); font-weight:600; }
        .tk-why{ color:var(--tk-dim); font-size:12px; margin-top:2px; }
        .tk-empty{ color:var(--tk-dim); text-align:center; margin-top:40px; font-size:14px; padding:0 30px; }
        .tk-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:10; }
        .tk-panel{ position:fixed; right:0; top:0; bottom:0; width:min(340px,86vw); background:var(--tk-panel);
          transform:translateX(100%); transition:transform .25s ease; z-index:11; padding:20px; overflow-y:auto; }
        .tk-panel-open{ transform:translateX(0); }
        .tk-panel h2{ font-size:16px; margin:0 0 16px; }
        .tk-field{ margin-bottom:16px; }
        .tk-field label{ display:block; font-size:12px; color:var(--tk-dim); margin-bottom:6px; }
        .tk-field input[type=text], .tk-field select{ width:100%; background:var(--tk-panel2); border:1px solid var(--tk-line);
          color:var(--tk-text); border-radius:10px; padding:10px 12px; font-size:14px; }
        .tk-close{ position:absolute; top:16px; right:18px; background:none; border:none; color:var(--tk-dim); font-size:20px; cursor:pointer; }
        .tk-membox{ background:var(--tk-panel2); border-radius:10px; padding:10px 12px; font-size:12px; color:var(--tk-dim); max-height:120px; overflow-y:auto; line-height:1.5; }
        .tk-reset{ background:none; border:1px solid var(--tk-err); color:var(--tk-err); border-radius:10px; padding:8px 12px; font-size:12px; cursor:pointer; margin-top:8px; }
      `}</style>
    </div>
  );
}
