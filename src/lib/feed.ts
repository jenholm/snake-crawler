import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { Article, SiteConfig, UserPreferences } from './types';
import { getPreferences, getSites } from './storage';

const parser = new Parser({
    customFields: {
        item: [
            ['media:group', 'mediaGroup'],
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
            ['enc:enclosure', 'encEnclosure'],
        ],
    },
});

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// Helper to clean textual content
function cleanSummary(text: string | undefined): string {
    if (!text) return '';
    const $ = cheerio.load(text);
    let cleaned = $.text();
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    const lower = cleaned.toLowerCase();
    if (lower === 'comments') return '';
    if (lower.startsWith('comments on')) return '';
    if (lower === 'read more') return '';
    if (lower.length < 10) return '';
    return cleaned;
}

// Helper to identify if a URL is likely an image (not video)
function isImageUrl(url: string | undefined): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    // Skip common video formats that og:image sometimes returns
    if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.ogv')) return false;
    return true;
}

// Deep scraping for images if RSS fails
async function getMetaImage(url: string): Promise<string | undefined> {
    if (!url || !url.startsWith('http')) return undefined;
    try {
        const res = await axios.get(url, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://www.google.com/'
            }
        });
        const $ = cheerio.load(res.data);
        let img = $('meta[property="og:image"]').attr('content') ||
            $('meta[name="twitter:image"]').attr('content') ||
            $('link[rel="image_src"]').attr('href');

        if (img) {
            // Normalize relative URLs
            if (!img.startsWith('http')) {
                try {
                    img = new URL(img, url).href;
                } catch { return undefined; }
            }
            // Filter out videos
            if (!isImageUrl(img)) return undefined;
        }

        return img;
    } catch {
        return undefined;
    }
}

function calculateScore(item: any, site: SiteConfig, prefs: UserPreferences): number {
    let score = 0;
    const date = item.publishedAt ? new Date(item.publishedAt) : new Date();
    const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    score += Math.max(0, 100 - hoursAgo);

    if (prefs.siteScores[site.url]) score += prefs.siteScores[site.url] * 10;
    if (prefs.demotedSites.includes(site.url)) score -= 50;
    if (prefs.demotedTopics.includes(site.category)) score -= 50;
    if (prefs.topicScores[site.category]) score += prefs.topicScores[site.category] * 10;

    return score;
}

async function scrapeHtml(html: string, site: SiteConfig): Promise<Article[]> {
    const $ = cheerio.load(html);
    const articles: Article[] = [];
    const prefs = getPreferences(); // Need prefs for score calc

    // Heuristic: Look for common article patterns
    // We look for 'article' tags, or divs with 'post', 'article' classes
    // Inside them, we look for an 'a' tag with substantial text (title)

    // Simplified scraping strategy: Find all 'a' tags inside common containers
    $('article, .post, .entry, .card, .item, main > div').each((_, el) => {
        if (articles.length >= 10) return; // Limit scraped items

        const $el = $(el);
        const $link = $el.find('a').first(); // Assumption: first link is title
        const title = $link.text().trim();
        let link = $link.attr('href');

        if (!title || title.length < 10 || !link) return;

        // Normalize link
        if (link.startsWith('/')) {
            try {
                const u = new URL(site.url);
                link = `${u.protocol}//${u.host}${link}`;
            } catch { return; }
        }

        // Try to find image
        const img = $el.find('img').first().attr('src');
        // Try to find summary
        const summary = $el.text().slice(0, 200).replace(/\s+/g, ' ').trim(); // Very rough

        // Fake publishedAt since we scrapin'
        const publishedAt = new Date().toISOString();

        const item = {
            title,
            url: link,
            imageUrl: img,
            summary: summary,
            publishedAt
        };

        articles.push({
            id: link || Math.random().toString(),
            title,
            url: link || '',
            sourceId: site.url,
            sourceName: site.url, // No easy way to get nice name without metadata
            topic: site.category,
            imageUrl: img,
            summary: cleanSummary(summary),
            publishedAt,
            score: calculateScore(item, site, prefs)
        });
    });

    return articles;
}

