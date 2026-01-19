export interface SourceReputation {
    passRate: number; // 0 to 1
    avgScore: number; // 0 to 100
    userEngagement: number; // Weighted clicks/actions
    totalTriaged: number;
}

export interface MicroQuestion {
    id: string;
    question: string;
    options: string[];
    context: string;
    topic?: string;
}

export interface ContentCard {
    summary: string[]; // 5–7 bullets
    claims: string[];
    entities: {
        people: string[];
        companies: string[];
        technologies: string[];
    };
    metadata: {
        depth: 'shallow' | 'deep';
        originality: number; // 0 to 1
        is_news: boolean;
        is_tutorial: boolean;
        is_analysis: boolean;
    };
}

export interface Article {
    id: string; // URL as ID
    title: string;
    url: string;
    sourceId: string;
    sourceName: string;
    topic: string;
    imageUrl?: string;
    summary?: string;
    fullText?: string;
    publishedAt: string;
    score: number;
    triageStatus?: 'reject' | 'maybe' | 'good';
    seoFlags: string[];
    contentCard?: ContentCard;
    canonicalId?: string; // ID of the representative article in a cluster
    similarArticles?: Article[]; // Other articles in the same semantic cluster
    explanation?: {
        overall: number;
        topic_match: number;
        novelty: number;
        depth: number;
        credibility: number;
        junk_risk: number;
        why: string[];
        filters_triggered: string[];
    };
}

export interface InterestModel {
    stablePreferences: string; // Long-term interests
    sessionIntent: string;    // Current focus/week's focus
}

export interface ScoringRubric {
    version: number;
    generatedAt: string;
    topicWeights: Record<string, number>;
    noveltyPreference: number; // 0 (evergreen) to 1 (fresh)
    technicalDepthPreference: number;
    instantJunkRules: string[];
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
    siteScores: Record<string, number>;
    topicScores: Record<string, number>;
    clickHistory: string[];
    interestModel: InterestModel;
    currentRubric?: ScoringRubric;
    sourceReputation: Record<string, SourceReputation>;
    pendingQuestions: MicroQuestion[];
}
