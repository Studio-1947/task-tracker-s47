#!/usr/bin/env node
const API = process.env.API_URL ?? 'http://localhost:3000/api';
let failures = 0;
function ok(v, label, detail='') { if (v) console.log(`PASS ${label}`); else { failures++; console.error(`FAIL ${label}${detail ? ` - ${detail}` : ''}`); } }
async function call(token, method, path, body) { const r = await fetch(`${API}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type':'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); const t=await r.text(); let b; try { b=t?JSON.parse(t):null; } catch { b=t; } return {status:r.status,body:b}; }
async function login(email,password){ return (await call(null,'POST','/auth/login',{email,password})).body; }
async function main(){
  const preparer=await login(process.env.SEED_ADMIN_EMAIL??'admin@example.com',process.env.SEED_ADMIN_PASSWORD??'admin12345');
  const approver=await login(process.env.SEED_ADMIN2_EMAIL??'admin2@example.com',process.env.SEED_ADMIN2_PASSWORD??'admin2_12345');
  const policy=await call(preparer.accessToken,'GET','/admin/organisation-policy');
  ok(policy.status===200 && Number(policy.body.earnedLeaveMonthly)===1 && Number(policy.body.casualLeaveMonthly)===1,'standard EL/CL monthly policy is configured');
  ok(policy.body.reminderChannels.join(',')==='IN_APP,PUSH','WhatsApp is excluded; in-app and push are configured');
  const created=await call(preparer.accessToken,'POST','/users',{name:'Payroll Smoke Member',email:`payroll_${Date.now()}@example.com`,role:'MEMBER'});
  const draft=await call(preparer.accessToken,'POST','/admin/payroll/statements',{userId:created.body.id,month:'2026-10'});
  ok(draft.status===201 && draft.body.status==='DRAFT','payroll input statement starts as draft',JSON.stringify(draft.body));
  ok(draft.body.payablePercentage===0 && draft.body.scheduledMinutes>0,'payable indicator is explainable and separate from salary');
  const selfReview=await call(preparer.accessToken,'POST',`/admin/payroll/statements/${draft.body.id}/review`,{note:'self'});
  ok(selfReview.status===409,'preparer cannot self-review');
  const reviewed=await call(approver.accessToken,'POST',`/admin/payroll/statements/${draft.body.id}/review`,{note:'Attendance inputs reviewed'});
  ok(reviewed.status===201 && reviewed.body.status==='REVIEWED','second administrator reviews statement');
  const approved=await call(approver.accessToken,'POST',`/admin/payroll/statements/${draft.body.id}/approve`,{note:'Approved for payroll input export'});
  ok(approved.status===201 && approved.body.status==='APPROVED','reviewed statement is approved and snapshotted');
  const reopened=await call(preparer.accessToken,'POST',`/admin/payroll/statements/${draft.body.id}/reopen`,{note:'Employee correction received'});
  ok(reopened.status===201 && reopened.body.status==='DRAFT' && reopened.body.reopenedReason,'approved statement reopens only with retained reason');
  if(failures) throw new Error(`${failures} payroll assertion(s) failed`); console.log('Standard policy and payroll sign-off smoke passed.');
}
main().catch(e=>{console.error(e);process.exit(1)});
