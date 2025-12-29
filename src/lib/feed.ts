import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { Article, SiteConfig, UserPreferences } from './types';
import { getPreferences, getSites } from './storage';

const parser = new Parser({
    customFields: {
        item: [
            ['media:group', 'mediaGroup'],
        ],
    },
});

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
            // Manual fetch to handle UAs and check for HTML
            const response = await axios.get(site.url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
                }
            });

            const data = response.data;
            if (typeof data === 'string' && (data.trim().startsWith('<!DOCTYPE html') || data.trim().startsWith('<html'))) {
                throw new Error('Received HTML webpage instead of RSS feed (likely blocked or invalid URL)');
            }

            const feed = await parser.parseString(data);

            const siteArticles = await Promise.all(feed.items.slice(0, 50).map(async (item: any) => {
                // 0. Try YouTube specific thumbnail (media:group -> media:thumbnail)
                let imageUrl;

                // Use the custom field 'mediaGroup' we configured
                const mediaGroup = item.mediaGroup;
                if (mediaGroup && mediaGroup['media:thumbnail']) {
                    const thumbs = mediaGroup['media:thumbnail'];
                    // YouTube usually gives an array of thumbnails, take the first one (often highest res or default)
                    const thumb = Array.isArray(thumbs) ? thumbs[0] : thumbs;

                    if (thumb) {
                        // Check for direct properties or nested '$' properties (common in xml2js)
                        if (thumb.url) imageUrl = thumb.url;
                        else if (thumb['$'] && thumb['$'].url) imageUrl = thumb['$'].url;
                    }
                }

                // 1. Try enclosure (if no YouTube match)
                if (!imageUrl) {
                    imageUrl = item.enclosure?.url;
                }

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

        } catch (e: any) {
            // Simplify error message for HTML/XML issues
            let msg = e.message;
            if (msg.includes('Attribute without value') || msg.includes('Unexpected close tag')) {
                msg = 'Invalid XML or HTML response';
            }
            console.error(`Failed to scrape ${site.url}: ${msg}`);
        }
    });

    await Promise.all(promises);

    // Shuffle the results for discovery
    for (let i = allArticles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allArticles[i], allArticles[j]] = [allArticles[j], allArticles[i]];
    }

    // Return random selection up to limit
    return allArticles.slice(0, 200);
}
