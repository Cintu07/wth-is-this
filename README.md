# wth-is-this 🔍

> Explain any project folder like you're 5

A powerful CLI tool that scans codebases and tells you what's going on in seconds.
What It Does

Scans any directory and creates a readable structure summary
Auto-detects tech stacks (React, Next.js, Python, Go, etc.)
Explains each folder in plain English
Finds red flags (massive files, duplicate code, old TODOs)
Analyzes git history and commit patterns
Detects unused dependencies
Exports reports to Markdown

## 🚀 Installation

### Option 1: Install Globally (Recommended)

```bash
npm install -g wth-is-this
```

### Option 2: Run from Source

```bash
git clone https://github.com/Cintu07/wth-is-this
cd wth-is-this
npm install
npm link
```

### Option 3: Use with npx

```bash
npx wth-is-this
```

## 📖 Usage

```bash
# Analyze current directory
wth

# Analyze specific folder
wth ./my-app

# Show git history analysis
wth --git

# Show only file tree
wth --tree

# Show only red flags
wth --redflags

# Export to Markdown
wth --export

# Output as JSON
wth --json
```

## ✨ Features

### Tech Stack Detection

Automatically identifies 30+ frameworks and tools:

- **Languages**: Node.js, Python, Go, Rust, Java, Ruby, PHP
- **Frontend**: React, Vue, Svelte, Next.js, Nuxt.js
- **Backend**: Express, Fastify, NestJS
- **Database**: Prisma, MongoDB, PostgreSQL, MySQL
- **Tools**: Docker, ESLint, Prettier, TypeScript, TailwindCSS
- **Testing**: Jest, Vitest, Cypress

### Red Flag Detection

- Files over 1000 lines
- Multiple package managers (npm + yarn + pnpm)
- Excessive console.log statements
- Duplicate component names
- Old TODOs (90+ days via git blame)
- Potentially unused dependencies

### Git Integration

- Total commit count
- Top contributors
- Recent commit history
- TODO age tracking via git blame

## 📊 Example Output

```
What This Project Probably Is:
"Full-stack web application"

Tech Stack
  Node.js
  React
  Next.js
  TailwindCSS
  Prisma
  PostgreSQL

Git Summary
  Total commits: 247
  Top contributors: Alice (134 commits), Bob (89 commits)

Structure
├─ src/ → Source code lives here
│ ├─ components/ → Reusable UI pieces
│ ├─ pages/ → Route handlers / page files
│ └─ lib/ → Shared utilities

Red Flags
  Massive file: Dashboard.jsx (1247 lines)
  12 console statements in api/auth.js
  Multiple package managers: npm + yarn
  Old TODO in Header.jsx (127 days old)
  Potentially unused dependencies: lodash, moment
```

## 🛠️ Project Structure

```
wth-is-this/
├── index.js          # Main CLI entry point
├── package.json      # Dependencies
├── README.md         # This file
└── LICENSE           # MIT License
```

## 🔧 How It Works

1. **Scanner**: Recursively walks directory tree, ignoring node_modules, .git, etc.
2. **Tech Detector**: Checks for config files and package.json dependencies
3. **Red Flag Analyzer**: Scans code for common issues
4. **Git Integration**: Uses simple-git to analyze repository history
5. **Unused Deps**: Parses imports and cross-references with package.json
6. **Export**: Generates Markdown reports with all findings

## 📋 Requirements

- Node.js 14+
- Git (optional, for git features)

## 🔨 Development

```bash
# Clone and setup
git clone https://github.com/Cintu07/wth-is-this
cd wth-is-this
npm install

# Make executable (Unix/Mac)
chmod +x index.js

# Test locally
node index.js

# Link globally
npm link
```

## 🤝 Contributing

Pull requests welcome! For major changes, please open an issue first.

## 📄 License

MIT © Cintu07

## 💡 Why This Exists

Developers waste hours figuring out unfamiliar repos. Onboarding is slow. Documentation is missing or outdated. This tool does the grunt work so you can ship faster.

**Built for developers who are tired of opening 47 files to understand a codebase.**

---

⭐️ Give a star if this project helped you!
