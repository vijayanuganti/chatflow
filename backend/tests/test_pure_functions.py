"""Pure-function tests (no DB required)."""


def test_normalize_language(app_module):
    assert app_module.normalize_language("hi") == "hi"
    assert app_module.normalize_language("te") == "te"
    assert app_module.normalize_language("fr") == "en"
    assert app_module.normalize_language(None) == "en"


def test_pack_storage_used_free(app_module):
    pack = app_module._pack_storage_used_free
    empty = pack(None, 1000)
    assert empty["percent_used"] is None
    half = pack(256 * 1024 * 1024, 512 * 1024 * 1024)
    assert half["percent_used"] == 50.0
    assert half["free_bytes"] == 256 * 1024 * 1024
    full = pack(600, 500)
    assert full["percent_used"] == 100.0


def test_direct_conv_id(app_module):
    cid = app_module.direct_conv_id("b", "a")
    assert cid == "direct_a_b"
