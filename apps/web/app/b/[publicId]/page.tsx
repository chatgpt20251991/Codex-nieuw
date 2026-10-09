import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { displayPublicValue, loadPublicPassport } from '../../../lib/public-passport';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Battery passport | EUBatteryPassport.nl',
  description: 'Public battery information and the published data snapshot.' };

export default async function PublicPassportPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const result = await loadPublicPassport(publicId);
  if (result.status === 'not_found') notFound();
  if (result.status !== 'ok') return <main className="portal publicPassport">
    <div className="portalBrand"><div className="logoMark">EU</div><div><strong>EUBatteryPassport.nl</strong><span>Public battery information</span></div></div>
    <section className="portalCard"><h1>Passport temporarily unavailable</h1><p className="mutedText">The public data could not be retrieved. Please try again later.</p></section>
  </main>;
  const { passport } = result;
  return <main className="portal publicPassport">
    <div className="portalBrand"><div className="logoMark">EU</div><div><strong>EUBatteryPassport.nl</strong><span>Public battery information</span></div></div>
    <section className="portalIntro"><div className="kicker">BATTERY PASSPORT</div><h1>{passport.battery.modelIdentifier}</h1>
      <p>Serial number: {passport.battery.serial}</p>
      {passport.battery.batch && <p>Batch: {passport.battery.batch}</p>}
    </section>
    <section className="portalCard"><h2>Public battery data</h2><p className="mutedText">This view contains the public fields of the published snapshot. Restricted information requires separate authorised access.</p>
      <div className="tableWrap"><table><caption className="mutedText">Data for this battery</caption><thead><tr><th scope="col">Data point</th><th scope="col">Value</th></tr></thead>
        <tbody>{passport.values.map(field => <tr key={field.fieldId}><th scope="row">{field.name}</th><td>{displayPublicValue(field.value)}{field.unit ? ` ${field.unit}` : ''}</td></tr>)}</tbody></table></div>
      <dl className="passportMetadata">
        <dt>Public identifier</dt><dd>{passport.battery.publicId}</dd>
        {passport.generatedAt && <><dt>Snapshot date</dt><dd><time dateTime={passport.generatedAt}>{new Date(passport.generatedAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}</time></dd></>}
        {passport.ruleSetVersion && <><dt>Data rule set</dt><dd>{passport.ruleSetVersion}</dd></>}
      </dl>
    </section>
  </main>;
}