async function discoverFeed(html: string, baseUrl: string): Promise<string | null> {
    const $ = cheerio.load(html);
    // Look for <link rel="alternate" type="application/rss+xml" ...>
    let feedUrl = $('link[type="application/rss+xml"]').attr('href') ||
        $('link[type="application/atom+xml"]').attr('href');

    if (feedUrl && !feedUrl.startsWith('http')) {
        try {
            const u = new URL(baseUrl);
            // Handle root relative vs relative
            if (feedUrl.startsWith('/')) {
                feedUrl = `${u.protocol}//${u.host}${feedUrl}`;
            } else {
                feedUrl = `${u.protocol}//${u.host}/${feedUrl}`; // rough approximation
            }
        } catch { return null; }
    }
    return feedUrl || null;
}

export async function fetchAllArticles(): Promise<Article[]> {
    const sites = getSites();
    const prefs = getPreferences();
    let allArticles: Article[] = [];

    const promises = sites.map(async (site) => {
        if (prefs.blockedSites.includes(site.url)) return;

        let finalFeed: any = null;
        let htmlContent: string | null = null;
        let effectiveUrl = site.url;

        // Step 1: Try fetching the configured URL
        try {
            const response = await axios.get(site.url, {
                timeout: 5000,
                headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }
            });
            const data = response.data;
            if (typeof data === 'string' && (data.trim().startsWith('<!DOCTYPE html') || data.trim().startsWith('<html'))) {
                htmlContent = data; // It's HTML, trigger fallback
            } else {
                finalFeed = await parser.parseString(data); // It's likely RSS
            }
        } catch (e) {
            // Initial fetch failed (404, 403, etc). We will try the root URL as fallback.
            // console.log(`[Fetch] Initial fail for ${site.url}, trying root...`);
        }

        // Step 2: Fallback to Root URL Discovery if no feed yet
        if (!finalFeed) {
            try {
                // If we already have HTML from the first hit, use it.
                // If not (because it failed), try fetching the root domain.
                if (!htmlContent) {
                    try {
                        const u = new URL(site.url);
                        const rootUrl = `${u.protocol}//${u.host}`;
                        const res = await axios.get(rootUrl, { timeout: 5000, headers: { 'User-Agent': USER_AGENT } });
                        htmlContent = res.data;
                        effectiveUrl = rootUrl;
                    } catch { /* Invalid URL or root fetch failed */ }
                }

                if (htmlContent) {
                    // A. Feed Discovery
                    const foundFeedUrl = await discoverFeed(htmlContent, effectiveUrl);
                    if (foundFeedUrl) {
                        try {
                            const subRes = await axios.get(foundFeedUrl, { timeout: 5000, headers: { 'User-Agent': USER_AGENT } });
                            finalFeed = await parser.parseString(subRes.data);
                        } catch { /* Discovery failed */ }
                    }

                    // B. HTML Scraping (Last Resort)
                    if (!finalFeed) {
                        const scraped = await scrapeHtml(htmlContent, site);
                        if (scraped.length > 0) {
                            allArticles.push(...scraped);
                            return;
                        }
                    }
                }
            } catch (e) { /* Total failure */ }
        }

        // Step 3: Parse Feed Items if we have a feed
        if (finalFeed) {
            try {
                const siteArticles = await Promise.all(finalFeed.items.slice(0, 50).map(async (item: any, index: number) => {
                    // 0. Try YouTube specific thumbnail (media:group -> media:thumbnail)
                    let imageUrl;
                    const mediaGroup = item.mediaGroup;
                    if (mediaGroup && mediaGroup['media:thumbnail']) {
                        const thumbs = mediaGroup['media:thumbnail'];
                        const thumb = Array.isArray(thumbs) ? thumbs[0] : thumbs;
                        if (thumb) {
                            // Check for direct properties or nested '$' properties (common in xml2js)
                            let foundUrl = thumb.url;
                            if (!foundUrl && thumb['$'] && thumb['$'].url) foundUrl = thumb['$'].url;

                            if (foundUrl) {
                                // Upgrade to HD if possible using standard YouTube matching
                                imageUrl = foundUrl.replace('hqdefault.jpg', 'maxresdefault.jpg');
                            }
                        }
                    }

                    // 1. Try media:content (Ars Technica, TechCrunch, etc.)
                    if (!imageUrl && item.mediaContent) {
                        const content = Array.isArray(item.mediaContent) ? item.mediaContent[0] : item.mediaContent;
                        if (content.url) imageUrl = content.url;
                        else if (content['$'] && content['$'].url) imageUrl = content['$'].url;
                    }

                    // 2. Try media:thumbnail (Standard RSS)
                    if (!imageUrl && item.mediaThumbnail) {
                        const thumb = Array.isArray(item.mediaThumbnail) ? item.mediaThumbnail[0] : item.mediaThumbnail;
                        if (thumb.url) imageUrl = thumb.url;
                        else if (thumb['$'] && thumb['$'].url) imageUrl = thumb['$'].url;
                    }

                    // 3. Try enc:enclosure (Science.org)
                    if (!imageUrl && item.encEnclosure) {
                        const enc = Array.isArray(item.encEnclosure) ? item.encEnclosure[0] : item.encEnclosure;
                        if (enc['$'] && enc['$']['rdf:resource']) imageUrl = enc['$']['rdf:resource'];
                        else if (enc.resource) imageUrl = enc.resource;
                    }

                    // 4. Try enclosure
                    if (!imageUrl) imageUrl = item.enclosure?.url;

                    // 5. Try parsing content for the first image
                    if (!imageUrl) {
                        const contentToCheck = item.content || item['content:encoded'] || item.description || '';
                        if (contentToCheck) {
                            const $ = cheerio.load(contentToCheck);
                            imageUrl = $('img').first().attr('src');
                        }
                    }

                    // 6. Deep Scraping Fallback (Meta Tags) - Only for the first 10 items to avoid network spray
                    if ((!imageUrl || !isImageUrl(imageUrl)) && (item.link || item.guid) && index < 10) {
                        const metaImg = await getMetaImage(item.link || item.guid);
                        if (metaImg) imageUrl = metaImg;
                    }

                    // 7. Final Validation
                    if (!isImageUrl(imageUrl)) imageUrl = undefined;

                    // 8. Get best summary
                    let summary = cleanSummary(item.contentSnippet);
                    if (!summary) summary = cleanSummary(item.description);
                    if (!summary) summary = cleanSummary(item.content);
                    if (!summary) summary = cleanSummary(item['content:encoded']);

                    const score = calculateScore(item, site, prefs);

                    return {
                        id: item.link || item.guid || Math.random().toString(),
                        title: (item.title || 'Untitled').replace(/\s+/g, ' ').trim(),
                        url: item.link || '',
                        sourceId: site.url,
                        sourceName: finalFeed.title || site.url,
                        topic: site.category,
                        imageUrl: imageUrl,
                        summary: summary.substring(0, 300) + (summary.length > 300 ? '...' : ''),
                        publishedAt: item.isoDate || new Date().toISOString(),
                        score
                    } as Article;
                }));
                allArticles.push(...siteArticles);
            } catch (e) {
                console.error(`Failed to process items for ${site.url}`);
            }
        }
    });

    await Promise.all(promises);

    // Shuffle the results for discovery
    for (let i = allArticles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allArticles[i], allArticles[j]] = [allArticles[j], allArticles[i]];
    }

    // Deduplicate articles based on URL and ID
    const uniqueArticles: Article[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();

    for (const article of allArticles) {
        // Prepare checks
        const id = article.id;
        const url = article.url;

        // If we have a real URL, ensure it's unique
        if (url && seenUrls.has(url)) continue;
        // If ID is already used, skip (or generate new? Better to skip dupes)
        if (seenIds.has(id)) continue;

        seenIds.add(id);
        if (url) seenUrls.add(url);
        uniqueArticles.push(article);
    }

    // Return random selection up to limit
    return uniqueArticles.slice(0, 200);
}
