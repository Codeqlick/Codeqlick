import { getTranslations } from 'next-intl/server';
import { ActionForm, FormInput, FormSelect } from '@/components/app/ActionForm';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AppLocale } from '@/i18n/routing';
import { getCloudMe } from '@/lib/api/cloud';
import { transferTargets } from '@/lib/cloud';
import { transferProjectAction } from '../../../actions';
import styles from '../../../cloud.module.css';

type Props = {
  locale: AppLocale;
  teamSlug: string;
  projectId: string;
  projectSlug: string;
};

/**
 * "Move to another team", for the team's owners (architecture 4.13, decision 58): the caller's
 * other teams they own or run, what moves and what changes, and the project's slug to confirm.
 */
export async function TransferProject(props: Props) {
  const t = await getTranslations({ locale: props.locale, namespace: 'Cloud' });
  const tc = await getTranslations({ locale: props.locale, namespace: 'Common' });
  const me = await getCloudMe().catch(() => null);
  const targets = me ? transferTargets(me.teams, props.teamSlug) : [];

  return (
    <section
      className={`${styles.card} ${styles.narrow} ${styles.danger}`}
      aria-labelledby="transfer-title"
    >
      <h2 id="transfer-title" className={styles.cardTitle}>
        {t('project.transfer.title')}
      </h2>
      <p className={styles.muted}>{t('project.transfer.lead')}</p>
      <ul className={styles.points}>
        <li>{t('project.transfer.git')}</li>
        <li>{t('project.transfer.tokens')}</li>
        <li>{t('project.transfer.config')}</li>
      </ul>
      {me === null ? (
        <p className={styles.muted}>{t('common.loadError')}</p>
      ) : targets.length === 0 ? (
        <p className={styles.muted}>{t('project.transfer.noTeams')}</p>
      ) : (
        <ActionForm
          action={transferProjectAction.bind(
            null,
            props.locale,
            props.teamSlug,
            props.projectId,
            props.projectSlug,
          )}
          className={styles.form}
        >
          <FormSelect
            name="team"
            label={t('project.transfer.team')}
            defaultValue=""
            required
            placeholder={t('project.transfer.chooseTeam')}
            options={targets.map((team) => ({
              value: team.slug,
              label: `${team.name} (${team.slug})`,
            }))}
          />
          <FormInput
            name="confirm"
            label={tc('confirmType', { text: props.projectSlug })}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <div className={styles.actions}>
            <SubmitButton variant="danger" pendingLabel={t('project.transfer.moving')}>
              {t('project.transfer.submit')}
            </SubmitButton>
          </div>
        </ActionForm>
      )}
    </section>
  );
}
