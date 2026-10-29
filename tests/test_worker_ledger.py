"""Tests for worker activation ledger - no Docker required."""
import pytest
from wayfinder.platform.worker_activation_ledger import (
    get_ledger, get_role, available_source_context_roles, available_trusted_services
)

def test_ledger_covers_all_defined_roles():
    ledger = get_ledger()
    ids = {e["id"] for e in ledger}
    assert ids == {f'W{i:02}' for i in range(1,48)}
    for wid in ["W01","W03","W06","W07","W09","W10","W12","W13","W14","W15","W16","W18","W19","W24"]:
        assert wid in ids, f"{wid} missing from ledger"

def test_source_context_workers_all_available():
    assert available_source_context_roles() == []  # No runtime evidence by default.
    roles = available_source_context_roles(compatible=True)
    expected = ["W01","W03","W06","W07","W09","W10","W12","W13","W14","W15","W16","W18","W19","W24"]
    for wid in expected:
        assert wid in roles, f"{wid} should be available source_context"

def test_tool_requiring_workers_unavailable():
    for wid in ["W08","W11"]:
        role = get_role(wid)
        assert role is not None
        assert role["available"] is False
        assert role["mode"] == "unqualified"

def test_w37_stays_disconnected():
    role = get_role("W37")
    assert role is not None
    assert role["available"] is False
    assert role["binding"] is None and role['live_qualified'] is False

def test_trusted_service_mapping_does_not_infer_permission_or_live_qualification():
    assert available_trusted_services() == []
    for wid in ["W02","W04","W05","W25","W34","W38"]:
        role=get_role(wid)
        assert role['mode']=='trusted_service' and role['binding']
        assert not role['available'] and not role['live_qualified']

def test_unmapped_roles_documented_unavailable():
    for wid in ["W17","W20","W21","W22","W23","W27","W28","W39","W40","W45"]:
        role = get_role(wid)
        assert role is not None
        assert role["available"] is False

def test_get_role_returns_none_for_unknown():
    assert get_role("W99") is None

def test_all_entries_have_required_fields():
    for entry in get_ledger():
        for field in ["id","binding","mode","available","reason","live_qualified"]:
            assert field in entry, f"{entry['id']} missing field {field}"

def test_ledger_has_at_least_40_roles():
    assert len(get_ledger()) >= 40
