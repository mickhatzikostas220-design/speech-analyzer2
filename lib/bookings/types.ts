export type BookingStatus = 'new' | 'discussing' | 'confirmed' | 'declined' | 'completed';
export type BookingSource = 'manual' | 'one_sheet';

export interface Booking {
  id: string;
  user_id: string;
  organization: string | null;
  contact_name: string | null;
  contact_email: string | null;
  event_name: string | null;
  event_date: string | null; // ISO date (yyyy-mm-dd)
  location: string | null;
  fee: number | null;
  status: BookingStatus;
  notes: string | null;
  source: BookingSource;
  created_at: string;
}

export const BOOKING_STATUSES: BookingStatus[] = [
  'new',
  'discussing',
  'confirmed',
  'completed',
  'declined',
];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  new: 'New',
  discussing: 'In discussion',
  confirmed: 'Confirmed',
  completed: 'Completed',
  declined: 'Declined',
};
