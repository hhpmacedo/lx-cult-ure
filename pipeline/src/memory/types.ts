/**
 * Memory system types — persistent learning across editions.
 */

export interface EditionFeedback {
  weekId: string;
  rating: number; // 1-5 stars from human curator
  notes?: string; // optional free-text notes
  eventsKept: string[]; // event IDs that survived review
  eventsRemoved: string[]; // event IDs removed during review
  removalReasons: Record<string, string>; // eventId → reason
  categoryCoverage: Record<string, number>; // category → count of final events
  timestamp: string;
}

export interface SourceScore {
  sourceId: string;
  name: string;
  totalEventsScraped: number;
  eventsSurvivedCuration: number;
  eventsSurvivedReview: number;
  averageAiScore: number;
  weeklyScores: Array<{
    weekId: string;
    scraped: number;
    survivedCuration: number;
    survivedReview: number;
  }>;
  qualityScore: number; // 0-100 rolling score
  lastUpdated: string;
}

export interface PromptVersion {
  version: number;
  weekId: string;
  prompt: string;
  changes: string; // what changed and why
  editionRating?: number; // rating of the edition produced with this prompt
  timestamp: string;
}

export interface CurationPattern {
  // Events the curator consistently likes
  preferredVenues: Array<{ name: string; score: number }>;
  preferredNeighborhoods: Array<{ name: string; score: number }>;
  preferredCategories: Record<string, number>; // category → affinity weight
  preferredTags: Array<{ tag: string; score: number }>;

  // Events the curator consistently removes
  rejectedPatterns: string[]; // descriptions of rejected event patterns
  touristIndicators: string[]; // learned tourist-trap signals

  // Editorial style
  avgEventsPerEdition: number;
  avgFeaturedPerCategory: number;
  preferredBlurbLength: { min: number; max: number };

  lastUpdated: string;
}

export interface PostEventReview {
  weekId: string;
  eventId: string;
  eventTitle: string;
  predictedScore: number; // AI score at curation time
  actualReception: 'positive' | 'mixed' | 'negative' | 'unknown';
  reviewSource?: string;
  reviewQuote?: string;
  timestamp: string;
}

export interface Memory {
  editionFeedback: EditionFeedback[];
  sourceScores: SourceScore[];
  promptHistory: PromptVersion[];
  curationPatterns: CurationPattern;
  postEventReviews: PostEventReview[];
  meta: {
    totalEditions: number;
    averageRating: number;
    lastImprovement: string;
    improvementCount: number;
  };
}
