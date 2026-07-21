'use client';

import { useState, useRef, useEffect, useCallback, type PointerEvent } from 'react';
import Link from 'next/link';

const LS_VOICE = 'talkie_voice';
type StatusMode = 'idle' | 'listening' | 'thinking' | 'speaking';
type Lang = 'en' | 'pt';
interface Correction { said: string; better: string; why?: string; pronunciation?: string; }
interface Turn { role: 'user' | 'assistant'; text: string; corrections?: Correction[]; native_said?: string; lang?: Lang; }
interface ChatResult { native_said?: string; corrections?: Correction[]; reply: string; level: string; topic: string; memory: string; language?: Lang; error?: string; }
interface SettingsRow { level: string; topic: string; memory: string; city: string; family_context: string; error?: string; }
interface Tooltip { word: string; context: string; x: number; y: number; text: string; loading: boolean; }

const LANG_TAG: Record<Lang, string> = { en: 'en-US', pt: 'pt-BR' };

// Known high-quality Google TTS voice names (Android Chrome), per language
const GOOGLE_VOICE_NAMES: Record<Lang, string[]> = {
  en: ['Google US English', 'Google UK English Female', 'Google UK English Male'],
  pt: ['Google português do Brasil'],
};

function pickVoice(voices: SpeechSynthesisVoice[], preferred: string, lang: Lang): SpeechSynthesisVoice | undefined {
  if (preferred) { const e = voices.find(v => v.name === preferred); if (e) return e; }
  // Try known Google TTS names first (most reliable on Android)
  for (const name of GOOGLE_VOICE_NAMES[lang]) {
    const v = voices.find(v => v.name === name); if (v) return v;
  }
  // Fall back to any cloud voice
  const langPrefix = lang === 'pt' ? 'pt' : 'en';
  const cloud = voices.filter(v => !v.localService && v.lang.startsWith(langPrefix));
  if (cloud.length) return cloud[0];
  return voices.find(v => v.lang === LANG_TAG[lang]) || voices.find(v => v.lang.startsWith(langPrefix));
}

// Waits for voices to load if list is empty (common on Android first call)
function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  const v = speechSynthesis.getVoices();
  if (v.length) return Promise.resolve(v);
  return new Promise(resolve => {
    const handler = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
    setTimeout(() => resolve(speechSynthesis.getVoices()), 3000);
  });
}

