import OpenAI from 'openai';
import { Article, InterestModel, ScoringRubric, ContentCard, MicroQuestion } from './types';
import { savePreferences, getPreferences, updateSourceReputation, getCategories } from './storage';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function generateRubric(interestModel: InterestModel): Promise<ScoringRubric | null> {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your_openai_api_key_here')) return null;

    try {
        const categories = getCategories();
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                {
                    role: "system",
                    content: `You are an AI architect. Convert the user's interest profile into a deterministic scoring rubric.
Stable Preferences: "${interestModel.stablePreferences}"
Session Intent: "${interestModel.sessionIntent}"
Available Categories in Feed: [${categories.join(', ')}]

Goal: Score articles. Reward user interests highly, but ensure categories from the feed are not unfairly penalized if they are neutral.
Output a JSON object:
{
  "version": 4,
  "topicWeights": {"topic_name": weight_0_to_1},
  "noveltyPreference": 0.5,
  "technicalDepthPreference": 0.5,
  "instantJunkRules": ["rule 1", "rule 2"]
}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (content) {
            const rubric = JSON.parse(content) as ScoringRubric;
            rubric.generatedAt = new Date().toISOString();
            return rubric;
        }
    } catch (e) {
        console.error('Failed to generate rubric:', e);
    }
    return null;
}

export async function triageArticles(articles: Article[], rubric: ScoringRubric): Promise<Article[]> {
    if (!process.env.OPENAI_API_KEY) return articles;

    const batchSize = 50;
    const triagePromises = [];

    for (let i = 0; i < articles.length; i += batchSize) {
        const batch = articles.slice(i, i + batchSize);
        triagePromises.push((async () => {
            const input = batch.map((a, idx) => `${idx}: T:${a.title} | D:${a.summary || ''}`).join('\n');
            try {
                const response = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo-0125",
                    messages: [
                        {
                            role: "system",
                            content: `Triage these articles based on this rubric: ${JSON.stringify(rubric)}.
Goal: Cheaply filter out junk (SEO traps, clickbait, irrelevant content).
Output JSON: {"results": [{"idx": 0, "status": "reject|maybe|good", "flags": ["seo_trap", "clickbait"]}]}`
                        },
                        { role: "user", content: input }
                    ],
                    response_format: { type: "json_object" }
                });

                const content = response.choices[0].message.content;
                if (content) {
                    const results = JSON.parse(content).results;
                    batch.forEach((article, idx) => {
                        const res = results.find((r: any) => r.idx === idx);
                        article.triageStatus = res?.status || 'maybe';
                        article.seoFlags = res?.flags || [];
                    });
                }
            } catch (e) {
                console.error('Triage failed for batch', e);
            }
        })());
    }

    await Promise.all(triagePromises);
    return articles;
}

export async function extractContentCard(article: Article): Promise<ContentCard | null> {
    if (!process.env.OPENAI_API_KEY || !article.fullText) return null;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                {
                    role: "system",
                    content: `Extract a semantic content card from this text. 
Output JSON: 
{
  "summary": ["bullet 1", "bullet 2"],
  "claims": ["fact 1"],
  "entities": {"people": [], "companies": [], "technologies": []},
  "metadata": {"depth": "shallow|deep", "originality": 0.8, "is_news": true, "is_tutorial": false, "is_analysis": true}
}`
                },
                { role: "user", content: article.fullText.slice(0, 4000) } // Limit to first 4k chars
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        return content ? (JSON.parse(content) as ContentCard) : null;
    } catch (e) {
        console.error('Content extraction failed', e);
        return null;
    }
}

export async function detectSemanticDuplicates(articles: Article[]): Promise<Article[]> {
    if (!process.env.OPENAI_API_KEY || articles.length < 2) return articles;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                {
                    role: "system",
                    content: `Identify semantically identical stories in this list. 
Group them by clusters. For each cluster, pick the 'canonical' (best) article index.
Output JSON: {"clusters": [{"canonical_idx": 0, "member_indices": [0, 1, 2]}]}`
                },
                {
                    role: "user",
                    content: articles.map((a, i) => `${i}: ${a.title}`).join('\n')
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (content) {
            const data = JSON.parse(content);
            if (!data.clusters || !Array.isArray(data.clusters)) {
                console.log(`[Deduplication] No clusters found in AI response.`);
                return articles;
            }

            console.log(`[Deduplication] Clusterizing ${articles.length} articles into ${data.clusters.length} stories...`);
            const seenIndices = new Set<number>();
            const uniqueArticles: Article[] = [];

            for (const cluster of data.clusters) {
                if (typeof cluster.canonical_idx !== 'number') continue;
                const canonical = articles[cluster.canonical_idx];
                if (!canonical) continue;

                canonical.similarArticles = (cluster.member_indices || [])
                    .filter((idx: any) => typeof idx === 'number' && idx !== cluster.canonical_idx && articles[idx])
                    .map((idx: number) => articles[idx]);

                (cluster.member_indices || []).forEach((idx: any) => {
                    if (typeof idx === 'number') seenIndices.add(idx);
                });
                uniqueArticles.push(canonical);
            }

            // Add articles that weren't in any cluster
            articles.forEach((a, i) => {
                if (!seenIndices.has(i)) uniqueArticles.push(a);
            });

            return uniqueArticles.length > 0 ? uniqueArticles : articles;
        }
    } catch (e) {
        console.error('Duplicate detection failed', e);
    }
    return articles;
}

export async function planNextLinks(links: Array<{ url: string, context: string }>, rubric: ScoringRubric): Promise<string[]> {
    if (!process.env.OPENAI_API_KEY || links.length === 0) return [];

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                {
                    role: "system",
                    content: `You are a web crawler planner. Rank these candidate links based on this rubric: ${JSON.stringify(rubric)}.
Goal: Only follow high-signal links related to the user's interests. Ignore junk (Ads, Privacy, Newsletter, Sidebar junk).
Output JSON: {"follow": [0, 2]}`
                },
                {
                    role: "user",
                    content: links.map((l, i) => `${i}: [Context: ${l.context}] URL: ${l.url}`).join('\n')
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (content) {
            const followIndices = JSON.parse(content).follow;
            return followIndices.map((idx: number) => links[idx]?.url).filter(Boolean);
        }
    } catch (e) {
        console.error('Link planning failed', e);
    }
    return [];
}

export async function mutateDiscoveryQueries(rubric: ScoringRubric): Promise<string[]> {
    if (!process.env.OPENAI_API_KEY) return [];

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                {
                    role: "system",
                    content: `Based on this rubric: ${JSON.stringify(rubric)}, propose 5 search queries or discovery keywords to find more high-signal content. 
Avoid drift into nonsense.
Output JSON: {"queries": ["...", "..."]}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        return content ? JSON.parse(content).queries : [];
    } catch (e) {
        console.error('Query mutation failed', e);
        return [];
    }
}

export async function scoreArticlesWithAI(articles: Article[]): Promise<Article[]> {
    const prefs = getPreferences();
    if (!process.env.OPENAI_API_KEY) return articles;

    let rubric = prefs.currentRubric;
    if (!rubric || (Date.now() - new Date(rubric.generatedAt).getTime() > 24 * 60 * 60 * 1000)) {
        rubric = await generateRubric(prefs.interestModel) || undefined;
        if (rubric) {
            prefs.currentRubric = rubric;
            savePreferences(prefs);
        }
    }
    if (!rubric) return articles;

    // 1. Triage (Metadata only)
    console.log(`[AI Scoring] Triaging ${articles.length} articles...`);
    const triageResults = await triageArticles(articles, rubric);
    const pool = triageResults.filter(a => a.triageStatus !== 'reject');
    console.log(`[AI Scoring] Triage complete. Pool size: ${pool.length} (Rejected ${articles.length - pool.length})`);

    if (pool.length === 0) {
        console.warn(`[AI Scoring] WARNING: All articles rejected by triage. Returning original list as fallback.`);
        return articles;
    }

    // 2. High-Quality Selection (Stratified Sampling for Diversity)
    // We want to ensure articles from every source have a chance at the AI pass
    if (pool.length === 0) {
        console.log(`[AI Scoring] Triage rejected everything. Fallback to original pool.`);
        return articles;
    }

    const sourceGroups = new Map<string, Article[]>();
    pool.forEach(a => {
        const group = sourceGroups.get(a.sourceId) || [];
        group.push(a);
        sourceGroups.set(a.sourceId, group);
    });

    const candidateSet = new Set<Article>();

    // Pick top 2 from each source
    sourceGroups.forEach((group) => {
        group.sort((a, b) => b.score - a.score);
        group.slice(0, 2).forEach(a => candidateSet.add(a));
    });

    // Fill the rest with globally top articles up to 100
    const remainingPool = pool.filter(a => !candidateSet.has(a));
    remainingPool.sort((a, b) => b.score - a.score);

    const fillCount = Math.max(0, 100 - candidateSet.size);
    remainingPool.slice(0, fillCount).forEach(a => candidateSet.add(a));

    const candidates = Array.from(candidateSet);
    const candidateIds = new Set(candidates.map(a => a.id));
    const nonCandidates = pool.filter(a => !candidateIds.has(a.id));

    console.log(`[AI Scoring] Stratified candidates: ${candidates.length}. Passive feed: ${nonCandidates.length}`);

    // 3. Content Card Extraction (Only for high-potential items)
    // This should happen for the candidates selected for detailed scoring
    await Promise.all(candidates.map(async (article) => {
        if (article.fullText && !article.contentCard) {
            article.contentCard = await extractContentCard(article) || undefined;
        }
    }));

    console.log(`[AI Scoring] Detailed scoring top ${candidates.length} candidates...`);
    const batchSize = 10;
    const scoredCandidates: Article[] = [];

    // Parallelize batches for speed
    const scoringPromises = [];
    for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        scoringPromises.push((async () => {
            const input = batch.map((a, idx) => {
                let desc = a.summary;
                if (a.contentCard) {
                    desc = `[AI SUMMARY]: ${a.contentCard.summary.join('. ')}\n[DEPTH]: ${a.contentCard.metadata.depth}`;
                }
                return `${idx}: ${a.title}\n${desc}\n[FLAGS]: ${a.seoFlags.join(', ')}`;
            }).join('\n---\n');

            try {
                const response = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo-0125",
                    messages: [
                        {
                            role: "system",
                            content: `Score these articles using this rubric: ${JSON.stringify(rubric)}.
Reward depth and originality. Penalize SEO flags. 
Output JSON: {"scores": [{"idx": 0, "overall": 0.8, "topic_match": 0.9, "novelty": 0.5, "depth": 0.7, "credibility": 0.8, "junk_risk": 0.1, "why": ["..."], "filters_triggered": []}]}`
                        },
                        { role: "user", content: input }
                    ],
                    response_format: { type: "json_object" }
                });

                const content = response.choices[0].message.content;
                if (content) {
                    const results = JSON.parse(content).scores;
                    batch.forEach((article, idx) => {
                        const res = results.find((r: any) => r.idx === idx);
                        if (res) {
                            article.score = res.overall * 100;
                            article.explanation = res;
                        }
                    });
                }
            } catch (e) {
                console.error('Detailed scoring failed for batch', e);
            }
            return batch;
        })());
    }

    const results = await Promise.all(scoringPromises);
    scoredCandidates.push(...results.flat());

    const finalScored = [...scoredCandidates, ...nonCandidates];

    // 4. Source Diversity Penalty & Reputation Integration
    const seenSources = new Map<string, number>();
    finalScored.forEach(a => {
        // Source Reputation Boost/Penalty
        const rep = prefs.sourceReputation[a.sourceId];
        if (rep) {
            // Boost if passRate > 0.8, Penalty if < 0.3
            if (rep.passRate > 0.8) a.score *= 1.1;
            if (rep.passRate < 0.3) a.score *= 0.7;
            // Boost based on historical average score
            a.score = (a.score * 0.9) + (rep.avgScore * 0.1);
        }

        const count = seenSources.get(a.sourceId) || 0;
        if (count > 2) {
            a.score *= 0.8;
        }
        seenSources.set(a.sourceId, count + 1);

        // Update Reputation Metrics (Asynchronously)
        updateSourceReputation(a.sourceId, {
            passed: a.triageStatus !== 'reject',
            score: a.score
        });
    });

    // 5. Semantic Deduplication (Phase 3)
    const uniqueStories = await detectSemanticDuplicates(finalScored);

    // 6. Active Learning: Propose micro-questions if we have enough data (Phase 4)
    if (uniqueStories.length > 20) {
        const questions = await generateMicroQuestions(uniqueStories.slice(0, 10), rubric);
        if (questions.length > 0) {
            prefs.pendingQuestions = [...prefs.pendingQuestions, ...questions].slice(-5);
            savePreferences(prefs);
        }
    }

    return uniqueStories;
}

