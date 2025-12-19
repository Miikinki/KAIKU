
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
  
  // IDENTITY FIELDS
  userDisplayName?: string;
  userAvatar?: string;
  userColor?: string;
  userLevel?: number; // NEW: Level at time of posting
  userBadges?: string[]; // NEW: Snapshot of equipped badges
  hideLevel?: boolean; // NEW: Privacy preference at time of posting
  isPrime?: boolean; // NEW: Prime status

  // GLOBAL RADAR FIELDS
  postType?: 'USER' | 'GLOBAL_EVENT' | 'SCAN_RESULT';
  eventMetadata?: {
    source_url?: string;
    user_level?: number;
    hide_level?: boolean;
    is_prime?: boolean;
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

export interface AgentStats {
  id: string;
  rankTitle: string;
  rankLevel: number;
  xp: number; // Total XP
  nextLevelXp: number; // XP needed for next level
  progress: number; // 0.0 to 1.0 for current level
  totalTransmissions: number;
  signalImpact: number; // Total Score
  repliesReceived: number;
  sectorsActive: number; // Unique cities
  newsScanned: number;
}

export interface UserProfile {
  displayName: string | null;
  avatar: string;
  color: string;
  hideLevel: boolean;
  
  // RETENTION & PRIME
  isPrime: boolean;
  primeExpiry?: number;
  streak: number;
  lastLogin: number; // Timestamp
  notificationsEnabled: boolean;
  
  // COLLECTION
  unlockedBadges: string[];
  equippedBadges: string[];
}