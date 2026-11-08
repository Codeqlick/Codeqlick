'use client';

import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { Link } from '@/i18n/navigation';
import { AdZone } from './AdZone';
import { isInterest } from '@/lib/videochat-interests';
import { countryFlag, countryName, languageName } from '@/lib/videochat-options';
import styles from './VideochatRoom.module.css';

/**
 * The video chat room (architecture 4.7). The browser keeps the camera stream, opens the
 * signaling WebSocket with a single-use ticket the server asked for (BFF: no token here), and
 * talks WebRTC with whoever the server pairs it with. Media goes browser to browser (or through
 * our TURN relay); only negotiation and text messages pass through the WebSocket.
 */

type IceServer = { urls: string[]; username?: string; credential?: string };
type TicketResult =
  | { ok: true; ticket: { ticket: string; expiresIn: number; iceServers: IceServer[] } }
  | { ok: false; reason: 'suspended' | 'signed-out' | 'error' };

type SignalData =
  { sdp: { type: 'offer' | 'answer'; sdp: string } } | { candidate: RTCIceCandidateInit };

type ServerMessage =
  | { type: 'ready' }
  | { type: 'waiting'; others: number; filtered: boolean; widened: boolean }
  | { type: 'matched'; initiator: boolean; partner: PartnerProfile }
  | { type: 'signal'; data: SignalData }
  | { type: 'chat'; text: string }
  | { type: 'typing'; on: boolean }
  | { type: 'react'; emoji: string }
  | { type: 'partner-left' }
  | { type: 'reported' }
  | { type: 'blocked' }
  | { type: 'suspended' }
  | { type: 'liked' }
  | { type: 'mutual'; nickname: string | null }
  | { type: 'calling'; callId: string; partner: PartnerProfile }
  | { type: 'incoming'; callId: string; partner: PartnerProfile }
  | {
      type: 'call-ended';
      callId: string;
      reason: 'declined' | 'timeout' | 'busy' | 'offline' | 'cancelled';
    }
  | { type: 'error'; code: string };

/** A call to or from a contact that is ringing. */
type Ringing = { callId: string; partner: PartnerProfile; direction: 'out' | 'in' };

type PartnerProfile = {
  nickname: string | null;
  gender: 'WOMAN' | 'MAN' | 'NONBINARY' | null;
  country: string | null;
  language: string | null;
  interests?: string[];
};

/** After this long waiting with filters on, the room offers to search without them once. */
const WIDEN_AFTER_MS = 30_000;

type Phase =
  'idle' | 'starting' | 'searching' | 'calling' | 'connecting' | 'connected' | 'stopped' | 'closed';

type NoticeKey =
  | 'partnerLeft'
  | 'reported'
  | 'blocked'
  | 'noPartner'
  | 'rateLimited'
  | 'replaced'
  | 'suspended'
  | 'connectionLost'
  | 'reconnecting'
  | 'callFailed'
  | 'ticketError'
  | 'cameraDenied'
  | 'cameraMissing'
  | 'unsupported'
  | 'liked'
  | 'mutual'
  | 'mutualAnonymous'
  | 'callDeclined'
  | 'callTimeout'
  | 'callBusy'
  | 'callOffline'
  | 'callMissed'
  | 'notContact';

const CALL_END_NOTICE = {
  declined: 'callDeclined',
  timeout: 'callTimeout',
  busy: 'callBusy',
  offline: 'callOffline',
  cancelled: 'callMissed',
} as const;

const REASONS = [
  'MINOR',
  'NON_CONSENSUAL',
  'ILLEGAL',
  'HARASSMENT',
  'HATE',
  'SPAM',
  'OTHER',
] as const;
const CHAT_MAX = 500;
/** How often a call's connection quality is checked, and the limits of a weak connection. */
const QUALITY_EVERY_MS = 3_000;
const WEAK_RTT_S = 0.6;
const WEAK_LOSS = 0.08;
const WEAK_FPS = 8;

/** A short vibration where the phone supports it (a match, a contact's call). */
function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported: nothing to do.
  }
}

/** A call with no media after this long moves on to the next person. */
const CALL_TIMEOUT_MS = 15_000;
/** Waits between reconnection attempts (the last one repeats), and how many attempts. */
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
const RECONNECT_ATTEMPTS = 10;

/** A short two-note chime (Web Audio), so a match is noticed from another tab. */
function chime(): void {
  try {
    const audio = new AudioContext();
    const gain = audio.createGain();
    gain.gain.value = 0.08;
    gain.connect(audio.destination);
    [660, 880].forEach((frequency, index) => {
      const tone = audio.createOscillator();
      tone.frequency.value = frequency;
      tone.connect(gain);
      tone.start(audio.currentTime + index * 0.12);
      tone.stop(audio.currentTime + index * 0.12 + 0.1);
    });
    setTimeout(() => void audio.close(), 500);
  } catch {
    // No sound is fine.
  }
}

