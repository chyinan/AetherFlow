#!/usr/bin/env bash
set -euo pipefail

app_user="${MYSQL_USER:?MYSQL_USER is required}"
app_password="${MYSQL_PASSWORD:?MYSQL_PASSWORD is required}"

escape_sql() {
  printf "%s" "$1" | sed "s/'/''/g"
}

escaped_user="$(escape_sql "$app_user")"
escaped_password="$(escape_sql "$app_password")"

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE USER IF NOT EXISTS '${escaped_user}'@'%' IDENTIFIED BY '${escaped_password}';
ALTER USER '${escaped_user}'@'%' IDENTIFIED BY '${escaped_password}';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, CREATE TEMPORARY TABLES, LOCK TABLES ON \`${MYSQL_DATABASE}\`.* TO '${escaped_user}'@'%';
FLUSH PRIVILEGES;
SQL
