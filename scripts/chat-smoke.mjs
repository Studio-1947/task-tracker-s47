#!/usr/bin/env node
// End-to-end smoke test for the chat layer against a RUNNING API. Exercises DMs,
// unread counts, read receipts, edit/delete, and realtime Socket.IO delivery
// between two seeded admins.
//
//   node scripts/chat-smoke.mjs      (defaults to http://localhost:3000/api)
//   API_URL=... node scripts/chat-smoke.mjs
//
// Requires both seeded users (pnpm db:seed creates admin@ and admin2@).

import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3000/api';
const WS_ORIGIN = API.replace(/\/api\/?$/, '');

const A = {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
};
const B = {
  email: process.env.SEED_ADMIN2_EMAIL ?? 'admin2@example.com',
  password: process.env.SEED_ADMIN2_PASSWORD ?? 'admin2_12345',
};

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

async function json(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

async function login({ email, password }) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert(res.ok, `login ${email} (${res.status})`);
  const { accessToken, user } = await json(res);
  return { token: accessToken, user, H: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` } };
}

const MEMBER_EMAIL = 'chat-smoke-member@example.com';

/**
 * Get a real non-admin MEMBER to test authorization with. Reuses the account
 * across runs: creates it if absent, otherwise resets its password (the temp
 * password is only shown once, so we can't remember it).
 */
async function provisionMember(adminH) {
  const users = await json(await fetch(`${API}/users`, { headers: adminH }));
  const existing = (Array.isArray(users) ? users : []).find((u) => u.email === MEMBER_EMAIL);

  let userId;
  let tempPassword;
  if (existing) {
    userId = existing.id;
    const reset = await json(
      await fetch(`${API}/users/${userId}/reset-password`, { method: 'POST', headers: adminH }),
    );
    tempPassword = reset.tempPassword;
  } else {
    const created = await json(
      await fetch(`${API}/users`, {
        method: 'POST',
        headers: adminH,
        body: JSON.stringify({ name: 'Chat Smoke Member', email: MEMBER_EMAIL, role: 'MEMBER' }),
      }),
    );
    userId = created.id;
    tempPassword = created.tempPassword;
  }
  assert(!!tempPassword, 'provisioned a non-admin MEMBER account');

  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: MEMBER_EMAIL, password: tempPassword }),
  });
  assert(res.ok, `login as MEMBER (${res.status})`);
  const { accessToken, user } = await json(res);
  assert(user.role === 'MEMBER', 'test user is a MEMBER, not an admin');
  return {
    user,
    H: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
  };
}

function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${WS_ORIGIN}/chat`, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => reject(err));
    setTimeout(() => reject(new Error('socket connect timeout')), 5000);
  });
}

