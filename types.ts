export interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  expiresAt: number; // Absolute timestamp when message dies
  location: {
    lat: number;
    lng: number;
  };
  city: string; // The "Context" e.g., "Porvoo", "Unknown Sector"
  country?: string; // The "Target Country" e.g., "FI", "JP" (Where the pin is)
  sessionId: string; // Anonymous User ID
  score: number; // Acts as "Boost Count"
  parentId?: string | null; // For threaded replies
  replyCount?: number; // Visual counter
  isRemote?: boolean; // Signal Origin Indicator
  originCountry?: string; // ISO Country Code (e.g. "FI", "US") - Where the User IS
  tags?: string[]; // Array of hashtags found in the text (e.g. ["#summer", "#helsinki"])
  customOrigin?: { lat: number, lng: number }; // TRANSIENT: For animating "My" outgoing messages precisely (Local Echo)
  preciseOrigin?: { lat: number, lng: number }; // PERSISTENT: Extracted from metadata for accurate remote arcs
  imageUrl?: string; // NEW: URL for attached image
  isMasked?: boolean; // NEW: Indicates if the location is fuzzy/masked
  language?: string; // NEW: Detected source language (ISO code)
  
  // GLOBAL RADAR FIELDS
  postType?: 'USER' | 'GLOBAL_EVENT' | 'SCAN_RESULT';
  eventMetadata?: {
    source_url?: string;
  };
}

export interface ViewportBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  zoom: number;
  center: { lat: number; lng: number };
  sectorCenter?: { lat: number; lng: number }; // The ACTUAL visual center under the crosshair
}

export interface RateLimitStatus {
  isLimited: boolean;
  cooldownUntil: number | null;
}