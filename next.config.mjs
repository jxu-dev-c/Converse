/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: import.meta.dirname },
  // Avoid generating unrequested AGENTS.md / CLAUDE.md files during local runs.
  agentRules: false,
};

export default nextConfig;
