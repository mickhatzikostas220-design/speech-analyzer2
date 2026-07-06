// Attribution + honest-scope notice for the AI models behind the Speech
// Analyzer. Two of them carry licenses that REQUIRE visible credit:
//   • Meta's TRIBE v2 (the brain-response model) — CC BY-NC 4.0. The "NC" means
//     non-commercial; we keep the analyzer free to stay within that, and the
//     "BY" means we must credit Meta with a link to the model and license.
//   • NVIDIA's Parakeet (transcription) — CC BY 4.0, which also requires credit.
// This component is the single place those credits live, rendered under the
// analyzer and every analysis report so the attribution is always visible.
//
// It also states plainly that the outputs are model *predictions*, not measured
// brain activity — so the tool never reads as a medical or diagnostic claim.

type Credit = {
  name: string;
  by: string;
  href: string;
  license: string;
  licenseHref: string;
  note?: string;
};

const CREDITS: Credit[] = [
  {
    name: 'TRIBE v2',
    by: 'Meta AI',
    href: 'https://huggingface.co/facebook/tribev2',
    license: 'CC BY-NC 4.0',
    licenseHref: 'https://creativecommons.org/licenses/by-nc/4.0/',
    note: 'Brain-response model, built on Llama 3.2, V-JEPA 2, and Wav2Vec-BERT. Used under its non-commercial research license.',
  },
  {
    name: 'Parakeet TDT 0.6B v3',
    by: 'NVIDIA',
    href: 'https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3',
    license: 'CC BY 4.0',
    licenseHref: 'https://creativecommons.org/licenses/by/4.0/',
    note: 'Speech-to-text transcription.',
  },
  {
    name: 'Whisper',
    by: 'OpenAI',
    href: 'https://github.com/openai/whisper',
    license: 'MIT',
    licenseHref: 'https://opensource.org/license/mit',
    note: 'Fallback transcription.',
  },
];

export function ModelCredits({ className = '' }: { className?: string }) {
  return (
    <section
      className={`border-t border-[var(--border-subtle)] pt-5 text-xs text-faint ${className}`}
      aria-label="How the Speech Analyzer works and the models it credits"
    >
      <p className="text-muted font-medium mb-1">How this works</p>
      <p className="mb-4 leading-relaxed">
        The Speech Analyzer is free to use. It predicts how a listener&rsquo;s brain is
        likely to respond to your talk. These are model estimates to help you
        rehearse — not measured brain activity, and not medical or diagnostic
        information.
      </p>

      <p className="text-muted font-medium mb-1">Models &amp; credits</p>
      <ul className="space-y-1.5">
        {CREDITS.map((c) => (
          <li key={c.name} className="leading-relaxed">
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium"
              style={{ color: 'var(--text-link)' }}
            >
              {c.name}
            </a>{' '}
            by {c.by} — licensed{' '}
            <a
              href={c.licenseHref}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {c.license}
            </a>
            {c.note ? <span> · {c.note}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
