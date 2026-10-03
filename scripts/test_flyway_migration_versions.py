import tempfile
import unittest
from pathlib import Path

from flyway_migration_versions import check_location, discover_locations, normalize_version


class FlywayMigrationVersionTests(unittest.TestCase):
    def test_normalizes_flyway_equivalent_versions(self):
        self.assertEqual(normalize_version("25"), normalize_version("025"))
        self.assertEqual(normalize_version("25"), normalize_version("25.0.000"))
        self.assertEqual(normalize_version("1_2"), normalize_version("01.002.0"))

    def test_detects_duplicate_normalized_versions_in_one_location(self):
        with tempfile.TemporaryDirectory() as directory:
            location = Path(directory)
            (location / "V25__add_workflow_instance_definition_snapshot.sql").touch()
            (location / "V25__add_workflow_notification_outbox_lease.sql").touch()

            count, errors = check_location(location)

        self.assertEqual(count, 2)
        self.assertEqual(len(errors), 1)
        self.assertIn("duplicate Flyway version 25", errors[0])

    def test_does_not_flag_distinct_versions_or_repeatable_sql(self):
        with tempfile.TemporaryDirectory() as directory:
            location = Path(directory)
            (location / "V25__first.sql").touch()
            (location / "V26__second.sql").touch()
            (location / "R__refresh_view.sql").touch()

            count, errors = check_location(location)

        self.assertEqual(count, 2)
        self.assertEqual(errors, [])

    def test_rejects_non_numeric_migration_filename_version(self):
        with tempfile.TemporaryDirectory() as directory:
            location = Path(directory)
            (location / "V25beta__invalid.sql").touch()

            count, errors = check_location(location)

        self.assertEqual(count, 1)
        self.assertEqual(len(errors), 1)
        self.assertIn("invalid Flyway version", errors[0])

    def test_rejects_non_numeric_version_parts(self):
        with self.assertRaises(ValueError):
            normalize_version("25beta")

    def test_discovers_service_locations_without_cross_location_collisions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docker = root / "docker/mysql/migrations"
            ai = root / "backend/ai-service/src/main/resources/db/migration"
            auth = root / "backend/auth-service/src/main/resources/db"
            for location in (docker, ai, auth):
                location.mkdir(parents=True)
            for location, filename in (
                (docker, "V25__docker.sql"),
                (ai, "V25__ai.sql"),
                (auth, "V25__auth.sql"),
            ):
                (location / filename).touch()

            locations = discover_locations(root)
            location_results = [check_location(location) for location in locations]

        self.assertEqual(len(locations), 3)
        self.assertTrue(all(errors == [] for _, errors in location_results))


if __name__ == "__main__":
    unittest.main()
