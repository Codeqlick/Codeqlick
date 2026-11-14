import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect } from '@/components/app/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getCloudMe, getCloudTeam, listCloudMembers } from '@/lib/api/cloud';
import { isApiError } from '@/lib/api/errors';
import { formatWhen } from '@/lib/cloud';
import {
  inviteAction,
  removeMemberAction,
  revokeInviteAction,
  setRoleAction,
  setTeamTwoFactorAction,
} from '../../../actions';
import styles from '../../../cloud.module.css';

type PageProps = { params: Promise<{ locale: string; team: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Cloud.members' });
  return { title: t('title') };
}

async function load(team: string) {
  try {
    return await Promise.all([getCloudTeam(team), listCloudMembers(team), getCloudMe()]);
  } catch (error) {
    if (isApiError(error) && error.status === 404) notFound();
    throw error;
  }
}

/** A team's members and invitations; admins invite and change roles, owners manage owners. */
export default async function CloudMembersPage({ params }: PageProps) {
  const { locale: raw, team: slug } = await params;
  const locale = resolveLocale(raw);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Cloud' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const [team, members, me] = await load(slug);
  const admin = team.role !== 'MEMBER';
  const roles = (['OWNER', 'ADMIN', 'MEMBER'] as const).filter(
    (role) => role !== 'OWNER' || team.role === 'OWNER',
  );
  const ownTwoFactor = members.items.find((member) => member.userId === me.user.id)?.twoFactor;

  return (
    <div className={styles.landing}>
      <div>
        <p className={styles.small}>
          <Link href={`/cloud/console/${team.slug}`}>← {team.name}</Link>
        </p>
        <h1 className={styles.heroTitle}>{t('members.title')}</h1>
      </div>

      <ul className={styles.list}>
        {members.items.map((member) => {
          const self = member.userId === me.user.id;
          const canManage = admin && (member.role !== 'OWNER' || team.role === 'OWNER');
          return (
            <li key={member.userId} className={styles.row}>
              <div className={styles.rowMain}>
                <p className={styles.rowTitle}>
                  {member.name}
                  {self ? <span className={styles.small}>({t('members.you')})</span> : null}
                  <Badge tone={member.role === 'OWNER' ? 'brand' : 'neutral'}>
                    {t(`common.roles.${member.role}`)}
                  </Badge>
                </p>
                <p className={styles.small}>{member.email}</p>
                <p className={styles.small}>
                  {member.twoFactor ? t('twoFactor.memberOn') : t('twoFactor.memberOff')}
                </p>
              </div>
              <div className={styles.actions}>
                {canManage && !self ? (
                  <form action={setRoleAction} className={styles.actions}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="team" value={team.slug} />
                    <input type="hidden" name="userId" value={member.userId} />
                    <label className="visually-hidden" htmlFor={`role-${member.userId}`}>
                      {t('members.role')}
                    </label>
                    <select
                      id={`role-${member.userId}`}
                      name="role"
                      defaultValue={member.role}
                      className={styles.select}
                    >
                      {roles.map((role) => (
                        <option key={role} value={role}>
                          {t(`common.roles.${role}`)}
                        </option>
                      ))}
                    </select>
                    <SubmitButton size="sm" variant="outline">
                      {t('members.changeRole')}
                    </SubmitButton>
                  </form>
                ) : null}
                {self || canManage ? (
                  <form action={removeMemberAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="team" value={team.slug} />
                    <input type="hidden" name="userId" value={member.userId} />
                    {self ? <input type="hidden" name="self" value="on" /> : null}
                    <SubmitButton size="sm" variant="ghost">
                      {self ? t('members.leave') : t('members.remove')}
                      <span className="visually-hidden"> — {member.name}</span>
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="two-factor-title">
        <h2 id="two-factor-title" className={styles.cardTitle}>
          {t('twoFactor.title')}
        </h2>
        <p className={styles.muted}>
          {team.requireTwoFactor ? t('twoFactor.required') : t('twoFactor.notRequired')}
        </p>
        {team.role === 'OWNER' ? (
          <>
            {!team.requireTwoFactor && ownTwoFactor === false ? (
              <p className={styles.small}>
                {t('twoFactor.ownHint')}{' '}
                <Link href="/portal/account">{t('twoFactor.accountLink')}</Link>
              </p>
            ) : null}
            <ActionForm
              action={setTeamTwoFactorAction.bind(null, locale, team.slug, !team.requireTwoFactor)}
              className={styles.form}
            >
              <div className={styles.actions}>
                <SubmitButton
                  variant={team.requireTwoFactor ? 'outline' : 'primary'}
                  pendingLabel={tc('saving')}
                >
                  {team.requireTwoFactor ? t('twoFactor.turnOff') : t('twoFactor.turnOn')}
                </SubmitButton>
              </div>
            </ActionForm>
          </>
        ) : null}
      </section>

      {members.invites.length > 0 ? (
        <section aria-labelledby="pending-title">
          <h2 id="pending-title" className={styles.sectionTitle}>
            {t('members.pending')}
          </h2>
          <ul className={styles.list}>
            {members.invites.map((invite) => (
              <li key={invite.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.rowTitle}>
                    {invite.email} <Badge>{t(`common.roles.${invite.role}`)}</Badge>
                  </p>
                  <p className={styles.small}>
                    {t('members.expires', { when: formatWhen(invite.expiresAt, locale) })}
                  </p>
                </div>
                {admin ? (
                  <form action={revokeInviteAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="team" value={team.slug} />
                    <input type="hidden" name="id" value={invite.id} />
                    <SubmitButton size="sm" variant="ghost">
                      {t('members.revoke')}
                      <span className="visually-hidden"> — {invite.email}</span>
                    </SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {admin ? (
        <section className={`${styles.card} ${styles.narrow}`} aria-labelledby="invite-title">
          <h2 id="invite-title" className={styles.cardTitle}>
            {t('members.invite')}
          </h2>
          <ActionForm action={inviteAction.bind(null, locale, team.slug)} className={styles.form}>
            <FormInput
              name="email"
              type="email"
              label={t('members.email')}
              required
              autoComplete="off"
            />
            <FormSelect
              name="role"
              label={t('members.role')}
              defaultValue="MEMBER"
              options={[
                { value: 'MEMBER', label: t('common.roles.MEMBER') },
                { value: 'ADMIN', label: t('common.roles.ADMIN') },
              ]}
            />
            <div className={styles.actions}>
              <SubmitButton pendingLabel={t('members.sending')}>{t('members.send')}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
