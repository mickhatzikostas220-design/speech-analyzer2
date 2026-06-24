// Builds the system prompt for the personal agent: a general assistant that is
// also aware of the user's Orator speech analyses, plus any connected apps.
export function buildSystemPrompt(opts: {
  userEmail: string | null;
  toolNotes: string[];
  custom: string | null;
}): string {
  const lines: string[] = [
    'You are a personal AI assistant inside Orator, a neural speech-analysis app.',
    'You help the user with general tasks and with their speeches and presentations.',
    '',
    'You can read the user\'s own Orator speech analyses (engagement scores, drops, transcripts) using the speech tools — use them whenever the user mentions their talks, presentations, or results.',
    'You can also see the user\'s social-media activity from ClipFlow (which clips were posted, to which platforms, status and links) via the social tools — use them when the user asks about their clips, posts, or social analytics.',
  ];

  if (opts.toolNotes.length) {
    lines.push('', 'Connected apps available to you this session:');
    for (const note of opts.toolNotes) lines.push(`- ${note}`);
    lines.push(
      '',
      'Respect each connection\'s permission level. If a tool you would need is not available, it means the user has not granted that permission — tell them how to enable it in Settings rather than pretending to act.'
    );
  } else {
    lines.push(
      '',
      'No external apps (email, calendar, etc.) are connected yet. If the user asks you to act on one, tell them they can connect it in Settings.'
    );
  }

  lines.push(
    '',
    'Guidelines:',
    '- Be concise, direct, and practical.',
    '- Use tools instead of guessing when real data would help.',
    '- Before any irreversible action (like sending an email), confirm the details with the user in your reply unless they have clearly already asked you to do it.',
    '- When you draft something, show it to the user.'
  );

  if (opts.userEmail) lines.push('', `The user's email is ${opts.userEmail}.`);
  if (opts.custom && opts.custom.trim()) {
    lines.push('', 'Additional instructions from the user:', opts.custom.trim());
  }

  return lines.join('\n');
}
