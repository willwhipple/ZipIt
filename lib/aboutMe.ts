export type StructuredAboutMe = {
  toiletriesAndMeds: string;
  neverWithout: string;
};

export function formatAboutMe({ toiletriesAndMeds, neverWithout }: StructuredAboutMe): string {
  const parts: string[] = [];
  if (toiletriesAndMeds.trim()) parts.push(`Toiletries & medications: ${toiletriesAndMeds.trim()}`);
  if (neverWithout.trim()) parts.push(`Never without: ${neverWithout.trim()}`);
  return parts.join('\n');
}

export function parseAboutMe(stored: string | null): StructuredAboutMe {
  if (!stored) return { toiletriesAndMeds: '', neverWithout: '' };

  // New structured format
  if (stored.startsWith('Toiletries & medications:')) {
    const lines = stored.split('\n');
    let toiletriesAndMeds = '';
    let neverWithout = '';
    for (const line of lines) {
      if (line.startsWith('Toiletries & medications: ')) toiletriesAndMeds = line.slice('Toiletries & medications: '.length);
      else if (line.startsWith('Never without: ')) neverWithout = line.slice('Never without: '.length);
    }
    return { toiletriesAndMeds, neverWithout };
  }

  // Legacy format (old three-field structure) — merge toiletries + medications, put travel notes into neverWithout
  if (stored.startsWith('Toiletries:')) {
    const lines = stored.split('\n');
    const parts: string[] = [];
    let travelNotes = '';
    for (const line of lines) {
      if (line.startsWith('Toiletries: ')) parts.push(line.slice('Toiletries: '.length));
      else if (line.startsWith('Medications: ')) parts.push(line.slice('Medications: '.length));
      else if (line.startsWith('Travel notes: ')) travelNotes = line.slice('Travel notes: '.length);
    }
    return { toiletriesAndMeds: parts.join(', '), neverWithout: travelNotes };
  }

  // Unstructured legacy free-text — put everything in neverWithout
  return { toiletriesAndMeds: '', neverWithout: stored };
}
