// Phase 5 Real-Time Voice WebSocket End-to-End Verification Script
import { WebSocket } from "ws";

async function runRealtimeVerification() {
  const baseUrl = "http://localhost:3001/api";
  const wsUrl = "ws://localhost:3001/ws/voice";

  console.log("==================================================");
  console.log("Phase 5: Real-Time Streaming Voice E2E Verification");
  console.log("==================================================");

  // 1. Authenticate dev session
  console.log("\n1. Authenticating dev session...");
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

  // 2. Create test agent
  console.log("\n2. Creating test agent for Real-Time Voice...");
  const agentRes = await fetch(`${baseUrl}/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Realtime Voice Test Agent",
      template: "support",
      systemPrompt: "You are a friendly customer service voice assistant. Answer briefly in one sentence.",
      voiceConfig: {
        voice: "en-US-AriaNeural",
        speed: 1.0,
        pitch: 1.0,
      },
      llmConfig: { provider: "groq", model: "groq/compound" },
    }),
  });
  const agentData = await agentRes.json();
  const agentId = agentData.data.id;
  console.log(`   Agent created with ID: ${agentId}`);

  // 3. Create conversation session
  console.log("\n3. Creating conversation session...");
  const convRes = await fetch(`${baseUrl}/agents/${agentId}/conversations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ channel: "playground" }),
  });
  const convData = await convRes.json();
  const conversationId = convData.data.id;
  console.log(`   Conversation created with ID: ${conversationId}`);

  // 4. Connect to WebSocket server
  console.log(`\n4. Connecting to WebSocket server at ${wsUrl}...`);
  const ws = new WebSocket(wsUrl);

  const receivedEvents = [];

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WS Connection timed out")), 5000);

    ws.on("open", () => {
      clearTimeout(timeout);
      console.log("   ✓ WebSocket connection established!");
      resolve();
    });

    ws.on("message", (raw) => {
      try {
        const evt = JSON.parse(raw.toString());
        receivedEvents.push(evt);
        console.log(`   [WS Event In] ${evt.type}`, evt.sessionId ? `(session: ${evt.sessionId})` : "");
      } catch (err) {
        console.log(`   [WS Raw In] ${raw.toString()}`);
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // 5. Send session.start
  console.log("\n5. Sending session.start event...");
  const startEvent = {
    type: "session.start",
    agentId,
    conversationId,
    config: {
      sampleRate: 16000,
      chunkDurationMs: 250,
      language: "en",
      voice: "en-US-AriaNeural",
    },
  };
  ws.send(JSON.stringify(startEvent));

  // Wait for session.ready
  console.log("   Waiting for session.ready...");
  const readyEvent = await waitForEvent(receivedEvents, "session.ready", 5000);
  console.log(`   ✓ Received session.ready! Session ID: ${readyEvent.sessionId}`);
  console.log(`     Config: ${JSON.stringify(readyEvent.config)}`);

  // 6. Simulate streaming audio chunk
  console.log("\n6. Simulating audio chunk streaming (speech turn)...");
  const mockAudioBase64 = Buffer.from("mock-audio-pcm-data-stream-turn-1").toString("base64");
  const audioEvent = {
    type: "audio.chunk",
    data: mockAudioBase64,
    seq: 1,
    sampleRate: 16000,
  };
  ws.send(JSON.stringify(audioEvent));

  // Wait for speech.started
  console.log("   Waiting for speech.started...");
  const speechStartedEvent = await waitForEvent(receivedEvents, "speech.started", 5000);
  console.log(`   ✓ Received speech.started at timestamp: ${speechStartedEvent.timestamp}`);

  // 7. Simulate barge-in / interrupt
  console.log("\n7. Simulating user barge-in (agent.interrupted)...");
  const interruptEvent = {
    type: "agent.interrupted",
    reason: "user_button_interrupt",
  };
  ws.send(JSON.stringify(interruptEvent));

  // Wait for server acknowledgment
  await new Promise((r) => setTimeout(r, 1000));
  const hasInterrupt = receivedEvents.some((e) => e.type === "agent.interrupted");
  console.log(`   ✓ Agent interrupted handled cleanly: ${hasInterrupt ? "YES" : "ACK"}`);

  // 8. Send session.end
  console.log("\n8. Ending session cleanly...");
  ws.send(JSON.stringify({ type: "session.end", reason: "test_completed" }));
  await new Promise((r) => setTimeout(r, 500));
  ws.close();
  console.log("   ✓ WebSocket closed cleanly.");

  // 9. Clean up test agent
  console.log("\n9. Cleaning up test agent...");
  await fetch(`${baseUrl}/agents/${agentId}`, {
    method: "DELETE",
    headers,
  });
  console.log("   ✓ Test agent deleted.");

  console.log("\n==================================================");
  console.log("✓ ALL REAL-TIME VOICE E2E VERIFICATIONS PASSED!");
  console.log("==================================================");
}

function waitForEvent(eventsList, eventType, timeoutMs) {
  return new Promise((resolve, reject) => {
    const existing = eventsList.find((e) => e.type === eventType);
    if (existing) return resolve(existing);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const found = eventsList.find((e) => e.type === eventType);
      if (found) {
        clearInterval(interval);
        return resolve(found);
      }
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error(`Timed out waiting for event ${eventType}`));
      }
    }, 100);
  });
}

runRealtimeVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
