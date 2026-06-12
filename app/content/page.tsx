'use client';

import React, { useState } from 'react';
import { BookOpen, Megaphone, Scale } from 'lucide-react';
import { ParentGate } from '@/components/auth/ParentGate';
import { ContentCategoryManager } from '@/components/content/ContentCategoryManager';
import { AnnouncementManager } from '@/components/content/AnnouncementManager';
import { FamilyRulesManager } from '@/components/content/FamilyRulesManager';
import { cn } from '@/lib/utils';

type Tab = 'content' | 'announcements' | 'rules';

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'content', label: 'Content Queues', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'announcements', label: 'Announcements', icon: <Megaphone className="h-4 w-4" /> },
    { id: 'rules', label: 'Family Rules', icon: <Scale className="h-4 w-4" /> },
];

export default function ContentPage() {
    const [activeTab, setActiveTab] = useState<Tab>('content');
    const activeTabDef = tabs.find((t) => t.id === activeTab)!;

    return (
        <ParentGate>
            <div className="mx-auto w-full max-w-5xl px-4 md:px-6 py-8 space-y-6">

                {/* Hero */}
                <section className="rounded-3xl border border-border/60 bg-card px-6 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
                                Parent tools
                            </p>
                            <h1
                                className="text-3xl leading-tight text-foreground"
                                style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500, letterSpacing: '-0.02em' }}
                            >
                                Content &amp; Culture
                            </h1>
                            <p className="mt-1.5 text-sm text-muted-foreground/60">
                                Manage content queues, family announcements, and household rules.
                            </p>
                        </div>
                    </div>

                    {/* Tab pills */}
                    <div className="mt-5 flex flex-wrap gap-2">
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={cn(
                                        'flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all duration-200',
                                        isActive
                                            ? 'border-foreground/20 bg-foreground text-background'
                                            : 'border-border/60 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
                                    )}
                                >
                                    {tab.icon}
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Primary content */}
                <section>
                    <div className="mb-4 flex items-center gap-2 text-muted-foreground/60">
                        {activeTabDef.icon}
                        <span className="text-[10px] uppercase tracking-[0.18em]">{activeTabDef.label}</span>
                    </div>
                    {activeTab === 'content' && <ContentCategoryManager />}
                    {activeTab === 'announcements' && <AnnouncementManager />}
                    {activeTab === 'rules' && <FamilyRulesManager />}
                </section>
            </div>
        </ParentGate>
    );
}
