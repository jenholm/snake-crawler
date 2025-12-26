import { NextRequest, NextResponse } from 'next/server';
import { fetchAllArticles } from '@/lib/feed';
import {
    addSiteToDisk,
    getPreferences,
    savePreferences,
    toggleBlockSite,
    updateSiteScore,
    updateTopicScore
} from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
    const articles = await fetchAllArticles();
    return NextResponse.json(articles);
}

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { action, payload } = body;

    const prefs = getPreferences();

    switch (action) {
        case 'click':
            // Increase score for site and topic
            updateSiteScore(payload.siteUrl, 1);
            updateTopicScore(payload.topic, 0.5);
            break;

        case 'block-site':
            toggleBlockSite(payload.siteUrl);
            break;

        case 'demote-site':
            if (!prefs.demotedSites.includes(payload.siteUrl)) {
                prefs.demotedSites.push(payload.siteUrl);
                // Also negative score
                updateSiteScore(payload.siteUrl, -5);
            }
            savePreferences(prefs);
            break;

        case 'demote-topic':
            if (!prefs.demotedTopics.includes(payload.topic)) {
                prefs.demotedTopics.push(payload.topic);
                updateTopicScore(payload.topic, -5);
            }
            savePreferences(prefs);
            break;

        case 'add-site':
            addSiteToDisk(payload.url, payload.category);
            break;

        default:
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
}
