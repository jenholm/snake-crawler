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

export async function fetchAllArticles(): Promise<Article[]> {
    const sites = getSites();
    const prefs = getPreferences();
    let allArticles: Article[] = [];

    const promises = sites.map(async (site) => {
        if (prefs.blockedSites.includes(site.url)) return;

        try {
            const feed = await parser.parseURL(site.url);

            const siteArticles = await Promise.all(feed.items.slice(0, 10).map(async (item) => {
                // Try to find an image in content:encoded or enclosure
                let imageUrl = item.enclosure?.url;

                // Simple regex to find img in content if no enclosure
                if (!imageUrl && item.content) {
                    const match = item.content.match(/src="([^"]+)"/);
                    if (match) imageUrl = match[1];
                }

                // Fallback to scraping (limit concurrency in real app, but ok for now)
                if (!imageUrl && item.link) {
                    // await fetchMetadata(item.link); // Skipping to avoid fetching every page for now, too slow.
                    // Maybe just use a placeholder or partial fetch logic if needed.
                    // For prototype, we rely on feed images.
                }

                const score = calculateScore(item, site, prefs);

                return {
                    id: item.link || item.guid || Math.random().toString(),
                    title: item.title || 'Untitled',
                    url: item.link || '',
                    sourceId: site.url,
                    sourceName: feed.title || site.url,
                    topic: site.category,
                    imageUrl: imageUrl,
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