type ChatLine = { id: number; from: 'me' | 'them'; text: string; reaction?: boolean };

/** Quick reactions (the server accepts only these). */
const REACTIONS = ['❤️', '😂', '😮', '🔥', '👍', '😘'] as const;
/** "Typing…" stops being sent after this long without a key, and shown after this long without news. */
const TYPING_IDLE_MS = 3_000;
const TYPING_SHOWN_MS = 6_000;
const FLOAT_MS = 2_400;

/** Tones on or off, remembered on this device. */
const SOUNDS_KEY = 'cq-videochat-sounds';
const soundsEvent = 'cq-videochat-sounds';
function soundsOn(): boolean {
  try {
    return localStorage.getItem(SOUNDS_KEY) !== 'off';
  } catch {
    return true;
  }
}
function subscribeSounds(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  window.addEventListener(soundsEvent, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(soundsEvent, callback);
  };
}
function setSounds(on: boolean): void {
  try {
    localStorage.setItem(SOUNDS_KEY, on ? 'on' : 'off');
  } catch {
    // Private mode: it just isn't remembered.
  }
  window.dispatchEvent(new Event(soundsEvent));
}

/** A short soft tone for an incoming message or reaction. */
function tick(): void {
  try {
    const audio = new AudioContext();
    const gain = audio.createGain();
    gain.gain.value = 0.05;
    gain.connect(audio.destination);
    const tone = audio.createOscillator();
    tone.frequency.value = 740;
    tone.connect(gain);
    tone.start();
    tone.stop(audio.currentTime + 0.07);
    setTimeout(() => void audio.close(), 300);
  } catch {
    // No sound is fine.
  }
}