export async function generateMicroQuestions(articles: Article[], rubric: ScoringRubric): Promise<MicroQuestion[]> {
    if (!process.env.OPENAI_API_KEY || articles.length === 0) return [];

    const prefs = getPreferences();

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                {
                    role: "system",
                    content: `You are a Curator-Learner Agent. Your goal is to refine the user's interest model by asking high-level micro-questions.
Current Interest Model:
Stable: "${prefs.interestModel.stablePreferences}"
Session: "${prefs.interestModel.sessionIntent}"

Analyzed Article Topics (last feed):
${articles.map(a => `- ${a.title} (${a.topic})`).join('\n')}

INSTRUCTIONS:
1. DO NOT ask "Reading Comprehension" questions about article content (e.g., "What are the features of X?").
2. DO NOT ask questions that can be answered by reading the article title.
3. DO focus on CATEGORICAL AMBIGUITIES and USER PREFERENCE TRADE-OFFS.
4. Focus on "Why" and "More/Less":
   - "We see many articles on [X]. Do you want more technical depth or more high-level news on this?"
   - "You seem interested in [X], but we also found [Y]. Should we prioritize [Y] in your session intent?"
5. Keep options concise (2-4 options).

Output JSON: {"questions": [{"id": "uniq_id", "question": "...", "options": ["...", "..."], "context": "Reason for asking based on interests", "topic": "Category"}]}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        return content ? JSON.parse(content).questions : [];
    } catch (e) {
        console.error('Failed to generate micro-questions', e);
        return [];
    }
}

export async function refineInterestModel(model: InterestModel, question: MicroQuestion, answer: string): Promise<InterestModel | null> {
    if (!process.env.OPENAI_API_KEY) return null;

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                {
                    role: "system",
                    content: `You are an interest profile architect. Evolve the user's interest model based on their answer to a micro-question.
Current Model: ${JSON.stringify(model)}
Question: "${question.question}"
Answer: "${answer}"
Context: "${question.context}"

Update the 'stablePreferences' (long-term) and 'sessionIntent' (short-term) fields to reflect this new preference.
Be specific but concise.
Output JSON: {"stablePreferences": "...", "sessionIntent": "..."}`
                }
            ],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        return content ? JSON.parse(content) as InterestModel : null;
    } catch (e) {
        console.error('Failed to refine interest model', e);
        return null;
    }
}
