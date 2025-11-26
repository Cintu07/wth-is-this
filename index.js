#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const boxen = require('boxen');
const ora = require('ora');
const gradient = require('gradient-string');
const figlet = require('figlet');
const simpleGit = require('simple-git');

// ============================================================================
// CORE: SCANNER
// ============================================================================

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.cache', 
  'coverage', '.vscode', '.idea', '__pycache__', 'vendor', 'target'
]);

const IGNORE_FILES = new Set([
  '.DS_Store', 'thumbs.db', '.env', '.env.local', 'package-lock.json', 
  'yarn.lock', 'pnpm-lock.yaml'
]);

function scanDirectory(dirPath, depth = 0, maxDepth = 3) {
  const structure = { dirs: [], files: [], compressed: [] };
  
  if (depth > maxDepth) return structure;
  
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (IGNORE_DIRS.has(item)) {
          structure.compressed.push(item);
        } else {
          const subStructure = scanDirectory(fullPath, depth + 1, maxDepth);
          structure.dirs.push({
            name: item,
            path: fullPath,
            ...subStructure
          });
        }
      } else if (!IGNORE_FILES.has(item)) {
        structure.files.push({
          name: item,
          path: fullPath,
          size: stat.size,
          lines: stat.size > 0 ? countLines(fullPath) : 0
        });
      }
    }
  } catch (err) {
    // Silent fail for permission errors
  }
  
  return structure;
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

// ============================================================================
// CORE: TECH DETECTOR
// ============================================================================

function detectTechStack(dirPath, structure) {
  const stack = [];
  const configs = {
    'package.json': ['Node.js', 'JavaScript/TypeScript'],
    'requirements.txt': ['Python'],
    'Pipfile': ['Python', 'Pipenv'],
    'pyproject.toml': ['Python', 'Poetry'],
    'Cargo.toml': ['Rust'],
    'go.mod': ['Go'],
    'pom.xml': ['Java', 'Maven'],
    'build.gradle': ['Java/Kotlin', 'Gradle'],
    'Gemfile': ['Ruby'],
    'composer.json': ['PHP', 'Composer'],
    'Dockerfile': ['Docker'],
    'docker-compose.yml': ['Docker Compose'],
    '.eslintrc': ['ESLint'],
    '.eslintrc.js': ['ESLint'],
    '.prettierrc': ['Prettier'],
    'tsconfig.json': ['TypeScript'],
    'next.config.js': ['Next.js'],
    'nuxt.config.js': ['Nuxt.js'],
    'vite.config.js': ['Vite'],
    'webpack.config.js': ['Webpack'],
    'tailwind.config.js': ['TailwindCSS'],
    'vercel.json': ['Vercel'],
  };

  // Check root files
  const rootFiles = fs.readdirSync(dirPath);
  for (const [file, techs] of Object.entries(configs)) {
    if (rootFiles.includes(file) || rootFiles.includes(file.split('/')[0])) {
      stack.push(...techs);
    }
  }

  // Check for Prisma
  if (fs.existsSync(path.join(dirPath, 'prisma', 'schema.prisma'))) {
    stack.push('Prisma');
  }

  // Parse package.json for frameworks
  const pkgPath = path.join(dirPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (deps.react) stack.push('React');
      if (deps.vue) stack.push('Vue');
      if (deps.svelte) stack.push('Svelte');
      if (deps.express) stack.push('Express');
      if (deps.fastify) stack.push('Fastify');
      if (deps['@nestjs/core']) stack.push('NestJS');
      if (deps.mongoose) stack.push('MongoDB', 'Mongoose');
      if (deps.pg) stack.push('PostgreSQL');
      if (deps.mysql) stack.push('MySQL');
      if (deps.jest) stack.push('Jest');
      if (deps.vitest) stack.push('Vitest');
      if (deps.cypress) stack.push('Cypress');
    } catch {}
  }

  return [...new Set(stack)]; // Remove duplicates
}

// ============================================================================
// CORE: UNUSED DEPENDENCIES DETECTOR
// ============================================================================

