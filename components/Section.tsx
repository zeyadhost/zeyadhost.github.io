import React from 'react';
import { SectionProps } from '../types';

export const Section: React.FC<SectionProps> = ({ title, children, className = '' }) => {
  return (
    <section className={`mb-24 last:mb-0 ${className}`}>
      <h2 className="text-sm font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-500 mb-8 border-l-2 border-neutral-200 dark:border-neutral-800 pl-4 transition-colors duration-300">
        {title}
      </h2>
      <div className="pl-0 md:pl-4">
        {children}
      </div>
    </section>
  );
};