import React, { useEffect, useState } from 'react';
import { Github, ArrowUpRight, Moon, Sun } from 'lucide-react';
import { fetchRepositories, fetchLatestCommit, CommitInfo } from './services/githubService';
import { GITHUB_USERNAME, TECH_STACK, GITHUB_URL, PORTFOLIO_REPO } from './constants';
import { Repository, TechCategory } from './types';
import { Section } from './components/Section';

const getRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  const minutes = Math.floor(diffInSeconds / 60);
  if (diffInSeconds < 3600) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(diffInSeconds / 3600);
  if (diffInSeconds < 86400) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(diffInSeconds / 86400);
  if (diffInSeconds < 2592000) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
};

const App: React.FC = () => {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [commit, setCommit] = useState<CommitInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  };

  useEffect(() => {
    const loadData = async () => {
      let data = await fetchRepositories(GITHUB_USERNAME);
      
      if (data.length === 0) {
        data = [
            { id: 1, name: "system-monitor", description: "Real-time infrastructure monitoring tool written in Rust.", html_url: "#", language: "Rust", stargazers_count: 124, fork: false, updated_at: "2023-10-01" },
            { id: 2, name: "minimal-api", description: "A high-performance REST API starter kit.", html_url: "#", language: "Go", stargazers_count: 89, fork: false, updated_at: "2023-11-15" },
            { id: 3, name: "dotfiles", description: "My personalized system configuration.", html_url: "#", language: "Lua", stargazers_count: 240, fork: false, updated_at: "2023-09-20" },
            { id: 4, name: "react-primitives", description: "Unstyled, accessible UI components.", html_url: "#", language: "TypeScript", stargazers_count: 56, fork: false, updated_at: "2023-12-05" },
        ];
      }
      setRepos(data);

      const commitData = await fetchLatestCommit(PORTFOLIO_REPO);
      setCommit(commitData);

      setLoading(false);
    };

    loadData();
  }, []);

  const categories: TechCategory[] = ['Languages', 'Frameworks', 'Infrastructure', 'Tooling'];

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-6 py-12 md:py-24 antialiased transition-colors duration-300 dark:bg-black">
      
      <nav className="flex justify-end mb-12 md:mb-20">
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-neutral-200 dark:focus:ring-neutral-800"
          aria-label="Toggle dark mode"
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 text-neutral-600" />
          ) : (
            <Sun className="w-5 h-5 text-neutral-400" />
          )}
        </button>
      </nav>

      <header className="mb-32">
        <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-black dark:text-white mb-6 transition-colors duration-300">
          Zeyad
        </h1>
        <p className="text-xl md:text-2xl text-neutral-800 dark:text-neutral-300 font-light max-w-xl leading-relaxed transition-colors duration-300">
          a random "programmer"
        </p>
      </header>

      <Section title="About">
        <div className="prose prose-neutral prose-lg text-neutral-800 dark:text-neutral-300 leading-relaxed max-w-none transition-colors duration-300">
          <p className="mb-6">
            I really like building websites and backend systems. I focus on making things simple 
            and fast. I've been coding for a few years and I'm always trying to learn more about how computers work.
          </p>
          <p>
            I enjoy breaking down hard problems into smaller pieces. Whether it is fixing database 
            issues or making APIs, I just want my code to work well and be easy to understand.
          </p>
        </div>
      </Section>

      <Section title="Stack">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="font-mono text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-4 transition-colors duration-300">
                {category}
              </h3>
              <ul className="flex flex-col gap-2">
                {TECH_STACK.filter((item) => item.category === category).map((item) => (
                  <li key={item.name} className="text-neutral-900 dark:text-neutral-200 text-base font-normal transition-colors duration-300">
                    {item.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Selected Repositories">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-24 bg-neutral-100 dark:bg-neutral-900 rounded-sm w-full"></div>
            <div className="h-24 bg-neutral-100 dark:bg-neutral-900 rounded-sm w-full"></div>
            <div className="h-24 bg-neutral-100 dark:bg-neutral-900 rounded-sm w-full"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {repos.map((repo) => (
              <a
                key={repo.id}
                href={repo.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block p-6 border border-neutral-200 dark:border-neutral-800 hover:border-black dark:hover:border-white transition-all duration-300 bg-white dark:bg-black hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-medium text-black dark:text-white group-hover:underline decoration-1 underline-offset-4 transition-colors duration-300">
                    {repo.name}
                  </h3>
                  <ArrowUpRight className="w-4 h-4 text-neutral-400 dark:text-neutral-500 group-hover:text-black dark:group-hover:text-white transition-colors duration-300" />
                </div>
                <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-4 line-clamp-2 leading-relaxed transition-colors duration-300">
                  {repo.description || "No description provided."}
                </p>
                <div className="flex items-center gap-4 text-xs font-mono text-neutral-500 dark:text-neutral-500 transition-colors duration-300">
                  {repo.language && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-neutral-800 dark:bg-neutral-200 rounded-full transition-colors duration-300"></span>
                      {repo.language}
                    </span>
                  )}
                  {repo.stargazers_count > 0 && (
                    <span className="flex items-center gap-1">
                      ★ {repo.stargazers_count}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </Section>

      <footer className="mt-32 pt-8 border-t border-neutral-100 dark:border-neutral-900 transition-colors duration-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-colors duration-300 text-sm font-medium"
          >
            <Github className="w-4 h-4" />
            <span>GitHub</span>
          </a>

          {commit && (
            <a 
              href={`https://github.com/${PORTFOLIO_REPO}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-neutral-400 dark:text-neutral-600 hover:text-black dark:hover:text-white transition-all duration-300 opacity-50 hover:opacity-100"
            >
              Build {commit.sha} from about {getRelativeTime(commit.date)}.
            </a>
          )}
        </div>
      </footer>
    </main>
  );
};

export default App;