function detectUnusedDeps(dirPath) {
  const pkgPath = path.join(dirPath, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];
  
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    
    // Collect all imports from JS/TS files
    const imports = new Set();
    
    function scanImports(struct) {
      for (const file of struct.files) {
        if (file.name.match(/\.(js|jsx|ts|tsx)$/)) {
          try {
            const content = fs.readFileSync(file.path, 'utf8');
            const importMatches = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
            const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
            
            [...importMatches, ...requireMatches].forEach(match => {
              const pkg = match.match(/['"]([^'"]+)['"]/)?.[1];
              if (pkg && !pkg.startsWith('.') && !pkg.startsWith('/')) {
                const basePkg = pkg.split('/')[0];
                imports.add(basePkg.startsWith('@') ? pkg.split('/').slice(0, 2).join('/') : basePkg);
              }
            });
          } catch {}
        }
      }
      
      for (const dir of struct.dirs) {
        scanImports(dir);
      }
    }
    
    const structure = scanDirectory(dirPath, 0, 5);
    scanImports(structure);
    
    // Find unused
    const unused = deps.filter(dep => !imports.has(dep));
    return unused.slice(0, 5); // Limit to 5
  } catch {
    return [];
  }
}

// ============================================================================
// CORE: RED FLAGS DETECTOR
// ============================================================================

async function detectRedFlags(dirPath, structure) {
  const flags = [];
  
  // Check for huge files
  function checkFiles(struct) {
    for (const file of struct.files) {
      if (file.lines > 1000) {
        flags.push(`Massive file: ${file.name} (${file.lines} lines)`);
      }
      
      // Check for console.logs
      if (file.name.match(/\.(js|ts|jsx|tsx)$/)) {
        try {
          const content = fs.readFileSync(file.path, 'utf8');
          const consoleCount = (content.match(/console\.(log|warn|error)/g) || []).length;
          if (consoleCount > 5) {
            flags.push(`${consoleCount} console statements in ${file.name}`);
          }
        } catch {}
      }
    }
    
    for (const dir of struct.dirs) {
      checkFiles(dir);
    }
  }
  
  checkFiles(structure);
  
  // Check for duplicate names (case-insensitive)
  const fileNames = [];
  function collectNames(struct) {
    for (const file of struct.files) {
      fileNames.push({ name: file.name.toLowerCase(), original: file.name });
    }
    for (const dir of struct.dirs) {
      collectNames(dir);
    }
  }
  collectNames(structure);
  
  const nameMap = {};
  fileNames.forEach(({ name, original }) => {
    if (!nameMap[name]) nameMap[name] = [];
    nameMap[name].push(original);
  });
  
  Object.entries(nameMap).forEach(([name, originals]) => {
    if (originals.length > 1) {
      flags.push(`Duplicate files: ${[...new Set(originals)].join(', ')}`);
    }
  });
  
  // Check for multiple package managers
  const pkgManagers = [];
  const rootFiles = fs.readdirSync(dirPath);
  if (rootFiles.includes('package-lock.json')) pkgManagers.push('npm');
  if (rootFiles.includes('yarn.lock')) pkgManagers.push('yarn');
  if (rootFiles.includes('pnpm-lock.yaml')) pkgManagers.push('pnpm');
  
  if (pkgManagers.length > 1) {
    flags.push(`Multiple package managers: ${pkgManagers.join(' + ')}`);
  }
  
  // Check for old TODOs with git blame
  try {
    const git = simpleGit(dirPath);
    const isRepo = await git.checkIsRepo();
    
    if (isRepo) {
      function checkTODOs(struct, basePath = '') {
        for (const file of struct.files) {
          if (file.name.match(/\.(js|ts|jsx|tsx|py|go|rs|java)$/)) {
            try {
              const content = fs.readFileSync(file.path, 'utf8');
              const lines = content.split('\n');
              
              lines.forEach((line, idx) => {
                if (line.match(/TODO|FIXME|HACK/i)) {
                  const relativePath = path.relative(dirPath, file.path);
                  
                  git.raw(['blame', '-L', `${idx + 1},${idx + 1}`, '--', relativePath])
                    .then(blame => {
                      const dateMatch = blame.match(/(\d{4}-\d{2}-\d{2})/);
                      if (dateMatch) {
                        const todoDate = new Date(dateMatch[1]);
                        const now = new Date();
                        const daysDiff = Math.floor((now - todoDate) / (1000 * 60 * 60 * 24));
                        
                        if (daysDiff > 90) {
                          flags.push(`Old TODO in ${file.name} (${daysDiff} days old)`);
                        }
                      }
                    })
                    .catch(() => {}); // Silent fail
                }
              });
            } catch {}
          }
        }
        
        for (const dir of struct.dirs) {
          checkTODOs(dir, path.join(basePath, dir.name));
        }
      }
      
      checkTODOs(structure);
    }
  } catch {}
  
  // Check for unused dependencies
  const unused = detectUnusedDeps(dirPath);
  if (unused.length > 0) {
    flags.push(`Potentially unused dependencies: ${unused.join(', ')}`);
  }
  
  return flags.slice(0, 12);
}

// ============================================================================
// CORE: GIT INTEGRATION
// ============================================================================

