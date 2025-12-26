export interface Article {
    id: string; // URL as ID
    title: string;
    url: string;
    sourceId: string; // hostname or defined ID
    sourceName: string;
    topic: string;
    imageUrl?: string;
    publishedAt: string; // ISO date
    score: number; // Calculated priority score
}

export interface SiteConfig {
    url: string;
    category: string;
    isBlocked?: boolean;
}

export interface UserPreferences {
    blockedSites: string[];
    demotedSites: string[];
    demotedTopics: string[];
    siteScores: Record<string, number>; // Site URL -> Score
    topicScores: Record<string, number>; // Topic -> Score
    clickHistory: string[]; // List of clicked Article IDs (URLs)
}
