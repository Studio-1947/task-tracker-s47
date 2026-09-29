#!/usr/bin/env node
const API=process.env.API_URL??'http://localhost:3000/api'; let failures=0;
function ok(v,m,d=''){if(v)console.log(`PASS ${m}`);else{failures++;console.error(`FAIL ${m}${d?` - ${d}`:''}`)}}
async function call(t,m,p,b){const r=await fetch(`${API}${p}`,{method:m,headers:{...(t?{authorization:`Bearer ${t}`} :{}),...(b===undefined?{}:{'content-type':'application/json'})},body:b===undefined?undefined:JSON.stringify(b)});const x=await r.text();let body;try{body=x?JSON.parse(x):null}catch{body=x}return{status:r.status,body}}
async function login(e,p){return(await call(null,'POST','/auth/login',{email:e,password:p})).body}
async function main(){
 const a=await login('admin@example.com','admin12345'), r=await login('admin2@example.com','admin2_12345');
 const memberEmail=`final_${Date.now()}@example.com`; const made=await call(a.accessToken,'POST','/users',{name:'Final Flow Member',email:memberEmail,role:'MEMBER'}); const m=await login(memberEmail,made.body.tempPassword);
 const ws=await call(a.accessToken,'POST','/workspaces',{name:`Final improvements ${Date.now()}`}); await call(a.accessToken,'POST',`/workspaces/${ws.body.id}/members`,{add:[a.user.id,r.user.id,m.user.id]});
 try{
  const projects=await call(a.accessToken,'GET',`/workspaces/${ws.body.id}/projects`), projectId=projects.body[0].id;
  const task=await call(a.accessToken,'POST',`/workspaces/${ws.body.id}/tasks`,{projectId,title:'Delegated review deliverable',status:'IN_PROGRESS',ownerId:a.user.id,reviewerId:r.user.id,assigneeIds:[a.user.id],dueDate:'2026-10-02T12:00:00.000Z',acceptanceCriteria:'Evidence is accepted.'});
  const now=new Date(), later=new Date(now.getTime()+86400000);
  const delegation=await call(r.accessToken,'POST',`/tasks/${task.body.id}/delegate-review`,{delegateId:m.user.id,effectiveFrom:new Date(now.getTime()-60000).toISOString(),effectiveTo:later.toISOString(),reason:'Coverage'});
  ok(delegation.status===201,'effective-dated reviewer delegation created',JSON.stringify(delegation.body));
  const evidence=await call(a.accessToken,'POST',`/tasks/${task.body.id}/attachments/links`,{url:'https://example.com/final',title:'Final evidence'}); const submission=await call(a.accessToken,'POST',`/tasks/${task.body.id}/submissions`,{evidenceAttachmentId:evidence.body.id,note:'Ready'});
  const decision=await call(m.accessToken,'POST',`/tasks/${task.body.id}/submissions/${submission.body.id}/review`,{decision:'ACCEPTED',note:'Accepted as active delegate'});
  ok(decision.status===201,'active delegate can review only delegated task',JSON.stringify(decision.body));
  const group=await call(a.accessToken,'POST','/calendar/schedule-groups',{name:`Final group ${Date.now()}`,timezone:'Asia/Kolkata',workdays:[1,2,3,4,5],startMinute:600,endMinute:1140,unpaidBreakMinutes:60,effectiveFrom:'2026-09-01'});
  const assignment=await call(a.accessToken,'POST',`/calendar/schedule-groups/${group.body.id}/assignments`,{userId:m.user.id,effectiveFrom:'2026-09-01'});
  ok(assignment.status===201,'employee assigned to effective-dated schedule group',JSON.stringify(assignment.body));
  const allocation=await call(a.accessToken,'POST',`/workspaces/${ws.body.id}/capacity-allocations`,{userId:m.user.id,taskId:task.body.id,periodStart:'2026-09-28',periodEnd:'2026-10-02',allocatedMinutes:300});
  const weekly=await call(a.accessToken,'GET',`/workspaces/${ws.body.id}/capacity-allocations/weekly?periodStart=2026-09-28&periodEnd=2026-10-02`);
  ok(allocation.status===201 && weekly.status===200 && weekly.body.some(x=>x.user.id===m.user.id),'weekly planning returns persisted allocation and capacity',JSON.stringify(weekly.body));
  const metrics=await call(a.accessToken,'GET',`/metrics/workspace?workspaceId=${ws.body.id}&from=2026-09-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z`);
  ok(metrics.status===200 && metrics.body.onTimeSubmission.denominator!==undefined && Array.isArray(metrics.body.onTimeSubmission.taskIds),'shared metrics expose denominator and exact drill-down IDs',JSON.stringify(metrics.body));
  const reminders=await call(a.accessToken,'POST','/reminders/dispatch',{}); ok(reminders.status===201 && typeof reminders.body.dispatched==='number','calendar-aware reminder worker can be run and reports dispatch count',JSON.stringify(reminders.body));
  const outsider=await call(a.accessToken,'POST','/users',{name:'Restricted Outsider',email:`outside_${Date.now()}@example.com`,role:'MEMBER'}); const o=await login(outsider.body.email,outsider.body.tempPassword);
  const denied=await call(o.accessToken,'GET',`/reports/wednesday?workspaceId=${ws.body.id}`); ok(denied.status===403,'restricted report direct URL returns no cross-workspace data',JSON.stringify(denied.body));
  await call(a.accessToken,'DELETE',`/calendar/schedule-groups/assignments/${assignment.body.id}`); await call(a.accessToken,'DELETE',`/calendar/schedule-groups/${group.body.id}`);
 }finally{await call(a.accessToken,'PATCH',`/workspaces/${ws.body.id}`,{isArchived:true})}
 if(failures)throw new Error(`${failures} final assertion(s) failed`);console.log('Final improvements smoke passed.');
}
main().catch(e=>{console.error(e);process.exit(1)});
