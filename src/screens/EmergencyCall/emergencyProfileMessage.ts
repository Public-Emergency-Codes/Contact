export const buildLocalProfileMessage = (localRaw: string | null, medicalRaw: string | null, user?: any): string | null => {
  // Pull each field defensively. Anything missing/empty/"Unknown" is dropped
  // so the final sentence only mentions data the user actually provided.
  let fullName = '';
  if (localRaw) {
    try {
      const local = JSON.parse(localRaw);
      const f = String(local?.firstName || '').trim();
      const l = String(local?.lastName || '').trim();
      fullName = `${f} ${l}`.trim();
    } catch {}
  }
  if (!fullName) {
    const af = String(user?.first_name || user?.firstName || '').trim();
    const al = String(user?.last_name || user?.lastName || '').trim();
    fullName = `${af} ${al}`.trim();
  }

  let weight = '', height = '', dob = '', blood = '', organDonor = false;
  let conditions = '', allergies = '', meds = '', address = '', notes = '';
  if (medicalRaw) {
    try {
      const m = JSON.parse(medicalRaw);
      weight = String(m?.weight || '').trim();
      height = String(m?.height || '').trim();
      dob = String(m?.dateOfBirth || '').trim();
      const b = String(m?.bloodType || '').trim();
      if (b && b !== 'Unknown') blood = b;
      organDonor = !!m?.organDonor;
      conditions = String(m?.medicalConditions || '').trim();
      allergies = String(m?.allergies || '').trim();
      meds = String(m?.medications || '').trim();
      address = String(m?.address || '').trim();
      notes = String(m?.psapNotes || '').trim();
    } catch {}
  }

  // Build the message as natural sentences from the caller's perspective.
  // Each clause is only emitted when the underlying field is present, so the
  // dispatcher never sees empty "Field: " labels or filler. Sentences are
  // grouped by topic (identity, medical history, additional notes) and joined
  // with periods so the message reads like an SMS the caller typed.
  const sentences: string[] = [];

  // Identity sentence: name + basic stats.
  const identityBits: string[] = [];
  if (fullName) identityBits.push(`my name is ${fullName}`);
  const statBits: string[] = [];
  if (dob) statBits.push(`my date of birth is ${dob}`);
  if (height) statBits.push(`I am ${height} tall`);
  if (weight) statBits.push(`I weigh ${weight}`);
  if (blood) statBits.push(`my blood type is ${blood}`);
  if (organDonor) statBits.push(`I am an organ donor`);
  if (statBits.length) identityBits.push(statBits.join(', '));
  if (identityBits.length) sentences.push(identityBits.join(', '));

  // Medical history sentence.
  const medicalBits: string[] = [];
  if (conditions) medicalBits.push(`my medical history includes ${conditions}`);
  if (allergies) medicalBits.push(`I am allergic to ${allergies}`);
  if (meds) medicalBits.push(`I take ${meds}`);
  if (medicalBits.length) sentences.push(medicalBits.join(', '));

  if (address) sentences.push(`my address on file is ${address}`);
  if (notes) sentences.push(`additional notes to keep in mind: ${notes}`);

  if (!sentences.length) return null;
  // Capitalize the first character of each sentence and terminate with a period.
  const finalText = sentences
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .map(s => s.endsWith('.') ? s : `${s}.`)
    .join(' ');
  return finalText;
};
