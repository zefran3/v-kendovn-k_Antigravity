export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'draft';

/** Sdílený interface pro výstup webových scraperů (KudyZNudy, JižníMorava, aj.) */
export interface ScrapedEvent {
  title: string;
  date: string;
  description: string;
  source_url: string;
}


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
  finalRejectReason?: string;
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
  claimedDetails?: boolean;
  claimedFree?: boolean;
  approvedDetails?: boolean;
  approvedFree?: boolean;
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
  /** Pro role=child: které AI tipy uživatel uvidí. Nastavuje admin. */
  targetGroup?: 'pro_dceru' | 'pro_syna' | 'pro_vsechny';
  /** Rok narození — věk se počítá dynamicky, nemusí se každý rok aktualizovat. */
  birthYear?: number;
}

export interface CinemaListing {
  film: string;
  time: string;
  url?: string;
  times?: { time: string; url: string }[];
}

// Agregovaný formát pro CineStar scraper (1 záznam = 1 film + všechny časy)
export interface CineStarListing {
  film: string;
  time: string;
  url?: string;
  film_title?: string;
  showtimes?: string;   // např. "14:00, 16:30, 20:15"
  times?: { time: string; url: string }[];
}

export interface CineStarEvent {
  title: string;
  location: string;
  source_url: string;
  cinema_listings: CineStarListing[];
  date: string;       // YYYY-MM-DD
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
  // cinema_listings podporuje obě varianty:
  // - CinemaListing: { film, time } — starší formát (AI halucinované názvy)
  // - CineStarListing: { film_title, showtimes } — nový agregovaný formát ze scraperů
  cinema_listings?: (CinemaListing | CineStarListing)[];
  ticket_url?: string;
  cycling_info?: {
    distance: string;
    elevation: string;
    duration: string;
  };
  is_vyskov?: boolean;
  userId?: string; // ID uživatele, který tip vygeneroval (pro drafty)
  status?: 'draft' | 'proposed' | 'approved' | 'confirmed';
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
  valueKč?: number;        // Schválená cena v Kč (nastavuje rodič)
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
  startedAt?: number;
  durationHours?: number;
  status?: string;
  completedBy?: string;    // jméno hráče, který splnil quest
  appliedBonusXP?: number; // dorovnávací bonus XP přidělený při splnění
}

export interface BattlePassMilestone {
  id: string;
  pointsRequired: number;
  title: string;
  icon: string;
  description: string;
  order: number;
}

export interface BattlePassClaim {
  id?: string;
  userId: string;
  userName: string;
  sprintId: string;
  rewardId: string;
  rewardTitle: string;
  claimedAt: any;
}

export interface SportsVenue {
  id?: string;
  name: string;
  type: string; // 'bazen' | 'posilovna' | 'zimni_stadion' | 'tenis' | 'atletika' | 'other'
  description?: string;
  location: string;
  url?: string;
  openingHours: string;
  price?: string;
  phone?: string;
  createdAt: number;
  lat?: number;
  lng?: number;
  isFromWeb?: boolean;
  isCustom?: boolean;
}



