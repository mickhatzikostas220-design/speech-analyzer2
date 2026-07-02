// Browser-side text extraction for uploaded keynote descriptions. This runs
// entirely in the user's browser — the heavy parsers (pdf.js, mammoth) are
// dynamically imported so they only download when someone actually uploads a
// file, and nothing here touches the serverless build. Supported inputs:
// PDF (.pdf), Word (.docx), and plain text / markdown (.txt, .md).

const MAX_CHARS = 20000;

export type ParsedSource = 'pdf' | 'docx' | 'txt';

export interface ParsedFile {
  text: string;
  source: ParsedSource;
}

/** Minimal shape we use from mammoth, so the build doesn't depend on its exact d.ts. */
interface MammothLike {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}

export async function extractTextFromFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    return { text: await extractPdf(file), source: 'pdf' };
  }
  if (
    name.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return { text: await extractDocx(file), source: 'docx' };
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
    return { text: normalize(await file.text()), source: 'txt' };
  }
  if (name.endsWith('.doc')) {
    throw new Error('Old .doc files aren’t supported — save it as .docx or a PDF, or paste the text.');
  }
  throw new Error('Unsupported file. Upload a PDF, Word (.docx), or text file — or just paste the text.');
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Load the worker matching the installed version from a CDN so we never have
  // to bundle/serve it ourselves (which is brittle across build setups).
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
  }
  return normalize(pages.join('\n'));
}

async function extractDocx(file: File): Promise<string> {
  const mod = (await import('mammoth')) as unknown as MammothLike & { default?: MammothLike };
  const mammoth = mod.default ?? mod;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return normalize(result.value);
}

/** Tidy extracted text: normalize newlines, drop trailing spaces, cap length. */
function normalize(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS);
}
