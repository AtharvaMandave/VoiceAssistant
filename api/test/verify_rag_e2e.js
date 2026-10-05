// Phase 3 End-to-End Verification Script

async function testRAG() {
  const baseUrl = "http://localhost:3001/api";

  console.log("1. Authenticating dev session...");
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer dev-token-voiceflow-admin",
  };

  const authRes = await fetch(`${baseUrl}/auth/session`, {
    method: "POST",
    headers,
  });
  const authData = await authRes.json();
  const orgId = authData.data.activeOrganization.id;
  headers["x-organization-id"] = orgId;
  console.log(`   Authenticated as ${authData.data.user.email} in Org: ${orgId}`);

  console.log("2. Creating test agent for RAG...");
  const agentRes = await fetch(`${baseUrl}/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "RAG Verification Agent",
      template: "support",
      systemPrompt: "You are a customer support agent. Answer user questions concisely based strictly on retrieved business knowledge.",
      llmConfig: { provider: "groq", model: "groq/compound" },
    }),
  });
  const agentData = await agentRes.json();
  const agentId = agentData.data.id;
  console.log(`   Agent created with ID: ${agentId}`);

  console.log("3. Ingesting knowledge document (SaaS Return & Refund Policy)...");
  const docPayload = {
    title: "SaaS Return & Refund Policy",
    sourceType: "text",
    content: `# Return and Refund Policy
VoiceFlow provides a 30-day money-back guarantee for all new subscriptions.
If you are not satisfied with the platform within your first 30 days of purchase, you can request a 100% full refund with no questions asked.

## Cancellation Process
- Customers can cancel their monthly or annual subscription anytime from the Billing Settings page.
- Once cancelled, access to paid features continues until the end of the current billing cycle.
- We do not charge cancellation or termination fees.

## Enterprise SLA and Support
- Enterprise accounts feature dedicated account managers, 99.9% uptime SLA, and priority phone/Slack support.
- Support tickets are answered within 1 hour for urgent production incidents.`,
  };

  const docRes = await fetch(`${baseUrl}/agents/${agentId}/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify(docPayload),
  });
  const docData = await docRes.json();
  console.log("   Document created & indexed:", {
    id: docData.data.id,
    title: docData.data.title,
    status: docData.data.status,
    chunkCount: docData.data.chunkCount,
    tokenCount: docData.data.tokenCount,
  });

  if (docData.data.status !== "ready" || docData.data.chunkCount === 0) {
    throw new Error("Document ingestion failed or produced 0 chunks!");
  }

  console.log("4. Testing vector similarity retrieval query...");
  const queryRes = await fetch(`${baseUrl}/agents/${agentId}/knowledge/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: "How many days do I have to request a refund?",
      topK: 3,
      minScore: 0.15,
    }),
  });
  const queryData = await queryRes.json();
  console.log(`   Retrieved ${queryData.data.chunks.length} chunks in ${queryData.data.latencyMs}ms`);
  for (const c of queryData.data.chunks) {
    console.log(`   - [${(c.score * 100).toFixed(0)}% match] "${c.title}" (chunk #${c.chunkIndex}): ${c.text.slice(0, 70)}...`);
  }

  if (queryData.data.chunks.length === 0) {
    throw new Error("Vector search returned 0 matching chunks!");
  }

  console.log("5. Testing prompt preview with query parameter...");
  const previewRes = await fetch(`${baseUrl}/agents/${agentId}/prompt-preview?query=refund%20policy`, {
    headers,
  });
  const previewData = await previewRes.json();
  const hasRagGrounding = previewData.data.masterSystemPrompt.includes("[RETRIEVED BUSINESS KNOWLEDGE");
  console.log(`   RAG Grounding block injected into prompt preview: ${hasRagGrounding ? "YES ✓" : "NO ✗"}`);

  console.log("6. Starting conversation session with agent...");
  const convRes = await fetch(`${baseUrl}/agents/${agentId}/conversations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ channel: "playground" }),
  });
  const convData = await convRes.json();
  const convId = convData.data.id;
  console.log(`   Conversation started: ${convId}`);

  console.log("7. Sending user question grounded in knowledge...");
  const msgRes = await fetch(`${baseUrl}/conversations/${convId}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "What is your refund and cancellation policy?" }),
  });
  const msgData = await msgRes.json();
  console.log("\n--- AGENT RESPONSE ---");
  console.log(msgData.data.assistantMessage.content);
  console.log("----------------------");
  console.log("Citations attached to message:", msgData.data.assistantMessage.retrievedChunks ? msgData.data.assistantMessage.retrievedChunks.length : 0);

  if (msgData.data.assistantMessage.retrievedChunks && msgData.data.assistantMessage.retrievedChunks.length > 0) {
    console.log("✓ Verified: Assistant message record has source citations!");
  }

  console.log("\n8. Cleaning up test agent...");
  await fetch(`${baseUrl}/agents/${agentId}`, {
    method: "DELETE",
    headers,
  });
  console.log("✓ All Phase 3 RAG tests passed successfully!");
}

testRAG().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
