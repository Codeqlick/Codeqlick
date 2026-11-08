'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { TranslatedText } from './TranslatedText';
import type { ChatTranslation } from './translate';
import { countryFlag } from '@/lib/videochat-options';
import room from './VideochatRoom.module.css';
import styles from './GroupCall.module.css';

/**
 * A group call between mutual contacts (architecture 4.7): up to four people, everyone connected
 * to everyone browser to browser (a mesh), over the video chat's own socket. The newcomer makes
 * an offer to each person already inside.
 */

export const GROUP_MAX = 4;

type IceServer = { urls: string[]; username?: string; credential?: string };
type SignalData =
  { sdp: { type: 'offer' | 'answer'; sdp: string } } | { candidate: RTCIceCandidateInit };

export type GroupProfile = {
  nickname: string | null;
  gender: 'WOMAN' | 'MAN' | 'NONBINARY' | null;
  country: string | null;
  language: string | null;
  interests?: string[];
};
export type GroupMember = { memberId: string; profile: GroupProfile };
export type GroupState = { groupId: string; self: string; members: GroupMember[] };
export type GroupContact = {
  contactId: string;
  nickname: string | null;
  status: 'free' | 'busy' | 'offline' | 'in-group' | 'invited';
};

/** What the room passes on from the socket while in a group. */
export type GroupEvent =
  | { type: 'group-joined'; member: GroupMember }
  | { type: 'group-left'; memberId: string }
  | { type: 'group-signal'; from: string; data: SignalData }
  | { type: 'group-chat'; from: string; text: string }
  | { type: 'group-contacts'; items: GroupContact[] };

interface Link {
  pc: RTCPeerConnection;
  pending: RTCIceCandidateInit[];
}

type Line = { id: number; from: string | 'me'; text: string; translated?: string };

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

