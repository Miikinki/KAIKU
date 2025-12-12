
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
  originCountry?: string; // ISO Country Code (e.g. "FI", "US")
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
