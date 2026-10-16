"""Offline service tests: no application startup, credentials, or database engine."""
import socket

import pytest


@pytest.fixture(autouse=True)
def prohibit_external_io(monkeypatch):
    def denied(*args, **kwargs):
        raise AssertionError("Offline tests must not open network connections or engines")

    monkeypatch.setattr(socket.socket, "connect", denied)
    monkeypatch.setattr(socket, "create_connection", denied)
    monkeypatch.setattr("sqlalchemy.create_engine", denied)
