"""Unit tests for database environment configuration."""

from topix.config.config import PostgresConfig


def test_postgres_password_is_loaded_from_environment(monkeypatch):
    """Coolify's generated database password is included in the DSN."""
    monkeypatch.setenv("POSTGRES_PASSWORD", "generated-password")

    config = PostgresConfig()

    assert config.password is not None
    assert config.password.get_secret_value() == "generated-password"
    assert config.dsn() == "postgresql://topix:generated-password@localhost:5432/topix"
