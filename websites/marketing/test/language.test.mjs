import test from 'node:test';
import assert from 'node:assert/strict';
import {localeHref, translate, pageAlternates} from '../lib/i18n.ts';

test('language switching keeps the visitor on the corresponding page', () => {
  for (const [nl, en] of [['/', '/en'], ['/voorbeeld', '/en/example'], ['/intake', '/en/intake'], ['/privacy', '/en/privacy']]) {
    assert.equal(localeHref('en', nl), en);
    assert.equal(localeHref('nl', en), nl);
    assert.equal(localeHref('en', en), en);
    assert.equal(localeHref('nl', nl), nl);
  }
});

test('language navigation preserves section links and contact links', () => {
  assert.equal(localeHref('en', '/#aanpak'), '/en#aanpak');
  assert.equal(localeHref('nl', '/en#vragen'), '/#vragen');
  assert.equal(localeHref('en', 'mailto:info@eubatterypassport.nl'), 'mailto:info@eubatterypassport.nl');
  assert.deepEqual(pageAlternates('/en/example'), {canonical:'/en/example', languages:{nl:'/voorbeeld', en:'/en/example', 'x-default':'/voorbeeld'}});
});

test('translation preserves example and intake availability disclosures', () => {
  assert.equal(translate('en', 'Fictief voorbeeld'), 'Fictional example');
  assert.match(translate('en', 'U bekijkt fictieve voorbeeldgegevens. Dit paspoort is niet uitgegeven of geregistreerd.'), /not.*issued.*registered/i);
  assert.match(translate('en', 'Het formulier is op dit moment niet beschikbaar. Stuur uw vraag naar'), /unavailable|not.*available/i);
  assert.equal(translate('nl', 'Fictief voorbeeld'), 'Fictief voorbeeld');
  assert.equal(translate('en', 'DEMO-EBP-001'), 'DEMO-EBP-001');
});
