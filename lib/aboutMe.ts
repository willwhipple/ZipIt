export type StructuredAboutMe = {
  toiletries: string;
  medications: string;
  travelNotes: string;
};

export function formatAboutMe({ toiletries, medications, travelNotes }: StructuredAboutMe): string {
  const parts: string[] = [];
  if (toiletries.trim()) parts.push(`Toiletries: ${toiletries.trim()}`);
  if (medications.trim()) parts.push(`Medications: ${medications.trim()}`);
  if (travelNotes.trim()) parts.push(`Travel notes: ${travelNotes.trim()}`);
  return parts.join('\n');
}

export function parseAboutMe(stored: string | null): StructuredAboutMe {
  if (!stored) return { toiletries: '', medications: '', travelNotes: '' };

  // Detect structured format by presence of the first section label
  if (!stored.startsWith('Toiletries:')) {
    return { toiletries: '', medications: '', travelNotes: stored };
  }

  const lines = stored.split('\n');
  let toiletries = '';
  let medications = '';
  let travelNotes = '';

  for (const line of lines) {
    if (line.startsWith('Toiletries: ')) toiletries = line.slice('Toiletries: '.length);
    else if (line.startsWith('Medications: ')) medications = line.slice('Medications: '.length);
    else if (line.startsWith('Travel notes: ')) travelNotes = line.slice('Travel notes: '.length);
  }

  return { toiletries, medications, travelNotes };
}