export function VideochatRoom({
  wsUrl,
  getTicket,
  locale,
  myInterests = [],
  callContactId,
}: {
  wsUrl: string;
  getTicket: () => Promise<TicketResult>;
  locale: string;
  /** This person's interests, to highlight the ones a partner shares. */
  myInterests?: string[];
  /** Opened from the contacts page to call this contact (their account id). */
  callContactId?: string;
}) {
  const t = useTranslations('Videochat.room');
  const ti = useTranslations('Videochat.interests');
  const tg = useTranslations('Videochat.genders');
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState<{
    key: NoticeKey;
    tone: 'info' | 'error';
    values?: Record<string, string>;
  } | null>(null);
  const [ringing, setRinging] = useState<Ringing | null>(null);
  /** Liked the current (or last) partner. */
  const [liked, setLiked] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hadPartner, setHadPartner] = useState(false);
  /** People waiting who can't be paired with this person now (filters, blocks, just met). */
  const [othersWaiting, setOthersWaiting] = useState(0);
  /** This person has filters, and whether this wait ignores them. */
  const [filters, setFilters] = useState({ filtered: false, widened: false });
  /** Waited long enough with filters on to be offered a wider search. */
  const [canWiden, setCanWiden] = useState(false);
  /** The camera stream is on (kept in a ref; this mirrors it for rendering). */
  const [hasCamera, setHasCamera] = useState(false);
  /** Which camera is on (phones): the front one is mirrored, the back one isn't. */
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  /** The device has more than one camera. */
  const [canSwitch, setCanSwitch] = useState(false);
  const [switching, setSwitching] = useState(false);
  /** The call fills the screen. */
  const [immersive, setImmersive] = useState(false);
  /** The call's connection is poor (see QUALITY_EVERY_MS). */
  const [weak, setWeak] = useState(false);
  const roomRef = useRef<HTMLDivElement>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [floats, setFloats] = useState<Array<{ id: number; emoji: string; mine: boolean }>>([]);
  const sounds = useSyncExternalStore(subscribeSounds, soundsOn, () => true);
  const soundsRef = useRef(true);
  useEffect(() => {
    soundsRef.current = sounds;
  }, [sounds]);
  const typingSent = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatId = useRef(0);

  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const reportDialog = useRef<HTMLDialogElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const iceServers = useRef<IceServer[]>([]);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const closingOnPurpose = useRef(false);
  const lineId = useRef(0);
  /** Gives up on a call that doesn't connect (see CALL_TIMEOUT_MS). */
  const callTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  /** The person pressed Stop: a reconnection doesn't start searching again by itself. */
  const paused = useRef(false);
  const connectRef = useRef<() => Promise<void>>(async () => undefined);
  /** A contact to call once the socket is ready (from the contacts page), used once. */
  const pendingCall = useRef(callContactId);
  const ringingRef = useRef<Ringing | null>(null);
  const setRing = useCallback((ring: Ringing | null) => {
    ringingRef.current = ring;
    setRinging(ring);
  }, []);

  const send = useCallback((message: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message));
    }
  }, []);

  /** An emoji floats up over the partner's video for a moment. */
  const float = useCallback((emoji: string, mine: boolean) => {
    floatId.current += 1;
    const id = floatId.current;
    setFloats((items) => [...items.slice(-5), { id, emoji, mine }]);
    setTimeout(() => setFloats((items) => items.filter((item) => item.id !== id)), FLOAT_MS);
  }, []);

  /** Something arrived from the partner: a soft tone and, in a hidden tab, the title flashes. */
  const notify = useCallback((title: string) => {
    if (soundsRef.current) tick();
    flashTitle(title);
  }, []);

  const stopTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    if (!typingSent.current) return;
    typingSent.current = false;
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: 'typing', on: false }));
    }
  }, []);

  const closePeer = useCallback(() => {
    typingSent.current = false;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (partnerTypingTimer.current) clearTimeout(partnerTypingTimer.current);
    setPartnerTyping(false);
    pendingCandidates.current = [];
    if (callTimer.current) clearTimeout(callTimer.current);
    callTimer.current = null;
    setPartner(null);
    if (peer.current) {
      peer.current.ontrack = null;
      peer.current.onicecandidate = null;
      peer.current.onconnectionstatechange = null;
      peer.current.close();
      peer.current = null;
    }
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
  }, []);

  const shutdown = useCallback(
    (finalPhase: Phase) => {
      closingOnPurpose.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      closePeer();
      socket.current?.close();
      socket.current = null;
      setPhase(finalPhase);
    },
    [closePeer],
  );

  const flushCandidates = useCallback(async (connection: RTCPeerConnection) => {
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const candidate of queued) {
      await connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }, []);

  /** Leaves the current call (or the wait) and looks for someone else. */
  const next = useCallback(() => {
    paused.current = false;
    closePeer();
    setChat([]);
    setPhase('searching');
    send({ type: 'next' });
  }, [closePeer, send]);

  const startPeer = useCallback(
    async (initiator: boolean) => {
      closePeer();
      const connection = new RTCPeerConnection({ iceServers: iceServers.current });
      peer.current = connection;
      for (const track of stream.current?.getTracks() ?? []) {
        connection.addTrack(track, stream.current as MediaStream);
      }
      connection.ontrack = (event) => {
        if (remoteVideo.current && event.streams[0]) {
          remoteVideo.current.srcObject = event.streams[0];
        }
      };
      connection.onicecandidate = (event) => {
        if (event.candidate)
          send({ type: 'signal', data: { candidate: event.candidate.toJSON() } });
      };
      // No direct path and no relay, or nothing after a while: on to the next person.
      const giveUp = () => {
        if (peer.current !== connection) return;
        setNotice({ key: 'callFailed', tone: 'info' });
        next();
      };
      callTimer.current = setTimeout(giveUp, CALL_TIMEOUT_MS);
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'connected') {
          if (callTimer.current) clearTimeout(callTimer.current);
          callTimer.current = null;
          setPhase('connected');
        } else if (connection.connectionState === 'failed') {
          giveUp();
        }
      };
      if (initiator) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        send({ type: 'signal', data: { sdp: { type: 'offer', sdp: offer.sdp ?? '' } } });
      }
    },
    [closePeer, next, send],
  );

  const onSignal = useCallback(
    async (data: SignalData) => {
      const connection = peer.current;
      if (!connection) return;
      if ('sdp' in data) {
        await connection.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          send({ type: 'signal', data: { sdp: { type: 'answer', sdp: answer.sdp ?? '' } } });
        }
        await flushCandidates(connection);
      } else if (connection.remoteDescription) {
        await connection.addIceCandidate(data.candidate).catch(() => undefined);
      } else {
        pendingCandidates.current.push(data.candidate);
      }
    },
    [flushCandidates, send],
  );

  const searchAgain = useCallback(() => {
    closePeer();
    setChat([]);
    setPhase('searching');
    send({ type: 'join' });
  }, [closePeer, send]);

  const onMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'ready':
          reconnectAttempt.current = 0;
          setNotice(null);
          if (pendingCall.current) {
            send({ type: 'call', contactId: pendingCall.current });
            pendingCall.current = undefined;
            window.history.replaceState(null, '', window.location.pathname);
            setPhase('calling');
            return;
          }
          if (paused.current) {
            setPhase('stopped');
            return;
          }
          setPhase('searching');
          send({ type: 'join' });
          return;
        case 'waiting':
          setPhase('searching');
          setOthersWaiting(message.others);
          setFilters({ filtered: message.filtered, widened: message.widened });
          return;
        case 'matched':
          buzz(120);
          setWeak(false);
          setRing(null);
          setLiked(false);
          setOthersWaiting(0);
          setCanWiden(false);
          setChat([]);
          setNotice(null);
          setHadPartner(true);
          setPhase('connecting');
          void startPeer(message.initiator).then(() => setPartner(message.partner ?? null));
          chime();
          flashTitle(t('matchedTitle'));
          return;
        case 'signal':
          void onSignal(message.data).catch(() => undefined);
          return;
        case 'chat':
          lineId.current += 1;
          setChat((lines) => [...lines, { id: lineId.current, from: 'them', text: message.text }]);
          if (partnerTypingTimer.current) clearTimeout(partnerTypingTimer.current);
          setPartnerTyping(false);
          notify(t('messageTitle'));
          return;
        case 'typing':
          if (partnerTypingTimer.current) clearTimeout(partnerTypingTimer.current);
          setPartnerTyping(message.on);
          if (message.on) {
            partnerTypingTimer.current = setTimeout(() => setPartnerTyping(false), TYPING_SHOWN_MS);
          }
          return;
        case 'react':
          lineId.current += 1;
          setChat((lines) => [
            ...lines,
            { id: lineId.current, from: 'them', text: message.emoji, reaction: true },
          ]);
          float(message.emoji, false);
          notify(t('messageTitle'));
          return;
        case 'partner-left':
          setNotice({ key: 'partnerLeft', tone: 'info' });
          searchAgain();
          return;
        case 'reported':
        case 'blocked':
          setNotice({ key: message.type, tone: 'info' });
          searchAgain();
          return;
        case 'liked':
          setLiked(true);
          setNotice({ key: 'liked', tone: 'info' });
          return;
        case 'mutual':
          setNotice(
            message.nickname
              ? { key: 'mutual', tone: 'info', values: { name: message.nickname } }
              : { key: 'mutualAnonymous', tone: 'info' },
          );
          chime();
          return;
        case 'calling':
          setRing({ callId: message.callId, partner: message.partner, direction: 'out' });
          setPhase('calling');
          return;
        case 'incoming':
          buzz([200, 100, 200]);
          setRing({ callId: message.callId, partner: message.partner, direction: 'in' });
          chime();
          flashTitle(t('incomingRing'));
          return;
        case 'call-ended': {
          const ring = ringingRef.current;
          setRing(null);
          if (ring?.direction === 'in') {
            // Missed (they hung up or it rang out); declining was our own doing.
            if (message.reason !== 'declined') setNotice({ key: 'callMissed', tone: 'info' });
            return;
          }
          if (message.reason === 'cancelled') return;
          setNotice({ key: CALL_END_NOTICE[message.reason], tone: 'info' });
          paused.current = true;
          setPhase('stopped');
          return;
        }
        case 'suspended':
          setNotice({ key: 'suspended', tone: 'error' });
          shutdown('closed');
          return;
        case 'error':
          if (message.code === 'replaced') {
            setNotice({ key: 'replaced', tone: 'error' });
            shutdown('closed');
          } else if (message.code === 'rate-limited') {
            setNotice({ key: 'rateLimited', tone: 'error' });
          } else if (message.code === 'no-partner') {
            setNotice({ key: 'noPartner', tone: 'info' });
          } else if (message.code === 'not-contact') {
            setRing(null);
            setNotice({ key: 'notContact', tone: 'info' });
            paused.current = true;
            setPhase('stopped');
          } else if (message.code === 'invalid-ticket') {
            setNotice({ key: 'ticketError', tone: 'error' });
            shutdown('closed');
          }
          return;
      }
    },
    [float, notify, onSignal, searchAgain, send, setRing, shutdown, startPeer, t],
  );

  const connect = useCallback(async () => {
    setPhase('starting');
    // Lost (network change, server restart): back by itself, waiting longer each time.
    const retryLater = () => {
      if (reconnectAttempt.current >= RECONNECT_ATTEMPTS) {
        setNotice({ key: 'connectionLost', tone: 'error' });
        setPhase('closed');
        return;
      }
      const delay =
        RECONNECT_DELAYS_MS[Math.min(reconnectAttempt.current, RECONNECT_DELAYS_MS.length - 1)];
      reconnectAttempt.current += 1;
      setNotice({ key: 'reconnecting', tone: 'info' });
      setPhase('starting');
      reconnectTimer.current = setTimeout(() => void connectRef.current(), delay);
    };

    const result = await getTicket();
    if (!result.ok) {
      if (result.reason === 'error' && reconnectAttempt.current > 0) {
        retryLater();
        return;
      }
      setNotice({
        key: result.reason === 'suspended' ? 'suspended' : 'ticketError',
        tone: 'error',
      });
      setPhase('closed');
      if (result.reason === 'signed-out' || result.reason === 'suspended') {
        // The page shows the sign-in, or the suspension and the appeal form.
        window.location.reload();
      }
      return;
    }
    if (reconnectAttempt.current === 0) setNotice(null);
    iceServers.current = result.ticket.iceServers;
    closingOnPurpose.current = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      retryLater();
      return;
    }
    socket.current = ws;
    const handshake = { ready: false };
    const lost = () => {
      if (socket.current !== ws) return;
      socket.current = null;
      clearTimeout(readyTimer);
      closePeer();
      if (!closingOnPurpose.current) retryLater();
    };
    // A socket the browser blocks (a policy, a proxy) may never open nor close: give it 10 s.
    const readyTimer = setTimeout(() => {
      if (handshake.ready) return;
      ws.close();
      lost();
    }, 10_000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', ticket: result.ticket.ticket }));
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'ready') {
          handshake.ready = true;
          clearTimeout(readyTimer);
        }
        onMessage(message);
      } catch {
        // Ignore anything that isn't one of our messages.
      }
    };
    ws.onclose = lost;
  }, [closePeer, getTicket, onMessage, wsUrl]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      setNotice({ key: 'unsupported', tone: 'error' });
      return;
    }
    try {
      stream.current ??= await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setNotice({
        key:
          name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'cameraMissing'
            : 'cameraDenied',
        tone: 'error',
      });
      return;
    }
    if (localVideo.current) localVideo.current.srcObject = stream.current;
    setHasCamera(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCanSwitch(devices.filter((device) => device.kind === 'videoinput').length > 1);
    } catch {
      setCanSwitch(false);
    }
    await connect();
  }, [connect]);

  // Leaving the page hangs up and turns the camera off.
  useEffect(
    () => () => {
      closingOnPurpose.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (callTimer.current) clearTimeout(callTimer.current);
      peer.current?.close();
      socket.current?.close();
      for (const track of stream.current?.getTracks() ?? []) track.stop();
    },
    [],
  );

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [chat, partnerTyping]);

  // Esc is "next" (unless the report dialog is open: there it closes the dialog).
  const online =
    phase === 'connecting' || phase === 'connected' || phase === 'searching' || phase === 'calling';
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || reportDialog.current?.open) return;
      // In the in-page full screen, Esc leaves it (the browser's own full screen does that itself).
      if (immersive) {
        setImmersive(false);
        return;
      }
      if (!online) return;
      setNotice(null);
      next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [immersive, next, online]);

  // Leaving the browser's full screen (its own gesture or Esc) leaves ours too.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setImmersive(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The screen stays on during a call (Wake Lock, where supported).
  const inCallNow = phase === 'connecting' || phase === 'connected';
  useEffect(() => {
    if (!inCallNow || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (cancelled) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => undefined);
    };
    acquire();
    // The lock goes when the tab is hidden: take it again on coming back.
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [inCallNow]);

  // Connection quality during a call: two bad samples in a row show the badge, two good hide it.
  useEffect(() => {
    // The badge only shows while connected; each new call starts without it (see 'matched').
    if (phase !== 'connected') return;
    let previous: { lost: number; received: number } | null = null;
    let bad = 0;
    let good = 0;
    const timer = setInterval(() => {
      const connection = peer.current;
      if (!connection) return;
      void connection
        .getStats()
        .then((report) => {
          let rtt: number | undefined;
          let lost = 0;
          let received = 0;
          let fps: number | undefined;
          report.forEach((entry: RTCStats & Record<string, unknown>) => {
            if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && entry.nominated) {
              rtt = entry.currentRoundTripTime as number | undefined;
            } else if (entry.type === 'inbound-rtp' && entry.kind === 'video') {
              lost = (entry.packetsLost as number | undefined) ?? 0;
              received = (entry.packetsReceived as number | undefined) ?? 0;
              fps = entry.framesPerSecond as number | undefined;
            }
          });
          const deltaLost = previous ? lost - previous.lost : 0;
          const deltaReceived = previous ? received - previous.received : 0;
          previous = { lost, received };
          const total = deltaLost + deltaReceived;
          const loss = total > 0 ? deltaLost / total : 0;
          const isBad =
            (rtt !== undefined && rtt > WEAK_RTT_S) ||
            loss > WEAK_LOSS ||
            (fps !== undefined && fps < WEAK_FPS);
          if (isBad) {
            bad += 1;
            good = 0;
            if (bad >= 2) setWeak(true);
          } else {
            good += 1;
            bad = 0;
            if (good >= 2) setWeak(false);
          }
        })
        .catch(() => undefined);
    }, QUALITY_EVERY_MS);
    return () => clearInterval(timer);
  }, [phase]);

  /** Front ↔ back camera; the call keeps going (the new track replaces the old one). */
  const switchCamera = async () => {
    const current = stream.current;
    if (!current || switching) return;
    const next = facing === 'user' ? 'environment' : 'user';
    const old = current.getVideoTracks()[0];
    setSwitching(true);
    // Many phones open one camera at a time: free the current one first.
    old?.stop();
    const open = (mode: 'user' | 'environment') =>
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: mode } } })
        .then((fresh) => fresh.getVideoTracks()[0]);
    let track: MediaStreamTrack | undefined;
    let mode: 'user' | 'environment' = next;
    try {
      track = await open(next);
    } catch {
      mode = facing;
      track = await open(facing).catch(() => undefined);
    }
    if (old) current.removeTrack(old);
    if (track) {
      track.enabled = camOn;
      current.addTrack(track);
      const sender = peer.current?.getSenders().find((item) => item.track?.kind === 'video');
      await sender?.replaceTrack(track).catch(() => undefined);
      setFacing(mode);
    }
    if (localVideo.current) localVideo.current.srcObject = current;
    setSwitching(false);
  };

  const toggleImmersive = () => {
    if (immersive) {
      setImmersive(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      return;
    }
    setImmersive(true);
    // The browser's full screen where there is one (not on iPhone): the page layout does the rest.
    void roomRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const answer = (accept: boolean) => {
    if (!ringing) return;
    send({ type: 'answer', callId: ringing.callId, accept });
    setRing(null);
    if (accept) {
      paused.current = false;
      closePeer();
      setChat([]);
      setPhase('connecting');
    }
  };

  const stop = () => {
    paused.current = true;
    setRing(null);
    closePeer();
    setChat([]);
    setPhase('stopped');
    send({ type: 'leave' });
  };

  const resume = () => {
    paused.current = false;
    setNotice(null);
    setPhase('searching');
    send({ type: 'join' });
  };

  const toggleMic = () => {
    const enabled = !micOn;
    for (const track of stream.current?.getAudioTracks() ?? []) track.enabled = enabled;
    setMicOn(enabled);
  };

  const toggleCam = () => {
    const enabled = !camOn;
    for (const track of stream.current?.getVideoTracks() ?? []) track.enabled = enabled;
    setCamOn(enabled);
  };

  const sendChat = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim().slice(0, CHAT_MAX);
    if (!text || phase !== 'connected') return;
    stopTyping();
    send({ type: 'chat', text });
    lineId.current += 1;
    setChat((lines) => [...lines, { id: lineId.current, from: 'me', text }]);
    setDraft('');
  };

  /** "Typing…" for the partner: on with the first key, off after a pause or an empty box. */
  const onDraft = (value: string) => {
    setDraft(value);
    if (phase !== 'connected') return;
    if (!value.trim()) {
      stopTyping();
      return;
    }
    if (!typingSent.current) {
      typingSent.current = true;
      send({ type: 'typing', on: true });
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  };

  const sendReaction = (emoji: string) => {
    if (phase !== 'connected') return;
    send({ type: 'react', emoji });
    lineId.current += 1;
    setChat((lines) => [...lines, { id: lineId.current, from: 'me', text: emoji, reaction: true }]);
    float(emoji, true);
  };

  const sendReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const details = String(form.get('details') ?? '').trim();
    send({
      type: 'report',
      reason: String(form.get('reason')),
      ...(details ? { details: details.slice(0, 1000) } : {}),
    });
    reportDialog.current?.close();
    event.currentTarget.reset();
  };

  const inRoom = online || phase === 'stopped';
  const offerWiden = phase === 'searching' && filters.filtered && !filters.widened;
  useEffect(() => {
    if (!offerWiden) return;
    const timer = setTimeout(() => setCanWiden(true), WIDEN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [offerWiden]);

  const sharedInterests = new Set(
    (partner?.interests ?? []).filter((interest) => myInterests.includes(interest)),
  );

  const callingName = ringing?.partner.nickname;
  const statusText: Partial<Record<Phase, string>> = {
    starting: t('starting'),
    searching: filters.widened ? t('widened') : t('searching'),
    calling: callingName ? t('calling', { name: callingName }) : t('callingAnonymous'),
    connecting: t('connecting'),
    connected: t('connected'),
    stopped: t('stopped'),
  };
  const status = statusText[phase] ?? null;

  return (
    <div ref={roomRef} className={immersive ? `${styles.room} ${styles.immersive}` : styles.room}>
      <div className={styles.stage}>
        <div className={styles.remote}>
          {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- a live call: no captions exist */}
          <video ref={remoteVideo} autoPlay playsInline className={styles.video} />
          <div className={styles.floats} aria-hidden="true">
            {floats.map((item) => (
              <span key={item.id} className={item.mine ? styles.floatMine : styles.float}>
                {item.emoji}
              </span>
            ))}
          </div>
          {weak && phase === 'connected' ? (
            <output className={styles.weak}>{t('weakConnection')}</output>
          ) : null}
          {phase !== 'connected' ? (
            <div className={styles.overlay}>
              {ringing?.direction === 'in' ? (
                <div
                  className={styles.incoming}
                  role="alertdialog"
                  aria-labelledby="videochat-incoming"
                >
                  <p id="videochat-incoming" className={styles.incomingTitle}>
                    {ringing.partner.nickname
                      ? t('incomingTitle', { name: ringing.partner.nickname })
                      : t('incomingAnonymous')}
                  </p>
                  <div className={styles.incomingActions}>
                    <button type="button" className={styles.primary} onClick={() => answer(true)}>
                      {t('accept')}
                    </button>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => answer(false)}
                    >
                      {t('decline')}
                    </button>
                  </div>
                </div>
              ) : phase === 'idle' || phase === 'closed' ? (
                <div className={styles.startBox}>
                  <h1 className={styles.startTitle}>{t('startTitle')}</h1>
                  <p>{t('startLead')}</p>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => void (hasCamera && phase === 'closed' ? connect() : start())}
                  >
                    {phase === 'closed' && hasCamera ? t('retry') : t('start')}
                  </button>
                </div>
              ) : (
                <p className={styles.status} aria-live="polite">
                  {phase === 'searching' ||
                  phase === 'connecting' ||
                  phase === 'starting' ||
                  phase === 'calling' ? (
                    <span className={styles.spinner} aria-hidden="true" />
                  ) : null}
                  {status}
                </p>
              )}
              {phase === 'calling' ? (
                <button type="button" className={styles.secondary} onClick={stop}>
                  {t('cancelCall')}
                </button>
              ) : null}
              {phase === 'searching' && othersWaiting > 0 ? (
                <p className={styles.statusHint}>
                  {t('othersWaiting', { count: othersWaiting })}{' '}
                  <Link href="/videochat/settings">{t('checkFilters')}</Link>
                </p>
              ) : null}
              {offerWiden && canWiden ? (
                <div className={styles.widen}>
                  <p className={styles.statusHint}>{t('widenHint')}</p>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => send({ type: 'widen' })}
                  >
                    {t('widen')}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <span className={styles.tag}>
            {partner?.nickname ?? t('stranger')}
            {partner?.gender ? ` · ${tg(partner.gender)}` : ''}
            {partner?.country
              ? ` · ${countryFlag(partner.country)} ${countryName(partner.country, locale)}`
              : ''}
            {partner?.language ? ` · ${languageName(partner.language, locale)}` : ''}
          </span>
          {partner?.interests?.length ? (
            <ul className={styles.interests} aria-label={t('partnerInterests')}>
              {partner.interests.map((interest) => (
                <li
                  key={interest}
                  className={sharedInterests.has(interest) ? styles.sharedInterest : undefined}
                  title={sharedInterests.has(interest) ? t('shared') : undefined}
                >
                  {sharedInterests.has(interest) ? '★ ' : ''}
                  {isInterest(interest) ? ti(interest) : interest}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className={styles.local}>
          <video
            ref={localVideo}
            autoPlay
            playsInline
            muted
            className={facing === 'user' ? `${styles.video} ${styles.mirror}` : styles.video}
          />
          <span className={styles.tag}>{t('you')}</span>
        </div>
      </div>

      {notice ? (
        <p
          className={notice.tone === 'error' ? styles.noticeError : styles.notice}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {t(notice.key, notice.values)}
        </p>
      ) : null}

      <div className={styles.controls}>
        {phase === 'stopped' ? (
          <button type="button" className={styles.primary} onClick={resume}>
            {t('resume')}
          </button>
        ) : (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              setNotice(null);
              next();
            }}
            disabled={!inRoom}
            aria-keyshortcuts="Escape"
          >
            {t('next')} <kbd className={styles.kbd}>Esc</kbd>
          </button>
        )}
        <button
          type="button"
          className={styles.secondary}
          onClick={stop}
          disabled={!inRoom || phase === 'stopped'}
        >
          {t('stop')}
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={toggleMic}
          disabled={!hasCamera}
          aria-pressed={!micOn}
        >
          {micOn ? t('mute') : t('unmute')}
        </button>
        <button
          type="button"
          className={styles.secondary}
          onClick={toggleCam}
          disabled={!hasCamera}
          aria-pressed={!camOn}
        >
          {camOn ? t('cameraOff') : t('cameraOn')}
        </button>
        {canSwitch ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void switchCamera()}
            disabled={!hasCamera || switching}
          >
            {t('switchCamera')}
          </button>
        ) : null}
        <button
          type="button"
          className={`${styles.secondary} ${styles.fullToggle}`}
          onClick={toggleImmersive}
          disabled={!hasCamera}
          aria-pressed={immersive}
        >
          {immersive ? t('exitFullScreen') : t('fullScreen')}
        </button>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.like}
          onClick={() => send({ type: 'like' })}
          disabled={!hadPartner || !inRoom || liked}
          aria-pressed={liked}
        >
          ♥ {t('like')}
        </button>
        <button
          type="button"
          className={styles.danger}
          onClick={() => send({ type: 'block' })}
          disabled={!hadPartner || !inRoom}
        >
          {t('block')}
        </button>
        <button
          type="button"
          className={styles.danger}
          onClick={() => reportDialog.current?.showModal()}
          disabled={!hadPartner || !inRoom}
        >
          {t('report')}
        </button>
      </div>

      {/* Ads only while no partner is on screen: never over or beside a call (4.7). */}
      {phase === 'searching' ? <AdZone zone="waiting" className={styles.ad} /> : null}
      {phase === 'stopped' ? <AdZone zone="between" className={styles.ad} /> : null}

      <section className={styles.chat} aria-label={t('chatLabel')}>
        <div className={styles.chatLog} aria-live="polite">
          {chat.length === 0 ? <p className={styles.chatEmpty}>{t('chatEmpty')}</p> : null}
          {chat.map((line) => (
            <p
              key={line.id}
              className={`${line.from === 'me' ? styles.lineMe : styles.lineThem}${
                line.reaction ? ` ${styles.lineReaction}` : ''
              }`}
            >
              <span className={styles.lineWho}>
                {line.from === 'me' ? t('chatMe') : t('chatThem')}
              </span>
              {line.text}
            </p>
          ))}
          {partnerTyping && phase === 'connected' ? (
            <p className={styles.typing}>{t('typing')}</p>
          ) : null}
          <div ref={chatEnd} />
        </div>
        <fieldset className={styles.reactions}>
          <legend className="visually-hidden">{t('reactions')}</legend>
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.reaction}
              onClick={() => sendReaction(emoji)}
              disabled={phase !== 'connected'}
              aria-label={t('reactWith', { emoji })}
            >
              {emoji}
            </button>
          ))}
          <label className={styles.sounds}>
            <input
              type="checkbox"
              checked={sounds}
              onChange={(event) => setSounds(event.target.checked)}
            />
            {t('sounds')}
          </label>
        </fieldset>
        <form className={styles.chatForm} onSubmit={sendChat}>
          <label className="visually-hidden" htmlFor="videochat-message">
            {t('chatPlaceholder')}
          </label>
          <input
            id="videochat-message"
            className={styles.chatInput}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            maxLength={CHAT_MAX}
            placeholder={t('chatPlaceholder')}
            disabled={phase !== 'connected'}
            autoComplete="off"
          />
          <button
            type="submit"
            className={styles.secondary}
            disabled={phase !== 'connected' || !draft.trim()}
          >
            {t('chatSend')}
          </button>
        </form>
      </section>

      <dialog ref={reportDialog} className={styles.dialog} aria-labelledby="videochat-report-title">
        <form onSubmit={sendReport} className={styles.dialogForm}>
          <h2 id="videochat-report-title" className={styles.dialogTitle}>
            {t('reportTitle')}
          </h2>
          <p>{t('reportLead')}</p>
          <label className={styles.label} htmlFor="videochat-report-reason">
            {t('reportReason')}
          </label>
          <select id="videochat-report-reason" name="reason" className={styles.select} required>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {t(`reasons.${reason}`)}
              </option>
            ))}
          </select>
          <label className={styles.label} htmlFor="videochat-report-details">
            {t('reportDetails')}
          </label>
          <textarea
            id="videochat-report-details"
            name="details"
            maxLength={1000}
            rows={3}
            className={styles.select}
          />
          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => reportDialog.current?.close()}
            >
              {t('reportCancel')}
            </button>
            <button type="submit" className={styles.danger}>
              {t('reportSend')}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

/** Flashes the tab title until the tab is looked at again (only while it is hidden). */
function flashTitle(message: string): void {
  if (typeof document === 'undefined' || !document.hidden) return;
  const original = document.title;
  let on = false;
  const timer = setInterval(() => {
    on = !on;
    document.title = on ? message : original;
  }, 1_000);
  const restore = () => {
    if (document.hidden) return;
    clearInterval(timer);
    document.title = original;
    document.removeEventListener('visibilitychange', restore);
  };
  document.addEventListener('visibilitychange', restore);
}
