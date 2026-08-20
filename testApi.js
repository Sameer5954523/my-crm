async function testCRM() {
  try {
    // 1. Login as Chase Agent
    const chaseRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'chase@crm.com', password: '123456' })
    });
    const chaseLogin = await chaseRes.json();

    // 2. Update Lead #1 status to 'Form Completed'
    const updateRes = await fetch('http://localhost:5000/api/customers/1/status', {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${chaseLogin.token}`
      },
      body: JSON.stringify({
        status: 'Form Completed',
        assigned_agent_id: chaseLogin.user.id
      })
    });
    const updatedLead = await updateRes.json();
    console.log('--- STATUS UPDATED BY CHASE AGENT ---');
    console.log(updatedLead);

  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

testCRM();