"""Compatibility accessors over the canonical, runtime-dependent worker ledger."""
from wayfinder.platform.worker_bindings import activation_ledger


def get_ledger(compatible=False):
    return activation_ledger(compatible)


def get_role(worker_id, compatible=False):
    return next((row for row in get_ledger(compatible) if row['id'] == worker_id), None)


def available_source_context_roles(compatible=False):
    return [row['id'] for row in get_ledger(compatible)
            if row['mode'] == 'supplied_context' and row['available']]


def available_trusted_services():
    # A service mapping alone cannot establish permission or availability.
    return []
