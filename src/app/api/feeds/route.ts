import { NextRequest, NextResponse } from 'next/server';
import { fetchAllArticles } from '@/lib/feed';
import { refineInterestModel } from '@/lib/ai';
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
    const prefs = getPreferences();
    return NextResponse.json({
        articles,
        questions: prefs.pendingQuestions || []
    });
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

        case 'answer-question':
            const question = prefs.pendingQuestions.find(q => q.id === payload.id);
            if (question) {
                // 1. Remove from pending
                prefs.pendingQuestions = prefs.pendingQuestions.filter(q => q.id !== payload.id);
                // 2. Refine interest model using AI
                const refinedModel = await refineInterestModel(prefs.interestModel, question, payload.answer);
                if (refinedModel) {
                    prefs.interestModel = refinedModel;
                    // Rubric will be regenerated on next scoring pass
                    prefs.currentRubric = undefined;
                }
                savePreferences(prefs);
            }
            break;

        default:
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
}
