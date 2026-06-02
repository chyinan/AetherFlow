SET @missing_user_email_column = (
    SELECT COUNT(1) = 0
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'af_user'
      AND column_name = 'email'
);

SET @add_user_email_column = IF(
    @missing_user_email_column,
    'ALTER TABLE af_user ADD COLUMN email VARCHAR(255) NULL AFTER username',
    'SELECT 1'
);

PREPARE add_user_email_column_stmt FROM @add_user_email_column;
EXECUTE add_user_email_column_stmt;
DEALLOCATE PREPARE add_user_email_column_stmt;

UPDATE af_user
SET email = CONCAT(REPLACE(username, '@', '.'), '@aetherflow.local')
WHERE email IS NULL OR TRIM(email) = '';

UPDATE af_user
SET email = LOWER(TRIM(email))
WHERE email <> LOWER(TRIM(email));

ALTER TABLE af_user
    MODIFY email VARCHAR(255) NOT NULL;

SET @missing_user_email_key = (
    SELECT COUNT(1) = 0
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'af_user'
      AND index_name = 'uk_af_user_email'
);

SET @add_user_email_key = IF(
    @missing_user_email_key,
    'ALTER TABLE af_user ADD UNIQUE KEY uk_af_user_email (email)',
    'SELECT 1'
);

PREPARE add_user_email_key_stmt FROM @add_user_email_key;
EXECUTE add_user_email_key_stmt;
DEALLOCATE PREPARE add_user_email_key_stmt;
