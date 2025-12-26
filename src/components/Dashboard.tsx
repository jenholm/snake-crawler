"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Article } from "@/lib/types";
import { ArticleCard } from "./ArticleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, RefreshCw, Loader2 } from "lucide-react";

export function Dashboard() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [loading, setLoading] = useState(true);
    const [newSiteUrl, setNewSiteUrl] = useState("");
    const [newSiteCategory, setNewSiteCategory] = useState("");
    const [isAddOpen, setIsAddOpen] = useState(false);

    const fetchArticles = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/feeds');
            setArticles(res.data);
        } catch (e) {
            console.error("Failed to fetch", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchArticles();
    }, []);

    const handleAction = async (action: string, article: Article) => {
        try {
            if (action === 'click') {
                // Optimistic update? No need, just fire and forget
                await axios.post('/api/feeds', { action, payload: { siteUrl: article.sourceId, topic: article.topic } });
                return;
            }

            // For blocking/demoting, we want to update the view
            await axios.post('/api/feeds', {
                action,
                payload: { siteUrl: article.sourceId, topic: article.topic }
            });

            // Simple re-fetch to reflect changes (removed articles or re-sorted)
            // For a smoother UI, we could filter locally first
            if (action === 'block-site') {
                setArticles(prev => prev.filter(a => a.sourceId !== article.sourceId));
            } else {
                // Demotion might not remove it immediately unless strict re-sort, so re-fetch
                fetchArticles();
            }

        } catch (e) {
            console.error("Action failed", e);
        }
    };

    const handleAddSite = async () => {
        if (!newSiteUrl) return;
        try {
            await axios.post('/api/feeds', {
                action: 'add-site',
                payload: { url: newSiteUrl, category: newSiteCategory || 'Uncategorized' }
            });
            setNewSiteUrl("");
            setNewSiteCategory("");
            setIsAddOpen(false);
            // Refresh to maybe fetch from new site? 
            // Realistically fetching takes time, so maybe just show success and let the user refresh or trigger it manually
            alert("Site added! It may take a moment to scrape on next refresh.");
        } catch (e) {
            console.error("Failed to add site", e);
        }
    };

    return (
        <div className="min-h-screen bg-background p-6">
            <header className="mb-8 flex flex-col items-center justify-between gap-4 md:flex-row">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">Snake Crawler</h1>
                    <p className="text-muted-foreground">Aggregated feeds prioritized for you.</p>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchArticles} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>

                    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" /> Add Site
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add New Source</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="url" className="text-right">RSS/URL</Label>
                                    <Input
                                        id="url"
                                        value={newSiteUrl}
                                        onChange={e => setNewSiteUrl(e.target.value)}
                                        className="col-span-3"
                                        placeholder="https://example.com/feed"
                                    />
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="category" className="text-right">Category</Label>
                                    <Input
                                        id="category"
                                        value={newSiteCategory}
                                        onChange={e => setNewSiteCategory(e.target.value)}
                                        className="col-span-3"
                                        placeholder="Tech, Gaming, etc."
                                    />
                                </div>
                                <Button onClick={handleAddSite}>Save</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </header>

            {loading && articles.length === 0 ? (
                <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {articles.map((article) => (
                        <ArticleCard
                            key={article.id}
                            article={article}
                            onAction={handleAction}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
