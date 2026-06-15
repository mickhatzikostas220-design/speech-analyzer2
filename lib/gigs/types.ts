export type GigStatus = 'confirmed' | 'hold' | 'tentative' | 'ticketed';
export type GigSource = 'manual' | 'calendar';

export interface Gig {
  id: string;
  user_id: string;
  title: string;
  location: string | null;
  kind: string | null;
  status: GigStatus;
  starts_at: string; // ISO
  source: GigSource;
  created_at: string;
}
