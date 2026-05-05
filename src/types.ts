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
  grade?: number; // Starší systém nebo fallback
  userGrades?: Record<string, { grade: number; changesCount: number }>;
  averageGrade?: number;
  location?: string;
  url?: string;
  adminModifiedTime?: boolean;
  calendarError?: string;
  hiddenFromBoard?: boolean;
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
  adminAlias?: string;
  updatedAt?: number;
  role?: UserRole;
  permissions?: UserPermissions;
  isBlocked?: boolean;
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
  is_vyskov?: boolean;
  createdAt?: any;
}

export interface WeekendEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isWeekendWithKids?: boolean;
}

export interface WishlistItem {
  id: string;
  childName: string;
  authorId: string;
  name: string;
  url?: string;
  imageBase64?: string;
  targetZB: number;       // Cena v ZB (nastavuje rodič)
  status: 'pending' | 'approved' | 'rejected';
  rejectReason?: string;
  createdAt: number;
}

export interface MysteryQuest {
  id: string;
  title: string;
  description: string;
  bonusMultiplier: number; // např. 2 = dvojité body
  deadlineHours: number;   // časový limit v hodinách
  active: boolean;
  createdAt: number;
}
