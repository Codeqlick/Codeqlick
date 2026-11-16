'use client';

import { Checkbox } from '@/components/ui/Field';
import { withMention } from '@/lib/cloud';
import styles from '../../../cloud.module.css';

/**
 * The reply box's `@` picker: the team's members as checkboxes (`mentions`, their user ids); ticking
 * one also adds `@Name` to the reply (`textareaId`), as the comments page does.
 */
export function MentionPicker({
  members,
  textareaId,
  legend,
}: {
  members: { id: string; name: string }[];
  textareaId: string;
  legend: string;
}) {
  if (members.length === 0) return null;
  return (
    <details>
      <summary className={styles.small}>@ {legend}</summary>
      <fieldset className={styles.fieldset}>
        <legend className="visually-hidden">{legend}</legend>
        {members.map((member) => (
          <Checkbox
            key={member.id}
            id={`${textareaId}-mention-${member.id}`}
            name="mentions"
            value={member.id}
            label={member.name}
            onChange={(event) => {
              if (!event.currentTarget.checked) return;
              const box = document.getElementById(textareaId);
              if (box instanceof HTMLTextAreaElement)
                box.value = withMention(box.value, member.name);
            }}
          />
        ))}
      </fieldset>
    </details>
  );
}