async function getGitSummary(dirPath) {
  try {
    const git = simpleGit(dirPath);
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) return null;
    
    const log = await git.log({ maxCount: 50 });
    
    const authors = {};
    const fileChanges = {};
    
    log.all.forEach(commit => {
      authors[commit.author_name] = (authors[commit.author_name] || 0) + 1;
    });
    
    const topAuthors = Object.entries(authors)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => `${name} (${count} commits)`);
    
    const recentCommits = log.all.slice(0, 5).map(c => 
      `${c.hash.substring(0, 7)} - ${c.message.split('\n')[0].substring(0, 60)}`
    );
    
    return {
      totalCommits: log.total,
      topAuthors,
      recentCommits
    };
  } catch {
    return null;
  }
}

// ============================================================================
// CORE: ELI5 DESCRIPTIONS
// ============================================================================

const FOLDER_DESCRIPTIONS = {
  'src': 'Source code lives here',
  'components': 'Reusable UI pieces',
  'pages': 'Route handlers / page files',
  'routes': 'API endpoint definitions',
  'api': 'Backend API logic',
  'models': 'Data structure definitions',
  'controllers': 'Request handling logic',
  'services': 'Business logic layer',
  'utils': 'Helper functions',
  'lib': 'Shared utilities',
  'hooks': 'Custom React hooks',
  'styles': 'CSS and styling',
  'public': 'Static assets',
  'assets': 'Images, fonts, media',
  'config': 'Configuration files',
  'tests': 'Test files',
  '__tests__': 'Test files',
  'spec': 'Test specifications',
  'docs': 'Documentation',
  'scripts': 'Build/deploy scripts',
  'middleware': 'Request interceptors',
  'types': 'TypeScript type definitions',
  'interfaces': 'Interface definitions',
  'schemas': 'Data validation schemas',
  'migrations': 'Database migrations',
  'prisma': 'Prisma ORM files',
};

function explainFolder(name) {
  const lower = name.toLowerCase();
  return FOLDER_DESCRIPTIONS[lower] || `Custom ${name} directory`;
}

// ============================================================================
// UI RENDERING
// ============================================================================

function renderTree(structure, indent = '') {
  let output = '';
  
  for (let i = 0; i < structure.dirs.length; i++) {
    const dir = structure.dirs[i];
    const isLast = i === structure.dirs.length - 1 && structure.files.length === 0;
    const prefix = isLast ? '└─' : '├─';
    const nextIndent = isLast ? '  ' : '│ ';
    
    output += `${indent}${chalk.cyan(prefix)} ${chalk.bold.blue(dir.name)}/`;
    output += chalk.dim(` → ${explainFolder(dir.name)}`) + '\n';
    output += renderTree(dir, indent + nextIndent);
  }
  
  const displayFiles = structure.files.slice(0, 5);
  for (let i = 0; i < displayFiles.length; i++) {
    const file = displayFiles[i];
    const isLast = i === displayFiles.length - 1;
    const prefix = isLast ? '└─' : '├─';
    output += `${indent}${chalk.gray(prefix)} ${file.name}\n`;
  }
  
  if (structure.files.length > 5) {
    output += `${indent}${chalk.dim(`... ${structure.files.length - 5} more files`)}\n`;
  }
  
  if (structure.compressed.length > 0) {
    output += `${indent}${chalk.dim(`[compressed: ${structure.compressed.join(', ')}]`)}\n`;
  }
  
  return output;
}

function guessPurpose(stack, structure) {
  const hasAPI = structure.dirs.some(d => ['api', 'routes', 'controllers'].includes(d.name.toLowerCase()));
  const hasUI = stack.some(s => ['React', 'Vue', 'Svelte', 'Next.js'].includes(s));
  
  if (hasUI && hasAPI) return 'Full-stack web application';
  if (hasUI) return 'Frontend web application';
  if (hasAPI) return 'Backend API service';
  if (stack.includes('Python')) return 'Python project';
  if (stack.includes('Go')) return 'Go service';
  return 'Software project';
}