export function GroupCall({
  group,
  send,
  subscribe,
  stream,
  iceServers,
  translation,
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  onLeave,
  mirror,
}: {
  group: GroupState;
  send: (message: object) => void;
  /** Group messages from the socket; returns the unsubscribe. */
  subscribe: (handler: (event: GroupEvent) => void) => () => void;
  stream: MediaStream | null;
  iceServers: IceServer[];
  translation: ChatTranslation;
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
  mirror: boolean;
}) {
  const t = useTranslations('Videochat.group');
  const tr = useTranslations('Videochat.room');
  const [members, setMembers] = useState<GroupMember[]>(group.members);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [contacts, setContacts] = useState<GroupContact[] | null>(null);
  const [reporting, setReporting] = useState<GroupMember | null>(null);
  const links = useRef(new Map<string, Link>());
  const lineId = useRef(0);
  const localVideo = useRef<HTMLVideoElement>(null);
  const reportDialog = useRef<HTMLDialogElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const membersRef = useRef(members);
  const translationRef = useRef(translation);
  useEffect(() => {
    membersRef.current = members;
    translationRef.current = translation;
  }, [members, translation]);

  useEffect(() => {
    if (localVideo.current && stream) localVideo.current.srcObject = stream;
  }, [stream]);

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

  const createLink = useCallback(
    (id: string, initiator: boolean): Link => {
      closeLink(id);
      const pc = new RTCPeerConnection({ iceServers });
      const link: Link = { pc, pending: [] };
      links.current.set(id, link);
      if (initiator && stream) {
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
      }
      pc.ontrack = (event) => {
        const remote = event.streams[0] ?? new MediaStream([event.track]);
        setStreams((current) => ({ ...current, [id]: remote }));
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ type: 'group-signal', to: id, data: { candidate: event.candidate.toJSON() } });
        }
      };
      pc.onconnectionstatechange = () => {
        // Whoever made the offer tries again over a fresh path (a relay, a new network).
        if (pc.connectionState === 'failed' && initiator) {
          void pc
            .createOffer({ iceRestart: true })
            .then(async (offer) => {
              await pc.setLocalDescription(offer);
              send({
                type: 'group-signal',
                to: id,
                data: { sdp: { type: 'offer', sdp: offer.sdp ?? '' } },
              });
            })
            .catch(() => undefined);
        }
      };
      return link;
    },
    [closeLink, iceServers, send, stream],
  );

  const onSignal = useCallback(
    async (from: string, data: SignalData) => {
      let link = links.current.get(from);
      if ('sdp' in data) {
        if (data.sdp.type === 'offer') {
          const fresh = !link;
          link ??= createLink(from, false);
          await link.pc.setRemoteDescription(data.sdp);
          if (fresh && stream) {
            for (const track of stream.getTracks()) link.pc.addTrack(track, stream);
          }
          const answer = await link.pc.createAnswer();
          await link.pc.setLocalDescription(answer);
          send({
            type: 'group-signal',
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
    [createLink, send, stream],
  );

  // On arrival, an offer to each person already inside.
  const offered = useRef(false);
  useEffect(() => {
    if (offered.current) return;
    offered.current = true;
    for (const member of group.members) {
      const link = createLink(member.memberId, true);
      void link.pc
        .createOffer()
        .then(async (offer) => {
          await link.pc.setLocalDescription(offer);
          send({
            type: 'group-signal',
            to: member.memberId,
            data: { sdp: { type: 'offer', sdp: offer.sdp ?? '' } },
          });
        })
        .catch(() => undefined);
    }
  }, [createLink, group.members, send]);

  const addLine = useCallback((from: string, text: string) => {
    lineId.current += 1;
    const id = lineId.current;
    setLines((current) => [...current.slice(-199), { id, from, text }]);
    const translator = translationRef.current;
    if (from !== 'me' && translator.on) {
      void translator.translate(text).then((translated) => {
        if (translated)
          setLines((current) =>
            current.map((line) => (line.id === id ? { ...line, translated } : line)),
          );
      });
    }
  }, []);

  useEffect(
    () =>
      subscribe((event) => {
        switch (event.type) {
          case 'group-joined':
            setMembers((current) => [
              ...current.filter((member) => member.memberId !== event.member.memberId),
              event.member,
            ]);
            return;
          case 'group-left':
            closeLink(event.memberId);
            setMembers((current) => current.filter((member) => member.memberId !== event.memberId));
            return;
          case 'group-signal':
            void onSignal(event.from, event.data).catch(() => undefined);
            return;
          case 'group-chat':
            addLine(event.from, event.text);
            return;
          case 'group-contacts':
            setContacts(event.items);
            return;
        }
      }),
    [addLine, closeLink, onSignal, subscribe],
  );

  // Leaving the group (or the page) closes every connection.
  useEffect(
    () => () => {
      for (const link of links.current.values()) link.pc.close();
      links.current.clear();
    },
    [],
  );

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [lines]);

  const sendChat = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim().slice(0, CHAT_MAX);
    if (!text) return;
    send({ type: 'group-chat', text });
    addLine('me', text);
    setDraft('');
  };

  const openInvite = () => {
    setContacts([]);
    send({ type: 'group-contacts' });
  };

  const invite = (contactId: string) => {
    send({ type: 'group-invite', contactId });
    setContacts((current) =>
      current
        ? current.map((contact) =>
            contact.contactId === contactId ? { ...contact, status: 'invited' } : contact,
          )
        : current,
    );
  };

  const openReport = (member: GroupMember) => {
    setReporting(member);
    reportDialog.current?.showModal();
  };

  const sendReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reporting) return;
    const form = new FormData(event.currentTarget);
    const details = String(form.get('details') ?? '').trim();
    send({
      type: 'group-report',
      memberId: reporting.memberId,
      reason: String(form.get('reason')),
      ...(details ? { details: details.slice(0, 1000) } : {}),
    });
    reportDialog.current?.close();
    event.currentTarget.reset();
  };

  const nameOf = (memberId: string) =>
    members.find((member) => member.memberId === memberId)?.profile.nickname ?? tr('stranger');
  const full = members.length + 1 >= GROUP_MAX;

  return (
    <>
      <div className={room.stage}>
        <p className={styles.header}>
          {t('title')} · {t('count', { count: members.length + 1, max: GROUP_MAX })}
        </p>
        <ul className={styles.grid} data-count={members.length + 1}>
          <li className={styles.tile}>
            {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- own camera, muted */}
            <video
              ref={localVideo}
              autoPlay
              playsInline
              muted
              className={mirror ? `${room.video} ${room.mirror}` : room.video}
            />
            <span className={room.tag}>{tr('you')}</span>
          </li>
          {members.map((member) => (
            <li key={member.memberId} className={styles.tile}>
              <RemoteVideo stream={streams[member.memberId]} />
              {!streams[member.memberId] ? (
                <span className={styles.connecting}>{tr('connecting')}</span>
              ) : null}
              <span className={room.tag}>
                {member.profile.nickname ?? tr('stranger')}
                {member.profile.country ? ` ${countryFlag(member.profile.country)}` : ''}
              </span>
              <div className={styles.tileActions}>
                <button
                  type="button"
                  className={styles.tileButton}
                  onClick={() => send({ type: 'group-block', memberId: member.memberId })}
                >
                  {tr('block')}
                </button>
                <button
                  type="button"
                  className={styles.tileButton}
                  onClick={() => openReport(member)}
                >
                  {tr('report')}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {members.length === 0 ? <p className={styles.alone}>{t('alone')}</p> : null}
      </div>

      <div className={room.controls}>
        <button type="button" className={room.primary} onClick={openInvite} disabled={full}>
          {full ? t('full') : t('invite')}
        </button>
        <button
          type="button"
          className={room.secondary}
          onClick={onToggleMic}
          aria-pressed={!micOn}
        >
          {micOn ? tr('mute') : tr('unmute')}
        </button>
        <button
          type="button"
          className={room.secondary}
          onClick={onToggleCam}
          aria-pressed={!camOn}
        >
          {camOn ? tr('cameraOff') : tr('cameraOn')}
        </button>
        <span className={room.spacer} />
        <button type="button" className={room.danger} onClick={onLeave}>
          {t('leave')}
        </button>
      </div>

      {contacts !== null ? (
        <section className={styles.invite} aria-label={t('invite')}>
          <div className={styles.inviteHead}>
            <h2 className={styles.inviteTitle}>{t('inviteTitle')}</h2>
            <button type="button" className={room.secondary} onClick={() => setContacts(null)}>
              {t('close')}
            </button>
          </div>
          {contacts.length === 0 ? <p>{t('noContacts')}</p> : null}
          <ul className={styles.inviteList}>
            {contacts.map((contact) => (
              <li key={contact.contactId} className={styles.inviteRow}>
                <span>{contact.nickname ?? tr('stranger')}</span>
                {contact.status === 'free' ? (
                  <button
                    type="button"
                    className={room.primary}
                    onClick={() => invite(contact.contactId)}
                    disabled={full}
                  >
                    {t('inviteOne')}
                  </button>
                ) : (
                  <span className={styles.inviteStatus}>{t(`status.${contact.status}`)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={room.chat} aria-label={tr('chatLabel')}>
        <div className={room.chatLog} aria-live="polite">
          {lines.length === 0 ? <p className={room.chatEmpty}>{t('chatEmpty')}</p> : null}
          {lines.map((line) => (
            <p key={line.id} className={line.from === 'me' ? room.lineMe : room.lineThem}>
              <span className={room.lineWho}>
                {line.from === 'me' ? tr('chatMe') : nameOf(line.from)}
              </span>
              <TranslatedText text={line.text} translated={line.translated} />
            </p>
          ))}
          <div ref={chatEnd} />
        </div>
        {translation.supported ? (
          <fieldset className={room.reactions}>
            <legend className="visually-hidden">{tr('translate')}</legend>
            <label className={room.sounds}>
              <input
                type="checkbox"
                checked={translation.on}
                onChange={(event) => translation.setOn(event.target.checked)}
              />
              {tr('translate')}
            </label>
          </fieldset>
        ) : null}
        <form className={room.chatForm} onSubmit={sendChat}>
          <label className="visually-hidden" htmlFor="videochat-group-message">
            {tr('chatPlaceholder')}
          </label>
          <input
            id="videochat-group-message"
            className={room.chatInput}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={CHAT_MAX}
            placeholder={tr('chatPlaceholder')}
            autoComplete="off"
          />
          <button type="submit" className={room.secondary} disabled={!draft.trim()}>
            {tr('chatSend')}
          </button>
        </form>
      </section>

      <dialog
        ref={reportDialog}
        className={room.dialog}
        aria-labelledby="videochat-group-report-title"
        onClose={() => setReporting(null)}
      >
        <form onSubmit={sendReport} className={room.dialogForm}>
          <h2 id="videochat-group-report-title" className={room.dialogTitle}>
            {t('reportTitle', { name: reporting?.profile.nickname ?? tr('stranger') })}
          </h2>
          <p>{t('reportLead')}</p>
          <label className={room.label} htmlFor="videochat-group-report-reason">
            {tr('reportReason')}
          </label>
          <select id="videochat-group-report-reason" name="reason" className={room.select} required>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {tr(`reasons.${reason}`)}
              </option>
            ))}
          </select>
          <label className={room.label} htmlFor="videochat-group-report-details">
            {tr('reportDetails')}
          </label>
          <textarea
            id="videochat-group-report-details"
            name="details"
            maxLength={1000}
            rows={3}
            className={room.select}
          />
          <div className={room.dialogActions}>
            <button
              type="button"
              className={room.secondary}
              onClick={() => reportDialog.current?.close()}
            >
              {tr('reportCancel')}
            </button>
            <button type="submit" className={room.danger}>
              {tr('reportSend')}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function RemoteVideo({ stream }: { stream: MediaStream | undefined }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream ?? null;
  }, [stream]);
  // oxlint-disable-next-line jsx-a11y/media-has-caption -- a live call: no captions exist
  return <video ref={video} autoPlay playsInline className={room.video} />;
}
