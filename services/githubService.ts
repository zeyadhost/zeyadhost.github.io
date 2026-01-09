import { Repository } from '../types';

export const fetchRepositories = async (username: string): Promise<Repository[]> => {
  try {
    const response = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=100`);
    
    if (!response.ok) {
        if (response.status === 404) {
            console.warn("User not found, returning empty list.");
            return [];
        }
        if (response.status === 403) {
             console.warn("Rate limit exceeded, returning empty list (or use mock data).");
             return [];
        }
      throw new Error('Failed to fetch repositories');
    }

    const data: Repository[] = await response.json();

    return data
      .filter(repo => !repo.fork)
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 6);
  } catch (error) {
    console.error('Error fetching GitHub data:', error);
    return [];
  }
};

export interface CommitInfo {
  sha: string;
  date: string;
  html_url: string;
}

export const fetchLatestCommit = async (repoFullName: string): Promise<CommitInfo | null> => {
  try {
    const response = await fetch(`https://api.github.com/repos/${repoFullName}/commits?per_page=1`);
    
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (data && data.length > 0) {
      return {
        sha: data[0].sha.substring(0, 7),
        date: data[0].commit.author.date,
        html_url: data[0].html_url
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching commit data:', error);
    return null;
  }
};