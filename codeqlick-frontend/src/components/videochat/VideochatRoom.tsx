'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
  | { type: 'waiting' }
  | { type: 'matched'; initiator: boolean }
  | { type: 'signal'; data: SignalData }
  | { type: 'chat'; text: string }
  | { type: 'partner-left' }
  | { type: 'reported' }
  | { type: 'blocked' }
  | { type: 'suspended' }
  | { type: 'error'; code: string };

type Phase = 'idle' | 'starting' | 'searching' | 'connecting' | 'connected' | 'stopped' | 'closed';

type NoticeKey =
  | 'partnerLeft'
  | 'reported'
  | 'blocked'
  | 'noPartner'
  | 'rateLimited'
  | 'replaced'
  | 'suspended'
  | 'connectionLost'
  | 'ticketError'
  | 'cameraDenied'
  | 'cameraMissing'
  | 'unsupported';

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

type ChatLine = { id: number; from: 'me' | 'them'; text: string };

export function VideochatRoom({
  wsUrl,
  getTicket,
}: {
  wsUrl: string;
  getTicket: () => Promise<TicketResult>;
}) {
  const t = useTranslations('Videochat.room');
  const [phase, setPhase] = useState<Phase>('idle');
  const [notice, setNotice] = useState<{ key: NoticeKey; tone: 'info' | 'error' } | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hadPartner, setHadPartner] = useState(false);
  /** The camera stream is on (kept in a ref; this mirrors it for rendering). */
  const [hasCamera, setHasCamera] = useState(false);

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

  const send = useCallback((message: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message));
    }
  }, []);

  const closePeer = useCallback(() => {
    pendingCandidates.current = [];
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
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'connected') setPhase('connected');
      };
      if (initiator) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        send({ type: 'signal', data: { sdp: { type: 'offer', sdp: offer.sdp ?? '' } } });
      }
    },
    [closePeer, send],
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
          setPhase('searching');
          send({ type: 'join' });
          return;
        case 'waiting':
          setPhase('searching');
          return;
        case 'matched':
          setChat([]);
          setNotice(null);
          setHadPartner(true);
          setPhase('connecting');
          void startPeer(message.initiator);
          return;
        case 'signal':
          void onSignal(message.data).catch(() => undefined);
          return;
        case 'chat':
          lineId.current += 1;
          setChat((lines) => [...lines, { id: lineId.current, from: 'them', text: message.text }]);
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
          } else if (message.code === 'invalid-ticket') {
            setNotice({ key: 'ticketError', tone: 'error' });
            shutdown('closed');
          }
          return;
      }
    },
    [onSignal, searchAgain, send, shutdown, startPeer],
  );

  const connect = useCallback(async () => {
    setPhase('starting');
    setNotice(null);
    const result = await getTicket();
    if (!result.ok) {
      setNotice({
        key: result.reason === 'suspended' ? 'suspended' : 'ticketError',
        tone: 'error',
      });
      setPhase('closed');
      if (result.reason === 'signed-out') window.location.reload();
      return;
    }
    iceServers.current = result.ticket.iceServers;
    closingOnPurpose.current = false;
    const ws = new WebSocket(wsUrl);
    socket.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', ticket: result.ticket.ticket }));
    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        // Ignore anything that isn't one of our messages.
      }
    };
    ws.onclose = () => {
      if (socket.current !== ws) return;
      socket.current = null;
      closePeer();
      if (!closingOnPurpose.current) {
        setNotice({ key: 'connectionLost', tone: 'error' });
        setPhase('closed');
      }
    };
  }, [closePeer, getTicket, onMessage, wsUrl]);

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
    await connect();
  }, [connect]);

  // Leaving the page hangs up and turns the camera off.
  useEffect(
    () => () => {
      closingOnPurpose.current = true;
      peer.current?.close();
      socket.current?.close();
      for (const track of stream.current?.getTracks() ?? []) track.stop();
    },
    [],
  );

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [chat]);

  const next = () => {
    setNotice(null);
    closePeer();
    setChat([]);
    setPhase('searching');
    send({ type: 'next' });
  };

  const stop = () => {
    closePeer();
    setChat([]);
    setPhase('stopped');
    send({ type: 'leave' });
  };

  const resume = () => {
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
    send({ type: 'chat', text });
    lineId.current += 1;
    setChat((lines) => [...lines, { id: lineId.current, from: 'me', text }]);
    setDraft('');
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

  const live = phase === 'connecting' || phase === 'connected';
  const online = live || phase === 'searching' || phase === 'stopped';
  const status =
    phase === 'starting'
      ? t('starting')
      : phase === 'searching'
        ? t('searching')
        : phase === 'connecting'
          ? t('connecting')
          : phase === 'connected'
            ? t('connected')
            : phase === 'stopped'
              ? t('stopped')
              : null;

  return (
    <div className={styles.room}>
      <div className={styles.stage}>
        <div className={styles.remote}>
          {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- a live call: no captions exist */}
          <video ref={remoteVideo} autoPlay playsInline className={styles.video} />
          {phase !== 'connected' ? (
            <div className={styles.overlay}>
              {phase === 'idle' || phase === 'closed' ? (
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
                  {phase === 'searching' || phase === 'connecting' || phase === 'starting' ? (
                    <span className={styles.spinner} aria-hidden="true" />
                  ) : null}
                  {status}
                </p>
              )}
            </div>
          ) : null}
          <span className={styles.tag}>{t('stranger')}</span>
        </div>
        <div className={styles.local}>
          <video ref={localVideo} autoPlay playsInline muted className={styles.video} />
          <span className={styles.tag}>{t('you')}</span>
        </div>
      </div>

      {notice ? (
        <p
          className={notice.tone === 'error' ? styles.noticeError : styles.notice}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {t(notice.key)}
        </p>
      ) : null}

      <div className={styles.controls}>
        {phase === 'stopped' ? (
          <button type="button" className={styles.primary} onClick={resume}>
            {t('resume')}
          </button>
        ) : (
          <button type="button" className={styles.primary} onClick={next} disabled={!online}>
            {t('next')}
          </button>
        )}
        <button
          type="button"
          className={styles.secondary}
          onClick={stop}
          disabled={!online || phase === 'stopped'}
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
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.danger}
          onClick={() => send({ type: 'block' })}
          disabled={!hadPartner || !online}
        >
          {t('block')}
        </button>
        <button
          type="button"
          className={styles.danger}
          onClick={() => reportDialog.current?.showModal()}
          disabled={!hadPartner || !online}
        >
          {t('report')}
        </button>
      </div>

      <section className={styles.chat} aria-label={t('chatLabel')}>
        <div className={styles.chatLog} aria-live="polite">
          {chat.length === 0 ? <p className={styles.chatEmpty}>{t('chatEmpty')}</p> : null}
          {chat.map((line) => (
            <p key={line.id} className={line.from === 'me' ? styles.lineMe : styles.lineThem}>
              <span className={styles.lineWho}>
                {line.from === 'me' ? t('chatMe') : t('chatThem')}
              </span>
              {line.text}
            </p>
          ))}
          <div ref={chatEnd} />
        </div>
        <form className={styles.chatForm} onSubmit={sendChat}>
          <label className="visually-hidden" htmlFor="videochat-message">
            {t('chatPlaceholder')}
          </label>
          <input
            id="videochat-message"
            className={styles.chatInput}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
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
