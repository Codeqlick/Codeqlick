-- Owner's decision 2026-11-09: Videochat and Swipe show the account's unique username.
-- Accounts with an app nickname and no username get one made from it, when it follows the
-- username rules and nobody has it (the oldest account wins a tie). The rest choose one in
-- the app the next time they save their profile.
WITH candidates AS (
  SELECT u.id,
         u.created_at,
         lower(regexp_replace(regexp_replace(
           translate(coalesce(v.nickname, s.nickname),
                     'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ',
                     'aeiouaeiouaeiouaeiouncAEIOUAEIOUAEIOUAEIOUNC'),
           '[\s-]+', '_', 'g'), '[^A-Za-z0-9._]', '', 'g')) AS name
  FROM users u
  LEFT JOIN videochat_profiles v ON v.user_id = u.id
  LEFT JOIN swipe_profiles s ON s.user_id = u.id
  WHERE u.username IS NULL AND coalesce(v.nickname, s.nickname) IS NOT NULL
),
valid AS (
  SELECT c.id, c.name, row_number() OVER (PARTITION BY c.name ORDER BY c.created_at, c.id) AS rank
  FROM candidates c
  WHERE c.name ~ '^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$'
    AND position('..' IN c.name) = 0
    AND replace(replace(c.name, '.', ''), '_', '') NOT IN ('admin', 'administrator', 'codeqlick', 'support', 'soporte', 'help', 'ayuda', 'root', 'api', 'www', 'mail', 'email', 'security', 'seguridad', 'staff', 'team', 'equipo', 'system', 'sistema', 'moderator', 'moderador', 'official', 'oficial', 'hello', 'info', 'contact', 'contacto', 'videochat', 'swipe', 'meetings', 'citas', 'portal', 'blog', 'null', 'undefined', 'anonymous')
    AND NOT EXISTS (SELECT 1 FROM users taken WHERE taken.username = c.name)
)
UPDATE users SET username = valid.name FROM valid WHERE users.id = valid.id AND valid.rank = 1;

-- The apps' names follow the username (a hidden video chat name stays hidden).
UPDATE videochat_profiles v SET nickname = u.username
FROM users u WHERE v.user_id = u.id AND u.username IS NOT NULL AND v.nickname IS NOT NULL;

UPDATE swipe_profiles s SET nickname = u.username
FROM users u WHERE s.user_id = u.id AND u.username IS NOT NULL;
