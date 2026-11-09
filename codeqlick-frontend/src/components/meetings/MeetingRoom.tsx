'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/navigation';
import styles from './MeetingRoom.module.css';
import { avatarPath, initials } from '@/lib/avatar';

type IceServer = { urls: string[]; username?: string; credential?: string };

export type MeetingTicketResult =
  | { ok: true; ticket: string; iceServers: IceServer[] }
  | { ok: false; reason: 'not-found' | 'name' | 'rate-limited' | 'error' };

type SignalData =
  { sdp: { type: 'offer' | 'answer'; sdp: string } } | { candidate: RTCIceCandidateInit };

type Media = { audio: boolean; video: boolean; screen: boolean };
type PeerInfo = Media & {
  id: string;
  name: string;
  avatar: string | null;
  owner: boolean;
  guest: boolean;
};

type ServerMessage =
  | { type: 'waiting'; title: string }
  | {
      type: 'ready';
      self: PeerInfo;
      room: { code: string; title: string; lobby: boolean };
      peers: PeerInfo[];
      knocks: Knock[];
    }
  | { type: 'knock'; id: string; name: string }
  | { type: 'knock-gone'; id: string }
  | { type: 'joined'; peer: PeerInfo }
  | { type: 'left'; id: string }
  | ({ type: 'media'; id: string } & Media)
  | { type: 'signal'; from: string; data: SignalData }
  | { type: 'chat'; from: string; name: string; text: string; at: string }
  | { type: 'lobby'; on: boolean }
  | { type: 'declined' | 'removed' | 'ended' | 'full' }
  | { type: 'error'; code: string };

type Knock = { id: string; name: string };
type ChatLine = { id: number; mine: boolean; name: string; text: string; at: string };

/** Where the meeting is. `over` carries why it ended for this person. */
type Phase =
  | { kind: 'setup' }
  | { kind: 'connecting' }
  | { kind: 'waiting' }
  | { kind: 'inside' }
  | { kind: 'over'; reason: OverReason };
type OverReason = 'left' | 'declined' | 'removed' | 'ended' | 'full' | 'gone' | 'lost';

/** A connection to one person of the meeting (everyone connects to everyone). */
interface PeerLink {
  pc: RTCPeerConnection;
  stream: MediaStream;
  pending: RTCIceCandidateInit[];
  initiator: boolean;
}

const CHAT_MAX = 500;
/** WebSocket close codes the API uses (meetings.gateway.ts). */
const CLOSE_REASONS: Record<number, OverReason> = {
  4403: 'removed',
  4404: 'gone',
  4409: 'full',
  4410: 'ended',
};

/** A soft tone for a knock or a message (no sound is fine). */
function tick(): void {
  try {
    const audio = new AudioContext();
    const gain = audio.createGain();
    gain.gain.value = 0.04;
    gain.connect(audio.destination);
    const tone = audio.createOscillator();
    tone.frequency.value = 660;
    tone.connect(gain);
    tone.start();
    tone.stop(audio.currentTime + 0.08);
    setTimeout(() => void audio.close(), 300);
  } catch {
    // Nothing to do.
  }
}

