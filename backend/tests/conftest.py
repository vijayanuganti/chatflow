"""Pytest configuration — server import is slow (~60s) due to Mongo/Firebase init."""
import sys
from pathlib import Path

import pytest

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


@pytest.fixture(scope="session")
def app_module():
    import server as mod
    return mod


@pytest.fixture(scope="session")
def test_client(app_module):
    from starlette.testclient import TestClient
    return TestClient(app_module.app)
