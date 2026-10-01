/** Optional scoping answers travel in the existing bounded intake message.
 * No new database columns, recipients or delivery-worker protocol are needed.
 * These are customer declarations, never a legal applicability decision.
 */
export const scopeQuestions = [
  {name: "role", nl: "Uw rol", en: "Your role", options: [
    ["Fabrikant", "Manufacturer"], ["Importeur", "Importer"], ["Distributeur", "Distributor"], ["Systeemintegrator", "System integrator"], ["Andere rol", "Other role"],
  ]},
  {name: "finishedBattery", nl: "Wat levert u?", en: "What do you supply?", options: [
    ["Complete batterij", "Finished battery"], ["Cellen of modules", "Cells or modules"], ["Samengesteld batterijsysteem", "Assembled battery system"],
  ]},
  {name: "sharedBms", nl: "Delen de batterijpakketten één BMS?", en: "Do the battery packs share one BMS?", options: [
    ["Ja", "Yes"], ["Nee", "No"], ["Niet van toepassing", "Not applicable"],
  ]},
  {name: "updateMethod", nl: "Hoe zijn gebruiksgegevens beschikbaar?", en: "How is use data available?", options: [
    ["Handmatig", "Manually"], ["Tijdens onderhoud", "During servicing"], ["Via BMS of API", "Through BMS or API"],
  ]},
] as const;

export function composeIntakeMessage(form: FormData): string {
  const read = (key: string) => String(form.get(key) ?? "").trim();
  const invalid = () => { throw new Error("Controleer de aanvullende batterijgegevens."); };
  const message = read("message");
  if (message.length > 1500 || message.includes("\0")) invalid();
  const answers: string[] = [];
  for (const q of scopeQuestions) {
    const value = read(q.name);
    if (!value) continue;
    if (!q.options.some(option => option[0] === value)) invalid();
    answers.push(`${q.nl}: ${value}`);
  }
  for (const [key, label] of [["energy", "Energie complete batterij (kWh)"], ["models", "Aantal modellen"], ["units", "Aantal batterijen per jaar"]]) {
    const value = read(key);
    if (!value) continue;
    const valid = key === "energy" ? /^\d{1,8}([.,]\d{1,3})?$/.test(value) : /^[1-9]\d{0,8}$/.test(value);
    if (!valid || Number(value.replace(",", ".")) <= 0) invalid();
    answers.push(`${label}: ${value.replace(",", ".")}`);
  }
  const marketDate = read("marketDate");
  if (marketDate) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(marketDate)) invalid();
    answers.push(`Verwachte marktintroductie: ${marketDate}`);
  }
  const markets = read("markets");
  if (markets) {
    if (markets.length > 120 || /[\r\n\0]/.test(markets)) invalid();
    answers.push(`Landen van levering: ${markets}`);
  }
  const result = [message, answers.length ? `Aanvullende klantopgave (nog te beoordelen):\n${answers.join("\n")}` : ""].filter(Boolean).join("\n\n");
  if (result.length > 3000) invalid();
  return result;
}
