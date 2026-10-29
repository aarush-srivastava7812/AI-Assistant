"""Integration adapter tests reuse worker-owned fixtures and output contracts."""
from dataclasses import asdict
import json
import pytest
from wayfinder.platform.worker_bindings import SOURCE_ROLES,activation_ledger,definitions,instructions,validate_output
from wayfinder.workers.W01_intent_analyst.fixtures import SUCCESS_CLEAR_RESEARCH,CLARIFICATION_LOW_CONFIDENCE


def test_exact_inventory_and_no_implicit_effects():
    rows=activation_ledger(True)
    assert [r['id'] for r in rows]==[f'W{i:02}' for i in range(1,48)]
    assert len(definitions())==16
    assert all(not r['live_qualified'] for r in rows)
    assert not next(r for r in rows if r['id']=='W37')['available']
    assert not next(r for r in rows if r['id']=='W08')['available']
    assert not any(r['available'] for r in activation_ledger(False))


def test_legacy_accessors_use_the_same_47_role_runtime_projection():
    from wayfinder.platform.worker_activation_ledger import get_ledger,get_role,available_source_context_roles
    from wayfinder.platform.task_profiles import get_worker_activation
    assert get_ledger()==get_worker_activation()==activation_ledger(False)
    assert get_ledger(True)==activation_ledger(True)
    assert get_role('W43')['available'] is False
    assert get_role('W33')['available'] is False
    assert get_role('W36')['available'] is False
    assert available_source_context_roles()==[]
    snapshot=get_ledger(True);snapshot[0]['available']=False
    assert get_ledger(True)[0]['available'] is True

@pytest.mark.parametrize('role',sorted(SOURCE_ROLES))
def test_existing_definition_and_schema_are_reused(role):
    prompt=instructions(role)
    assert definitions()[role]['definition']['responsibility'].strip() in prompt
    assert 'Output schema:' in prompt and 'No tools' in prompt


def test_author_owned_intent_fixture_round_trips_and_clarification_is_conservative():
    raw=asdict(SUCCESS_CLEAR_RESEARCH);result=validate_output('W01',json.dumps(raw))
    assert result==json.loads(json.dumps(raw))
    raw=asdict(CLARIFICATION_LOW_CONFIDENCE);raw['requires_clarification']=False
    assert validate_output('W01',json.dumps(raw))['requires_clarification'] is True

@pytest.mark.parametrize('change',[{'approved':True},{'confidence':'0.9'},{'confidence':float('nan')},{'confidence':1.5},{'action_type':'execute_shell'},{'subject_entities':[42]}])
def test_authority_unknown_types_and_invalid_business_values_are_refused(change):
    raw={**asdict(SUCCESS_CLEAR_RESEARCH),**change}
    with pytest.raises((ValueError,AssertionError)):validate_output('W01',json.dumps(raw))


def test_tool_dependent_worker_and_nested_unknown_fields_are_refused():
    with pytest.raises(ValueError):instructions('W08')
    raw=dict(report_id='r',query='q',executive_summary='summary',key_findings=['finding'],sources=[dict(url='source:1',title='selected',excerpt='quote',approved=True)],confidence=.8)
    with pytest.raises(ValueError):validate_output('W07',json.dumps(raw))
