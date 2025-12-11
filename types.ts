
export interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  location: {
    lat: number;
    lng: number;
  };
  city: string; // The "Context" e.g., "Porvoo", "Unknown Sector"
  sessionId: string; // Anonymous User ID
  score: number; // Jodel-style score (Upvotes - Downvotes)
  parentId?: string | null; // For threaded replies
  replyCount?: number; // Visual counter
  isRemote?: boolean; // Signal Origin Indicator
}

export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
}

export interface RateLimitStatus {
  isLimited: boolean;
  cooldownUntil: number | null;
}

export enum DreamCategory {
  NIGHTMARE = 'nightmare',
  LUCID = 'lucid',
  RECURRING = 'recurring',
  MUNDANE = 'mundane',
  PROPHETIC = 'prophetic',
  ABSTRACT = 'abstract'
}

export interface Dream {
  id: string;
  text: string;
  category: DreamCategory;
  summary: string;
  interpretation: string;
  timestamp: number;
  location: {
    lat: number;
    lng: number;
  };
}

export interface TrendingSymbol {
  word: string;
  count: number;
}

export interface CountryStats {
  countryName: string;
  totalDreams: number;
  dominantTheme: DreamCategory | 'N/A';
  moodScore: number;
  trendingSymbols: TrendingSymbol[];
}
