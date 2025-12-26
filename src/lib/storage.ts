import fs from 'fs';
import path from 'path';
import { SiteConfig, UserPreferences } from './types';

const DATA_DIR = path.join(process.cwd(), 'src/data');
const SITES_FILE = path.join(DATA_DIR, 'sites.txt');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

export function getSites(): SiteConfig[] {
    if (!fs.existsSync(SITES_FILE)) return [];
    const content = fs.readFileSync(SITES_FILE, 'utf-8');
    return content.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
            const [url, category] = line.split('|');
            return { url: url.trim(), category: category?.trim() || 'Uncategorized' };
        });
}

export function addSiteToDisk(url: string, category: string) {
    const line = `\n${url}|${category}`;
    fs.appendFileSync(SITES_FILE, line);
}

const DEFAULT_PREFS: UserPreferences = {
    blockedSites: [],
    demotedSites: [],
    demotedTopics: [],
    siteScores: {},
    topicScores: {},
    clickHistory: []
};

export function getPreferences(): UserPreferences {
    if (!fs.existsSync(STORE_FILE)) {
        return DEFAULT_PREFS;
    }
    try {
        const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
        return { ...DEFAULT_PREFS, ...data };
    } catch (e) {
        return DEFAULT_PREFS;
    }
}

export function savePreferences(prefs: UserPreferences) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(prefs, null, 2));
}

export function updateSiteScore(siteUrl: string, delta: number) {
    const prefs = getPreferences();
    const current = prefs.siteScores[siteUrl] || 0;
    prefs.siteScores[siteUrl] = current + delta;
    savePreferences(prefs);
}

export function updateTopicScore(topic: string, delta: number) {
    const prefs = getPreferences();
    const current = prefs.topicScores[topic] || 0;
    prefs.topicScores[topic] = current + delta;
    savePreferences(prefs);
}

export function toggleBlockSite(siteUrl: string) {
    const prefs = getPreferences();
    if (prefs.blockedSites.includes(siteUrl)) {
        prefs.blockedSites = prefs.blockedSites.filter(s => s !== siteUrl);
    } else {
        prefs.blockedSites.push(siteUrl);
    }
    savePreferences(prefs);
}
