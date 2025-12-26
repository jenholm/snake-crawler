import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { Article, SiteConfig, UserPreferences } from './types';
import { getPreferences, getSites } from './storage';

const parser = new Parser();

// Helper to get OgImage if not in RSS
async function fetchMetadata(url: string): Promise<{ imageUrl?: string }> {
    try {
        const response = await axios.get(url, { timeout: 3000 });
        const $ = cheerio.load(response.data);
        const imageUrl = $('meta[property="og:image"]').attr('content') ||
            $('meta[name="twitter:image"]').attr('content');
        return { imageUrl };
    } catch (e) {
        return {};
    }
}

function calculateScore(item: any, site: SiteConfig, prefs: UserPreferences): number {
    let score = 0;

    // Base temporal score (newer is better)
    const date = item.isoDate ? new Date(item.isoDate) : new Date();
    const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    score += Math.max(0, 100 - hoursAgo); // Freshness boost

    // User preference adjustments
    if (prefs.siteScores[site.url]) {
        score += prefs.siteScores[site.url] * 10;
    }
    if (prefs.demotedSites.includes(site.url)) {
        score -= 50;
    }
    if (prefs.demotedTopics.includes(site.category)) {
        score -= 50;
    }
    if (prefs.topicScores[site.category]) {
        score += prefs.topicScores[site.category] * 10;
    }

    return score;
}

// Helper to clean textual content
function cleanSummary(text: string | undefined): string {
    if (!text) return '';

    // Load into cheerio to strip HTML tags reliably
    const $ = cheerio.load(text);
    let cleaned = $.text();

    // Normalize whitespace (remove newlines, excessive spaces)
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Filter out useless summaries
    const lower = cleaned.toLowerCase();
    if (lower === 'comments') return '';
    if (lower.startsWith('comments on')) return '';
    if (lower === 'read more') return '';
    if (lower.length < 10) return ''; // Too short to be useful

    return cleaned;
}

export async function fetchAllArticles(): Promise<Article[]> {
    const sites = getSites();
    const prefs = getPreferences();
    let allArticles: Article[] = [];

    const promises = sites.map(async (site) => {
        if (prefs.blockedSites.includes(site.url)) return;

        try {
            const feed = await parser.parseURL(site.url);

            const siteArticles = await Promise.all(feed.items.slice(0, 10).map(async (item) => {
                // 1. Try enclosure
                let imageUrl = item.enclosure?.url;

                // 2. Try parsing content for the first image
                if (!imageUrl) {
                    const contentToCheck = item.content || item['content:encoded'] || item.description || '';
                    if (contentToCheck) {
                        const $ = cheerio.load(contentToCheck);
                        imageUrl = $('img').first().attr('src');
                    }
                }

                // 3. Get best summary
                // Priority: contentSnippet -> description -> content
                // We check each one through cleanSummary until we get a non-empty result
                let summary = cleanSummary(item.contentSnippet);
                if (!summary) summary = cleanSummary(item.description);
                if (!summary) summary = cleanSummary(item.content);
                if (!summary) summary = cleanSummary(item['content:encoded']);

                const score = calculateScore(item, site, prefs);

                return {
                    id: item.link || item.guid || Math.random().toString(),
                    title: item.title || 'Untitled',
                    url: item.link || '',
                    sourceId: site.url,
                    sourceName: feed.title || site.url,
                    topic: site.category,
                    imageUrl: imageUrl,
                    summary: summary.substring(0, 300) + (summary.length > 300 ? '...' : ''),
                    publishedAt: item.isoDate || new Date().toISOString(),
                    score
                } as Article;
            }));

            allArticles.push(...siteArticles);
        } catch (e) {
            console.error(`Failed to scrape ${site.url}:`, e);
        }
    });

    await Promise.all(promises);

    // Global Sort and Limit
    return allArticles
        .sort((a, b) => b.score - a.score)
        .slice(0, 100);
}
