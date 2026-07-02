// Shared types for the Keynote Tailoring tool. A `Keynote` is the master
// description a speaker stores; a `KeynoteVariant` is one industry-tailored
// version of it. Rows map 1:1 to the tables in supabase/keynotes.sql.

export type KeynoteSource = 'paste' | 'pdf' | 'docx' | 'txt';

export interface Keynote {
  id: string;
  user_id: string;
  title: string;
  description: string;
  source: KeynoteSource;
  created_at: string;
  updated_at: string;
}

export interface KeynoteVariant {
  id: string;
  keynote_id: string;
  user_id: string;
  industry: string;
  audience: string | null;
  tailored_description: string;
  created_at: string;
}
