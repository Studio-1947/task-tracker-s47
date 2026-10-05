async function runTests() {
  const BASE_URL = 'http://localhost:5173';
  let accessToken = '';

  const log = (msg) => console.log(`[TEST] ${msg}`);

  async function request(method, path, body = null) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const start = performance.now();
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const duration = performance.now() - start;

    if (!res.ok) {
      throw new Error(`API Error: ${res.status} ${res.statusText} on ${method} ${path}\n${await res.text()}`);
    }

    const data = await res.json().catch(() => null);
    return { data, duration };
  }

  try {
    log('1. Logging in as Admin...');
    const { data: authData, duration: t1 } = await request('POST', '/api/auth/login', {
      email: 'admin@example.com',
      password: 'admin12345',
    });
    accessToken = authData.accessToken;
    log(`✓ Logged in (took ${Math.round(t1)}ms)`);

    log('2. Fetching Users...');
    const { data: users, duration: t2 } = await request('GET', '/api/users');
    log(`✓ Fetched ${users.length} users (took ${Math.round(t2)}ms)`);

    log('3. Fetching Workspaces...');
    const { data: workspaces, duration: tw } = await request('GET', '/api/workspaces');
    if (workspaces.length === 0) {
      log('No workspaces found.');
      return;
    }
    const targetWorkspace = workspaces[0];

    log(`3.1 Fetching Projects for Workspace ${targetWorkspace.name}...`);
    const { data: projects, duration: t3 } = await request('GET', `/api/workspaces/${targetWorkspace.id}/projects`);
    log(`✓ Fetched ${projects.length} projects (took ${Math.round(t3)}ms)`);

    if (projects.length === 0 || users.length === 0) {
      log('No users or projects found to test with.');
      return;
    }

    const targetUser = users.find(u => u.email !== 'admin@example.com') || users[0];
    const targetProject = projects[0];

    log(`4. Blocking User "${targetUser.name}" from Project "${targetProject.name}"...`);
    const initialRestricted = targetUser.restrictedProjectIds || [];
    const newRestricted = [...initialRestricted, targetProject.id];

    const { duration: t4 } = await request('PATCH', `/api/users/${targetUser.id}`, {
      restrictedProjectIds: newRestricted,
    });
    log(`✓ Applied block (took ${Math.round(t4)}ms)`);

    log('5. Verifying Block...');
    const { data: updatedUsers, duration: t5 } = await request('GET', '/api/users');
    const updatedUser = updatedUsers.find(u => u.id === targetUser.id);
    if (!updatedUser.restrictedProjectIds?.includes(targetProject.id)) {
      throw new Error('Block was not applied correctly!');
    }
    log(`✓ Block verified in User list (took ${Math.round(t5)}ms)`);

    log('6. Removing Block...');
    const { duration: t6 } = await request('PATCH', `/api/users/${targetUser.id}`, {
      restrictedProjectIds: initialRestricted,
    });
    log(`✓ Block removed (took ${Math.round(t6)}ms)`);

    log('7. Stress Testing (Multiple blocks quickly)...');
    const stressCount = 20;
    const stressStart = performance.now();
    const promises = [];
    for (let i = 0; i < stressCount; i++) {
      promises.push(request('PATCH', `/api/users/${targetUser.id}`, {
        restrictedProjectIds: initialRestricted,
      }));
    }
    await Promise.all(promises);
    const stressDuration = performance.now() - stressStart;
    log(`✓ Executed ${stressCount} parallel PATCH requests in ${Math.round(stressDuration)}ms (${Math.round(stressDuration / stressCount)}ms avg per request)`);

    log('All tests passed successfully! 🎉');
  } catch (err) {
    console.error('❌ Test Failed:');
    console.error(err.message);
  }
}

runTests();
