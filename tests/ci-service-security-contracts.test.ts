import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const read = (file: string): string => fs.readFileSync(file, 'utf8');
const rootPackage = JSON.parse(read('package.json')) as {workspaces: string[]};
const nodeImage = 'node:24-bookworm-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03';

function stages(source: string): string[] {
  return source.split(/(?=^FROM )/m).filter(stage => stage.startsWith('FROM '));
}

describe('clean-checkout service dependency inputs', () => {
  it('keeps declared workspace manifests available in the minimal Docker context', () => {
    const rules = read('.dockerignore').split(/\r?\n/).filter(Boolean);
    expect(rules[0]).toBe('**');
    for (const workspace of rootPackage.workspaces) {
      // This repository deliberately uses literal workspace paths; expansion
      // must be reviewed if the dependency layout introduces a glob.
      expect(workspace).not.toMatch(/[?*]/);
      expect(fs.statSync(path.join(workspace, 'package.json')).isFile()).toBe(true);
      const parts = workspace.split('/');
      for (let depth = 1; depth <= parts.length; depth++) {
        expect(rules).toContain('!' + parts.slice(0, depth).join('/') + '/');
      }
      expect(rules).toContain('!' + workspace + '/package.json');
    }
    expect(rules).not.toContain('!tooling/**');
  });

  it.each(['compat-proxy', 'profile-share'])('%s installs its complete locked workspace graph before minimal service compilation', service => {
    const docker = read(`deploy/${service}/Dockerfile`);
    const parsed = stages(docker);
    expect(parsed).toHaveLength(2);
    for (const stage of parsed) {
      expect(stage.split('\n')[0]).toMatch(new RegExp('^FROM ' + nodeImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?: AS \\w+)?$'));
      if (!stage.includes('RUN npm ci')) continue;
      expect(stage).toContain('COPY package.json package-lock.json ./');
      const installation = stage.indexOf('RUN npm ci');
      for (const workspace of rootPackage.workspaces) {
        const input = `COPY ${workspace}/package.json ./${workspace}/`;
        expect(stage).toContain(input);
        expect(stage.indexOf(input)).toBeLessThan(installation);
      }
      expect(stage.slice(installation)).toMatch(/^RUN npm ci[^\n]*--ignore-scripts/);
    }
    expect(parsed[0]).toContain('RUN ./node_modules/.bin/tsc -p tsconfig.migration.json');
    expect(parsed[0]).not.toContain('npm run typescript:build');
    expect(parsed[1]).toContain('\nUSER node\n');
    expect(parsed[1]).toContain(`CMD ["node", "server/${service}-server.js"]`);
    if (service === 'compat-proxy') expect(parsed[1]).toContain('RUN npm ci --omit=dev --ignore-scripts');
    else expect(parsed[1]).not.toContain('npm ci');
  });
});

describe('security workflow compiler and dependency ownership', () => {
  it('prepares authored UI output before CodeQL initialization without reducing its query or ownership scope', () => {
    const workflow = read('.github/workflows/codeql.yml');
    const setup = workflow.indexOf('uses: actions/setup-node@');
    const install = workflow.indexOf('run: npm ci');
    const init = workflow.indexOf('uses: github/codeql-action/init@');
    const analyze = workflow.indexOf('uses: github/codeql-action/analyze@');
    expect(setup).toBeGreaterThan(0);
    expect(install).toBeGreaterThan(setup);
    expect(init).toBeGreaterThan(install);
    expect(analyze).toBeGreaterThan(init);
    expect(workflow.slice(setup, install)).toContain('node-version: 24');
    expect(workflow).toContain('queries: security-extended');
    expect(workflow).toContain('languages: ${{ matrix.language }}');
    expect(workflow).not.toContain('--ignore-scripts');
    expect(workflow).not.toContain('- js/**');
    expect(workflow).not.toContain('- vendor/**');
    const step = workflow.match(/      - name: Install dependencies and compile canonical UI sources\n([\s\S]*?)(?=      - |$)/)?.[1];
    expect(step).toContain('run: npm ci');
    expect(step).not.toMatch(/\bif:|continue-on-error/);
  });

  it('selects supply-chain validation for workspace manifest changes on both PRs and main', () => {
    const workflow = read('.github/workflows/supply-chain.yml');
    for (const event of ['pull_request', 'push']) {
      const block = workflow.match(new RegExp('^  ' + event + ':\\n([\\s\\S]*?)(?=^  [a-z_]+:|^permissions:)', 'm'))?.[1];
      expect(block, event).toContain('"tooling/**/package.json"');
      expect(block, event).toContain('"package-lock.json"');
    }
    expect(workflow).toContain("if: github.event_name != 'pull_request'");
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('permissions:\n      contents: write');
  });
});


it('keeps CodeQL steps on one immutable release and groups coupled Dependabot updates', () => {
  const workflow = read('.github/workflows/codeql.yml');
  const versions = [...workflow.matchAll(/uses: github\/codeql-action\/(?:init|analyze)@([a-f0-9]{40})/g)].map(match => match[1]);
  expect(versions).toHaveLength(2);
  expect(new Set(versions).size).toBe(1);
  const dependabot = read('.github/dependabot.yml');
  expect(dependabot).toMatch(/codeql:\n\s+patterns:\n\s+- "github\/codeql-action\/\*"/);
  expect(dependabot).toMatch(/vitest:\n\s+patterns:\n\s+- "vitest"\n\s+- "@vitest\/\*"/);
});
