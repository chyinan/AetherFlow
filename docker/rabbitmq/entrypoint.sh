#!/usr/bin/env sh
set -eu

/usr/local/bin/docker-entrypoint.sh rabbitmq-server &
broker_pid=$!
trap 'kill "$broker_pid" 2>/dev/null || true; wait "$broker_pid" 2>/dev/null || true' TERM INT

until rabbitmqctl await_startup >/dev/null 2>&1; do
  if ! kill -0 "$broker_pid" 2>/dev/null; then
    wait "$broker_pid"
    exit $?
  fi
  sleep 2
done

# `list_users --formatter json` is not stable across RabbitMQ versions and may
# include whitespace or use a different field name.  The old exact grep caused
# an existing user to be treated as missing; `add_user` then exited the
# entrypoint with code 2 and Docker restarted the broker in a tight loop.
if ! rabbitmqctl list_users --no-table-headers 2>/dev/null \
    | awk -v expected_user="${RABBITMQ_DEFAULT_USER}" '$1 == expected_user { found = 1 } END { exit found ? 0 : 1 }'; then
  rabbitmqctl add_user "${RABBITMQ_DEFAULT_USER}" "${RABBITMQ_DEFAULT_PASS}"
fi
rabbitmqctl set_user_tags "${RABBITMQ_DEFAULT_USER}" management
rabbitmqctl set_permissions -p "${RABBITMQ_DEFAULT_VHOST:-/}" "${RABBITMQ_DEFAULT_USER}" ".*" ".*" ".*"

wait "$broker_pid"
