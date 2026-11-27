import type { AuthUser } from '../../common/types/auth-user.js';
import type { User } from '../../generated/prisma/client.js';

/** The signed-in person as the API describes them, from their account row. */
export function toAuthUser(
  user: Pick<User, 'id' | 'email' | 'name' | 'role'> & {
    memberOfId?: string | null;
    username?: string | null;
    avatarKey?: string | null;
  },
): AuthUser {
  const base: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  if (user.username !== undefined) base.username = user.username;
  if (user.avatarKey !== undefined) base.avatar = user.avatarKey;
  // Clients act for a client account: their own, or their company's.
  return user.role === 'CLIENT' ? { ...base, accountId: user.memberOfId ?? user.id } : base;
}
