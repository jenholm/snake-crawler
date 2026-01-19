"use client";

import { MicroQuestion } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain } from "lucide-react";

interface MicroQuestionCardProps {
    question: MicroQuestion;
    onAnswer: (questionId: string, answer: string) => void;
}

export function MicroQuestionCard({ question, onAnswer }: MicroQuestionCardProps) {
    return (
        <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4">
            <CardHeader className="flex flex-row items-center gap-3 pb-2 pt-4">
                <div className="bg-primary/10 p-2 rounded-lg">
                    <Brain className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <CardTitle className="text-sm font-semibold text-primary uppercase tracking-wider">AI Clarification</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{question.context}</p>
                </div>
            </CardHeader>
            <CardContent className="pb-4">
                <p className="text-sm font-medium mb-4">{question.question}</p>
                <div className="flex flex-wrap gap-2">
                    {question.options.map((option) => (
                        <Button
                            key={option}
                            variant="outline"
                            size="sm"
                            className="bg-background/50 hover:bg-primary/10 transition-colors"
                            onClick={() => onAnswer(question.id, option)}
                        >
                            {option}
                        </Button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
