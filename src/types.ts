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
  location?: string;
  createdAt: number;
  comments?: ActivityComment[];
}

export type UserRole = 'admin' | 'parent' | 'child' | 'viewer';

export interface UserPermissions {
  canSuggest: boolean;
  canComment: boolean;
  canApprove: boolean;
  canManageUsers: boolean;
}

export interface UserProfile {
  id?: string;
  avatar: string;
  email?: string;
  displayName?: string;
  updatedAt?: number;
  role?: UserRole;
  permissions?: UserPermissions;
}

export interface CinemaListing {
  film: string;
  time: string;
  url?: string;
}

export interface Inspiration {
  id: string;
  title: string;
  description: string;
  target: 'pro_vsechny' | 'pro_dceru' | 'pro_syna';
  location: string;
  date?: string;
  time?: string;
  time_type?: 'event' | 'opening_hours' | 'all_day' | 'flexible';
  opening_hours?: string;
  price?: string;
  duration?: string;
  url?: string;
  indoor?: boolean;
  age_recommendation?: string;
  cinema_listings?: CinemaListing[];
  ticket_url?: string;
  cycling_info?: {
    distance: string;
    elevation: string;
    duration: string;
  };
  createdAt?: any;
}

export interface WeekendEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isWeekendWithKids?: boolean;
}