/** One video tile: a person's camera (or screen), their name and whether they are muted. */
function Tile({
  stream,
  name,
  avatar,
  audio,
  video,
  screen,
  mine,
  labels,
}: Media & {
  stream: MediaStream | null;
  name: string;
  /** Profile photo's file name, shown while the camera is off. */
  avatar?: string | null;
  mine?: boolean;
  labels: { muted: string; screen: string; you: string };
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  const showVideo = Boolean(stream) && (video || screen);
  return (
    <figure className={styles.tile} data-screen={screen || undefined}>
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- a live call: no captions exist */}
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={mine}
        className={`${styles.video} ${mine && !screen ? styles.mirror : ''}`}
        hidden={!showVideo}
      />
      {showVideo ? null : avatarPath(avatar) ? (
        // oxlint-disable-next-line nextjs/no-img-element -- a 256 px WebP already
        <img src={avatarPath(avatar) ?? ''} alt="" className={styles.avatar} />
      ) : (
        <span className={styles.avatar} aria-hidden="true">
          {initials(name)}
        </span>
      )}
      <figcaption className={styles.caption}>
        <span>{mine ? (name ? `${name} (${labels.you})` : labels.you) : name}</span>
        {screen ? <span className={styles.chip}>{labels.screen}</span> : null}
        {audio ? null : (
          <span className={styles.chip} title={labels.muted}>
            {labels.muted}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export function MeetingRoom({
  code,
  title,
  ownerName,
  userName,
  userAvatar = null,
  wsUrl,
  getTicket,
}: {
  code: string;
  title: string;
  ownerName: string;
  /** The signed-in person's name; null for a guest, who types one. */
  userName: string | null;
  /** The signed-in person's profile photo (file name), if any. */
  userAvatar?: string | null;
  wsUrl: string;
  getTicket: (code: string, name: string) => Promise<MeetingTicketResult>;
}) {
  const t = useTranslations('Meetings.room');
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' });
  const [name, setName] = useState(userName ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [hasMic, setHasMic] = useState(false);
  const [hasCam, setHasCam] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [self, setSelf] = useState<PeerInfo | null>(null);
  const [roomTitle, setRoomTitle] = useState(title);
  const [lobby, setLobby] = useState(true);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [knocks, setKnocks] = useState<Knock[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [panel, setPanel] = useState<'chat' | 'people' | null>(null);
  const [unread, setUnread] = useState(0);
  const [copied, setCopied] = useState(false);

  const stream = useRef<MediaStream | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const links = useRef(new Map<string, PeerLink>());
  const iceServers = useRef<IceServer[]>([]);
  const selfId = useRef<string | null>(null);
  const leaving = useRef(false);
  const panelRef = useRef(panel);
  const lineId = useRef(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  const media = useRef<Media>({ audio: true, video: true, screen: false });

  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [chat, panel]);

  // The camera and microphone, as soon as the page opens (the preview before joining).
  useEffect(() => {
    const effect = { cancelled: false };
    const open = async () => {
      const attempts: MediaStreamConstraints[] = [
        { audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
        { audio: true },
        { video: true },
      ];
      for (const constraints of attempts) {
        try {
          const media = await navigator.mediaDevices.getUserMedia(constraints);
          if (effect.cancelled) {
            for (const track of media.getTracks()) track.stop();
            return;
          }
          return media;
        } catch {
          // Try with less.
        }
      }
      return null;
    };
    void open().then((media) => {
      if (effect.cancelled) return;
      setCanShare(
        typeof navigator !== 'undefined' &&
          Boolean(navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices),
      );
      if (!media) {
        setNotice(t('noDevices'));
        setMicOn(false);
        setCamOn(false);
        return;
      }
      stream.current = media;
      setLocalStream(media);
      setHasMic(media.getAudioTracks().length > 0);
      setHasCam(media.getVideoTracks().length > 0);
      if (media.getAudioTracks().length === 0) setMicOn(false);
      if (media.getVideoTracks().length === 0) setCamOn(false);
    });
    return () => {
      effect.cancelled = true;
    };
  }, [t]);

  const send = useCallback((message: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message));
    }
  }, []);

  const sendMedia = useCallback(() => {
    send({ type: 'media', ...media.current });
  }, [send]);

  const closeLink = useCallback((id: string) => {
    const link = links.current.get(id);
    if (!link) return;
    link.pc.ontrack = null;
    link.pc.onicecandidate = null;
    link.pc.onconnectionstatechange = null;
    link.pc.close();
    links.current.delete(id);
    setStreams((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const closeAll = useCallback(() => {
    // Deleting while iterating a Map is safe.
    for (const id of links.current.keys()) closeLink(id);
  }, [closeLink]);

  /** What this browser sends: the screen while sharing, else the camera. */
  const outgoing = useCallback((kind: 'audio' | 'video'): MediaStreamTrack | null => {
    if (kind === 'video' && screenTrack.current) return screenTrack.current;
    const tracks =
      kind === 'audio' ? stream.current?.getAudioTracks() : stream.current?.getVideoTracks();
    return tracks?.[0] ?? null;
  }, []);

  /** A connection to one person. Both sides always have an audio and a video slot. */
  const createLink = useCallback(
    (id: string, initiator: boolean): PeerLink => {
      closeLink(id);
      const pc = new RTCPeerConnection({ iceServers: iceServers.current });
      const remote = new MediaStream();
      const link: PeerLink = { pc, stream: remote, pending: [], initiator };
      links.current.set(id, link);
      setStreams((current) => ({ ...current, [id]: remote }));
      if (initiator) {
        for (const kind of ['audio', 'video'] as const) {
          const transceiver = pc.addTransceiver(kind, { direction: 'sendrecv' });
          void transceiver.sender.replaceTrack(outgoing(kind));
        }
      }
      pc.ontrack = (event) => {
        if (!remote.getTracks().includes(event.track)) remote.addTrack(event.track);
        // A new MediaStream object makes the tile pick the track up.
        setStreams((current) => ({ ...current, [id]: new MediaStream(remote.getTracks()) }));
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ type: 'signal', to: id, data: { candidate: event.candidate.toJSON() } });
        }
      };
      pc.onconnectionstatechange = () => {
        // Whoever made the offer tries again over a fresh path (a relay, a new network).
        if (pc.connectionState === 'failed' && link.initiator) {
          void pc
            .createOffer({ iceRestart: true })
            .then(async (offer) => {
              await pc.setLocalDescription(offer);
              send({
                type: 'signal',
                to: id,
                data: { sdp: { type: 'offer', sdp: offer.sdp ?? '' } },
              });
            })
            .catch(() => undefined);
        }
      };
      return link;
    },
    [closeLink, outgoing, send],
  );

  const offer = useCallback(
    async (id: string) => {
      const link = createLink(id, true);
      const description = await link.pc.createOffer();
      await link.pc.setLocalDescription(description);
      send({
        type: 'signal',
        to: id,
        data: { sdp: { type: 'offer', sdp: description.sdp ?? '' } },
      });
    },
    [createLink, send],
  );

  const onSignal = useCallback(
    async (from: string, data: SignalData) => {
      let link = links.current.get(from);
      if ('sdp' in data) {
        if (data.sdp.type === 'offer') {
          if (!link) link = createLink(from, false);
          const { pc } = link;
          await pc.setRemoteDescription(data.sdp);
          // Send on the slots the offer opened.
          for (const transceiver of pc.getTransceivers()) {
            const kind = transceiver.receiver.track.kind as 'audio' | 'video';
            transceiver.direction = 'sendrecv';
            await transceiver.sender.replaceTrack(outgoing(kind));
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({
            type: 'signal',
            to: from,
            data: { sdp: { type: 'answer', sdp: answer.sdp ?? '' } },
          });
        } else if (link) {
          await link.pc.setRemoteDescription(data.sdp);
        }
        if (link) {
          const queued = link.pending;
          link.pending = [];
          for (const candidate of queued) {
            await link.pc.addIceCandidate(candidate).catch(() => undefined);
          }
        }
      } else if (link?.pc.remoteDescription) {
        await link.pc.addIceCandidate(data.candidate).catch(() => undefined);
      } else if (link) {
        link.pending.push(data.candidate);
      }
    },
    [createLink, outgoing, send],
  );

  const finish = useCallback(
    (reason: OverReason) => {
      leaving.current = true;
      closeAll();
      socket.current?.close(1000);
      socket.current = null;
      setPeers([]);
      setKnocks([]);
      setSelf(null);
      setPanel(null);
      setPhase({ kind: 'over', reason });
    },
    [closeAll],
  );

  const onMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'waiting':
          setRoomTitle(message.title);
          setPhase({ kind: 'waiting' });
          return;
        case 'ready':
          selfId.current = message.self.id;
          setSelf(message.self);
          setRoomTitle(message.room.title);
          setLobby(message.room.lobby);
          setPeers(message.peers);
          setKnocks(message.knocks);
          setPhase({ kind: 'inside' });
          sendMedia();
          // The newcomer makes the offers to everyone already inside.
          for (const peer of message.peers) void offer(peer.id).catch(() => undefined);
          return;
        case 'joined':
          setPeers((current) => [...current.filter((p) => p.id !== message.peer.id), message.peer]);
          tick();
          return;
        case 'left':
          closeLink(message.id);
          setPeers((current) => current.filter((p) => p.id !== message.id));
          return;
        case 'media':
          setPeers((current) =>
            current.map((p) =>
              p.id === message.id
                ? { ...p, audio: message.audio, video: message.video, screen: message.screen }
                : p,
            ),
          );
          return;
        case 'signal':
          void onSignal(message.from, message.data).catch(() => undefined);
          return;
        case 'knock':
          setKnocks((current) => [...current.filter((k) => k.id !== message.id), message]);
          tick();
          return;
        case 'knock-gone':
          setKnocks((current) => current.filter((k) => k.id !== message.id));
          return;
        case 'lobby':
          setLobby(message.on);
          return;
        case 'chat': {
          lineId.current += 1;
          const mine = message.from === selfId.current;
          setChat((lines) => [
            ...lines.slice(-199),
            { id: lineId.current, mine, name: message.name, text: message.text, at: message.at },
          ]);
          if (!mine && panelRef.current !== 'chat') {
            setUnread((count) => count + 1);
            tick();
          }
          return;
        }
        case 'declined':
        case 'removed':
        case 'ended':
        case 'full':
          finish(message.type);
          return;
        case 'error':
          if (message.code === 'rate-limited') setNotice(t('slowDown'));
          return;
        default:
          return;
      }
    },
    [closeLink, finish, offer, onSignal, sendMedia, t],
  );

  const join = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const trimmed = name.trim();
      if (trimmed.length < 2 || trimmed.length > 40) {
        setNameError(t('nameInvalid'));
        return;
      }
      setNameError(null);
      setNotice(null);
      setPhase({ kind: 'connecting' });
      const result = await getTicket(code, trimmed);
      if (!result.ok) {
        if (result.reason === 'not-found') {
          setPhase({ kind: 'over', reason: 'gone' });
          return;
        }
        setNotice(t(result.reason === 'rate-limited' ? 'slowDown' : 'joinError'));
        if (result.reason === 'name') setNameError(t('nameInvalid'));
        setPhase({ kind: 'setup' });
        return;
      }
      iceServers.current = result.iceServers;
      leaving.current = false;
      setChat([]);
      const ws = new WebSocket(wsUrl);
      socket.current = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'auth',
            ticket: result.ticket,
            audio: media.current.audio,
            video: media.current.video,
          }),
        );
      };
      ws.onmessage = (incoming) => {
        try {
          onMessage(JSON.parse(String(incoming.data)) as ServerMessage);
        } catch {
          // Ignore what can't be read.
        }
      };
      ws.onclose = (closed) => {
        if (socket.current !== ws) return;
        socket.current = null;
        if (leaving.current) return;
        finish(CLOSE_REASONS[closed.code] ?? 'lost');
      };
    },
    [code, finish, getTicket, name, onMessage, t, wsUrl],
  );

  // Leaving the page leaves the meeting and turns the camera off.
  useEffect(
    () => () => {
      leaving.current = true;
      socket.current?.close(1000);
      for (const link of links.current.values()) link.pc.close();
      for (const track of stream.current?.getTracks() ?? []) track.stop();
      screenTrack.current?.stop();
    },
    [],
  );

  const toggleMic = () => {
    const on = !micOn;
    for (const track of stream.current?.getAudioTracks() ?? []) track.enabled = on;
    setMicOn(on);
    media.current = { ...media.current, audio: on };
    sendMedia();
  };

  const toggleCam = () => {
    const on = !camOn;
    for (const track of stream.current?.getVideoTracks() ?? []) track.enabled = on;
    setCamOn(on);
    media.current = { ...media.current, video: on };
    sendMedia();
  };

  // Media state as the server should see it before joining.
  useEffect(() => {
    media.current = { audio: micOn && hasMic, video: camOn && hasCam, screen: sharing };
  }, [micOn, camOn, hasMic, hasCam, sharing]);

  const replaceVideo = useCallback(async (track: MediaStreamTrack | null) => {
    for (const link of links.current.values()) {
      const transceiver = link.pc
        .getTransceivers()
        .find((item) => item.receiver.track.kind === 'video');
      await transceiver?.sender.replaceTrack(track).catch(() => undefined);
    }
  }, []);

  const stopSharing = useCallback(async () => {
    const track = screenTrack.current;
    screenTrack.current = null;
    track?.stop();
    setSharing(false);
    media.current = { ...media.current, screen: false };
    await replaceVideo(stream.current?.getVideoTracks()[0] ?? null);
    setLocalStream(stream.current);
    sendMedia();
  }, [replaceVideo, sendMedia]);

  const startSharing = async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      screenTrack.current = track;
      track.onended = () => void stopSharing();
      await replaceVideo(track);
      setSharing(true);
      setLocalStream(new MediaStream([track]));
      media.current = { ...media.current, screen: true };
      sendMedia();
    } catch {
      // The person cancelled the browser's picker.
    }
  };

  const sendChat = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    send({ type: 'chat', text: text.slice(0, CHAT_MAX) });
    setDraft('');
  };

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2_000);
      })
      .catch(() => undefined);
  };

  const leave = () => {
    if (sharing) void stopSharing();
    finish('left');
  };

  const isOwner = self?.owner ?? false;
  const tileLabels = { muted: t('muted'), screen: t('sharingScreen'), you: t('you') };

  const controls = (
    <div className={styles.controls}>
      <Button
        variant={micOn ? 'outline' : 'danger'}
        size="sm"
        onClick={toggleMic}
        disabled={!hasMic}
        aria-pressed={!micOn}
      >
        {micOn ? t('mute') : t('unmute')}
      </Button>
      <Button
        variant={camOn ? 'outline' : 'danger'}
        size="sm"
        onClick={toggleCam}
        disabled={!hasCam}
        aria-pressed={!camOn}
      >
        {camOn ? t('cameraOff') : t('cameraOn')}
      </Button>
      {phase.kind === 'inside' && canShare ? (
        <Button
          variant={sharing ? 'ink' : 'outline'}
          size="sm"
          className={styles.shareButton}
          onClick={() => void (sharing ? stopSharing() : startSharing())}
        >
          {sharing ? t('stopSharing') : t('share')}
        </Button>
      ) : null}
    </div>
  );

  // --- Before joining, waiting room and the end -------------------------------------------

  if (phase.kind === 'over') {
    return (
      <section className={styles.panelBox}>
        <h1 className={styles.heading}>{t(`over.${phase.reason}.title`)}</h1>
        <p className={styles.muted}>{t(`over.${phase.reason}.body`)}</p>
        <div className={styles.row}>
          {phase.reason === 'left' || phase.reason === 'lost' ? (
            <Button onClick={() => setPhase({ kind: 'setup' })}>{t('rejoin')}</Button>
          ) : null}
          <Button href="/meetings" variant="outline">
            {t('backHome')}
          </Button>
        </div>
      </section>
    );
  }

  if (phase.kind !== 'inside') {
    return (
      <section className={styles.setup}>
        <div className={styles.preview}>
          <Tile
            stream={localStream}
            name={name.trim()}
            avatar={userAvatar}
            audio={micOn}
            video={camOn && hasCam}
            screen={false}
            mine
            labels={tileLabels}
          />
          {controls}
        </div>
        <div className={styles.join}>
          <p className={styles.eyebrow}>{t('hostedBy', { name: ownerName })}</p>
          <h1 className={styles.heading}>{roomTitle}</h1>
          {phase.kind === 'waiting' ? (
            <output className={styles.waitingBox}>
              <span className={styles.pulse} aria-hidden="true" />
              <div>
                <strong>{t('waitingTitle')}</strong>
                <p className={styles.muted}>{t('waitingBody')}</p>
              </div>
            </output>
          ) : (
            <form className={styles.joinForm} onSubmit={(event) => void join(event)} noValidate>
              {userName ? (
                <p className={styles.muted}>{t('joiningAs', { name: userName })}</p>
              ) : (
                <label className={styles.field}>
                  <span>{t('nameLabel')}</span>
                  <input
                    className={styles.input}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={40}
                    autoComplete="name"
                    required
                    aria-invalid={nameError ? true : undefined}
                  />
                  {nameError ? <span className={styles.error}>{nameError}</span> : null}
                </label>
              )}
              <Button type="submit" disabled={phase.kind === 'connecting'}>
                {phase.kind === 'connecting' ? t('joining') : t('join')}
              </Button>
              {userName ? null : (
                <p className={styles.small}>
                  {t('guestNote')}{' '}
                  <Link href={`/login?next=${encodeURIComponent(`/meetings/${code}`)}`}>
                    {t('signIn')}
                  </Link>
                </p>
              )}
            </form>
          )}
          {notice ? (
            <p className={styles.notice} role="alert">
              {notice}
            </p>
          ) : null}
          {phase.kind === 'waiting' ? (
            <Button variant="ghost" size="sm" onClick={leave}>
              {t('cancel')}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  // --- In the meeting -------------------------------------------------------------------------

  const everyone = peers.length + 1;
  return (
    <section className={styles.meeting} aria-label={roomTitle}>
      <header className={styles.bar}>
        <div>
          <h1 className={styles.meetingTitle}>{roomTitle}</h1>
          <p className={styles.small}>
            {t('people', { count: everyone })}
            {isOwner ? ` · ${lobby ? t('lobbyOn') : t('lobbyOff')}` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={copyLink}>
          {copied ? t('copied') : t('copyLink')}
        </Button>
      </header>

      {isOwner && knocks.length > 0 ? (
        <ul className={styles.knocks} aria-live="polite">
          {knocks.map((knock) => (
            <li key={knock.id} className={styles.knock}>
              <span>{t('knocking', { name: knock.name })}</span>
              <span className={styles.row}>
                <Button
                  size="sm"
                  onClick={() => send({ type: 'admit', id: knock.id, accept: true })}
                >
                  {t('admit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => send({ type: 'admit', id: knock.id, accept: false })}
                >
                  {t('decline')}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.stage} data-panel={panel ?? undefined}>
        <div className={styles.grid} data-count={Math.min(everyone, 6)}>
          <Tile
            stream={localStream}
            name={self?.name ?? name}
            avatar={self?.avatar ?? userAvatar}
            audio={micOn}
            video={camOn && hasCam}
            screen={sharing}
            mine
            labels={tileLabels}
          />
          {peers.map((peer) => (
            <Tile
              key={peer.id}
              stream={streams[peer.id] ?? null}
              name={peer.name}
              avatar={peer.avatar}
              audio={peer.audio}
              video={peer.video}
              screen={peer.screen}
              labels={tileLabels}
            />
          ))}
        </div>

        {panel === 'chat' ? (
          <aside className={styles.side} aria-label={t('chat')}>
            <div className={styles.messages}>
              {chat.length === 0 ? <p className={styles.small}>{t('chatEmpty')}</p> : null}
              {chat.map((line) => (
                <p key={line.id} className={line.mine ? styles.mine : styles.theirs}>
                  <strong>{line.mine ? t('you') : line.name}</strong> {line.text}
                </p>
              ))}
              <div ref={chatEnd} />
            </div>
            <form className={styles.chatForm} onSubmit={sendChat}>
              <input
                className={styles.input}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={CHAT_MAX}
                placeholder={t('chatPlaceholder')}
                aria-label={t('chatPlaceholder')}
              />
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                {t('send')}
              </Button>
            </form>
            <p className={styles.small}>{t('chatNotStored')}</p>
          </aside>
        ) : null}

        {panel === 'people' ? (
          <aside className={styles.side} aria-label={t('peopleTitle')}>
            <ul className={styles.peopleList}>
              <li>
                <span>
                  {self?.name} ({t('you')}){self?.owner ? ` · ${t('host')}` : ''}
                </span>
              </li>
              {peers.map((peer) => (
                <li key={peer.id}>
                  <span>
                    {peer.name}
                    {peer.owner ? ` · ${t('host')}` : peer.guest ? ` · ${t('guest')}` : ''}
                  </span>
                  {isOwner && !peer.owner ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => send({ type: 'remove', id: peer.id })}
                    >
                      {t('remove')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {isOwner ? (
              <div className={styles.ownerTools}>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={lobby}
                    onChange={(event) => send({ type: 'lobby', on: event.target.checked })}
                  />
                  <span>{t('lobbyToggle')}</span>
                </label>
                <p className={styles.small}>{t('lobbyHelp')}</p>
                <Button variant="danger" size="sm" onClick={() => send({ type: 'end' })}>
                  {t('endForAll')}
                </Button>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>

      <footer className={styles.dock}>
        {controls}
        <div className={styles.controls}>
          <Button
            variant={panel === 'chat' ? 'ink' : 'outline'}
            size="sm"
            onClick={() => {
              setPanel(panel === 'chat' ? null : 'chat');
              setUnread(0);
            }}
          >
            {t('chat')}
            {unread > 0 ? <span className={styles.badge}>{unread}</span> : null}
          </Button>
          <Button
            variant={panel === 'people' ? 'ink' : 'outline'}
            size="sm"
            onClick={() => setPanel(panel === 'people' ? null : 'people')}
          >
            {t('peopleTitle')}
            {isOwner && knocks.length > 0 ? (
              <span className={styles.badge}>{knocks.length}</span>
            ) : null}
          </Button>
          <Button variant="danger" size="sm" onClick={leave}>
            {t('leave')}
          </Button>
        </div>
      </footer>
      {notice ? <output className={styles.notice}>{notice}</output> : null}
    </section>
  );
}
