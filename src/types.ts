export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ActivityComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  photoBase64?: string;
  createdAt: number;
}

export interface ActivitySuggestion {
  id: string;
  title: string;
  description: string;
  suggestedTime?: 'sobota' | 'neděle';
  eventDate?: string;
  eventTime?: string;
  status: SuggestionStatus;
  childName: string;
  authorId?: string;
  likes?: number;
  calendarEventId?: string;
  rejectReason?: string;
  reconsiderationRequested?: boolean;
  hasAppealed?: boolean;
  appealReason?: string;
  type?: 'activity' | 'ride';
  rideFrom?: string;
  rideTo?: string;
  grade?: number;
  createdAt: number;
  comments?: ActivityComment[];
}

export interface UserProfile {
  id?: string;
  avatar: string;
  email?: string;
  updatedAt?: number;
}

export interface WeekendEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isWeekendWithKids?: boolean;
}
