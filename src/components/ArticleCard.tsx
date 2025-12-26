"use client";

import { Article } from "@/lib/types";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

const getDomain = (url: string) => {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
};

interface ArticleCardProps {
    article: Article;
    onAction: (action: string, article: Article) => void;
}

export function ArticleCard({ article, onAction }: ArticleCardProps) {
    const [clicked, setClicked] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleClick = () => {
        setClicked(true);
        onAction('click', article);
        window.open(article.url, '_blank');
    };

    return (
        <Card className={`group relative flex flex-col overflow-hidden transition-all hover:shadow-lg ${clicked ? 'opacity-60 grayscale-[50%]' : ''}`}>
            {/* Image Section */}
            <div
                className="relative h-48 w-full cursor-pointer overflow-hidden bg-muted"
                onClick={handleClick}
            >
                {article.imageUrl && !imageError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={article.imageUrl}
                        alt={article.title}
                        onError={() => setImageError(true)}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-slate-50 to-slate-200 p-4 dark:from-slate-800 dark:to-slate-900">
                        <p className="font-serif text-sm italic leading-relaxed text-muted-foreground line-clamp-4 opacity-80">
                            &ldquo;{article.summary || article.title}&rdquo;
                        </p>
                        <div className="flex items-center gap-2 opacity-60">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={`https://www.google.com/s2/favicons?domain=${getDomain(article.url)}&sz=64`}
                                alt=""
                                className="h-4 w-4 rounded-sm"
                            />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{article.sourceName}</span>
                        </div>
                    </div>
                )}

                {/* Score Badge (Debug/Info) */}
                <Badge variant="secondary" className="absolute left-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                    Score: {Math.round(article.score)}
                </Badge>
            </div>

            <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="shrink-0 text-[10px] uppercase">{article.topic}</Badge>
                    <span className="text-[10px] text-muted-foreground">{new Date(article.publishedAt).toLocaleDateString()}</span>
                </div>
                <h3
                    className="line-clamp-2 cursor-pointer text-lg font-semibold leading-tight hover:underline"
                    onClick={handleClick}
                >
                    {article.title}
                </h3>
                <p className="text-xs text-muted-foreground">{article.sourceName}</p>
            </CardHeader>

            <CardContent className="flex-1 p-0">
                {/* Spacer */}
            </CardContent>

            {/* Action Menu - Floating Top Right */}
            <div className="absolute right-2 top-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full opacity-80 backdrop-blur-sm hover:opacity-100">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onAction('block-site', article)} className="text-destructive">
                            Stop Scraping This Site
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction('demote-site', article)}>
                            Low Priority Site
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction('demote-topic', article)}>
                            Low Priority Topic
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </Card>
    );
}
