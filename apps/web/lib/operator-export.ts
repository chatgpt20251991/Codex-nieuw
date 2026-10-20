const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 8 * 1024 * 1024;

// Bind the private download to the opened battery. Full hash-chain and source
// verification remains the separate offline verifier; this is a transport check.
export function prepareOperatorExport(data: any, itemId: string) {
  const item = data?.payload?.item, coverage = data?.payload?.coverage;
  if (!UUID.test(itemId) || data?.schema !== 'eubp.operator-export.v1'
    || data?.payload?.classification !== 'private_operator_all_access_tiers'
    || !UUID.test(item?.id || '') || item.id.toLowerCase() !== itemId.toLowerCase()
    || coverage?.batteryItemId !== item.id || coverage?.sourceDocumentBytesIncluded !== false
    || coverage?.completeCustomerExitArchive !== false
    || !Array.isArray(data?.payload?.versions) || !data.payload.versions.length
    || data.payload.versions.length > 256 || coverage?.versionCount !== data.payload.versions.length
    || data?.integrity?.algorithm !== 'sha256'
    || data?.integrity?.canonicalization !== 'eubp.sorted-json.v1'
    || !/^[a-f0-9]{64}$/.test(data?.integrity?.payloadSha256 || '')) {
    throw new Error('The private export does not match this battery or the supported export format.');
  }
  // Match the API/offline manifest limit exactly; a trailing newline would
  // reject an otherwise valid export at the supported byte boundary.
  const content = JSON.stringify(data);
  if (new TextEncoder().encode(content).byteLength > MAX_BYTES) {
    throw new Error('This history needs a reviewed offline export because it exceeds the download limit.');
  }
  return { content, filename: `private-battery-passport-${item.id.toLowerCase()}.json`,
    payloadSha256: data.integrity.payloadSha256 as string };
}
