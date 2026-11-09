import { avatarPath, initials } from '@/lib/avatar';
import styles from './Avatar.module.css';

type AvatarProps = {
  /** The profile photo's file name, if any. */
  file: string | null | undefined;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

/** A person's round profile photo, or their initials on fuchsia when they have none. */
export function Avatar({ file, name, size = 'md', className }: AvatarProps) {
  const src = avatarPath(file);
  const classes = `${styles.avatar} ${styles[size]} ${className ?? ''}`;
  return src ? (
    // oxlint-disable-next-line nextjs/no-img-element -- a 256 px WebP already: nothing to optimise
    <img src={src} alt="" className={classes} width={256} height={256} />
  ) : (
    <span className={classes} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