async function exportToMarkdown(dirPath, structure, stack, redFlags, gitSummary) {
  const output = [];
  
  output.push('# Project Analysis Report\n');
  output.push(`**Generated:** ${new Date().toISOString()}\n`);
  output.push(`**Path:** ${dirPath}\n`);
  
  output.push('\n## Project Summary\n');
  output.push(`${guessPurpose(stack, structure)}\n`);
  
  output.push('\n## Tech Stack\n');
  stack.forEach(tech => output.push(`- ${tech}`));
  
  if (gitSummary) {
    output.push('\n## Git Summary\n');
    output.push(`- Total commits: ${gitSummary.totalCommits}`);
    output.push(`- Top contributors: ${gitSummary.topAuthors.join(', ')}`);
    output.push('\n### Recent Commits\n');
    gitSummary.recentCommits.forEach(c => output.push(`- ${c}`));
  }
  
  output.push('\n## Directory Structure\n');
  output.push('```');
  output.push(renderTree(structure).replace(/\x1b\[[0-9;]*m/g, '')); // Strip colors
  output.push('```');
  
  if (redFlags.length > 0) {
    output.push('\n## Red Flags\n');
    redFlags.forEach(flag => output.push(`- ${flag}`));
  }
  
  const filename = `project-analysis-${Date.now()}.md`;
  fs.writeFileSync(filename, output.join('\n'));
  
  return filename;
}

// ============================================================================
// CLI ENTRY
// ============================================================================

program
  .name('wth')
  .description('Explain any project folder like you\'re 5')
  .version('1.0.0')
  .argument('[path]', 'Directory to analyze', '.')
  .option('--tree', 'Show only file tree')
  .option('--redflags', 'Show only red flags')
  .option('--explain-only', 'Show only explanations')
  .option('--json', 'Output as JSON')
  .option('--export', 'Export to Markdown')
  .option('--git', 'Show git summary')
  .action(async (targetPath, options) => {
    const dirPath = path.resolve(targetPath);
    
    if (!fs.existsSync(dirPath)) {
      console.error(chalk.red('Directory not found'));
      process.exit(1);
    }
    
    console.log(gradient.rainbow(figlet.textSync('wth-is-this', {
      font: 'Small',
      horizontalLayout: 'fitted'
    })));
    console.log(chalk.dim('Explain any codebase like you\'re 5\n'));
    
    const spinner = ora({ text: 'Scanning directory...', color: 'cyan' }).start();
    const structure = scanDirectory(dirPath);
    spinner.succeed('Scan complete');
    
    spinner.start('Detecting tech stack...');
    const stack = detectTechStack(dirPath, structure);
    spinner.succeed('Tech stack detected');
    
    spinner.start('Looking for red flags...');
    const redFlags = await detectRedFlags(dirPath, structure);
    spinner.succeed('Analysis complete');
    
    let gitSummary = null;
    if (options.git) {
      spinner.start('Fetching git history...');
      gitSummary = await getGitSummary(dirPath);
      spinner.succeed('Git analysis complete');
    }
    
    console.log('');
    
    if (options.export) {
      const filename = await exportToMarkdown(dirPath, structure, stack, redFlags, gitSummary);
      console.log(chalk.green(`Exported to ${filename}`));
      return;
    }
    
    if (options.json) {
      console.log(JSON.stringify({ path: dirPath, stack, structure, redFlags, gitSummary }, null, 2));
      return;
    }
    
    if (!options.tree && !options.redflags && !options.explainOnly) {
      console.log(boxen(
        chalk.bold.magenta('What This Project Probably Is:\n') +
        chalk.white(`"${guessPurpose(stack, structure)}"`),
        { padding: 1, borderColor: 'magenta', borderStyle: 'round' }
      ));
      console.log('');
    }
    
    if (!options.redflags && !options.explainOnly) {
      console.log(chalk.bold.cyan('Tech Stack'));
      if (stack.length > 0) {
        stack.forEach(tech => console.log(chalk.white(`  ${tech}`)));
      } else {
        console.log(chalk.dim('  No framework detected'));
      }
      console.log('');
    }
    
    if (gitSummary && !options.tree && !options.redflags) {
      console.log(chalk.bold.yellow('Git Summary'));
      console.log(chalk.white(`  Total commits: ${gitSummary.totalCommits}`));
      console.log(chalk.white(`  Top contributors: ${gitSummary.topAuthors.join(', ')}`));
      console.log(chalk.dim('\n  Recent commits:'));
      gitSummary.recentCommits.forEach(c => console.log(chalk.dim(`    ${c}`)));
      console.log('');
    }
    
    if (!options.redflags && !options.explainOnly) {
      console.log(chalk.bold.blue('Structure'));
      console.log(renderTree(structure));
    }
    
    if (!options.tree && !options.explainOnly && redFlags.length > 0) {
      console.log(chalk.bold.red('Red Flags'));
      redFlags.forEach(flag => console.log(chalk.yellow(`  ${flag}`)));
      console.log('');
    }
    
    if (options.tree) console.log(renderTree(structure));
    if (options.redflags) {
      if (redFlags.length > 0) {
        redFlags.forEach(flag => console.log(chalk.yellow(flag)));
      } else {
        console.log(chalk.green('No red flags detected'));
      }
    }
  });

program.parse();