#!/usr/bin/env python3
"""Reject duplicate Flyway SQL migration versions within each configured location."""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path


MIGRATION_NAME = re.compile(r"^V(?P<version>[^/]+)__(?P<description>.+)\.sql$")
VALID_VERSION = re.compile(r"^[0-9]+(?:[._][0-9]+)*$")


def normalize_version(version: str) -> tuple[int, ...]:
    """Match Flyway MigrationVersion equality for numeric dotted/underscored versions."""
    if not VALID_VERSION.fullmatch(version):
        raise ValueError(f"invalid Flyway version {version!r}; expected numeric dot/underscore parts")

    parts = [int(part) for part in version.replace("_", ".").split(".")]
    while len(parts) > 1 and parts[-1] == 0:
        parts.pop()
    return tuple(parts)


def check_location(location: Path) -> tuple[int, list[str]]:
    """Return the number of versioned SQL migrations and any location-local errors."""
    versions: dict[tuple[int, ...], list[str]] = defaultdict(list)
    errors: list[str] = []
    migration_count = 0

    for path in sorted(location.iterdir()):
        if not path.is_file() or not path.name.startswith("V") or not path.name.endswith(".sql"):
            continue

        match = MIGRATION_NAME.fullmatch(path.name)
        if not match:
            # Leave unrelated files alone, but fail closed on an apparent versioned migration.
            if "__" in path.name:
                errors.append(f"{path}: malformed versioned SQL migration name")
            continue

        migration_count += 1
        raw_version = match.group("version")
        try:
            normalized = normalize_version(raw_version)
        except ValueError as exc:
            errors.append(f"{path}: {exc}")
            continue
        versions[normalized].append(path.name)

    for normalized, filenames in sorted(versions.items()):
        if len(filenames) > 1:
            display_version = ".".join(str(part) for part in normalized)
            errors.append(
                f"{location}: duplicate Flyway version {display_version}: "
                + ", ".join(filenames)
            )

    return migration_count, errors


def discover_locations(root: Path) -> list[Path]:
    """Find each Flyway-style SQL location separately; versions may repeat across services."""
    candidates = [root / "docker/mysql/migrations"]
    for db_root in sorted((root / "backend").glob("**/src/main/resources/db")):
        migration_location = db_root / "migration"
        if migration_location.is_dir():
            candidates.append(migration_location)
        # Some services keep versioned SQL directly under db/ without a Flyway subdirectory.
        has_versioned_sql = any(
            path.is_file()
            and path.name.startswith("V")
            and "__" in path.name
            and path.suffix == ".sql"
            for path in db_root.iterdir()
        )
        if has_versioned_sql:
            candidates.append(db_root)
    return [path for path in candidates if path.is_dir()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)

    locations = discover_locations(args.root.resolve())
    if not locations:
        print(f"No configured Flyway migration locations found under {args.root}", file=sys.stderr)
        return 2

    errors: list[str] = []
    print("Checking Flyway SQL migration versions:")
    for location in locations:
        count, location_errors = check_location(location)
        relative = location.relative_to(args.root.resolve())
        print(f"- {relative}: {count} versioned SQL migration(s)")
        errors.extend(location_errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("Flyway migration versions are unique within each location")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
