import json, pathlib, sys
root=pathlib.Path(__file__).resolve().parents[1]
d=json.loads((root/'packages/rules/src/data-points.json').read_text())
assert len(d['fields'])==71
assert [x['id'] for x in d['fields']]==list(range(1,72))
assert any(x['id']==50 and x['access_tier']=='authority_only' for x in d['fields'])
assert any(x['id']==17 and x['applicability_2027_02_18']['EV']=='deferred_format_pending' for x in d['fields'])
print('PASS: 71 fields, sequential IDs, restricted authority field and deferred logic present')
