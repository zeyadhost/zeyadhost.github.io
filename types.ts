import React from 'react';

export interface Repository {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  fork: boolean;
  updated_at: string;
}

export type TechCategory = 'Languages' | 'Frameworks' | 'Infrastructure' | 'Tooling';

export interface TechItem {
  name: string;
  category: TechCategory;
}

export interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}