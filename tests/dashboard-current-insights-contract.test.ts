import {readFileSync} from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import {expect,it} from 'vitest';
import {compileCurrentDashboardInsightsStyles} from './helpers/dashboard-current-insights-styles.js';
import {dashboardLabMarkerDataOwnership} from '../scripts/dashboard-lab-markers-style-ownership.mjs';
const inputPath=path.resolve('css/dashboard-data.base.css'),input=readFileSync(inputPath,'utf8');
it('qualifies the actual complete 314-owner stylesheet before exposing all original 159 Insights owners',async()=>{
 expect(dashboardLabMarkerDataOwnership.receivers).toHaveLength(314);
 const result=await compileCurrentDashboardInsightsStyles(input,inputPath,process.cwd());
 expect(result.receivers).toHaveLength(159);
 expect(result.css).toContain('.db-insights-list');
 expect(result.css).not.toContain('@apply');
});
const ownerCases=[['Insights',dashboardLabMarkerDataOwnership.receivers[150][0]],['Lab',dashboardLabMarkerDataOwnership.receivers[159][0]],['remaining Dashboard',dashboardLabMarkerDataOwnership.receivers[185][0]],['manual-empty remove',dashboardLabMarkerDataOwnership.receivers[312][0]],['inline-edit remove',dashboardLabMarkerDataOwnership.receivers[313][0]]]as const;
it.each(ownerCases)('rejects a changed actual %s recipe before legacy byte restoration',async(_label,utility)=>{
 const tree=postcss.parse(input);let changed=false;
 tree.walkAtRules('utility',rule=>{
  if(rule.params!==utility)return;
  const declaration=rule.nodes?.find(node=>node.type==='decl');
  if(declaration?.type!=='decl')throw new Error('Expected current owned declaration');
  declaration.value=declaration.value==='initial'?'inherit':'initial';changed=true;
 });
 expect(changed).toBe(true);
 await expect(compileCurrentDashboardInsightsStyles(tree.toString(),inputPath,process.cwd())).rejects.toThrow();
});
it('keeps the exact caller-appended comment, multiline gradient and declaration order',async()=>{
 const foreign='\n/* caller-owned spacing remains exact */\n.foreign-insights-check {\n background:\n  linear-gradient(135deg, var(--accent), transparent),\n  var(--bg-card);\n color: var(--text-primary);\n}\n';
 const result=await compileCurrentDashboardInsightsStyles(input+foreign,inputPath,process.cwd());
 expect(result.css.endsWith(foreign)).toBe(true);
});
