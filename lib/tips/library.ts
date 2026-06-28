// Curated coaching tips for speakers. Free users see one of these per week;
// paid users can schedule any of them and check them off. Keep ids stable —
// they're stored in user_tips.tip_id.
export interface Tip {
  id: string;
  title: string;
  body: string;
  category: 'delivery' | 'content' | 'engagement' | 'preparation' | 'business';
}

export const TIPS: Tip[] = [
  { id: 'open-with-stakes', title: 'Open with the stakes, not the agenda', body: 'Skip “today I’ll cover three things.” Start with why the room should care in the next 90 seconds — a tension, a number, or a question they can’t answer yet.', category: 'content' },
  { id: 'first-90-seconds', title: 'Rehearse the first 90 seconds cold', body: 'Most attention is won or lost early. Memorize your opening so well you could deliver it if the slides died — it buys you calm for the rest.', category: 'preparation' },
  { id: 'vary-your-pace', title: 'Use silence as punctuation', body: 'After your most important line, stop for two full seconds. The pause signals “this mattered” and lets the idea land.', category: 'delivery' },
  { id: 'one-idea-per-slide', title: 'One idea per slide', body: 'If a slide needs a paragraph, it’s two slides. The audience reads or listens — not both. Make the slide the headline, say the rest.', category: 'content' },
  { id: 'name-the-objection', title: 'Name the audience’s objection out loud', body: 'Say the thing they’re skeptical about before they think it: “You’re probably wondering if this works at scale.” Trust jumps when you go first.', category: 'engagement' },
  { id: 'concrete-over-abstract', title: 'Trade one abstraction for a concrete example', body: 'Find your most abstract point and replace it with a specific story, name, or number. Brains remember concrete; they forget concepts.', category: 'content' },
  { id: 'eye-contact-anchors', title: 'Anchor eye contact on three faces', body: 'Pick three friendly faces — left, center, right — and speak to them in turn. It reads as connection to the whole room and steadies your nerves.', category: 'delivery' },
  { id: 'cut-ten-percent', title: 'Cut 10% before you ever add', body: 'No one has ever wished a talk were longer. Find the 10% you could lose and lose it — your best material gets more room to breathe.', category: 'preparation' },
  { id: 'callback-close', title: 'Close with a callback', body: 'End by returning to the image or line you opened with. The loop feels intentional and makes the talk land as a whole, not a list.', category: 'content' },
  { id: 'record-and-watch', title: 'Watch yourself at 1.5x', body: 'Record a rehearsal and watch it sped up. Filler words, pacing dips, and nervous tics jump out fast — fix the top two before the next run.', category: 'preparation' },
  { id: 'ask-a-real-question', title: 'Ask one question you actually want answered', body: 'Genuine curiosity beats rhetorical “show of hands.” A real question wakes the room up and gives you material to react to.', category: 'engagement' },
  { id: 'land-the-number', title: 'Make your key stat sticky', body: 'Don’t just say “40%.” Translate it: “that’s two of every five people in this room.” Comparison turns a statistic into a feeling.', category: 'content' },
  { id: 'move-with-purpose', title: 'Move on purpose, then plant', body: 'Wander and you leak energy. Step to a new spot for a new point, then stand still while you make it. Stillness signals confidence.', category: 'delivery' },
  { id: 'tighten-transitions', title: 'Script your transitions', body: 'The seams between sections are where talks sag. Write one sentence that bridges each pair of ideas so momentum never drops.', category: 'preparation' },
  { id: 'follow-up-offer', title: 'Give the room one clear next step', body: 'Before you thank them, tell them exactly what to do next — scan a code, grab the one-sheet, email you. A talk without an ask leaves money on the table.', category: 'business' },
  { id: 'warm-the-room', title: 'Talk to people before you talk at them', body: 'Arrive early and chat with a few attendees. You’ll have allies in the seats and real names to reference — and the opening feels like a conversation.', category: 'engagement' },
  { id: 'repurpose-the-talk', title: 'Mine one talk for a week of content', body: 'Every talk hides clips, quotes, and a post. Pull your three best 30-second moments and one quotable line before you forget them.', category: 'business' },
  { id: 'breathe-low', title: 'Reset nerves with a low, slow breath', body: 'Before you go on, exhale longer than you inhale for four rounds. It drops your heart rate and your pitch — you’ll sound (and feel) grounded.', category: 'delivery' },
];

export function tipById(id: string): Tip | undefined {
  return TIPS.find((t) => t.id === id);
}