async function main() {
  const a = await login(A);
  const b = await login(B);
  assert(a.user.id !== b.user.id, 'two distinct users');

  // 1. A opens a DM with B (idempotent).
  const dmRes = await fetch(`${API}/chat/conversations/direct`, {
    method: 'POST',
    headers: a.H,
    body: JSON.stringify({ userId: b.user.id }),
  });
  assert(dmRes.ok, `create DM (${dmRes.status})`);
  const dm = await json(dmRes);
  assert(dm.type === 'DIRECT', 'conversation is DIRECT');

  // idempotency: a second call returns the same conversation.
  const dm2 = await json(
    await fetch(`${API}/chat/conversations/direct`, {
      method: 'POST',
      headers: a.H,
      body: JSON.stringify({ userId: b.user.id }),
    }),
  );
  assert(dm2.id === dm.id, 'get-or-create DM is idempotent');

  // 2. B clears the conversation to read first, so unread assertions are
  //    deterministic even though this DM is reused across runs.
  await fetch(`${API}/chat/conversations/${dm.id}/read`, {
    method: 'POST',
    headers: b.H,
    body: JSON.stringify({}),
  });

  // 3. A sends a message via REST.
  const sendRes = await fetch(`${API}/chat/conversations/${dm.id}/messages`, {
    method: 'POST',
    headers: a.H,
    body: JSON.stringify({ body: 'hello there' }),
  });
  assert(sendRes.ok, `send message (${sendRes.status})`);
  const msg = await json(sendRes);
  assert(msg.body === 'hello there', 'message body persisted');

  // 3. B sees it: unread = 1 and the message is in history.
  const bConvs = await json(await fetch(`${API}/chat/conversations`, { headers: b.H }));
  const bDm = bConvs.find((c) => c.id === dm.id);
  assert(bDm && bDm.unreadCount === 1, `recipient unread count is 1 (got ${bDm?.unreadCount})`);

  const bMsgs = await json(await fetch(`${API}/chat/conversations/${dm.id}/messages`, { headers: b.H }));
  assert(bMsgs.items.some((m) => m.id === msg.id), 'recipient sees the message in history');

  // 4. B marks read → unread clears.
  const readRes = await fetch(`${API}/chat/conversations/${dm.id}/read`, {
    method: 'POST',
    headers: b.H,
    body: JSON.stringify({ messageId: msg.id }),
  });
  assert(readRes.ok, `mark read (${readRes.status})`);
  const bConvs2 = await json(await fetch(`${API}/chat/conversations`, { headers: b.H }));
  assert(bConvs2.find((c) => c.id === dm.id).unreadCount === 0, 'unread clears after read');

  // 5. A edits the message.
  const editRes = await fetch(`${API}/chat/messages/${msg.id}`, {
    method: 'PATCH',
    headers: a.H,
    body: JSON.stringify({ body: 'hello (edited)' }),
  });
  assert(editRes.ok, `edit message (${editRes.status})`);
  const edited = await json(editRes);
  assert(edited.body === 'hello (edited)' && edited.editedAt, 'message edited with editedAt set');

  // 6. A soft-deletes the message.
  const delRes = await fetch(`${API}/chat/messages/${msg.id}`, { method: 'DELETE', headers: a.H });
  assert(delRes.ok, `delete message (${delRes.status})`);
  const afterDel = await json(await fetch(`${API}/chat/conversations/${dm.id}/messages`, { headers: a.H }));
  const deletedMsg = afterDel.items.find((m) => m.id === msg.id);
  assert(deletedMsg && deletedMsg.deletedAt && deletedMsg.body === null, 'message soft-deleted (body nulled)');

  // 7. Realtime: B receives A's socket-sent message live.
  const [sockA, sockB] = await Promise.all([connectSocket(a.token), connectSocket(b.token)]);
  assert(sockA.connected && sockB.connected, 'both sockets connected (JWT handshake)');

  const received = new Promise((resolve, reject) => {
    sockB.on('message:new', (evt) => resolve(evt));
    setTimeout(() => reject(new Error('did not receive realtime message')), 5000);
  });
  const ack = await new Promise((resolve) =>
    sockA.emit('message:send', { conversationId: dm.id, body: 'realtime ping' }, resolve),
  );
  assert(ack && ack.ok, 'socket message:send acked ok');
  const evt = await received;
  assert(evt.message.body === 'realtime ping', 'recipient received realtime message:new');

  sockA.disconnect();
  sockB.disconnect();

  // 8. Ad-hoc group: create, then add/remove a member (admin-only).
  const groupRes = await fetch(`${API}/chat/conversations/group`, {
    method: 'POST',
    headers: a.H,
    body: JSON.stringify({ title: `Smoke Group ${Date.now()}`, memberIds: [b.user.id] }),
  });
  assert(groupRes.ok, `create group (${groupRes.status})`);
  const group = await json(groupRes);
  assert(group.type === 'GROUP' && group.memberCount === 2, 'group has creator + invitee');

  // B (a non-admin member) can see and post to it.
  const bGroupSend = await fetch(`${API}/chat/conversations/${group.id}/messages`, {
    method: 'POST',
    headers: b.H,
    body: JSON.stringify({ body: 'hi group' }),
  });
  assert(bGroupSend.ok, `group member can post (${bGroupSend.status})`);

  // Non-admin cannot manage members.
  const bAdd = await fetch(`${API}/chat/conversations/${group.id}/members`, {
    method: 'POST',
    headers: b.H,
    body: JSON.stringify({ memberIds: [a.user.id] }),
  });
  assert(bAdd.status === 403, `non-admin cannot add members (${bAdd.status})`);

  // Admin removes B, then re-adds them.
  const rmRes = await fetch(`${API}/chat/conversations/${group.id}/members/${b.user.id}`, {
    method: 'DELETE',
    headers: a.H,
  });
  assert(rmRes.ok, `admin removes member (${rmRes.status})`);
  const afterRm = await json(await fetch(`${API}/chat/conversations/${group.id}`, { headers: a.H }));
  assert(afterRm.members.length === 1, 'member removed from group');

  // B has lost access.
  const bDenied = await fetch(`${API}/chat/conversations/${group.id}/messages`, { headers: b.H });
  assert(bDenied.status === 403, `removed member is denied access (${bDenied.status})`);

  const addRes = await fetch(`${API}/chat/conversations/${group.id}/members`, {
    method: 'POST',
    headers: a.H,
    body: JSON.stringify({ memberIds: [b.user.id] }),
  });
  assert(addRes.ok, `admin re-adds member (${addRes.status})`);
  const afterAdd = await json(addRes);
  assert(afterAdd.members.length === 2, 'member re-added to group');

  // 9. Project channel: auto-provisioned, idempotent, authorized by workspace membership.
  //    NOTE: this must be checked with a non-admin MEMBER — admins intentionally have
  //    access to every workspace (WorkspacesService.assertCanAccess), so an admin would
  //    reach any project channel and would not exercise the membership gate at all.
  const member = await provisionMember(a.H);

  const ws = await json(
    await fetch(`${API}/workspaces`, {
      method: 'POST',
      headers: a.H,
      body: JSON.stringify({ name: `Chat Smoke WS ${Date.now()}` }),
    }),
  );
  const projects = await json(await fetch(`${API}/workspaces/${ws.id}/projects`, { headers: a.H }));
  const project = projects[0];
  assert(!!project, 'workspace has a default project');

  const chan = await json(
    await fetch(`${API}/chat/projects/${project.id}/conversation`, { method: 'POST', headers: a.H }),
  );
  assert(chan.type === 'PROJECT' && chan.projectId === project.id, 'project channel created');
  const chan2 = await json(
    await fetch(`${API}/chat/projects/${project.id}/conversation`, { method: 'POST', headers: a.H }),
  );
  assert(chan2.id === chan.id, 'project channel is idempotent (one per project)');

  // The member is not in that workspace → denied.
  const mDenied = await fetch(`${API}/chat/conversations/${chan.id}/messages`, { headers: member.H });
  assert(mDenied.status === 403, `non-workspace-member denied project channel (${mDenied.status})`);

  // Add them to the workspace → channel access is inherited, no channel membership needed.
  await fetch(`${API}/workspaces/${ws.id}/members`, {
    method: 'POST',
    headers: a.H,
    body: JSON.stringify({ add: [member.user.id] }),
  });
  const mAllowed = await fetch(`${API}/chat/conversations/${chan.id}/messages`, { headers: member.H });
  assert(mAllowed.ok, `workspace member inherits project channel access (${mAllowed.status})`);

  // A member must NOT be able to read a DM/group they aren't part of (admins get no
  // bypass here either — chat is private, unlike workspaces).
  const mDm = await fetch(`${API}/chat/conversations/${dm.id}/messages`, { headers: member.H });
  assert(mDm.status === 403, `outsider denied someone else's DM (${mDm.status})`);

  console.log(
    '\n✓ Chat smoke passed — DM, unread, read receipt, edit, delete, realtime, groups, project channels',
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('Chat smoke failed:', err);
  process.exit(1);
});