// ─── Photo Avatar ────────────────────────────────────────────────────────────
function JanePhoto({ mode }: { mode: StatusMode }) {
  return (
    <div className={`jane-wrap jane-${mode}`}>
      <div className="jane-outer-ring"/>
      <div className="jane-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/jane4.jpg" alt="Jane" className="jane-img"/>
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
  const [city, setCity] = useState('');
  const [familyContext, setFamilyContext] = useState('');
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
  const [noCloudVoice, setNoCloudVoice] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [language, setLanguageState] = useState<Lang>('en');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef('');
  // Android Chrome produces cumulative results: results[0]="the", results[1]="the communication", ...
  // We track the current growing segment and only replace (not append) while it grows.
  // When a genuinely new phrase starts (doesn't begin with current segment), we save the old one.
  const curSegmentRef = useRef('');   // current growing segment (replaced in-place)
  const baseAccumRef = useRef('');    // completed segments from earlier in this turn
  const awaitingApiRef = useRef(false);
  const activeRef = useRef(false);
  const listeningRef = useRef(false); // true while user's mic is on for a Falar turn
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // pending mic-restart retry after Android auto-stops it
  const languageRef = useRef<Lang>('en'); // conversation language — switches on voice request, e.g. "let's talk in Portuguese"
  const setLanguage = useCallback((l: Lang) => { languageRef.current = l; setLanguageState(l); }, []);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationCacheRef = useRef(new Map<string, string>());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeLockRef = useRef<any>(null);

  // Keep the screen on for the whole session — released automatically by the
  // browser whenever the tab loses visibility, so we re-acquire it on return.
  const acquireWakeLock = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.wakeLock) return;
    try {
      wakeLockRef.current = await nav.wakeLock.request('screen');
    } catch {
      wakeLockRef.current = null;
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      try { wakeLockRef.current.release(); } catch {}
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeRef.current) acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      releaseWakeLock();
    };
  }, [acquireWakeLock, releaseWakeLock]);

  useEffect(() => {
    setVoiceName(localStorage.getItem(LS_VOICE) || '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setRecognitionSupported(!!SR);
    const loadVoices = () => {
      const all = speechSynthesis.getVoices();
      const en = all.filter(v => v.lang.startsWith('en'));
      if (en.length) {
        setVoices(en);
        const hasCloud = en.some(v => !v.localService) ||
          GOOGLE_VOICE_NAMES.en.some(n => all.find(v => v.name === n));
        setNoCloudVoice(!hasCloud);
      }
    };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
    (async () => {
      try {
        const resp = await fetch('/api/talkie-settings');
        const data: SettingsRow = await resp.json();
        if (!resp.ok || data.error) { setAuthError(true); return; }
        setLevel(data.level); setTopic(data.topic); setMemory(data.memory);
        setCity(data.city || ''); setFamilyContext(data.family_context || '');
      } catch { setAuthError(true); }
      finally { setSettingsLoaded(true); }
    })();
  }, []);

  useEffect(() => {
    if (transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [turns]);

  const persistVoice = (v: string) => { setVoiceName(v); localStorage.setItem(LS_VOICE, v); };

  const saveSettings = useCallback(async (patch: { level?: string; topic?: string; memory?: string; city?: string; family_context?: string }) => {
    try {
      const r = await fetch('/api/talkie-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const d: SettingsRow = await r.json();
      if (r.ok && !d.error) {
        setLevel(d.level); setTopic(d.topic); setMemory(d.memory);
        setCity(d.city || ''); setFamilyContext(d.family_context || '');
      }
    } catch {}
  }, []);

  const persistLevel = (v: string) => { setLevel(v); saveSettings({ level: v }); };
  const persistTopic = (v: string) => { setTopic(v); saveSettings({ topic: v }); };
  const persistCity = (v: string) => { setCity(v); saveSettings({ city: v }); };
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

  // Wait for voices to load (Android can take a moment), then pick best available for the given language
  const speak = useCallback((text: string, rate = 1.0, lang: Lang = languageRef.current): Promise<void> => {
    return new Promise(resolve => {
      if (!text) { resolve(); return; }
      speechSynthesis.cancel();
      // Some Android WebViews never fire onend/onerror on long utterances, which would
      // otherwise leave the app stuck on "speaking" forever and hide the talk button.
      const timeoutMs = Math.max(6000, text.split(/\s+/).length * 450 / rate);
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(fallback); resolve(); } };
      const fallback = setTimeout(finish, timeoutMs);
      waitForVoices().then(allVoices => {
        const langPrefix = lang === 'pt' ? 'pt' : 'en';
        const matched = allVoices.filter(v => v.lang.startsWith(langPrefix));
        const pool = matched.length ? matched : (lang === 'en' ? voices : matched);
        const u = new SpeechSynthesisUtterance(text);
        u.lang = LANG_TAG[lang]; // force correct pronunciation regardless of device language
        const chosen = pickVoice(pool, voiceName, lang);
        if (chosen) u.voice = chosen;
        u.rate = rate; u.pitch = 1.05;
        setStatusMode('speaking');
        setStatusMsg(rate < 1 ? 'Reproduzindo devagar...' : 'Jane está falando...');
        u.onend = finish;
        u.onerror = finish;
        speechSynthesis.speak(u);
      });
    });
  }, [voices, voiceName]);

  const replayTurn = useCallback(async (text: string, rate = 1.0, lang: Lang = 'en') => {
    await speak(text, rate, lang);
    if (activeRef.current) { setStatusMode('idle'); setStatusMsg('Toque em Falar para responder'); }
    else { setStatusMode('idle'); setStatusMsg('Toque em Iniciar pra começar'); }
  }, [speak]);

  // Stable ref to handleUserSpeech — lets recognition handlers call it without stale-closure issues
  const handleUserSpeechRef = useRef<(text: string) => void>(() => {});

  // Activate mic while the push-to-talk button is held down
  const startListening = useCallback(() => {
    if (!recognitionRef.current || awaitingApiRef.current || listeningRef.current) return;
    accumulatedRef.current = '';
    baseAccumRef.current = '';
    curSegmentRef.current = '';
    listeningRef.current = true;
    recognitionRef.current.lang = LANG_TAG[languageRef.current];
    try {
      recognitionRef.current.start();
      setStatusMode('listening'); setStatusMsg('Ouvindo... solte para enviar');
    } catch {
      listeningRef.current = false;
    }
  }, []);

  // Button released — stop listening and only now interpret what was said
  const stopListening = useCallback(() => {
    if (!listeningRef.current) return;
    listeningRef.current = false;
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    const text = accumulatedRef.current.trim();
    accumulatedRef.current = '';
    baseAccumRef.current = '';
    curSegmentRef.current = '';
    try { recognitionRef.current?.stop(); } catch {}
    if (text) {
      awaitingApiRef.current = true;
      handleUserSpeechRef.current(text);
    } else {
      setStatusMode('idle'); setStatusMsg('Segure o botão para falar');
    }
  }, []);

  const handleUserSpeech = useCallback(async (text: string) => {
    // awaitingApiRef.current = true is set by the caller before invoking this
    setStatusMode('thinking'); setStatusMsg('Entendido. Analisando...');
    try {
      const resp = await fetch('/api/talkie-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, language: languageRef.current }) });
      const data: ChatResult = await resp.json();
      if (!resp.ok || data.error) {
        setStatusMode('idle'); setStatusMsg('Erro: ' + (data.error || resp.status));
        awaitingApiRef.current = false;
        return;
      }

      // Apply the (possibly switched) conversation language before speaking this turn,
      // so a "let's talk in Portuguese" request takes effect on Jane's very own reply.
      setLanguage(data.language === 'pt' ? 'pt' : 'en');

      // 1. Show user's full transcription with corrections and native phrasing
      setTurns(p => [...p, { role: 'user', text, corrections: data.corrections || [], native_said: data.native_said, lang: languageRef.current }]);
      setTopic(data.topic); setMemory(data.memory);

      // 2. Speak the native phrasing (how a native speaker would say it) — English mode only
      if (data.native_said?.trim()) {
        setStatusMsg('Como um nativo diria: "' + data.native_said + '"');
        await speak(data.native_said, 0.85, 'en');
        await new Promise(r => setTimeout(r, 500));
      }

      // 3. Speak pronunciation drills for specific problem words — English mode only
      const pronunciations = (data.corrections || []).filter(c => c.pronunciation?.trim());
      for (const c of pronunciations) {
        setStatusMsg('Pronúncia: "' + c.pronunciation + '"');
        await speak(c.pronunciation!, 0.72, 'en');
        await new Promise(r => setTimeout(r, 600));
      }

      // 4. Speak and show Jane's conversational reply
      setTurns(p => [...p, { role: 'assistant', text: data.reply, lang: languageRef.current }]);
      await speak(data.reply, 1.0, languageRef.current);
      awaitingApiRef.current = false;
      // Show "Falar" button — user decides when to speak next (no auto-restart = no beeping)
      setStatusMode('idle');
      setStatusMsg(activeRef.current ? 'Toque em Falar para responder' : 'Toque em Iniciar pra começar');
    } catch {
      setStatusMode('idle'); setStatusMsg('Erro de conexão');
      awaitingApiRef.current = false;
    }
  }, [speak, setLanguage]);

  // Keep the ref in sync so recognition handlers always call the latest version
  useEffect(() => { handleUserSpeechRef.current = handleUserSpeech; }, [handleUserSpeech]);

  const initRecognition = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR();
    // Push-to-talk: mic only activates on user tap — no auto-restart loop, no beeping.
    // continuous=true: keeps listening across natural intra-sentence pauses.
    // interimResults=true: live status-bar feedback while speaking.
    rec.lang = LANG_TAG[languageRef.current]; rec.continuous = true; rec.interimResults = true;

    const clearSegments = () => {
      accumulatedRef.current = '';
      baseAccumRef.current = '';
      curSegmentRef.current = '';
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      // Android Chrome produces cumulative results at growing indices:
      //   results[0]=”the”, results[1]=”the communication”, results[2]=”the communication is not working”
      // Each new result at the latest index contains the FULL accumulated text for that segment.
      // Strategy: find the latest final result; if it starts with (extends) curSegment → replace.
      //           If it's a genuinely new phrase → commit curSegment to base, start fresh segment.
      let latestFinalT = '';
      let interimT = '';
      for (let i = e.results.length - 1; i >= 0; i--) {
        if (e.results[i].isFinal && !latestFinalT) {
          latestFinalT = e.results[i][0].transcript.trim();
        } else if (!e.results[i].isFinal && !interimT) {
          interimT = e.results[i][0].transcript;
        }
        if (latestFinalT && interimT) break;
      }

      if (latestFinalT) {
        const cur = curSegmentRef.current;
        // “Cumulative” if new transcript begins with the first word(s) of current segment
        const firstWords = cur.split(' ').slice(0, 3).join(' ').toLowerCase();
        const isCumulative = cur === '' || latestFinalT.toLowerCase().startsWith(firstWords);

        if (isCumulative) {
          curSegmentRef.current = latestFinalT; // extend current segment in-place
        } else {
          // New independent phrase — save the old segment and start fresh
          baseAccumRef.current = (baseAccumRef.current + ' ' + cur).trim();
          curSegmentRef.current = latestFinalT;
        }
        accumulatedRef.current = (baseAccumRef.current + ' ' + curSegmentRef.current).trim();
      }

      // Show live transcript in status bar — button hold is what decides when to stop, not silence
      const display = (accumulatedRef.current + (interimT ? ' ' + interimT : '')).trim();
      if (display) setStatusMsg('”' + (display.length > 80 ? display.slice(0, 80) + '…' : display) + '”');
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => { if (e.error !== 'no-speech' && e.error !== 'aborted') console.warn('rec error', e.error); };

    // Android auto-stops the recognition engine on its own after a silence timeout or
    // internal limit, even with continuous=true — this is NOT the user releasing the
    // button. Calling start() synchronously from onend throws InvalidStateError on many
    // Android/Chrome builds (the engine hasn't finished tearing down yet), so we back off
    // briefly and retry. The learner is practicing English: slow, hesitant, full of pauses
    // and restarts is completely normal — the turn must NEVER be cut short or auto-sent for
    // any reason while the button is held. Retry for as long as it takes; the only thing
    // that may ever finalize and send is the user releasing the button (stopListening).
    const attemptRestart = (attempt = 0) => {
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!listeningRef.current || awaitingApiRef.current) return; // button released meanwhile
        try {
          recognitionRef.current?.start();
        } catch {
          attemptRestart(attempt + 1); // keep retrying indefinitely — never give up and auto-send
        }
      }, Math.min(200 + attempt * 150, 2000));
    };

    rec.onend = () => {
      // If the button is still held, restart silently and keep accumulating;
      // only pointerup (stopListening) may finalize & send.
      if (listeningRef.current && !awaitingApiRef.current) {
        attemptRestart();
        return;
      }
      listeningRef.current = false;
      // Button held was released (or nothing to fall back to) — resting state.
      if (activeRef.current && !awaitingApiRef.current) {
        setStatusMode('idle');
        setStatusMsg('Segure o botão para falar');
      }
    };

    recognitionRef.current = rec;
  }, []); // all values via refs — no stale closure

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
    setLanguage('en'); // every new session starts in English, regardless of how the last one ended
    acquireWakeLock();
    initRecognition();
    awaitingApiRef.current = true;
    setStatusMode('thinking'); setStatusMsg('Iniciando...');
    try {
      const resp = await fetch('/api/talkie-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '[SESSION START] Greet me warmly and naturally in English — just a short, friendly hello to kick things off. Do not bring up or suggest any topic; let me decide what to talk about.',
          greeting: true,
          language: 'en',
        }) });
      const data: ChatResult = await resp.json();
      if (data && !data.error) {
        setTopic(data.topic); setMemory(data.memory);
        setTurns(p => [...p, { role: 'assistant', text: data.reply, lang: 'en' }]);
        awaitingApiRef.current = false;
        await speak(data.reply, 1.0, 'en');
      } else { awaitingApiRef.current = false; }
    } catch { awaitingApiRef.current = false; }
    // After the greeting, wait for the user to press-and-hold the talk button
    if (activeRef.current) { setStatusMode('idle'); setStatusMsg('Segure o botão para falar'); }
  }, [initRecognition, speak, acquireWakeLock, setLanguage]);

  const stopSession = useCallback(() => {
    setActive(false); activeRef.current = false;
    listeningRef.current = false;
    if (restartTimerRef.current) { clearTimeout(restartTimerRef.current); restartTimerRef.current = null; }
    releaseWakeLock();
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} }
    accumulatedRef.current = '';
    baseAccumRef.current = '';
    curSegmentRef.current = '';
    awaitingApiRef.current = false;
    speechSynthesis.cancel();
    setLanguage('en');
    setStatusMode('idle'); setStatusMsg('Toque em Iniciar pra começar');
  }, [releaseWakeLock, setLanguage]);

  // Push-to-talk: pointer capture keeps pointerup routed to this button even if the
  // finger/mouse drifts off it while held — release always stops listening reliably.
  const handlePressStart = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    if (awaitingApiRef.current) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    startListening();
  }, [startListening]);

  const handlePressEnd = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    stopListening();
  }, [stopListening]);

  if (authError) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', padding:'40px', textAlign:'center', fontFamily:'Inter,sans-serif', color:'#8B93A1' }}>
      <p>Não foi possível carregar suas configurações — você não está logado. Entre na conta e recarregue a página.</p>
    </div>
  );

  return (
    <div className="tk-root">

      {/* ── Header ── */}
      <header className="tk-header">
        <div className="tk-header-left">
          <Link href="/" className="tk-home-btn" title="Início">←</Link>
          <div className="tk-brand"><h1>Talkie</h1><span>English on the go</span></div>
        </div>
        <div className="tk-header-actions">
          {!active
            ? <button className="tk-btn tk-btn-start" onClick={startSession} disabled={!settingsLoaded || !recognitionSupported}>▶ Iniciar</button>
            : <button className="tk-btn tk-btn-stop" onClick={stopSession}>■ Parar</button>}
          <button className="tk-gear" onClick={() => setPanelOpen(true)} aria-label="Configurações">⚙</button>
        </div>
      </header>

      {/* ── Avatar + push-to-talk ── */}
      <div className="tk-avatar-section">
        <JanePhoto mode={statusMode} />
        <div className="tk-status-bar">
          <span className={`tk-dot tk-dot-${statusMode}`}/>
          <span className="tk-status-text">{statusMsg}</span>
        </div>
        {topic && <div className="tk-topic">Topic: <em>{topic}</em></div>}
        {active && language === 'pt' && <div className="tk-topic">Idioma: <em>Português</em></div>}
        {active && (
          <button
            className={`tk-speak-btn ${statusMode === 'listening' ? 'tk-speak-active' : ''} ${statusMode === 'thinking' || statusMode === 'speaking' ? 'tk-speak-disabled' : ''}`}
            disabled={statusMode === 'thinking' || statusMode === 'speaking'}
            onPointerDown={handlePressStart}
            onPointerUp={handlePressEnd}
            onPointerCancel={handlePressEnd}
            onContextMenu={e => e.preventDefault()}
          >
            {statusMode === 'listening' ? '🎤 Ouvindo... solte para enviar'
              : statusMode === 'thinking' ? '🎤 Aguarde, Jane está pensando...'
              : statusMode === 'speaking' ? '🎤 Aguarde, Jane está falando...'
              : '🎤 Segure para falar'}
          </button>
        )}
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
              {t.role === 'user' && t.native_said && (
                <div className="tk-native">
                  <div className="tk-native-label">Como um nativo diria</div>
                  {t.native_said}
                </div>
              )}
              {t.role === 'user' && t.corrections?.map((c, j) => (
                <div className="tk-correction" key={j}>
                  <span className="tk-said">{c.said}</span>
                  <span className="tk-arrow"> → </span>
                  <span className="tk-better">{c.better}</span>
                  {c.why && <div className="tk-why">{c.why}</div>}
                  {c.pronunciation && (
                    <div className="tk-pronunciation">🎤 <em>{c.pronunciation}</em></div>
                  )}
                </div>
              ))}
            </div>
            {t.role === 'assistant' && (
              <div className="tk-replay">
                <button className="tk-replay-btn" title="Ouvir novamente" onClick={() => replayTurn(t.text, 1.0, t.lang || 'en')}>🔊</button>
                <button className="tk-replay-btn" title="Ouvir devagar" onClick={() => replayTurn(t.text, 0.65, t.lang || 'en')}>🐢</button>
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
          <label>Minha cidade (para previsão do tempo)</label>
          <input type="text" value={city} onChange={e => persistCity(e.target.value)} placeholder="ex: Curitiba"/>
        </div>
        <div className="tk-field">
          <label>Contexto familiar (esposa, filhos, etc.)</label>
          <textarea
            value={familyContext}
            onChange={e => setFamilyContext(e.target.value)}
            onBlur={e => saveSettings({ family_context: e.target.value })}
            placeholder="ex: esposa Ana, filhos Miguel (8) e Sofia (5)"
            rows={3}
          />
        </div>
        <div className="tk-field">
          <label>Voz de resposta</label>
          <select value={voiceName} onChange={e => persistVoice(e.target.value)}>
            <option value="">Automática (melhor disponível)</option>
            {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang}){!v.localService ? ' ★' : ''}</option>)}
          </select>
          <p className="tk-hint">★ = voz premium · No Android, selecione uma voz Google ★ para melhor qualidade</p>
          {noCloudVoice && (
            <div className="tk-voice-warn">
              <strong>Voz em PT-BR detectada.</strong> Para corrigir no Android:<br/>
              Configurações → Gerenciamento Geral → Idioma e Entrada →
              Leitura de Texto → <em>Idioma</em> → selecione <em>English (United States)</em>.
              Depois reinicie o app.
            </div>
          )}
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
          transform:scale(1.3);
          transform-origin:center 15%;
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
        .tk-header-left { display:flex; align-items:center; gap:10px; }
        .tk-home-btn { color:var(--tk-dim); font-size:20px; text-decoration:none; padding:4px 6px; border-radius:8px; transition:color .15s; line-height:1; }
        .tk-home-btn:hover { color:var(--tk-text); background:var(--tk-panel2); }
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
        .tk-topic { font-size:11px; color:var(--tk-dim); padding-top:2px; }
        .tk-topic em { color:var(--tk-amber); font-style:normal; }
        .tk-speak-btn {
          margin-top:10px; padding:12px 32px; border-radius:999px; border:none; cursor:pointer;
          font-weight:700; font-size:15px; letter-spacing:.3px;
          background:var(--tk-amber); color:#241703;
          box-shadow:0 4px 18px rgba(232,163,61,0.40);
          transition:transform .12s, box-shadow .12s, background .15s;
          user-select:none; -webkit-user-select:none; touch-action:none;
        }
        .tk-speak-btn:active { transform:scale(0.96); }
        .tk-speak-active {
          background:#F0B355;
          box-shadow:0 0 0 6px rgba(232,163,61,0.22), 0 4px 22px rgba(232,163,61,0.55);
          animation:jpulse-out 1.3s ease-out infinite;
        }
        .tk-speak-disabled {
          background:var(--tk-panel2); color:var(--tk-dim);
          box-shadow:none; cursor:default; opacity:.7;
        }
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
        .tk-native { margin-top:8px; padding:7px 10px 7px 10px; background:rgba(79,189,186,0.10); border-left:3px solid var(--tk-teal); border-radius:0 6px 6px 0; font-size:13px; color:rgba(79,189,186,0.95); line-height:1.5; }
        .tk-native-label { font-size:10px; text-transform:uppercase; letter-spacing:.5px; opacity:.7; margin-bottom:3px; }
        .tk-correction { margin-top:7px; padding-top:7px; border-top:1px dashed var(--tk-line); font-size:12px; }
        .tk-said   { color:var(--tk-err); text-decoration:line-through; opacity:.9; }
        .tk-arrow  { color:var(--tk-dim); }
        .tk-better { color:var(--tk-good); font-weight:600; }
        .tk-why    { color:var(--tk-dim); font-size:11px; margin-top:2px; }
        .tk-pronunciation { color:var(--tk-teal); font-size:11px; margin-top:3px; }
        .tk-pronunciation em { font-style:normal; font-weight:600; }
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
        .tk-field input[type=text], .tk-field select, .tk-field textarea { width:100%; background:var(--tk-panel2); border:1px solid var(--tk-line); color:var(--tk-text); border-radius:10px; padding:9px 11px; font-size:13px; font-family:inherit; resize:vertical; }
        .tk-hint { font-size:11px; color:var(--tk-dim); margin-top:4px; }
        .tk-close { position:absolute; top:14px; right:16px; background:none; border:none; color:var(--tk-dim); font-size:20px; cursor:pointer; }
        .tk-membox { background:var(--tk-panel2); border-radius:10px; padding:10px 12px; font-size:12px; color:var(--tk-dim); max-height:110px; overflow-y:auto; line-height:1.5; }
        .tk-reset { background:none; border:1px solid var(--tk-err); color:var(--tk-err); border-radius:10px; padding:7px 12px; font-size:12px; cursor:pointer; margin-top:8px; }
        .tk-voice-warn { background:rgba(232,163,61,0.12); border:1px solid rgba(232,163,61,0.35); border-radius:8px; padding:9px 11px; font-size:11px; color:rgba(232,163,61,0.95); margin-top:8px; line-height:1.55; }
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
