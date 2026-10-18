import {readFileSync} from 'node:fs';
import path from 'node:path';
import {expect,it} from 'vitest';
import {compileDashboardLabMarkerDataStyles,compileDashboardLabMarkerWidgetStyles} from '../scripts/dashboard-lab-markers-style-ownership.mjs';
import {dashboardQuickMarkerDataOwnership,dashboardQuickMarkerWidgetOwnership} from '../scripts/dashboard-quick-markers-style-ownership.mjs';
const root=path.resolve(import.meta.dirname,'..');
const lanes=[['dashboard-data.base.css',compileDashboardLabMarkerDataStyles,dashboardQuickMarkerDataOwnership],['dashboard-widgets.base.css',compileDashboardLabMarkerWidgetStyles,dashboardQuickMarkerWidgetOwnership]] as const;
it.each(lanes)('%s rejects each unknown, duplicate and extra-declaration Quick receiver',async(name,compile,ownership)=>{
 const source=readFileSync(path.join(root,'css',name),'utf8');
 for(const [utility,selector,media] of ownership.receivers){
  const token='@apply gb:'+utility+';';expect(source.split(token)).toHaveLength(2);
  await expect(compile(source.replace(token,'@apply gb:'+utility+'-unknown;'),path.join(root,'css',name),root)).rejects.toMatchObject({code:'ERR_ASSERTION'});
  await expect(compile(source.replace(token,token+' color:red;'),path.join(root,'css',name),root)).rejects.toMatchObject({code:'ERR_ASSERTION'});
  const duplicate=selector+'{'+token+'}';await expect(compile(source+'\n'+(media?'@media '+media+'{'+duplicate+'}':duplicate),path.join(root,'css',name),root)).rejects.toMatchObject({code:'ERR_ASSERTION'});
 }
});
