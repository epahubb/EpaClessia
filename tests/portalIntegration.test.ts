import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import knex from 'knex';
import ClientPG from 'knex/lib/dialects/postgres/index.js';
import { PGlite } from '@electric-sql/pglite';
import db from '../src/lib/db';

import memberRouter from '../src/routes/member';
import groupRouter from '../src/routes/groupLeader';
import churchRouter from '../src/routes/church';
import { authenticate } from '../src/middleware/auth';
import { signAccessToken } from '../src/lib/security';
import { ministryCounts } from '../src/lib/ministryRoster';

test('portal integration: ministries, member features, and assigned group tools on real PostgreSQL', async t => {
  const engine = new PGlite(); await engine.waitReady;
  class EmbeddedPostgres extends ClientPG {
    async acquireRawConnection() {
      return { query(config: any, callback: any) {
        engine.query(config.text, config.values).then(result => callback(null, {
          rows: result.rows, fields: result.fields, rowCount: result.affectedRows ?? result.rows.length,
          command: /^\s*(select|with|show)/i.test(config.text) ? 'SELECT' : config.text.trim().split(/\s+/)[0].toUpperCase(),
        }), error => callback(error));
      } };
    }
    async destroyRawConnection() { /* engine belongs to the test, not the pool */ }
  }
  const sql = knex({ client: EmbeddedPostgres as any, connection: {}, pool: { min: 0, max: 1 } });
  const original = db.client; (db as any).client = sql.client;
  let server: any;
  try {
    await sql.schema.createTable('tenants', x => { x.string('id').primary(); x.string('name'); x.string('status'); x.integer('smsCredits').defaultTo(0); });
    await sql.schema.createTable('users', x => { x.string('uid').primary(); for(const f of ['tenantId','name','email','username','role','status','password','phone','memberId','verifiedBy','verificationToken'])x.string(f); x.boolean('mustChangePassword'); for(const f of ['createdAt','verifiedAt','verificationExpiresAt']) x.timestamp(f); });
    await sql.schema.createTable('user_tenant_roles', x => { x.string('userId'); x.string('tenantId'); x.string('role'); });
    await sql.schema.createTable('members', x => { x.string('id').primary(); for(const f of ['tenantId','firstName','lastName','ministryId','groupId','groupName','portalUserUid','portalUsername','portalStatus','membershipId','membershipStatus','email','phone','occupation','address','familyId','gender','maritalStatus','branchId','photoUrl','approvalStatus','notes','parentMemberId','spouseMemberId','spouseName'])x.string(f); x.text('commPreferences'); for(const f of ['createdAt','dateOfBirth','anniversaryDate','joinDate','portalInvitedAt','portalPasswordSetAt'])x.timestamp(f); for(const f of ['directoryOptIn','directoryShowPhone','directoryShowEmail'])x.boolean(f).defaultTo(false); });
    await sql.schema.createTable('member_id_sequences', x=>{x.string('tenantId').primary();x.integer('nextValue');});
    await sql.schema.createTable('ministries', x=>{x.string('id').primary();for(const f of ['tenantId','type','name','status','description','leaderName','meetingDay','meetingTime','location'])x.string(f);x.integer('memberCount');x.timestamp('createdAt');});
    await sql.schema.createTable('ministry_members', x=>{for(const f of ['id','tenantId','memberId','ministryId','name','role','status','phone','email','createdBy'])x.string(f);x.timestamp('createdAt');x.timestamp('joinedAt');});
    await sql.schema.createTable('church_groups', x=>{x.string('id').primary();for(const f of ['tenantId','name','leaderId','leaderName','description','meetingDay','meetingTime','location'])x.string(f);x.integer('sortOrder');x.boolean('active');x.timestamp('createdAt');});
    await sql.schema.createTable('sermons', x=>{x.string('id').primary();for(const f of ['tenantId','title','speaker','seriesName','description','scripture','videoUrl','audioUrl','notesUrl','thumbnailUrl','tags'])x.string(f);x.timestamp('date');x.timestamp('createdAt');x.integer('durationMinutes');x.boolean('published').defaultTo(true);});
    await sql.schema.createTable('prayer_requests', x=>{x.string('id').primary();for(const f of ['tenantId','requesterName','requesterMemberId','request','category','status','createdBy'])x.string(f);x.boolean('isPrivate');x.timestamp('createdAt');x.timestamp('updatedAt');});
    await sql.schema.createTable('events', x=>{x.string('id').primary();for(const f of ['tenantId','ministryId','title','location'])x.string(f);x.timestamp('startTime');x.timestamp('endTime');});
    await sql.schema.createTable('event_attendance', x=>{x.increments('id');for(const f of ['tenantId','memberId','eventId','status','method'])x.string(f);x.boolean('present');x.timestamp('checkInAt');});
    await sql.schema.createTable('donations', x=>{x.increments('id');for(const f of ['tenantId','ministryId','currency','purpose','status','donorName'])x.string(f);x.decimal('amount');x.timestamp('createdAt');x.timestamp('receivedAt');});
    await sql.schema.createTable('expenses', x=>{x.string('id');for(const f of ['tenantId','ministryId','currency','description','status','vendor'])x.string(f);x.decimal('amount');x.timestamp('date');});
    await sql.schema.createTable('system_settings', x=>{x.string('key');x.text('value');});
    await sql.schema.createTable('church_settings', x=>{x.string('tenantId');x.string('key');x.text('value');});
    await sql.schema.createTable('communications_log', x=>{x.increments('id');for(const f of ['tenantId','channel','recipient','subject','message','status','sentBy'])x.string(f);x.timestamp('createdAt');});
    await sql.schema.createTable('audit_logs',x=>{x.increments('id');for(const f of ['adminUid','action','resource','resourceId','ipAddress','userAgent'])x.string(f);x.timestamp('createdAt');});
    await sql.schema.createTable('church_activity_log',x=>{x.increments('id');for(const f of ['tenantId','userId','userName','action','entity','entityId','details','ipAddress'])x.string(f);x.timestamp('createdAt');});
    await sql('tenants').insert([{id:'a',name:'Grace Church',status:'active'},{id:'b',name:'Other Church',status:'active'}]);
    const accounts=[{uid:'admin',tenantId:'a',role:'CHURCH_ADMIN',name:'Admin'},{uid:'member',tenantId:'a',role:'MEMBER',name:'Ama',memberId:'m1'},{uid:'leader',tenantId:'a',role:'GROUP_LEADER',name:'Leader',memberId:'m2'}].map(x=>({...x,status:'active'}));await sql('users').insert(accounts);
    await sql('members').insert([{id:'m1',tenantId:'a',firstName:'Ama',lastName:'Member',membershipId:'000001',ministryId:'min1',groupId:'g1',email:'ama@example.test',phone:'000',membershipStatus:'active',directoryOptIn:true,directoryShowPhone:false,directoryShowEmail:true},{id:'m2',tenantId:'a',firstName:'Kojo',lastName:'Member',membershipId:'000002',groupId:'g1',membershipStatus:'active'},{id:'m3',tenantId:'b',firstName:'Foreign',lastName:'Member',groupId:'g2',directoryOptIn:true,membershipStatus:'active'}]);
    await sql('ministries').insert([{id:'min1',tenantId:'a',name:'Youth',type:'ministry',status:'active',memberCount:99},{id:'min2',tenantId:'a',name:'Choir',type:'ministry',status:'active'},{id:'foreign',tenantId:'b',name:'Other Youth',status:'active'}]);
    await sql('ministry_members').insert([{id:'link1',tenantId:'a',memberId:'m1',ministryId:'min1'},{id:'stale',tenantId:'a',memberId:'deleted',ministryId:'min1'}]);
    await sql('church_groups').insert([{id:'g1',tenantId:'a',name:'Grace Cell',leaderId:'leader',active:true},{id:'g2',tenantId:'b',name:'Foreign Cell',active:true}]);
    await sql('events').insert([{id:'ev1',tenantId:'a',ministryId:'min1',title:'Youth meeting',startTime:new Date('2026-10-01T10:00:00Z')},{id:'ev2',tenantId:'a',title:'Church meeting',startTime:new Date('2026-10-01T11:00:00Z')}]);
    await sql('event_attendance').insert([{tenantId:'a',eventId:'ev1',memberId:'m1',present:true,status:'checked_in'},{tenantId:'a',eventId:'ev2',memberId:'m1',present:false,status:'absent'}]);
    await sql('donations').insert([{tenantId:'a',ministryId:'min1',amount:100.11,currency:'GHS',status:'completed',createdAt:new Date('2026-10-01')},{tenantId:'a',amount:999,currency:'GHS',status:'completed',createdAt:new Date('2026-10-01')},{tenantId:'b',ministryId:'min1',amount:999,currency:'GHS',status:'completed',createdAt:new Date('2026-10-01')}]);
    await sql('expenses').insert({id:'exp1',tenantId:'a',ministryId:'min1',amount:30,currency:'GHS',status:'paid',date:new Date('2026-10-01')});
    const app=express();app.use(express.json());app.use('/church',authenticate,churchRouter);app.use('/member',authenticate,memberRouter);app.use('/group',authenticate,groupRouter);
    server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
    const tokens=Object.fromEntries(accounts.map(x=>[x.uid,signAccessToken({uid:x.uid,tenantId:x.tenantId,role:x.role})]));
    const request=async(path:string,user='member',body?:any,method='POST')=>{const r=await fetch(base+path,{method:body===undefined?'GET':method,headers:{Authorization:'Bearer '+tokens[user],'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json() as any};};
    await t.test('derived counts deduplicate links and exclude deleted profiles',async()=>{assert.equal((await ministryCounts(sql,'a')).min1,1);const r=await request('/church/ministries','admin');assert.equal(r.status,200);assert.equal(r.body.data.find((m:any)=>m.id==='min1').memberCount,1);});
    await t.test('ministry side panel scopes roster, attendance, finances and currencies',async()=>{const r=await request('/church/ministries/min1/overview?from=2026-10-01&to=2026-10-02','admin');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.members.length,1);assert.equal(r.body.members[0].attendance.present,1);assert.equal(r.body.members[0].attendance.absent,0);assert.equal(r.body.totals[0].net,70.11);assert.equal(r.body.events.length,1);assert.equal((await request('/church/ministries/foreign/overview','admin')).status,404);assert.equal((await request('/church/ministries/min1/overview','leader')).status,403);});
    await t.test('member groups load both units without exposing another church',async()=>{const r=await request('/member/groups');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.length,3);assert.equal(r.body.find((g:any)=>g.id==='g1').joined,true);assert.equal(r.body.some((g:any)=>g.id==='g2'),false);});
    await t.test('join and leave persist and immediately alter count; foreign joins rejected',async()=>{assert.equal((await request('/member/groups/min2/join','member',{})).status,200);assert.equal((await request('/member/groups/min2/join','member',{})).status,200);assert.equal((await ministryCounts(sql,'a')).min2,1);assert.equal((await request('/member/groups/foreign/join','member',{})).status,404);assert.equal((await request('/member/groups/min2/leave','member',{})).status,200);assert.equal((await ministryCounts(sql,'a')).min2,undefined);});
    await t.test('published admin sermon appears in member library, draft stays private',async()=>{const r=await request('/church/sermons','admin',{title:'Hope',videoUrl:'https://example.test/sermon',published:true});assert.equal(r.status,201);await request('/church/sermons','admin',{title:'Draft',published:false});await sql('sermons').insert({id:'foreign-sermon',tenantId:'b',title:'Foreign',published:true});const list=await request('/member/sermons');assert.deepEqual(list.body.data.map((s:any)=>s.title),['Hope']);assert.equal((await request('/church/sermons','admin',{title:'Unsafe',videoUrl:'javascript:alert(1)'})).status,400);});
    await t.test('prayer privacy and directory consent are enforced',async()=>{await request('/member/prayers','member',{request:'Private prayer',isPrivate:true});await request('/member/prayers','leader',{request:'Public prayer',anonymous:true});const r=await request('/member/prayers');assert.equal(r.body.mine.length,1);assert.equal(r.body.wall.length,1);assert.equal(r.body.wall[0].requesterName,'Anonymous');const other=await request('/member/prayers','leader');assert.equal(JSON.stringify(other.body).includes('Private prayer'),false);const directory=await request('/member/directory');assert.equal(directory.body.data.length,1);assert.equal(directory.body.data[0].phone,null);assert.equal(directory.body.data[0].email,'ama@example.test');await request('/member/directory/preferences','member',{directoryOptIn:false},'PUT');assert.equal((await request('/member/directory')).body.data.length,0);});
    await t.test('church branding and attendance history load without ambiguous joins',async()=>{assert.equal((await request('/member/branding')).body.name,'Grace Church');const r=await request('/member/attendance/history');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.data.length,2);});
    await t.test('leader registration cannot forge group, tenant, medical or ministry assignment',async()=>{const r=await request('/group/groups/g1/members','leader',{firstName:'New',lastName:'Member',username:'new.group.member',password:'SyntheticTest!2026',groupId:'g2',tenantId:'b',ministryIds:['foreign'],medical:{notes:'not allowed'}});assert.equal(r.status,201,JSON.stringify(r.body));const saved=await sql('members').where({id:r.body.id}).first();assert.equal(saved.tenantId,'a');assert.equal(saved.groupId,'g1');assert.equal(saved.ministryId,null);assert.equal((await request('/group/groups/g2/members','leader',{firstName:'No',lastName:'Access'})).status,404);});
    await t.test('group messages cannot target foreign recipients; missing providers report failures',async()=>{assert.equal((await request('/group/groups/g1/communications','leader',{channel:'sms',subject:'Hello',message:'Hello',memberIds:['m3']})).status,404);const r=await request('/group/groups/g1/communications','leader',{channel:'email',subject:'Hello',message:'Hello',memberIds:['m1']});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.sent,0);assert.equal(r.body.failed,1);});
    await t.test('group SMS reserves credits and refunds provider failures',async()=>{const body={channel:'sms',subject:'Hello',message:'Hello',memberIds:['m1']};assert.equal((await request('/group/groups/g1/communications','leader',body)).status,402);await sql('tenants').where({id:'a'}).update({smsCredits:1});const r=await request('/group/groups/g1/communications','leader',body);assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.sent,0);assert.equal(r.body.failed,1);assert.equal((await sql('tenants').where({id:'a'}).first()).smsCredits,1);});
    await t.test('admin group assignment promotes only chosen member account and updates access',async()=>{const r=await request('/church/groups/g1','admin',{leaderId:'member'},'PUT');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal((await sql('users').where({uid:'member'}).first()).role,'GROUP_LEADER');const assigned=await request('/group/groups','member');assert.equal(assigned.status,200);assert.deepEqual(assigned.body.data.map((g:any)=>g.id),['g1']);assert.equal((await request('/group/groups/g1/overview','leader')).status,404);});
  } finally { if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(r));}(db as any).client=original;await sql.destroy();await engine.close(); }
});
